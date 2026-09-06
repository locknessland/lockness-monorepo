# Tasks: Command-path resilience

**Feature**: `250-command-path-resilience` | **Items**: [#299](https://github.com/locknessland/lockness-monorepo/issues/299) · [#300](https://github.com/locknessland/lockness-monorepo/issues/300)
**Derived from**: `plan.md` (approved 2026-09-06, both audits folded in, Q1 answered)

**The order is load-bearing in one place**: the frame bound (#300) lands **before** the backoff
(#299), because #300 removes a trigger of #299 and because an oversized-frame refusal must be proved
*not* to arm a window — which needs the window to exist last, not first.

## 🔒 Decision homes

| Decision | Home |
| :--- | :--- |
| The backoff **curve** | `packages/redis/backoff.ts` |
| The backoff **state** | `packages/redis/client.ts` — never `AuthenticatedConnection` |
| Whether a dial is allowed | `client.ts` — `#serializedExchange`, before `connect()` |
| What counts as survival | `client.ts` — generation age vs. the delay that produced it |
| What arms the window | `client.ts` — a *faulted* exchange, not `discard()` |
| The largest outbound frame | `resp.ts` — `MAX_COMMAND_FRAME_BYTES`, derived from `MAX_BULK_BYTES` |
| Where it is refused | `resp.ts` — `encodeCommand`, before the allocation |
| Which faults imply a discard | `client.ts` — `#serializedExchange`'s catch |
| What the messages carry | verb, limit, bucketed size |

---

## Phase 1 — Setup

- [X] T001 Enumerate by search: `grep -rn 'encodeCommand(' packages/`, `grep -rn '\.connect()' packages/redis/`, `grep -rn 'MAX_FRAME_BYTES' packages/`.
- [X] T002 Broker on a port that is **not** 6379.

## Phase 2 — #300, the frame bound

- [X] T003 Failing test: an oversized frame must be refused **without being encoded**, and the socket untouched. Observe it fail.
- [X] T004 Add `MAX_COMMAND_FRAME_BYTES` to `resp.ts`, **derived** from `MAX_BULK_BYTES` (FR-010), with the round-trip invariant recorded at the constant — a value written must be readable back, and `resp.ts:676` is what makes a larger bound a poison key. Named `MAX_COMMAND_FRAME_BYTES`, not `MAX_FRAME_BYTES`: `realtime/protocol.ts:47` already exports that name 640× smaller and realtime imports redis.
- [X] T005 Refuse inside `encodeCommand`, **before** `new Uint8Array(total)`. A cheap pre-check on `Σ args[i].length` (UTF-16 units are a sound lower bound on UTF-8 bytes) refuses the pathological case with zero allocation; the exact check follows for the near-boundary case.
- [X] T006 New `RespCommandTooLargeError` extending `RespError` but **not** `RespFramingError`, **and widen `client.ts:198`'s routing to exempt it**. Without the exemption the refusal discards a healthy socket — the promise is unachievable by throwing alone.
- [X] T007 The message names the verb, the limit, and the size **bucketed** (nearest MiB) — never the exact size. An exact size inverts, for fixed arity, to the summed argument byte length.
- [X] T008 SC-008 as an **equality**: two payloads of different sizes in the same bucket produce byte-identical messages. Not an absence — `resp.ts:326-345` records that an absence assertion is what let the previous disclosure survive.
- [X] T009 SC-006's read-back clause: a value written at exactly the limit reads back without a discard.

## Phase 3 — #299, the backoff

- [X] T010 Failing test: a wedged broker driven at high command rate must not produce a dial per command. Observe it fail.
- [X] T011 `packages/redis/backoff.ts` — one pure `nextDelay(attempts, baseMs, maxMs)`, the same curve as `subscriber.ts:719-723`.
- [X] T012 State in `RedisClient`: streak, window, cadence. **Not** `AuthenticatedConnection` — it is shared with the subscriber, whose streak nothing would reset. This is the CRITICAL.
- [X] T013 Guard in `#serializedExchange` before `await this.connect()`; reject immediately naming the milliseconds left. Never sleep.
- [X] T014 Arm the window on a **faulted exchange**, not on `discard()` — two of `discard`'s three callers are not faults (`client.ts:244` is `close()`, `subscriber.ts:510` is the subscribe path).
- [X] T015 Reset on **survival**: the socket completed an exchange **and** has been live longer than the delay that produced it. An in-sync `RespServerError` counts as proof.
- [X] T016 Increment once, inside the not-refused branch.
- [X] T017 One log line per window: `renderError` for the cause, `safeForLog` for the host, the `disposableName`, and the cleartext-`AUTH` warning when `tls` is off.
- [X] T018 Validate `retryBaseMs`/`retryMaxMs` at construction (FR-013). Unvalidated, `NaN` makes `Date.now() < NaN` false and the backoff silently does not exist — loud on the subscribe path, silent here.

## Phase 4 — #299 AC 5, the queue worker

- [X] T019 Wrap `packages/queue/worker.ts:64-83` in `try/catch`, log at WARN, fall through to the existing `sleep`. Its own `fix` commit. Without it the worker dies in milliseconds and each supervised restart resets the backoff.

## Phase 5 — Verify

- [X] T020 Mutation-verify every guard; prove each mutant **compiled and executed**.
- [X] T021 Full gate plus the three declared consumers and core's scheduler-lock tests.
- [X] T022 Live-broker suite; report the count or say it was not executed.
- [X] T023 Commit: `fix(300)`, `fix(299)`, `fix(299): queue worker`, `test`. Each `fix` carries its own `Closes`.

---

## Dependencies

```
T001,T002 → #300 (T003→T004→T005→T006→T007→T008,T009)
                 ↓  (the bound lands FIRST — it removes a trigger, and its
                 ↓   refusal must be proved not to arm a window)
            #299 (T010→T011→T012→T013→T014→T015→T016→T017,T018)
                 ↓
            T019 → T020 → T021 → T022 → T023
```
