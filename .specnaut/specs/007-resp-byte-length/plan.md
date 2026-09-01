# Plan: RESP arguments length-prefixed in UTF-8 bytes

**Branch**: `007-resp-byte-length` | **Date**: 2026-09-01 | **Backlog item**:
[#141 — Redis session driver length-prefixes RESP arguments by UTF-16 code units, not UTF-8 bytes](https://github.com/locknessland/lockness-monorepo/issues/141)

---

## 1. Why this exists

`packages/session/drivers/redis.ts:74-77` builds the RESP frame as a JavaScript string and
declares each argument's bulk length as `arg.length` — UTF-16 code units — then writes the frame
through `TextEncoder`, which emits UTF-8 bytes. For every argument outside ASCII the declared
length is **short of the bytes actually written**.

Redis advances its parse cursor by `bulklen + 2` without checking that those two bytes are CRLF,
so the surplus is parsed as a fresh inline command on the same socket. Verified on 2026-09-01
against a live `redis:7-alpine`: replaying the frame this encoder builds with
`'é'.repeat(13) + 'SET pwned 1'` as a value argument returned **two** `+OK` replies to one
command, and a separate clean connection then read `GET pwned` → `1`.

**This is not only an attack path — it is a certainty on any non-English deployment.** Measured
in this session:

| Argument the driver sends | Declared | Written | Short by |
| :--- | ---: | ---: | ---: |
| `JSON.stringify({name:'Renée'})` | 16 | 17 | 1 byte |
| `'session:' + 'é'.repeat(5)` | 13 | 18 | 5 bytes |
| a single `🔒` (surrogate pair) | 2 | 4 | 2 bytes |

`write()` sends `JSON.stringify(data)` (`packages/session/drivers/redis.ts:132`), and
`JSON.stringify` does **not** escape non-ASCII — it emits the character. So a user named `Renée`
whose name is held in the session desyncs the connection with no attacker involved.

Two consequences:

1. **Injection** — an attacker-chosen Redis command executes. **Reproduced this session** against
   `redis:7-alpine`: `SET decoy <é×13 + 'SET pwned 1'>` through the broken encoder returned two
   `+OK` replies to one command and a clean connection then read `GET pwned` → `1`.
2. **Stream desync** — `sendCommand` reads exactly one reply per command
   (`packages/session/drivers/redis.ts:82-87`). Two replies for one command puts every later
   reply off by one within that connection's lifetime.

**Scope of the desync — corrected against #141 this session.** #141's body, and this plan's
first draft, said the socket is "shared across every request". It is **not, today**: the driver
is constructed inside the per-request handler (`middleware.ts:64`) via a fresh
`new RedisSessionDriver` (`drivers/mod.ts:51`) with no cache, so a desync corrupts only the
desyncing request's own remaining replies. The cross-user "request A's blob handed to request B →
`auth_<guard>` at `session_guard.ts:185`" takeover becomes reachable only once
[#138](https://github.com/locknessland/lockness-monorepo/issues/138) memoizes the driver
per process. **#141 must therefore land before or with #138** — a constraint neither issue
records, to be posted on both.

**And the account-takeover-via-value path is narrower than it reads.** Probed this session:
`write()` sends `JSON.stringify(data)`, and `JSON.stringify` escapes every `"` to `\"`, so an
attacker cannot emit the raw quotes an auth object needs — the natural forgery stores invalid
JSON that `read()`'s `JSON.parse` rejects (returns `null`, not an authenticated session). The
live, un-narrowed vectors are the operator-supplied **AUTH password** (`redis.ts:57`, non-ASCII
desyncs the connection at connect time) and arbitrary **non-quote** command injection through an
aligned session value. The encoder fix (FR-001/FR-002) closes all of them regardless of
alignment, because a correct length leaves no leftover ever.

**What #137 already closed, and what it did not.** #137 shipped `/^[0-9a-f]{64}$/` on the
session id in `packages/session/middleware.ts:47`, verified present. That closes the
*session-key* path into this defect and only that path. The **value** argument
(`JSON.stringify(data)`) and the **AUTH password** (`packages/session/drivers/redis.ts:57`) are
untouched by it.

## 2. User scenarios

### US1 — A session holding a non-ASCII value round-trips (P1)

**Given** an application configured with `driver: 'redis'`
**When** it writes a session whose data contains a non-ASCII character
**Then** the Redis server receives exactly the one command the driver issued, replies once, and
a later read returns the same data.

### US2 — A deployment with a non-ASCII Redis password connects (P1)

**Given** `RedisConfig.password` containing a character outside ASCII
**When** the driver connects
**Then** the `AUTH` frame's declared bulk length equals the bytes written, and the server
accepts it as one command.

### US3 — The injection frame no longer injects (P1)

**Given** the exact payload from the live-Redis probe — `'é'.repeat(13) + 'SET pwned 1'` — as a
session value
**When** the driver writes it
**Then** the frame declares the full UTF-8 byte length, the server consumes the whole argument
as data, and one command yields one reply.

### US4 — The fix cannot silently regress (P2)

**Given** the regression tests added by this feature
**When** the encoder is reverted to `arg.length`
**Then** at least one test fails.

### Edge cases

- **Surrogate pairs** (`🔒`) — 2 UTF-16 units, 4 UTF-8 bytes. Covered; the byte count is taken
  from the encoded array, so no code-point arithmetic is involved.
- **Lone surrogates** — an unpaired surrogate in a session value. `TextEncoder` substitutes
  U+FFFD (3 bytes). The declared length still equals the bytes written, which is the invariant;
  the substitution is `TextEncoder`'s and is not this feature's to change.
- **An argument containing CRLF** — legal. RESP bulk strings are length-delimited, so an
  embedded CRLF is data. Nothing escapes or rejects it. See decision-table row 3.
- **A short `conn.write`** — `Deno.Conn.write` resolves to the number of bytes written and may
  write fewer than the buffer holds. Today's `await conn.write(...)`
  (`packages/session/drivers/redis.ts:79`) discards that number, so a partial write truncates
  the frame mid-argument and desyncs the connection by a second route. In scope: it is the same
  invariant — bytes on the wire equal the frame — reached from the other side.
- **The empty string as an argument** — `$0\r\n\r\n`. Valid RESP; must not be special-cased.

## 3. Requirements

- **FR-001**: Every RESP bulk length the driver writes is the `byteLength` of that argument's
  UTF-8 encoding. This quantifies over **every argument of every command the Redis driver
  sends** — 6 call sites (`redis.ts:57, 62, 115, 128, 137, 150`) carrying 13 arguments: AUTH 2,
  SELECT 2, GET 2, SETEX 4, DEL 2, QUIT 1. `grep -n 'sendCommand(' packages/session/drivers/redis.ts`
  returns 7 lines; the seventh is the declaration at `:68`, not a call. The set is closed by
  construction, because every call routes through the single encoder of FR-002.
- **FR-002**: The frame is assembled from byte buffers. No JavaScript string concatenation
  carries argument data, and no `.length` of a `string` is ever used as a wire length.
- **FR-003**: The encoder is a pure function `(args: string[]) => Uint8Array`, callable with no
  socket and no I/O.
- **FR-004**: The complete frame is written before any reply is read. A short write is looped to
  completion; a write that cannot make progress raises rather than proceeding to read.
- **FR-004a**: A write that fails after partial progress **discards the connection**
  (`this.connection = null`) before propagating, so no later command inherits a half-written,
  desynced socket. Security audit Finding 2: `this.connection` is currently nulled only in
  `close()` (`redis.ts:152`), never on error. Interacts with #139's `catch { return null }`,
  which would today mask the raised error as a cache miss — that swallow is #139's to remove;
  this branch owns the discard.
- **FR-005**: The encoder never inspects, escapes, rejects or rewrites argument content. This is
  a stated non-rule, not an omission — see decision-table row 3.
- **FR-006**: The encoder stays internal. It is not re-exported from `packages/session/mod.ts`,
  so it does not enter the package's public surface.
- **FR-007**: A test drives a multibyte argument through the encoder and asserts the **exact
  bytes** of the frame, including the declared bulk length. The expected byte array is written as
  a **literal**, never derived from `encodeCommand` — a test that asks the encoder to state its
  own expectation is circular (Architecture Finding 2).
- **FR-008**: A test connects the driver, with a non-ASCII `AUTH` password, to a fake server that
  **verifies the declared length against the bytes it receives**, and asserts the connection
  succeeds. A server that ignores the declared length would pass against the broken encoder and
  prove nothing. The verifying fake lives at `packages/session/tests/resp_server.ts` and is the
  one oracle shared by FR-008 and FR-009 (decision-table row 6).
- **FR-009**: A test replays US3's injection payload and asserts the receiving fake parses
  **exactly one** command from the frame **and consumes it to the last byte, with no trailing
  unparsed bytes**. Verified in this session against live `redis:7-alpine`: the broken encoder's
  leftover is parsed as a second command (`SET pwned 1` → `GET pwned` returned `1`), so a fake
  that stops after the declared args would pass in both directions and prove nothing.
- **FR-010**: Each regression test is negative-tested: reverting the encoder to the pre-fix form
  makes it fail. The negative test is executed and its result recorded, not asserted in prose.
- **FR-011**: `RedisSessionDriver`'s public API is unchanged — no constructor, method or type
  signature moves.

## 4. Success criteria

- **SC-001**: A session containing any non-ASCII character survives a write-then-read cycle on
  the Redis driver, and the server executes no command the application did not issue.
- **SC-002**: A deployment whose Redis password contains a non-ASCII character connects
  successfully.
- **SC-003**: For every command the driver issues, a conforming server produces exactly one
  reply — measured by counting parsed commands at the server, not by inspecting the client.
- **SC-004**: Under the mutation `byteLength → String.length`, **every** test added by FR-007,
  FR-008 and FR-009 fails — not merely one. Each is recorded by name with its failure output. A
  test that stays green under the mutation is a defective test and is rewritten; the mutation is
  not weakened. (Architecture Finding 1: "at least one fails" is satisfied by the pure unit test
  alone, letting the two end-to-end tests — the only ones exercising the driver and the injection
  payload — ship as passengers that never demonstrated they can go red.)
- **SC-005**: The full gate is green and the package's public surface is byte-identical before
  and after, per `deno task agents:brief`.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **How many bytes a RESP argument occupies on the wire** | `packages/session/drivers/resp.ts` — `encodeCommand` | Any `.length` of a `string` used as a wire length; a second `$`-prefix built by concatenation; a caller pre-computing a length and passing it alongside the argument; a `Buffer.byteLength`-style helper added elsewhere |
| **A frame is fully on the wire before a reply is read** | `packages/session/drivers/resp.ts` — `writeFrame` | A bare `await conn.write(frame)` anywhere in `redis.ts`; a retry loop inside `sendCommand`; a `writeAll` import used at one call site and not the other |
| **Argument content is never inspected, escaped or rejected** (a non-rule, stated so it stays one) | `packages/session/drivers/resp.ts` — documented on `encodeCommand`, pinned by a test | A CR/LF stripper or escaper on arguments; a `replace(/[\r\n]/g, '')` in `write()`; a character allowlist in the driver |
| **What a session id must look like** | `packages/session/middleware.ts:47` — `SESSION_ID` (existing, from #137) | A second id regex added to `redis.ts` "for defence in depth"; a key-shape check inside `encodeCommand` |
| **How a RESP reply is read and parsed** | `packages/session/drivers/resp.ts` — **the right home, not yet moved.** `redis.ts`'s `sendCommand` / `parseResponse` hold it today; #139 moves them there beside `encodeCommand`. **This branch must not.** | `parseResponse` staying in `redis.ts` permanently — after #139, `resp.ts` would model `$N` correctly while `redis.ts:96-101` still splits on CRLF and discards the length, two spellings of the wire in one package (Architecture Finding 4). Equally: moving the reader here now, which gives #139's work two homes across two branches. |
| **What a conforming RESP frame looks like, as judged by a test** | `packages/session/tests/resp_server.ts` — one verifying fake, shared by FR-008 and FR-009 | Importing `encodeCommand` into a test to build an expected frame (circular oracle); a second hand-rolled parser in a second test file (Architecture Finding 2) |
| **What `@lockness/session` exports** | `packages/session/mod.ts` | Re-exporting `resp.ts` from `drivers/mod.ts`; a second surface list in `AGENTS.md` edited by hand (Architecture Finding 6 — homes FR-006/FR-011) |

**Binding.** A decision may not move out of its home without this plan being amended first. A
review finding that a decision has two homes is a plan violation, not a style opinion.

## 6. Technical context

**Language / runtime**: TypeScript on Deno 2.9.6. **Storage**: Redis over a raw TCP socket
(`Deno.connect`), RESP2 hand-rolled — no client library. **Testing**: `Deno.test`, plus a fake
RESP server on `Deno.listen({ port: 0 })` in-process. Feasibility verified in this session: a
loopback listener accepts, captures the exact bytes and replies, under `--allow-net`; the
package's test task already runs `-A`. **Scale**: one socket per driver instance, shared by
every request.

### Domain model — bounded context `session`, RESP wire sub-domain

| Term | Meaning here |
| :--- | :--- |
| **Frame** | The complete byte sequence for one command. A value object: no identity, compared by bytes. |
| **Argument** | One element of a command. A `string` at the API boundary, a `Uint8Array` on the wire. |
| **Bulk length** | The `$N` prefix. The invariant of this feature: `N` equals the argument's UTF-8 `byteLength`, always. |
| **Inline command** | What Redis parses when the cursor lands outside a declared bulk string. The defect's exploit primitive. |
| **Desync** | The state where replies no longer correspond one-to-one with commands on a shared socket. |

**Invariant**: for every argument **of every command serialized over the socket**,
`declared bulk length == bytes written for that argument`. Everything in this feature exists to
make that structurally true rather than incidentally true. The "serialized over the socket" clause
is load-bearing and comes from the security audit: `sendCommand` holds no mutex, so two commands
sharing one socket can interleave their frames on the wire regardless of per-frame correctness.
That hazard is unreachable **today** — each request builds its own `RedisSessionDriver`
(`middleware.ts:64`) with its own socket — and becomes reachable the moment
[#138](https://github.com/locknessland/lockness-monorepo/issues/138) memoizes the driver
per process. See §9 and the open question in §12.

**Out of the model**: reply parsing, TTL semantics, connection lifetime. Owned by
[#139](https://github.com/locknessland/lockness-monorepo/issues/139) and
[#138](https://github.com/locknessland/lockness-monorepo/issues/138).

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| 1 — No direct `hono` import | ✅ N/A. This feature touches no Hono surface. |
| 2 — JSR-only, declared per package | ✅ No new dependency. A full-write loop is five lines, chosen over `@std/io`'s `writeAll` precisely so no edge is added to `packages/session/deno.json`. |
| 3 — No `any` in exported APIs | ✅ `encodeCommand(args: string[]): Uint8Array`; `writeFrame(conn: Deno.Conn, frame: Uint8Array): Promise<void>`. |
| 4 — Tailwind v4 syntax | ✅ N/A. No front-end surface. |
| 5 — Pre-completion gate | ✅ `deno fmt && deno lint && deno check && deno task test`, plus `deno task deps:analyze`. |
| 6 — Never edit `deno.lock` | ✅ No dependency change, so no lock change is expected. A lock diff is a signal that FR-002's "no new dependency" was breached. |
| 7 — JSDoc on public APIs | ✅ `resp.ts` carries `@fileoverview` / `@module`; both functions carry full JSDoc even though they are internal — the non-rule of row 3 has to be written down somewhere a reader will find it. |
| 8 — MVC layering | ✅ Driver-layer change only. No controller, no service. |
| 9 — One category per commit | ✅ Planned split: `fix(141)` for the encoder + driver, `test(141)` if the test scaffold lands separately, `docs(141)` for the package brief if the surface table moves. |
| Methodology — TDD | ✅ FR-007/008/009 tests are written failing first; FR-010 is the mutation check that proves they were. |
| Methodology — No silent catches | ✅ FR-004's write loop raises rather than returning quietly. The existing `catch { return null }` at `redis.ts:118` is **#139's**, deliberately untouched here. |

**Complexity tracking**: no violations, so no entries.

## 8. Surface impact

| Surface | Impact |
| :--- | :--- |
| `@lockness/session` public exports | **None.** `encodeCommand` and `writeFrame` live in `drivers/resp.ts` and are not re-exported from `mod.ts` (FR-006). |
| `RedisSessionDriver` API | **None.** Constructor, `read`, `write`, `destroy`, `regenerate`, `close` unchanged (FR-011). |
| Wire protocol | **Changed, and that is the fix.** Frames for non-ASCII arguments now declare the correct length. Nothing on the wire changes for pure-ASCII arguments — the two encodings agree there — so no deployment sees a behavioural change it did not already need. |
| `packages/session/AGENTS.md` | Regenerated if the surface table moves. Expected: unchanged, since nothing new is exported. |
| Configuration / env | None. |
| Front end | **No front-end surface.** `@lockness/session` is server-side; there is no JSX, no component, no route rendered by this package. |

**Interface contract** — the one this feature adds, internal:

```ts
/** Encodes a RESP2 array command. The bulk length is the UTF-8 byteLength, always. */
export function encodeCommand(args: string[]): Uint8Array

/** Writes a frame in full, looping over short writes. */
export function writeFrame(conn: Deno.Conn, frame: Uint8Array): Promise<void>
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **The test passes against the broken encoder** — a fake server that ignores the declared length accepts both frames equally, and the regression proves nothing. | FR-008 requires the fake server to **verify** the declared length against the bytes received, and FR-010 negative-tests every regression test against the pre-fix encoder. This is the single most likely way this feature ships worthless. |
| **The fake server diverges from real Redis.** A hand-written RESP parser in a test can be wrong in the same direction as the code under test. | The fake asserts on *bytes received* and *commands parsed*, not on Redis semantics. The live-Redis behaviour is already recorded in [#141](https://github.com/locknessland/lockness-monorepo/issues/141); this branch does not re-derive it. Where a fake and the issue's live probe disagree, the probe wins and the plan is amended. |
| **Scope creep into #139.** `sendCommand`'s 4096-byte read and `parseResponse`'s string handling are visibly wrong and sit two lines away. | Decision-table row 5 names the reply path as out of scope with its owner. A change there is a plan violation. |
| **A port-0 listener leaks and trips Deno's resource sanitizer.** | Every test closes its listener and connections in a `finally`. The sanitizer failing is the check, not a nuisance to disable. |
| **`writeFrame` loops forever** if a socket returns 0 written bytes repeatedly. | A write that returns 0 raises rather than retrying. |
| **The encoder's new home is contested at review** — `resp.ts` vs a private method. | Decided: `resp.ts`. Both audits affirmed it — FR-007 asserts exact frame bytes, which a private `sendCommand` can only be tested through by bracket-access or a live socket, and the package has no such harness. Recorded in §12. |
| **#138 lands before #141 and silently regresses this fix** — a shared socket over unserialized `sendCommand` reintroduces the desync. | The #138-ordering constraint is posted on both issues (§10 F3), and the §6 invariant now carries the serialization clause. Whether to *build* serialization here is the open question in §12. |

## 10. Architecture audit

`architect-expert` on the plan, read-only, before any code. Read the open `domain:session`
backlog first (#138, #139, #141, #142, #143). **Verdict: FAIL — 3 HIGH, 1 MEDIUM, 2 LOW.** None
blocks the design; all are plan/backlog edits, applied below.

| # | Sev | Finding | What was done |
| :-- | :-- | :--- | :--- |
| F1 | HIGH | SC-004's "at least one test fails" lets FR-008/FR-009 — the only end-to-end and injection tests — ship without ever demonstrating they can go red, the exact §9 top risk. | **SC-004 rewritten**: every FR-007/008/009 test must fail under the mutation, each recorded by name. |
| F2 | HIGH | §5 row 1 read as binding forbids the verifying fake server FR-008 depends on; the "compliant" fix (import `encodeCommand` into the test) makes the oracle circular. | **Added decision row 6** homing the test oracle at `tests/resp_server.ts`; **FR-007** now requires the expected bytes as a literal. |
| F3 | HIGH | **Corrects #141**: cross-user takeover is not reachable today — the driver is per-request (`middleware.ts:64`), so #138 is what makes it reachable. Neither issue records the ordering. | **§1 and §6 restated** as conditional on #138; **ordering constraint** to be posted on #138 and #141. Independently **verified by probe** this session. |
| F4 | MEDIUM | Row 5 homed reply-parsing at `redis.ts` "unchanged", which #139's author will read as "the right home" — leaving `resp.ts` and `redis.ts` modelling `$N` two ways permanently. | **Row 5 reworded**: `resp.ts` is the right home, not yet moved; #139 moves it. A bullet to add to #139. |
| F5 | LOW | FR-001 said "7 call sites", listed six; the 7th grep line is the declaration. | **FR-001 corrected** to 6 sites / 13 arguments, with the line numbers. |
| F6 | LOW | FR-006/FR-011 had no decision row; no test path named. | **Added decision row 7** (public surface); test path `tests/resp.test.ts` named. |

**Blast radius, counted (architect):** 1 file created, 1 modified, 6 lines replaced
(`redis.ts:74-79`), 6 call sites routed through the new encoder, 1 `conn.write` replaced, **0**
public-export or driver-API changes, **0** `deps.policy.jsonc` edits (verified: `@std/io`/`writeAll`
appear nowhere in the workspace). Containment claims hold; the risk is test falsifiability, not
reach.

**Clean-verdict coverage:** the architect read `plan.md` whole, `redis.ts`/`middleware.ts`/
`drivers/mod.ts`/`mod.ts`/`store.ts:60-124`/`deno.json`/`deps.policy.jsonc`, and the bodies of
#138/#139/#141/#142/#143. It did **not** read existing test bodies (beyond the Redis test name),
`session_guard.ts`, the other drivers, or run Redis.

## 11. Security audit

`security-expert` on the plan, read-only, in parallel with the architecture audit. Same backlog
pre-read. **Verdict: needs_followup — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 1 LOW.** The injection fix
itself is sound; two design gaps to fold in.

**Two adversarial CRITICAL traps were checked and did not fire** — recorded so the reasoning is
inherited, not re-derived:

- **Embedded CRLF in a length-correct bulk string is safe.** `encodeCommand` always emits `*N\r\n`
  first, so Redis stays in the multibulk parser, which reads each argument by *count* and never by
  delimiter. The inline parser that treats CRLF as a boundary is reached only when the first byte
  is not `*` — which the encoder never produces. So FR-005's "never escape argument content" is
  safe for RESP2 as Redis parses it, contingent only on the length being byte-correct (FR-001).
- **Nothing on the wire changes for pure-ASCII arguments.** Every code point 0–127 is 1 UTF-16
  unit and 1 UTF-8 byte, so `$len` is byte-identical; divergence begins at code point ≥128. `$0`
  empty-string frame identical both ways.

| # | Sev | Finding | What was done |
| :-- | :-- | :--- | :--- |
| S1 | MEDIUM (→HIGH post-#138) | `writeFrame`/`sendCommand` hold no mutex; two commands on a shared socket interleave their frames. Unreachable today (per-request socket); reintroduces the desync when #138 shares it. | **§6 invariant** now carries the "serialized over the socket" clause; **open question in §12** on whether to build serialization here or block #138 on it. |
| S2 | MEDIUM (→HIGH post-#138) | FR-004 raises on partial write but leaves `this.connection` cached and half-written; the next command inherits a desynced socket. `this.connection` is nulled only in `close()`. | **Added FR-004a**: a failed write discards the connection before propagating. |
| S3 | LOW | FR-001 "7 call sites" — same miscount as F5. | Corrected (one edit, both findings). |

**The surface enumeration is correct** (security): the session **key** is bounded by #137's
`/^[0-9a-f]{64}$/` (ASCII, byte==unit); the **value** (`JSON.stringify(data)`) and the **AUTH
password** are the unbounded paths the fix closes; `db`/`lifetime` are ASCII digits. No new
authorization surface; the fix correctly does **not** add an id check inside `encodeCommand`
(row 4 keeps that one home). The §1 desync consequence is confirmed to have a *second*,
independent cause — the 4096-byte single read + naive `parseResponse` — which is **#139's**, not
closed here; the plan is honest that SC-003 measures the request direction only.

**Clean-of-HIGH coverage:** the full byte-length design (FR-001–FR-011), RESP2 multibulk parse
semantics for length-correct CRLF-bearing arguments, the pure-ASCII no-change claim, every
caller-controlled path into `sendCommand`, and reconciliation against #138/#139/#141. No code
(none exists); #139's read path not re-audited beyond confirming the residual.

## 12. Open questions

**Q1 — The one genuine fork: fix the socket-serialization gap (S1) in this branch, or defer it to
#138?** Asked at stop 1; the two audits raise it from opposite sides and it is the only decision
with materially different work.

> **Answered 2026-09-01 — defer to #138.** #141 stays scoped to the byte-accurate encoder and the
> full-write loop. Serialization is a property of the shared socket #138 introduces, not of
> encoding, so it lives with #138. A hard requirement is posted on #138 (it may not memoize the
> driver without a per-connection command queue) and the §6 invariant carries the "serialized over
> the socket" clause so the constraint is visible at the code, not only on the board. This branch
> does **not** add a mutex.

**Decided without asking** (code or a settled decision already answered these — one line each so a
wrong assumption is visible):

- **Encoder/writer home = `packages/session/drivers/resp.ts`.** Both audits affirm; testability
  requires it. (2026-09-01)
- **FR-004a (discard connection on partial-write failure) is in scope for this branch.** It rewrites
  the write path already, and the discard is the same invariant reached from the failure side.
  (2026-09-01)
- **The #138-before-nothing ordering is posted on #138 and #141, not asked.** It is a backlog fact
  the audits established, not a design choice. (2026-09-01)
