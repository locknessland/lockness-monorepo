# Plan: Memoize the Redis session driver

**Branch**: `010-memoize-redis-driver` | **Date**: 2026-09-01 | **Backlog item**:
[#145 — Memoize the Redis session driver with single-flight connect and per-connection command serialization](https://github.com/locknessland/lockness-monorepo/issues/145)

**This is the feature's one planning document.** Read whole by whoever implements it.

---

## 1. Why this exists

#138 memoized the session driver per process for `memory` and `deno-kv` but
**deliberately left `redis` per-request** (`registry.ts` `MEMOIZED` allowlist),
because a shared Redis socket is unsafe until three things exist. The
consequence is a live defect, not a hypothetical: **every request to a
redis-backed app opens a fresh TCP connection and re-issues `AUTH`** — N
requests, N connections, N authentications. Under load this exhausts Redis
client slots and file descriptors, and adds a full connect+auth round-trip to
every request's latency.

#145 is the home for finishing #138's redis half. Its two preconditions have
landed: #141 (RESP byte-length encoder) and #139 (`readReply` — the bounded,
drained one-reply-per-command reader). The remaining work is to make the shared
socket safe, then share it.

**The ordering is a hard security invariant, not a preference.** The #139
security plan-audit (Security-S5, pinned on #145) established: `readReply` is
correct *only* under one-reply-per-command / one-connection-per-request. A
shared socket **without** command serialization turns the drained reply reader
into a **cross-user session-disclosure primitive** — user A's reply can be read
as user B's off a desynced socket (CWE-362). **Serialize first, then memoize.**

## 2. User scenarios

### US1 — Redis-backed app under concurrent load (P1)

**Given** an app configured with the `redis` session driver
**When** it serves many concurrent requests
**Then** the process holds **one** authenticated Redis connection shared across
all of them, not one per request — and no request reads another request's reply.

### US2 — Two overlapping commands on the shared socket (P1, security)

**Given** two requests are **both in flight** on the one shared redis driver
**When** each issues a session command (a `GET`, a rotating `EVAL`) so that both
`sendCommand` calls are started before either completes
**Then** their RESP frames never interleave on the wire — each caller receives
**its own** reply, because the first command's reply is fully drained before the
second's frame is written. (The test must exercise *overlap*, not sequential
back-to-back issue — a write-only or too-narrow mutex passes a back-to-back test
while still leaking under overlap. Security F4.)

### US3 — Two apps, same host, different credentials (P2, security)

**Given** two resolved configs with the same `hostname`/`port`/`db` but
different `password`
**When** both resolve their driver
**Then** they get **different** authenticated sockets — neither can read the
other's sessions. This holds **iff** the password digest in the memo key is
collision-resistant (a digest collision hands config B config A's already-authed
socket without B proving its credential — Security F1 / Architect MED).

### US4 — Graceful shutdown (P2)

**Given** a memoized redis driver holding an open socket
**When** the process shuts down (the `@lockness/contract` disposables drain runs)
**Then** the socket is closed exactly once; a double close does not throw; and
`close()`'s `QUIT` does not tear a command out from under an in-flight request.

### Edge cases

- Cold-start burst: two concurrent first-requests race the lazy `connect()` —
  must open **one** socket, not two.
- Transient connect failure: a failed `Deno.connect` must not be cached forever;
  the next command retries.
- **Mid-stream command failure**: a `writeFrame`/`readReply` fault closes the
  socket and nulls `connection`; the next command must transparently reconnect,
  not fail against a dead handle (Security F2 / Architect MED).
- A command issued while `connect()` is still authenticating must wait for the
  full connect (incl. `AUTH`/`SELECT`) and must **not** deadlock against the
  command mutex (§9 R2).

## 3. Requirements

- **FR-001**: The redis driver is constructed **once per process per resolved
  config** and shared across requests — moved from the per-request branch into
  the `MEMOIZED` allowlist in `packages/session/drivers/registry.ts`.
- **FR-002**: `driverKey` returns a stable key for a redis config discriminating
  on `hostname`, `port`, `db`, **and a collision-resistant digest of the
  password** (SHA-256 — see §12 Q1). The key **never** contains the cleartext
  password. The digest primitive is homed **solely in `registry.ts`** and is
  **not** the 32-bit FNV `redactSessionId` (a session-id log fingerprint, not a
  credential digest).
- **FR-003**: Two redis configs differing only in `password` resolve to
  **different** memo keys — they never collapse onto one authenticated socket.
- **FR-004**: `RedisSessionDriver.connect()` is **single-flighted** — the
  in-flight connect promise (`connectPromise`) is cached, so a concurrent
  cold-start burst opens **one** connection and issues `AUTH`/`SELECT` once
  (mirrors `deno_kv.ts` `kvPromise`).
