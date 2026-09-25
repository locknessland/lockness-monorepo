# Plan: a fleet-wide revocation TTL floor — every record outlives the longest live reader's TTL, so a mismatched `revocationTtlSeconds` no longer expires a revocation unapplied

**Branch**: `271-revocation-ttl-floor` | **Date**: 2026-09-25 | **Backlog item**:
[#380 — Realtime: a revocationTtlSeconds that differs across the fleet silently expires revocation records before a longer-interval reader applies them](https://github.com/locknessland/lockness-monorepo/issues/380)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #380 (2026-09-25, hard rule #11): **prevent** the mismatch in the broker with a
fleet-wide revocation TTL floor. A second ruling by the same seat on the same day settled how the
mark reads that floor, which the first ruling had not accounted for (D2). Both are binding. This
plan adds what the dispositions left to the plan: the decision table, the requirements, the
witnesses and mutants in testable form, and the blast radius, **counted on `main` at `32baca7b`**.

§10 and §11 are placeholders. The two plan audits are dispatched by the coordinator.

**Where the tree, or a second ruling, departs from the disposition:**

- **D1 (anchor moved).** The disposition cites the per-record-TTL fail-open at `redis.ts` ~:3105.
  On `32baca7b` the line is **`:3133`** (`if (revocation === undefined) continue`), inside
  `listRevocations` (`:3080-3142`). The content is unchanged.
- **D2 (the mark reads the floor in TypeScript; `architect-expert` ruling, 2026-09-25, binding).**
  The disposition says `MARK_REVOKED_SCRIPT` uses `max(own TTL, live floor entries)`. That script
  cannot do so as specified. Every unit suite runs the scripts through FakeRedis, which evaluates the
  real text with `packages/redis/tests/lua_eval.ts`. That evaluator refuses loops, `<`, `>`,
  `tonumber`, `string.match` and reassignment, **by design**. The ruling, verbatim in substance:
  - **Shape.** `markRevocation` makes two round trips: `ZRANGEBYSCORE <floor> -inf +inf`, members
    only, then the **unchanged** `MARK_REVOKED_SCRIPT`. The script gets `ARGV[1] = eff` and
    `ARGV[3] = eff + INDEX_TTL_SLACK_SECONDS`, where `eff = max(own TTL, every decoded floor
    member)`. This is the disposition's max-TTL rule exactly. The script text, the record format
    and both replies are unchanged.
  - **Strict decode.** It has one home: a new pure `decodeRevocationFloor(reply, ownTtl)` beside
    `decodeRevocationPage`, using `EPOCH_SECONDS` as the member grammar.
  - **Clamp.** It has one home too: the constructor's local `maxRevocationTtlSeconds`
    (`redis.ts:1943`) is hoisted to a module constant that both the constructor and the decoder
    read.
  - **A bad floor entry never makes a mark throw.** A reply that is not an array of bulk strings
    throws (the mark fails loudly, as today). A member outside the grammar is skipped and counted,
    with one WARN per mark. A member in the grammar but out of range is clamped.
  - **No clock on the read.** Every reap and every announce prunes entries at or below its own `t`,
    so an expired entry can survive the read only until the fastest reader's next reap. That only
    lengthens records (fail-closed).
  - **One home for the floor-write Lua.** It is a TS fragment, `FLOOR_WRITE`, spliced into
    `REAP_REVOKED_SCRIPT` and into a new `ANNOUNCE_FLOOR_SCRIPT`. Both are called as
    `EVAL <s> 2 <index> <floor> <ownTtl> <ownTtl + slack>`.
  - **No helper changes.** `lua_eval.ts` does not change, and FakeRedis gains no command.
  - **Rejected.** Extending `lua_eval` would be a second home of `EPOCH_SECONDS`, and Lua's
    `tonumber` accepts `0x10`, `1e3` and `inf`. A second `ZADD GT` from the top floor score cannot
    be strict: a fractional score reaches the record and the page decoder then skips that record.
    That fail-open also needs a nil test and `REV`. Running the reap at registration would give the
    pass's only delete a second trigger.
- **D3 (the floor key carries its own TTL).** The disposition gives the key no lifetime. Without
  one, a fleet that stops leaves unpruned entries forever, and because the read has no clock (D2),
  those entries would inflate every later mark. `FLOOR_WRITE` therefore arms the key with
  `EXPIRE … NX` and then extends it with `EXPIRE … GT`, both at `ownTtl + INDEX_TTL_SLACK_SECONDS`.
  This is the index's two-call discipline (`redis.ts:95-120`), for the same reason: `GT` alone
  cannot arm a key that has no TTL.
- **D4 ("the tenth key name" counted).** `prefix_anchoring.test.ts` pins **9** prefix-deriving
  members today (`PREFIX_MEMBERS`: `topic`, `eventPattern`, `controlTopic`, `presenceKey`,
  `holdersKey`, `ownedKey`, `aliveKey`, `instancesKey`, `revocationIndexKey`). `topic` and
  `eventPattern` produce the same bytes, so those 9 members give **8** distinct derived strings.
  `revocationFloorKey` is the **tenth member** and the **ninth distinct string**. The brief's
  "bounded-read list" matches no list on the tree by that name. It is read here as the conformance
  command table (`live_fake_conformance.test.ts:281-287`). That table already proves
  `ZRANGEBYSCORE <key> -inf +inf`, the one read the mark adds, so it gains **no** row. The new
  proofs owed are the two WC rows (FR-018).
- **D5 (the blast radius is wider than "prefix tests, `keys()` and the reap anchors").** Three
  facts from the sweep of `32baca7b` widen it:
  - `ChannelManager`'s constructor calls `driver.onRevocationReconcile` unconditionally
    (`manager.ts:1212`), so the announce fires once for **every manager** built on a Redis driver.
  - Three suites each keep a local `isReap` predicate that matches the reap by `args[2] === '1' &&
    args.length === 4`: `revocation_paging_359.test.ts:142`, `pass_sample_360.test.ts:91` and
    `revocation_pass_bound_362.test.ts:186`. About 52 assertion or gate lines depend on them, and
    all go red once the reap takes two keys.
  - `prefix_anchoring.test.ts:224-235` routes canned `EVAL` replies by numkeys, so six tests there
    fail through `exercise()`.

  §4 lists every site.
- **D6 (the announce's failure line is an eighth marked-fallback sink).** If the announce's WARN
  itself throws, the line goes through `writeMarkedFallback` with a new marker. The package's
  "Seven sinks" statements (`marked_fallback.ts:5`, `marked_fallback_sinks_391.test.ts:5`) become
  eight, and the #391 `SINKS` table gains a row.
- **D7 (the record: ADR 013, amending ADR 011 §5).** This is a new decision, not a correction of
  #362's record. It adds a broker key and a cross-instance protocol, with rejected options of its
  own. House precedent is a new ADR that amends an earlier one, marked with a callout in the older
  record (ADR 004 → 005, 006, 007; ADR 006). ADR 011 stays the record of the per-instance checks;
  its §5 gains `> **Amended by ADR 013**`. ADR 012 exists, so the number is 013, unless another ADR
  lands first.
- **D8 (upgrade item 22).** `docs/realtime.md` § *Upgrading to v0.4.0* holds 19 items on
  `32baca7b` and will hold 21 once #370 lands. This feature's item is **22, unless another item
  lands first**. The number is assigned at landing. The item is **observable, not breaking**: what
  `revocationTtlSeconds` means for a record's life changes, and one broker key is added.

---

## 1. Why this exists

A durable revocation record is the only thing that applies a revocation whose one-shot control frame
was lost. It lives for its **writer's** `revocationTtlSeconds`, extended upward by `ZADD … GT`.
#362 made each instance check its own pair, `2 × presence.reconcileIntervalMs ≤
revocationTtlSeconds × 1000`, against its **own** values, and nothing more (ADR 011 §5).

In a fleet where the TTL differs, a peer with a short TTL writes records that expire before a reader
with a long interval runs its next pass. Take a writer at `revocationTtlSeconds: 10` and a reader at
`reconcileIntervalMs: 60_000` with `revocationTtlSeconds: 300`:

- both pass their own boot check;
- the writer's record expires 10 s after it is written;
- the reader's next pass is up to 60 s away;
- the revocation is **never applied** on the reader, and the socket it should have killed stays
  subscribed.

Nothing reports it. The reader's #362 deadline measures the reader's own passes, which are
succeeding.

Today the uniform TTL is a sentence in the docs (`docs/realtime.md:1981`; #362 decision row 15). It
is assumed, not enforced. The item carries the `security` label because it silently voids a stated
enforcement bound for a configuration every instance accepts.

**Who is affected:**

- every Redis fleet whose instances do not all share one `revocationTtlSeconds`, for example during a
  config rollout, per-service overrides, or a canary with a shorter TTL;
- and whose longer-interval instances own sockets that a shorter-TTL instance revokes while the
  control frame is lost.

## 2. User scenarios

### US1 — a short-TTL peer's revocation still reaches a long-interval reader (P1)

**Given** instance W at `revocationTtlSeconds: 10` (interval 5 000) and instance R at interval
60 000, TTL 300, both on this release and sharing one broker, with R owning connection `c1`
**When** W durably revokes `c1`, the control frame is lost, and R's next pass runs 59 s later
**Then** that pass finds the record and applies the revocation.

### US2 — a uniform fleet sees nothing new (P1)

**Given** every instance at the same `revocationTtlSeconds`
**When** revocations are written and reaped
**Then** every record's score is `t + revocationTtlSeconds`, exactly as today, and no new WARN
appears. The only additions are one small broker key and one read per mark.

### US3 — a stopped long-TTL reader stops lengthening records (P2)

**Given** R (TTL 300) stopped, and W (TTL 10) still running
**When** 300 s pass after R's last reap and W reaps once more
**Then** R's floor entry is gone, and W's records are scored `t + 10` again. The floor tracks the
**live** readers, not every TTL ever configured.

### US4 — a corrupt floor entry never blocks a revocation (P2)

**Given** a floor holding `300`, `1e3`, `0x10`, ` 5` and `inf`, put there by something other than
this driver
**When** an instance at TTL 10 marks a revocation
**Then** the record is scored `t + 300`, the mark succeeds, and one WARN reports the 4 skipped
members. The WARN never echoes the members.

### US5 — an upgrade in progress is no worse than today (P2)

**Given** a fleet with some instances on the previous release
**When** an old instance writes or reaps
**Then** its records live for its own TTL, as today. An old reap deletes only what has expired. No
record is shortened and nothing fails open. The floor protects a reader once every **writer** runs
this release.

### US6 — an operator reads what a TTL now means (P3)

**Given** an operator tuning `revocationTtlSeconds`
**When** they read the option's JSDoc or the timing paragraph
**Then** it says a record lives **at least** this long, and up to the longest TTL among the live
readers. Lowering one instance's TTL therefore no longer shortens records while a longer-TTL reader
is alive.

### Edge cases

- **The first-write race.** A reader's floor entry exists from its announce, one round trip after
  its first registration. A mark that lands before that uses the old floor. The reader holds no
  sockets yet, so the only records at risk are for connections it has not admitted.
- **The read-to-write race.** The mark reads the floor one round trip before it writes. A reader
  that announces in that gap is missed for that record (D2, "not solved").
- **A reader whose passes stall.** It stops reaping, so its entry expires one TTL after its last
  reap, which is when its #362 deadline fires. The loss is reported, not prevented.
- **`close()`.** No announce after `close()` has begun. A reap already in flight still writes the
  floor, and that entry expires on its own.
- **Re-registration** announces nothing, because only the first registration does, like the #362
  deadline arm.
- **An empty or absent floor.** `ZRANGEBYSCORE` answers an empty array, and `eff` is the own TTL.
- **A floor member above the range**, such as `9999999`, is clamped to 2 147 483 s.
- **The index key's own TTL** is `eff + 60`, so it outlives the longest record it holds, as #276
  requires.
- **The floor's size.** The reply grows with the number of **distinct** TTL values in the fleet,
  not with the number of instances. `ZADD GT` per TTL value is idempotent.
- **Broker-clock precision.** Entry expiry and record expiry both run on the broker's `TIME`, so
  they agree with each other. They agree with local time only to within one round trip, as in ADR
  011.

## 3. Requirements

**The floor key**

- **FR-001**: A new private getter, `revocationFloorKey`, returns
  `` `${this.prefix}${RESERVED_SEPARATOR_LEAD}revocation-floor` `` (`redis.ts`, directly below
  `revocationIndexKey`, `:2209-2211`). It is the **single production home** of the name. Its JSDoc
  records the member (a TTL in seconds), the score (that entry's expiry, in broker epoch seconds),
  and the key's own TTL (D3).
- **FR-002**: **`FLOOR_WRITE`**, a module constant in `redis.ts`, is the only Lua that writes the
  floor. Its four lines:
  - `ZADD KEYS[2] GT t + ARGV[1] ARGV[1]`
  - `ZREMRANGEBYSCORE KEYS[2] -inf t`
  - `EXPIRE KEYS[2] ARGV[2] NX`
  - `EXPIRE KEYS[2] ARGV[2] GT`

  Its JSDoc says why each line is there, and why `NX` and then `GT` (link the `MARK_REVOKED_SCRIPT`
  JSDoc, do not restate it).
- **FR-003**: **`REAP_REVOKED_SCRIPT`** becomes:
  - `local t = TIME[1]`;
  - the existing index `ZREMRANGEBYSCORE`, byte-identical;
  - `FLOOR_WRITE`;
  - `return t`.

  Its reply is unchanged, and `decodeReapReply` is unchanged. `listRevocations` calls it as
  `EVAL REAP_REVOKED_SCRIPT 2 <index> <floor> <ownTtl> <ownTtl + INDEX_TTL_SLACK_SECONDS>`. Its
  JSDoc says the floor write rides on the pass's one reap, and that the reap is still the pass's
  only **index** delete.
- **FR-004**: **`ANNOUNCE_FLOOR_SCRIPT`** is `local t = TIME[1]` plus `FLOOR_WRITE`, with no
  `return`. It is called with the same four operands as the reap. It declares the index key and
  never touches it. That is the price of `FLOOR_WRITE`'s fixed indices, and its JSDoc says so.

**Writing the floor**

- **FR-005**: **The announce.** Inside `onRevocationReconcile`'s existing
  `if (first && !this.#closing) {` block (`:3232`), **after** the deadline arm, the driver calls
  `this.#announceFloor()`. It does not await it: `onRevocationReconcile` stays synchronous.
  - `#announceFloor` sends `ANNOUNCE_FLOOR_SCRIPT`, and its rejection handler writes one WARN:
    `REVOCATION_FLOOR_ANNOUNCE_FAILED` followed by `renderError(error)`.
  - If `console.warn` throws, the line goes through `writeMarkedFallback` with a new marker,
    `REVOCATION_FLOOR_LOG_FAILED` (the eighth sink, D6).
  - No rejection escapes.
  - If the announce fails, the first pass's reap writes the entry anyway, one interval later.
- **FR-006**: The announce and the deadline arm share **one gate**: the existing
  `if (first && !this.#closing)` line, which stays byte-identical, as does the arm line (#362 N17
  and N32 anchor both). A registration after `close()`, and any re-registration, announce nothing.
- **FR-007**: Nothing else writes the floor. There is no write in the mark, in `close()`, in the
  heartbeat or in the ghost sweep.

**Reading the floor**

- **FR-008**: `markRevocation` (`:3017-3028`) becomes two round trips on its one command port,
  one after the other:
  1. `ZRANGEBYSCORE <floor> -inf +inf`, no options;
  2. `EVAL MARK_REVOKED_SCRIPT 1 <index> <eff> <member> <eff + INDEX_TTL_SLACK_SECONDS>`, where
     `eff = decodeRevocationFloor(reply, this.revocationTtlSeconds)`.

  **`MARK_REVOKED_SCRIPT`'s text does not change**, nor does its numkeys. Its JSDoc (`:95-120`)
  gains one paragraph: `ARGV[1]` is the effective TTL, not always this instance's own.
- **FR-009**: **`decodeRevocationFloor(reply: unknown, ownTtl: number): { ttl: number; skipped:
  number }`** is a new exported pure function beside `decodeRevocationPage`. It is exported for the
  test suite only, and `mod.ts` does not re-export it. It is the single home of what a floor reply
  means:
  - a reply that is not an array whose items are all bulk strings throws `REVOCATION_FLOOR_REFUSED`,
    a constant that never carries the reply;
  - a member that fails `EPOCH_SECONDS` is skipped and counted;
  - a member that passes is clamped to `[1, MAX_REVOCATION_TTL_SECONDS]`;
  - `ttl` is the maximum of `ownTtl` and every clamped member.

  It does not rename, copy or re-spell `EPOCH_SECONDS`.
- **FR-010**: When `skipped > 0`, `markRevocation` writes one WARN, `REVOCATION_FLOOR_SKIPPED` plus
  the count, **before** the `EVAL`. The WARN follows the `REVOCATION_PAIRS_SKIPPED` precedent. It
  carries the count only, never a member. A `console.warn` that throws here propagates as the
  mark's own error, as every other `markRevocation` failure does. The manager applies the revocation
  locally and re-throws, so there is nothing to contain.
- **FR-011**: **`MAX_REVOCATION_TTL_SECONDS = Math.floor(MAX_TIMER_MS / 1000)`** is hoisted from
  the constructor's local (`:1943`) to a module constant directly below `MAX_TIMER_MS`
  (`:1536`). The constructor's range guard and `decodeRevocationFloor` both read it. The
  constructor's message and behaviour are unchanged.

**Unchanged**

- **FR-012**: No change to:
  - the record member format, the index key or `MARK_REVOKED_SCRIPT`'s text;
  - the reap's reply or `decodeReapReply`;
  - `decodeRevocationPage`, `EPOCH_SECONDS`, `REVOCATION_SCAN_COUNT`, the pass, the deadline, the
    boot checks, the control plane, the manager, the options shape or `mod.ts`.

  `lua_eval.ts` and `fake_redis.ts` do not change (D2).

**Tests**

- **FR-013**: The witnesses F1–F12 go in a new `packages/realtime/tests/revocation_ttl_floor_380.test.ts`
  (§4). Test names start `#380 F<n> ` with a trailing space. They are committed **red on `main`
  first**, except the pins F2 and F10. They use FakeRedis `setTime` to move the broker clock
  and FakeTime for timers. F5 spies on `console.warn` and `console.error` and counts lines by the
  FR-005 and FR-010 constants.
- **FR-014**: The reap's wire shape gets **one test-side home**: a new helper,
  `packages/realtime/tests/revocation_wire.ts`, exporting `isReap(args, index)` (numkeys `'2'`, the
  index at `args[3]`, the floor at `args[4]`, length 7). The three local `isReap` definitions (D5)
  are **replaced by imports**. They are not edited in place three times. `isAnnounce(args, floor)`
  lives beside it. No assertion that uses them changes.
- **FR-015**: **`prefix_anchoring.test.ts`**:
  - its canned `EVAL` table (`:224-235`) answers the two-key reap with a bulk `t`, the announce with
    `nil`, and a new `ZRANGEBYSCORE` arm with an empty array;
  - `PREFIX_MEMBERS` gains `revocationFloorKey`;
  - the SC-001 derived-name set gains `'alpha__revocation-floor'`;
  - FR-006's `shapes` gains `revocationFloorKey: 'alpha__revocation-floor'`;
  - `exercise()` drives `markRevocation` and `listRevocations` as it does today, and now also
    reaches the floor through both.

  `live_realtime.ts` `keys()` gains `revocationFloor`. The `recording_ports.ts` header comment
  (`:15-19`, "ten names") is corrected.
- **FR-016**: **`marked_fallback_sinks_391.test.ts`** gains the announce sink as a row of `SINKS`.
  The "Seven sinks" wording in that file and in `marked_fallback.ts:5` becomes eight (D6).
- **FR-017**: The mutation battery `packages/realtime/tests/mutations/revocation_ttl_floor_380.ts`
  holds rows N1–N20 (§4). SUITES is the FR-013 file, plus `prefix_anchoring.test.ts` for N19. Each
  row is **proven live**: it ran, and it turned its named witness red.
- **FR-018**: **Two live-parity rows** in `live_fake_conformance.test.ts`, `ignore: !LIVE_BROKER`
  like their neighbours:
  - **WC a:** after one reap on a live broker and on the fake, the floor reads back the same members
    and scores (`ZRANGEBYSCORE … -inf +inf WITHSCORES` read raw, **by the test only**) and the same
    key TTL band;
  - **WC b:** the same for the announce.

  **`tasks.md` records whether the live run happened**, because the default gate cannot see it.
- **FR-019**: **Battery repair** (§4 list). #359's `REAP` anchor (`revocation_paging_359.ts:80-87`)
  and M7's replacement text (`:244-249`) move to the two-key call form. The two rows are
  **re-anchored, never deleted**, and re-proven live. Then `deno task mutate realtime` runs. Any
  other `DEAD MUTANT` is repaired under "the source moved, the guard remains" (`docs/testing.md`),
  never deleted.

**Docs**

- **FR-020**:
  - **`docs/realtime.md`**:
    - **The revocation-timing paragraph** (`:1617-1636`) gains one sentence, and it is the **one
      operator statement** of the floor. A record lives at least the writer's `revocationTtlSeconds`,
      and up to the longest TTL among the instances that have reaped within their own TTL. One
      instance can therefore no longer shorten records on its own. Everything else links here.
    - **`:1791`** ("self-expires after `revocationTtlSeconds`") links the timing paragraph.
    - **The bound paragraph (`:1978-1984`)** loses "assumed **uniform across the fleet**". It now
      says the fleet's longest live TTL is **enforced** by the floor (ADR 013), and it keeps the
      mixed-release caveat.
    - **Item 22** of *Upgrading to v0.4.0* (D8):
      - before: a record lived for its writer's TTL;
      - after: at least that, and up to the longest live reader's TTL. It links the timing
        paragraph;
      - the new key `<prefix>__revocation-floor`, with its own TTL;
      - one more read per mark;
      - the new WARN;
      - protection holds only once every instance runs this release;
      - no wire change and no migration step. Observable, not breaking.
    - The section's intro gets the new count, and "one new Redis key family" becomes "two new
      Redis keys", naming the floor. Item 3 gains one line linking item 22.
  - **`packages/realtime/README.md`**: the #362 bullet in *What ships* gains one clause linking the
    timing paragraph.
  - **`packages/realtime/AGENTS.md`**:
    - a pitfall: *never decode the floor in Lua, never let a floor entry make a mark throw, never
      write the floor outside `FLOOR_WRITE`, and never announce outside the first-registration
      gate*, pointing at ADR 013;
    - the *Tests* list, regenerated by `deno task agents:brief`.
  - **ADR 013** (the number is assigned at landing, D7),
    `docs/adr/013-realtime-revocation-ttl-floor.md`, records:
    - the question;
    - the floor key, its write, its read and its lifetime;
    - both rulings, including D2 in full;
    - the rejected options with their costs:
      - fleet keys;
      - a per-record TTL field, which fails open (`redis.ts:3133`);
      - write-time scoring, where an old reader's reap deletes new records;
      - a writer TTL in a reply or in metadata, which a reader that missed the record also misses;
      - an operator check, which ADR 011 §3 refuses;
      - the three D2 rejections;
    - the residue (§9).

    **ADR 011 §5** gains `> **Amended by [ADR 013](…)**`, and its body is not rewritten.
  - **JSDoc**:
    - the `revocationTtlSeconds` option (`:803-809`): a marker lingers **at least** this long;
    - `MARK_REVOKED_SCRIPT` (`:103-106`, `ARGV[1]`) and `REAP_REVOKED_SCRIPT`;
    - `FLOOR_WRITE`, `ANNOUNCE_FLOOR_SCRIPT` and `revocationFloorKey`;
    - `markRevocation` (two round trips; `@throws` for a refused floor reply);
    - `decodeRevocationFloor`, `MAX_REVOCATION_TTL_SECONDS` and the three new constants;
    - `onRevocationReconcile` (the announce);
    - `enforcement_deadline.ts:14` ("lives `revocationTtlSeconds`" becomes "at least").

    The bound's one home (`onRevocationReconcile`) is **not** restated anywhere.
  - **No `CHANGELOG` file**: #364 tracks the missing root changelog.

## 4. Success criteria

- **SC-001**: In a fleet of instances on this release, a revocation whose control frame was lost is
  applied by its owner whenever the owner's own timing passes its boot check, **whatever TTL the
  writing instance is configured with**. This meets the item's acceptance criterion 3 by
  prevention.
- **SC-002**: A fleet with one uniform TTL behaves exactly as before: the same record lifetimes, no
  new warning, and no change to any reply.
- **SC-003**: Once every instance with a long TTL has stopped, records return to the writer's own
  TTL within one such TTL.
- **SC-004**: No floor content, however malformed, stops a revocation from being recorded. The
  operator sees one warning per affected revocation, carrying a count only.
- **SC-005**: No floor-write failure escapes as an uncaught error. It is reported on one line.
- **SC-006**: During a rolling upgrade, no record lives shorter than it does today.

**Witnesses** (FR-013), in `tests/revocation_ttl_floor_380.test.ts`. "Red" means the witness fails
on `main` at `32baca7b`. All share one FakeRedis unless stated.

| # | Setup → assertion |
| :--- | :--- |
| F1 (red, **the item's witness**) | W: raw driver, interval 5 000, TTL 10. R: raw driver, interval 60 000, TTL 300, handler `R.onRevocationReconcile(() => …R.listRevocations(owns c1))` capturing results. R registers, and one R reap runs. W marks `{ target: 'c1' }`, and **no control frame is sent** (the dropped frame). The broker clock (`setTime`) and FakeTime advance 59 s, and R's next pass runs → **R's pass returns `c1`**. Today it returns nothing, because the record expired at +10 s |
| F2 (pin) | A uniform fleet: two drivers at TTL 300, each reaped once → a mark scores `t + 300` exactly, and the index key's TTL is in `[300, 360]`. Green before and after |
| F3 (red) | After one reap by a TTL-300 driver: the floor holds exactly `{ '300': t + 300 }`, and its key TTL is 360 (read raw) |
| F4 (red) | (i) The first `onRevocationReconcile` issues exactly one announce **before** any reap, with operands `2 <index> <floor> 300 360`. (ii) Re-registration issues none. (iii) A registration after `close()` issues none. (iv) A `new ChannelManager` over the driver issues exactly one |
| F5 (red) | (i) The announce `EVAL` rejects → exactly one `REVOCATION_FLOOR_ANNOUNCE_FAILED` WARN, and no escaped rejection (the #395 escape watcher). (ii) The same, with `console.warn` throwing → exactly one marked `REVOCATION_FLOOR_LOG_FAILED` line carrying both halves. (iii) After (i), the first reap still writes the floor entry |
| F6 (red) | The floor seeded raw with `300`, `1e3`, `0x10`, ` 5`, `5.5`, `inf`, `''` and `012`. A TTL-10 driver marks → the record scores `t + 300`, and exactly one `REVOCATION_FLOOR_SKIPPED 7` WARN, with no member text in it |
| F7 (red) | The floor seeded raw with `9999999` → the record scores `t + 2147483`, and the index key TTL is `2147483 + 60` |
| F8 (red) | R (TTL 300) reaps once and then stops. After 301 s, W (TTL 10) reaps → R's entry is gone. The next W mark scores `t + 10` (US3) |
| F9 (red) | GT on both halves. (i) A TTL-300 reap at t, then a TTL-10 reap at t+5 → the `300` entry keeps `t + 300`, and the key TTL stays ≥ 355. (ii) A TTL-10 reap first, then a TTL-300 reap → the key TTL is extended to 360 |
| F10 (pin, mixed fleet) | An **old-shape** writer (the `MARK_REVOKED_SCRIPT` call as on `32baca7b`, own TTL 10) beside a new TTL-300 reader → that record scores `t + 10`, as today. An **old-shape** reap (1 key) at t+5 deletes nothing live and leaves the floor untouched. Green before and after |
| F11 (red) | A floor that is absent or empty → the record scores `t + ownTtl`, and the mark is exactly two commands: one `ZRANGEBYSCORE` of the floor, then the `EVAL`. Today it is one command |
| F12 (red) | `decodeRevocationFloor`, as a unit: a non-array, an array holding an integer, and a nil → each throws `REVOCATION_FLOOR_REFUSED`, whose message carries no reply text. `[]` gives the own TTL. Grammar and clamp as in F6 and F7 |
| — | Every existing realtime test stays green after the FR-014, FR-015 and FR-016 edits, and no assertion is weakened |

**Mutants** (FR-017), battery `tests/mutations/revocation_ttl_floor_380.ts`, each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| N1 | the mark ignores the floor: `eff = ownTtl` | F1 |
| N2 | `Math.min` instead of `Math.max` in the decoder | F1 |
| N3 | the index EXPIRE keeps `ownTtl + slack` | F7 |
| N4 | the decoder accepts by `Number.isFinite(Number(m))` instead of `EPOCH_SECONDS` | F6 (`1e3` counted, so the score is `t + 1000`) |
| N5 | the clamp's upper bound dropped | F7 |
| N6 | the skip count dropped from the WARN / the WARN dropped | F6 |
| N7 | a skipped member throws instead of being counted | F6 |
| N8 | a non-array reply decodes to `[]` instead of throwing | F12 |
| N9 | `FLOOR_WRITE` removed from `REAP_REVOKED_SCRIPT` | F3 |
| N10 | `GT` dropped from the floor `ZADD` | F9 (i) |
| N11 | the floor prune removed | F8 |
| N12 | `EXPIRE … NX` removed (the key is never armed) | F3 (TTL −1) |
| N13 | `EXPIRE … GT` removed | F9 (ii) |
| N14 | the announce removed | F4 (i) |
| N15 | the announce on every registration (moved out of the `first` gate) | F4 (ii) |
| N16 | the announce moved out of the `#closing` gate | F4 (iii) |
| N17 | the announce's rejection handler removed | F5 (i) (escaped) |
| N18 | the announce's WARN `try` / marked fallback removed | F5 (ii) |
| N19 | `revocationFloorKey` built without `RESERVED_SEPARATOR_LEAD` | `prefix_anchoring` FR-004 source and SC-001 |
| N20 | the reap passes `eff`-less operands: `ARGV[2] = ownTtl` (slack dropped) | F3 (key TTL 300) |

**Blast radius, counted on `main` at `32baca7b`** (a read of the tests, cross-checked by `git grep`;
nothing was run):

- **Production files**: `packages/realtime/drivers/redis.ts` only, plus one JSDoc line in
  `drivers/enforcement_deadline.ts` and one line in `marked_fallback.ts`. `manager.ts` is **not**
  edited: its constructor already registers (`:1212`).
- **Suites edited: 8.**
  - The three `isReap` owners move to the FR-014 helper: `revocation_paging_359`, `pass_sample_360`
    and `revocation_pass_bound_362`. About 52 dependent lines, of which 30 are in #359 (11 tests),
    3 in #360 (3 tests, plus P13 transitively) and 19 in #362 (12 tests). **Only the predicate's
    definition moves.**
  - `prefix_anchoring` (FR-015): the canned table, the roster, the set, and `shapes`. Six tests fail
    through `exercise()` until the table is fixed.
  - `marked_fallback_sinks_391` (FR-016) and `live_fake_conformance` (FR-018).
  - `revocation_atomicity.test.ts:96-103`, which asserts that the mark is exactly **one** `EVAL`
    on a bare driver. FR-008 makes it one `ZRANGEBYSCORE` of the floor, then one `EVAL`, and the
    assertion is changed to say so. It is changed, not weakened.
  - `live_realtime.ts` `keys()` (a name table, with no completeness assertion).
- **Suites that stay green by construction, and why**:
  - `escaping_sinks_395.test.ts:142` and `lapse_rehold_349.test.ts:202` pick out the reap by the
    **index** key. The announce also carries the index key (FR-004), so both will also match the
    announce. They are **expected** to stay green, because the announce runs at construction,
    before either predicate is used (a reading of the sweep, not a run). **Both are re-verified by
    running them**, and `tasks.md` records the result. If a run fails, the fix is to import
    `isReap` (FR-014), never to loosen the assertion.
  - `revocation_atomicity.test.ts:221-224` (HIGH-2) rejects every `EVAL` from construction. The
    announce is caught (FR-005), so no rejection escapes; its WARN assertions use `some()`.
  - `revocation_retry.test.ts:20` answers every command `null`. The announce ignores its reply.
  - Eleven key-filtered or script-filtered `EVAL` predicates (roster, presence, sweep) do not match
    the announce's keys or verbs.
- **Existing battery rows**:
  - **Re-anchored (2), never deleted:** `revocation_paging_359` M1 and M7, through the `REAP`
    constant (`:80-87`) and M7's replacement (`:244-249`).
  - **Held byte-identical by FR-006 (2):** `revocation_pass_bound_362` N17 (the arm line) and N32
    (`if (first && !this.#closing) {`).
  - **Unaffected (2):** `live_conformance_285`'s two Lua and fake rows, which anchor in `lua_eval.ts`
    and `fake_redis.ts`. Their killers still run the unchanged mark script.
  - **Indirect:** every row of the #359, #360 and #362 batteries whose witness goes red until
    FR-014 lands. They are re-run, not edited.
  - `prefix_288` anchors `instancesKey`, not the lines around `revocationIndexKey`. The FR-001
    getter goes **below** `revocationIndexKey`'s closing brace and above `publish`'s JSDoc, and
    `deno task mutate realtime` confirms that no anchor split.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| 1. A record lives at least `max(writer's TTL, every live floor member)` — the fleet floor (disposition 2026-09-25) | `markRevocation`'s `eff`, computed by `decodeRevocationFloor`, `packages/realtime/drivers/redis.ts` | a max computed in Lua; a second max in the reap; the floor applied in the manager; a per-record TTL field |
| 2. What a floor reply means: an array of bulk strings, else refused; a member in the `EPOCH_SECONDS` grammar, else skipped and counted; clamped to the TTL range | `decodeRevocationFloor`, `packages/realtime/drivers/redis.ts` (D2 ruling) | a Lua `tonumber` / `string.match`; a second regex for seconds; a `Number(...)` decode in `markRevocation`; a throw on a bad member |
| 3. The TTL range's ceiling, `⌊MAX_TIMER_MS / 1000⌋` | `MAX_REVOCATION_TTL_SECONDS`, `packages/realtime/drivers/redis.ts` (hoisted from `:1943`) | the constructor's local kept alongside; a literal `2147483` in the decoder or a test oracle |
| 4. The floor's name | `revocationFloorKey`, `packages/realtime/drivers/redis.ts` | the string built inline at a call site; a test fixture that becomes an oracle rather than a pin |
| 5. How the floor is written: `ZADD GT t+ttl ttl`, prune `≤ t`, `EXPIRE NX` then `GT` at `ttl + slack` | `FLOOR_WRITE`, `packages/realtime/drivers/redis.ts` | the four lines spelled out again in the reap or the announce; a `ZADD` without `GT`; an `EXPIRE` with `GT` alone |
| 6. When the floor is written: every reap, and the first registration's announce; never elsewhere | `REAP_REVOKED_SCRIPT` and `onRevocationReconcile`'s first-registration block, `packages/realtime/drivers/redis.ts` (two askers of `FLOOR_WRITE`) | a write in the mark, the heartbeat, `close()` or the sweep; running the reap at registration |
| 7. The announce and the deadline arm share one gate: first registration, and `close()` not begun | the `if (first && !this.#closing)` line, `onRevocationReconcile`, `packages/realtime/drivers/redis.ts` | a second `first` flag; a `#announced` field; a separate `#closing` check around the announce |
| 8. An announce failure is one WARN, and never an escaped rejection; a failing WARN becomes one marked line | `#announceFloor`, `packages/realtime/drivers/redis.ts`; the fallback's format lives in `marked_fallback.ts` | an awaited announce; a bare `.catch(() => {})`; a second fallback format |
| 9. The WARN texts: `REVOCATION_FLOOR_ANNOUNCE_FAILED`, `REVOCATION_FLOOR_SKIPPED`, `REVOCATION_FLOOR_LOG_FAILED`, `REVOCATION_FLOOR_REFUSED` | four exported constants, `packages/realtime/drivers/redis.ts` (exported for tests only, not from `mod.ts`) | text inlined at the call site or copied into a test |
| 10. The mark script, the record format, the reap reply and every reply decoder are unchanged | `MARK_REVOKED_SCRIPT`, `decodeReapReply`, `decodeRevocationPage`, `packages/realtime/drivers/redis.ts` | a new ARGV or KEY on the mark script; a reply that carries the floor |
| 11. The reap's wire shape, as a test asks it | `isReap` / `isAnnounce`, `packages/realtime/tests/revocation_wire.ts` | three local `isReap` copies; a predicate that matches any `EVAL` |
| 12. The operator statement of what a TTL now means for a record's life | the revocation-timing paragraph, `docs/realtime.md` (`#revocation-timing`) | a second statement in item 22, the bound paragraph, README or `AGENTS.md` (they link); the old "assumed uniform" sentence kept |
| 13. The fleet TTL is **enforced**, not assumed | ADR 013, `docs/adr/013-realtime-revocation-ttl-floor.md` (it amends ADR 011 §5) | ADR 011 §5 rewritten in place; #362's plan row 15 edited (a historical record) |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary dependencies**: `@lockness/realtime` only,
with no new edge (`renderError` and `writeMarkedFallback` are already imported) · **Storage**: one
new Redis sorted set per prefix, holding one member per distinct TTL, with its own TTL ·
**Testing**: `deno test`; FakeRedis with `setTime`; FakeTime; the #395 escape watcher; the shared
mutation harness; two live-only rows · **Target**: server library · **Project type**: framework
package · **Performance**:
- no new round trip per pass, since the floor write rides on the reap;
- one more round trip per `markRevocation`, which is a rare path;
- one round trip per driver at registration;
- the floor reply grows with the number of distinct TTLs, not with the number of instances.

· **Constraints**:
- Redis 7.0+ (already required, for `ZADD GT` and `EXPIRE NX|GT`);
- no wire, control-frame, manager, option-shape or `mod.ts` change;
- no change to the FakeRedis Lua subset;
- no reply shape change.

· **Scale**: the floor holds as many members as there are distinct TTL values in the fleet.

### Domain model

- **Bounded context**: realtime (the Redis driver's durable-revocation record).
- **Vocabulary**:
  - *revocation record*: an index member, scored by its expiry;
  - **revocation floor**: the fleet-wide set of live readers' TTLs;
  - **floor entry**: one TTL value, scored by the broker second it lapses, and refreshed by any
    reap or announce at that TTL;
  - **effective TTL** (`eff`): `max(own, live floor members)`, the TTL a mark writes with;
  - **announce**: the first registration's floor write;
  - *reap*: the pass's one script, now also refreshing the floor.
- **Entities**: `RedisBroadcastDriver`, the aggregate root. It owns the key names, the scripts, the
  announce and the mark. No new class.
- **Value objects**:
  - the effective TTL;
  - the decoded floor, `{ ttl, skipped }`;
  - a floor entry `(ttl, lapsesAt)`, **conceptual**: no class exists.
- **Invariants**:
  - **a record written by this release lives at least as long as every floor entry that is live
    when its mark reads the floor;**
  - a floor entry lives at least one TTL past its reader's last successful reap;
  - no floor content can shorten a record below its writer's own TTL, or make a mark throw;
  - the floor is written only through `FLOOR_WRITE`, and only by a reap or the first announce;
  - no announce failure escapes;
  - no record is scored above `t + MAX_REVOCATION_TTL_SECONDS`.
- **Out of scope**:
  - the per-instance bound and the pass deadline (#362);
  - retention through a long failure run (#380 *Out of scope*);
  - changing any default;
  - third-party `BroadcastDriver`s, which get no floor.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | `decodeRevocationFloor(reply: unknown, …)` returns a typed record; the new constants are strings; nothing is added to `mod.ts` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | per task, plus `deno task mutate realtime` and `deno task deps:analyze` |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-020 lists every block |
| MVC layering | pass | not applicable (driver) |
| Commit discipline | pass | test (red witnesses, `revocation_wire.ts`) / fix (`redis.ts`, the suite repairs that follow from it) / test (the battery, the re-anchors, the WC rows) / docs (ADR 013, the ADR 011 callout, `realtime.md`, README, `AGENTS.md`) |
| No environment detail in versioned files | pass | none; the live rows are named by flag only |
| Design decisions go to architect-expert | pass | the disposition and the D2 ruling are binding; the audits (§10, §11) are pending |
| Product decisions go to the user | pass | none open (§12) |
| Act, don't recommend | pass | the D2 question was dispatched, not asked |
| TDD, red first | pass | F1, F3–F9, F11 and F12 are red on `main`; F2 and F10 are pins |
| No silent catches | pass | the announce's handler writes a WARN or a marked line (FR-005) |
| Domain Model gate | pass | §6 |
| Fail closed on broker-sourced input | pass | a malformed floor can only lengthen a record or be skipped, never shorten one (FR-009) |
| #276 extend-only writes | pass | `ZADD GT`; `EXPIRE NX` then `GT` on the floor key (D3) |
| #288 reserved separator | pass | FR-001; N19 |

### Complexity tracking

No violation. What is added:

- one broker key;
- one Lua fragment, one new script, and one line spliced into the reap;
- one pure decoder and four constants;
- one hoisted constant;
- one private method (`#announceFloor`) and one getter;
- one test helper;
- one ADR.

`redis.ts` stays the package's largest file (4 287 lines). Nothing here is a separate
responsibility worth extracting: the floor is one more fact about the revocation record, which
this file owns.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | no | no new export from `mod.ts`, no option change, no new throw from the constructor |
| Behaviour of `revocationTtlSeconds` | yes, **observable** | a record lives at least this long, and up to the longest live reader's TTL (item 22) |
| Broker keyspace | yes | `<prefix>__revocation-floor`, a sorted set with its own TTL |
| Wire (`EVAL` operands) | yes, internal | the reap takes 2 keys and 2 args; a new announce script; the mark is preceded by one `ZRANGEBYSCORE` |
| Logs | yes | two new WARNs (announce failed; floor members skipped) and one marked fallback |
| `markRevocation` latency | yes | two round trips instead of one |
| Control plane, manager, `mod.ts`, record format | no | — |
| Tests | yes | a new witness file, battery and helper; 8 suites edited (§4); 2 battery rows re-anchored; 2 live rows |
| Docs | yes | the timing paragraph, `:1791`, the bound paragraph, item 22 (number at landing), the intro and item 3, README, `AGENTS.md`, ADR 013 and the ADR 011 callout, JSDoc |

### Documentation (this feature)

```text
.specnaut/specs/271-revocation-ttl-floor/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A suite matches the announce by accident and injects its failure there instead of into the reap | FR-014 homes the reap's wire shape. The two index-key predicates (#395, #349) are re-run and the result is recorded in `tasks.md`. The announce runs at construction, before any of them arms |
| A battery row goes DEAD | §4 lists the 2 re-anchors and the 2 held rows; FR-006 keeps the gate lines byte-identical; `deno task mutate realtime` is in the gate |
| The live broker and the fake disagree on the new script | the FR-018 WC rows; `tasks.md` records whether the live run happened |
| **Residue: the mixed-release gap.** Until every writer runs this release, an old writer's records live for its own TTL | Accepted (disposition). Item 22 states it. Nothing is worse than today (F10) |
| **Residue: the first-write race.** A mark in the one round trip before a new reader's announce lands uses the old floor | Accepted. That reader owns no socket yet |
| **Residue: the read-to-write race.** The mark reads the floor one round trip before it writes (D2) | Accepted. It widens the first-write race by one round trip. Closing it would need an announce before admission, which is not decided here |
| **Residue: records outlive their writer's TTL.** The index holds each record up to the longest live reader's TTL | Accepted. Index size is paid in pages (ADR 009). A short-TTL instance can no longer shorten the fleet's records on its own, and the docs say so |
| **Residue: a stalled reader drops out of the floor.** Its records can expire as its #362 deadline fires | Reported, not prevented (ADR 011) |
| **Residue: retention through a long failure run** | Out of scope (#380), unchanged |
| **Residue: third-party drivers** get no floor | The floor is a Redis-driver fact; the port is unchanged |
| **Residue: broker-clock precision.** Entry and record share the broker's `TIME`; local time agrees only to within one round trip | Accepted, as in ADR 011 |
| **Residue: floor size.** Anyone with bus access can fill the floor; the reply grows with it | Accepted. The same actor can already `DEL` the index. The clamp caps each record's lifetime |
| The ADR or item number collides with another landing | Assigned at landing (D7, D8) |

## 10. Architecture audit

*`architect-expert`, against this document before any code. Pending: dispatched by the
coordinator.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | _pending_ | _pending_ |

**Verdict**: _pending._

## 11. Security audit

*`security-expert`, in parallel with the architecture audit. Pending: dispatched by the
coordinator.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | _pending_ | _pending_ |

**Verdict**: _pending._

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Approve the architecture as audited (tasks → implement → review)? | _Asked at stop 1._ | — |

No product question is open. The one behaviour change a user sees is that a lower
`revocationTtlSeconds` on one instance no longer shortens records while a longer-TTL reader is
alive. That is the prevention the disposition chose, and it is recorded, not asked.

### Decided without asking

- The design is the #380 `architect-expert` disposition (2026-09-25), plus the same seat's D2 ruling
  (2026-09-25). Both are binding under hard rule #11.
- **D1:** the fail-open anchor is `redis.ts:3133`.
- **D3:** the floor key gets its own TTL, by the index's `NX`-then-`GT` discipline. The D2 ruling
  depends on it.
- **D4:** the floor is the tenth prefix-deriving member, and the "bounded-read list" is read as the
  conformance command table, which needs no row.
- **D6:** the announce's fallback is the eighth marked-fallback sink.
- **D7:** a new ADR 013 amends ADR 011 §5, following the ADR 004 → 005/006/007 precedent. Both
  numbers are assigned at landing.
- **D8:** item 22, unless another item lands first. It is observable, not breaking.
- **FR-014:** the reap's test-side wire shape moves to one helper rather than being edited in three
  places. This is a test-layer choice the audit may overrule.
- The announce sits inside the existing first-registration block, after the deadline arm, so #362's
  N17 and N32 keep their anchors, and the two share one gate.
- The skipped-member WARN is written by the mark, not by the decoder, because the decoder stays
  pure, like `decodeRevocationPage`.
- #370 / #363 touch nothing under `drivers/` or `driver.ts`, so this work does not wait for them.
