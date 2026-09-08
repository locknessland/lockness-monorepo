# Tasks: drop the two fleet-compatibility shims (#278 + #322)

**Plan:** `plan.md` (510 lines, both audits folded in) · **Branch:** `254-drop-compat-shims`

Every task names the file it changes. Where a task touches a rule in the plan's
🔒 decision table, the task names that rule's **home** — a decision may not land
anywhere else.

---

## Phase 1 — Setup

- [X] T001 Record the before-measurements in `.specnaut/specs/254-drop-compat-shims/baseline.md`: command count for `listRevoked` at 0/1/50 revocations, and `grep -c` for each of the three enumerations the plan pins (32 `legacyRevoked` refs, 11 stale promises, 6 test files)
- [X] T002 Confirm the scratch broker on port **6388** is up and that `miximodel-redis` on 6379 is untouched, in `packages/realtime/tests/live_realtime.ts` terms

---

## Phase 2 — Foundational (blocks every story)

- [X] T003 Add `maxWatchedChannels?`, `maxChannelsPerConnection?` and `anonymousHostingShare?` to `ChannelManagerOptions` in `packages/realtime/manager.ts`, with JSDoc naming each default — **home: the constructor resolves them; nothing else reads the constants**
- [X] T004 Resolve all three in the `ChannelManager` constructor into private fields using `??` (never `||`) in `packages/realtime/manager.ts` — FR-009's "silently repairs rather than refuses" clause
- [X] T005 Add construction-time validation in `packages/realtime/manager.ts`: `Number.isInteger(v) && v > 0` for both caps, `Number.isFinite(v) && v > 0 && v <= 1` for the share, and `maxChannelsPerConnection <= maxWatchedChannels` — **home: the constructor, decision-table row 3**
- [X] T006 Change `#checkChannelCaps`'s signature to `(channel, clientId, isIdentified: boolean)` in `packages/realtime/manager.ts` and pass `connection.identity !== null` from `subscribe` — a boolean at the boundary, never the `Connection`, per decision-table row 6

---

## Phase 3 — US1: a revocation reconcile costs one round trip (P1)

**Independently testable:** the reconcile issues exactly one command and no derived name contains `:revoked`.

- [X] T007 [US1] Delete `#legacyRevoked`, `legacyRevokedIndexKey` and `legacyRevokedKey` from `packages/realtime/drivers/redis.ts`, including the exemption docstring at `:1025-1041`
- [X] T008 [US1] Delete the `#legacyRevoked` loop from `listRevoked` in `packages/realtime/drivers/redis.ts`, keeping the `isValidName` filter on the sorted set's own members — FR-002/R-7
- [X] T009 [US1] Transcribe the `#304` battery row's rationale (why the surviving filter is belt-and-braces) into `listRevoked`'s docstring in `packages/realtime/drivers/redis.ts` **before** T010 removes the row — FR-005b
- [X] T010 [US1] Retire the two mutation rows at `:105` and `:120-123` in `packages/realtime/tests/mutations/connection_id_304.ts`
- [X] T011 [US1] Delete the stale re-issue instruction from `listRevoked`'s comment (`packages/realtime/drivers/redis.ts:1455-1467`) — FR-015
- [X] T012 [P] [US1] Drop both legacy names from `PREFIX_MEMBERS` and stop `exercise` driving them in `packages/realtime/tests/prefix_anchoring.test.ts` (`:166`, `:264`)
- [X] T013 [P] [US1] Remove `CANNED.SMEMBERS` / `CANNED.EXISTS` (`:214-218`) and the two `shapes` entries (`:445-446`) in `packages/realtime/tests/prefix_anchoring.test.ts`
- [X] T014 [US1] Delete `UNANCHORED_BY_DESIGN` (`:831-834`) and its exemption branch (`:864-871`) so `FR-004 source` is unconditional, in `packages/realtime/tests/prefix_anchoring.test.ts` — **home: nowhere; after FR-001 no name may skip the anchor** (decision-table row 9)
- [X] T015 [US1] Add the `tail[2] !== '_'` clause to the anchoring assertion in `packages/realtime/tests/prefix_anchoring.test.ts`, with the reason in its failure message — FR-003b
- [X] T016 [P] [US1] Fix the header docstring at `packages/realtime/tests/prefix_anchoring.test.ts:145` ("The nine members" for a list of ten, eight after this) and rework the `alpha:revoked` worked example at `:429-433`
- [X] T017 [P] [US1] Remove the `legacyRevoked` fixture field from `packages/realtime/tests/live_realtime.ts` (`:71`, `:82`)
- [X] T018 [P] [US1] Remove the legacy reference from `packages/realtime/tests/connection_id_charset.test.ts`
- [X] T019 [P] [US1] Delete the two `#276 FR-009` tests from `packages/realtime/tests/revocation_atomicity.test.ts` (`:165`, `:194`)
- [X] T020 [US1] Write SC-001 in `packages/realtime/tests/revocation_atomicity.test.ts`: a recording port proves exactly one command at 0, 1 and 50 revocations
- [X] T021 [US1] Write SC-002 in `packages/realtime/tests/prefix_anchoring.test.ts`: no name derived by `drivers/redis.ts` contains `:revoked`
- [X] T022 [P] [US1] Write SC-003 and SC-003b in `packages/realtime/tests/prefix_anchoring.test.ts`: prefixes (`app`, `app:revoked`) and (`app`, `app_`) share no derived key
- [X] T023 [US1] Run `grep -rn 'legacyRevoked' packages/ docs/` and confirm zero hits — the enumeration is the boundary, not T012–T019

