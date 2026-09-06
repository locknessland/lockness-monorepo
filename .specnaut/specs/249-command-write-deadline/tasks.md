# Tasks: Bound the command path's write leg

**Feature**: `249-command-write-deadline` | **Backlog item**: [#297](https://github.com/locknessland/lockness-monorepo/issues/297)
**Derived from**: `plan.md` (approved 2026-09-06, both audits folded in, Q1 answered)

## 🔒 Decision homes carried forward

| Decision | Home |
| :--- | :--- |
| How long is left (unclamped) | `connection.ts` — `remaining(deadline)` |
| What an exhausted budget means | `connection.ts` — `exchange`, raising `RespFramingError` |
| One budget per exchange | `connection.ts` — `exchange` |
| How long one frame may take | `resp.ts` — `WRITE_STALL_CEILING_MS`, moved from `subscriber.ts` |
| The default budget | `connection.ts` — `exchange`'s fallback to the imported `READ_TIMEOUT_MS` |
| That a timed-out write means discard | `resp.ts` — the `RespFramingError` type |
| What a write-leg message may carry | `resp.ts` — `writeTimeout` |
| That a deadline is an instant | `connection.ts` — the branded `Deadline` |

---

## Phase 1 — Setup

- [X] T001 Enumerate by search, not from §8: `grep -rn 'exchange(' packages/`, `grep -rn '\.command(' packages/ | wc -l`, `grep -rn 'WRITE_STALL_CEILING_MS\|READ_TIMEOUT_MS' packages/`.
- [X] T002 Bring up a broker for the live tests on a port that is **not 6379** — that belongs to an unrelated container on this machine.

## Phase 2 — Foundations (block everything)

- [X] T003 Move `WRITE_STALL_CEILING_MS` from `packages/redis/subscriber.ts` to `packages/redis/resp.ts`, beside `READ_TIMEOUT_MS`, keeping its docstring — it is the argument for the value and it is why FR-004 splits the two budgets. Import it back into `subscriber.ts`; no behaviour change there.
- [X] T004 Export `READ_TIMEOUT_MS` from `resp.ts` for internal import. **Not** added to `mod.ts` — the alternative is writing `30_000` into `connection.ts`, which is the duplication the table forbids.
- [X] T005 Add the branded `Deadline` type in `packages/redis/connection.ts`: an epoch-ms value a plain `number` cannot be assigned to, so `exchange(conn, args, 5000)` stops compiling. FR-002.

## Phase 3 — US2 / the shared budget (P1)

- [X] T006 [US2] Write the failing test first: a handshake against a peer that accepts and never drains must fail within `handshakeTimeoutMs` **in total**, not per step. **Observe it hang before T007.**
- [X] T007 [US2] Replace the private `#remaining` with a module-level `remaining(deadline)` returning the **raw signed difference**. Move the `Math.max(1, …)` clamp into `#dial`, its only legitimate consumer. FR-003 — and the reason is that the clamp made the expired-budget guard unreachable, which would have made SC-005's mutation a guaranteed survivor.
- [X] T008 [US2] Rewrite `exchange` to take an optional `Deadline`, compute the budget once (`deadline ?? Date.now() + READ_TIMEOUT_MS`), and give each leg `remaining()` against it. FR-001.
- [X] T009 [US2] Raise `RespFramingError` from `exchange` when the budget is already exhausted, **before either leg**. Not `RangeError`: `subscriber.ts` routes positively on `RespFramingError` and the comment there records this gap as a defect already found twice. FR-005.
- [X] T010 [US2] Give the **handshake's** write legs `min(remaining, WRITE_STALL_CEILING_MS)` and the **command** path the full remaining budget. FR-004 — two ceilings because a ~40-byte `AUTH` frame and a multi-megabyte `SETEX` are not the same physics.
- [X] T011 [P] [US2] Update the two `exchange` call sites in `connect()` to pass the deadline itself rather than a recomputed duration.

## Phase 4 — US1 / the command path (P1)

- [X] T012 [US1] Write the failing test: a command against a socket that never drains must reject within the budget. **Observe it hang before it passes.**
- [X] T013 [US1] Verify — do not assume — that a write-leg `RespFramingError` discards the socket at `client.ts:198`. `RespFramingError` and `RespServerError` are siblings under `RespError` and the routing is negative, so it should; FR-010 says the test is what makes that a fact.
- [X] T014 [US1] Assert the next command re-dials, so a discard is observable rather than inferred.

## Phase 5 — The disclosure and the unvalidated knob (P1)

- [X] T015 Remove `frame.byteLength` from `writeTimeout` in `packages/redis/resp.ts`. For `encodeCommand(['AUTH', pw])` it is invertible to the password's byte length — 8/16/32/64 bytes give 28/37/53/85 — and the rendered message is 169 characters, so `renderError`'s 200-char cap does not truncate it. The offset alone already tells an operator the write made no progress. FR-007.
- [X] T016 Assert it: a stalled `AUTH` write's error must contain no length derived from an argument. SC-006. This path does not exist before this feature, which is exactly why the test belongs with it.
- [X] T017 [P] Validate `handshakeTimeoutMs` in `AuthenticatedConnection`'s constructor with the same `RangeError` shape `#assertCadences` uses. `NaN` today makes every handshake fail instantly with "after NaNms" — a misconfiguration presenting as an outage. FR-008.

## Phase 6 — Verify

- [X] T018 Test `close()` by calling `client.close()` **directly**. Driven through the shutdown sequence it goes green on that sequence's own 10s deadline and proves nothing about this feature. SC-007.
- [X] T019 Mutation-verify every guard, and **prove each mutant compiled and executed** before recording its result — a mutant that does not type-check is dead, not a survivor. Extend `packages/redis/tests/mutations/subscribe_hardening_248.ts` or add a sibling.
- [X] T020 Run the gate — `deno fmt && deno lint && deno check && deno task test`, `deps:analyze`, `agents:brief --check`, `publish:check` — **and all four consumers**: session, realtime, queue, core.
- [X] T021 Run the live-broker suite and report the count; if no broker was available, say SC-002 was not executed rather than reporting it green.

## Phase 7 — Backlog

- [X] T022 File the reconnect churn at **P1**: a forced discard re-dials on the very next command with no backoff and no circuit breaker, re-sending `AUTH` in cleartext since `tls` defaults to `false`. Name what it touches — `RedisClient`, `AuthenticatedConnection`, and four consumers' timing assumptions — and that the subscribe connection's equivalent took #245 to get right.
- [X] T023 File the write-side frame-size bound at **P1**: `MAX_BULK_BYTES` and `MAX_REPLY_BYTES` bound replies only, so the exchange budget is an implicit, link-speed-dependent maximum frame size. Name the judgement it needs — the largest legitimate session blob or queue payload.
- [X] T024 Commit as `fix(297)` + `test(249)`, with `Closes #297` on the fix.

---

## Dependencies

```
T001,T002 → T003,T004,T005 → US2 (T006→T007→T008→T009→T010, T011∥)
                                   ↓
                              US1 (T012→T013→T014)
                                   ↓
                              T015→T016, T017∥
                                   ↓
                              T018 → T019 → T020 → T021 → T022∥T023 → T024
```

**Two points where order is not negotiable**: T007 before T009, or the expired-budget guard is
unreachable and its mutation is a guaranteed survivor; and every "observe it hang" before its fix,
or the test is trusted without having been seen to measure anything.

## Implementation strategy

**MVP = Phases 2–4.** That closes #297. Phase 5 is not optional polish — T015 removes a disclosure
this feature would otherwise create, and it must not ship without it.
