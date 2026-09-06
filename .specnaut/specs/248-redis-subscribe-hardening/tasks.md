# Tasks: Subscribe-connection hardening for `@lockness/redis`

**Feature**: `248-redis-subscribe-hardening` | **Backlog items**: [#286](https://github.com/locknessland/lockness-monorepo/issues/286) · [#287](https://github.com/locknessland/lockness-monorepo/issues/287) · [#296](https://github.com/locknessland/lockness-monorepo/issues/296)
**Derived from**: `plan.md` (approved 2026-09-06, both audits folded in, Q1 answered)

**Order is load-bearing at one point.** #287's single-flight guard lands **first**, because FR-001
is what makes the stale-discard path routine — shipping #286 ahead of it would ship a known
concurrency hole. #287's own Notes ask for this ordering.

## 🔒 Decision homes carried forward

| Decision | Home |
| :--- | :--- |
| How long one frame may take to write | `resp.ts` — `writeFrame`'s `timeoutMs` |
| What that deadline is worth | `subscriber.ts` — `Math.min(#livenessMs, WRITE_STALL_CEILING_MS)` |
| Which failures route to `#scheduleRetry` | `subscriber.ts` — `#activate`'s catch (keepalive is the named exception) |
| Whether a write may target this socket | `subscriber.ts` — `#write` |
| When a socket is finished | `subscriber.ts` — `#discardSocket` |
| Which dial a `connectPromise` belongs to | `connection.ts` — the paired field |
| A valid length prefix, and where a frame ends | `resp.ts` — one parse function |
| That a foreign callback cannot escape | `subscriber.ts` — `#dispatch`'s guard |
| What a containment log line may carry | `subscriber.ts` — that same catch |
| What a repeatedly-throwing handler does | `subscriber.ts` — the per-pattern, per-generation counter |
| How a test observes `console.warn` | `redis/tests/subscriber.test.ts` — one helper with a `finally` |

---

## Phase 1 — Setup

- [X] T001 Enumerate by search, not from `plan.md` §8: `grep -rn 'writeFrame' packages/`, `grep -n '#write(' packages/redis/subscriber.ts`, `grep -rn '\.discard(' packages/`, `grep -n 'Number(' packages/redis/resp.ts`. Record the site list; the plan's counts are its restatement, and FR-010's enumeration authority is the search.
- [X] T002 Bring up an isolated broker for the live tests on a port that is **not 6379** — 6379 belongs to an unrelated container on this machine. `LOCKNESS_REDIS_INTEGRATION=1 LOCKNESS_REDIS_PORT=<port>`.

## Phase 2 — US4 / #287 bullet 1: the single-flight guard (P1, FIRST)

- [X] T003 [US4] Write the failing test: a stale `discard(c1)` while a dial for `c2` is in flight must not cancel the in-flight single-flight, and N concurrent `connect()` calls must still open exactly one socket. **Observe it fail before T004.**
- [X] T004 [US4] Pair the dial promise with its socket in `packages/redis/connection.ts` — one field holding `{ promise, conn: Deno.Conn | null }`, `conn` filled at the same statement that sets `this.connection`, so the pairing is atomic. `discard(conn)` clears it only when the pairing matches; an unsettled dial (`conn === null`) is never cancellable by any discard, **by construction rather than by inference**.
- [X] T005 [US4] Record in the docstring why pairing rather than `this.connection === conn`: the simple guard is correct today only via `connect()`'s short-circuit two methods away, and `connectPromise` is never cleared on success (`:258-260` clears only on rejection), so the two fields describe one generation through different mechanisms at different instants. Do **not** repeat the plan's retracted rationale.

## Phase 3 — US1 / #286: bound the write leg (P1)

- [X] T006 [US1] Write the failing test: a socket that accepts the connection and never drains leaves `#activate` suspended forever today. Assert it fails within the deadline instead. **Observe it hang/fail before T007.**
- [X] T007 [US1] Add an **optional** `timeoutMs` to `writeFrame` in `packages/redis/resp.ts`, enforced as a **per-frame wall-clock deadline** — one deadline fixed before the loop, each `conn.write` bounded by the time left, mirroring `ReplyReader`'s per-reply deadline and for the same reason (a socket accepting one byte at a time resets a per-write timer forever). `undefined` keeps the current unbounded loop **byte for byte**, which is what keeps the command path out of this branch (Q1).
- [X] T008 [US1] The stall error **must not claim an exact byte offset** (FR-001a). An abandoned `conn.write` cannot be cancelled and may still be advancing it; the message reports bytes *confirmed* written before the deadline and says so. The existing `written <= 0` error keeps its exact offset — it has one.
- [X] T009 [P] [US1] Validate the parameter (FR-010): positive and finite, else `RangeError`, in `#assertCadences`' vocabulary. Leave `readReply`'s identical gap alone — §8 records that as a decision.
- [X] T010 [US1] In `packages/redis/subscriber.ts`, compute the budget once as `Math.min(this.#livenessMs, WRITE_STALL_CEILING_MS)` and pass it from `#write`. Add `WRITE_STALL_CEILING_MS` beside the other cadence constants with one sentence of reason: the liveness window is a tolerance for *silence* sized off `keepaliveMs`; a write budget is a tolerance for *backpressure* on a ~40-byte frame, and `#assertCadences` has no upper bound, so an operator raising `keepaliveMs` for a quiet bus would otherwise set write-stall detection to minutes without touching anything named "write".

## Phase 4 — US1b / #286: the write chain is per generation (P1)

- [X] T011 [US1] Write the failing tests, **both halves**: (a) a write queued against a discarded socket does not delay the successor's re-subscribe and its promise **rejects** rather than dangling (FR-004a); (b) discarding a **stale** generation while a newer one is live leaves the newer one's serialization intact (SC-002a).
- [X] T012 [US1] Pair the chain with its generation in `packages/redis/subscriber.ts`, mirroring `#keepaliveTimer` / `#keepaliveConn`. `#write` rebases onto a fresh `Promise.resolve()` when the generation changed; `#discardSocket` clears it **conditionally**, `if (chainConn === conn)`. An unconditional reset is the exact shape the comment at `:195-203` records as a live defect one field over — it disarmed the live socket's keepalive — and here it would delete the live socket's write serialization, the thing that stops two writes splicing into a still-valid truncated frame.
- [X] T013 [US1] Add the generation check **inside the queued closure** too. Clearing a field does not cancel a write already chained behind an in-flight one, so this is the second of two mechanisms and neither substitutes for the other.
- [X] T014 [US1] Move the "may this write target this socket" check into `#write` and **delete `:461`'s `this.conn.socket !== conn` clause** from the keepalive (keep its `this.closed` clause — it also skips an allocation). Two homes for one predicate is what the decision table exists to prevent.

## Phase 5 — US1c / #286: discard is owed by every observer (P1)

- [X] T015 [US1] Write the failing test: a **timed-out keepalive** write must discard the socket rather than leave a partial `PING` on one the read loop keeps draining. Today the keepalive's `.catch` logs and deliberately does not recover, on the premise that "the read loop on this same socket is about to fault" — true of a socket error, **false of a timeout**, which is what FR-001 introduces.
- [X] T016 [US1] Make the obligation mechanical rather than remembered: a deadline failure raises a type that *means* discard. `RespFramingError` already means "bytes remain on the wire" and `client.ts:198` already routes on it.
- [X] T017 [US1] Split FR-003's two obligations at the call sites: **discard** is owed by whichever path observed the failure, keepalive included; **scheduling** stays `#activate`'s job alone, so the two triggers still cannot race. Update the keepalive catch's comment to say which half it now owns and why the other stays where it is.

## Phase 6 — US3 / #296: contain a throwing handler (P1)

- [X] T018 [US3] Write the failing test against the **live broker** — an in-process double cannot reproduce a process exit. Publish, throw from the handler, publish again, assert the second arrives and the process survives. **Observe it kill the process before T019.**
- [X] T019 [US3] Wrap **only** the `handler(topic.value, payload.value)` call in `#dispatch` — never `#dispatch`'s own parsing, which would swallow the driver's faults. Log at ERROR and continue the loop.
- [X] T020 [US3] The log line carries the pattern via `safeForLog` and the error via `renderError`, and **must not contain `topic` or `payload`, encoded or not** (FR-005a). `safeForLog` is a log-injection encoder, not a redactor — it truncates at 512 chars, and a realtime **control** payload is a signed `{kind, target, origin, ts, nonce, mac}` frame that fits well inside that, so logging it writes a replayable authenticated `evict` into the log store. `renderError` is required for the error itself because an app handler's message routinely embeds the payload it choked on.
- [X] T021 [US3] Extend T018's test: publish a payload containing a CR, an ESC and a marker string, and assert **none of the three** appears in the captured line.
- [X] T022 [US3] Implement FR-009 — first throw per pattern **per socket generation** logged in full; further throws inside a fixed window collapse into one line with a suppressed count; counter resets with the window; **never detach the handler**. Detaching turns a recoverable app defect into permanent silent loss, the reasoning `#fireReconnect` already records at `:637-641`. The per-generation reset is what stops a suppression window hiding a security-control failure.
- [X] T023 [P] [US3] Record FR-005b in the code: containment is safe here **because** every security-relevant consumer has a durable backstop — realtime's revocation reconcile. A consumer without one must not rely on this catch. Without that sentence, the next reader sees only a `catch`.

## Phase 7 — US5 / #287 bullets 2–3: the parser and the test helper (P2)

- [X] T024 [US5] Write the failing tests from `plan.md` §1's table: `""`, `" "`, `"0x10"`, `"1e3"`, `"+5"`, `"0b11"`, `"5."` must all raise; `-1` and plain decimals must still parse; a bulk body followed by non-CRLF must raise.
- [X] T025 [US5] One parse function in `packages/redis/resp.ts`, used by **both** the `$` and `*` sites: accept `-1` or `/^\d+$/`, nothing else. Verify the two bytes after a bulk body are CRLF (`:489` consumes them unchecked today) — the other half of the same trust.
- [X] T026 [P] [US5] Leave the `:` integer `Number()` at `resp.ts:455` alone and **say so at the site** in one line. Without it the next consistency pass "fixes" it, changing `RespServerError` (socket in sync, connection retained by `client.ts:198`) into `RespFramingError` (socket discarded).
- [X] T027 [P] Give `liveWarnings` in `packages/redis/tests/subscriber.test.ts:425` a `finally`, or fold it into `captureWarnings`. It hands the caller a `restore` to remember, so a test that throws first leaves `console.warn` patched for every test after it in the file. Say in the comment that this is a **test-integrity control**: a helper left patched makes every later assertion about log output pass for the wrong reason — including T021's.

## Phase 8 — Verify, then gate

- [X] T028 Mutation-verify every guard added here (SC-006), and **prove each mutant actually executed** before recording its result — assert the anchor matched exactly once, re-read the file to confirm it changed, and grep the whole test output for the pass line rather than tailing it. Put the battery in the tree, runnable, like `packages/realtime/tests/mutations/prefix_288.ts`.
- [X] T029 Run the gate: `deno fmt && deno lint && deno check && deno task test`, plus `deps:analyze`, `agents:brief --check`, `publish:check` — **and the suites of all five consumers**: session, realtime, queue, core. The plan's §6 names them because an earlier draft named two.
- [X] T030 Run the live-broker suite against T002's broker and report the count. If no broker was available, say SC-003/SC-003a were not executed — do not report them as passing.

## Phase 9 — Backlog

- [X] T031 File the command path's unbounded write leg at **P1**: `RedisClient.command` reaches `writeFrame` through `exchange`, which bounds only the read leg, so #286's defect is reachable for session reads, queue jobs and scheduler locks. Name the fix (thread the deadline through `exchange` to both legs via `#remaining`) and the trap (`exchange` looks like it passes a timeout and does not — `packages/redis/AGENTS.md` already records this as a recurring misreading).
- [X] T032 File the `Socket generation` extraction (A11) — `RedisSubscribeConnection` holds `loopConn`, `loopDone`, `#keepaliveTimer`, `#keepaliveConn` and now the write chain as parallel fields, and `#discardSocket` is a hand-written destructor for a concept the type does not name. This branch adds the **third** field to need the same guard. Not done here: it would make the three `fix` commits unreviewable.
- [X] T033 Commit in the plan's shape: `fix(287)` → `fix(286)` → `fix(296)`, then `test`, then `docs`. **Each `fix` carries its own `Closes #N`** — one commit naming three issues closes only the first.

---

## Dependencies

```
T001,T002 → US4 (T003→T004→T005)          ← FIRST: #286's new stale-discard
                 ↓                            path makes this fire for real
            US1 write leg   (T006→T007→T008, T009∥)
                 ↓
            T010 → US1b chain (T011→T012→T013→T014)
                 ↓
            US1c discard     (T015→T016→T017)
                 ↓
            US3 containment  (T018→T019→T020→T021→T022, T023∥)
                 ↓
            US5 parser       (T024→T025, T026∥T027)
                 ↓
            T028 → T029 → T030 → T031∥T032 → T033
```

## Parallel opportunities

- T009 ∥ T007/T008 (validation vs the loop, same file, distinct functions — sequence if they collide)
- T023 ∥ T022, T026 ∥ T027, T031 ∥ T032

## Implementation strategy

**MVP = Phases 2–4** (T003–T014): the single-flight guard, the bounded write leg, the per-generation
chain. That closes #286 and the live half of #287. It is a checkpoint inside the full path, not a
stopping point — Phases 5–7 were approved at the plan stop.

**Two points where the order is not negotiable.** Phase 2 before Phase 3, or #286 ships with a known
concurrency hole. And every "observe it fail" task before its fix, or the test is trusted without
having been seen to measure anything.
