# Tasks: sweep a dead instance's owned set in bounded pages

**Plan**: `.specnaut/specs/264-paged-owned-sweep/plan.md` (approved 2026-09-23) | **Backlog item**:
[#358 — Realtime: sweep a dead instance's owned set in bounded pages, not one SMEMBERS that can breach the shared client's reply cap](https://github.com/locknessland/lockness-monorepo/issues/358)

TDD is mandatory (constitution): every behaviour task starts with a witness proven red on the
current code. Every task that touches a rule in the plan's 🔒 decision table names that rule's home —
the decision may not land anywhere else. All homes are in `packages/realtime/drivers/redis.ts`
unless stated. Witness and mutant ids are the plan's §4 tables (W1–W11, WC; M1–M11, F1, F2, L1).
**The fake lands first**: once the driver issues `SSCAN`, every FakeRedis sweep test needs the arm.
**Waiting rule** (FR-012, A1): a test that needs a finished pass drains with
`await time.runMicrotasks()` (or `tickAsync(0)`) after the tick; `close()` only where `close()` is
the subject (W4, W10); never a fixed microtask count, never a new `settle()` copy.

## Phase 1: Setup — the fake's scan model and its conformance

- [X] T001 Private scan core in `packages/realtime/tests/fake_redis.ts` (**home of the FakeRedis scan model**, FR-011, A5): member list + cursor + `COUNT` → one page. At cursor `0` with ≤ `COUNT` members, answer whole with cursor `0`; otherwise walk a fixed virtual slot table, one slot per member by a deterministic hash (removals never shift another member), `COUNT` slots per call, next cursor = next unvisited slot or `0`; every member present throughout returned exactly once, never duplicated; an absent key answers `['0', []]`. Call ceiling **per key and cumulative**, sized above the longest legitimate test (state the sizing), exceeded → `#reject` (ledger rejection that throws). Export the slot function as the static `FakeRedis.scanSlot(member)`.
- [X] T002 `SSCAN` arm in `packages/realtime/tests/fake_redis.ts`, the core's first caller: `SSCAN key cursor COUNT n`; refuse through `#reject` a missing `COUNT`, any option but `COUNT` (`MATCH` among them), a cursor not matching `/^(0|[1-9][0-9]{0,19})$/`, a non-positive `COUNT`.
- [X] T003 File header of `packages/realtime/tests/fake_redis.ts`: add `SSCAN` to the modelled surface; state what it does not model (duplicates, rehash); state the deliberate divergence (whole at ≤ `COUNT` = 100 vs Redis's listpack ≤ 128 entries of ≤ 64 B — the fake is stricter); state the ceiling and its sizing; correct the stale "`#reconcile` runs on a real `setInterval`" sentence (#355 made it a self-re-arming `setTimeout`).
- [X] T004 [P] WC, fake-only refusals, in `packages/realtime/tests/fake_redis_conformance.test.ts` (#280): `SSCAN` without `COUNT`, with `MATCH`, with another option, with `'00'` / `'01'` / non-digit / 21-digit cursors → refused and recorded in the ledger.
- [X] T005 [P] WC, cross-backend, in `packages/realtime/tests/live_fake_conformance.test.ts` (#285; FR-013a — **the one place SCAN replies are compared**): the normalizer sorts an `SSCAN` reply's `value[1]` only when its cursor is `'0'`, and its "sort those two, and only those two" comment says so; a shape case (absent key → `['0', []]`, a small set); a coverage case that iterates to cursor `0` on each backend and compares the union with the seeded set, its seed > 128 entries or holding one > 64 B, asserting the live broker needed more than one call. Correct the `:385` title "SMEMBERS, which three production call sites depend on" (two today, one after T012).
- [X] T006 Rows F1 (`SSCAN` accepts a missing `COUNT` again) and F2 (`SSCAN` accepts `MATCH` again) in `packages/realtime/tests/mutations/fake_redis_280.ts`, both killed by T004's WC, proven live.

## Phase 2: Foundational — witnesses, red first

- [X] T007 New `packages/realtime/tests/sweep_paging_358.test.ts` (FakeRedis behind the serializing wrapper, FakeTime, the FR-012 drain). Red witnesses, each run and the red output saved to the scratchpad before any driver change:
  - W1 (**red**): A holds 307 slots; one drained pass → every slot gone from `readRoster`, one `left` each, A deregistered; no `SMEMBERS` on `owned:A`; ≥ 4 `SSCAN`s, each `COUNT` = `OWNED_SCAN_COUNT` (imported — until T011 exports it, the file fails to compile, which is its red).
  - W4 (**red: the suffix**): `close()` on B after its first page → A registered, the rest still in `owned:A`, no sweep command after `close()` resolves, the "released" line carries `— unfinished: it stays registered and a later pass resumes it`; then C's pass finishes, each member announced once overall.
  - W6 (**red: the suffix**): a hold of still-lapsed A lands between two pages — (i) ahead of the cursor (placed with `FakeRedis.scanSlot`) → released this pass; (ii) behind it → missed, deregistration *kept*, suffix logged, the next pass releases it.
  - W7 (**red: the suffix**): 150 unparsable entries ahead of 5 parsable ones → one pass releases all 5; exactly one "released" line at N = 5 **with** the suffix; A registered; a second pass logs nothing and A stays registered.
- [X] T008 [P] W2 (**red, live broker**) in `packages/realtime/tests/sweep_paging_358.test.ts`, gated on `LIVE_BROKER` from `packages/redis/tests/live_broker.ts`: one seeding `EVAL` writes ≈ 42,000 maximal owned entries (≈ 812 wire bytes each, ≈ 34 MB > 33,554,432 B); wait by polling `SISMEMBER <instances> A` against a named 120 s deadline constant (sized in a comment: ≈ 42k releases at ≤ 1 ms, doubled), failing with the elapsed time → A deregistered, `owned:A` gone, no "failed" line; a command on B's client right after completes with no refusal-window error. Record the red run (the "RESP reply exceeds" line) on `main`.
- [X] T009 [P] W9 (unit) in `packages/realtime/tests/sweep_paging_358.test.ts`: `decodeScanReply` accepts `['0', []]`, a 20-digit cursor with items; refuses nil, wrong arity (a three-element reply with a marker in its extra member), missing / empty / non-digit cursor, `'00'`, `'01'`, a 21-digit cursor, `'x<marker>'`, a non-array item list — every refusal's message byte-identical to `SCAN_REPLY_REFUSED` and free of the marker. Red until T010 exports both.

## Phase 3: US1 + US2 — one pass over any size, no reply over a page (P1)

- [X] T010 [US2] `decodeScanReply` and `SCAN_REPLY_REFUSED` beside `decodeDeregisterReply` (**home of what a SCAN-family reply envelope means**, FR-003, A4): accept only `[bulk matching /^(0|[1-9][0-9]{0,19})$/, array]`, return `{ cursor: string, items: readonly unknown[] }`; everything else throws the constant, which describes the `[cursor, array]` shape and names no command or key. Both exported for the test suite only (not from `mod.ts`), JSDoc with `@throws` and `@example`. Turns W9 green.
- [X] T011 [US1] `OWNED_SCAN_COUNT = 100` beside `OWNED_SEP` (**home of the page size, not configurable**, FR-001): exported for tests only; JSDoc carries the bound arithmetic (≤ 200 B channel + 1 + ≤ 600 B id ≈ 812 wire bytes; ≈ 100 KB per page at maximum, ≈ 5 KB typical, against 32 MiB) and that the bound holds only while the broker honours `COUNT` (S4).
- [X] T012 [US1] [US2] `#sweepOwned` becomes the page loop (**home of "the owned set is read only here, by `SSCAN … COUNT OWNED_SCAN_COUNT`" and of "one full iteration, ending only on cursor `'0'`, no budget, no resume state"**, FR-002, FR-004): `let cursor = '0'` / `do {` / closing check (T015) / `decodeScanReply(await this.command.command('SSCAN', this.ownedKey(deadId), cursor, 'COUNT', String(OWNED_SCAN_COUNT)))` / `const end = await this.#sweepPage(deadId, page.items, count)` / `if (end !== 'swept') return end` / `cursor = page.cursor` / `} while (cursor !== '0')`; then today's `if (this.#closing) return 'closed'` and the deregistration lines **byte-identical**. Verify `grep -n "'SMEMBERS'"` shows only `#reconcile`'s instance-set read and `grep -n "'SSCAN'"` one line.
- [X] T013 [US1] `#sweepPage(deadId, owned, count): Promise<'swept' | 'closed' | 'renewed'>` (**home of "a page read never sits between a release reply and its announcement" and of the unchanged per-entry release**, FR-005, FR-006): today's `for (const raw of owned) {` loop **moved byte for byte** — loop at 8 spaces, body at 12, same names — then `return 'swept'`. Diff the moved block against `main` to prove it identical. The 9 per-entry battery anchors must still match exactly once (checked in T027). With T010–T012 it turns W1 green.
- [X] T014 [US1] Guards in `packages/realtime/tests/sweep_paging_358.test.ts`: W8 (a page emptied by another survivor's releases, non-zero cursor, does not end the scan — members placed with `FakeRedis.scanSlot`) and W5 (B's second `SSCAN` rejects → one "failed" line with the first page's N, A registered, the next pass finishes).

## Phase 4: US3 — shutting down mid-scan leaves the rest to the fleet (P2)

- [X] T015 [US3] The fourth `#closing` check, before each page read, at the top of the `do` body in `#sweepOwned` (**home: one flag, four askers — `#reconcile` top of instance, `#sweepOwned` before each page read and before the deregistration, `#sweepPage` before each release**, FR-006). Add W10 to `packages/realtime/tests/sweep_paging_358.test.ts`: `close()` during a run of empty / unparsable pages → no `SSCAN` after `close()` begins except the one in flight.
- [X] T016 [US3] `SweepStop` gains `'kept'`; `'completed'` narrows to deregistered; `#sweepOwned`'s last line maps `deregistered` → `'completed'`, `renewed` → `'renewed'`, `kept` → `'kept'` (**home of how a sweep ended: `SweepStop`**, FR-009). `DEREGISTER_INSTANCE_SCRIPT` and `decodeDeregisterReply` untouched (**home of "a half-swept instance stays registered"**, FR-008).
- [X] T017 [US3] The suffix in `#sweepInstance`'s one log site (**home of the *unfinished* suffix**, FR-010): inside the existing `        } else if (released > 0) {` branch — that line byte-identical (#355 M18's anchor) — append `— unfinished: it stays registered and a later pass resumes it` when the end is `'kept'` or `'closed'`; none on `'completed'`; nothing at N = 0; no `SCARD`. Turns W4, W6, W7 green.

## Phase 5: US4 + US5 — a renewal stops the scan; two survivors stay exactly-once (P2 / P3)

- [X] T018 [US4] W11 in `packages/realtime/tests/sweep_paging_358.test.ts`: A renews after B's first page → no release `EVAL` after the first refused one, no further `SSCAN`, one "renewed" line (**home: `#sweepPage` returns `'renewed'`, `#sweepOwned`'s `if (end !== 'swept') return end`**, FR-007). Green by construction after T012–T013; proven to fail if that line is changed to continue.
- [X] T019 [US5] W3 in `packages/realtime/tests/sweep_paging_358.test.ts`: B and C sweep A (3 pages) with interleaved page reads → one `left` per member overall, N_B + N_C = 307 (**home of exactly-once: `RELEASE_MEMBER_SCRIPT`**, unchanged — no TS de-duplication).

## Phase 6: Existing tests — the 10 repairs (3 files) and the rename

- [X] T020 [P] `packages/realtime/tests/reconcile_single_pass_355.test.ts` (7 sites): `:241` `serial.hold` and `:634` `hold` → owned-set `SSCAN` (left alone they hang); `:253` `issued('SMEMBERS', OWNED_KEY(DEAD))` → `SSCAN`, still 1; `:436` the "no owned-set read for the next instance" filter → `SSCAN`; `:823` the rejected owned-set read → `SSCAN`; `:584–587` and `:613–616` the exact W4 (vii) "released" lines gain the suffix (`closed` ends, N = 1). No assertion weakened.
- [X] T021 [P] `packages/realtime/tests/roster_holders_345.test.ts` (2 sites): `:277` the #345 W4 `sweepsOfA >= 2` precondition → `SSCAN`; `:689` + `:700` #345 S1c renamed to "#345 S1c a hold landing between a sweep's owned-set read and its end stays in the owned set", its intercept re-keyed to `SSCAN`.
- [X] T022 [P] `packages/realtime/tests/live_fake_conformance.test.ts:385`: the SMEMBERS case title says one production call site (if not already done in T005).
- [X] T023 `packages/realtime/tests/mutations/presence_member_holds_345.ts`: the "DELs the dead instance's owned set" row's `killedBy` follows T021's new S1c name; its comment "between the sweep's SMEMBERS and its end" and the header's S1c line say "owned-set read".

## Phase 7: Batteries

- [X] T024 New battery `packages/realtime/tests/mutations/sweep_paging_358.ts`, every anchor matching exactly once and every mutant proven live (it executes and turns its named witness red): M1 `SMEMBERS` restored (W1; W2 live), M2 no / different `COUNT` (W1), M3 `while (false)` (W1), M4 inserted `if (page.items.length === 0) break` (W8), M5 every `SSCAN` sends `'0'` (W7, via the fake's ceiling), M6 no closing check before a page read — anchored on the check **plus** the page-read line, since `if (this.#closing) return 'closed'` now appears twice at 12 spaces (W10), M7 `'renewed'` goes on to the next page (W11), M8 a missing cursor read as `'0'` (W9), M9 `kept` logged like `completed` (W6, W7), M10 the message interpolates the cursor (W9), M11 `/^[0-9]+$/` accepts a leading zero (W9).
- [X] T025 [P] Row L1 in `packages/realtime/tests/mutations/live_conformance_285.ts`: the fake's scan core skips a member present throughout → killed by T005's coverage case; run with the live broker.
- [X] T026 Re-run, not edit, the six sweep-driving files that drain with a fixed microtask count — `lapse_rehold_349`, `presence_sweep_departure_348`, `reconcile_single_pass_355`, `presence_sweep`, `roster_holders_345`, `roster_atomicity_323` (`packages/realtime/tests/*.test.ts`); all green unmodified (their owned sets fit one page).
- [X] T027 Run every realtime battery (`deno task mutate realtime`): confirm 0 re-anchors — the 9 per-entry rows (`reconcile_single_pass_355` M3, M4, M7, M12b, M21; `presence_sweep_departure_348` M1, M4; `presence_member_holds_345` raw presence HDEL, OWN id), `sweep_parse_316` ×2, #355 M12c, #345 "DELs", #355 M17, M18, M22 — all still `KILLED` (or their recorded `expectSurvival`); repair any `DEAD MUTANT` only after checking FR-005 was followed.

## Phase 8: Polish — rules, ADR and docs

- [X] T028 [P] `MAX_REPLY_BYTES` JSDoc in `packages/redis/resp.ts` (**home of "a reply that grows with a collection is bounded by its caller; the cap is a backstop"**, FR-016): state the rule; remove "the largest is a roster read". No code change.
- [X] T029 [P] `packages/realtime/AGENTS.md` (**home of the reply-bound inventory**, FR-016, A3): one pitfall listing roster read → `READ_ROSTER_SCRIPT`, owned set → `OWNED_SCAN_COUNT`, instance set → unbounded, small by construction, revocation index → `LIST_REVOKED_SCRIPT`, unbounded, #359; plus the pitfalls of FR-017 (the single owned-set read and its constant; four `#closing` checks — update the sweep bullet's three-point wording; no page read between a release reply and its announcement; the one SCAN guarantee relied on and the two scripts covering the rest; multi-page tests drain with FakeTime, the waiting rule's recorded home); **Tests** lists `sweep_paging_358`. And one line in `packages/redis/AGENTS.md`'s "A bound on peer-controlled input is a SIZE check…" pitfall pointing at the `MAX_REPLY_BYTES` rule. Regenerate briefs (`deno task agents:brief`).
- [X] T030 [P] `docs/adr/008-realtime-sweep-reads-owned-set-in-pages.md` (new): decision, rejected shapes with their cost, not solved (round trips; head-of-line delay with its revisit trigger and no instrument measuring pass duration (A9); overlap; unparsable entries; the bound is the broker honouring `COUNT` and WC detects a broker that does not (S4); a broker that never returns cursor `0` stalls that survivor (S5); SCAN termination under a growing set; the mixed fleet; `LIST_REVOKED_SCRIPT` → #359), and the standing constraint. Amend `docs/adr/006-realtime-sweep-writes-only-while-dead.md` by its Status line and inline callouts: §2 four `#closing` checks, the ends list gains `kept` and `completed` narrows, the log spec gains the suffix (A8); §5 drop "an owned set too large for one reply is never swept"; §6 the read rule.
- [X] T031 [P] `docs/realtime.md` "Ghost sweep": the owned set is read in pages; the "released" row gains the suffix and when; the "failed" row says "a page of its owned set could not be read"; the mixed-fleet note (a `0.3.0` survivor still reads the whole set). No numbered upgrade item.
- [X] T032 [P] Prose and JSDoc: `packages/realtime/tests/recording_ports.ts:46-47` (unlisted → `null` no longer "absent" for `SSCAN`, whose decoder throws); `packages/realtime/tests/mutations/reconcile_single_pass_355.ts:8` and `:24-26` ("three `#closing` checks" → four); optionally `packages/realtime/tests/mutations/presence_sweep_departure_348.ts:248`; in `packages/realtime/drivers/redis.ts` the JSDoc of `SweepStop`, `#sweepOwned` (drop "between the `SMEMBERS` below and the end", the exits list with `kept`), `#sweepPage`, `#sweepInstance` (the suffix), `DEREGISTER_INSTANCE_SCRIPT`.
- [X] T033 Final gate, exit status only (never a pipe's): `deno fmt && deno lint && deno check && deno task test && deno task agents:brief --check && deno task mutate realtime`, then with the live broker (`LOCKNESS_REDIS_INTEGRATION=1`, port from the environment) W2, WC and the live batteries (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`). `deno.lock` unchanged.

## Dependencies

T001 → T002 → T003 → T004 / T005 → T006 → T007 / T008 / T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 / T019 → T020–T023 → T024 / T025 → T026 → T027 → T028–T032 → T033.

- The fake (T001–T003) precedes every driver change: once T012 lands, every FakeRedis sweep test issues `SSCAN`.
- T007 W1 and T009 fail to compile until T010 / T011 export their symbols — that is their red; W4, W6, W7 are red on the missing suffix.
- T010–T017 all edit `redis.ts` and run in order. T012 and T013 land together (the loop calls `#sweepPage`); T015 sits in the loop T012 writes.
- T020–T022 must be in the same commit as T012 / T017 that break them (SMEMBERS predicates break with T012, the W4 (vii) exact lines with T017).
- T023 depends on T021 (the new test name). T025 depends on T005. T027 depends on T013's verbatim move.
- T004 ∥ T005; T008 ∥ T009; T020 ∥ T021 ∥ T022; T024 ∥ T025; T028–T032 are parallel with each other.

**Parallel example (Phase 8):** T028 (`resp.ts`), T029 (both `AGENTS.md`), T030 (ADRs), T031 (`docs/realtime.md`) and T032 (prose, JSDoc) touch different files and can be written at once.

## Implementation strategy

One branch, commits split by category:

1. `test(358)` — the FakeRedis scan core, `SSCAN` arm, header, #280 / #285 conformance and F1 / F2 (T001–T006).
2. `test(358)` — the red witnesses (T007–T009).
3. `fix(358)` — decoder, constant, page loop, `#sweepPage`, fourth check, `kept` and the suffix, the guard witnesses, and the 10 test repairs plus the `killedBy` rename they force (T010–T023).
4. `test(358)` — the `sweep_paging_358` battery and L1 (T024–T027).
5. `docs(358)` — the `MAX_REPLY_BYTES` rule, both `AGENTS.md`, ADR 008 and the ADR 006 callouts, `docs/realtime.md`, prose and JSDoc (T028–T032).

MVP = W1 green with W9 (T001–T014): the reply bound is closed. Everything after that is still part of the approved scope, not an option.

## ⏸ Paused 2026-09-23 — resume here

**State at the pause.** All 33 tasks are done on `264-paged-owned-sweep`. The Specnaut `review` phase returned
**needs_followup: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 5 LOW + 1 INFO, no plan violation** — the branch is merge-eligible.
The review fix-cycle is **done and committed** on this branch (`14ca6aed`, `94d5c843`, `ae88b89f`, tip `ae88b89f`):

- [X] R1 (MEDIUM) W2 waits on sweep progress (`SCARD owned:A` every 250 ms, fails after 30 s with no drop, 10 min
  backstop) instead of a fixed 120 s deadline — proven against a stalled sweep and against M1 on a live broker.
- [X] R2 (MEDIUM) the FakeRedis cumulative scan ceiling (`SCAN_CALLS_TOTAL`) has a conformance case; battery row F4.
- [X] R3 (LOW) `packages/realtime/AGENTS.md`: the N/E counting lives in `#sweepPage`.
- [X] R4 (LOW) missing-cursor and cursor-past-table refusals tested; battery row F3.
- [X] R5 (LOW) W4 asserts no release follows the one in flight; new battery row M12 (`#358 W4 `).
- [X] R6 (LOW) F2 `killedBy` corrected; `FakeRedis.scanOrder` is the one ordering, reused by `inScanOrder`.
- [X] R7 (INFO) ADR 008 and plan FR-012 reworded.

Gate at the pause: `deno fmt` 0, `deno lint` 0, `deno check` 0, `deno task test` 0 (2852 passed),
`deno task agents:brief --check` 0, `deno task test:redis` (live) 0, `fake_redis_280` battery 27/27 killed.
**Not yet run:** `deno task mutate realtime` (held by the pause).

**To resume — exactly here:**
1. Start a throwaway Redis 7 and run `LOCKNESS_REDIS_INTEGRATION=1 deno task mutate realtime`. It must be 33/33 clean
   (plus the new rows): confirm through the harness that `sweep_paging_358` M12 is KILLED by `#358 W4 ` and that
   `live_conformance_285` L1 still dies after the `scanOrder` re-sort. If a row is DEAD or SURVIVED, fix it here first.
2. Run the full gate once more:
   `deno fmt --check && deno lint && deno check && deno task test && deno task agents:brief --check`, and confirm
   `deno.lock` is unchanged.
3. No re-review needed (the findings were MEDIUM/LOW). Merge per `phases/merge.md`: squash by scope — `fix(358)`
   (`packages/realtime/drivers/redis.ts`, `packages/redis/resp.ts`, `packages/realtime/tests/`) with `Closes #358`,
   then `docs(358)` (`.specnaut/`, `docs/`, both `AGENTS.md`) — verify `git diff main..HEAD` is byte-identical before
   and after, fast-forward `main`, push, delete the branch, confirm #358 is closed.
4. Next on the board: **#359** (Ready; its blocker #358 is then merged). Run `/specnaut plan` from its architect-expert
   disposition — it reuses `decodeScanReply`, the FakeRedis scan core (`scanSlot`/`scanOrder`) and the reply-bound
   inventory in `packages/realtime/AGENTS.md`. Order after that: the board is empty of Ready items.

**Resumed 2026-09-23.** Step 1: `LOCKNESS_REDIS_INTEGRATION=1 deno task mutate realtime` — 33 batteries, 33 clean,
0 failed, 0 partial (live batteries included; `sweep_paging_358` M12 and `live_conformance_285` L1 killed). Step 2: the
full gate green (2852 passed) and `deno.lock` unchanged. Step 3: squashed by scope and merged.
