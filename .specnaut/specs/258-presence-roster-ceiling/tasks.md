# Tasks: Bounded presence snapshot on subscribe

**Plan**: `.specnaut/specs/258-presence-roster-ceiling/plan.md` (approved 2026-09-14) | **Branch**: `258-presence-roster-ceiling` | **Item**: [#339](https://github.com/locknessland/lockness-monorepo/issues/339)

Tests are required: the plan's §6 test plan is binding and the witness is written first. Every task
that touches a rule names its 🔒 home from plan §5. All paths below are relative to
`packages/realtime/` unless stated otherwise.

## Phase 1 — Setup

- [X] T001 Record the current `churn_cost_329` totals and the current results of batteries `presence_join_323`, `roster_sync_330` and `roster_read_barrier_333` as the baseline (`deno test -A tests/churn_cost_329.test.ts`; `deno task mutate …`), with the output kept in the implementer's report

## Phase 2 — Foundational: the witness (red first)

- [X] T002 Write `tests/presence_snapshot_bound_339.test.ts` rows 1–7 exactly as in plan §6, including the literals `409 701`, `40 971`, the encoded `subscribed` frame size, and `MAX_PRESENCE_SNAPSHOT_MEMBERS === 100`. Each driver-order test states at its call site that only memory/FakeRedis guarantee join order
- [X] T003 Run T002 against the unchanged source and capture the red output (the type errors on `here` count as red). Commit it as `test(339)` only if it fails for the right reason

## Phase 3 — US1 + US2 (P1): bounded snapshot; small rooms unchanged

- [X] T004 [P] [US1] Add `PresenceSnapshot { members; total; source }` with JSDoc in `channel.ts`, beside `PresenceMember` (home: the snapshot shape)
- [X] T005 [P] [US1] Create the internal module `presence_snapshot.ts` with JSDoc stating: no sort, no mutation, silent, and `total` comes from the read already made. It contains:
  - `sameMemberId(a, b)` (home: the `String(id)` comparison), extracted from `manager.ts:1757-1758`;
  - `boundPresenceSnapshot(roster, selfId, limit): Omit<PresenceSnapshot, 'source'>` (home: the cut rule). If the roster fits, return it unchanged; otherwise take the first K and let self replace the last slot; compute `total = roster.length` before the cut. It must NOT import from `manager.ts`
- [X] T006 [P] [US1] Unit rows for `boundPresenceSnapshot` and `sameMemberId` in `tests/presence_snapshot_unit_339.test.ts`: fits unchanged; cut to K; self replaces the last slot; self already inside; no self; input not mutated; `total` taken before the cut
- [X] T007 [US1] In `manager.ts`, make these changes:
  - export `MAX_PRESENCE_SNAPSHOT_MEMBERS = 100`, next to `MAX_PRESENCE_MEMBER_BYTES`;
  - add the option `maxPresenceSnapshotMembers?` with JSDoc, resolved once in the constructor through the existing `assertCap`;
  - replace `SubscribeResult.members?`/`rosterSource?` with `here?: PresenceSnapshot`;
  - replace the comparison at `:1757-1758` with `sameMemberId`
- [X] T008 [US1] In `manager.ts` `#closingRead(channel, clientId)`, make one call after the read settles, on both the authoritative and local branches (home: where the cut is applied). Look self up in the same statement, via `this.presence.get(channel)?.get(clientId)?.id` (home: who self is, and when). The three exits (`:1306`, `:1335`, `:1433`) change identically to pass `clientId`, and no fourth call is added. Keep `rosterSnapshot`'s per-caller spread (`:1800`)
- [X] T009 [P] [US1] Add `total?: number` with JSDoc on the `subscribed` frame and the presence frame in `protocol.ts`. `members` keeps its flat position
- [X] T010 [P] [US1] Export `MAX_PRESENCE_SNAPSHOT_MEMBERS` and `type PresenceSnapshot` from `mod.ts`, and NOT `boundPresenceSnapshot`/`sameMemberId`
- [X] T011 [US2] Migrate the 20 reader lines in the 10 test files to `here?.members` / `here?.source`: `authorize_denial_331`, `channel_revoke_332`, `emit_isolation_323`, `presence`, `presence_authoritative` (plus the comment at `:8`), `presence_join_compensation_323` (plus the messages at `:289-290`), `presence_rejoin_327`, `presence_roster_read_333`, `roster_control_atomicity`, `log_encoding_291`
- [X] T012 [US2] In `tests/presence_rejoin_327.test.ts:169-190`, keep the whole-room assertion, add `here?.total === 2`, and add a call-site comment citing #339 and the bound. Update the message at `:184` (FR-013)
- [X] T013 [US1] Run T002 rows 1, 2, 3 and 6 plus T006 until green

## Phase 4 — US3 (P2): configurable bound

- [X] T014 [US3] Confirm T002 row 2 (K=10 → 40 971 bytes) and row 7 (construction refuses `0`, `1.5`, `NaN`) are green. No new code beyond T007

## Phase 5 — US4 (P2): re-join over the bound

- [X] T015 [US4] Confirm T002 row 4 is green: re-join over the bound, self included, `members.length < total`, nothing written or announced

## Phase 6 — US5 (P3): local fallback bounded

- [X] T016 [US5] Confirm T002 row 5 is green: `listMembers` rejects → `source: 'local'`, cut, self kept

## Phase 7 — Mutation batteries

- [X] T017 Create `tests/mutations/presence_snapshot_339.ts` with the five rows from plan §6 (bare `slice`; `limit + 1`; `total` taken after the cut; cut only on the authoritative branch; default `100 → 101`), following the existing battery harness shape
- [X] T018 Re-anchor `tests/mutations/presence_join_323.ts:241-243` on the new `#closingRead` call text
- [X] T019 Run `deno task mutate presence_join_323 roster_sync_330 roster_read_barrier_333 presence_snapshot_339` and prove every row is live and killed. Also run `tests/churn_cost_329.test.ts` and confirm its totals match T001, unchanged

## Phase 8 — Polish: docs and lasting rules

- [X] T020 [P] In `docs/realtime.md` (repo root), update:
  - `:592-596` and `:617-621`: state the ceiling and that the read stays O(room), linking #341;
  - `:598-602`: say "the `HGETALL` reply", nothing more;
  - `:1036-1062`: move the example to `here`, and cover the bound, keep-self, `total`, update-frame drift, "UI hint, not an access list", the join-order window and one member id per identity (FR-015);
  - the v0.4.0 intro at `:1477-1479`;
  - new item 6: before/after, a note that the change is a compile error, the finite interim K with K·(M+1)+1 and "lower it once clients read `total`" (FR-012, S2), and what clients that ignore presence should do
- [X] T021 [P] Update `README.md:129-134` in `packages/realtime/`
- [X] T022 [P] In `packages/realtime/AGENTS.md`, add a where-to-work row ("which members a subscribe returns"). Add the FR-014 pitfalls: no cut in the barrier or a driver; the cut is silent; `total` costs no command and is snapshot-time only; no sort; the per-caller spread. Fix the stale "fallback is in `subscribe`" at `:377-393`, then regenerate the generated blocks with `deno task agents:brief`
- [X] T023 [P] Update the manager JSDoc and comments at `manager.ts` `:573-588`, `:1115-1117`, `:1144-1146`, `:1250-1253`, `:1283-1285` and `:1453-1454`. Leave `:1777-1787` unchanged
- [X] T024 [P] Update the battery count in `docs/testing.md:270` (repo root) to 17 realtime batteries
- [X] T025 Run the full gate from the repo root, capturing each exit status separately: `deno fmt --check`, `deno lint`, `deno check`, `deno task deps:analyze`, `deno task agents:brief --check`, `deno task test`

## Dependencies

- T001 → T002 → T003 (red) → Phase 3.
- In Phase 3: T004 and T005 come first (T005 needs T004's type). T006 needs T005. T007 needs T004. T008 needs T005 and T007. T009 and T010 are independent. T011 and T012 need T007. T013 needs everything above.
- Phases 4–6 need only T013. They are verifications, since the behaviour lands in T007/T008 by design (one call site).
- Phase 7 needs T013. Phase 8 needs Phase 7, and T025 comes last.

## Parallel examples

- Phase 3: T004 ‖ T009 ‖ T010, then T005 ‖ T007, then T006 ‖ T011 ‖ T012.
- Phase 8: T020 ‖ T021 ‖ T022 ‖ T023 ‖ T024.

## Implementation strategy

The MVP is T001–T013: the bounded, self-kept snapshot, green on the witness. It is a checkpoint
inside the full path, not a place to stop. US3–US5 are verification of the same single call site,
then the batteries prove the rules are live, then the docs carry the rules that must outlive this
plan.

Commit shape at merge: `feat(339)` (source plus the compile-required test migration), `test(339)`
(witness, unit, battery), `docs(339)`.
