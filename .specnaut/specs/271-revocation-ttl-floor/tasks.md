# Tasks: a fleet-wide revocation TTL floor — every record outlives the longest live reader's TTL, so a mismatched `revocationTtlSeconds` no longer expires a revocation unapplied

**Plan**: `.specnaut/specs/271-revocation-ttl-floor/plan.md` (approved 2026-09-25, `dc6b5437`) | **Backlog item**:
[#380 — Realtime: a revocationTtlSeconds that differs across the fleet silently expires revocation records before a longer-interval reader applies them](https://github.com/locknessland/lockness-monorepo/issues/380)

**TDD is mandatory** (constitution). Every witness is written and run red on the current tree before the code that
turns it green. The red output is saved to the scratchpad.

**Decision homes.** Every task that touches a rule in the plan's 🔒 decision table (§5) names that rule's home as
**row N**. The decision may not land anywhere else. Unless stated otherwise, homes are in
`packages/realtime/drivers/redis.ts` ("`redis.ts`").

**Ids.**
- Witnesses are F1–F15 and their sub-cases: F4 (i–v), F5 (i–iv), F9 (i, ii), F13 (i, ii) and F14 (i–iii). All come
  from the plan's §4.
- Mutants are N1–N28.
- Test names start `#380 F<n> ` with a **trailing space**, so `F1 ` is not a prefix of `F10`–`F15`.

**Expected red on `main`.** The witness file does not compile on `main`. It imports `decodeRevocationFloor`, the five
constants and `MAX_REVOCATION_TTL_SECONDS` from `redis.ts`, and `isReap` / `isAnnounce` from the new
`tests/revocation_wire.ts`. That is its first red. Once T006 adds the skeleton, the behavioural state is:
- **Red:**
  - F1, the item's witness: R's pass returns nothing, because the record expired at +10 s;
  - F3, F4 (i, iv, v), F5 (i–iv), F6, F7 and F9 (i, ii);
  - F8, through its **precondition**: the floor holds `300` after R's reap. Without that precondition, F8's later
    assertions ("the entry is gone", "`t + 10`") hold on `main` vacuously;
  - F11 (the command count), F12 (the stub decoder does not refuse), F13 (i), F14 (i–iii) and F15.
- **Pins, green before and after:** F2 and F10.
- **Vacuously green on `main`, meaningful only once the announce exists:** F4 (ii), F4 (iii) and F13 (ii). Each
  asserts that **no** announce is issued, and there is no announce on `main`. They are not counted as reds. Their
  power is proven by their mutants:
  - F4 (ii) by N15;
  - F4 (iii) by N16;
  - F13 (ii) by N23.

**Numbers assigned at landing.**
- **ADR 013 and item 22 are provisional.** Before T047 and T050, run `ls docs/adr` and count the `### <n>.` headings
  under *Upgrading to v0.4.0*, then take the next free numbers.
  - Today that gives 001–012 and items 1–19. #370 is expected to add items 20 and 21 first.
  - The pitfall (T052) and the ADR 011 callout (T048) take the number T047 chose.

**#370 may land first.** It touches nothing under `drivers/`, but it regenerates the realtime `AGENTS.md` counts and
adds upgrade items. T045 rebases again before any docs task. A conflict in `AGENTS.md`'s generated *Tests* list is
resolved by re-running `deno task agents:brief`, **never by hand-merging counts**.

**Anchor hygiene.** These lines stay **byte-identical**:
- the `if (first && !this.#closing) {` line and `this.#deadline.arm(this.revocationTtlSeconds * 1000)` in
  `onRevocationReconcile` (#362 N32 and N17);
- `MARK_REVOKED_SCRIPT`'s text, which `live_conformance_285`'s killers run;
- the reap's existing `ZREMRANGEBYSCORE KEYS[1]` line (#359 R1, and the M1 replacement text);
- the `ZSCAN` call (`PAGE_READ`, `SCAN_ARGS`).

The `revocationFloorKey` getter goes **below** `revocationIndexKey`'s closing brace and above `publish`'s JSDoc. T053
greps for all of these.

**Worktrees and the pre-commit hook.** The pre-commit hook type-checks **every** git worktree. So:
- the witness file imports symbols that do not exist on `main`, and is committed **with** T006's skeleton, never
  alone;
- before any commit on `271-revocation-ttl-floor`, move a developer worktree's diff onto the branch and remove the
  worktree;
- never commit with a worktree open, and never use `--no-verify`.

`deno.lock` is never touched.

## Phase 1: Setup — rebase and baseline

- [x] T001 Rebase `271-revocation-ttl-floor` onto `origin/main` (`git fetch origin && git rebase origin/main`).
  - Confirm that the plan's anchors still hold:
    `git diff 32baca7b -- packages/realtime/drivers packages/realtime/tests/mutations packages/realtime/tests/fake_redis.ts packages/redis/tests/lua_eval.ts`
    must be empty.
  - If it is not empty, re-locate every §4 anchor and every line cited in D1–D5 before the first edit.
- [x] T002 **Baseline before the first edit.** Run the whole realtime suite, `deno test -A packages/realtime/`, and save
  the output to the scratchpad. It must be green. T016, T031 and T055 compare against it.
- [x] T003 **Battery baseline.** Run `deno task mutate realtime` and save the output.
  - The live-broker batteries (`live_conformance_285`, `self_skip_310`, `sweep_parse_316`) may report `PARTIAL`
    without a broker, but only if each is named in the saved output.
  - Every other battery must be clean. T043 compares against this run.
  - _Done:_ T001 anchor diff empty. T002 realtime suite: 1012 passed, 0 failed,
    37 ignored. T003: 41 batteries, 38 clean, 0 failed, 3 `PARTIAL` (no broker):
    `live_conformance_285`, `self_skip_310`, `sweep_parse_316`.

## Phase 2: Foundational — the wire helper, every red witness, then the skeleton

- [x] T004 New file `packages/realtime/tests/revocation_wire.ts` (FR-014). **Row 9's test-side home.** It has a
  `@fileoverview` and exports:
  - `isReap(args, index)`: numkeys `'2'`, the index at `args[3]`, the floor at `args[4]`, length 7;
  - `isAnnounce(args, floor)`: numkeys `'1'`, the floor at `args[3]`, length 6.

  Neither matches the other, nor the mark's `EVAL` (numkeys `'1'`, the **index** at `args[3]`). Neither reads script
  text. The helper has the **new** shape from the start. The three suites that keep a local `isReap` are migrated in
  T010, in the same commit as the reap change.
- [x] T005 New file `packages/realtime/tests/revocation_ttl_floor_380.test.ts`, with its harnesses (FR-013):
  - a `driver({ interval, ttl, port? })` builder over one shared FakeRedis;
  - a recording port that records each command **at issue**, and can reject a command matched by a predicate once,
    or from a given point on;
  - FakeRedis `setTime` for the broker clock and FakeTime for timers, restored in `finally`;
  - spies on `console.warn` and `console.error` that count lines starting with each FR-005 / FR-010 constant or with
    `REVOCATION_FLOOR_LOG_FAILED`, and that can be made to throw on command;
  - the #395 escape watcher, for "no escaped rejection";
  - F10's **old-release literals**: the mark and reap call forms and script texts copied from `32baca7b` as frozen
    constants. A comment says they are pins of the old release, **not oracles** for the new code (A6);
  - waits use gate promises, never fixed microtask counts.
- [x] T006 Write F1–F15, with every sub-case, in `revocation_ttl_floor_380.test.ts`, exactly as in the plan's §4 table:
  - F1: two raw drivers, R's handler captures `listRevocations`, no control frame is sent, and the broker clock and
    FakeTime advance 59 s;
  - F4 (v): `issued(isReap)` is 0 until the first pass, then 1, and the announce is matched only by `isAnnounce`;
  - F5 (iv): an injected `RedisCommandClient` whose `command()` **throws synchronously**;
  - F6 and F14: the WARN is asserted **after** the `EVAL` was issued;
  - F8 asserts its precondition first (the floor holds `300` after R's reap);
  - F13 (i) asserts the first backoff step is below 2 s, and a TTL-10 mark at +2 s scores `t + 300`.

  Then add the **skeleton** to `redis.ts`, with no behaviour change:
  - the five exported constants `REVOCATION_FLOOR_ANNOUNCE_FAILED`, `REVOCATION_FLOOR_SKIPPED`,
    `REVOCATION_FLOOR_READ_FAILED`, `REVOCATION_FLOOR_LOG_FAILED` and `REVOCATION_FLOOR_REFUSED` (**row 12's home**),
    with JSDoc, exported for tests only (not from `mod.ts`);
  - `MAX_REVOCATION_TTL_SECONDS` hoisted from the constructor's local (`:1943`) to a module constant directly below
    `MAX_TIMER_MS` (`:1536`). The constructor now reads it (FR-011, **row 3's home**), and its message and behaviour
    are unchanged;
  - `export function decodeRevocationFloor(reply: unknown, ownTtl: number): { ttl: number; skipped: number }`,
    a stub that returns `{ ttl: ownTtl, skipped: 0 }`.

  Run `deno check` on `redis.ts`, the helper and the witness file. Re-run the witness file and save the behavioural
  state. It must match "Expected red on `main`" above exactly. If a pin is red, or a red passes, stop and find out why
  before writing any code. **Commit T004–T006 together.**

## Phase 3: US1 — a short-TTL peer's revocation still reaches a long-interval reader (P1) 🎯 MVP

**Goal:** a record lives at least as long as the longest live reader's TTL.
**Independent test:** F1, F3, F7, F11 and F12 pass, and every migrated suite stays green.

- [x] T007 [US1] Add the private getter `revocationFloorKey` to `redis.ts`, returning
  `` `${this.prefix}${RESERVED_SEPARATOR_LEAD}revocation-floor` `` (FR-001). **Row 4's home.**
  - It goes directly below `revocationIndexKey` (`:2209-2211`).
  - Its JSDoc records the member (a TTL in seconds), the score (that entry's expiry, in broker seconds) and the key's
    own TTL (D3).
- [x] T008 [US1] Add the module constant `FLOOR_WRITE` to `redis.ts`, over **bound locals** `floor`, `ttl`, `keyTtl`
  and `t`, never over `KEYS`/`ARGV` (FR-002). **Row 5's home**, and **row 6's home** in its JSDoc. Its four lines:
  - `ZADD floor GT t + ttl ttl`
  - `ZREMRANGEBYSCORE floor -inf t`
  - `EXPIRE floor keyTtl NX`
  - `EXPIRE floor keyTtl GT`

  The JSDoc names its **only two callers**, `REAP_REVOKED_SCRIPT` and `ANNOUNCE_FLOOR_SCRIPT`. It says why each line
  is there, and links `MARK_REVOKED_SCRIPT`'s JSDoc for `NX`-then-`GT` rather than restating it.
- [x] T009 [US1] Splice `FLOOR_WRITE` into `REAP_REVOKED_SCRIPT` in `redis.ts` (FR-003):
  - `local t = TIME[1]`;
  - the existing index `ZREMRANGEBYSCORE`, byte-identical;
  - `local floor = KEYS[2]`, `local ttl = ARGV[1]`, `local keyTtl = ARGV[2]`;
  - `FLOOR_WRITE`;
  - `return t`.

  Its JSDoc says the floor write rides on the reap, and that the reap is still the pass's only **index** delete. Then
  change `listRevocations`' call to `EVAL REAP_REVOKED_SCRIPT 2 <index> <floor> <ownTtl> <ownTtl + INDEX_TTL_SLACK_SECONDS>`.
  **Row 9's production home** (the reap call site). `decodeReapReply` is untouched.
- [x] T010 [US1] **The suite migration that T009 forces**, in the **same commit** as T009 (FR-014, FR-015). **Only
  the predicate's definition moves; no assertion changes.**
  - `packages/realtime/tests/revocation_paging_359.test.ts:142`: delete the local `isReap`, and import it from
    `./revocation_wire.ts` bound to `INDEX`. Its dependents (`reaps()`, `hold`, `failOnce`: 30 lines in 11 tests) keep
    their meaning.
  - `packages/realtime/tests/pass_sample_360.test.ts:91`: the same (3 lines in 3 tests, plus P13 transitively).
  - `packages/realtime/tests/revocation_pass_bound_362.test.ts:186`: the same (19 lines in 12 tests, including
    `issued(isReap) === 1` at `:348`).
  - `packages/realtime/tests/prefix_anchoring.test.ts`:
    - the canned `EVAL` table (`:224-235`) routes by numkeys and key position, **never by script text**: the two-key
      reap gets a bulk `t`, a one-key `EVAL` on the floor key gets `nil`, and a one-key `EVAL` on the index key keeps
      today's reply;
    - add a `ZRANGEBYSCORE` arm answering an empty array;
    - `PREFIX_MEMBERS` gains `revocationFloorKey`;
    - the SC-001 derived-name set gains `'alpha__revocation-floor'`;
    - FR-006's `shapes` gains `revocationFloorKey: 'alpha__revocation-floor'`.
  - `packages/realtime/tests/live_realtime.ts` `keys()` gains `revocationFloor: \`${prefix}__revocation-floor\``.
  - `packages/realtime/tests/recording_ports.ts:15-19`: correct the "ten names" header comment.

  Run the four edited suites green before committing T009–T010.
- [x] T011 [US1] Implement `decodeRevocationFloor` in `redis.ts`, beside `decodeRevocationPage` (FR-009). **Row 2's
  home.** **Row 3** (it reads `MAX_REVOCATION_TTL_SECONDS`).
  - A reply that is not an array of bulk strings throws `REVOCATION_FLOOR_REFUSED`, which never carries the reply.
  - A member that fails `EPOCH_SECONDS` is skipped and counted. `EPOCH_SECONDS` is used as is: not renamed, copied or
    re-spelled.
  - A member that passes is clamped to `[1, MAX_REVOCATION_TTL_SECONDS]`.
  - It returns `ttl = max(ownTtl, every clamped member)` and `skipped`.
  - It is pure: it writes no WARN. Its JSDoc carries `@param`, `@returns`, `@throws` and `@example`.
- [x] T012 [US1] `markRevocation` becomes two round trips in `redis.ts` (FR-008). **Row 1's home** (`eff`), and
  **row 13** (`MARK_REVOKED_SCRIPT` unchanged).
  1. `ZRANGEBYSCORE <floor> -inf +inf`, no options, then `decodeRevocationFloor(reply, this.revocationTtlSeconds)`.
  2. `EVAL MARK_REVOKED_SCRIPT 1 <index> <eff> <member> <eff + INDEX_TTL_SLACK_SECONDS>`.

  The script's text and numkeys do not change. Its JSDoc (`:95-120`) gains one paragraph: `ARGV[1]` is the effective
  TTL.

  **In the same commit**, change `packages/realtime/tests/revocation_atomicity.test.ts:96-103` from "exactly one
  `EVAL`" to "one `ZRANGEBYSCORE` of the floor, then one `EVAL`". It is changed, not weakened.
- [x] T013 [US1] Run the witness file: **F1, F3, F7, F11 and F12 must be green**, and F2 and F10 stay green. Then run
  `revocation_atomicity.test.ts`, `prefix_anchoring.test.ts` and the three migrated suites green.

## Phase 4: US2 — a uniform fleet sees nothing new (P1)

**Goal:** a fleet with one TTL behaves exactly as before.
**Independent test:** F2 passes, and the whole suite matches the T002 baseline apart from the planned edits.

- [x] T014 [US2] Run F2: two TTL-300 drivers score `t + 300` exactly, and the index key TTL is in `[300, 360]`.
- [x] T015 [US2] Confirm `live_fake_conformance.test.ts`'s "#285 the revocation scripts agree" score window
  (`:711-729`, `[now+240, now+360]`) still holds on the fake. Every driver there uses TTL 300, so `eff = 300`.
- [x] T016 [US2] Compare the whole realtime suite with T002. Any suite that newly logs a `REVOCATION_FLOOR_*` line is
  **examined, never silenced**. Record each one, and the reason, in this task when you tick it.
  - _Done:_ 1039 passed, 0 failed, 37 ignored (baseline + 26 witnesses + the #395 E7 row). The only new
    `REVOCATION_FLOOR_*` lines are three `REVOCATION_FLOOR_ANNOUNCE_FAILED` WARNs from
    `driver_redis_live.test.ts`: its loopback RESP server (`packages/redis/tests/fake_server.ts`) answers every
    `EVAL` with `ERR unknown command`, so each manager's first announce is refused, WARNed once, and its retry is
    cleared by `close()`. Expected; not silenced.

## Phase 5: US3 — a stopped long-TTL reader stops lengthening records (P2)

**Goal:** the floor tracks live readers only, and extend-only writes hold on both halves.
**Independent test:** F8 and F9 (i, ii) pass.

- [x] T017 [US3] Run F8 and F9 (i, ii) green. `FLOOR_WRITE`'s prune, `GT`, `NX` and `GT` lines (T008) are what they
  exercise. No code change is expected. If one fails, the fix belongs in `FLOOR_WRITE` (**row 5**) and nowhere else.

## Phase 6: US4 — a corrupt or unreadable floor never blocks a revocation (P2)

**Goal:** a malformed floor is skipped, and an unreadable one fails **closed**. Every WARN is written after the
`EVAL` and is contained.
**Independent test:** F6, F14 (i–iii) and F15 pass.

- [x] T018 [US4] Add `#warnFloor(line: string): void` to `redis.ts` (FR-010, S2). **Row 11's home.** It is the #391
  shape:
  - `console.warn(line)` inside a `try`;
  - on a throw, one `writeMarkedFallback(REVOCATION_FLOOR_LOG_FAILED, …)` line with both halves;
  - it never throws.
- [x] T019 [US4] The **fail-closed read** in `markRevocation` (FR-008, S3). **Row 10's home.**
  - The floor read and the decode sit in one `try`.
  - On **any** failure (the command rejects, or the decoder throws), `eff = MAX_REVOCATION_TTL_SECONDS`, and the
    failure is kept for the WARN.
  - Only a failed `EVAL` fails the mark. There is no re-throw of the read, no fallback to the own TTL, no retry of the
    read and no `LIMIT`.
- [x] T020 [US4] Write the WARNs **after the `EVAL` resolves**, through `#warnFloor` only (FR-010). **Row 11.**
  - `REVOCATION_FLOOR_SKIPPED <count>` when `skipped > 0`. It carries the count, never a member.
  - `REVOCATION_FLOOR_READ_FAILED` plus `renderError(failure)` after a failed read.
  - A WARN never changes the mark's outcome.
- [x] T021 [US4] Run the witness file: **F6, F14 (i–iii) and F15 must be green**, and F1–F3, F7, F11 and F12 stay
  green. Then run `revocation_retry.test.ts`, which answers every command `null`. The mark now decodes `null` as a
  refusal and marks at MAX. Record the result in this task.
  - _Done:_ `revocation_retry.test.ts` green, unchanged: its marks decode `null` as a refused floor and mark at the
    maximum TTL. F14 (i) drives `WRONGTYPE` as the command client's rejection of the `ZRANGEBYSCORE` (FakeRedis does
    not type-check a zset read, and `fake_redis.ts` stays untouched per FR-012).

## Phase 7: US5 — a reader whose first announce fails is still covered (P2)

**Goal:** the first registration announces the floor entry, retried until it lands, and nothing escapes.
**Independent test:** F4 (i–v), F5 (i–iv) and F13 (i, ii) pass.

- [x] T022 [US5] Add `ANNOUNCE_FLOOR_SCRIPT` to `redis.ts` (FR-004): `local t = TIME[1]`, then `local floor = KEYS[1]`,
  `local ttl = ARGV[1]`, `local keyTtl = ARGV[2]`, then `FLOOR_WRITE`, with no `return`. **Row 5** and **row 6** (the
  second of `FLOOR_WRITE`'s two callers). Its JSDoc says it never carries the index key (**row 9**).
- [x] T023 [US5] Add `async #announceFloor(): Promise<void>` to `redis.ts` (FR-005, S1, S5). **Row 8's home.**
  - `try { await this.command.command('EVAL', ANNOUNCE_FLOOR_SCRIPT, '1', floor, String(ttl), String(ttl + slack)) }`.
    A synchronous throw from an injected port lands in the same `catch`.
  - On failure: one `#warnFloor(\`${REVOCATION_FLOOR_ANNOUNCE_FAILED} ${renderError(error)}\`)`, then schedule a
    retry.
  - **The retry.** One private field, `#announceRetry`, holds a `setTimeout` passed to `Deno.unrefTimer`. The backoff
    is 1 000 ms, doubling, capped at `reconcileIntervalMs`.
    - Every re-arm asks `#closing` (the #355 gate).
    - It stops at the first successful announce, the first completed reap (`#lastReadAt !== undefined`), or
      `#closing`.
  - Nothing escapes; there is no bare `.catch(() => {})`.
- [x] T024 [US5] In `onRevocationReconcile` in `redis.ts`, inside the existing `if (first && !this.#closing) {` block
  and **after** the deadline arm, add `void this.#announceFloor()` (FR-005, FR-006). **Row 7's home.**
  - The gate line and the arm line stay byte-identical (#362 N32, N17).
  - `onRevocationReconcile` stays synchronous and still registers `onReconnect` after the block.
- [x] T025 [US5] In `close()` in `redis.ts`, clear `#announceRetry` beside the other timers. Every anchored block in
  `close()` stays byte-identical.
- [x] T026 [US5] Add the announce's `.catch` as one row of `SINKS` in
  `packages/realtime/tests/escaping_sinks_395.test.ts` (FR-016, A3). `marked_fallback_sinks_391.test.ts` is **not**
  edited.
- [x] T027 [US5] Run the witness file: **F4 (i–v), F5 (i–iv) and F13 (i, ii) must be green**, and every earlier
  witness stays green. Then run `escaping_sinks_395.test.ts`, `lapse_rehold_349.test.ts` (W15b) and
  `revocation_atomicity.test.ts` (HIGH-2, which rejects every `EVAL` from construction) green. The announce carries
  no index key, so the `args.includes(INDEX)` predicates cannot match it.

## Phase 8: US6 — an upgrade in progress is no worse than today (P2)

**Goal:** an old writer or reap is never shortened or deleted early, and nothing fails open.
**Independent test:** F10 passes, before and after.

- [x] T028 [US6] Run F10 on the finished tree. It must still be green with the frozen `32baca7b` literals, and it was
  green in T006.
- [x] T029 [US6] Run `mixed_fleet_332.test.ts` and `revocation_encoding_332.test.ts` green. The record format is
  unchanged (**row 13**).

## Phase 9: US7 — an operator reads what a TTL now means (P3)

**Goal:** the option's JSDoc and the one operator statement say "at least".
**Independent test:** reading the two answers US7.

- [x] T030 [P] [US7] JSDoc in `redis.ts` (FR-020):
  - the `revocationTtlSeconds` option (`:803-809`): a marker lingers **at least** this long, up to the longest live
    reader's TTL, and it links the timing paragraph;
  - `MARK_REVOKED_SCRIPT` (`:103-106`) and `REAP_REVOKED_SCRIPT`;
  - `markRevocation`: two round trips, the fail-closed read, and `@throws` only for the `EVAL`;
  - `onRevocationReconcile` and `#announceFloor`: the announce and its retry.

  Also, in `packages/realtime/drivers/enforcement_deadline.ts:14`, "lives `revocationTtlSeconds`" becomes "at least".
  The bound's one home (`onRevocationReconcile`) is **not** restated.
- [x] T031 [US7] Run the whole realtime suite and compare it with T002.

## Phase 10: Batteries — the new battery, the re-anchors and the blast radius

- [x] T032 New battery `packages/realtime/tests/mutations/revocation_ttl_floor_380.ts` (FR-017). SUITES is
  `revocation_ttl_floor_380.test.ts`, plus `prefix_anchoring.test.ts` for N19. There are **28 rows, N1–N28**, as in
  the plan's §4.
  - Each row names its `killedBy` witness with a trailing space.
  - Every anchor is unique in today's source. Where a line repeats, the anchor carries a neighbouring line.
- [x] T033 [P] **The floor rows N1–N8** (the mark's `eff`, `min`/`max`, the index EXPIRE, the grammar, the clamp, the
  skip count, the skip-vs-throw choice, and the decoder's refusal): run each alone. Each must be `KILLED` by its
  named witness (F1, F7, F6 or F12).
- [x] T034 [P] **The write rows N9–N13 and N20** (`FLOOR_WRITE` in the reap, `GT`, the prune, `NX`, `GT` on
  `EXPIRE`, the key TTL's slack) → F3, F9 (i), F8, F3, F9 (ii) and F3. Prove each live.
- [x] T035 [P] **The announce rows N14–N18 and N21** (removed, every registration, out of the `#closing` gate, `catch`
  removed, `#warnFloor`'s `try` removed, the two-key form) → F4 (i), F4 (ii), F4 (iii), F5 (i), F5 (ii) / F15 and
  F4 (v). Prove each live.
  - N17 must turn F5 (i) red through an **escaped rejection**, not merely a missing line.
- [x] T036 [P] **The retry rows N22–N24** (retry removed; `close()` does not clear it or it ignores `#closing`; first
  step 5 000 ms) → F13 (i), F13 (ii) and F13 (i)'s step assertion. Prove each live.
- [x] T037 [P] **The fail-closed and order rows N25–N28** (read failure re-thrown; falls back to the own TTL; WARN
  before the `EVAL`; a non-async announce) → F14 (i, ii), F14 (i, ii), F6 (order) and F5 (iv). Prove each live.
  - N28 must turn F5 (iv) red through a synchronous throw out of `onRevocationReconcile`.
- [x] T038 [P] **N19** (`revocationFloorKey` without `RESERVED_SEPARATOR_LEAD`) → `prefix_anchoring.test.ts` FR-004
  source and SC-001. Prove it live.
- [x] T039 Run the whole new battery, `deno task mutate revocation_ttl_floor_380`. Every row must be `KILLED` and
  attributed. Save the output.
- [x] T040 **Re-anchor #359** in `packages/realtime/tests/mutations/revocation_paging_359.ts` (FR-019). **Never delete
  a row.**
  - The `REAP` constant (`:80-87`) moves to the two-key call form:
    `'EVAL', REAP_REVOKED_SCRIPT, '2', this.revocationIndexKey, this.revocationFloorKey, String(this.revocationTtlSeconds), String(this.revocationTtlSeconds + INDEX_TTL_SLACK_SECONDS)`,
    exactly as T009 wrote it.
  - M1's replacement keeps its one-reply read and needs no key change. Confirm that it still compiles as a mutant.
  - M7's replacement text (`:244-249`) re-sends the reap in the **two-key** form.
  - Re-prove M1 and M7 live against `revocation_paging_359.test.ts`.
- [x] T041 **Re-verify the held rows.** #362 N17 (the arm line) and N32 (`if (first && !this.#closing) {`) must be
  `KILLED` unchanged. If either is `DEAD`, T024 broke the byte-identity; repair T024, never the row.
- [x] T042 Re-run every battery whose witness went red during the migration, and confirm each is clean:
  - `revocation_paging_359`;
  - `pass_sample_360`;
  - `revocation_pass_bound_362`;
  - `prefix_288`;
  - `escaping_sinks_395`;
  - `live_conformance_285`: its Lua and fake rows are unaffected, because `MARK_REVOKED_SCRIPT` is unchanged.

  A `DEAD MUTANT` is **repaired, never deleted**, under "the source moved, the guard remains" (`docs/testing.md`).
- [x] T043 Run `deno task mutate realtime` and compare it with T003. There must be one more battery
  (`revocation_ttl_floor_380`). Every battery is clean, except the named live-broker batteries, which may report
  `PARTIAL` without a broker. Name them in the result.

## Phase 11: Live parity

- [x] T044 Add two rows to `packages/realtime/tests/live_fake_conformance.test.ts`, `ignore: !LIVE_BROKER` like their
  neighbours (FR-018):
  - **WC a:** after one reap on a live broker and on the fake, the floor reads back the same members and scores
    (`ZRANGEBYSCORE … -inf +inf WITHSCORES`, read raw by the **test only**) and the same key TTL band;
  - **WC b:** the same for the announce.

  Where a broker is available, run them with the three live-broker batteries. Then **record whether the live run
  happened**, as one line in this task:
  - *"Live run: yes — WC a, WC b green; `live_conformance_285`, `self_skip_310`, `sweep_parse_316` clean"*; or
  - *"Live run: no broker available — WC a and WC b are unverified live; the default gate ignores them."*

  Never leave it blank, and never claim a live pass from a run that ignored the suite.
  - _Live run: no broker available — WC a and WC b are unverified live; the default gate ignores them._

## Phase 12: Polish — rebase, ADR, docs, the brief, and the gate

- [x] T045 **Rebase again** onto `origin/main` before any docs task, because #370 may have landed.
  - `git diff <T001 base> -- packages/realtime/drivers` must still be empty apart from this branch's own changes.
  - Resolve an `AGENTS.md` conflict in a generated list with `deno task agents:brief`, never by hand.
  - Re-run the realtime suite green after the rebase.
- [x] T046 [P] JSDoc audit (FR-020, hard rule #7). Confirm each of these carries a description, `@param`, `@returns`,
  `@throws` and `@example` where they apply:
  - `revocationFloorKey`, `FLOOR_WRITE` (its two callers), `ANNOUNCE_FLOOR_SCRIPT`;
  - `decodeRevocationFloor` and `MAX_REVOCATION_TTL_SECONDS`;
  - the five constants;
  - `markRevocation`, `#announceFloor`, `#warnFloor` and `#announceRetry`.

  Nothing quotes an anchor line.
- [x] T047 [P] **ADR.** Run `ls docs/adr` and take the next free number: 013 today. Write
  `docs/adr/<NNN>-realtime-revocation-ttl-floor.md` (FR-020, D7). **Row 16's home.** It records:
  - the question;
  - the floor key, its write, its read, its lifetime, the announce and its retry, and the fail-closed read with its
    cost (about 24.8 days);
  - **the D2 ruling in full**, including the bounded TOCTOU (once per new maximum TTL, at join);
  - the rejected options with their costs:
    - fleet keys;
    - a per-record TTL field (fails open, `redis.ts:3133`);
    - write-time scoring;
    - a writer TTL in a reply or in metadata;
    - an operator check (ADR 011 §3);
    - extending `lua_eval`;
    - a loop-free max;
    - `WATCH`/`MULTI`;
    - running the reap at registration;
    - a `LIMIT` on the floor read;
    - an announce that is only reported, and admission that waits on the announce;
  - the residue (plan §9).

  It links the bound's one home rather than restating it.
- [x] T048 [P] **ADR 011 amendment**, in `docs/adr/011-realtime-revocation-bound-is-checked.md`:
  - the `**Status:**` line gains "amended by ADR <NNN>" (A5);
  - §5 gains `> **Amended by [ADR <NNN>](<NNN>-realtime-revocation-ttl-floor.md)**`.

  Its body is **not** rewritten.
- [x] T049 [P] `docs/realtime.md`, the operator statement and the prose that records a state:
  - **the revocation-timing paragraph** (`#revocation-timing`, `:1617-1636`) gains the **one operator statement** of
    the floor. **Row 15's home.** A record lives at least the writer's `revocationTtlSeconds`, up to the longest TTL
    among the instances that have reaped within their own TTL. One instance can no longer shorten records on its own.
    An unreadable floor keeps a record for the maximum TTL;
  - `:1791` ("self-expires after `revocationTtlSeconds`") links the timing paragraph;
  - **the bound paragraph** (`:1978-1984`) loses "assumed **uniform across the fleet**". It says the fleet's longest
    live TTL is **enforced** by the floor (ADR <NNN>), and it keeps the mixed-release caveat.

  None of them restates the statement; they link it.
- [x] T050 `docs/realtime.md` § *Upgrading to v0.4.0*: add the new item. This runs after T049, because it edits the
  same file.
  - First, count the `### <n>.` headings: 19 on `32baca7b`, and 21 once #370 lands. The new item is **22**, unless
    another item has landed.
  - The item covers:
    - before and after;
    - the new key `<prefix>__revocation-floor`, with its own TTL;
    - one more read per mark;
    - the new WARNs;
    - the fail-closed read and its cost;
    - protection only once every instance runs this release;
    - no wire change and no migration step.
  - It is **observable, not breaking**, and it links the timing paragraph (row 15).
  - **The intro** gets the new count. "One new Redis key family" becomes "two new Redis keys", and the item is named
    among the observable ones.
  - **Item 3** gains one line linking the new item.
- [x] T051 [P] Add one clause to the #362 bullet in `packages/realtime/README.md`, linking the timing paragraph.
  Nothing is restated (row 15).
- [x] T052 [P] Update `packages/realtime/AGENTS.md`:
  - the **bounded-read inventory** (`:614-622`, S4) gains: *revocation floor → unbounded, small by construction (one
    member per distinct live TTL); `MAX_REPLY_BYTES` is the backstop; an oversized reply is a read failure → MAX
    TTL*. **Row 14's home;**
  - a pitfall pointing at ADR <NNN>: *never decode the floor in Lua, never let a floor entry or an unreadable floor
    fail a mark, never write the floor outside `FLOOR_WRITE`, never announce outside the first-registration gate, and
    never put the index key on the announce*;
  - the sink count at `:960` is **removed**, not bumped (A3);
  - then run `deno task agents:brief` to regenerate the *Tests* list, which gains `revocation_ttl_floor_380` and
    `revocation_wire.ts`.

  In `packages/realtime/marked_fallback.ts:5`, reword "Seven sinks in this package …" so it names no number.
- [x] T053 Hygiene greps, each checked by its count:
  - `grep -c 'revocation-floor' packages/realtime/drivers/redis.ts` finds the getter only, not a literal at a call
    site (row 4);
  - `grep -n "'ZADD', floor" packages/realtime/drivers/redis.ts` finds `FLOOR_WRITE` only (row 5);
  - `FLOOR_WRITE`'s body contains no `KEYS[` or `ARGV[` (read it; A2);
  - `grep -n 'ANNOUNCE_FLOOR_SCRIPT' packages/realtime/drivers/redis.ts`: its call site passes `'1'` and no
    `revocationIndexKey` (row 9);
  - `grep -rn '2147483' packages/realtime --include=*.ts` finds no literal outside JSDoc (row 3);
  - `grep -rn 'EPOCH_SECONDS\s*=' packages/realtime` finds one definition (row 2);
  - `grep -n "isReap\s*=" packages/realtime/tests/*.test.ts` prints nothing: the only definition is in
    `revocation_wire.ts` (row 9);
  - `grep -n 'console\.warn' packages/realtime/drivers/redis.ts`: none of the lines is on the mark path or in
    `#announceFloor`, only in `#warnFloor` (row 11);
  - the anchor-hygiene lines in the header each still match the count their battery expects;
  - `grep -n 'Seven\|seven sinks' packages/realtime/marked_fallback.ts packages/realtime/AGENTS.md` prints nothing.
- [x] T054 `deno task deps:analyze` shows no new edge (`renderError` and `writeMarkedFallback` are already imported).
- [x] T055 **The full gate, judged by exit status only**, never by a pipe's:
  - `deno fmt`, then `deno task gate`;
  - `deno task agents:brief --check`;
  - `deno task mutate realtime`: the live-broker batteries may report `PARTIAL` only if each is named, as
    `live_conformance_285`, `self_skip_310` and `sweep_parse_316`.
  - Confirm that `git diff --stat origin/main -- deno.lock` is empty, and that `git worktree list` shows no leftover
    worktree of this branch.
  - Record the pass and fail counts, the battery totals, and the T044 live-run line in this task when you tick it.
  - _Done, on `origin/main` `92cf273f` (#370, #404 landed):_ `deno task gate` exit 0 — 3152 passed, 0 failed, 44
    ignored. `deno task agents:brief --check` clean. `deno task mutate realtime` exit 0 — 44 batteries, 41 clean,
    0 failed, 3 `PARTIAL` (no broker): `live_conformance_285`, `self_skip_310`, `sweep_parse_316`. The new
    `revocation_ttl_floor_380` battery: N1–N28 all `KILLED`, attributed. Re-anchored, never deleted: #359 M1's
    `REAP` and M7 (two-key reap), #359 M21 (the floor decoder repeats `skipped++`/`continue`), #362 N22/N23 (the
    hoisted `MAX_REVOCATION_TTL_SECONDS`). #362 N17/N32 killed unchanged. Live run: no broker (T044). ADR 013; the
    upgrade item is **24**, because #404 took 22 and #384 took 23. `deno.lock` untouched.
  - _Review folds (0 CRITICAL, 0 HIGH, 1 MEDIUM, 10 LOW):_ F16 pins the announce backoff (1, 2, 4 s, then
    capped); battery rows N29–N33 (doubling, cap, the two retry stop checks, the read-failed WARN's order), each
    `KILLED` and attributed. Deferred to the backlog: a wrong-typed floor key halting passes (ADR 013 §4), and the
    WC a/b live rows.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 + T010 → T011 → T012 → T013 → T014–T016 → T017 →
T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 → T031 → T032 →
T033–T038 → T039 → T040 → T041 → T042 → T043 → T044 → T045 → T046–T052 → T053 → T054 → T055.

- **Rebase first, and again before the docs.** T001 comes before everything, because the anchors were counted on
  `32baca7b`. T045 re-bases before any docs task, because #370 may have regenerated `AGENTS.md` and added upgrade
  items.
- **Red before green.** T006's compile red and behavioural red come before any change to `redis.ts` beyond the
  skeleton. Each story phase ends with the task that turns its witnesses green.
- **The reap change and the suite migration are one commit.** T009 without T010 turns about 52 lines in three suites
  red, and six `prefix_anchoring` tests with them.
- **`redis.ts` goes in order.** T006–T025 all edit `redis.ts`, so they run in sequence. `FLOOR_WRITE` (T008) exists
  before either caller (T009, T022). `#warnFloor` (T018) exists before the mark's WARNs (T020) and the announce
  (T023).
- **Story order.**
  - US1 is the MVP.
  - US2 and US6 are checks after US1.
  - US3 needs only `FLOOR_WRITE`.
  - US4 needs US1's mark.
  - US5 needs `FLOOR_WRITE` and `#warnFloor`.
  - US7 is documentation, placed after US5 to keep `redis.ts` edits serial.
- **Commits under the hook.**
  - T004–T006 are committed together, because the witness file imports the skeleton.
  - T009 and T010 go together.
  - T012 goes with the `revocation_atomicity` change.
  - T040 may be committed separately. `deno task mutate` is not part of the hook, but T043 must pass before the
    branch is reviewed.
  - Every commit is made with no worktree open.
- **Batteries.** T032–T039 depend on every code task. T040 depends on T009, T041 on T024, and T042–T043 come after
  them.
- **Docs.** T047's number feeds T048, T049, T050 and T052. T050 follows T049, because they edit the same file.

## Parallel examples

- **Phase 10:** T033–T038 prove disjoint row groups of one battery, so they can run in parallel. T040 and T041 touch
  other batteries' files, and run after T039.
- **Phase 12:** T046 (JSDoc), T047 (the new ADR), T048 (ADR 011), T049 (`docs/realtime.md`), T051 (README) and T052
  (`AGENTS.md`, `marked_fallback.ts`) touch different files. T050 follows T049.
- **Phases 3–9** are serial: one source file, `redis.ts`, and one witness file.

## Implementation strategy

This is one branch, `271-revocation-ttl-floor`. Incremental commits during implementation are fine, for example one
per story phase once its witnesses are green, each with a conventional prefix and `(380)`. At merge, the history is
**squashed by scope** into two commits:

1. `fix(380)`: the code and the tests (T004–T044).
   - The floor key, `FLOOR_WRITE`, the reap splice, the announce, its retry and the `close()` clear.
   - The decoder, the two-round-trip mark, the fail-closed read and `#warnFloor`.
   - The hoisted ceiling.
   - The wire helper and the suite migration, the witness file, the #380 battery, the two #359 re-anchors, the #395
     sink row and the two WC rows.
   - JSDoc lands with its code (hard rule #7).
2. `docs(380)`: ADR <NNN>, the ADR 011 amendment, `docs/realtime.md` (the timing paragraph, `:1791`, the bound
   paragraph, the new item, the intro and item 3), the README clause, `AGENTS.md` (the bounded-read row, the pitfall,
   the sink count, the regenerated briefs) and `marked_fallback.ts`'s count (T047–T052).

**MVP = US1 green (T001–T013).** A short-TTL peer's revocation reaches a long-interval reader, which closes #380's
acceptance criterion 3 by prevention. Everything after it is approved scope, not an option:
- the uniform-fleet and mixed-fleet checks;
- the corrupt and unreadable floor;
- the retried announce;
- the batteries;
- the live rows;
- the docs.
