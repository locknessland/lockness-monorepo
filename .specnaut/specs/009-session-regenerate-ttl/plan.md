# Plan: Fix session regenerate() TTL and Redis reply handling

**Branch**: `009-session-regenerate-ttl` | **Date**: 2026-09-01 | **Backlog item**:
[#139 — Session regenerate() drops the TTL on Deno KV and passes the db index as the TTL on Redis](https://github.com/locknessland/lockness-monorepo/issues/139)

**This is the feature's one planning document.** Business and technical together, read whole by
whoever implements it.

---

## 1. Why this exists

`regenerate()` runs on exactly one event — a **successful login** — where session lifetime and
error handling must be correct, because that is the moment session-fixation protection rotates the
id. On the two server-side drivers it is broken, each differently, and the Redis driver carries two
further error-handling defects around the same path. All verified against the tree on 2026-09-01.

| # | Defect | Location | Consequence |
| :--- | :--- | :--- | :--- |
| 1 | Deno KV `regenerate()` omits `expireIn` | `packages/session/drivers/deno_kv.ts:100-101` | **Authenticated sessions never expire server-side**, while anonymous ones do — the inversion of what is wanted. |
| 2 | Redis `regenerate()` passes `config.db` as the TTL | `packages/session/drivers/redis.ts:166` | `db` defaults to `0`; `0 ?? 7200` is `0`, so `SETEX <key> 0` errors, login 500s, and **the old id is never destroyed — fixation protection is off**. |
| 3 | Redis `read()` swallows every failure as `null` | `packages/session/drivers/redis.ts:141-143` | A Redis outage is indistinguishable from a cache miss: **every user is silently logged out, no log line.** Violates the constitution's "no silent catches". |
| 4 | Redis reads exactly 4096 bytes once | `packages/session/drivers/redis.ts:105-106` | A session larger than 4096 bytes is truncated; `JSON.parse` throws into the bare catch above → the same silent `null`. |

`store.ts:82-86` assigns the new id **after** `driver.regenerate()` resolves, so any driver whose
`regenerate()` throws leaves the id un-rotated. Defects 1 and 2 are therefore not cosmetic: on Redis
today, **login fixation protection does not work at all**.

**Out of scope, tracked elsewhere.** The RESP length-prefix encoder defect is P0/security and owned
by #141 (already fixed and merged — `resp.ts`). Per-request driver construction and the resource
leak are #138 (merged). This issue fixes the *reply* side and the TTL side of the existing driver;
it does not replace the hand-rolled RESP client.

## 2. User scenarios

### US1 — An authenticated session expires on schedule (P1)

**Given** a user logs in with `lifetime` = 2 hours, on the Deno KV or Redis driver
**When** `regenerate()` rotates the id at login
**Then** the new session carries the same remaining TTL it would have via `write()` — it expires
server-side ~2 hours later, not never.

### US2 — Login succeeds and rotates the id on every driver (P1)

**Given** a user authenticates on any of cookie / memory / deno-kv / redis
**When** the login handler calls `session.regenerate()`
**Then** the request does not 500, and `session.getId()` returns a value different from the
pre-login id — session-fixation protection is on.

### US3 — A Redis outage is visible, not a silent logout (P1)

**Given** the Redis server is unreachable or returns a protocol error mid-read
**When** a request reads its session
**Then** the failure is logged at ERROR and propagates as an error — distinct from a genuine cache
miss, which returns `null` with no log.

### US4 — A large session round-trips through Redis (P2)

**Given** a session whose serialized JSON exceeds 4096 bytes
**When** it is written and then read back on the Redis driver
**Then** the value read equals the value written — the reply reader drained the full RESP frame.

### Edge cases

- **A GET on a missing key** returns a RESP nil bulk (`$-1\r\n`) → `read()` returns `null`, no log,
  no throw. This is the one path that legitimately yields `null`.
- **A reply split across multiple TCP reads** (bulk body arrives in two `conn.read`s) must reassemble
  into one value.
- **A RESP error reply** (`-ERR ...`) on any command throws with the server's message — it is not a
  cache miss.
- **`lifetime` of 0 or negative** — treated as the config's problem, not regenerate's: `regenerate`
  passes whatever `write` would receive for the same session. No new clamping is introduced here.

## 3. Requirements

- **FR-001**: `DenoKvSessionDriver.regenerate()` sets the new key with `expireIn`, computed from the
  session lifetime, matching `write()`.
- **FR-002**: `RedisSessionDriver.regenerate()` issues `SETEX` with the session **lifetime**, never
  `config.db`.
- **FR-003**: The session lifetime reaches `regenerate()` from **one** source — the resolved
  `SessionConfig.lifetime`, threaded through `SessionStore` — the same source `write()` reads. No
  driver invents a TTL default and none reuses `config.db`.
- **FR-004**: A regenerated session on deno-kv and on redis has the same remaining TTL it would have
  had via `write()` for the same lifetime.
- **FR-005**: `RedisSessionDriver.read()` returns `null` **only** for a genuine RESP nil reply. Any
  connection or protocol failure is logged at ERROR **exactly once** and propagates — it is never
  converted to `null`. The log line **must not contain the raw session id or session bytes**: the id
  is a bearer credential (`session:<id>` is the Redis key), so it is routed through
  `@lockness/contract`'s `safeForLog` or logged only as a short hash/prefix. `read()` logs and
  rethrows a typed error; the upstream framework handler renders it **without re-logging at ERROR**
  (single home for the log — see SC-003) and returns a **generic 500** carrying no RESP text,
  connection string, or `Error` message to the client. *(Security S4, Architecture A-M3.)*
- **FR-006**: The Redis reply reader drains the connection until the RESP reply is structurally
  complete, so a reply (bulk body included) larger than one 4096-byte read round-trips intact. Its
  return contract keeps a **RESP nil bulk (`$-1`) distinct from an empty-but-present bulk (`$0`)** —
  nil maps to `null` at `read()`, `$0` maps to the empty string that round-trips. *(Architecture
  A-M2.)*
- **FR-007**: Reply reading and RESP reply parsing live in `packages/session/drivers/resp.ts` — the
  module that already owns "a frame is on the wire in full" (`writeFrame`) now also owns "a reply is
  off the wire in full" (`readReply`). `redis.ts` calls it and does not re-implement framing. This
  replaces `parseResponse` (the `.split('\r\n')` at `redis.ts:113-134`), which is deleted, not left
  as a second framing home.
- **FR-008**: **One parametrised test asserts session-fixation protection after a
  regenerate-on-login, and it runs against every driver** — cookie, memory, deno-kv, redis. The set
  is enumerated by the `SessionConfig['driver']` union, not by example. Because `SessionStore`
  rotates the id **unconditionally** (`store.ts:84`), "the id changed" alone is true even if the
  driver did nothing — so on the two **server** drivers the test asserts the stronger pair: after
  regenerate, **the new id reads back the carried data**, and **the old id no longer resolves
  server-side**. *(Security S2.)*
- **FR-009**: A test asserts an end-to-end login succeeds on the Redis driver (the path that
  currently 500s via `SETEX 0`).
- **FR-010**: `readReply` is bounded — a declared bulk length beyond a fixed maximum (10 MiB; a live
  session is kilobytes) throws promptly rather than allocating it, and the drain loop is bounded by a
  production read timeout, not only the test-side `withTimeout`. This closes the "trust the
  server-declared length" resource-exhaustion path on a flaky or hostile (plaintext) Redis link.
  *(Security S1.)*
- **FR-011**: `regenerate()` is **atomic** on both server drivers — the new key is written and the old
  key destroyed as one indivisible operation, so no failure path can leave the authenticated data on
  the new id while the attacker-known old id also still resolves.
  - **Redis**: a single `EVAL` Lua script (`GET` old → `SET` new with `EX lifetime` → `DEL` old),
    one command / one reply — chosen over `MULTI/EXEC` because it needs no array-reply parsing added
    to the one-reply-per-command RESP client that #145 is about to rework. The session bytes never
    leave the server.
  - **Deno KV**: `kv.atomic().set(new, value, { expireIn }).delete(old).commit()`.
  *(Security S3 — resolved in scope, 2026-09-01: "build atomic rotation now".)*

## 4. Success criteria

- **SC-001**: After login on any driver, the session id differs from the pre-login id, and the
  request returns a non-5xx status.
- **SC-002**: A session created with a 2-hour lifetime and then regenerated still reports a
  remaining server-side TTL within one second of 2 hours — it is not immortal (deno-kv) and login
  does not fail (redis).
- **SC-003**: With Redis unreachable, a session read surfaces an error and emits exactly one ERROR
  log line; with Redis reachable and the key absent, it returns empty with no log line. The two are
  distinguishable by an operator.
- **SC-004**: A session whose serialized body is at least 8192 bytes is read back byte-identical
  through the Redis driver.
- **SC-005 (mutation)**: Reverting `regenerate` to pass `config.db`, or removing `expireIn` from the
  deno-kv regenerate, turns at least one test in the suite red. Reverting the reply reader to a
  single 4096-byte read turns the large-session test red. Making `destroy(oldId)` a silent no-op
  turns the fixation test's "old id no longer resolves" assertion red (SC-005 must exercise the
  destroy path, not only the store's unconditional id-swap — Security S2).
- **SC-006**: A `readReply` fed a declared bulk length beyond the 10 MiB bound throws promptly, and
  does not allocate a buffer of the declared size (Security S1).
- **SC-007 (mutation)**: A fault injected between the new-key write and the old-key delete leaves the
  store in one of two consistent states — either both applied or neither — never the new id resolving
  while the old id also still resolves (Security S3 / FR-011 atomicity). Verified with an atomic-op
  failure on Deno KV and an `EVAL` error on Redis.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| How long a session lives after login (the TTL a regenerate applies) | The resolved `SessionConfig.lifetime`, read by `SessionStore.regenerate()` (`packages/session/store.ts`) and passed to `driver.regenerate(old, new, lifetime)` | A hardcoded `7200` default inside a driver; `config.db ?? 7200` in `redis.ts`; a `kv.set` with no `expireIn` in `deno_kv.ts`; **`memory.regenerate` copying the old `{data, expires}` verbatim, preserving the *remaining* lifetime instead of applying a fresh one** (Architecture A-M1) — each is a second, wrong home for "how long a session lives" |
| Whether a Redis result is a cache miss or a failure | `RedisSessionDriver.read()` (`packages/session/drivers/redis.ts`) — only a RESP nil reply is a miss | A second `catch { return null }` anywhere in the driver; a `read()` that maps a thrown protocol error to `null` |
| When a RESP reply is complete enough to parse, and its maximum size | `readReply()` in `packages/session/drivers/resp.ts` | Any `conn.read(new Uint8Array(N))` single-shot in `redis.ts`; a `.split('\r\n')` reply parse in `redis.ts` that assumes the whole reply arrived in one read; a second bulk-length bound anywhere but `readReply` |
| Where the Redis read failure is logged | `RedisSessionDriver.read()` logs at ERROR **once** (redacted id), then rethrows; the upstream handler renders without re-logging | A second ERROR log of the same failure in the framework error handler (double-log breaks SC-003 — Architecture A-M3) |
| That the session id rotates on login | `SessionStore.regenerate()` (`packages/session/store.ts:82-86`) — assigns `newId` after the driver resolves | A driver that rotates ids itself; a login handler that sets the id directly |
| That rotation is atomic (new written + old destroyed indivisibly) | The driver's `regenerate()` — Redis via one `EVAL` script (`redis.ts`), Deno KV via `kv.atomic()` (`deno_kv.ts`) | A read-then-write-then-destroy sequence of separate round-trips in either server driver; the store attempting to compensate for a partial rotation |
| Which drivers the regenerate/login tests run against | The `SessionConfig['driver']` union type, enumerated in the parametrised test | Any hand-written driver array in a test that lists a subset and silently drops coverage on the missing driver (Architecture A-L3 / Q1) |

## 6. Technical context

**Language/Version**: Deno / TypeScript (native), TC39 Stage-3 decorators.
**Primary Dependencies**: none new. `@std/assert` (tests), `@std/async` if a delay helper is needed
(prefer the local `withTimeout` already in `redis_wire.test.ts`). No `@lockness/logger` edge —
`console.error` is the established in-package pattern (`drivers/registry.ts` already uses
`console.warn` directly).
**Storage**: Deno KV and Redis (via the hand-rolled RESP client), plus memory/cookie.
**Testing**: `Deno.test`; the loopback fake RESP server in `tests/resp_server.ts` for wire tests;
`:memory:` KV path for deno-kv.
**Target Platform**: Deno server (library package `@lockness/session`).
**Project Type**: library (framework package).
**Performance Goals**: no hot-path regression — `readReply` reads in a loop only until the frame is
complete, allocating a growable buffer, not per-byte.
**Constraints**: the driver's single-connection, one-reply-per-command precondition is unchanged
(#145 owns per-connection serialization). `readReply` reads exactly one reply; any bytes past the
frame boundary are retained for the next call rather than discarded — cheap insurance for the #145
follow-on that adds pipelining (Architecture A-L2). **Ordering invariant recorded for #145: driver
memoization / a shared socket MUST NOT land before per-connection command serialization, or the
drained reader becomes a cross-user disclosure primitive** (Security S5). `readReply` is bounded by a
10 MiB max bulk length and a production read timeout (FR-010). No direct `hono` import; JSR-only; no
`any` in exported APIs; JSDoc on the new exported `readReply`.
**Scale/Scope**: four files changed (`store.ts`, `types.ts`, `deno_kv.ts`, `redis.ts`, `resp.ts` for
the reply reader) plus tests. No new package, no new public class.

### Domain model

- **Bounded context**: session persistence (`@lockness/session`).
- **Vocabulary**: *session id* (32 CSPRNG bytes, 64-hex), *lifetime* (seconds a session lives),
  *TTL* (the remaining lifetime a store enforces), *regenerate* (rotate the id, keep the data),
  *RESP reply* (one server response frame).
- **Entities**: none new. The session is identified by its id; the driver is the persistence port.
- **Value objects**: the RESP reply (type byte + payload), already implicit.
- **Invariants**:
  - A regenerated session carries the same TTL a freshly written one would.
  - `read()` returns `null` ⟺ the store holds no live value for that id; every other outcome throws.
  - The id assigned to the store is the id the driver was asked to write to.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | none added |
| JSR-only specifiers | pass | no new deps |
| No `any` in exported APIs | pass | `readReply` types its return over the RESP reply shape; `regenerate` gains a typed `lifetime: number` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | `deno fmt && lint && check && test` before done |
| Never edit `deno.lock` | pass | no dep change |
| JSDoc on public APIs | pass | new exported `readReply` carries full JSDoc; `SessionDriver.regenerate`'s new param documented |
| MVC layering | pass | driver = persistence adapter, store = application; no controller change |
| No silent catches | **pass (this is the fix)** | FR-005 removes the one violating catch; any new catch logs at ERROR or rethrows |
| TDD | pass | failing tests first (developer agent) |
| Commit discipline | pass | split: `fix(139)` code, `test(139)` if separable, `docs(139)` if docs touched |

### Complexity tracking

One interface change: `SessionDriver.regenerate` gains a `lifetime: number` parameter. This is a
breaking change to the `SessionDriver` **interface**, which is public. Justification: it is the only
way to give both server drivers a single lifetime source without a per-driver TTL field (the
rejected alternative duplicates "how long a session lives" into every driver). All four in-tree
implementations are updated in the same change; the interface is documented as
persistence-port-internal (consumers use `getSession(c)`, not the driver directly). Recorded as an
accepted, justified change, not an unflagged break.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `SessionDriver` interface (`types.ts:183`) | yes | `regenerate(oldId, newId, lifetime)` — new required param |
| `SessionStore` (`store.ts:83`) | yes | passes `this.config.lifetime` to `driver.regenerate` |
| Deno KV driver (`deno_kv.ts:97`) | yes | `regenerate` becomes atomic via `kv.atomic().set(new,{expireIn}).delete(old).commit()` (FR-011) |
| Redis driver (`redis.ts:163,136,105`) | yes | `regenerate` becomes a single atomic `EVAL` script with `lifetime` as `EX`; `read` stops swallowing + logs once (redacted) + rethrows; reply reader drained; `parseResponse` deleted |
| Cookie driver (`cookie.ts:514`) | yes | `regenerate` signature gains `lifetime` param (body unchanged — stateless) |
| Memory driver (`memory.ts:60`) | yes | `regenerate` recomputes `expires` from `lifetime` (A-M1), not a verbatim copy |
| `resp.ts` | yes | gains exported `readReply(conn)` with size bound + nil-vs-empty contract |
| Direct-driver tests (`tests/drivers.test.ts:158,218`) | yes | two `regenerate(...)` call sites gain the `lifetime` arg |
| Auth guards (`auth/guards/session_guard.ts:265,302,332`) | **no** | call `SessionStore.regenerate()` with no args — insulated by the store boundary (Architecture Q3) |
| Public re-exports (`mod.ts`) | no | `readReply` is internal, not re-exported |
| HTTP routes / controllers | no | none |
| Front-end | no | no front-end surface in this package |

### Documentation (this feature)

```text
.specnaut/specs/009-session-regenerate-ttl/
├── plan.md    # This file
└── tasks.md   # derived from this file once approved
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A hand-rolled RESP reply reader mis-parses an edge frame (nil bulk, integer, error, split body) | Cover each RESP reply type with a wire test against `resp_server.ts`, plus a split-read test that delivers the bulk body in two chunks. The reader is small and total on the four reply types the session commands produce (`+ - : $`). |
| The reply reader hangs on a desync (no complete frame ever arrives) | Reuse `withTimeout` in the wire tests so a hang is a clean 3s failure, not a wedged CI. Production behaviour on a truncated frame is a thrown error at EOF, not an infinite loop — the loop exits when `conn.read` returns null. |
| Breaking `SessionDriver.regenerate` misses an out-of-tree implementer | Documented as an accepted interface change (§7); all four in-tree drivers updated together; the param is required so a stale implementation fails typecheck rather than silently dropping the TTL. |
| `read()` now throwing surfaces errors that were previously swallowed, changing observed behaviour under a flaky Redis | This is the intended fix (US3). The alternative — keep swallowing — is the defect. Errors propagate to the framework's error handler; a genuine miss still returns `null`. |
| `readReply` trusts a server-declared bulk length → memory exhaustion on a slow/hostile (plaintext) Redis link | FR-010: reject a declared length > 10 MiB before allocating; production read timeout on the drain loop. Wire test SC-006 asserts a huge declared length throws without allocating. |
| A mid-`regenerate` failure (write new, then destroy old throws) strands the attacker-known old id | The old key retains its **pre-login** (short, anonymous) TTL, so the residue self-expires; FR-011 propagates the destroy failure rather than swallowing it. Full transactional rotation is the §12 atomicity question. |
| ERROR log leaks the session id (a bearer credential) into log stores | FR-005: the log line is redacted (`safeForLog` / hashed prefix), never the raw `session:<id>`; the propagated error renders a generic 500 with no RESP/connection detail. |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A-M1 (MEDIUM) | `memory.regenerate` copies `{data, expires}` verbatim, preserving the *remaining* lifetime — so the §6 "same TTL as a fresh write" invariant is false on memory, and the new `lifetime` param dies unused there. | **Plan changed.** FR (memory row in §5, §8 row): `memory.regenerate` recomputes `expires = Date.now() + lifetime*1000` — uniform "fresh lifetime" across all four drivers. Added as the third wrong home in §5 row 1. |
| A-M2 (MEDIUM) | If `readReply` is lifted from `parseResponse` as-is, a RESP nil bulk (`$-1`) collapses to `''`, losing the nil-vs-empty distinction FR-005/SC-003 need. | **Plan changed.** FR-006 now pins nil (`→ null`) distinct from empty-but-present (`$0 → ''` that round-trips); a wire test stores an empty-string value and asserts `read()` returns it, not `null`. |
| A-M3 (MEDIUM) | SC-003's "exactly one ERROR log line" collides with "log at ERROR **and** propagate to the framework handler" — a double-log. | **Plan changed.** FR-005 + §5 new row home the log once: `read()` logs+rethrows a typed error; the upstream handler renders without re-logging. |
| A-L1 (LOW) | §8 surface table omitted `cookie.ts`, `memory.ts` (both need the required param) and the two `drivers.test.ts` call sites — the machine-readable feed for `tasks.md`. | **Plan changed.** §8 now lists all 8 edit points. |
| A-L2 (LOW) | A drain loop may consume bytes past the frame; safe today (no pipelining) but the residual-buffer seam is what survives #145 adding pipelining. | **Plan changed.** §6 constraint: `readReply` retains bytes past the frame for the next call; confirms #145. |
| A-L3 (LOW) | §5 had no row for FR-008's "test set = the driver union, not by example" single-source decision. | **Plan changed.** §5 gained the test-set row. |

**Verdict**: **needs_followup** — the two load-bearing homes (lifetime through `SessionStore.regenerate`; `readReply` in `resp.ts`) are correct and the blast radius is genuinely contained (8 mechanical edits, 0 leaking to the auth layer); no CRITICAL/HIGH. **Covered:** §§1-12 against `store.ts`, `types.ts`, all four `drivers/{cookie,memory,deno_kv,redis}.ts`, `resp.ts`, `tests/drivers.test.ts`, `auth/guards/session_guard.ts`; blast radius counted from grep. All 3 MEDIUM + 3 LOW folded above.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 (MEDIUM) | `readReply` drains on a server-declared bulk length with no size cap and no production timeout — a slow/hostile (plaintext, no TLS) Redis link can make it allocate/block up to `proto-max-bulk-len` (512 MB). | **Plan changed.** FR-010 + SC-006 + §6: 10 MiB max bulk length rejected before allocation, plus a production read timeout on the drain loop. |
| S2 (MEDIUM) | FR-008/SC-001 asserted only `getId()` differs — but the store rotates the id **unconditionally**, so that stays true even if the driver's `destroy` never ran. The proof doesn't exercise the destroy path. | **Plan changed.** FR-008/SC-005 strengthened: on server drivers, assert the new id reads back the data **and** the old id no longer resolves server-side. |
| S3 (MEDIUM) | `regenerate` is non-atomic (`write(new)` then `destroy(old)` as two round-trips); a mid-op failure can strand the attacker-known old id. | **Plan changed — resolved in scope (2026-09-01, user chose "build atomic rotation now").** FR-011 now requires atomic rotation: Redis via a single `EVAL` script, Deno KV via `kv.atomic()`. SC-007 mutation-verifies it. |
| S4 (MEDIUM; response side undetermined) | FR-005 said "logged at ERROR" but not *what* — the value in scope is `session:<id>`, a bearer token; and "propagates to the framework handler" must render a generic 500, not raw RESP/`Error` text. | **Plan changed.** FR-005 now requires `safeForLog`/hashed id (never the raw token) and a generic 500 with no RESP/connection detail; an AC covers the client message. |
| S5 (LOW) | `readReply`'s correctness rests on "one reply per command, one connection per request"; if #145 shares a socket **before** landing per-connection serialization, the drained reader becomes a cross-user disclosure primitive. | **Recorded.** §6 states the ordering invariant; to be posted on #145 as a sequencing note. |

**Verdict**: **needs_followup (advisory-pass)** — the plan *fixes* a pre-existing CRITICAL (Redis fixation entirely off today via `SETEX <key> 0`) and the Deno-KV immortal-session bug, and introduces no CRITICAL/HIGH. Checked and clean: session ids are 32 CSPRNG bytes so no cross-user key is addressable; keys are built only from the caller's own id (no IDOR); the Redis **password never enters** these error paths; propagation is fail-closed. **Covered:** the regenerate/login path across all four drivers, the new `readReply` surface, FR-005 error propagation into logs and responses, and cross-user reachability — against `store.ts`, `redis.ts`, `deno_kv.ts`, `resp.ts`, `types.ts`.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Atomicity (Security S3): make `regenerate` transactional now, or defer?** | **Build atomic rotation now (option B).** Redis via a single `EVAL` Lua script (avoids adding `MULTI/EXEC` array parsing to the RESP client #145 reworks); Deno KV via `kv.atomic()`. Folded into FR-011, SC-007, §5 decision table, §8 surface. | 2026-09-01 |

### Decided without asking

- **Lifetime reaches `regenerate` via a new interface param, not a Redis-only TTL field** — the field
  form leaves deno-kv still needing its own lifetime source, so it is not a single home. Threading
  the param fixes both drivers from one source (`SessionConfig.lifetime`). *This is the architecture
  presented for veto at the stop, with its rejected alternative.*
- **Memory driver adopts uniform "fresh lifetime" (Architecture A-M1)** — `memory.regenerate`
  recomputes `expires = now + lifetime*1000`, matching what a fresh `write()` does on every other
  driver, rather than preserving the old remaining lifetime. Low-stakes and the code already answers
  it: `write()` uses `now + lifetime` everywhere, so `regenerate` matching it is the least-surprising
  reading. Flagged here so a wrong call is visible.
- **Reply reading moves to `resp.ts`, not a new module** — `resp.ts`'s own fileoverview already names
  #139 as the change that moves reply reading beside `writeFrame`. Following the declared home.
- **`console.error` for the ERROR log, not a new `@lockness/logger` dependency** — `registry.ts`
  already logs with `console.warn` directly; adding a package edge for one log line is unjustified.
  The id in that line is redacted via `safeForLog` (FR-005), so raw-token leakage is closed even
  with `console.error`.
- **10 MiB reply bound (FR-010)** — a live session is kilobytes; 10 MiB is generous headroom while
  cutting the 512 MB `proto-max-bulk-len` exposure to a bounded allocation. Chosen, not asked.
- **No TTL clamping is added** — `regenerate` passes exactly what `write` would receive for the same
  lifetime; validating lifetime is a separate concern not in this issue.
