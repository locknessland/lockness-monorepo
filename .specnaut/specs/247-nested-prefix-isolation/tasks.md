# Tasks: Nested-prefix isolation for the Redis realtime driver

**Feature**: `247-nested-prefix-isolation` | **Backlog item**: [#288](https://github.com/locknessland/lockness-monorepo/issues/288)
**Derived from**: `plan.md` (approved 2026-09-06, both audits folded in, Q1 + Q2 answered)

**TDD is non-negotiable here** (constitution, *Engineering methodology*). Every behaviour task is
preceded by the test that fails without it, and two tasks exist for no other purpose than to
**observe a test fail before trusting it** — T011 and T012. That is not ceremony: `plan.md` §9 names
the vacuous-pass degradation as the single most likely way this P0 ships with a green suite.

## 🔒 Decision homes carried forward

No task may put a decision anywhere but its named home. Each task below that touches a rule names it.

| Decision | Home |
| :--- | :--- |
| Where an event topic's prefix ends | `drivers/redis.ts` — `eventTopicPrefix` (one **production** expression) |
| What may be a reserved separator | `drivers/redis.ts` — the constant block beside `PREFIX_GLOB_CHARS` |
| Which prefixes are usable | `drivers/redis.ts` — `assertUsablePrefix` |
| Control-frame authenticity | `drivers/redis.ts` — `#verifyAndDecode` (the ingest check is an **asker**) |
| An ingested topic of unexpected shape | `drivers/redis.ts` — `onMessage`'s strip branch |
| What counts as a prefix-derived name | `tests/prefix_anchoring.test.ts` — SC-004's source regex |
| What "anchored" means | `tests/recording_ports.ts` — `isAnchored` (docstring only; no code change) |

---

## Phase 1 — Setup

- [X] T001 Enumerate the true blast radius before editing anything, by search rather than by the plan's paragraph: run `grep -rn 'prefix' packages/realtime/` and `grep -rln 'app:rt\|PATTERN\|eventTopic\|probeTopic' packages/realtime/tests/`, and record the site list in the branch's working notes. FR-010 makes the search the authority; `plan.md` §8's table is its restatement and may be stale.
- [X] T002 Confirm the live-broker path is available for this branch (Docker present, a broker reachable on a port that is **not** 6379 — 6379 belongs to an unrelated container on this machine). If it is not, record that SC-005 will be verified by re-pointing only, and say so in the review.

## Phase 2 — Foundational (blocks every story)

- [X] T003 Add the reserved-separator constant block to `packages/realtime/drivers/redis.ts`, beside `PREFIX_GLOB_CHARS`: the refused sequence (`__`) named once, and the rule from FR-004 — *every reserved separator MUST begin with it* — stated with its proof sketch in the comment. This is the home for the separator rule; nothing else states it.
- [X] T004 Add `private get eventTopicPrefix()` returning `` `${this.prefix}__event:` `` to `packages/realtime/drivers/redis.ts`. This is the **single production home** of the separator (decision row 1). Do not add the topic change yet — T005 consumes it.

## Phase 3 — US1: two nested deployments are isolated outbound (P1)

**Independent test criteria**: with prefixes `app` and `app:eu`, no pattern either subscribes matches
any topic the other publishes — asserted at the routing decision, per pair, with a positive control.

- [X] T005 [US1] Rewrite `SC-002` in `packages/realtime/tests/prefix_anchoring.test.ts` as a loop over the FR-005 pair table — `('app','app:eu')`, `('app:eu','app')`, `('app','app_')`, `('app_','app')` — asserting the reachable set is empty **per pair with the pair named in the failure message**, and carrying a positive control in the same body (each prefix's own pattern matches its own topic). Delete the comment saying the test documents an unfixed defect. **This must be RED before T006.**
- [X] T006 [US1] Change `topic(channel)` in `packages/realtime/drivers/redis.ts` to build from `eventTopicPrefix`, and change the `onMessage` pattern (`:722`) to `` `${this.eventTopicPrefix}*` ``. Do **not** derive the pattern via `topic('*')` — `PUBLISH` is a literal context and `PSUBSCRIBE` a pattern context (decision row 1, security S7).
- [X] T007 [US1] Change the `onMessage` strip (`:724-725`) to a **fixed-offset slice** of `eventTopicPrefix.length` — never `replace`/`split`, because a channel may legally contain the separator — and replace the `: topic` fallback with a **drop plus a WARN naming the shape mismatch** (FR-002, A7/S6). The current fallback renames a mismatch into a plausible, charset-valid channel.
- [X] T008 [P] [US1] Add the `__` refusal to `assertUsablePrefix` in `packages/realtime/drivers/redis.ts` (FR-003), reading the sequence from T003's constant, and extend the constructor's `@throws` to cover it.
- [X] T009 [P] [US1] Add `__` fixtures — `app__x`, `__app`, `app__` — to `SC-005`'s list in `packages/realtime/tests/prefix_anchoring.test.ts`, **one occurrence each**, following the discipline that file already documents at `:414-417` for metacharacters (a fixture carrying two of a thing can be satisfied for the wrong reason).
- [X] T010 [US1] Add the SC-003 round-trip cases: a channel containing `:` (`presence-room.1:v2`) **and** a channel containing the reserved separator (`__event:x`), both publish → deliver → correct channel. The second is what fails if T007 was implemented with `replace()`.

## Phase 4 — US1b: the tests that must be proven, not assumed

This phase exists because of a measured defect class, not a hypothetical one.

- [X] T011 [US1] **Observe each of the three negative ingest tests fail before re-pointing it.** `packages/realtime/tests/driver_redis.test.ts:143`, `:162`, `:181` assert `got.length === 0`; `FakeRedisBus.command` (`:34`) routes by `topic.startsWith(pattern.replace(/\*$/,''))`, not by a glob, so after T006 those topics reach no handler and the assertions pass **vacuously**. For each: temporarily invert it to `assertEquals(got.length, 1)`, confirm it fails for the *delivery* reason and not the *assertion* reason, restore, then re-point the topic. Record the three observations in the commit body.
- [X] T012 [US1] Prove the rewritten SC-002 is not vacuous: mutate `eventTopicPrefix` back to `` `${this.prefix}:` `` and confirm SC-002 goes RED with the offending pair named; then mutate `globMatches` to `() => false` and confirm the **positive control** goes RED. A mutation whose file did not change is a dead mutant, not a result — verify the edit landed before reading either outcome.
- [X] T013 [P] [US1] Re-point the remaining event-topic sites found by T001's search — at minimum `driver_redis.test.ts:198`, `:238`; `driver_redis_live.test.ts:43` (`PATTERN`, used 8×), `:133`, `:180`, `:196`; `prefix_anchoring.test.ts:10`, `:30-42`, `:161`, `:232-242`, `:294`, `:349-351`. Work from T001's list, not from this line.

## Phase 5 — US2: a control frame can never reach the event handler (P1)

**Independent test criteria**: no pattern derived from any accepted prefix — including the same
one — matches any control topic.

- [X] T014 [US2] Extend the SC-002 pair table to assert control topics are unreachable from every event pattern in the table, including each prefix's own. The proof says this holds; the test is what keeps it holding.
- [X] T015 [US2] Rewrite the `controlTopic` docstring in `packages/realtime/drivers/redis.ts` (`:654-656`). Its stated reason — *"WITHOUT the `:` separator so it never matches the `${prefix}:*` event pattern"* — is the sentence this change invalidates; the new reason is FR-004's invariant.
- [X] T016 [US2] Update the `onMessage` ingest-check comment (`:736-744`) to record that it is **defence in depth, a second asker and not a second decider** — `#verifyAndDecode` decides (decision row 4). Do not remove the check: it is now unreachable for control frames, and that is the point.

## Phase 6 — US3: the live-broker suite still proves what it claims (P1)

**Independent test criteria**: the live suite passes on its own assertions, none timing out and none
passing because a topic reaches nothing.

- [X] T017 [US3] Re-point `probeTopic` in `packages/realtime/tests/live_realtime.ts:83` to an event topic under the new marker. `awaitSubscribers` (`:290-312`) counts `PUBLISH` receivers on it and gates **every** live test; un-re-pointed, the whole live suite times out after 10s.
- [X] T018 [P] [US3] Delete the unused `eventTopic` from `packages/realtime/tests/live_realtime.ts` (`:64` declaration, `:80` definition). `grep -rn eventTopic packages/` returns those two lines and no caller — a second spelling nothing executes cannot go red, so updating it would preserve the hazard rather than fix it.
- [X] T019 [US3] Run the live-broker suite and confirm it passes. If T002 found no broker, state in the review that SC-005 was not executed — do not report it as passing.

## Phase 7 — US4 + FR-012: anchor the keys (Q1 answered yes)

- [X] T020 Move the five live keys in `packages/realtime/drivers/redis.ts` to the anchored shape: `presenceKey` `:663`, `ownedKey` `:667`, `aliveKey` `:671`, `instancesKey` `:675`, `revocationIndexKey` `:688` → `${prefix}__presence:` / `__owned:` / `__alive:` / `__instances` / `__revocations`.
- [X] T021 **Leave `legacyRevokedIndexKey` (`:693`) and `legacyRevokedKey` (`:698`) on their `:` names**, and add a comment saying why: they exist solely to read what a pre-#276 instance wrote at those exact names, so renaming them deletes their only purpose. Name [#278](https://github.com/locknessland/lockness-monorepo/issues/278) as what removes them and closes the residual.
- [X] T022 Update `PREFIX_MEMBERS` and the `shapes` map in `packages/realtime/tests/prefix_anchoring.test.ts` (`:288-300`), and SC-004's source regex (`:262-268`) — which the `eventTopicPrefix` refactor changes what it matches. **Deliberate edits, not go-green edits**: the file's own message says a roster edited to go green tracks nothing.
- [X] T023 [P] Update `keys()` in `packages/realtime/tests/live_realtime.ts` (`:69-83`) and the live key assertions to the anchored names.

## Phase 8 — FR-013: the prefix allowlist (Q2 answered yes)

- [X] T024 Replace the denylist in `assertUsablePrefix` with the positive allowlist `/^[A-Za-z0-9:._-]{1,64}$/` plus the `__` rule, in `packages/realtime/drivers/redis.ts`. **Keep `PREFIX_GLOB_CHARS`** as defence in depth with a comment recording that the allowlist now implies it — removing it would make the guard depend on the allowlist never loosening.
- [X] T025 [P] Add allowlist fixtures to `SC-005`: a prefix with a space, one with a newline, one over 64 characters, and confirm `lockness:realtime` (the default, 17 chars) still passes. Update the `assertUsablePrefix` docstring (`:200-231`) and the constructor `@throws`.

## Phase 9 — Documentation (FR-006, FR-007, FR-011)

- [X] T026 State the prefix's guarantee **once**, verbatim per FR-006, at `RedisBroadcastDriverOptions.prefix` in `packages/realtime/drivers/redis.ts:253-261`. Do **not** soften it — the docstring is currently correct, and #282 wrote it; the risk here is regression, not omission.
- [X] T027 [P] Turn the other four sites into pointers: `packages/realtime/drivers/redis.ts:33-35`, `docs/realtime.md:427-441`, `packages/realtime/README.md:50-55`, `packages/realtime/AGENTS.md:93-102`. Two carry statements that become **false**: `docs/realtime.md`'s *"does not isolate outbound either"*, and `AGENTS.md`'s claim that SC-002 is landed `ignore`d (already false today).
- [X] T028 [P] Add to `docs/realtime.md`: the wire change, the key change, the fleet-restart consequence, and FR-011's residual in **both** directions — inbound `PUBLISH` **and** outbound read of control frames, rosters, instance sets and the revocation index by any broker client. Name the per-deployment Redis ACL as the **condition** under which the out-of-scope decision is safe, not as a suggestion.
- [X] T029 [P] Record FR-007's ordering constraint where a release reads it, not only in the plan: this must land in or before the first release that publishes `@lockness/realtime`. Add the wire + key change to the package's release notes.
- [X] T030 [P] Correct the `isAnchored` docstring in `packages/realtime/tests/recording_ports.ts:120-142`, which narrates the #288 leak in the present tense, and add the line recording that anchoring is **not exclusive** between prefixes differing by a trailing separator (`isAnchored('app___event:x','app')` is `true`) — exclusivity is SC-002's job. `ANCHOR_SEPARATORS` needs **no code change**; it already reads `[':', '__']`.
- [X] T031 [P] Fix the stale `#273` reaper comment at `packages/realtime/drivers/redis.ts:221`, which describes a `SCAN MATCH` this file no longer has (it lives in `tests/live_realtime.ts:425`). In scope only because T024 rewrites the block it sits in; otherwise it would be a follow-up.

## Phase 10 — Polish and gate

- [X] T032 File the deferred per-channel `SUBSCRIBE` follow-up and write its issue number into `plan.md` §12. An unnumbered "recorded as a follow-up" is how #278 describes a migration becoming permanent. Record both arguments: it is an **optimisation, not a substitute** (it cannot satisfy SC-002 — exact-topic collision), what it buys (fan-out O(hosted) rather than O(prefix)), and that **#290 blocks it**.
- [X] T033 File the key-collision residual for the two legacy `:` keys as a note on [#278](https://github.com/locknessland/lockness-monorepo/issues/278), so removing the dual-read path is recorded as closing it.
- [X] T034 Run the full gate: `deno fmt && deno lint && deno check && deno task test`, plus `deno task deps:analyze`, `deno task agents:brief --check` and `deno task publish:check`. All green before review.
- [X] T035 Commit in three categories — `fix` (driver, guard, keys), `test` (SC-002, the re-points, the harness, the mutation observations), `docs` — never bundled. Constitution rule 9.

---

## Dependencies

```
T001,T002  →  T003,T004  →  ┌─ US1  T005 → T006 → T007 → T010
                            │        T008 ∥ T009
                            │  US1b  T011, T012, T013   (after T006/T007)
                            ├─ US2   T014 → T015, T016  (after T006)
                            ├─ US3   T017, T018 → T019  (after T006)
                            ├─ FR-012 T020, T021 → T022, T023
                            └─ FR-013 T024 → T025
                                        ↓
                            Docs T026 → T027 ∥ T028 ∥ T029 ∥ T030 ∥ T031
                                        ↓
                            Polish T032 ∥ T033 → T034 → T035
```

**T005 must be RED before T006.** **T011 and T012 gate trusting any green in this branch.**

## Parallel opportunities

- T008 ∥ T009 (guard and its fixtures, different files)
- T013 ∥ T018 ∥ T023 (test re-points in three different files)
- T027 ∥ T028 ∥ T029 ∥ T030 ∥ T031 (five docs, no shared lines)
- T032 ∥ T033 (two backlog writes)

## Implementation strategy

**MVP = Phase 3 + Phase 4** (T005–T013). That closes the P0 disclosure and proves it closed. It is a
checkpoint inside the full path, not a stopping point: Phases 5–8 were approved at the plan stop and
Phase 7/8 exist because the user answered Q1 and Q2 yes.

**The order is not negotiable at two points.** T005 before T006, or the test cannot be seen to fail.
T011/T012 before any claim that this branch is green, or the suite reports a result it did not
measure.
