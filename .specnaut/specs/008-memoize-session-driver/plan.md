# Plan: Memoize the session driver per process

**Branch**: `008-memoize-session-driver` | **Date**: 2026-09-01 | **Backlog item**:
[#138 — Session drivers are constructed per request, leaking a handle or connection each time](https://github.com/locknessland/lockness-monorepo/issues/138)

---

## 1. Why this exists

`packages/session/middleware.ts:64` constructs a **new** session driver on every request
(`createDriver` returns `new …` on each branch, `drivers/mod.ts:39-51`, no cache). Two harms, both
reproducible on this tree with no attacker:

1. **`driver: 'memory'` can never persist a login.** `MemorySessionDriver`'s store is instance state
   (`drivers/memory.ts:27`), so a fresh instance per request means a session written on request A is
   gone on request B. Login never sticks. `memory` is the zero-config default for local development,
   so this is the first thing a new user hits.
2. **`deno-kv` and `redis` leak an OS resource per request.** `DenoKvSessionDriver.getKv`
   (`drivers/deno_kv.ts:32-37`) opens a `Deno.Kv` handle lazily per instance;
   `RedisSessionDriver.connect` (`drivers/redis.ts:48-53`) opens a TCP connection (plus an AUTH round
   trip) per instance. `close()` exists on both and its only callers in the whole repository are
   three lines in `tests/drivers.test.ts`. Under ordinary load this exhausts file descriptors
   locally, or Redis `maxclients` for every instance pointed at that server. A plain GET on any
   session-bearing route is the trigger.

**The fix already has a home in the codebase.** `@lockness/cache` solved the identical problem:
its resource-holding drivers register with the process-wide disposables registry in
`@lockness/contract` (`cache/drivers/deno_kv_driver.ts:81`, `redis_driver.ts:268`), and
`@lockness/core` drains them at shutdown (`kernel/shutdown_sequence.ts:273`). #136 built that path;
this feature is the second consumer of it, not a new mechanism.

## 2. User scenarios

### US1 — A memory-driver login persists across requests (P1)

**Given** an app configured with `driver: 'memory'` (the default)
**When** a user logs in on one request and loads a page on the next
**Then** the session written on the first request is read on the second, and they stay logged in.

### US2 — A `deno-kv` app serves sustained traffic without leaking handles (P1)

**Given** an app configured with `driver: 'deno-kv'`
**When** it serves N requests
**Then** it holds **one** `Deno.Kv` handle for the process, not N, and that handle is closed at
shutdown.

### US3 — The cookie driver stays per-request (P1)

**Given** an app configured with `driver: 'cookie'`
**When** it serves requests
**Then** each request gets its own driver instance bound to that request's Hono `Context` — the
memo never hands one request's `Context`-bound driver to another request.

### US4 — Handles are released at shutdown (P2)

**Given** a memoized `deno-kv` (or, once unblocked, `redis`) driver
**When** the app shuts down
**Then** its `close()` runs through the disposables drain and the handle is released.

### Edge cases

- **Two apps in one process with identical config** share one memoized driver. Intended for the
  resource saving; the test-isolation consequence is Open Question 2.
- **The same app configured for two different backends** (unusual, but `sessionMiddleware(config)`
  allows per-mount overrides) keys to two memo entries — one resource each.
- **A driver that fails to construct** (e.g. `redis` with no `config.redis`, `drivers/mod.ts:48`)
  must throw as it does today and leave nothing in the memo.
- **Test isolation** — the memo is process-wide and the suite boots many apps per process; without a
  reset, one test's memory store is visible to the next. See OQ2.

## 3. Requirements

- **FR-001**: The driver instance is memoized per process, keyed on the resolved configuration, and
  looked up in the `sessionMiddleware` factory path rather than reconstructed inside the returned
  handler for every request.
- **FR-002**: **The resolved configuration is still computed per request** — `middleware.ts:62`'s
  `{ ...getSessionConfig(), ...config }` stays where it is. Only the *driver lookup* is memoized, on
  the resolved config as key. Memoizing the config itself is the #137 defect and its warning comment
  (`middleware.ts:53-61`) stays.
- **FR-003**: The `cookie` driver is **never** memoized. It closes over the request `Context`
  (`drivers/mod.ts:42`) and holds no OS resource, so it is constructed per request as today. This is
  a rule the memo must encode, not an incidental omission.
- **FR-004**: `deno-kv` opens at most one `Deno.Kv` handle per process per resolved config.
- **FR-005**: `memory` shares one store per process per resolved config, so a session written on one
  request is readable on the next.
- **FR-006**: Each resource-holding memoized driver registers its `close()` with the
  `@lockness/contract` disposables registry when it acquires the resource, and deregisters on close —
  the exact pattern `@lockness/cache` uses (`registerDisposable` / `deregisterDisposable` from
  `@lockness/contract/lifecycle/internal`). No `@lockness/core` import (it would close a cycle;
  `contract` imports nothing).
- **FR-007**: A test asserts driver **identity** across two requests for `memory` and `deno-kv`, and
  **non-identity** for both `cookie` **and `redis`** — the redis assertion is the gate that goes red
  the instant redis slips into the memo (security Finding 1). Without it, an accidental redis
  memoization passes the whole suite.
- **FR-008**: A test asserts a login **persists** across a subsequent request under `driver: 'memory'`
  — driving the real `sessionMiddleware`, not the driver in isolation. This replaces the false-green
  [#142](https://github.com/locknessland/lockness-monorepo/issues/142) shape (a test named for
  persistence that only ever requested `/set`).
- **FR-009**: A test asserts a memoized `deno-kv` driver's `close()` runs when the disposables
  registry is drained, and that the handle count does not grow across requests — driving **two
  concurrent** first-requests, not two sequential ones, so the cold-start acquisition race
  (FR-012) is actually exercised.
- **FR-010**: The memo is resettable for tests (`resetDriverRegistry()`, `@internal`), and process
  shutdown clears it, so no memory store or handle survives an app's teardown into the next app in
  the same process. **`resetDriverRegistry()` closes every memoized driver that exposes a teardown
  and then clears the `Map`** — branching on capability, since `SessionDriver.close` is optional
  (`types.ts`) and `MemorySessionDriver` exposes `clear()`, not `close()`. The shutdown path calls
  the same function; `close()` being idempotent makes the overlap with core's own disposables drain
  (`shutdown_sequence.ts:273`) safe. A shared test hook (`afterEach` / helper) invokes it between
  session tests — SC-005's mechanism, named here rather than left implicit (architecture Findings 1
  and 2).
