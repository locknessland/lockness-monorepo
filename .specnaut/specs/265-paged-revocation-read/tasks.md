# Tasks: read the revocation index in bounded pages, one pass at a time

**Plan**: `.specnaut/specs/265-paged-revocation-read/plan.md` (approved 2026-09-23, `55b32233`) | **Backlog item**:
[#359 — Realtime: the revocation re-check reads every live revocation in one reply that can breach the shared client's reply cap](https://github.com/locknessland/lockness-monorepo/issues/359)

**TDD is mandatory** (constitution): every behaviour task starts with a witness proven red on the
current code.

**Decision homes.** Every task that touches a rule in the plan's 🔒 decision table names that
rule's home, and the decision may not land anywhere else. All homes are in
`packages/realtime/drivers/redis.ts` unless stated.

**Ids.** Witness and mutant ids are the plan's §4 tables: R1–R15 and WC for witnesses; M1–M21, F1,
F2, L1 and L2 for mutants.

**The fake lands first.** Once the driver issues `ZSCAN`, every FakeRedis test that runs a
revocation pass needs the arm.

**Waiting rule** (FR-015, #358 FR-012):
- a test that needs a finished pass drains with `await time.runMicrotasks()` (or `tickAsync(0)`)
  after the tick, and also after firing the reconnect seam, which now returns `void`;
- a witness that holds a page or an apply waits on the hold's `reached`;
- `close()` is used only where `close()` is the subject (R10);
- never a fixed microtask count, never a new `settle()` copy.

**The pre-commit hook type-checks the whole workspace.** A witness that imports an export which
does not exist yet (`REVOCATION_SCAN_COUNT`, `decodeReapReply`, `decodeRevocationPage`, the
message constants) cannot be committed on its own. It is written and run red first, and its red
output is saved to the scratchpad. It is committed **with** the code that makes it compile.

## Phase 1: Setup — the fake's `ZSCAN` and its conformance

- [X] T001 `ZSCAN` arm in `packages/realtime/tests/fake_redis.ts` (**home of the FakeRedis `ZSCAN` model**, FR-014).
  - It calls #358's private scan core `#scan` over the **live** sorted set (`#liveZset`, so key expiry is honoured) and walks nothing of its own.
  - It answers `[cursor, [member, score, …]]` in `FakeRedis.scanOrder`. Each score is formatted as Redis formats it: an integral score is `String(n)`, with no decimal point.
  - An absent key answers `['0', []]`.
  - Through `#reject` it refuses: a missing `COUNT`; any option but `COUNT` (`MATCH`, `NOSCORES` and others); a cursor not matching the fake's `SCAN_CURSOR`; a non-positive `COUNT`.
  - There is no `ZCARD` arm. Witnesses use the existing `redis.zcard()` helper.
- [X] T002 File header of `packages/realtime/tests/fake_redis.ts`:
  - add `ZSCAN … COUNT` to the modelled surface, on the shared scan core;
  - state that duplicates are not modelled;
  - state that `ZRANGEBYSCORE` is now issued only by tests (raw index reads), not by the driver;
  - re-check the call-ceiling sizing sentence against the revocation index, which every driver on the fake scans once per pass for the whole test. Count the passes in the longest timer-driven test and write the arithmetic. Resize only if needed, and never remove the ceiling.
- [X] T003 [P] WC, fake-only refusals, in `packages/realtime/tests/fake_redis_conformance.test.ts` (#280). Each of these is refused and recorded in the ledger:
  - `ZSCAN` without `COUNT`;
  - `ZSCAN` with `MATCH` (before and after `COUNT`), with `NOSCORES`, or with another option;
  - cursors `'00'`, `'01'`, non-digit or 21 digits;
  - `COUNT 0`.
- [X] T004 [P] WC, cross-backend, in `packages/realtime/tests/live_fake_conformance.test.ts` (#285; **home of how a flat pair list is compared: `sortedPairs`**, FR-016a, A10).
  - **`sortedPairs`.** Add a `sortedPairs` helper that sorts a flat `[k, v, k, v, …]` list by pair and keeps each pair together. Use it for `HGETALL`, replacing `sortedItems` there, and for a `ZSCAN` reply **only when its cursor is `'0'`**. `sortedItems` stays for `SMEMBERS` and the `SSCAN` items. Amend the normalizer comment.
  - **Shape cases:** an absent key answers `['0', []]`; a small sorted set; a `MARK_REVOKED_SCRIPT` score reads back as a decimal-integer string.
  - **Coverage case:** seed fixed far-future scores through `ZADD`, more than 128 entries or one member longer than 64 B. Iterate each backend to cursor `0`, compare the union of `(member, score)` pairs, and assert that the live broker needed more than one call.
- [X] T005 Battery rows, each proven live:
  - in `packages/realtime/tests/mutations/fake_redis_280.ts`: F1 (`ZSCAN` accepts a missing `COUNT` again) and F2 (`ZSCAN` accepts `MATCH` again), both killed by T003;
  - in `packages/realtime/tests/mutations/live_conformance_285.ts`: L1 (the **`ZSCAN` arm** drops one member before calling the core; the core's own skip mutant is #358's L1 and is not duplicated) and L2 (the arm formats an integral score with a decimal point), both killed by T004 and run with the live broker.
- [X] T006 Re-run `live_conformance_285` with the live broker after T004's `sortedPairs` change (A10). The rows whose killing tests compare `HGETALL` must still be `KILLED`. The comparison is only stricter, so a row can only gain kills.

## Phase 2: Foundational — baseline, then red witnesses

- [X] T007 **Baseline before any driver change.** Run the 9 timer-coupled files green on the current code and save the output to the scratchpad. The files, all `packages/realtime/tests/*.test.ts`: `driver_redis`, `eviction_durable`, `eviction_reconnect`, `revocation_retry`, `reconcile_single_pass_355`, `lapse_rehold_349`, `presence_member_frozen_354`, `presence_sweep_departure_348` and `roster_holders_345`. T034 compares against this run.
- [X] T008 New `packages/realtime/tests/revocation_paging_359.test.ts`. It uses FakeRedis behind the serializing hold wrapper, FakeTime, the FR-015 drain, and `redis.assertNoRejections()` in teardown. Write the red witnesses, run each one, and save the red output before any driver change:
  - **R1 (red: compile).** 307 live records, five for B's sockets (connection and channel scope). One drained pass → all five applied. The log shows one reap `EVAL` whose script has no `ZRANGE`, then ≥ 4 `ZSCAN <index> <cursor> COUNT <REVOCATION_SCAN_COUNT>` (the constant is imported, never the literal), the first at `0` and the last answered `0`, and no other index read.
  - **R8 (red).** One `ZSCAN` held across 3× the interval and released at 3.5×. Exactly one reap before the release, no reap in (3.5×, 4.5×), and the next reap at 4.5×.
  - **R9 (red):**
    - one reconnect during a held pass → exactly one trailing `reconnect` pass;
    - two reconnects → one trailing pass;
    - a reconnect plus a retry → one pass, with trigger `reconnect`;
    - a failing trailing pass arms the one #308 retry.
  - **R10 (red).** `close()` during a held page read, with a reconnect fired during the hold. No `ZSCAN` after `close()` begins except the one in flight. **Only after the release and drain**: `revocationTimer` is unset; no reap follows (the effect, not the private rerun field); one WARN with `REVOCATION_PASS_CLOSING`; no retry.
  - **R14 (red).** Hold a driver-triggered pass's apply on its first `ZREM` clear, then fire A's lapse. No second reap until the release. A channel revocation written during the hold, for a pair A holds, is applied before any re-hold (no `joined`). A pair left by the first pass whose client re-subscribed during the hold is not kicked by the queued run.
- [X] T009 [P] R2 (**red, live broker**) in `packages/realtime/tests/revocation_paging_359.test.ts`, gated on `LIVE_BROKER` from `packages/redis/tests/live_broker.ts`.
  - One seeding `EVAL` that returns an integer writes about 60,000 channel-scoped members of maximum length (602 B, about 620 wire bytes each in a `ZRANGEBYSCORE` reply, about 37 MB > 33,554,432 B), scored at `TIME + 300`, plus 3 records for B's sockets.
  - After one pass on B: the 3 are applied, there is no "revocation reconcile failed" WARN, and a command on B's client right afterwards completes.
  - Record the red run on `main` ("RESP reply exceeds", then the refusal window).
- [X] T010 [P] R12 (unit, red: compile) in `packages/realtime/tests/revocation_paging_359.test.ts`:
  - **`decodeReapReply`:** anything but a bulk string matching the canonical ≤ 15-digit form throws a byte-identical `REAP_REPLY_REFUSED` with no marker. This includes integer replies, `'01'`, 16 digits and `'x<marker>'`.
  - **`decodeRevocationPage` envelope:** nil, the wrong arity, a missing or non-canonical cursor and a non-array body each throw `SCAN_REPLY_REFUSED`. An odd-length body throws `REVOCATION_PAGE_REFUSED`. Neither message carries a marker planted in the reply.
  - **`decodeRevocationPage` pairs:** in a well-formed page, a non-bulk member, a non-bulk score and the scores `inf`, `+inf`, `1.5`, `1e9`, `01` and a 16-digit value each skip only their own pair, and `skipped` counts each one.
  - **Through `listRevocations` on FakeRedis:** plant such pairs (plus one raw `+inf` member). The other records are applied. After the pass there is **exactly one** WARN with `REVOCATION_PAIRS_SKIPPED` and the exact count, with no marker and no throw. A second pass logs it again. A clean pass logs no skip WARN.

## Phase 3: US1 + US2 — a large index is fully enforced, and no reply grows past a page (P1)

- [X] T011 [US1] `EPOCH_SECONDS = /^(0|[1-9][0-9]{0,14})$/` (**home of the one epoch-seconds grammar**, FR-002, A12), plus `decodeReapReply(reply): number` and `REAP_REPLY_REFUSED` (**home of what a reap reply means**).
  - The decoder accepts only a bulk string matching `EPOCH_SECONDS`. Anything else throws the constant, which never carries the reply.
  - Both are exported for the test suite only (not from `mod.ts`), with JSDoc including `@throws` and `@example`.
- [X] T012 [US1] `REAP_REVOKED_SCRIPT` replaces `LIST_REVOKED_SCRIPT`, beside `MARK_REVOKED_SCRIPT` (**home of "the pass deletes only through the reap"**, FR-001).
  - The script reads `TIME`, runs `ZREMRANGEBYSCORE KEYS[1] -inf t` as a **bare call statement**, and returns `t`. It is called as `EVAL <script> 1 <index>` with no `ARGV`.
  - Its JSDoc says why the split does not re-open #276.
  - Verify with `grep -n`: `ZREMRANGEBYSCORE` appears exactly once, and `ZRANGEBYSCORE` has no production use.
- [X] T013 [US1] `REVOCATION_SCAN_COUNT = 100` beside `REVOCATION_SCOPE_SEPARATOR` (**home of the page size, not configurable**, FR-003).
  - It is exported for tests only.
  - Its JSDoc carries the bound: a member of at most 602 B, a score of about 12 B, about 130 KB of wire per page at worst (about 12 KB typically), a few MiB of heap at 20×. It states that the bound holds only while the broker honours `COUNT`, and why the page is 100 rather than 1,000.
- [X] T014 [US1] `decodeRevocationPage(reply)` with `REVOCATION_PAGE_REFUSED` (**home of what a `ZSCAN` page and a well-formed pair mean, and of the `skipped` count**, FR-005, A12).
  - The envelope goes through #358's `decodeScanReply`. There is no second envelope decoder, and nothing is moved to `@lockness/redis`.
  - An odd-length body throws.
  - A pair with a non-bulk member, or with a score that is not a bulk string matching `EPOCH_SECONDS`, is skipped and counted, never thrown.
  - It returns `{ cursor, entries: readonly { member: string; score: number }[], skipped }` and is exported for tests only. With T011, R12's unit half turns green.
- [X] T015 [US1] [US2] `listRevocations(owns?)` becomes the paged pass (**home of the pass's read half, the one loop, the `score > t` filter and the skip WARN**, FR-004, FR-006, FR-006a, FR-007). In order:
  1. `if (this.#closing) throw new Error(REVOCATION_PASS_CLOSING)`;
  2. `const t = decodeReapReply(await …REAP_REVOKED_SCRIPT…)`;
  3. `let cursor = '0'` / `do {` / the same closing check (T024 owns its test) / read one page with `decodeRevocationPage(await this.command.command('ZSCAN', this.revocationIndexKey, cursor, 'COUNT', String(REVOCATION_SCAN_COUNT)))`;
  4. per entry: `if (!(entry.score > t)) continue` → `#decodeRevocation(entry.member)` (unchanged byte for byte), with the #304/#332 comment block moved beside it → `undefined` skip → `owns` skip → `live.set(entry.member, revocation)`;
  5. `cursor = page.cursor` / `} while (cursor !== '0')`, the natural spelling (A5);
  6. after the loop, one `REVOCATION_PAIRS_SKIPPED` WARN if the sum of `skipped` is above 0 (a constant message plus the integer, never broker bytes);
  7. `return [...live.values()]`.

  Also:
  - Remove the "unexpected reply shape — treating it as empty" WARN.
  - `REVOCATION_PASS_CLOSING` is a constant, exported for tests only.
  - No budget, no resume state, no page counter, no `try` inside.
  - `#encodeRevocation` and `REVOCATION_SCOPE_SEPARATOR` stay untouched.
  - Verify `grep -n "'ZSCAN'"` returns one line.
  - Turns R1 and R12 green.
- [X] T016 [US1] Constant-message audit over T011–T015 (**home of "a failed, malformed or closing pass throws a constant message, never `[]`"**: `listRevocations` and its decoders, with `#runRevocationReconcile`'s catch as the one WARN):
  - no thrown message interpolates the reply, a member or a score;
  - no `return []` on a failure path;
  - `grep -n "treating it as empty"` returns nothing.
- [X] T017 [US1] The port signature in `packages/realtime/driver.ts`: `listRevocations?(owns?: (target: string) => boolean): Revocation[] | Promise<Revocation[]>`, and the same on `RevocationStoreDriver` (**home of the port contract: this JSDoc**, FR-008; the full JSDoc is T039). `revocationStore` stays unchanged.
- [X] T018 [US1] `packages/realtime/manager.ts`: the re-check body passes `(target) => this.connections.has(target)` to `listRevocations` (**home of which targets the pass keeps: the `owns` parameter**). It keeps `if (!this.connections.has(revocation.target)) continue` **byte for byte** (**home of "the manager applies only local sockets"**, the decider).
  - Add R13 to `packages/realtime/tests/revocation_paging_359.test.ts`:
    - (a) `listRevocations(owns)` returns only accepted targets and calls `owns` once per decoded record, while `listRevocations()` returns all;
    - (b) the manager's predicate accepts exactly its local ids (recording driver);
    - (c) a driver that ignores `owns` → the manager applies only local records.
- [X] T019 [US1] Guard witnesses in `packages/realtime/tests/revocation_paging_359.test.ts`:
  - **R3**, with a hook between the reap and the first page:
    - (a) the fake's Redis clock passes A's expiry → A is applied;
    - (b) a member with `score ≤ t` is not applied;
    - (c) FakeTime skewed ±1 h from `setTime()` leaves the outcome unchanged.
  - **R4**: undecodable members across pages survive and are not applied, and no skip WARN is logged. Two expired members are **removed**: `redis.zcard(INDEX)` falls by exactly 2, and a raw `ZRANGEBYSCORE -inf +inf` no longer lists them (A11).
  - **R6**: a record written between pages, placed with `FakeRedis.scanSlot`: (a) ahead of the cursor → applied this pass; (b) behind it → applied by the next pass.
  - **R7**: an empty page with a non-zero cursor does not end the pass.
  - **R11**: B's second `ZSCAN` throws → nothing is applied, page 1 included; the WARN names the trigger; the next pass applies everything.
- [X] T020 [US2] Run R2 (T009) against the live broker: it must be green, with no refusal window on B's client.

## Phase 4: US4 — a pair split across pages leaves once, and re-checks never overlap (P2)

- [X] T021 [US4] R5 in `packages/realtime/tests/revocation_paging_359.test.ts`. Two ids of one local pair are placed on different pages with `FakeRedis.scanSlot` → one leave, one `unsubscribed`, both ids cleared, and after a legitimate re-subscribe the next tick does not kick. This guard is green on `main`. **Home of "nothing is applied before the enumeration ends"**: the re-check body's single `await listRevocations(owns)`, then group, then apply, in `packages/realtime/manager.ts`. There is no per-page callback and no iterator.
- [X] T022 [US4] FR-009a, the manager's serial re-check tail in `packages/realtime/manager.ts` (**home of "one manager re-check at a time, each run reads fresh, a rejected run never stops the next, no coalescing"**: the tail behind `reconcileRevocations()`, the ADR 003 slot-tail idiom).
  - `reconcileRevocations()` becomes the gate. It appends one run to a private tail field that continues on **both** settle branches, and returns that run's promise, so its caller still sees a rejection.
  - Today's body moves **byte for byte** into a private method **at the same indentation** (8 spaces), with the per-revocation `try` from #349 and the grouping unchanged.
  - Diff the moved block against `main` to prove it identical, and confirm that `channel_revoke_332`'s `connections.has` and `JSON.stringify` pair-key anchors, and `lapse_rehold_349` M19–M21 (`#reassertRoster`'s `await this.reconcileRevocations()`), each still match once.
  - Both callers (`manager.ts:1058` and `#reassertRoster`) stay unchanged.
  - Turns R14 green.
- [X] T023 [US4] R15 in `packages/realtime/tests/revocation_paging_359.test.ts`: one run's reap `EVAL` is refused, and its caller sees the rejection (the #308 WARN, or #349's re-check WARN). A later `reconcileRevocations()` still issues a reap and applies a planted record.

## Phase 5: US3 — a slow pass never runs beside another (P2)

- [X] T024 [US3] `#armRevocationReconcile()` (**home of the single arming site: "the timer is armed from the end of the pass that consumed it; an edge-triggered pass never moves a pending timer"**, FR-010, A2).
  - It returns while `#closing` and returns while a timer is pending. Otherwise it arms one `setTimeout(reconcileIntervalMs)` whose callback clears the field and calls `#startRevocationPass('timer')`.
  - The `revocationTimer` field becomes `ReturnType<typeof setTimeout>`.
  - `onRevocationReconcile` sets the handler, calls `clearTimeout` on any pending timer, then arms. `setInterval` is gone.
  - Add the page-read closing check's test here: R10's "no `ZSCAN` after `close()`" half.
- [X] T025 [US3] `#startRevocationPass(trigger): void`, with `#revocationPass` and `#revocationRerun` (**home of one pass per driver and of the one coalesced trailing pass**, FR-011, A6).
  - **While a pass is in flight:** `'timer'` does nothing; `'reconnect'` or `'reconnect-retry'` sets the rerun, and `'reconnect'` wins.
  - **Otherwise:** `#revocationPass = this.#runRevocationReconcile(trigger).finally(…)`. The `finally` clears the slot, takes and clears the rerun, then starts that trailing pass or calls `#armRevocationReconcile()`.
  - **No `#closing` check in this method** (D3). The handler drop plus `#runRevocationReconcile`'s guard is the one gate.
  - The reconnect seam and the #308 retry lambda (`() => this.#startRevocationPass('reconnect-retry')`) both route through it.
  - `#runRevocationReconcile`'s **body stays verbatim** (**home of the failure and retry policy**, FR-012). Diff it against `main`.
  - Turns R8 and R9 green.

## Phase 6: US5 — shutting down mid-pass stops reading (P3)

- [X] T026 [US5] `close()` in `packages/realtime/drivers/redis.ts` (FR-013; **home of "once `close()` begins": `#armRevocationReconcile`'s check for timers, the handler drop for pass starts, `listRevocations`' two checks for reads**).
  - `clearInterval(this.revocationTimer)` becomes `clearTimeout(this.revocationTimer)`, and `close()` clears `#revocationRerun`.
  - The lines that drop the handler and clear the retry stay **byte for byte** (the #308 row 5 and #355 M15 anchors).
  - It adds no `await` of the revocation pass, and `await this.#reconcilePass` stays unique.
  - Turns R10 green.

## Phase 7: Existing tests — 5 re-scripts and the timer-coupled re-run

- [X] T027 [P] `packages/realtime/tests/revocation_atomicity.test.ts:322` (#278/SC-001): for 0, 1 and 50 revocations the command list is `['EVAL', 'ZSCAN']`. Rename the test to the refined wording ("one reap plus pages, never one command per member") and keep the positive control.
- [X] T028 [P] `packages/realtime/tests/connection_id_charset.test.ts:157-218` (#304 reconcile filter): the canned 1-key `EVAL` list becomes a reap `t` (digit bulk) plus a canned `ZSCAN` page of `(member, score)` pairs with scores greater than `t`. The comment at `:173` becomes "the pass throws".
- [X] T029 [P] `packages/realtime/tests/prefix_anchoring.test.ts:206-225` (`CANNED`):
  - `EVAL` with one declared key and no operand after it answers a digit bulk string, keyed on the key and operand counts, never on script text;
  - `ZSCAN` answers `['0', []]`;
  - the comment is updated.

  Without this, `listRevocations()` at `:276` throws.
- [X] T030 [P] `packages/realtime/tests/redis_broker_integration.test.ts:411-413` (US4 reap): its title and its "the only test that makes LIST_REVOKED_SCRIPT execute against a real Redis" comment are re-targeted to `REAP_REVOKED_SCRIPT`. Its raw read-backs are unchanged.
- [X] T031 [P] `packages/realtime/tests/driver_redis.test.ts:395-420` (FR-004: a seam-less subscriber arms its periodic trigger): replace the single `tickAsync(3_500)` expecting 3 ticks with three `tickAsync(1_000)` steps, each drained, still expecting 3.
- [X] T032 Confirm the zero-argument `listRevocations()` call sites (26 by the audit's count) are green unmodified (`packages/realtime/tests/*.ts`).
- [X] T033 `packages/realtime/tests/revocation_paging_359.test.ts` (and T027–T031) are committed in the same commit as T011–T026, per the pre-commit hook rule.
- [X] T034 Re-run the 9 timer-coupled files from T007 (`packages/realtime/tests/*.test.ts`) and compare against the baseline. Only `driver_redis` is edited (T031). Two things may surface:
  - a test awaiting `fireReconnect()` to observe a finished pass now drains (FR-011);
  - a test counting every command after an event now sees a `ZSCAN`. Repair it by filtering on the index key.

  Never weaken an assertion. `lapse_rehold_349`'s re-check now queues on the manager tail.

## Phase 8: Batteries

- [X] T035 New battery `packages/realtime/tests/mutations/revocation_paging_359.ts`. Every anchor matches exactly once **after** the change and is anchored on revocation-specific context, since `cursor = page.cursor` and the `while` line also exist in `#sweepOwned`. Every mutant is proven live:

  | Row | Mutant | Killed by |
  | :--- | :--- | :--- |
  | M1 | `LIST_REVOKED_SCRIPT` restored | R1; R2 live |
  | M2a / M2b | no `COUNT` / `COUNT * 10` | R1 |
  | M3 | the loop runs once | R1 |
  | M4 | inserted empty-page `break` | R7 |
  | M5 | every `ZSCAN` sends `'0'` | R7, via the ceiling |
  | M6 | `score > t` removed | R3(b) |
  | M7 | `TIME` re-read per page | R3(a) |
  | M8 | filter against `Date.now() / 1000` | R3(c) |
  | M9 | no closing check before a page read, anchored on the check **plus** the `ZSCAN` line | R10 |
  | M10 | matches returned when a page throws | R11 |
  | M11 | an odd-length body accepted | R12 |
  | M12 | the driver ignores `owns` | R13(a) |
  | M13 | the manager stops passing `owns` | R13(b) |
  | M14 | the manager's `connections.has` deleted | R13(d), as built (see below) |
  | M15 | the timer back on `setInterval` | R8 |
  | M16 | reconnect during a pass dropped | R9 |
  | M17 | trailing passes not coalesced | R9 |
  | M18 | `#armRevocationReconcile`'s closing check dropped | R10, after the release and drain |
  | M19 | the manager tail removed | R14 |
  | M20 | the tail continued only on success | R15 |
  | M21 | the skip counter dropped | R12 |
  | M22 (review) | the rerun slot's last writer wins | R9(c), reconnect then retry |
  | M23 (review) | a throw from `owns` swallowed | R13(e) |

  `SUITES` lists `revocation_paging_359.test.ts`.

  **As built:** M14 is killed by a witness added during implementation, R13 (d), not by R13 (c). Against an id foreign to every local map, applying is a no-op, so R13 (c) cannot see the mutant. R13 (d) sets up the one state reachable through the public API that tells the two apart: a `subscribe` that resolves while a `disconnect` of the same id is suspended in its teardown loop. That leaves a membership naming an id that `connections` no longer holds, and with the check deleted the re-check would clear that id's durable record. The state itself is a separate membership leak, filed as #361. If #361 is fixed, R13 (d)'s precondition fails: there is then no reachable state where deleting the check is wrong, and M14 moves to `expectSurvival`. R3 (a, b) and R3 (c) hold the reap's reply, not the first page's. A held page reply has already been read, so M6 and M7 survived that version.

  Resolved by #361: R13 (d) retired, M14 is `expectSurvival`.
- [X] T036 [P] Re-anchor `sweep_paging_358` M3 in `packages/realtime/tests/mutations/sweep_paging_358.ts` (A5) on `"            if (end !== 'swept') return end\n            cursor = page.cursor\n        } while (cursor !== '0')\n"`, with its mutant text changed to match, and re-prove it live (killed by `#358 W1 `).
- [X] T037 [P] `packages/realtime/tests/mutations/live_conformance_285.ts` (A11):
  - relabel "the Lua subset drops a statement — the reap never runs" to "… — `MARK_REVOKED_SCRIPT`'s `ZADD` never runs";
  - re-verify it and "Lua `[n]` indexing off by one" live with the broker. Both are still killed by "the revocation scripts agree".
- [X] T038 Run `deno task mutate realtime` (with the live broker for the live batteries). Confirm the 19 adjacent rows:
  - 17 unchanged and `KILLED`, or at their recorded `expectSurvival`:
    - #304 `parts.every`;
    - #332 ×6 (separator, `parts.length`, `parts.every`, encoder `join`, the manager's `connections.has`, and the #337 `JSON.stringify` pair key);
    - #308 ×5, whose row 5 is `expectSurvival`;
    - #355 M15 and M25;
    - `lapse_rehold_349` M19–M21;
  - 1 re-anchored (T036);
  - 1 relabelled (T037).

  Repair any `DEAD MUTANT` only after checking that the verbatim constraints (T015, T018, T022, T025, T026) were followed.

## Phase 9: Polish — ADR, the bound's one home, the port contract, docs

- [X] T039 [P] Port JSDoc in `packages/realtime/driver.ts` (**home of what a port implementation must return**, FR-008, A7a) on `listRevocations?` and `RevocationStoreDriver.listRevocations`:
  - `@param owns`: implementations SHOULD apply it while enumerating; the caller filters again, so ignoring it is correct but unbounded; it is called synchronously, and a throw fails the call;
  - the refined liveness contract, replacing #276's "exactly the ids live at call time": every record live at the pass's `now` and present for the whole enumeration is returned, and mid-enumeration writes and removals may or may not be;
  - an `@example`.

  Every other doc links here.
- [X] T040 [P] `onRevocationReconcile`'s JSDoc in `packages/realtime/drivers/redis.ts` (**the one home of the enforcement bound**, A7d, S2):
  - `~reconcileIntervalMs` becomes `reconcileIntervalMs + 2P`;
  - P = 1 + ⌈N / `REVOCATION_SCAN_COUNT`⌉ one-at-a-time round trips, each capped at the read timeout;
  - a failed pass restarts the clock;
  - the bound holds only while the broker honours `COUNT`;
  - the timer rule (A2).
- [X] T041 [P] The rest of the JSDoc in `packages/realtime/drivers/redis.ts` and `packages/realtime/manager.ts`:
  - `REAP_REVOKED_SCRIPT`, `EPOCH_SECONDS`, `decodeReapReply`, `decodeRevocationPage`, the four message constants, and `listRevocations` (`@param owns`, the paged `@example`, the skip WARN; it links to the port contract rather than restating it);
  - `#armRevocationReconcile` and `#startRevocationPass` in the style of `#armReconcile`, plus the `revocationTimer`, `#revocationPass` and `#revocationRerun` fields;
  - `#runRevocationReconcile`: "the timer keeps running" becomes "the next pass is armed from this one's end";
  - **`close()`** (A9): the lapse run's re-check stops before its next page read, but when the read in flight is the **last** page, the manager's apply phase runs while `close()` waits;
  - the manager's `reconcileRevocations` gate, its private body method and the tail field.
- [X] T042 [P] `docs/adr/009-realtime-revocation-recheck-reads-index-in-pages.md` (new), "The revocation re-check reads the index in pages, one pass at a time". It records:
  - the reap/read split and why #276's race stays closed, and the carried `now`;
  - `owns`, and nothing applied before the enumeration ends;
  - the manager's serial tail (A1) and the timer rule (A2);
  - the counted skip and its WARN (S1);
  - no budget, and the bound **linked** to T040's home;
  - the rejected shapes with their cost, including accepting overlap, routing through the driver, a coalescing flag, a shared async-generator loop and a slow-pass WARN (the S2 ruling);
  - not solved:
    - the lapse re-hold can wait ≤ P;
    - `#reassertRoster`'s WARN text is false at shutdown;
    - `close()` waits through an apply after the last page;
    - undecodable members are not counted;
    - the broker must honour `COUNT`;
    - the mixed fleet;
    - third-party drivers that ignore `owns`;
    - no authenticity tag;
    - the owner-partitioned index, whose revisit trigger cannot be observed until the pass-duration metric (filed separately) exists;
  - the standing constraint.

  It contains no "two passes may overlap". Amend `docs/adr/006-realtime-sweep-writes-only-while-dead.md` through its Status line and an inline §2 callout: the one-pass rule covers the revocation timer, with a coalesced trailing pass for the edge-triggered reconnect. In `docs/adr/008-realtime-sweep-reads-owned-set-in-pages.md`, add an inline callout on §5's `LIST_REVOKED_SCRIPT` line pointing at ADR 009, and update its Status line.
- [X] T043 [P] `packages/realtime/AGENTS.md`:
  - **the reply-bound inventory** (its home): the revocation line becomes `the revocation index → REVOCATION_SCAN_COUNT (paged, #359); the reap answers one integer`;
  - "Revocation liveness is decided by Redis" is reworded: the reap's `TIME`, carried to every page, never re-read, never `Date.now()`;
  - "`listRevocations` fails CLOSED" gains "the read path never deletes; the reap is the only delete";
  - new pitfalls:
    - nothing applied before the enumeration ends (#337 across pages);
    - one revocation pass at a time, with both homes (the driver's single-flight and the manager's tail) and why;
    - a malformed page throws, and a malformed pair is counted and WARNed;
  - the FakeTime-drain pitfall gains revocation passes and the `void` seam;
  - **Tests** lists `revocation_paging_359`.

  Then regenerate the briefs (`deno task agents:brief`).
- [X] T044 [P] `docs/realtime.md`, the revocation section:
  - replace "reaping and listing happen in one server-side operation against one `now`" with the split and the carried `now`;
  - correct the #278 note to "one reap plus pages, never one per member";
  - the triggers table gains one pass at a time and the trailing pass;
  - "a window of roughly one round-trip" becomes one pass;
  - the enforcement bound is **linked** to its home, not restated;
  - the skip WARN goes into the failure table;
  - custom-driver guidance on `owns`;
  - the mixed-fleet note.

  It is not a numbered v0.4.0 upgrade item.
- [X] T045 [P] Test prose:
  - `packages/realtime/tests/live_fake_conformance.test.ts` `:89` (the reap reads `TIME`), `:583` (reap plus `ZSCAN`) and `:632` ("the `score > t` filter still keeps everything");
  - `packages/realtime/tests/lapse_rehold_349.test.ts:197` (`isListRevocations` → "the reap, the pass's first command");
  - `packages/realtime/tests/reconcile_single_pass_355.test.ts:25` (the `driver_redis.test.ts` row);
  - `packages/realtime/tests/recording_ports.ts:46-49` (an unlisted reply → `null` is not "absent" for the reap and `ZSCAN` either).
- [X] T046 **Final gate, by exit status only** (never a pipe's): `deno fmt && deno lint && deno check && deno task test && deno task agents:brief --check && deno task mutate realtime`. Then, with the live broker (`LOCKNESS_REDIS_INTEGRATION=1`, port from the environment), run R2, WC and the live batteries (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`). Confirm `deno.lock` is unchanged and that no worktree is left.

## Phase 10: Review fix-cycle

The review's MEDIUM and LOW findings, fixed on `359-review`. L3 (a pass deadline) and L4's boot-time TTL-vs-interval check are filed separately and not done here.

- [X] T047 M1: `close()`'s FR-013 paragraph in `packages/realtime/drivers/redis.ts` gains the last-page case. A pass whose command in flight is its last page finishes with no WARN, and its apply runs while `close()` closes the connections, not awaited. Every such action only removes access.
- [X] T048 M2: R9 (c) runs in both arrival orders (retry-then-reconnect, reconnect-then-retry). New row M22 (the rerun slot's last writer wins) survived the old suite and is killed by the reconnect-then-retry order.
- [X] T049 L1, L2, L4: `docs/realtime.md` names `REVOCATION_SCAN_COUNT`; `#runRevocationReconcile`'s JSDoc is re-wrapped; the bound's home adds that apply time and the wait on the manager's serial tail add to the bound, and that P grows with the whole index.
- [X] T050 L5, L6: "equivalent" becomes "no reachable state where deleting the check is wrong", naming #361, in this file, R13 (d) and the M14 row. R13 (d) drops an `unsubscribedFrom` assertion that could never fail.
- [X] T051 L7: `live_conformance_285` gains a row whose fake `HGETALL` pairs each field with another field's value, killed by the #285 sequence comparison. With `sortedPairs` replaced by a flat element sort, the same mutant survives the whole suite, so the kill rests on the pair sort.
- [X] T052 L8: R13 (e), where a throw from `owns` fails `listRevocations` (it rejects with that error and deletes nothing). New row M23 (the throw swallowed and read as "not mine") survived the old suite and is killed by R13 (e).
- [X] T053 L9: `plan.md`'s R13 and M14 rows (and the §9 risk row) match the as-built R13 (d).
- [X] T054 The gate, by exit status: `deno fmt && deno lint && deno check && deno task test && deno task agents:brief --check && deno task mutate realtime` (live broker for the live batteries) all exit 0. Result: 2880 passed and 0 failed; 34 batteries, all clean; `deno.lock` unchanged.

## Dependencies

T001 → T002 → T003 / T004 → T005 → T006 → T007 → T008 / T009 / T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027–T031 → T032 → T033 → T034 → T035 / T036 / T037 → T038 → T039–T045 → T046.

- **The fake first.** T001–T002 precede every driver change: once T015 lands, every FakeRedis test that runs a revocation pass issues `ZSCAN`. T005 depends on T003 and T004. T006 depends on T004.
- **Red witnesses.** T007's baseline precedes any driver edit. T008 R1 and T010 fail to compile until T011–T015 export their symbols, which is their red. R8, R9, R10 and R14 are behavioural reds on the current code.
- **`redis.ts` in order.** T011–T016 and T024–T026 all edit `packages/realtime/drivers/redis.ts` and run in order. T024 and T025 land together (the timer callback calls `#startRevocationPass`). T026 depends on T024 (the field type).
- **Manager in order.** T018 precedes T022, which moves the body T018 edited. T022 is a verbatim move, so T018's `owns` argument moves with it.
- **Commits.** T027–T031 break without T015 / T024, so they are committed with the code (T033). T034 follows everything that changes cadence.
- **Batteries.** T036 depends on T015's loop spelling. T038 depends on every verbatim move (T015, T018, T022, T025, T026).
- **Parallel work.** T003 ∥ T004; T009 ∥ T010; T027–T031 are parallel with each other; T035 ∥ T036 ∥ T037; T039–T045 are parallel with each other.

**Parallel example (Phase 9):** T039 (`driver.ts`), T040 and T041 (JSDoc; the same file, so write them sequentially if one agent does both), T042 (ADRs), T043 (`AGENTS.md`), T044 (`docs/realtime.md`) and T045 (test prose) touch different files.

## Implementation strategy

One branch, `265-paged-revocation-read`, with commits split by category (hard rule #9):

1. `test(359)`: the FakeRedis `ZSCAN` arm and header, the #280 refusals, `sortedPairs` and the #285 cases, and rows F1, F2, L1, L2 (T001–T006). This compiles alone: no production export is imported.
2. `fix(359)`:
   - the reap, grammar, decoders and paged `listRevocations`;
   - the constant messages;
   - the port signature and `owns`;
   - the manager tail;
   - the scheduler and `close()`;
   - the new witness file `revocation_paging_359.test.ts`;
   - the 5 re-scripts (T008–T034, excluding T007's scratchpad baseline).

   It is one commit because the pre-commit hook type-checks the whole workspace: the witnesses import exports created in the same change, and the re-scripts break without it.
3. `test(359)`: the `revocation_paging_359` battery, the #358 M3 re-anchor and the `live_conformance_285` relabel (T035–T038).
4. `docs(359)`: ADR 009 and the ADR 006 / 008 callouts, the bound's JSDoc home, the port contract JSDoc, the remaining JSDoc, `AGENTS.md` and the briefs, `docs/realtime.md`, and the test prose (T039–T045).

MVP = R1, R12 and R13 green (T001–T018): the reply bound is closed and enforcement is kept. Everything after that is part of the approved scope, not an option: the scheduler, the tail, the close interaction, the batteries and the docs.

## ⏸ Paused 2026-09-23 — resume here

**Committed on `265-paged-revocation-read` (tip `42890703`):** T001–T034 — the ZSCAN fake and its conformance
(`bfe3bfe6`), then the driver, port, manager tail, witnesses R1–R15 and the re-scripts (`42890703`). Gate at that
commit: `deno task test` 2877 passed / 0 failed; live realtime suite 922 / 0; the 9 timer-coupled files 128 → 128;
`deno.lock` unchanged.

**Known breakage at `42890703` until T036:** `sweep_paging_358` M3 is DEAD (its anchor `} while (cursor !== '0')` now
matches twice). `deno task test` is green; only the mutation battery reports it.

**Uncommitted work (T035–T045, unverified):** the developer dispatched on T035–T046 stalled before committing. Its
changes are intact, uncommitted, in the worktree `.claude/worktrees/agent-ae1d65abcdd3efdfb` (branch `359-impl-2`,
based on `42890703`): 14 modified files (+318/−53) plus two new files,
`packages/realtime/tests/mutations/revocation_paging_359.ts` and
`docs/adr/009-realtime-revocation-recheck-reads-index-in-pages.md`. A copy of the tracked diff is in
`.claude/worktrees/359-impl-2-wip.patch` (it does not include the two new files). None of it has passed a gate.
The M14 question (is deleting the manager's `connections.has` check observable, or `expectSurvival`?) is unresolved.

**To resume — exactly here:**
1. In the worktree above, review what is there against T035–T045 (the tasks are still unticked). Run
   `deno fmt && deno lint && deno check` on the changed files first; fix what fails.
2. Finish T035 (battery M1–M21; decide M14 — look for an observable side effect of applying a non-local record,
   else `expectSurvival` with a reason per `docs/testing.md`), T036 (re-anchor `sweep_paging_358` M3 on
   `"            if (end !== 'swept') return end\n            cursor = page.cursor\n        } while (cursor !== '0')\n"`
   and re-prove it live), T037 (relabel the `live_conformance_285` reap row), then T039–T045 (docs, ADR 009,
   `deno task agents:brief`).
3. Commit (`test(359)`, `docs(359)`), remove the worktree, fast-forward `265-paged-revocation-read`.
4. T046, the full gate: `deno fmt --check && deno lint && deno check && deno task test && deno task agents:brief
   --check`, then `LOCKNESS_REDIS_INTEGRATION=1 deno task mutate realtime` against a throwaway Redis 7 (stop it
   after); confirm `deno.lock` unchanged and no worktree left.
5. Then the Specnaut `review` phase (review-coordinator: code, security, test seats), fix-cycle if needed, merge
   (squash by scope, `Closes #359`), push. Next on the board: **#360** (Backlog) needs its architect-expert
   disposition.

**Resumed 2026-09-23.** The paused T035–T045 work was recovered from its worktree, finished and gated (T046: 34/34
realtime batteries clean on a live broker); the Specnaut review returned 0 CRITICAL / 0 HIGH; its fix-cycle (Phase 10)
is green (2880 passed, 34/34 batteries). Squashed by scope and merged.
