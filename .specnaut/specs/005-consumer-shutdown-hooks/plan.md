# Plan: Migrate the resource-holding packages onto the core shutdown hook

**Branch**: `005-consumer-shutdown-hooks` | **Date**: 2026-09-01 | **Backlog item**:
[#136 — Migrate queue, sse, session and cache onto the core shutdown hook](https://github.com/locknessland/lockness-monorepo/issues/136)

---

## 1. Why this exists

[#129](https://github.com/locknessland/lockness-monorepo/issues/129) shipped the hook and wired the
two teardowns core owns. #136 says four more packages leak on exit and asks for them to be wired.

**Two of those four premises do not survive contact with the code.** Measured on this tree before
anything was written:

| Package | #136's premise | What the code says | Verdict |
| :--- | :--- | :--- | :--- |
| `@lockness/cache` | "Deno KV and Redis handles" | The driver **is** a process singleton (`store.ts:20`, `let cacheDriver: CacheDriver \| null`). But `grep -rn "\.close()" packages/cache/` returns **nothing at all** — no driver exposes one, tests included. | ⚠️ Real, but it is **new API first**, not wiring |
| `@lockness/session` | "closes its Deno KV / Redis handles through the hook" | `createDriver()` is called **inside the middleware, per request** (`middleware.ts:45`), and constructs a **new driver every time** (`drivers/mod.ts:38-53`). `close()` exists and is called **only from tests**. | 🔴 **Not a shutdown problem.** See below |
| `@lockness/queue` | "`QueueWorker.stop()`" | Correct — `stop()` exists at `mod.ts:426`. But nothing in core constructs a `QueueWorker`; there is no queue bootstrap step. | ⚠️ Real, but core holds no instance to tear down |
| `@lockness/sse` | "heartbeat intervals" | Correct — `setInterval` per client at `channel.ts:352`. Same ownership problem: no sse bootstrap step exists. | ⚠️ Real, same shape as queue |

**A fifth package, and a second resource, that #136 does not name.** Enumerated by search over every
package for `Deno.openKv` / `Deno.connect` / `setInterval` / `new Worker(` / `Deno.watchFs`, rather
than by working from the item's list:

- `@lockness/queue` opens a **Deno KV handle** at `mod.ts:187` on top of the worker loop, and
  `kv.close` appears nowhere in the package. FR-007 covers both.
- `@lockness/mail` opens a TCP connection at `mod.ts:170` — and **closes it correctly**, at `:204`
  and `:240`, after sending `QUIT`. Per-send, not per-process.
- `@lockness/storage` opens files at `mod.ts:145` and `:170` and never calls `close()` — but both are
  **stream-scoped**: `pipeTo(file.writable)` closes the destination when the source ends, and
  `getStream` hands `file.readable` to the caller. Per-call, not per-process.
- `@lockness/logger` **is** in scope and neither #136 nor my first sweep caught it — `Deno.FsFile` at
  `mod.ts:173`, an existing `close()` at `:193`, a `let globalLogger` singleton at `:367`, and docs
  that tell the application to close it by hand. My sweep grepped `Deno.openKv` and `Deno.connect`
  and not `Deno.open`, which is how it was missed. **Q4** decides whether it joins this feature.

The three above are named so the next reader does not re-derive that they were checked. The shape
that matters is not "opens a resource" — `mail` and `storage` both do — it is **a process-lifetime
singleton holding one**, which is what makes a shutdown hook the right tool.

### The session finding, which is the important one

A shutdown hook cannot fix `@lockness/session`, because there is nothing long-lived to close:

```
middleware.ts:45     const driver = createDriver(c, sessionConfig)   ← per REQUEST
drivers/mod.ts:45    case 'deno-kv': return new DenoKvSessionDriver(config.kvPath)
drivers/deno_kv.ts   getKv() → Deno.openKv(...)     lazily, per instance
drivers/redis.ts:50  connect() → Deno.connect(...)  lazily, per instance
```

So with `driver: 'deno-kv'` **every request that touches the session opens a new `Deno.Kv` handle**,
and with `driver: 'redis'` **every request opens a new TCP connection**. Neither is ever closed —
`close()` is defined on both and its only callers in the repository are three lines in
`packages/session/tests/drivers.test.ts`.

That is a per-request file-descriptor leak. It exhausts the process long before anybody presses
Ctrl-C, and at shutdown there is no single driver to close — there are N, all already unreachable.
**#136's third acceptance criterion is not implementable as written**, and the defect it points at is
considerably more serious than the one it describes. It needs driver caching, which is a different
change with a different risk profile. Q1 at the stop asks what to do about it.

## 2. User scenarios

### US1 — A package's resource is released without the application wiring anything (P1)

**Given** an application using `@lockness/cache` with the Deno KV driver
**When** it receives `SIGTERM`
**Then** the KV handle is closed as part of the ordered teardown, with no `onShutdown` call in the
application's own code.

### US2 — A package that core never constructs still participates (P1)

**Given** an application that creates its own `QueueWorker` or `SSEChannel`
**When** shutdown runs
**Then** the worker stops and the heartbeat intervals are cleared — without the package importing
`@lockness/core`, and without the author remembering to register anything.

### US3 — A package still works with core absent (P1)

**Given** `@lockness/cache` used standalone, outside a Lockness application
**When** it is imported and used
**Then** nothing throws, nothing warns, and `deno task deps:analyze` reports **no new cycle** — the
only new edges are the two to `@lockness/contract` that `deps.policy.jsonc` names explicitly.

### Edge cases

| Case | Expected |
| :--- | :--- |
| A resource created **after** shutdown began | Refused the way the registry already refuses a late hook, with a warning. |
| The same resource registered twice | Torn down once. |
| A resource that is garbage before shutdown (a closed SSE channel) | Deregistered when it closes; a teardown must not resurrect it. |
| Cache configured with the Redis driver | The client was **injected by the application** (`RedisCacheDriver(client)`, "must be connected"). See Q3. |
| An application that never calls `listen()` | Nothing registered, nothing torn down, no behaviour change. |

## 3. Requirements

*Provisional below the line Q1 and Q2 settle — see §12.*

| # | Requirement |
| :--- | :--- |
| **FR-001** | A package may register a teardown **without importing `@lockness/core`**, and without the application wiring anything. |
| **FR-002** | The registration surface lives in `@lockness/contract` — the package that imports **nothing**, so an edge to it can never close a cycle whatever else the graph does. It is not free: `queue` and `sse` gain a real edge (FR-012). It is the *cheapest* edge available, and the only one with that property. |
| **FR-003** | With core absent, registering is a no-op that neither throws nor warns. A library used standalone must not complain about a framework that is not there. |
| **FR-004** | Core registers **one entry per disposable** in its own registry, not one entry that loops over all of them. Collapsing N into 1 would silently repeal #129's stated policy — `shutdown_registry.ts:180`, "a single broken teardown must not strand every resource behind it" — for exactly the resources this feature exists to release. Still one *list*: core's registry remains the single home; the contract registry is a collection point that feeds it. |
| **FR-014** | An **injected** client is never closed by the framework. `RedisCacheDriver` receives an already-connected client from the application (`redis_driver.ts:228`, "must be connected"); it registers a no-op unless constructed with `ownsClient: true`. Closing what you were handed is S9's failure mode aimed at somebody else's connection. |
| **FR-015** | `@lockness/logger` joins the scope (Q4): a `let globalLogger` singleton at `mod.ts:367` holding a `Deno.FsFile` opened at `:173`, with a `close()` already present at `:193` that only the application is told to call. |
| **FR-016** | A **`SHUTDOWN_PRIORITY.PREDRAIN`** band runs **before** `server.shutdown()` in `ShutdownSequence`. Without it SC-003 is unreachable: the SSE teardown sits behind a drain that the SSE streams themselves prevent from resolving, so the deadline expires with `ran: 0` and *no* hook runs — including the one that would have cleared the interval holding the stream open. |
| **FR-017** | `registerDisposable` returns an **opaque handle**; deregistration takes the handle, never a name. Dedup is on object identity. `name` is a **log label with no semantics** — otherwise N SSE channels sharing a literal name collapse to one, and any module can cancel another's teardown by registering a colliding name. |
| **FR-018** | Every disposable name written to a log passes through `safeForLog` from `./logging/sanitize.ts` — the same package, so no new edge. `renderError` **moves** from `packages/core/kernel/shutdown_registry.ts` to `packages/contract/logging/sanitize.ts` beside it, re-exported from core so no caller changes: the drain needs it and `contract` cannot import `core`. Same argument that moved `safeForLog` in the first place. |
| **FR-019** | A torn-down resource is **never handed out again**. `close()` resets its own module singleton (`cache/store.ts:20`), so a programmatic `await app.shutdown()` cannot leave `getDriver()` returning a closed handle and every later request failing with `BadResource`. |
| **FR-005** | A registered resource can **deregister**, so an SSE channel closed during normal operation is not torn down again at exit. |
| **FR-006** | `@lockness/cache` gains an **optional** `close?()` on the `CacheDriver` interface, implemented by the drivers that own an OS resource. Optional, not required: `packages/cache/ARCHITECTURE.md:180` documents a `MemcachedCacheDriver implements CacheDriver` recipe, so a required member breaks every reader who followed it. `MemoryCacheDriver` implements **nothing** — its `Map`s are module-level and shared across instances (`memory_driver.ts:12-14`), so a `close()` clearing them would corrupt a second instance. The drain skips a driver without one. |
| **FR-007** | `@lockness/queue` releases **both** its resources. #136 names only `QueueWorker.stop()`; the package also opens a Deno KV handle at `mod.ts:187` and `kv.close` appears **nowhere** in it — the same shape as cache, and unmentioned by the item. The worker registers its `stop()` on construction and deregisters on `stop()`; the KV handle gains a `close()` and registers separately, because a worker that is stopped has not released the store it was reading. |
| **FR-008** | `@lockness/sse` clears its heartbeat intervals and closes open connections through the same path. |
| **FR-009** | Teardown ordering is deliberate and documented: work is drained **before** the store it writes to is closed — queue and sse before cache. |
| **FR-010** | Every document that instructs an application to release a resource by hand is corrected. **The search this FR first named returns nothing**: `grep -rn "addSignalListener" packages/*/docs/` exits 1 with no output — it was written from the shape of the problem rather than from the tree, and would have been marked done over an empty diff. The instructions that exist are spelled differently: `await log.close() // Close file handles` at `packages/logger/docs/DOCS.md:165,501` and `packages/logger/README.md:157,509`. The real enumerating search is `grep -rnE "\.close\(\)|\.stop\(\)|addSignalListener" packages/*/docs/ packages/*/README.md`, re-run at the end to prove nothing stale remains. |
| **FR-011** | Per-package tests assert the resource is actually released — not that a function was called. |
| **FR-013** | Every `close()` guards on a resource that was never acquired. All three KV drivers in this repo open **lazily** and identically — `cache/drivers/deno_kv_driver.ts:42-47`, `session/drivers/deno_kv.ts:32-37`, `queue/mod.ts:185-190` are the same `if (!this.kv) this.kv = await Deno.openKv(...)`. A driver constructed and never used holds nothing, and an unguarded `close()` would throw inside the drain — which #129's registry catches and logs, turning every clean shutdown into a red line. |
| **FR-012** | `deno task deps:analyze` reports **no new cycle**, and exactly **two new edges** — `queue → contract` and `sse → contract` — each added deliberately to `deps.policy.jsonc`. Measured: `cache` already allows `contract`; `queue` and `sse` carry `allow: []`, so the analyser refuses the import until the policy is amended. That refusal is the feature working: the widening is reviewable in a diff instead of arriving silently. `session` allows only `hono` and is untouched if Q1 scopes it out. |

## 4. Success criteria

| # | Criterion |
| :--- | :--- |
| **SC-001** | An app using the KV cache driver exits with its handle closed; the test sanitiser reports no leak. |
| **SC-002** | An app running a `QueueWorker` exits without the worker loop still running. |
| **SC-003** | An app holding open SSE connections exits with no interval left armed. |
| **SC-004** | Each of the four packages' test suites passes with `@lockness/core` never imported. |
| **SC-005** | The dependency graph gains exactly two edges, `queue → contract` and `sse → contract`, both named in `deps.policy.jsonc`, and no cycle. Any third edge is a defect. |
| **SC-006** | An application that wired teardown by hand for these packages can delete that code and observe the same behaviour. |

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **Where a package announces a resource that must be released** | `packages/contract/lifecycle/disposables.ts` — one process-wide registry | A second registry in `core`; each package calling `app.onShutdown` directly (which needs a core import); an `@lockness/events` broadcast that only works when events is installed |
| **What runs at teardown** — still one list | `packages/core/kernel/shutdown_registry.ts` (#129) | Core draining the contract registry as a *second traversal* beside its own, rather than registering **one** hook that drains it |
| **The order: drain producers before closing stores** | `packages/core/kernel/shutdown_registry.ts` — the `SHUTDOWN_PRIORITY` band | A per-package literal; a package choosing its own number; reusing a `BootstrapStep.order` (the trap #129 already documents) |
| **Whether core is present** | `packages/contract/lifecycle/disposables.ts` — the registry simply collects; nobody asks | A `try { import('@lockness/core') }` in each package; a `globalThis` sniff |
| **When a resource stops being a liability** | The owning object's own `close()`/`stop()` — it deregisters itself | A separate "is it still alive" check in the drain loop; a `WeakRef` sweep |
| **Who closes an injected client** | `packages/cache/drivers/redis_driver.ts` — the `ownsClient` constructor flag, default `false` | Cache closing a client the application opened *and* the application closing it too; a global "close everything" that does not ask who opened what |
| **How a teardown failure is rendered** | `packages/contract/logging/sanitize.ts` — `renderError`, moved there beside `safeForLog` | A second renderer written in `contract` because `core`'s is unreachable — two spellings of one rule that diverge on the first escape sequence somebody remembers in only one of them |
| **What runs before the server stops accepting** | `packages/core/kernel/shutdown_sequence.ts` — the `PREDRAIN` band | An SSE-specific special case inside the drain loop; a package closing its own connections from a signal handler |
| **How long the collection point lives, and what a drain does to it** | `packages/contract/lifecycle/disposables.ts` — process-wide, and **drain takes a snapshot and clears**| Copying `ShutdownRegistry`'s `#started` freeze (`shutdown_registry.ts:118-125`) into it. That flag is right for a **per-App** registry and catastrophic for a process-wide one: after the first app in the process shuts down, every later registration becomes a silent no-op — and `packages/core/tests/` boots many apps per process, so the tests that would catch it are the ones it disables |
| **What `close()` means for a driver that owns no OS resource** | `packages/cache/types.ts` — the `CacheDriver` interface's JSDoc | An empty `close()` on `MemoryCacheDriver` that a later reader either deletes or "fixes" into `memoryStore.clear()`, which corrupts every other instance sharing those module-level `Map`s |
| **Which packages may import the foundation** | `deps.policy.jsonc` — the `allow` list per package | Adding the import and silencing `deps:analyze`; adding an entry to `knownCycles` to go green, which `scripts/deps_analyzer.ts:631` explicitly tells you not to do |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2.9.6.
**Primary Dependencies**: none new. The whole point of FR-002 is that `@lockness/contract` is
already imported by every package in scope.
**Testing**: `Deno.test`; subprocess probes where a real signal is needed, as in
`packages/core/tests/shutdown_signals.test.ts`.
**Constraints**: two new edges, both to `contract`, both declared in `deps.policy.jsonc`; no cycle;
each package must work with core absent.
**Scale/Scope**: 1 new file in `contract`, `sanitize.ts` gains `renderError`, `core` changes in two
places (the pre-drain phase and the registration), and **four** packages touched — `cache`, `queue`,
`sse`, `logger`. Session is out (Q1); logger is in (Q4).

### Domain model

- **Vocabulary**: a **disposable** is something holding an OS resource that must be released. It
  **registers** when it acquires and **deregisters** when it releases. The **drain** is core running
  every registered disposable.
- **Invariants**:
  1. Registering twice tears down once.
  2. A deregistered disposable is never torn down.
  3. With core absent, registering has no observable effect whatsoever.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | Not touched. |
| JSR-only specifiers | pass | No new dependency. |
| No `any` in exported APIs | pass | `Disposable = { name: string; dispose(): void \| Promise<void> }`. |
| Pre-completion gate | pass | Plus `deps:analyze`, which FR-012 makes load-bearing. |
| JSDoc on public APIs | pass | FR-006 adds a public `close()` to the cache driver contract. |
| No silent catches | pass | The drain reuses #129's registry, whose catch logs and continues. |
| Commit discipline | pass | `feat(136)` per package, `docs(136)`, and — **required by `deps.policy.jsonc:18-19` itself** — a `chore(deps)` commit of its own for the widening, "never bundled with the change that needed the widening". Plus a separate item for session if Q1 scopes it out. |

### Complexity tracking

FR-002 puts runtime code in `@lockness/contract`, which today is "almost no runtime code". That is a
deliberate widening: it is the only package every consumer already imports and which imports nothing,
so it is the one place a registry cannot create a cycle. The alternative — each package importing
core — is the cycle.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/contract` | **yes** | New: `registerDisposable`, `deregisterDisposable`, `drainDisposables`, `Disposable`. |
| `@lockness/core` | **yes** | One registration inside the shutdown sequence's setup. No change to the mechanism. |
| `@lockness/cache` | **yes** | `close()` on the driver contract and all three drivers — **new public API**. |
| `@lockness/queue`, `@lockness/sse` | **yes** | Register/deregister around existing lifecycles. No API change. |
| `@lockness/session` | **Q1** | Not touched if session is scoped out. |
| Front-end / UX-UI | no | None. |

## 9. Risks

| # | Risk | Mitigation |
| :--- | :--- | :--- |
| **R1** | A process-wide registry is a global, and globals leak between tests. | Deregistration (FR-005) plus an explicit reset in test setup; the invariant is asserted, not assumed. |
| **R2** | Holding a strong reference to every disposable **prevents garbage collection** — a long-lived SSE app that opens and closes thousands of channels would grow without bound. This is the risk the design most plausibly creates. | FR-005 makes deregistration mandatory rather than optional, and a test asserts the registry returns to zero after N open/close cycles. |
| **R3** | Adding `close()` to the cache driver contract would break external implementors. Counted: **three** in-repo, all inside `packages/cache`, plus a JSDoc example at `types.ts:71` **and a documented extension recipe at `ARCHITECTURE.md:180`**. | Resolved in FR-006 — the member is optional and the recipe is updated in the same commit. FR-006 first said "all three drivers" while this row said "optional"; two halves of a binding document contradicting is worse than either answer, so FR-006 now states the optional form and this row defers to it. |
| **R4** | Cache's Redis driver receives a client the **application** opened. Closing it from the framework closes something the framework does not own. | Q3. |
| **R5** | #136's AC list will not be fully satisfiable if Q1 scopes session out, and closing the item as "done" would then overstate what shipped. | The plan says so explicitly; the merge report names what was deferred and the new item that carries it. |

## 10. Architecture audit

`architect-expert`, before any code. **Verdict: fail** — 1 CRITICAL, 4 HIGH, 4 MEDIUM, 2 LOW. I
re-verified every finding I acted on rather than relaying it.

| # | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| A1 | **CRITICAL** | **The registry's lifetime is process-wide; the mechanism it feeds is per-application.** `shutdown_sequence.ts:123` is `readonly #registry = new ShutdownRegistry()` — one per sequence — and `app.ts:191` is one sequence per `App`. Two apps in one process would cross-drain, and copying `ShutdownRegistry`'s permanent `#started` freeze would make every registration after the first shutdown a silent no-op. | **Plan changed — verified true, and it is my error.** New decision row: the contract collection point is process-wide and **drain snapshots and clears**, with no freeze. That makes it self-healing across tests rather than self-disabling. The residual multi-app cross-drain is now stated rather than discovered. |
| A2 | HIGH | `@lockness/queue` holds its own unclosed `Deno.Kv` (`mod.ts:185-190`) in the very file FR-007 edits. | **Already folded in** — I found this independently by sweeping every package for `Deno.openKv`/`Deno.connect`/`setInterval` before the audit reported. FR-007 covers both resources. Agreement from two directions. |
| A3 | HIGH | **FR-006 ("all three drivers") contradicted R3 ("make it optional")**, with no row resolving it. | **Plan changed.** Optional wins, stated once in FR-006; R3 defers to it. The seat also found what I had not: `ARCHITECTURE.md:180` documents a `MemcachedCacheDriver` recipe a required member would break, and `MemoryCacheDriver`'s `Map`s are module-level and shared, so a `close()` on it would corrupt other instances. |
| A4 | HIGH | **FR-010's own enumerating grep returns nothing.** Verified: `grep -rn "addSignalListener" packages/*/docs/` exits 1, no output. The real manual-release instructions are `await log.close() // Close file handles` at four sites in `@lockness/logger`. | **Plan changed.** FR-010 rewritten with the search that actually finds them. It was written from the shape of the problem rather than the tree, and would have been marked done over an empty diff — the precise failure "enumerate by search, not by example" exists to prevent, committed by the enumeration itself. |
| A5 | HIGH | **`@lockness/logger` is a fifth package with the identical shape** — `Deno.FsFile` at `mod.ts:173`, an existing `close()` at `:193`, a `let globalLogger` singleton at `:367`, and docs telling the app to close it by hand. | **Verified true. → Q4** at the stop: scope it in, or its own item. My sweep found `queue`'s second resource and cleared `mail`, and missed logger because I grepped for `Deno.openKv`/`Deno.connect` and not `Deno.open`. |
| A6 | MEDIUM | §7 omitted the `chore(deps)` commit that `deps.policy.jsonc:18-19` demands of itself — "never bundled with the change that needed the widening". | **Plan changed.** |
| A7 | MEDIUM | FR-002's premise "the package everything imports" is false for 3 of 4 in-scope packages, and `contract`'s brief is stale by three importers. | **Already corrected** in FR-002/FR-012 before the report landed. The stale brief is a separate, pre-existing item. |
| A8 | MEDIUM | The `WeakRef` alternative is listed as a duplicate but never argued. | **Accepted, with the seat's reasoning, which is better than mine:** reachability and resource-openness are different questions — an armed `setInterval` keeps a timer alive in the host whatever the GC thinks — and a `FinalizationRegistry` callback is not guaranteed to run before exit, so it can never be what a *shutdown* depends on. Recorded in §12. |
| A9 | MEDIUM | "Register on construction" may register a disposable that owns nothing, because every KV driver opens lazily. | **Plan changed — new FR-013.** |
| A10 | LOW | §5's last row is a placeholder ("Q3 decides"). | Acceptable through the stop; **must be a real row before `tasks`**, since `tasks` reads the table. |
| A11 | LOW | 7 of 10 SSE test sites pass `heartbeatInterval: 0` and take the early return at `channel.ts:347`, so extending that file would not exercise the interval path. | **Accepted** — FR-011's tests must construct with a real interval. |

### Where the seat corrected my framing

§7's "Complexity tracking" called putting runtime code in `contract` a deliberate widening of a
types-only package. That is **wrong on the facts**: `packages/contract/routing/decorators.ts:43`
already exports `declaredMiddlewares`, a mutable module-level `Map` written by a decorator and read
by `http/compose.ts`. The invariant `contract` actually carries is narrower and is stated in its own
brief — *every `@lockness/*` import must be `import type`* — which a dependency-free registry does
not breach. So FR-002 has precedent in the same package, and the apology was misplaced.

### What the seat cleared, and what that covers

The cycle argument survives. FR-004's "one registration, not a second traversal" is the right shape
(`shutdown_sequence.ts` has a single traversal point). FR-009's ordering is free — `SERVICES: 30`
before `STORES: 60` already gives producers-before-stores, no new scale needed. Both of the plan's
headline code claims — cache has no `close()` anywhere, and session constructs a driver per request
— were verified line by line, and the session one is **stronger** than I wrote: `middleware.ts:53`
reads unconditionally, so it is every request the middleware runs on, not merely those touching the
session.

**Not covered by the seat:** `@lockness/storage`'s close paths (`Deno.open` at `mod.ts:145,170`);
`devtools`, `socialite`, `validator`, `inertia`. It also flagged its own limit honestly: it read the
architecture index but not the individual smell leaves, so it stated mechanisms with file:line
rather than claiming catalogue-backed smell names.

## 11. Security audit

`security-expert`, before any code. **Verdict: fail** — 1 CRITICAL, 2 HIGH, 8 MEDIUM, 1 LOW. The
CRITICAL and one HIGH are **pre-existing defects in `packages/session/`**, found while verifying this
plan's premises. They are not caused by this feature, and they outrank it.

### 🔴 S1 — CRITICAL, pre-existing: the session cookie is forgeable

**Verified line by line, then demonstrated.** Not relayed.

| Element | Evidence |
| :--- | :--- |
| Crypto is **skipped entirely** on an empty secret | `drivers/cookie.ts:78` — `if (!this.config.secret) return btoa(encodeURIComponent(data))`; identically at `:101` for decrypt. No encryption, no MAC. |
| An empty secret is the **package default** | `config.ts:13` — `secret: ''` |
| The fallback key is **committed to the repository** | `core/kernel/bootstrap/helpers.ts:122` — `Deno.env.get('APP_KEY') ?? 'change-me-in-production'`, guarded by a `console.warn` and nothing else. Repeated at `config/session.ts:11` and `packages/init/stubs/init/config/session.ts.stub:11`. |
| The PBKDF2 salt is **constant** | `drivers/cookie.ts:137` — `salt: encoder.encode('lockness_session_salt')`. With a known key and a fixed salt the derived AES-GCM key is byte-identical on every deployment that forgot `APP_KEY`. |
| The sink trusts it as identity | `auth/guards/session_guard.ts:185` — reads `auth_<guard>` from the session and calls `findById(userId)`. Nothing verifies the session was authentically issued. |

Demonstrated against our own tree, with the package default:

```
forged cookie value : JTdCJTIyYXV0aF93ZWIlMjIlM0ExJTdE
driver decodes it to: {"auth_web":1}
=> session_guard would read auth_web = 1
```

That is unauthenticated impersonation of any account, from a base64 string, with no credentials.
`console.warn` is not a control: nothing refuses to boot, and the empty-secret path does not even
warn.

### 🟠 S2 — HIGH, pre-existing: the per-request driver leak is an unauthenticated DoS

The seat confirmed this plan's §1 headline line by line and **raised it from MEDIUM to HIGH on
exposure**: it needs no authentication, no crafted input, and fires under ordinary production load.
One `Deno.Kv` handle or one TCP connection per request, `close()` called only from three test lines.
It also found a corroborating detail I had missed — with `driver: 'memory'`, `drivers/mod.ts:43`
hands out a fresh empty `Map` every request, so sessions never persist at all.

### Plan-stage findings, and what was done

| # | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| S3 | HIGH | The drain omits `safeForLog` — **free here**, since it lives at `contract/logging/sanitize.ts:45`, the same package. And `renderError` lives in **core**, which contract cannot import, so the plan's structure forces either a second renderer or a raw error. An SSE channel name is a request path segment in the package's own documented usage, so the name is attacker-influenced. | **Plan changed** — new FR and a §5 row. The seat's fix is better than a second encoder: **move `renderError` into `contract/logging/sanitize.ts` beside `safeForLog`** and re-export from core. Same argument that moved `safeForLog`, same package, and it is a public-API relocation once published. |
| S4 | MEDIUM | **FR-004's one-hook drain repeals #129's per-hook failure isolation** — one throwing disposable strands every one behind it, which `shutdown_registry.ts:180` states as policy in as many words. And `Disposable` has no priority field, so **FR-009's ordering is unimplementable**: it degrades to module load order, and a cache driver created at boot registers before a worker built on first job — satisfying FR-009 backwards. | **Plan changed.** Core registers one entry **per disposable**, not one for all; `Disposable` gains `priority?`. |
| S5 | MEDIUM | `drainDisposables` on contract's public surface is a process-wide "close everything now" capability, and `contract/mod.ts` is `export *` — so it is public API on a published package, removable only with a major bump. | **Plan changed** — the drain is not re-exported; core receives it as a one-shot token. |
| S6 | MEDIUM | Identity keyed on `name` collapses N SSE channels into one and lets **any module cancel another's teardown** by registering a colliding name. | **Plan changed** — register returns an opaque handle; dedup on object identity; `name` is a log label with no semantics. |
| S7 | MEDIUM | **SC-003 is unreachable.** The SSE teardown sits behind the server drain, and the SSE streams are what prevent that drain from resolving — the deadline expires with `ran: 0` and *no* hook runs. Circular, and #129's own module comment predicted it. | **Plan changed → Q5.** The fix is a pre-drain phase, which *is* a change to #129's mechanism that §8 promised not to make. Either the promise or SC-003 goes. |
| S8 | MEDIUM | R2's growth is client-driven, but the missing bound is `maxClients: Infinity` (`sse/channel.ts:26`) and `ChannelManager` never evicts. The registry amplifies a pre-existing leak rather than creating one; R2's proposed test only covers the path where `close()` **is** called. | **Accepted** — the plan must state registration granularity (per channel vs per connection differ by orders of magnitude). |
| S9 | MEDIUM | FR-006's `close()` leaves the cache singleton pointing at a **closed** handle, so a programmatic `app.shutdown()` poisons every later request with `BadResource`. | **Plan changed** — a fourth invariant: a torn-down resource is never handed out again. |
| S10–S12 | MEDIUM/LOW | Three more pre-existing session defects: KV `regenerate()` writes with **no expiry** so authenticated sessions never expire while anonymous ones do; Redis `regenerate()` passes the **db index as the TTL** (`db ?? 7200` with `db` defaulting to `0`) so login 500s and the old session is left alive; RESP bulk length counted in UTF-16 units, not bytes. | **Out of scope here** — they belong to the session items S1/S2 create. |

### What the seat cleared, with its reasoning

It explicitly **declined** two findings it could have claimed, and said why — which is what makes the
rest credible. A hostile transitive dependency registering a `dispose` is not a finding: under Deno a
module that can call `registerDisposable` already ran arbitrary code at import with the process's
full permissions. And the injected Redis client does not become *readable* from anywhere new —
`private` is compile-time only and `getDriver()` is already exported — so Q3 is a **capability**
question, not a confidentiality one. Also cleared: session ID entropy (32 CSPRNG bytes), cookie flags,
and ordinary requests being served against a half-closed store (the server drain precedes every hook
by design).

## 12. Open questions

| # | Question | Why it cannot be assumed |
| :--- | :--- | :--- |
| **Q1** | **Session**: scope it out of this feature and open a separate bug for the per-request leak, or fix the driver caching here? | The measured defect is not the one #136 describes, and the fix (cache the driver per process, then close it) is a behaviour change to the request path — a different blast radius from wiring a teardown. |
| **Q2** | **The registry in `@lockness/contract`, or per-application wiring?** The alternative is that packages expose `close()`/`stop()` and the application calls `app.onShutdown(...)` itself — simpler, no new runtime code in the foundation, but it does **not** satisfy #136's "without any app-level wiring". | It decides whether `contract` gains runtime code, and whether the AC is met or renegotiated. |
| **Q3** | **Cache's injected Redis client** — does the framework close a connection the application opened and handed in? | Closing it surprises an app that shares the client elsewhere; not closing it leaves the leak the item is about. |

### Answers — settled 2026-09-01

| # | Answer | What it binds |
| :--- | :--- | :--- |
| **Q1** | **Session is scoped out.** Three separate items carry it: the CRITICAL auth bypass (S1), the HIGH per-request leak (S2), and the TTL/RESP cluster (S10–S12). | FR list drops session entirely. #136's third acceptance criterion is **renegotiated, not delivered** — the merge report must say so rather than let the item close over it. |
| **Q2** | **The registry stays in `@lockness/contract`**, with S4's and S5's corrections. Decided rather than asked: both audits converged, and the architecture seat showed the package already exports `declaredMiddlewares`, a mutable module-level `Map` (`contract/routing/decorators.ts:43`), so the precedent exists and `contract`'s real invariant — type-only `@lockness/*` imports — is not breached. | FR-002 stands. FR-004 changes shape (S4): core registers **one entry per disposable**, so #129's per-hook failure isolation survives. The drain is **not** re-exported from `contract/mod.ts` (S5). |
| **Q3** | **Do not close an injected client.** Decided rather than asked: the security seat's reasoning is conclusive, and S9 shows the failure mode — closing something you were handed poisons a connection the application still uses. `RedisCacheDriver` registers a no-op unless the application opts in with `ownsClient: true`. | New FR-014. §5's placeholder row becomes a real row. |
| **Q4** | **`@lockness/logger` is in scope.** | It is the package whose docs actually instruct `await log.close()` — the thing FR-010's original grep was looking for and failed to find. Excluding it would make "resource-holding packages migrated" false on the day it shipped. |
| **Q5** | **Add the pre-drain phase.** §8's promise not to touch #129's mechanism is **withdrawn**; SC-003 survives. | New `SHUTDOWN_PRIORITY.PREDRAIN` band that `ShutdownSequence` runs **before** `server.shutdown()`. Cheap now — one phase, one file, no external callers — and a reordering of a published, documented sequence later. |

### Decided without asking

| Decision | Why it needed no question |
| :--- | :--- |
| Reuse #129's `SHUTDOWN_PRIORITY` band rather than inventing a second scale. | The band exists, is documented, and #129's decision table forbids a second one. |
| Core registers **one** hook that drains the registry, rather than traversing it separately. | #129's first decision row gives "the one list of teardowns" a single home; a second traversal is the defect that row exists to prevent. |
| Producers (queue, sse) tear down before stores (cache). | Draining work into a store you have already closed loses it. Stated as FR-009 rather than left to the implementer. |