- **FR-011 (Redis, conditional)**: `redis` is a **first-class per-request branch** in
  `getOrCreateDriver`, sibling to `cookie` — **not** an emergent "everything not cookie is
  memoized" else-branch (security Finding 1). `driverKey` does **not** compute a key for the redis
  branch while it is gated, so no misleading redis key exists for an implementer to wire in. `redis`
  opens at most one connection per process per resolved config **only once its shared-socket
  preconditions hold** (§5 row 6, §12 OQ1). Until then per-request is correct precisely because it
  means no shared socket. The blocked status is stated, not dropped.
- **FR-012**: Resource acquisition is **single-flighted**, not just the instance. Memoizing the
  *instance* guarantees one object, not one handle: the lazy `getKv`/`connect` inside it is a
  check-then-act across an `await` (`deno_kv.ts:32-37`, `redis.ts:48-66`), so two concurrent
  first-requests on the shared instance can open two handles and orphan one — escaping the drain and
  breaking the "one handle per process" invariant. Each resource-holding driver caches the in-flight
  acquisition promise (`this.kvPromise ??= Deno.openKv(...)`), so a concurrent burst awaits one open
  (security Finding 2).

## 4. Success criteria

- **SC-001**: A login under `driver: 'memory'` is still authenticated on the following request.
- **SC-002**: Serving many requests under `driver: 'deno-kv'` holds one handle, released at shutdown.
- **SC-003**: `cookie` requests never share a driver instance.
- **SC-004**: The full gate is green, `deps:analyze` passes with the one intended new edge
  (`session → contract`) declared, and `deno.lock` is unchanged beyond that declaration's resolution.
- **SC-005**: The suite remains order-independent — booting apps in any order does not leak session
  state between tests (the memo reset works).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **Which driver instance serves a given resolved config** (the memo) | `packages/session/drivers/registry.ts` — `getOrCreateDriver` | A second `new XDriver()` in `middleware.ts`; a per-driver static instance field; caching inside `createDriver` as well as the registry |