- **FR-005**: A connect that fails is **not** cached permanently — `connectPromise`
  is dropped on rejection so the next command retries; the original rejection
  still propagates to the awaiting caller (no silent catch). **The same reset
  fires on a mid-stream command failure**: the desync-close path nulls
  **both** `connection` **and** `connectPromise` together (mirroring
  `deno_kv.ts` `close()`, which nulls `kv` and `kvPromise`), so a command queued
  behind a desync reconnects instead of failing on a dead socket. (Security F2 /
  Architect MED.)
- **FR-006**: `sendCommand` is **serialized per connection** — two overlapping
  calls never interleave their frames; the second command's frame is written
  only after the first command's reply is **fully drained** by `readReply`. The
  `await connect()` runs **inside** the serialized critical section (not before
  it), so each serialized command re-establishes the socket freshly and a command
  queued behind a desync self-heals (Architect MED). Re-entrancy is avoided
  because `connect()`'s own `AUTH`/`SELECT` use the private `#exchange` directly
  and never acquire the mutex (§9 R2).
- **FR-007**: Serialization is a property of the driver **independent of the
  memo** — `readReply` is never exposed to a shared socket without serialization
  in force (Security-S5). **The mutex ships and is tested as a driver invariant
  before `'redis'` is added to `MEMOIZED`.** This ordering is decision-table row
  3a (Architect MED — the load-bearing sequencing constraint).
- **FR-008**: `close()` closes the socket, **deregisters** its disposable, and
  is **idempotent**; the driver **registers** its `close()` with the
  `@lockness/contract` disposables drain when it first holds a socket (the
  pattern #138 established for `deno-kv`), so shutdown closes the memoized
  socket. `close()`'s `QUIT` **serializes through the command mutex** (so it
  drains after any in-flight `#exchange`) and is guarded so it never *reopens* a
  closed socket (Security F3 / Architect MED).
- **FR-009**: `resetDriverRegistry` closes a memoized redis driver via its
  `close()` capability (assert it — it is the test-lifecycle and shutdown path).
- **FR-010**: The `#145` "tracked / gated" comments in `redis.ts` (class
  `@remarks`) and `registry.ts` (module doc + `driverKey` `@throws`) are
  **repointed** — they now describe shipped behavior, not a pending gate.
- **FR-011**: A test asserts redis driver **identity across two requests** (the
  inverse of #138 FR-007's non-identity gate at
  `driver_memo.test.ts:124-128`, which flips when redis enters the memo) **and**
  that a concurrent cold-start burst opens **one** connection, **and** the US2
  overlapping-command test (each of two in-flight commands receives its own
  reply). Because Q1 resolves **sync** (§12), the currently-synchronous test
  functions stay synchronous — no `await` ripple.

## 4. Success criteria

- **SC-001**: Under N concurrent requests to one redis-backed app, exactly
  **one** TCP connection and **one** `AUTH` are established (was N).
- **SC-002**: A login persists across two requests — a value written on request
  1 is read on request 2 through the one shared socket.
- **SC-003**: Two apps on the same host with different passwords never read each
  other's sessions.
- **SC-004**: Two **overlapping** (both-in-flight) commands on the shared driver
  never corrupt each other's replies — a `GET` issued (without awaiting) right
  after a large `SETEX`/`EVAL` returns the correct value, never a fragment of the
  other reply.
- **SC-005**: After the shutdown drain runs, no redis socket the process
  memoized remains open.
- **SC-006**: A command failure that closes the socket is followed by a
  successful reconnect on the next command (no process-wide session outage until
  restart — Security F2).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The redis driver is memoized per process per resolved config | `registry.ts` — `MEMOIZED` set (add `'redis'`) + `getOrCreateDriver` | a second `new RedisSessionDriver` anywhere; an else-branch that memoizes "everything not cookie" |
