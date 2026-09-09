# Tasks: presence-join compensation when the authoritative roster write fails

**Feature** `255-presence-join-compensation` · **Issue** [#323](https://github.com/locknessland/lockness-monorepo/issues/323) · **Plan** [plan.md](plan.md)

TDD is non-negotiable per the constitution: every behavioural task is preceded
by a failing test, and every test that claims to catch a defect is **proven to
fail against that defect** before it is accepted.

## 🔒 Decision-table homes, carried forward

No task may put a decision anywhere but its named home. Each task below names
the home it touches.

| Decision | Home |
| :--- | :--- |
| When a join becomes VISIBLE | `packages/realtime/manager.ts` — the `emitPresence` call position in `subscribe` |
| Who is excluded from a join's own announcement | `packages/realtime/manager.ts` — `emitPresence`'s `except` parameter |
| What "no residue" means | `packages/realtime/manager.ts` — `#leaveLocal` + the `presence` delete beside it |
| Cap decision and its writes in ONE turn | `packages/realtime/manager.ts` — the unbroken `#checkChannelCaps` → `#joinLocal` run |
| The authoritative write is ONE fact | `packages/realtime/drivers/redis.ts` — a single `EVAL` |
| Failure AFTER the authoritative write | `packages/realtime/manager.ts` — the `subscribe` call site, one disposition per step |
| What a `joined` frame promises, and does not | `docs/realtime.md`, presence section |

---

## Phase 1 — Setup

- [X] T001 Confirm the scratch broker is reachable on the project's integration port and that port 6379 is untouched, in `packages/realtime/tests/` (read-only check; the live battery is opt-in behind `LOCKNESS_REDIS_INTEGRATION`)

---

## Phase 2 — Foundational (blocks every user story)

**These three land before any reordering.** Shipping the reorder without T003
takes the branch through a state the architecture audit calls a net regression.

- [X] T002 [P] Extend the recording driver in `packages/realtime/tests/roster_control_atomicity.test.ts` so its `conn()`'s `send` pushes into the SAME ordered log as the driver ops — today it is `() => {}`, so the log records driver ops only and structurally cannot observe emit-vs-write (audit H3). Assert the existing four tests still pass unchanged.
- [X] T003 Write the failing test for the atomic roster write in `packages/realtime/tests/roster_atomicity_323.test.ts`: a driver double whose second write rejects must leave NEITHER the hash entry nor the owned-set entry (SC-008). Prove it fails against today's `HSET`-then-`SADD`.
- [X] T004 Make `addMember` one `EVAL` in `packages/realtime/drivers/redis.ts` (🔒 home: "the authoritative write is ONE fact"), following `markRevoked`'s precedent at `drivers/redis.ts:1394-1401` — the script writes the presence hash field and the owned-set entry, or neither. Keep `#ensureSweepStarted` outside the script. Full JSDoc stating why the two writes are one fact.
- [X] T005 Add `except?: string` to `emitPresence` in `packages/realtime/manager.ts` (🔒 home: "who is excluded from a join's own announcement"), skipping that client in the fan-out. Do NOT yet move any call site. JSDoc states that this replaces an exclusion previously enforced by statement order alone.
- [X] T006 [P] Add the failing witness for FR-009 in `packages/realtime/tests/emit_isolation_323.test.ts`: one connection whose `send` throws must not stop the fan-out reaching the others. Prove it fails against today's bare `for` loop.
- [X] T007 Isolate each `send` in `emitPresence` (`packages/realtime/manager.ts`) so a throwing socket is skipped, not fatal (FR-009). The `catch` logs at WARN with `safeForLog(channel)` and `renderError(error)` and **nothing derived from `member`** (audit S-5) — no silent catch.

**Checkpoint** — the roster write is atomic, the witness can see frames, and the
fan-out survives a dead socket. Nothing has been reordered yet.

---

## Phase 3 — US1: a failed presence join leaves no trace (P1) 🎯 MVP

**Independent test criterion**: with a rejecting `roster.addMember`, no
subscriber received a `joined` and the local view is byte-identical to its
pre-call state.

- [X] T008 [US1] Write the failing test in `packages/realtime/tests/presence_join_compensation_323.test.ts`: a rejecting `addMember` must produce ZERO `joined` frames at every subscriber, measured on what each connection's `send` received — not on `subscribe`'s return (SC-001). Prove it fails against today's order.
- [X] T009 [P] [US1] Write the failing test for the local view in the same file: after a rejecting `addMember`, `presence` holds no entry, `subscriptions` holds no membership, and `#channelsByClient` no channel (FR-002). Prove it fails.
- [X] T010 [P] [US1] Write the failing test for SC-004 in the same file: a join that took a 0→1 transition and then failed leaves the instance hosting zero channels — i.e. the `watchChannel` is released. Prove it fails.
- [X] T011 [US1] Move the `emitPresence(joined)` call in `subscribe` (`packages/realtime/manager.ts`) to AFTER `roster.addMember`, passing `{ except: connection.id }` (🔒 home: "when a join becomes VISIBLE"). `#checkChannelCaps` → `#joinLocal` stays an unbroken synchronous run — **do not** move `addMember` above it (audit H1/S-1).
- [X] T012 [US1] Compensate the internal state on a rejecting `addMember` in `subscribe` (🔒 home: "what 'no residue' means"): `#leaveLocal` plus the `presence` delete, then re-throw. **No `left` frame** — nothing was announced, which is the whole reason this disposition beats #323's option 1. Any log follows T007's shape.
- [X] T013 [US1] Update the `subscribe` JSDoc (`packages/realtime/manager.ts`) to state the ordering guarantee and its scope, and rewrite the stale `A5 — emitPresence fans to the local set` comment that justified the old position.
- [X] T014 [US1] Update `#joinLocal`'s docstring (`packages/realtime/manager.ts:844-849`) where it reasons from the old order, keeping its same-synchronous-turn rule intact — that rule is now load-bearing for T011 and must say so.

**Checkpoint** — US1 is independently shippable and closes #323's core defect.

---

## Phase 4 — US2: a failed join can be retried cleanly (P1)

- [X] T015 [US2] Write the failing test in `packages/realtime/tests/presence_join_compensation_323.test.ts`: after a failed join, the same connection re-joining the same channel succeeds and yields exactly ONE member in the roster and exactly ONE `joined` frame in total (SC-003, FR-003). Prove it fails against a build with T012 reverted.
- [X] T016 [US2] Verify no residue path remains — `connections` is left set (idempotent with `register`, plan §12 L1) and is documented as deliberate at the call site rather than silently accepted.

---

## Phase 5 — US3: a lost announcement is not a lost roster (P2)

- [X] T017 [US3] Write the test for the post-write dispositions in `packages/realtime/tests/presence_join_compensation_323.test.ts` (FR-006, 🔒 home: "failure AFTER the authoritative write"): a rejecting `publishControl` keeps the roster and the local view, and a rejecting `rosterSnapshot` does not leave the caller believing a committed join failed.
- [X] T018 [US3] Implement the two dispositions at the `subscribe` call site: `publishControl` failure keeps FR-005's contract; `rosterSnapshot` failure degrades to the local view with a WARN rather than throwing over a join that fully committed. One named disposition per step — **not** a blanket `try/catch` around the tail.
- [X] T019 [P] [US3] Extend `packages/realtime/tests/roster_control_atomicity.test.ts` with the interleaved sequence now visible thanks to T002: `addMember` → `joined` frame → `publishControl`, in one log. This is what binds FR-001 mechanically (audit H3).

---

## Phase 6 — Concurrency (SC-007) and the cap invariant

- [X] T020 Write the failing test in `packages/realtime/tests/presence_cap_concurrency_323.test.ts`: K concurrent presence subscribes against a cap with one slot remaining admit exactly ONE (SC-007). The roster double's `addMember` MUST resolve on a **later microtask turn** — an immediately-resolving stub reproduces today's single-turn behaviour and the test passes vacuously (audit S-1).
- [X] T021 Prove T020 green against the shipped order AND red against a build where `addMember` is hoisted above `#checkChannelCaps` — this is the mutant that proves the cap invariant is live rather than assumed.

---

## Phase 7 — Mutation battery

- [X] T022 Re-anchor the `#295`/`#306` mutation in `packages/realtime/tests/mutations/presence_member_306.ts:81-82`, which pins the exact `if (this.roster) await this.roster.addMember(channel, member)` line; T011 moves its neighbourhood. A stale anchor reports `DEAD MUTANT` and is **not** caught by the pre-completion gate — `packages/realtime/AGENTS.md:308` says the full sweep is nightly.
- [X] T023 Add a mutation to that battery that swaps `emitPresence` back above `addMember`, and **prove it dies** to T008. A mutation that never executes reads as a result.
- [X] T024 Add a mutation removing the `except` argument and prove it dies to the newcomer-does-not-hear-itself assertion.

---

## Phase 8 — Documentation and backlog

- [X] T025 [P] Rewrite the presence section of `docs/realtime.md` (🔒 home: "what a `joined` frame promises, and does not") with the scoped contract: a `joined` from the joining instance follows a successful roster write; a `joined` re-emitted from a control frame on another instance attests an announcement, not a roster read; **presence is not an authorization source**.
- [X] T026 [P] Correct the sweep passages in `docs/realtime.md:585-588` and `:607` so they no longer imply the sweep heals an entry that was never written, or a live instance's own orphan.
- [X] T027 [P] Add the one-line link in `packages/realtime/README.md` to the contract in `docs/realtime.md` — a link, not a second wording.
- [X] T028 [P] Record the ordering rule and its reason in `packages/realtime/AGENTS.md`'s pitfall list, OUTSIDE the `<!-- generated:* -->` blocks so `deno task agents:brief` does not erase it.
- [X] T029 Grep the package for prose falsified by this branch — `grep -riE 'is removed by|lands in|the next release|will refuse|sweepable' packages/realtime docs/realtime.md` — and fix every hit. A promise written before the work is a lie one commit after it.
- [X] T030 Dispatch the `product-owner` docs audit on the completed branch and act on its findings. **Not optional**: my own "nothing owed" judgement has been wrong every time it has been checked.

---

## Dependencies

```text
Phase 2 (T002-T007) ── blocks ──▶ Phase 3 (US1)
      T003 → T004  (atomic write BEFORE any reorder)
      T005 → T011  (except param BEFORE the emit moves)
      T002 → T019  (frame-aware log BEFORE the binding assertion)
Phase 3 (US1) ── blocks ──▶ Phase 4 (US2) ─▶ Phase 5 (US3)
Phase 3 (T011) ── blocks ──▶ Phase 7 (T022 re-anchor)
Phase 6 is independent of 4/5 and may run alongside them
Phase 8 last — docs describe the shipped behaviour, not the intended one
```

**Two load-bearing orderings, stated so they are not reshuffled:**

1. **T004 before T011.** The reorder deletes the accidental `disconnect`-time
   healing of a partial write. Landing it before the write is atomic takes the
   branch through the regression state the audit named.
2. **T002 before T008.** Without a frame-aware log, the test that claims to
   witness FR-001 cannot observe it, and would pass identically before and after
   the change.

## Parallel opportunities

- **Phase 2**: T002 ∥ T006 (different files).
- **Phase 3**: T009 ∥ T010 (same file, independent assertions — write together, one commit).
- **Phase 8**: T025 ∥ T026 ∥ T027 ∥ T028 (four distinct files).

## MVP

**Phase 1 + 2 + 3 (T001-T014).** That closes #323's stated defect and is
independently shippable. Phases 4-8 complete the contract, the concurrency
proof, the battery and the docs.

## Out of scope — filed, not folded

- `PresenceMember.info` has no size bound and the oversize control publish warns
  rather than refusing (audit S-4) — filed as its own issue by the user's
  decision of 2026-09-09.
- A repeated subscribe to a held presence channel is charged by neither cap and
  amplifies (audit S-6) — pre-existing, filed.