| **The configuration is resolved per request, never memoized** (existing #137 rule) | `packages/session/middleware.ts:62` | A driver memo keyed on the *unresolved* `config` argument; hoisting the `{ ...getSessionConfig() }` spread out of the handler |
| **Which driver is per-request vs memoized** — cookie **and redis** are per-request, each a first-class branch | `packages/session/drivers/registry.ts` — explicit `cookie` and `redis` branches in `getOrCreateDriver`, before any memo lookup | A `Context`-bound driver placed in the memo; **redis reaching the memo through an "everything not cookie" else-branch** (security Finding 1); a second per-request/per-process split in `middleware.ts` |
| **The memo key — what makes two configs the same resource** | `packages/session/drivers/registry.ts` — `driverKey(config)` over `driver`, `kvPath`, redis `hostname`/`port`/`db` | A second serialization of the config anywhere; keying on object identity in one place and on fields in another; **putting the redis password in the key** (it must stay log-safe — see row 6) |
| **When a driver's resource is released** | each resource-holding driver's own `close()` + its `registerDisposable` handle; drained by `@lockness/core` `shutdown_sequence.ts:273` | A `close()` loop in `middleware.ts`; a second teardown list; the registry calling `dispose()` itself (the registry hands the list back — that policy is core's, per the contract module) |
| **The memo's own reset/clear lifecycle** | `packages/session/drivers/registry.ts` — `resetDriverRegistry()` and the registry-level shutdown disposable, both calling the one reset | A "just drop the references" reset that leaks the `Deno.Kv` handle; a second clear path; a reset that assumes `close()` when `MemorySessionDriver` exposes `clear()` (architecture Finding 1) |
| **Whether the `redis` branch is memoized** (blocked; needs reply-drain **and** a command write-mutex **and** single-flight connect **and** credential-aware keying) | `packages/session/drivers/registry.ts` — the `redis` branch, and §12 OQ1 | Memoizing redis without all four — reintroduces the cross-user desync #141/#139 describe; and once memoized, `driverKey` must discriminate on a **digest** of the credential (never the raw password), or two same-host different-password configs collapse to one authenticated socket (security Finding 3) |

**Binding.** A decision may not move out of its home without this plan being amended first.

## 6. Technical context

**Language / runtime**: TypeScript on Deno 2.9.6. **Storage**: `memory` (a `Map`), `deno-kv`
(`Deno.openKv`), `redis` (raw TCP), `cookie` (no store). **Shutdown**: `@lockness/contract`
disposables registry, drained by `@lockness/core`. **Testing**: `Deno.test`; in-memory and
loopback fakes; no live Redis required for the in-scope work.

### Domain model — bounded context `session`, driver-lifetime sub-domain

| Term | Meaning here |
| :--- | :--- |
| **Resolved config** | `{ ...getSessionConfig(), ...override }` computed per request. The identity input for the memo. |
| **Driver key** | A canonical string over the *resource-determining* fields of the resolved config (`driver`, `kvPath`, redis `hostname`/`port`/`db`). A value object. |
| **Memoized driver** | One driver instance per key, living for the process (or until the registry is reset / drained). Holds the resource. |
| **Per-request driver** | The `cookie` driver — bound to one `Context`, never keyed, never stored. |
| **Disposable** | The `{ name, dispose }` a resource-holding driver registers so shutdown releases it. |

**Invariant**: for every request, the number of live OS handles for a given resolved config is **one
per process**, not one per request — except `cookie`, which holds none.

**Out of the model**: the RESP wire (#141, done), the Redis reply reader and TTL semantics (#139),
the cookie encryption path (#137, done).

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| 1 — No direct `hono` import | ✅ Uses the existing `hono` (→ `@lockness/hono`) alias only. |
| 2 — JSR-only, declared per package | ⚠️ **One new edge**: `session → contract`, for the disposables registry. It is declared in `packages/session/deno.json` and added to `deps.policy.jsonc` (`session.allow` gains `"contract"`). `contract` imports nothing, so the edge cannot close a cycle — the same reason `cache` was allowed it. This is a Complexity-Tracking entry, justified. |
| 3 — No `any` in exported APIs | ✅ The registry's public shape is `getOrCreateDriver(c: Context, config: SessionConfig): SessionDriver`. |
| 4 — Tailwind v4 | ✅ N/A. |
| 5 — Pre-completion gate | ✅ fmt / lint / check / test + `deps:analyze`. |
| 6 — Never edit `deno.lock` | ✅ The one dependency addition is materialised by `deno cache`, not by hand. |
| 7 — JSDoc on public APIs | ✅ `registry.ts` carries `@fileoverview`/`@module`; `getOrCreateDriver` full JSDoc. |
| 8 — MVC layering | ✅ Driver/middleware layer only. |
| 9 — One category per commit | ✅ Planned: `fix(138)` (registry + wiring + memory persistence), `test(138)`, `chore(deps)` for the policy/deno.json edge if it lands separately, `docs(138)` for the brief. |
| Methodology — TDD | ✅ FR-007/008/009 written failing first. |
| Methodology — No silent catches | ✅ close() failures surface through the drain's own renderer (core's), not swallowed here. |

**Complexity tracking**: the `session → contract` edge (rule 2) — justified above; it is the
cycle-safe home for shutdown wiring and the established pattern.

## 8. Surface impact

| Surface | Impact |
| :--- | :--- |
| `@lockness/session` public exports | **None intended.** `getOrCreateDriver` / `driverKey` / the reset live in `drivers/registry.ts` and are not re-exported from `mod.ts`. `createDriver` stays exported (it is the switch the registry calls). |
| `sessionMiddleware` behaviour | **Changed, and that is the fix**: the driver is now looked up, not reconstructed. Observable only as correctness (persistence) and resource count. |
| `packages/session/deno.json` | Gains `"@lockness/contract": "jsr:@lockness/contract@^0.2.0"`. |
| `deps.policy.jsonc` | `session.allow` gains `"contract"`. |
| `packages/session/AGENTS.md` | Regenerated: the dependency-contract block gains the `contract` edge. |
| Front end | **No front-end surface.** |

**Interface contract** — internal:

```ts
/** One driver per process per resolved config; cookie excepted (per-request). */
export function getOrCreateDriver(c: Context, config: SessionConfig): SessionDriver
/** Canonical key over the resource-determining config fields. */
export function driverKey(config: SessionConfig): string
/** @internal — drain + clear the memo; for tests and shutdown. */
export function resetDriverRegistry(): void
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **The memo breaks test isolation** — process-wide, the suite boots many apps, one test's memory store leaks to the next. | FR-010: `resetDriverRegistry()` (`@internal`) closes memoized drivers then clears the memo, wired into a test `afterEach`/helper, and a registry-level disposable clears it on shutdown drain. SC-005 asserts order-independence. **Counted (architecture audit): the existing suite's blast radius is 0 — 5 memory-boot tests, none assert a fresh store — so the exposure is the tests this feature *adds*, not the current 1000.** OQ2, now decided. |
| **The cold-start acquisition race** (FR-012) — a shared instance's lazy `getKv`/`connect` opens two handles under a concurrent first-request burst. | Single-flight the acquisition (cache the in-flight promise); FR-009 drives two concurrent requests to exercise it. Security Finding 2. |
| **Memoizing the `redis` branch reintroduces the cross-user desync.** | §5 row 6 + FR-011: `redis` stays per-request until #139's reply-drain and a command mutex land. Memoizing it here is a plan violation. This is OQ1. |
| **A `Context`-bound cookie driver leaks into another request via the memo.** | FR-003: `cookie` is branched out before the memo lookup and constructed fresh every time; FR-007 asserts non-identity for `cookie`. |
| **The new `contract` edge is read as a cycle risk.** | `contract` imports nothing (verified); `deps:analyze` enforces it; the edge mirrors `cache`. |
| **Shutdown double-frees or misses a handle** — the memo and the disposable list disagree. | The driver deregisters its handle in `close()` (cache's pattern), and `close()` is idempotent (guards on the handle/resource being present). FR-009 asserts the drain closes it exactly once. |
| **Keying on the config accidentally includes the Redis password in a loggable string.** | `driverKey` is internal and never logged; and it keys on `hostname`/`port`/`db`, not the password — two configs differing only by password to the same host are a misconfiguration, not two resources. Stated so the implementer does not add the password to the key. |

## 10. Architecture audit

`architect-expert` on the plan, read-only, before any code. Read the open `domain:session` backlog
first (#138, #139, #142, #143). **Verdict: needs_followup — 0 CRITICAL, 0 HIGH, 3 MEDIUM, 2 LOW.**
FR-002 traced **safe against #137** (the memo keys on the resolved config; only the cookie driver
closes over the secret, and it is excluded from the memo). The `session → contract` edge is a clean
downward dependency (contract imports nothing). Blast radius **counted**: `createDriver` has **one**
production caller (`middleware.ts:64`); **five** tests boot a memory/kv app and **zero** assert a
fresh store, so **zero existing tests break** — which corrects OQ2's framing below.

| # | Sev | Finding | What was done |
| :-- | :-- | :--- | :--- |
| AF1 | MEDIUM | FR-010's memo-reset lifecycle had no §5 row, and `resetDriverRegistry`'s two duties (tests must close handles; shutdown overlaps core's drain) were unspecified — and it must branch on capability (`close?` is optional; memory has `clear()`). | **Added §5 row** for the reset lifecycle; **FR-010 rewritten** with the close-then-clear semantics and the capability branch. |
| AF2 | MEDIUM | SC-005 order-independence depended on a reset hook the plan never wired. **Correction to my own framing**: the existing-suite blast radius is 0 (5 memory-boot tests, none assert freshness); the real exposure is the *new* tests. "Narrower than process" is rejected — US2/FR-004 need one handle *per process*. | **FR-010/SC-005 now name the test hook**; §9 risk reframed; OQ2 recorded as decided below. |
| AF3 | MEDIUM | The redis **connection leak stays live** after this ships (FR-011 defers it), so #138's AC is not fully met; `redis.ts:24`'s comment points the mutex work at #138, which will close without doing it; and the **command mutex has no tracking item** (#139 owns reply-drain, not the mutex). | **§12 OQ1 + the merge plan** now state #138 must not close as "redis done"; a **follow-up owns redis-memo + single-flight connect + command mutex**, and `redis.ts:24` is to be repointed at it. |
| AF4 | LOW | `getOrCreateDriver(c, config)` takes a `Context` used only on the never-memoized cookie branch — name over-promises. | Accepted as-is; the single-home split (§5 row 3) is worth the minor cohesion cost. Noted in the registry JSDoc task. |
| AF5 | LOW | `driverKey` excludes the redis password, so a password rotation without a host change reuses a stale connection. | Moot while redis is gated; folded into the row-6 credential-digest precondition for the follow-up. |

## 11. Security audit

`security-expert` on the plan, read-only, in parallel. Same backlog pre-read. **Verdict: FAIL — 0
CRITICAL, 1 HIGH, 2 MEDIUM.** The intent is sound on every axis — no request-derived value reaches
the memo key (the session id stays a lookup argument, never a key ingredient); memory/kv sharing is
key-isolated by the 32-byte CSPRNG session id; FR-002 does not resurrect #137. Three guarantees were
asserted in prose without being encoded where an implementer trips:

| # | Sev | Finding | What was done |
| :-- | :-- | :--- | :--- |
| SF1 | HIGH (CRITICAL if it slips) | Redis's per-request exclusion was **prose-only**: §5 named only cookie as per-request, so `if (cookie) …; else memoize` drops redis into the memo, and FR-007 had **no redis assertion** to catch it → cross-user session disclosure on a shared socket, whole suite green. | **FR-011 makes redis a first-class branch**; **FR-007 now asserts redis non-identity**; **`driverKey` computes no redis key** while gated (§5 rows 3/6). |
| SF2 | MEDIUM | Lazy `getKv`/`connect` is a check-then-act across an `await`; a *shared* instance makes it concurrently reachable, so a cold-start burst opens two handles and orphans one — breaking "one handle per process". | **Added FR-012** (single-flight the acquisition); **FR-009 now drives two concurrent requests**. |
| SF3 | MEDIUM | `driverKey` omits the redis credential; post-#139, two same-host different-password configs collapse to one authenticated socket (cross-tenant on ACL Redis). | **§5 row 6 + FR-011** now require keying redis on a **non-reversible digest** of the credential (log-safe) as a precondition of unblocking. |

Both audits independently reached SF1/AF-row-3 (redis must be a first-class branch) and the
credential-digest precondition — the strongest signal in the pair.

## 12. Open questions

**OQ1 — The Redis branch: gate it (deliver memory + deno-kv now), or absorb #139 to deliver redis
too?** The one genuine fork; asked at stop 1.

> **Answered 2026-09-01 — gate Redis.** #138 delivers memory + deno-kv memoization, the
> memory-persistence P0, single-flight acquisition, and the `close()` shutdown wiring. `redis` stays
> a first-class per-request branch (safe: no shared socket). A follow-up issue owns the deferred
> Redis half — memoization + single-flight `connect` + the per-connection command write-mutex — and
> `redis.ts:24`'s comment is repointed at it. **#138 must not close as "redis done"**: its Redis
> connection-leak AC bullet is explicitly deferred to that follow-up, named on the merge request,
> not silently dropped. Both audits endorsed this path.

> **OQ2 — Decided 2026-09-01 (the architecture audit settled it, not the user).** Process-wide memo
> keyed on resolved config, plus a wired `resetDriverRegistry()` test hook and shutdown-clear. The
> counted blast radius on the existing suite is **zero** (5 memory-boot tests, none assert a fresh
> store), so the earlier "most likely to break the 1000-test suite" framing was overstated — the
> real exposure is the tests this feature *adds*, which the hook covers. A scope narrower than the
> process is rejected: US2/FR-004 require one handle per process per config, and per-app scoping
> reopens the per-app handle multiplication the feature exists to kill.