---

## Phase 4 — US2: a cap breach is refused, not silently admitted (P1)

**Independently testable:** a breach throws and mutates nothing; a join that grows no set is still admitted.

- [X] T024 [US2] Replace both `console.warn` bodies in `#checkChannelCaps` with `throw new ChannelLimitError(scope, count, limit)` in `packages/realtime/manager.ts`, reading the resolved private fields — **home: `#checkChannelCaps`, decision-table row 4**
- [X] T025 [US2] Drop the count and the limit from `ChannelLimitError`'s `super()` message in `packages/realtime/manager.ts`, keeping both as `readonly` properties — FR-016/S-3
- [X] T026 [US2] Widen `ChannelLimitError.scope` to include `'instance-anonymous'` and document it as an **open** set consumers must handle unknown values from, in `packages/realtime/manager.ts` — FR-017/S-2
- [X] T027 [US2] Implement FR-018's headroom in `#checkChannelCaps` (`packages/realtime/manager.ts`): when `!isIdentified` and the join grows `subscriptions`, the effective cap is `floor(maxWatchedChannels × anonymousHostingShare)`, refused with scope `'instance-anonymous'` — **home: `#checkChannelCaps`, decision-table row 6**
- [X] T028 [US2] Delete all eleven stale promises: `packages/realtime/manager.ts` `:41-47`, `:588`, `:596`, `:612`, `:626` and the stray duplicate `@param` block; `packages/realtime/tests/channel_watch_295.test.ts` `:176`, `:196`, `:208`, `:213`, `:342`, `:369` — FR-010
- [X] T029 [US2] Rewrite `MAX_WATCHED_CHANNELS`'s docstring in `packages/realtime/manager.ts`: the SC-007 / R-8 couplings belong to the **default**, and raising the cap voids both — FR-010b/A-3
- [X] T030 [US2] Rewrite **both** `#295/SC-017` tests (`:175` connection branch, `:324` instance branch) in `packages/realtime/tests/channel_watch_295.test.ts` to assert the throw **and** that `subscriptions`, `connections`, `presence` and `#channelsByClient` are unchanged — FR-011, SC-004/SC-005
- [X] T031 [US2] Fix `#295/FR-017` at `packages/realtime/tests/channel_watch_295.test.ts:217`: replace the now-tautological `warnings.filter(…) === []` at `:243-247` with "no `ChannelLimitError` is thrown" — FR-012/A-9
- [X] T032 [US2] Retitle and rework `#295/FR-017` at `packages/realtime/tests/channel_watch_295.test.ts:367` — its title says the error "is never raised", one file from the code that raises it
- [X] T033 [US2] Add SC-006's instance half in `packages/realtime/tests/channel_watch_295.test.ts`: a join that grows no set is admitted **at and above the instance cap**, which no test reaches today
- [X] T034 [P] [US2] Write SC-010 in `packages/realtime/tests/channel_watch_295.test.ts`: the error message carries no digit from the count or the limit, and both remain readable as properties
- [X] T035 [US2] Write SC-013 and SC-014 in `packages/realtime/tests/channel_watch_295.test.ts`: at `floor(1000 × 0.8)` an anonymous connection is refused a new channel with scope `'instance-anonymous'` while an identified one is admitted and the anonymous one still joins a hosted channel; with the share at `1` the anonymous connection reaches the full cap
- [X] T036 [US2] Run SC-009's widened grep over `packages/realtime/` and confirm no surviving reference to a future refusal