| Two redis configs are the same socket **iff** same host/port/db **and** same password | `registry.ts` — `driverKey` redis case | keying on host:port:db only (collapses different passwords → SC-003 fails); keying on the raw password (log-unsafe → FR-002 fails) |
| The password digest must be **collision-resistant as a credential boundary** (a collision = two tenants on one authed socket) — SHA-256, never the 32-bit FNV | `registry.ts` — `driverKey`'s digest step (imported helper distinct from `redactSessionId`) | reusing `redis.ts`'s `redactSessionId` FNV; a home in `redis.ts` (which authenticates with the raw password and needs no digest) |
| **(3a — ordering) The command mutex ships and is tested as a driver invariant _before_ `'redis'` enters `MEMOIZED`** | `redis.ts` — the mutex, landed in an earlier commit than the `registry.ts` `MEMOIZED` change | adding `'redis'` to `MEMOIZED` while the mutex is still absent/narrower (ships the CWE-362 interleave green — Security-S5) |
| Commands on a shared socket never interleave their frames | `redis.ts` — `RedisSessionDriver` command-queue mutex around the whole `#exchange` (write+drain) | a caller-side lock in `middleware.ts`; relying on "one driver per request" (false once memoized) |
| A concurrent cold-start opens exactly one connection | `redis.ts` — `connect()` single-flight `connectPromise` | double-checked locking in the caller; per-request construction (the very thing #145 removes) |
| A connect **or mid-stream command** failure self-heals on the next command | `redis.ts` — `connectPromise` reset on rejection **and** on the desync-close path | resetting only on connect rejection (Security F2 — bricks the memoized driver until restart) |
| A memoized redis socket is closed exactly once at shutdown, `QUIT` draining after any in-flight command | `redis.ts` — `connect()` registers a disposable; `close()` deregisters, serializes `QUIT` through the mutex, is idempotent | closing in `middleware.ts`; `QUIT` bypassing the mutex (tears an in-flight command — Security F3); closing only via the registry with no disposable (leaks if the registry is never reset) |

**Binding on the implementer.** A decision may not move out of its home without
this plan being amended first. A review finding that a decision has two homes is
a **plan violation**.

## 6. Technical context

- **Language / runtime**: Deno, native TypeScript, TC39 decorators. JSR-only
  deps (hard rule #2). No `npm:`.
- **Storage**: Redis over a raw `Deno.Conn` TCP socket, RESP protocol
  (`resp.ts` owns framing: `encodeCommand`, `writeFrame`, `readReply`).
- **Crypto**: **`crypto.subtle.digestSync('SHA-256', …)` from `jsr:@std/crypto@^1`
  — a synchronous, WASM-backed SHA-256** (verified 2026-09-01: returns a 64-hex
  digest with no `await`). This is what lets the memo stay synchronous while
  using a collision- and preimage-resistant credential digest, dissolving the
  §12 Q1 fork. New JSR dependency on `@lockness/session`, declared in its
  `deno.json`.
- **Testing**: `Deno.test`, in-memory fakes (`tests/fake_redis.ts`), stubbing
  `Deno.connect` via `Object.defineProperty` to count connections (the pattern
  `driver_memo.test.ts` already uses for `Deno.openKv`).
- **Scale**: one shared socket per process per resolved config; commands
  serialized, so throughput is bounded by round-trip latency — acceptable for
  session I/O and no worse than today's per-request behavior in the single-user
  case, while removing the per-request connect+auth cost.

### Domain Model

- **Bounded context**: session.
- **Entity**: the session (identity = session id). Unchanged by #145.
- **Value objects**: `RedisConfig` (hostname, port, password, db); the
  **resolved-config memo key** (the identity of a driver instance).
- **Infrastructure adapter**: `RedisSessionDriver` — the port is
  `SessionDriver`; #145 changes only the adapter's lifecycle (shared, serialized,
  single-flighted), not the port.
- **Invariants**: (1) one reply per command per socket at all times
  (Security-S5); (2) different credentials ⇒ different sockets; (3) a socket is
  closed at most once.
- **Out of scope**: the RESP encoder (#141), reply-drain/TTL/silent-catch
  (#139), memory/deno-kv memo (#138), TLS/`rediss://` (pre-existing plaintext
  `AUTH` — see §11; #145 reduces the exposure, does not fix it).

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | PASS — `registry.ts`'s `Context` import is pre-existing, type-only, unchanged. |
| JSR-only deps | PASS — `@std/crypto` is JSR, declared in the package `deno.json`. No `npm:`. |
| No `any` in exported APIs | PASS — `driverKey`/`getOrCreateDriver` signatures stay sync and typed; the mutex uses generics. |
| Tailwind v4 syntax | N/A — no UI surface. |
| Pre-completion gate | PASS — enforced at implement. |
| No manual `deno.lock` edit | PASS — the `@std/crypto` add goes through `deno cache`/task, not a hand edit. |
| JSDoc on public APIs | PASS — updated for `driverKey` (redis case), `close()`; the mutex is private. |
| MVC layering | PASS — infrastructure adapter only. |
| No silent catches | PASS — the single-flight reset and the mutex tail swallow **only** for the internal chain; the original error propagates to the caller (same shape as `deno_kv.ts`). |
| Commit discipline | PASS — mutex (test-first) lands in its own commit **before** the memo change (row 3a); one category per commit. |

No violations → no Complexity Tracking entry.

## 8. Surface impact

**Internal only. No public API change, no new public surface.**

- `packages/session/drivers/registry.ts` — `MEMOIZED` gains `'redis'`;
  `driverKey` gains a redis case (its `@throws` narrows to `cookie` only). Sole
  production caller: `middleware.ts:68` (1 site). `driverKey` has 0 external
  production callers (1 internal use at `registry.ts:76`).
- `packages/session/drivers/redis.ts` — command mutex, single-flight connect,
  disposable registration, comment repoint. All private/internal. 7 `sendCommand`
  call sites: 5 public commands the mutex wraps; `AUTH`/`SELECT` inside
  `connect()` bypass it; `QUIT` inside `close()` is the guarded shutdown case.
- `packages/session/drivers/mod.ts` — **unchanged**; `createDriver` already
  builds the redis driver.
- `packages/session/deno.json` — declares `jsr:@std/crypto@^1`.
- Public `SessionDriver` interface — **unchanged**.
- `packages/session/tests/driver_memo.test.ts` — the redis non-identity
  assertion (lines 124-128) flips to identity; tests stay synchronous (Q1 sync).

**No front-end surface** → this plan mentions no artifacts.

## 9. Risks

- **R1 — digest sync/async friction (RESOLVED).** `@std/crypto`'s `digestSync`
  gives a synchronous SHA-256, so `driverKey`/`getOrCreateDriver`/the `Map` memo
  stay synchronous and race-free by construction. The async-memo branch (a
  `Promise` memo needing its own registry-level single-flight, shared with
  memory/deno-kv) is **not taken**. See §12 Q1.
- **R2 — command-mutex re-entrancy deadlock (RESOLVED, completed per Architect
  MED).** Extract a private `#exchange(conn, args)` = `writeFrame` + `readReply`
  + discard-on-desync. `connect()` calls `#exchange` **directly** for
  `AUTH`/`SELECT` (never the mutex) — no re-entrancy. `sendCommand` serializes a
  critical section that does `await connect()` **then** `#exchange`, with
  `await connect()` **inside** the serialized section so a command queued behind
  a desync re-establishes the socket freshly instead of running `#exchange` on a
  dead handle. This is the load-bearing design note for implement.
- **R3 — a failed command wedging the queue.** A promise-chain mutex whose tail
  is a rejected promise stalls every later command. **Mitigation**: the internal
  tail swallows (`.catch(() => {})`) so the next command runs, while the
  **returned** promise still rejects to *its* caller. Same shape as
  `deno_kv.ts`'s single-flight reset; not a silent catch.
- **R4 — flipping #138's redis non-identity assertion.** `driver_memo.test.ts`
  lines 124-128 assert redis is per-request (the memo gate). That assertion is
  *designed* to flip when redis enters the memo — replace it with an identity
  assertion and a comment noting it is the #145 inverse. Because Q1 resolves
  **sync**, the synchronous test functions at `driver_memo.test.ts:91` and
  `:132` stay synchronous and the `driverKey` calls at `:134/:136/:142` need no
  `await` (Architect LOW).

## 10. Architecture audit

_`architect-expert` on this plan, 2026-09-01, before any code. Boundary axes
clean (two infra adapters, imports inward, no cycle/god-file/context-leak). **No
CRITICAL.** 1 HIGH, 3 MEDIUM, 1 LOW — all folded into the plan above._

| Finding | Sev | Disposition |
| :--- | :--- | :--- |
| **Q1 → resolve to a synchronous digest**; the async-memo branch introduces a registry-wide construction race the sync memo is immune to, and ripples to 1 prod call site + 6 assertions + 2 test fns | HIGH | **Plan changed.** Q1 bound to **sync SHA-256** via `@std/crypto` `digestSync` (§12, §6, FR-002). Satisfies the architect's "keep it sync" *and* security's "must be SHA-256" — the two HIGH findings reconcile on one primitive. |
| R2 deadlock-sound but incomplete — move `await connect()` **inside** the serialized section; pin `close()`/`QUIT` vs the mutex | MED | **Plan changed.** FR-006 (connect inside the section), FR-008 + row 8 (`QUIT` serialized, guarded against reopen), §9 R2. |
| Decision-table row 7 gives the digest **two homes** (`redis.ts`/`registry.ts`) — a two-home split the table's own rule forbids | MED | **Plan changed.** Digest homed **solely in `registry.ts`**, explicitly distinct from `redis.ts`'s `redactSessionId` (§5 row 3 of digest, FR-002). |
| Table missing the two most load-bearing decisions — the **serialize-before-memoize ordering** (FR-007) and the **digest-strength** requirement | MED | **Plan changed.** Added row **3a** (ordering, `redis.ts` mutex lands before `MEMOIZED`) and the digest-collision-resistance row (§5); FR-007 states the ordering. |
| FR-011's flipped assertion is sound — name the flipped tests and the sync→async cost | LOW | **Plan changed.** §9 R4 + FR-011 name `driver_memo.test.ts:124-128` (flip) and record that sync Q1 keeps `:91`/`:132` synchronous. |

## 11. Security audit

_`security-expert` on this plan, 2026-09-01, before any code. **Verified the
mutex design genuinely enforces Security-S5** (FR-007 makes the mutex a
memo-independent invariant, not an assertion) and the R2 ordering closes the
steady-state CWE-362 interleave window. **No CRITICAL.** 1 HIGH, 2 MEDIUM, 1 LOW
— all folded. Kept separate from §10 on purpose: §10 asks whether each rule has
one home, §11 asks whether that home is reachable by someone who should not
reach it._

| Finding | Sev | Disposition |
| :--- | :--- | :--- |
| Password digest must be **SHA-256, not a non-crypto FNV** — FNV-32 is neither collision-resistant (a crafted colliding password collapses onto a victim's authed socket → cross-tenant session read/write, US3/SC-003) nor preimage-resistant (if the key value reaches a log, the password is recovered by near-instant offline brute-force). The AC's "e.g. SHA-256" is strength-illustrative, not substitution-permitting | HIGH | **Plan changed.** FR-002 binds SHA-256; §5 adds the collision-resistance row; §12 records that `redactSessionId`'s FNV precedent does **not** transfer (that fingerprint is not a security boundary; this one is). Reconciles with Architect HIGH via the *sync* SHA-256 primitive. |
| FR-005 self-heal covered connect-rejection but **not the mid-stream command failure** that nulls the socket — same "bricks until restart" outage via a different path | MED | **Plan changed.** FR-005 now resets `connectPromise` on the desync-close path too; SC-006 added; edge case named in §2. |
| The Security-S5 boundary is tested only **"back-to-back"**, which passes without a mutex — the control is only proven under real overlap | MED | **Plan changed.** US2/SC-004/FR-011 reworded to **overlapping** (both-in-flight) commands, each asserted to receive its own reply. |
| `close()`/`QUIT` not stated to serialize against in-flight commands on the now-shared socket (CWE-362, low disclosure since process is terminating) | LOW | **Plan changed.** FR-008 + row 8: `QUIT` serializes through the mutex, guarded against reopening a closed socket. |

**Recorded, out of #145 scope (so it is not lost):** the driver connects over
plaintext `Deno.connect` (`redis.ts:111`), so `AUTH <password>` travels in
cleartext. This predates #145 and #145 **reduces** the exposure (one `AUTH` per
process, not per request). A TLS / `rediss://` decision is a separate future
item, not this plan's work.

## 12. Open questions

**Q1 — sync memo with a synchronous digest, or async memo with SHA-256?
RESOLVED 2026-09-01: sync memo with synchronous SHA-256.**

The two plan audits split on this — security demanded SHA-256 (an FNV digest of
a *password* is collision- and preimage-weak); architecture demanded the memo
stay synchronous (async spreads a new registry-wide construction race across
memory/deno-kv and ripples to 6 assertions + 2 test fns). Both reject the
original FNV option. The split dissolves on one fact, verified in-session:
**`jsr:@std/crypto@^1` exposes `crypto.subtle.digestSync('SHA-256', …)` — a
synchronous, WASM-backed SHA-256.** Using it, `driverKey` stays synchronous
(architecture satisfied) *and* the credential digest is SHA-256 (security
satisfied). `redactSessionId`'s FNV precedent does **not** transfer: a session-id
log fingerprint whose collisions are harmless is the right tool there; the memo
key is a credential boundary where a collision breaks authentication.

_Assumptions taken (one line each — correct me if wrong):_

- The mutex serializes **all** commands on the socket (reads and writes alike) —
  RESP has no multiplexing, so a `GET` and an `EVAL` cannot safely overlap.
- `db` stays part of the key even though it is not a credential — a different
  logical database is a different resource.
- No change to the `SessionDriver` port or to `middleware.ts`'s logic — the
  driver is already awaited per call; memoization is transparent to the caller.
- Unsalted SHA-256 of a low-entropy password is still dictionary-attackable *if
  the key value is ever logged* — so the digest is defence-in-depth for a value
  that must never be logged, not a licence to log it (recorded per Security F1).
