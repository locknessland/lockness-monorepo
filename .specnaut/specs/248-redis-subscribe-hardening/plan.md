# Plan: Subscribe-connection hardening for `@lockness/redis`

**Branch**: `248-redis-subscribe-hardening` | **Date**: 2026-09-06 | **Backlog items**:
[#286 — a never-settling PSUBSCRIBE write stalls the activation silently](https://github.com/locknessland/lockness-monorepo/issues/286) ·
[#287 — three latent defects from the #245 review gates](https://github.com/locknessland/lockness-monorepo/issues/287) ·
[#296 — a throwing pmessage handler crashes the process](https://github.com/locknessland/lockness-monorepo/issues/296)

**Three items, one branch.** Not a convenience: #286 and #287 both change
`packages/redis/resp.ts` (a write deadline, and strict length parsing), and #286 and #296 both
change `RedisSubscribeConnection`'s activation/read machinery. Two branches would conflict in
`resp.ts` and would run the same suite twice. Each issue's `## Out of scope` already partitions the
work between them, so the seams are agreed; what was not agreed was doing them apart.

---

## 1. Why this exists

`@lockness/redis`'s subscribe connection has one job — stay subscribed, or fail loudly enough that
the retry machinery notices. Three ways it currently fails quietly, all verified against the tree on
2026-09-06.

### The write leg is the one step no deadline covers (#286)

#245 bounded the dial, the `AUTH`/`SELECT` handshake and the read loop with a liveness window.
`#activate` then awaits `this.#write(conn, …)` once per pattern (`subscriber.ts:512`), `#write`
(`:404`) chains onto `writeFrame` (`resp.ts:262`), and `writeFrame` is:

```ts
while (offset < frame.byteLength) {
    const written = await conn.write(frame.subarray(offset))
```

No deadline. A socket that accepts the connection and then never drains leaves `#activate`
suspended: **no error, no retry, no log line.** The `catch` that calls `#scheduleRetry` is never
entered, so every machine #245 built is bypassed by the one leg it did not cover. The contrast is in
the same file — `readReply` takes a `timeoutMs`; `writeFrame` takes nothing.

**And the queue outlives the socket.** `#writeChain` (`:247`) is per-connection state that
`#discardSocket` does not reset, so a write queued against a dead socket sits ahead of every later
write — including the recovered socket's re-`PSUBSCRIBE`. The recovery queues behind the thing it is
recovering from.

### A throwing handler does not lose delivery — it kills the process (#296)

`#readLoop` (`:661`) wraps only `readReply` in its `try`. The dispatch is outside it:

```ts
reply = await readReply(conn, this.#livenessMs)   // inside try
...
this.#dispatch(reply)                              // :693 — OUTSIDE
```

`#dispatch` ends with `handler(topic.value, payload.value)` — an **application-supplied** callback,
invoked unguarded. Reproduced against a live broker:

```
error: Uncaught (in promise) Error: app handler exploded
    at RedisSubscribeConnection.#dispatch (packages/redis/subscriber.ts:710:22)
    at RedisSubscribeConnection.#readLoop (packages/redis/subscriber.ts:693:27)
```

The process **exits with code 1**. One bug in one app broadcast handler takes down the whole server
and every unrelated connection on it. The payload arrives from a peer, so the *trigger* is remote
input even though the throw is the app's own defect.

### Three latent defects, each of a class that has already bitten (#287)

- **`discard()` cancels a dial it does not own.** `connection.ts:360` guards `connection`
  (`if (this.connection === conn)`) and then clears `connectPromise` **unconditionally** on the very
  next line. Unreachable before #245; the retry machinery makes concurrent `#activate` routine, so
  this is the next guard to give way — and its failure mode is a second socket.
- **RESP length prefixes are parsed with `Number()`.** Measured, not asserted — what a length prefix
  is currently accepted as:

  | Line | `Number()` | Accepted as a length? |
  | :--- | :--- | :--- |
  | `""` | `0` | **yes — 0** |
  | `" "` | `0` | **yes — 0** |
  | `"0x10"` | `16` | **yes — 16** |
  | `"1e3"` | `1000` | **yes — 1000** |
  | `"+5"` | `5` | **yes — 5** |
  | `"0b11"` | `3` | **yes — 3** |
  | `"5."` | `5` | **yes — 5** |
  | `"1_0"` | `NaN` | no |
  | `".5"` | `0.5` | no |

  RESP2 mandates decimal digits. `NaN`/`Infinity`/negative are already rejected; this is about what
  slips **through**, and every row above reads the wrong number of bytes off the wire and desyncs
  the socket without raising.
- **Two test helpers monkey-patch global `console.warn`.** `captureWarnings` (`tests/subscriber.test.ts:44`)
  restores in a `finally` and is safe. `liveWarnings` (`:425`) returns a `restore` the caller must
  remember to call — **there is no `finally`**, so a test that throws between the two leaves
  `console.warn` patched for every test after it in the file. That is a defect today, not only a
  trap for `--parallel`.

## 2. User scenarios

### US1 — A stalled write fails the activation instead of hanging it (P1)

**Given** a broker that accepts the connection and then stops draining bytes
**When** `#activate` re-issues a `PSUBSCRIBE`
**Then** the write fails within a bounded time, the socket is discarded, and the activation retries
through the same `#scheduleRetry` path as any other failure — with a log line naming the stall.

### US2 — A recovered socket's writes never queue behind a dead one's (P1)

**Given** a write queued against a socket that is then discarded
**When** a new socket activates and re-issues its patterns
**Then** the new writes are not delayed by the old queue, and nothing is written to the dead socket.

### US3 — One application handler cannot take down the process (P1)

**Given** a subscriber whose pmessage handler throws
**When** a matching frame arrives
**Then** the exception is caught and logged at ERROR naming the pattern, the read loop continues,
and delivery to that pattern and every other pattern on the connection is unaffected.

### US4 — `discard` of an old socket does not cancel a newer dial (P1)

**Given** a dial in flight that has already replaced an earlier socket
**When** the earlier socket is discarded
**Then** the in-flight dial's single-flight is intact and no second socket is opened.

### US5 — A malformed length prefix is a framing fault, not a silent mis-read (P2)

**Given** a RESP frame whose `$` or `*` length is not a decimal-digit string
**When** it is parsed
**Then** it raises `RespFramingError` rather than being coerced to a number.

### Edge cases

- **A dribbling socket.** One byte accepted per second keeps a *per-write* timer alive forever. The
  deadline must be **per frame**, wall-clock — the same reasoning `ReplyReader` already records for
  reads ("a per-REPLY wall-clock deadline, not a timer reset on every `conn.read`").
- **A write that completes after its deadline fires.** The frame is partially on the wire, so the
  socket is desynced and must be discarded, not reused.
- **`discard` called with a socket that is neither current nor the dial's.** Must be a no-op beyond
  closing it.
- **A handler that throws on *every* frame.** Logging per frame could itself become the flood. Named
  in FR-009.
- **`-1`** stays a legal length (nil bulk / nil array) and must survive the strict parser.

## 3. Requirements

- **FR-001**: `writeFrame` accepts a `timeoutMs` and enforces it as a **per-frame wall-clock
  deadline**, not per `conn.write`. **Its reach is Q1 in §12** — the parameter's default is what
  decided (2026-09-06): **the parameter is optional and `undefined` means unbounded.** That is
  today's behaviour byte for byte at every call site that does not opt in, and only
  `RedisSubscribeConnection` opts in. An earlier draft said "defaulted from a named constant"
  without noticing that `exchange` (`connection.ts:110-115`) passes its `timeoutMs` to `readReply`
  **only** — so a default would have landed on `AUTH`, `SELECT`, `QUIT` and every
  `RedisClient.command` invisibly, and bypassed the handshake's per-step `#remaining` threading,
  restoring the multiplication #274 fixed (45s → up to 105s worst case).
- **FR-001a**: The stall error **must not name a byte offset as if it were exact.** An abandoned
  `conn.write` cannot be cancelled and may still be advancing `offset` after the deadline fires, so
  the message says how many bytes were confirmed written *before* the deadline, and says that is a
  lower bound. The existing `written <= 0` error keeps its exact offset — it has one.
- **FR-002**: The write deadline is `Math.min(livenessMs, WRITE_STALL_CEILING_MS)`, with the ceiling
  a named constant beside the other cadence defaults. **Not the liveness window as-is.** The two
  legs measure different physics: the read window is a tolerance for *silence*, correctly a function
  of `keepaliveMs` (`subscriber.ts:68-76` — "three keepalive intervals, so two consecutive lost
  pongs are tolerated"); the write budget is a tolerance for *backpressure* on a ~40-byte frame that
  either enters the send buffer or does not. `#assertCadences` bounds the ratio and finiteness but
  has **no upper bound**, so an operator who raises `keepaliveMs` to 60s is forced to
  `livenessMs ≥ 120s` and has thereby set write-stall detection to two minutes without touching
  anything named "write". One operator knob, one derived value, one ceiling.
- **FR-003**: **Two obligations, and they are not the same one.**
  1. *Discard* — a write that fails, stall or fault, leaves the socket desynced and **must be
     discarded by whichever path observed it, the keepalive included**.
  2. *Schedule* — routing to `#scheduleRetry` stays the activation path's job only. The keepalive's
     `.catch` (`subscriber.ts:465-475`) deliberately does not schedule, because "the read loop on
     this same socket is about to fault, and two triggers would race to reconnect".

  Fusing them, as an earlier draft did, obliges the keepalive to do something it refuses for a good
  reason. Separating them is required because FR-001 breaks that catch's *premise*: it decided the
  read loop would also see the fault, which is true of a socket error and **false of a timeout** —
  the socket is alive and merely slow, the read loop keeps draining, and a partial `PING` sits on
  the wire for the next `PSUBSCRIBE` to be spliced onto. That is the "spliced but still valid"
  outcome `#writeChain`'s own comment describes as "silently dropped forever". Make it mechanical,
  not remembered: a deadline failure raises a type that *means* discard — `RespFramingError` already
  means "bytes remain on the wire" and `client.ts:198` already routes on it.
- **FR-004**: The write chain is **per socket generation**, not a field that gets reset. Two
  mechanisms, and both are needed:
  1. The chain is paired with the generation it belongs to, mirroring `#keepaliveTimer` /
     `#keepaliveConn` exactly. `#discardSocket` clears it **conditionally**, `if (chainConn === conn)`
     — the timers beside it are already conditional, and the comment at `subscriber.ts:195-203`
     records that the unconditional version was a live defect ("discarding a STALE socket while a
     newer one was live disarmed the live one's keepalive"). A blanket reset is that shape one field
     over, and it deletes the live socket's write serialization — the thing that stops two writes
     splicing into a still-valid truncated frame.
  2. The generation check runs **inside the queued closure**, because clearing a field does not
     cancel a write already chained behind an in-flight one.
- **FR-004a**: **A write abandoned by a generation change REJECTS.** It is never left unsettled.
  Nothing in this feature may produce a promise that neither resolves nor rejects — that is #286's
  own defect (an activation that neither completes nor fails) relocated into the queue reset, and
  "drop the pending work" is the obvious way to implement "never written to the dead socket".
- **FR-005**: The call into an application handler is contained: the exception is caught, logged at
  ERROR, and the read loop continues. **This quantifies over every foreign call in the read path**;
  the enumerating search is `grep -n 'handler(' packages/redis/subscriber.ts`.
- **FR-005a — what that log line may carry.** The pattern via `safeForLog`, and the error via
  `renderError`. It **must not contain `topic` or `payload`, encoded or not.** `safeForLog` is a
  log-injection encoder, not a redactor — it encodes control characters and truncates at 512 — and a
  realtime **control** payload is a signed `{kind, target, origin, ts, nonce, mac}` frame that fits
  well inside that. Logging it writes a replayable authenticated `evict` into the log store, and
  `ControlReplayWindow` is per-process, so a restarted instance holds no nonce and the freshness
  window is the only remaining guard. `renderError` is required rather than optional for the error
  itself, because an app handler's message routinely embeds the payload it choked on.
- **FR-005b — the precondition that makes containment safe, stated rather than implied.** Every
  security-relevant consumer of this seam has a durable backstop: `@lockness/realtime`'s revocation
  reconcile. Today a throw in the control chain kills the process — brutal, but fail-*closed*: the
  un-revoked socket dies with it. After FR-005 the process lives and that one eviction is dropped
  until the reconcile tick recovers it. A consumer without such a backstop must not rely on this
  catch, and the log line is therefore a security-control failure: ERROR, with a stable prefix an
  alert can match.
- **FR-006**: `AuthenticatedConnection.discard(conn)` clears the dial state only for the generation
  being discarded, by **pairing the promise with its socket** rather than inferring ownership.
  **The rationale an earlier draft gave for this was wrong and is retracted**: it claimed
  `this.connection === conn` was insufficient because a replacement dial could be in flight while
  `connection` still pointed at the old socket. `connect()` short-circuits on
  `if (this.connection) return Promise.resolve(this.connection)` (`connection.ts:214`), so a new dial
  can only *start* once `connection` is null — that state is unreachable. The real reasons to pair:
  the simple guard is correct only by an inference about a short-circuit two methods away; a future
  path that nulls `connection` independently reintroduces the cancellation silently; and
  `connectPromise` is **never cleared on success** (only in `p.catch`, `:258-260`), so the two fields
  describe the same generation through different mechanisms at different instants. Pairing removes
  the inference.
- **FR-007**: RESP `$` and `*` length prefixes are accepted only as `-1` or a decimal-digit string.
  One home, both call sites. **And the two bytes after a bulk body must be verified as CRLF** —
  `resp.ts:489` consumes them unchecked today, which is the other half of the same trust: FR-007
  stops the client believing a bad length, this stops it believing a frame ended where it did not.
- **FR-008**: No test helper leaves global `console.warn` patched if its body throws. This is a
  **test-integrity control, not housekeeping**: a helper left patched makes every later assertion
  about log output pass for the wrong reason — including the assertions FR-005a and FR-009 depend
  on.
- **FR-009 — decided, not deferred.** The first throw per pattern **per socket generation** is
  logged in full at ERROR; further throws inside a fixed window collapse into one line carrying a
  suppressed count, and the counter resets with the window. **The handler is never detached** — a
  containment that disarms the seam turns a recoverable application defect into permanent silent
  loss, which is the reasoning `#fireReconnect` already records at `subscriber.ts:637-641`. The
  per-generation reset is what stops a suppression window hiding FR-005b's security-control failure.
  Unbounded logging is not an option on the table: the peer chooses the frame rate, so "log every
  time" is a peer-driven flood, and a blocked stderr back-pressures the read loop into missing its
  liveness window, discarding, reconnecting — and resuming the flood on the new socket.
- **FR-010**: `writeFrame`'s `timeoutMs` must be a positive finite number; anything else raises
  `RangeError`, in `#assertCadences`' vocabulary. `readReply`'s existing parameter has the identical
  gap; §8 records whether it is fixed here or left, so the asymmetry is a decision.

## 4. Success criteria

- **SC-001**: Every activation terminates — in a live socket or a scheduled retry — for every fault
  injected at every leg. **Five legs, not four**: dial, handshake, write, read, and
  discard-during-write.
- **SC-002**: No queued write outlives the socket it targets. The test queues a write against a
  socket that is then discarded, and asserts **both** that the successor's re-subscribe is not
  delayed **and that the abandoned write's promise rejects**.
- **SC-002a**: Discarding a stale generation while a newer one is live leaves the newer one's write
  serialization intact.
- **SC-003**: A subscriber whose handler throws keeps receiving and the process survives — measured
  against a live broker, because the failure mode is a process exit an in-process double cannot
  reproduce. The test publishes a payload containing a CR, an ESC and a marker string, and asserts
  **none of the three appears in the captured log line**.
- **SC-003a**: A timed-out keepalive write discards the socket rather than leaving a partial frame
  on one the read loop keeps using.
- **SC-004**: N concurrent activations open exactly one socket, including when a discard of the
  previous generation interleaves.
- **SC-005**: Every row of §1's length-prefix table raises rather than being coerced; `-1` and plain
  decimals still parse; a bulk body followed by non-CRLF raises.
- **SC-006**: Every guard added here is mutation-verified — the covering test goes RED when the
  guard is removed, **and the mutation is proved to have actually executed**. A mutation whose file
  did not change reads as a result.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| How long one frame may take to write | `packages/redis/resp.ts` — `writeFrame`'s `timeoutMs` parameter | A second timer in `#write`; a caller computing its own budget; a literal ms at a call site. **`writeFrame` must own it**, for three reasons: only its loop holds `offset` (FR-001a needs it); `resp.ts`'s `@fileoverview` already owns "a frame is fully on the wire before a reply is read", so a timer in `subscriber.ts` would make that a second decider; and symmetry with `ReplyReader`'s per-reply deadline is what lets both legs reason identically about one socket. |
| What that deadline is worth in ms | `packages/redis/subscriber.ts` — `Math.min(#livenessMs, WRITE_STALL_CEILING_MS)`, computed once | A `writeMs` config option — **rejected**: a second knob needs its own validation, its own documented relation to `keepaliveMs`, and its own way to be set wrong. Also rejected: using `#livenessMs` raw, which silently couples write-stall detection to a keepalive the operator changed for unrelated reasons. |
| **Which failures route to `#scheduleRetry`** | `packages/redis/subscriber.ts` — `#scheduleRetry` itself, which is idempotent: it returns early when `#retryTimer !== undefined` | A caller-side "am I allowed to schedule" rule. **This row was wrong in the first draft** and said the keepalive must not schedule, on the grounds that two triggers would race. Implementation proved otherwise in both directions: discard-alone leaves the connection permanently deaf (`#readLoop`'s `while` goes false, so the loop exits quietly and nothing re-dials), and the race the prohibition guarded against is already answered inside `#scheduleRetry`. So every observer both discards **and** schedules, and the idempotence — not a rule about who may call — is what stops a second dial. The file's own history is why the row exists at all: a re-dial path once came to sit outside the backoff "without anything in the log looking wrong" (`:612-615`). |
| Whether a write may target this socket | `packages/redis/subscriber.ts` — `#write`, the single funnel both writers pass through | A check in `#activate` only, leaving the keepalive unguarded. Note the keepalive **already** carries `this.conn.socket !== conn` at `:461`; that clause is deleted when the check moves into `#write` (its `this.closed` clause stays, since it also skips an allocation). Leaving both is the duplication. |
| When a socket is finished | `packages/redis/subscriber.ts` — `#discardSocket` | Any unconditional clear. Every clear there is guarded on generation ownership; the write chain joins them **as a pair**, not as a blanket reset. |
| Which dial a `connectPromise` belongs to | `packages/redis/connection.ts` — one field pairing the promise with its socket | Inferring ownership from `this.connection === conn`, which is correct today only via a short-circuit two methods away. |
| What a valid RESP length prefix is, and where a frame ends | `packages/redis/resp.ts` — one parse function | A second regex at the `*` site; a `Number()` left at either; the CRLF check living apart from the length check. |
| That a foreign callback cannot escape into the read loop | `packages/redis/subscriber.ts` — `#dispatch`'s guard around the handler call | A `try` in `#readLoop` around `#dispatch`, which would also swallow the driver's own parsing faults. |
| **What a containment log line may carry** | `packages/redis/subscriber.ts` — that same catch | Any handler-supplied context; `topic`; `payload`. The rule is a denial list, not an encoder choice — see FR-005a. |
| **What a repeatedly-throwing handler does** | `packages/redis/subscriber.ts` — the per-pattern, per-generation counter beside the catch | A caller-side throttle; a detach. See FR-009. |
| How a test observes `console.warn` | `packages/redis/tests/subscriber.test.ts` — `liveWarnings`, returning a `Symbol.dispose` binding used with `using` | Any helper that hands the caller a `restore` to remember. **A first attempt at this row kept the handback and added a `restored` flag**; the flag guards a double restore, which was never the failure mode, and the review gate measured the accompanying test passing identically against the unfixed helper. The language running the disposer on scope exit is the fix; a flag is not. |

## 6. Technical context

**Language/Version**: TypeScript on Deno
**Primary Dependencies**: `@lockness/contract` (lifecycle), no others
**Storage**: none — sockets and in-memory state
**Testing**: `deno test`; `packages/redis/tests/subscriber.test.ts` with a `FakeServer`, plus the
live-broker suite gated on `LOCKNESS_REDIS_INTEGRATION=1`
**Target Platform**: Deno server
**Project Type**: framework library
**Performance Goals**: unchanged — the deadline adds one timer per frame, cleared on settle
**Constraints**: `@lockness/redis` is not published on JSR (checked 2026-09-06) but IS consumed
in-repo by **five packages across 13 files** — counted with
`grep -rl '@lockness/redis' packages/ app/ config/`, after an earlier draft of this plan said
"two" from memory:

| Package | Uses |
| :--- | :--- |
| `@lockness/session` | `RedisClient`, `credentialFingerprint` — driver, registry, 3 test files |
| `@lockness/realtime` | `RedisSubscribeConnection` **and** `RedisClient` |
| `@lockness/queue` | `RedisClient.command` — driver, manager |
| `@lockness/core` | `new redisMod.RedisClient` via dynamic import — scheduler locks, bootstrap step |
| `@lockness/redis` | itself |

Queue's and core's suites go in the gate alongside realtime's and session's; an earlier draft named
only the last two. The `onReconnect` seam's contract must not change — `@lockness/realtime` depends
on it, and #290 is already open against its timing.
**Scale/Scope**: 3 production files, 1–2 test files; the consumer surface is what Q1 in §12 decides.

### Domain model

Merged from the two issues that carry one, and reconciled:

- **Bounded context**: `redis`
- **Vocabulary**: `Activation` — dial → handshake → re-issue every `PSUBSCRIBE` → arm keepalive →
  start read loop. `Write leg` — the re-issue step. `Socket generation` — one `Deno.Conn`'s lifetime
  between `connect()` and `discard`. `Single-flight` — N concurrent `connect()` calls open exactly
  ONE socket. `Framing fault` — a reply whose declared length cannot be trusted, leaving the socket
  desynced. `Foreign call` — an application callback invoked from inside the read loop.
- **Entities**: `RedisSubscribeConnection` [aggregate root] — activation, retry, keepalive, read
  loop, write queue for one socket. `AuthenticatedConnection` [aggregate root] — socket identity,
  single-flight dial, discard.
- **Value objects**: `LivenessWindow(ms)` — ≥ 2× keepalive. `BulkLength(n)` / `ArrayLength(n)` —
  non-negative integer, or `-1` for nil.
- **Invariants**:
  - Every activation terminates — in a live socket or a scheduled retry. An activation that neither
    completes nor fails is indistinguishable from a deaf connection.
  - No queued write outlives the socket it targets, because the queue is ordered and a dead head
    blocks the recovery behind it.
  - `discard(conn)` affects only the generation `conn` belongs to.
  - A length prefix is accepted only as decimal digits (or `-1`).
  - **A fault raised by foreign code is contained at the boundary that invoked it.**
  - A test never mutates global state it does not restore.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1. No direct `hono` import | pass | Not touched. |
| 2. JSR-only, declared per package | pass | No dependency change. |
| 3. No `any` in exported APIs | pass | `writeFrame` gains a `number` parameter. |
| 4. Tailwind v4 syntax | pass | No UI. |
| 5. Pre-completion gate | pass | Widened: queue's and core's suites join realtime's and session's, per §6. |
| 6. Never hand-edit `deno.lock` | pass | No dependency change. |
| 7. JSDoc on public APIs | pass | `writeFrame` is exported; its `@param`, `@throws` and `@example` all change. |
| 8. MVC layering | pass | Infrastructure/adapter layer only. |
| 9. One category per commit | pass | **Three `fix` commits, not one** — see below. |
| TDD | pass | Every FR gets its failing test first; SC-006 makes that checkable rather than claimed. |
| No silent catches | **watch** | FR-005 adds a `catch` around a foreign call. It logs at ERROR and does not re-throw — permitted — and FR-009 is what stops the log becoming the new fault. FR-005b names the precondition. |

**Commit shape, decided here so `implement` does not re-derive it.** One category per commit permits
three `fix` commits and this needs three, in this order:

1. `fix(287): guard the single-flight on discard` — **first, because it is the prerequisite.**
   FR-001 makes stale discards routine (§9 row 3), which is what makes #287's bullet 1 fire for
   real. #287's own Notes ask for this ordering.
2. `fix(286): bound the write leg and scope the write chain to its socket`
3. `fix(296): contain a throwing pmessage handler`

Then `test(...)` and `docs(...)`. **Each `fix` carries its own `Closes #N`** — GitHub's close keyword
is per issue, so one commit saying "Closes #286, #287 and #296" closes only #286 and leaves the
other two open on the board with nothing looking wrong.

### Complexity tracking

No violations. Two judgement calls, both recorded: FR-002's derived-with-a-ceiling budget (§5 row 2)
and the three-issue branch (header).

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `writeFrame` signature | **yes** | Gains an **optional** `timeoutMs`. Exported from `@lockness/redis` at `mod.ts:24`. `undefined` preserves the current unbounded loop exactly, so the two rows below are "no". |
| `exchange` / the command path | **no** | Untouched, by decision. `exchange` passes `timeoutMs` to `readReply` only, so an *unpassed* `writeFrame` deadline changes nothing there. This is the whole reason the parameter is optional rather than defaulted. |
| `@lockness/session`, `queue`, `core` scheduler | **no** | No API change and no behaviour change — they reach `writeFrame` only through `exchange`, which does not opt in. Their suites still run in the gate as regression cover. |
| `RedisSubscribeConnection` public API | no | Same constructor, `psubscribe`, `close`, and the `onReconnect` seam. |
| `AuthenticatedConnection` public API | no | `discard` keeps its signature; its internal guard changes — which also reaches `RedisClient`'s two `discard` sites (`client.ts:198`, `:244`). |
| RESP parse behaviour | **yes** | Frames previously coerced now raise `RespFramingError`. No valid RESP2 frame is affected. |
| Observable logging | **yes** | New ERROR on a throwing handler (content bounded by FR-005a); new WARN/ERROR on a stalled write. |
| `readReply`'s unvalidated `timeoutMs` | **no** | Left as-is, deliberately: FR-010 bounds the parameter this feature adds, and widening to a parameter this feature does not touch would put a second change on the command path. Recorded so the asymmetry is a decision. |

**Counted call sites**, by search rather than estimate: `writeFrame` — 2 production
(`connection.ts:113` inside `exchange`, `subscriber.ts:405` inside `#write`), 4 test across 3 files,
1 surface assertion in `session/tests/resp.test.ts`. Writers through `#write` — 2, with opposite
failure handling (FR-003). `discard` — 3 production, 7 test. RESP length parses — 3, of which FR-007
covers 2 (`$` and `*`; the `:` integer stays, §12).

### Documentation (this feature)

```text
.specnaut/specs/248-redis-subscribe-hardening/
├── plan.md
└── tasks.md
```

### Visual Prototyping with Claude Artifacts

Nothing to prototype — a socket deadline, a queue generation, a `catch`, and a parser. No client
surface.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A write deadline set too tight tears down healthy sockets under load | FR-002's value is derived from the already-validated liveness window and capped, so it cannot be set directly and cannot exceed the ceiling. |
| The deadline is set too *loose* by an operator tuning something else | The ceiling. Raising `keepaliveMs` for a quiet bus forces `livenessMs` up by `#assertCadences`' ratio rule, and without a cap that silently becomes the write-stall budget. |
| A stale discard damages the live socket's write serialization | FR-004's conditional clear, mirroring the guards already beside it. The unconditional version of exactly this was a live defect once (`subscriber.ts:195-203`). |
| A timed-out keepalive write leaves a partial frame on a socket nobody discards | FR-003 splits discard from schedule, and makes the discard obligation carry in the error's *type* rather than in a comment. SC-003a. |
| An abandoned write leaves `#activate` awaiting forever | FR-004a — reject, never drop. This is #286's own defect relocated, and it is the most likely way to implement FR-004 wrongly. |
| The containment `catch` swallows a fault that is the driver's | The guard wraps **only** the `handler(...)` call, never `#dispatch`'s parsing. §5 row 8. |
| The containment log discloses a signed control frame | FR-005a's denial list. |
| A throwing handler floods the log | FR-009, decided rather than deferred. |
| Strict length parsing rejects a frame a real broker sends | No Redis-family server formats a length with anything but `%lld`. The live-broker suite is the check. The residual is a *non-Redis peer in the path* — a translating proxy, or this repo's own `FakeServer` — which is test fidelity and **confirms #285**. |
| The `onReconnect` seam's timing changes and breaks realtime | Not touched; out of scope by #286 and #290 both, and realtime's suite is in the gate. |

**One benefit worth recording rather than only the risks.** FR-006 slightly reduces credential
exposure: today's unconditional `connectPromise = null` can cause a spurious second dial, and with
`tls` defaulting to `false` each dial re-sends `AUTH` in cleartext. One fewer spurious dial is one
fewer cleartext credential on the wire.

## 10. Architecture audit

*`architect-expert` against this document, before any code existed. Verdict: **fail** — 0 critical,
3 high, 5 medium, 3 low. Every finding is folded in below.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | HIGH — FR-004's unconditional `#writeChain` reset damages the **live** generation, and FR-001 is what makes the stale-discard path reachable | Plan changed: FR-004 is now per-generation with a conditional clear **and** an in-closure guard — two mechanisms, where the draft named one. The audit constructed the reachable sequence: realtime psubscribes twice, activation A stalls on pattern 2, the read loop faults and retries (backoff can fire in 1 ms via `Math.max(1, …)`), then A's deadline fires and discards `c1` while `c2` is live. New SC-002a. |
| A2 | HIGH — FR-003 obliges a discard the keepalive path deliberately refuses, and FR-001 makes a partial frame the routine outcome there | **Verified independently** at `subscriber.ts:465-475`. Plan changed: FR-003 splits discard from schedule; the discard obligation is carried by the error's type rather than by a comment. New SC-003a. The audit's point is that the keepalive's reasoning was sound only while every write failure was a fault the read loop would also see — a timeout is not. |
| A3 | HIGH — a *defaulted* `writeFrame` deadline reaches `exchange`, un-fixing #274's handshake bound and changing every Redis command in 5 packages | **Verified independently**: `exchange` passes `timeoutMs` to `readReply` only (`connection.ts:110-115`), and the handshake threads `#remaining(deadline)` per step precisely to stop multiplication. Escalated to **Q1** — the fix expands scope into `client.ts`, which both #286 and #287 scope out, so it is the user's call and not an editorial one. |
| A4 | MEDIUM — FR-002 derives a backpressure budget from a silence budget, unbounded above | Plan changed: `Math.min(#livenessMs, WRITE_STALL_CEILING_MS)`. The audit attacked the plan's own "one knob is better than two" and agreed with it — the defect was the *derivation*, not the knob count. |
| A5 | MEDIUM — FR-006's stated rationale describes a state unreachable through `connect()`/`discard()` | **Verified independently** at `connection.ts:214` — `connect()` short-circuits on a non-null `connection`, so a replacement dial can only start once it is null. My rationale was wrong; the requirement stands on the true reasons, now written out, including that `connectPromise` is never cleared on success. |
| A6 | MEDIUM — no §5 row for FR-003, and FR-009 defers a decision the table exists to record | Plan changed: both rows added, and FR-009 **decided** — first per pattern per generation in full, then a collapsed count, never detach. |
| A7 | MEDIUM — the blast radius is understated by three packages and eleven files | **Verified independently** by grep: 5 packages, 13 files. §6 corrected, and queue's and core's suites added to the gate. |
| A8 | MEDIUM — one branch is right; "one `fix` commit" is not, and it leaves the board stale | Plan changed: §7 names three `fix` commits in dependency order, each with its own `Closes #N`. The audit's board point is the same one this repo has already been bitten by — the close keyword is per issue. |
| A9 | LOW — the `:` integer `Number()` is left beside a strict parser with nothing in the code saying why | Accepted: a one-line comment at `resp.ts:455` naming it deliberate, in the convention #291 prescribes. |
| A10 | LOW — the generation check gets a second home the plan does not close | Plan changed: §5 row 4 now says `:461`'s socket clause is deleted when the check moves into `#write`. |
| A11 | LOW — per-generation state is a data clump with four members and no name | Accepted as a **forecast, not work**: this is the third field to need the same guard, and doing the extraction here would make the three `fix` commits unreviewable. Filed as a follow-up after this lands. |

**Verdict**: fail, on three HIGH findings — all folded in above, two of them escalated because they
changed what the code must do rather than how the plan describes it. **Coverage**: `plan.md` whole;
`subscriber.ts` (751 lines), `connection.ts` (369), `resp.ts` (577) whole; `client.ts:150-249`;
`mod.ts`; `packages/redis/AGENTS.md:75-115`; eleven backlog items; blast radius counted by grep
across `packages/`, `app/`, `config/`. **Not covered**: the test files beyond grepping for call
sites, so FR-008 is unaudited against the actual helpers; nothing was executed or type-checked; and
Deno's runtime behaviour for an abandoned `conn.write` is reasoned, not measured — SC-001 and SC-006
are where that gets measured.

## 11. Security audit

*`security-expert`, in parallel. Verdict: **needs_followup** — 0 critical, 0 high, 5 medium, 2 low.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | MEDIUM — the new ERROR line has no content constraint, and the naive version logs a replayable authenticated control frame | Plan changed: **FR-005a**, written as a denial list rather than an encoder choice. The seat's key observation is that `safeForLog` would *not* save it — it is a log-injection encoder, not a redactor, and a control payload fits inside its 512-char truncation. New §5 row; SC-003 gains the CR/ESC/marker assertion. Class **confirms #291**. |
| S2 | MEDIUM — FR-005 converts a fail-closed crash into a per-frame fail-open on the realtime eviction path | Plan changed: **FR-005b** names the backstop (realtime's revocation reconcile) as the *precondition* that makes containment safe, and classifies the line as a security-control failure. The seat's framing is the one that matters: once containment ships, applications are written assuming their handler may throw, and narrowing it later is a break across every consumer. |
| S3 | MEDIUM — FR-009 defers a choice one of whose permitted options is a peer-driven log flood, and a throttle could silence S2's line | Plan changed: FR-009 decided, with the constraint the seat added — the first occurrence **after every socket generation** is always logged in full, so a suppression window can never hide the security-control failure. |
| S4 | MEDIUM — FR-003 and the keepalive path contradict each other | Same finding as A2, reached independently from the other side. Folded in once. |
| S5 | MEDIUM — FR-004 does not require the abandoned write to reject | Plan changed: **FR-004a**, and SC-002 now asserts the rejection rather than only the absence of delay. |
| S6 | LOW — FR-007 enforces "the length is decimal" but not "the frame ended where it said" | Plan changed: FR-007 gains the CRLF check at `resp.ts:489`, in the same function. |
| S7 | LOW — `writeFrame`'s new `timeoutMs` is an exported parameter with no validator | Plan changed: **FR-010**. §8 records that `readReply`'s identical gap is left alone deliberately. |

**Positive results worth recording** (a clean verdict is worth what it covered):

- **The wire is already bounded at seven places** — line 64 KiB, bulk 10 MiB, array 10M elements,
  total reply 32 MiB, a per-reply wall-clock deadline, an unknown type byte rejected, and the frame
  shape checked as an array of exactly four bulks. FR-007 adds an eighth.
- **`#dispatch` routes through an allowlist**, `patterns.get(pattern.value)` — a pattern nobody
  registered reaches no handler.
- **Nothing here moves an authorization or authenticity decision.** The MAC and replay window sit
  downstream of `#dispatch` and are untouched.
- **A peer cannot spin the client**: every re-dial path, the read-loop fault included, is behind
  full-jitter exponential backoff capped at 30 s.
- **The loose length parse is not an access-control hole.** The seat's honest correction: only the
  broker or a MITM on a plaintext link can produce those bytes, and either already owns the stream —
  so FR-007's value is that a mis-read becomes **loud**, not that it becomes impossible. §1's
  framing stands; review must not escalate it past defence-in-depth.

**Coverage**: the plan whole; `resp.ts`, `subscriber.ts`, `connection.ts` whole;
`client.ts` write-error handling; `contract/logging/sanitize.ts` whole; realtime's
`drivers/redis.ts` and `manager.ts` for the downstream containment question; eleven backlog items.
**Not covered**: `packages/redis/tests/` (so FR-008 was assessed from description only),
`session/drivers/redis.ts` beyond an error-handling grep, `redis/memo.ts`, and the
language-footguns knowledge file — a Deno-specific footgun in the write-deadline implementation
would not have been caught.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1** — How far does the write deadline reach? A *defaulted* `writeFrame` timeout lands on `exchange` and therefore on `AUTH`, `SELECT`, `QUIT` and every `RedisClient.command` across 5 packages — and bypasses the handshake's per-step `#remaining` threading, restoring the multiplication #274 fixed. Both #286 and #287 scope `client.ts` out. | **Subscribe path only.** `timeoutMs` is optional; `undefined` means unbounded, which is today's behaviour byte for byte. Only `RedisSubscribeConnection` passes it. The command path is untouched, both issues' out-of-scope is honoured exactly, and the branch does not put five packages' command paths in its blast radius. The residual — `RedisClient.command` keeps an unbounded write leg, so the same silent hang stays reachable for session reads, queue jobs and scheduler locks — is **filed, not accepted silently**, and the filing is a task in this feature rather than a promise. | 2026-09-06 |

### Decided without asking

- **The deadline is per frame, not per `conn.write`.** `ReplyReader` already records why for reads;
  the write side has the identical failure mode, and a different shape would make the two legs
  reason differently about one socket.
- **The budget is derived and capped** (FR-002), not the raw liveness window and not a second knob.
- **FR-009 is decided here** (first-per-pattern-per-generation, collapsed count, never detach)
  rather than left to whichever behaviour the first implementation happens to have.
- **The `:` integer parse at `resp.ts:455` is left alone**, per #287's own out-of-scope — an integer
  reply's value is not a frame length. A one-line comment says so at the site, so the next
  consistency pass stops there instead of changing `RespServerError` into `RespFramingError` and
  turning a retained connection into a discarded one.
- **`readReply`'s unvalidated `timeoutMs` stays unvalidated** (§8), so this feature does not put a
  second change on the command path.
- **The command path's unbounded write leg is filed, not forgotten.** It is the same defect #286
  describes, on `RedisClient.command` instead of `#activate`, and it is reachable for session reads,
  queue jobs and scheduler locks. Filing it is a task in this feature, at P1, with the `exchange`
  two-leg threading and the `#remaining` fix named — so the next person does not have to rediscover
  that `exchange` bounds only the read.
- **Three issues, one branch, three `fix` commits** — the branch for the file overlap, the commits
  because a revert of the parser must not be a revert of the crash fix, and because the close
  keyword is per issue.
- **The `Socket generation` extraction (A11) is not done here.** It is the right refactor and it is
  filed as [#298](https://github.com/locknessland/lockness-monorepo/issues/298) (P1), not performed:
  mixing it in would make the three `fix` commits unreviewable. Its acceptance criteria include
  making the battery's documented survivor killable, or removing the row with a reason.
- **The command path's unbounded write leg** is
  [#297](https://github.com/locknessland/lockness-monorepo/issues/297) (P1), carrying the reasoning
  that stops it being "fixed" by defaulting the parameter.

### Corrected during implementation

Three things the plan had wrong, found by tests rather than review:

- **FR-001a's message was ordered wrongly.** "Discard the socket" sat past `renderError`'s 200-char
  cap, so the actionable half never reached the log line an operator reads. Reordered.
- **FR-003's split was incomplete.** "The keepalive discards but does not schedule" leaves the
  connection permanently deaf: `#discardSocket` makes `#readLoop`'s `while` condition false, so the
  loop exits quietly rather than faulting and nothing re-dials. The race the old comment feared is
  already answered in `#scheduleRetry`, which returns early when a retry timer exists — so the
  keepalive discards **and** schedules.
- **A hostile-pattern fixture used `\x1b[31m`**, whose `[31m` Redis reads as a glob character
  class, so it matched nothing and the test timed out proving nothing.