---

## Phase 5 — US3: an operator moves a cap instead of forking (P2)

**Independently testable:** a raised cap admits what the default refuses; an unusable cap throws at construction.

- [X] T037 [US3] Write SC-007 in `packages/realtime/tests/channel_watch_295.test.ts`: a manager built with a raised cap admits subscribes the default refuses and still refuses past the raised value
- [X] T038 [P] [US3] Write SC-008 in `packages/realtime/tests/channel_watch_295.test.ts`: construction throws for `0`, `-1`, `1.5`, `NaN`, `Infinity`, `"500"` and an inverted cap pair; `1.0` is accepted
- [X] T039 [P] [US3] Write SC-015 in `packages/realtime/tests/channel_watch_295.test.ts`: construction throws for an `anonymousHostingShare` of `0`, `-0.1`, `1.1`, `NaN`, `"0.8"`; `1` and `0.5` are accepted

---

## Phase 6 — Polish & cross-cutting

- [X] T040 Rewrite `docs/realtime.md:483-497`: the caps are **enforced and tunable**, with the reconnect cost of a raised value and the headroom dial
- [X] T041 Add the `v0.2.0 → v0.3.0` upgrade section to `docs/realtime.md`: the caps refuse and how to raise them; a raised cap voids SC-007 and R-8; `ChannelLimitError`'s message must not reach a client; the abandoned `{prefix}:revoked*` keys may be deleted; **and the ACL example's two `~app:revoked` grants must be dropped** — FR-013/S-6
- [X] T042 Drop the `~app:revoked` and `~app:revoked:*` grants from the ACL example at `docs/realtime.md:719`, and remove the rollout notes at `:492-497`, `:761` and the stale instruction at `:427-432`
- [X] T043 [P] Document the caps and all three options in `packages/realtime/README.md` — **currently zero mentions**, the gap FR-014's search exists to catch
- [X] T044 [P] Update the pitfalls in `packages/realtime/AGENTS.md`, **outside** the `<!-- generated:* -->` blocks
- [X] T045 Run FR-014's full search over `docs/`, `packages/*/README.md` and `packages/*/AGENTS.md`, **including the numbers** `1 000` / `1_000` / `100`, and read the output rather than skimming it
- [X] T046 Regenerate the package brief (`deno task agents:brief`) and update `docs/testing.md` if the `#304` battery's row count is quoted there
- [X] T047 Run the `#304` mutation battery and prove each surviving row's anchor still matches exactly once — a mutation that never executes reads as a result
- [X] T048 Run the full gate: `deno fmt && deno lint && deno check && deno task test`, plus `deno task deps:analyze`
- [X] T049 Re-run T001's measurements and record the after-figures in `baseline.md`
- [X] T050 Commit in four categories: `refactor(278)`, `feat(322)`, `test(254)`, `docs(254)` — **landed as FIVE.** The trailing-underscore guard found by T022 changes behaviour, so it cannot sit in a `refactor` commit; it took its own `fix(278)`.

---

## Dependencies

```
Phase 1 (T001-T002)
      ↓
Phase 2 (T003-T006)  ← blocks US2 and US3; US1 does not need it
      ↓
  ┌───┴────────────────┬─────────────────┐
US1 (T007-T023)   US2 (T024-T036)   US3 (T037-T039)
  │                    │                 │
  └────────────────────┴─────────────────┘
                       ↓
             Phase 6 (T040-T050)
```

- **US1 is independent of Phase 2** — the revocation removal touches only `drivers/redis.ts` and the prefix tests. It can land first and ship alone.
- **US3 depends on US2** only for `#checkChannelCaps` reading fields rather than constants (T024).
- T009 **must** precede T010: the rationale is transcribed before the row that carries it is retired.
- T027 depends on T006 (the boolean) and T026 (the third scope).

## Parallel opportunities

| Group | Tasks |
| :--- | :--- |
| US1 test edits, different files | T012, T013, T016, T017, T018, T019, T022 |
| US2 / US3 assertions, one file each | T034, T038, T039 |
| Documentation | T043, T044 |

## MVP

**US1 alone** — it is the whole of #278, closes the last unanchored key names, and
restores the flat one-round-trip reconcile. It needs no part of Phase 2.

## Counts

| | |
| :--- | :--- |
| Total | **50** |
| US1 | 17 · US2 | 13 · US3 | 3 |
| Setup + foundational | 6 |
| Polish | 11 |
