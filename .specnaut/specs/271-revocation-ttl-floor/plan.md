# Plan: a fleet-wide revocation TTL floor — every record outlives the longest live reader's TTL, so a mismatched `revocationTtlSeconds` no longer expires a revocation unapplied

**Branch**: `271-revocation-ttl-floor` | **Date**: 2026-09-25 | **Backlog item**:
[#380 — Realtime: a revocationTtlSeconds that differs across the fleet silently expires revocation records before a longer-interval reader applies them](https://github.com/locknessland/lockness-monorepo/issues/380)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #380 (2026-09-25, hard rule #11): **prevent** the mismatch in the broker with a
fleet-wide revocation TTL floor. This plan adds what the disposition left to the plan: the decision
table, the requirements, the witnesses and mutants in testable form, and the blast radius,
**counted on `main` at `32baca7b`**.

Both plan audits are folded in (§10, §11), with the `architect-expert`'s rulings on every finding,
binding under hard rule #11 (2026-09-25). The fold makes these changes:

- **D2** is re-ruled, and its shape is kept (A1).
- The announce is distinct from the reap on the wire (A2).
- A floor that cannot be read makes the mark fail closed (S3).
- A failed announce is retried (S1).
- The floor WARNs are written after the `EVAL`, contained (S2).
- The bounded-read inventory gains a row (S4).
- The announce is `async` (S5).
- The sink rows move to #395's table (A3).
- Three LOW edits (A4–A6).

**Where the tree, or a ruling, departs from the disposition:**

- **D1 (anchor moved).** The disposition cites the per-record-TTL fail-open at `redis.ts` ~:3105.
  On `32baca7b` the line is **`:3133`** (`if (revocation === undefined) continue`), inside
  `listRevocations` (`:3080-3142`). The content is unchanged. _Upheld by the audit._
- **D2 (the mark reads the floor in TypeScript; `architect-expert` ruling in the plan audit,
  2026-09-25, binding; A1).** The disposition says `MARK_REVOKED_SCRIPT` uses `max(own TTL, live
  floor entries)`. As written, that needs a loop, comparisons and a strict numeric decode in Lua.
  The FakeRedis evaluator (`packages/redis/tests/lua_eval.ts`) does not model any of those today.
  Its refusals are **not** a design stance: its own error text says "extend the evaluator"
  (`lua_eval.ts:108-111`). Extending it was weighed on its merits and rejected (below). The ruling:
  - **Shape.** `markRevocation` makes two round trips: `ZRANGEBYSCORE <floor> -inf +inf`, members
    only, then the **unchanged** `MARK_REVOKED_SCRIPT`, with `ARGV[1] = eff` and
    `ARGV[3] = eff + INDEX_TTL_SLACK_SECONDS`. `eff = max(own TTL, every decoded floor member)`.
    This is the disposition's max-TTL rule exactly. The script text, the record format and both
    replies are unchanged.
  - **Strict decode.** One home: a pure `decodeRevocationFloor(reply, ownTtl)` beside
    `decodeRevocationPage`, using `EPOCH_SECONDS` as the member grammar.
  - **Clamp.** One home: the constructor's local `maxRevocationTtlSeconds` (`redis.ts:1943`),
    hoisted to a module constant that both the constructor and the decoder read.
  - **A bad floor entry never makes a mark throw.** A member outside the grammar is skipped and
    counted, and a member in the grammar but out of range is clamped. A floor that cannot be read
    at all makes the mark fail **closed** (S3, FR-008).
  - **No clock on the read.** Every reap and every announce prunes entries at or below its own `t`,
    so an expired entry survives the read only until the fastest reader's next reap. That only
    lengthens records (fail-closed).
  - **One home for the floor-write Lua.** It is a TS fragment, `FLOOR_WRITE`, over bound locals,
    spliced into `REAP_REVOKED_SCRIPT` and a new `ANNOUNCE_FLOOR_SCRIPT`. The two differ on the
    wire (A2).
  - **The TOCTOU is bounded, not recurring.** The read comes one round trip before the write. The
    gap opens **once per new maximum TTL, at join**: an established reader refreshes its entry
    every interval, and that interval is at most TTL/2.
  - **No helper changes.** `lua_eval.ts` does not change, and FakeRedis gains no command.
  - **Rejected:**
    - **Extending `lua_eval`.** Lua 5.1 patterns cannot even spell `EPOCH_SECONDS`, so it would be
      a second, weaker home, and `tonumber` accepts `0x10`, `1e3` and `inf`.
    - **A loop-free max.** Taking the top score moves per-entry expiry onto the key, which breaks
      US3 and SC-003. The `ZINTERSTORE` variant coerces `5.5`, which the page decoder then skips
      (fail-open).
    - **`WATCH`/`MULTI`.** It aborts constantly under load, needs connection affinity the port
      does not offer, and needs a new FakeRedis command family.
    - **Running the reap at registration.** It would give the pass's only delete a second
      trigger.
- **D3 (the floor key carries its own TTL).** The disposition gives the key no lifetime. Without
  one, a fleet that stops leaves unpruned entries forever, and because the read has no clock (D2),
  those entries would inflate every later mark. `FLOOR_WRITE` therefore arms the key with
  `EXPIRE … NX` and then extends it with `EXPIRE … GT`, both at `ownTtl + INDEX_TTL_SLACK_SECONDS`.
  This is the index's two-call discipline (`redis.ts:95-120`). _Upheld._
- **D4 ("the tenth key name" counted; the bounded-read list located).** `prefix_anchoring.test.ts`
  pins **9** prefix-deriving members today (`PREFIX_MEMBERS`: `topic`, `eventPattern`,
  `controlTopic`, `presenceKey`, `holdersKey`, `ownedKey`, `aliveKey`, `instancesKey`,
  `revocationIndexKey`). `topic` and `eventPattern` give the same bytes, so there are **8**
  distinct strings. `revocationFloorKey` is the **tenth member** and the **ninth distinct string**.
  _Counts upheld._ The "bounded-read list" is the reply-bound inventory in
  `packages/realtime/AGENTS.md:614-622`. The first draft read it as the conformance command table,
  which was wrong. The list gains a floor row (S4, FR-020).
- **D5 (the blast radius is wider than "prefix tests, `keys()` and the reap anchors").** Three
  facts from a sweep of `32baca7b` widen it. _Upheld._
  - `ChannelManager`'s constructor calls `driver.onRevocationReconcile` unconditionally
    (`manager.ts:1212`), so the announce fires once for **every manager** built on a Redis driver.
  - Three suites each keep a local `isReap` that matches `args[2] === '1' && args.length === 4`
    (`revocation_paging_359.test.ts:142`, `pass_sample_360.test.ts:91`,
    `revocation_pass_bound_362.test.ts:186`). About 52 dependent lines go red once the reap takes
    two keys.
  - `prefix_anchoring.test.ts:224-235` routes canned `EVAL` replies by numkeys, so six tests there
    fail through `exercise()`. §4 lists every site.
- **D6 (the marked-fallback sink count is dropped, not bumped; A3).** `main` has **11**
  `writeMarkedFallback` call sites, so "seven sinks" was already stale. The count is removed from
  `marked_fallback.ts:5` and from `packages/realtime/AGENTS.md:960`, and no new number replaces it.
  The announce's `.catch` is a row of `escaping_sinks_395.test.ts`'s `SINKS` table, not #391's.
- **D7 (the record: ADR 013, amending ADR 011 §5).** This is a new decision with a broker key, a
  cross-instance protocol and rejected options of its own. House precedent is a new ADR that amends
  an older one with a callout (ADR 004 → 005/006/007; ADR 006). ADR 011 stays the record of the
  per-instance checks. Its §5 gains `> **Amended by ADR 013**`, and its `**Status:**` line gains
  "amended by ADR 013" (A5). ADR 012 exists, so the number is 013, unless another ADR lands first.
- **D8 (upgrade item 22).** `docs/realtime.md` § *Upgrading to v0.4.0* holds 19 items on
  `32baca7b` and will hold 21 once #370 lands. This item is **22, unless another item lands
  first**, assigned at landing. It is **observable, not breaking**. _Upheld._

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

- every Redis fleet whose instances do not all share one `revocationTtlSeconds`, for example during
  a config rollout, per-service overrides, or a canary with a shorter TTL;
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

### US4 — a corrupt or unreadable floor never blocks a revocation (P2)

**Given** a floor holding `300`, `1e3`, `0x10`, ` 5` and `inf`, put there by something other than
this driver
**When** an instance at TTL 10 marks a revocation
**Then** the record is scored `t + 300`, the mark succeeds, and one WARN after the write reports the
4 skipped members. The WARN never echoes a member.

**And given** a floor that cannot be read at all (a wrong-typed key, an oversized reply, a transport
error)
**Then** the record is scored at the maximum TTL, the mark succeeds, and one WARN says the floor was
unreadable.

### US5 — a reader whose first announce fails is still covered (P2)

**Given** a new reader R (TTL 300) whose first announce is rejected by the broker
**When** a TTL-10 peer marks a revocation 2 s later
**Then** R's retried announce has already landed, and the record is scored `t + 300`.

### US6 — an upgrade in progress is no worse than today (P2)

**Given** a fleet with some instances on the previous release
**When** an old instance writes or reaps
**Then** its records live for its own TTL, as today. An old reap deletes only what has expired. No
record is shortened and nothing fails open. The floor protects a reader once every **writer** runs
this release.

### US7 — an operator reads what a TTL now means (P3)

**Given** an operator tuning `revocationTtlSeconds`
**When** they read the option's JSDoc or the timing paragraph
**Then** it says a record lives **at least** this long, and up to the longest TTL among the live
readers. Lowering one instance's TTL therefore no longer shortens records while a longer-TTL reader
is alive.

### Edge cases

- **The first-write race.** A reader's floor entry exists once its announce lands, one round trip
  after its first registration. If the announce **fails**, the reader may already be admitting
  sockets. The old wording, "it holds no sockets yet", is false in that case. So the announce is
  retried with a first backoff step under 2 s (S1), and the window is that retry, not one interval.
- **The read-to-write race** (D2) opens once per new maximum TTL, at join. An established reader
  refreshes its entry every interval, which is at most TTL/2.
- **A floor lost after a successful announce**, through a failover or a `volatile-*` eviction
  (`docs/realtime.md:1640-1644`), leaves up to one interval of short records. That lasts until the
  reader's next reap rewrites the entry. The index key has the same exposure (§9).
- **A floor that cannot be read** → the record is scored at `MAX_REVOCATION_TTL_SECONDS` (about
  24.8 days) and one WARN is written (S3). Only a failed `EVAL` fails the mark.
- **A wrong-typed floor key** also fails every reap. That is the same class as a wrong-typed index
  key, and #362's deadline reports it (§9).
- **A reader whose passes stall** stops reaping, so its entry expires one TTL after its last reap,
  which is when its #362 deadline fires. The loss is reported, not prevented.
- **`close()`.** No announce, and no announce retry, once `close()` has begun. `close()` clears the
  retry timer. A reap already in flight still writes the floor, and that entry expires on its own.
- **Re-registration** announces nothing: only the first registration does, like the #362 deadline
  arm.
- **An injected `RedisCommandClient` that throws synchronously** from `command()`: the announce is
  `async`, so the throw becomes its own caught rejection. `onRevocationReconcile` still registers
  `onReconnect` (S5).
- **An empty or absent floor.** `ZRANGEBYSCORE` answers an empty array, and `eff` is the own TTL.
- **A floor member above the range**, such as `9999999`, is clamped to 2 147 483 s.
- **The index key's own TTL** is `eff + 60`, so it outlives the longest record it holds (#276).
- **The floor's size** grows with the number of **distinct** TTL values, not with the number of
  instances. `MAX_REPLY_BYTES` is the backstop, and an oversized reply is a read failure, so the
  mark uses the max TTL (S4).
- **Broker-clock precision.** Entry expiry and record expiry both run on the broker's `TIME`. They
  agree with local time only to within one round trip, as in ADR 011.

## 3. Requirements

**The floor key**

- **FR-001**: A new private getter, `revocationFloorKey`, returns
  `` `${this.prefix}${RESERVED_SEPARATOR_LEAD}revocation-floor` `` (`redis.ts`, directly below
  `revocationIndexKey`, `:2209-2211`). It is the **single production home** of the name. Its JSDoc
  records the member (a TTL in seconds), the score (that entry's expiry, in broker epoch seconds),
  and the key's own TTL (D3).
- **FR-002** (A2, A4): **`FLOOR_WRITE`**, a module constant in `redis.ts`, is the only Lua that
  writes the floor. It is written over **bound locals** `floor`, `ttl`, `keyTtl` (and `t`), never
  over `KEYS`/`ARGV` directly. Its four lines:
  - `ZADD floor GT t + ttl ttl`
  - `ZREMRANGEBYSCORE floor -inf t`
  - `EXPIRE floor keyTtl NX`
  - `EXPIRE floor keyTtl GT`

  `lua_eval.ts:24-27` already supports bound-variable operands. **Its JSDoc is the home of "only
  two callers"**: `REAP_REVOKED_SCRIPT` and `ANNOUNCE_FLOOR_SCRIPT`. It says why each line is
  there, and links the `MARK_REVOKED_SCRIPT` JSDoc for `NX`-then-`GT` rather than restating it.
- **FR-003**: **`REAP_REVOKED_SCRIPT`** becomes:
  - `local t = TIME[1]`;
  - the existing index `ZREMRANGEBYSCORE`, byte-identical;
  - `local floor = KEYS[2]`, `local ttl = ARGV[1]`, `local keyTtl = ARGV[2]`;
  - `FLOOR_WRITE`;
  - `return t`.

  It is called as `EVAL <s> 2 <index> <floor> <ownTtl> <ownTtl + INDEX_TTL_SLACK_SECONDS>`, so
  its length on the wire is 7. Its reply and `decodeReapReply` are unchanged. It is still the
  pass's only **index** delete.
- **FR-004** (A2): **`ANNOUNCE_FLOOR_SCRIPT`** is:
  - `local t = TIME[1]`;
  - `local floor = KEYS[1]`, `local ttl = ARGV[1]`, `local keyTtl = ARGV[2]`;
  - `FLOOR_WRITE`.

  It has no `return`. It is called as **`EVAL <s> 1 <floor> <ownTtl> <ownTtl + slack>`** (length
  6), so it **never carries the index key** and differs from the reap in numkeys and shape. A test
  tells the two apart by numkeys and key position, never by script text
  (`prefix_anchoring.test.ts:215-218` forbids that).

**Writing the floor**

- **FR-005** (S1, S5): **The announce.** Inside `onRevocationReconcile`'s existing
  `if (first && !this.#closing) {` block (`:3232`), **after** the deadline arm, the driver calls
  `void this.#announceFloor()`. `onRevocationReconcile` stays synchronous.
  - **`#announceFloor` is `async`**, with `try`/`await`/`catch` inside. A synchronous throw from an
    injected port therefore becomes a caught rejection, and the rest of `onRevocationReconcile` (the
    `onReconnect` registration) still runs.
  - **On failure**, it writes one WARN through the contained floor-WARN helper (FR-010), which is
    `REVOCATION_FLOOR_ANNOUNCE_FAILED` plus `renderError(error)`, and schedules a retry.
  - **The retry** re-sends the idempotent announce with capped backoff: 1 000 ms, doubling, capped
    at `reconcileIntervalMs`. The first step is **below 2 s**, and a witness pins it. It stops at
    whichever comes first:
    - the first successful announce;
    - the first completed reap (`#lastReadAt` set), which has written the entry itself;
    - `#closing`.
  - **The retry timer** is one private field (`#announceRetry`), `Deno.unrefTimer`'d. `close()`
    clears it beside the other timers. Every re-arm asks `#closing` (the #355 gate).
  - No rejection escapes.
- **FR-006**: The first announce and the deadline arm share **one gate**, the existing
  `if (first && !this.#closing)` line. That line and the arm line stay byte-identical, because #362
  N17 and N32 anchor both. A registration after `close()`, and any re-registration, announce
  nothing.
- **FR-007**: Nothing else writes the floor. There is no write in the mark, in `close()`, in the
  heartbeat or in the ghost sweep.

**Reading the floor**

- **FR-008** (S3): `markRevocation` (`:3017-3028`) becomes two round trips on its one command
  port:
  1. `ZRANGEBYSCORE <floor> -inf +inf`, no options, decoded by `decodeRevocationFloor`;
  2. `EVAL MARK_REVOKED_SCRIPT 1 <index> <eff> <member> <eff + INDEX_TTL_SLACK_SECONDS>`.

  **A floor read that fails for any reason** makes the mark use `eff = MAX_REVOCATION_TTL_SECONDS`
  (fail closed): a rejected command (`WRONGTYPE`, a reply over `MAX_REPLY_BYTES` that resets the
  socket, a transport error), or a decoder refusal. **Only a failed `EVAL` fails the mark.**
  `MARK_REVOKED_SCRIPT`'s text and numkeys do not change. Its JSDoc (`:95-120`) gains one
  paragraph: `ARGV[1]` is the effective TTL.

  **Cost, stated.** A record marked while the floor is unreadable lives about **24.8 days**. That
  grows the index and lengthens passes and the enforcement bound (P grows with N). It stays bounded
  because marks are rare, and a channel-scoped record is cleared once its owner applies it.
- **FR-009**: **`decodeRevocationFloor(reply: unknown, ownTtl: number): { ttl: number; skipped:
  number }`** is a new exported pure function beside `decodeRevocationPage`. It is exported for
  tests only, and `mod.ts` does not re-export it. It is the single home of what a floor reply means:
  - a reply that is not an array of bulk strings **throws** `REVOCATION_FLOOR_REFUSED`, which never
    carries the reply. The mark catches it (FR-008);
  - a member that fails `EPOCH_SECONDS` is skipped and counted;
  - a member that passes is clamped to `[1, MAX_REVOCATION_TTL_SECONDS]`;
  - `ttl` is the maximum of `ownTtl` and every clamped member.

  It does not rename, copy or re-spell `EPOCH_SECONDS`.
- **FR-010** (S2): **Every floor WARN on the mark is written after the `EVAL`**, whether it is
  `REVOCATION_FLOOR_SKIPPED` plus the count, or `REVOCATION_FLOOR_READ_FAILED` plus the rendered
  error. It goes through **one contained helper**, `#warnFloor(line)`, in the #391 shape:
  `console.warn` inside a `try`, and on a throw, one `writeMarkedFallback(REVOCATION_FLOOR_LOG_FAILED,
  …)` line with both halves. The helper never throws. The announce's WARN (FR-005) uses the same
  helper. A WARN never changes the mark's outcome, and the first draft's "propagates" is rejected.
- **FR-011**: **`MAX_REVOCATION_TTL_SECONDS = Math.floor(MAX_TIMER_MS / 1000)`** is hoisted from
  the constructor's local (`:1943`) to a module constant directly below `MAX_TIMER_MS` (`:1536`).
  The constructor's range guard, `decodeRevocationFloor` and FR-008's fail-closed value all read
  it. The constructor's message and behaviour are unchanged.

**Unchanged**

- **FR-012**: No change to:
  - the record member format, the index key or `MARK_REVOKED_SCRIPT`'s text;
  - the reap's reply, `decodeReapReply`, `decodeRevocationPage` or `EPOCH_SECONDS`;
  - `REVOCATION_SCAN_COUNT`, the pass, the deadline, the boot checks, the control plane, the
    manager, the options shape or `mod.ts`.

  `lua_eval.ts` and `fake_redis.ts` do not change (D2).

**Tests**

- **FR-013**: Witnesses F1–F15 go in a new `packages/realtime/tests/revocation_ttl_floor_380.test.ts`
  (§4). Names start `#380 F<n> ` with a trailing space. They are committed **red on `main` first**,
  except the pins F2 and F10. They use FakeRedis `setTime` for the broker clock and FakeTime for
  timers. The WARN witnesses spy `console.warn`/`console.error` and count lines by the FR-005 and
  FR-010 constants. The escape witnesses use the #395 escape watcher.
- **FR-014** (A2): The reap and the announce each get **one test-side home**: a new
  `packages/realtime/tests/revocation_wire.ts`, which exports:
  - `isReap(args, index)`: numkeys `'2'`, the index at `args[3]`, the floor at `args[4]`,
    length 7;
  - `isAnnounce(args, floor)`: numkeys `'1'`, the floor at `args[3]`, length 6.

  Neither matches the other, nor the mark's `EVAL` (numkeys `'1'`, the **index** at `args[3]`).
  The three local `isReap` definitions (D5) are **replaced by imports**; no assertion that uses
  them changes.
- **FR-015**: **`prefix_anchoring.test.ts`**:
  - its canned `EVAL` table (`:224-235`) routes by numkeys and key position, never by script text:
    the two-key reap gets a bulk `t`, a one-key `EVAL` on the floor key (the announce) gets `nil`,
    and a one-key `EVAL` on the index key (the mark) keeps today's reply. A new `ZRANGEBYSCORE` arm
    answers an empty array;
  - `PREFIX_MEMBERS` gains `revocationFloorKey`;
  - the SC-001 derived-name set gains `'alpha__revocation-floor'`;
  - FR-006's `shapes` gains `revocationFloorKey: 'alpha__revocation-floor'`.

  `live_realtime.ts` `keys()` gains `revocationFloor`. The `recording_ports.ts` header comment
  (`:15-19`, "ten names") is corrected.
- **FR-016** (A3): `escaping_sinks_395.test.ts`'s `SINKS` table gains the announce's `.catch` as a
  row. The sink count is removed from `marked_fallback.ts:5` and `packages/realtime/AGENTS.md:960`,
  and `marked_fallback_sinks_391.test.ts` is not edited.
- **FR-017**: The mutation battery `packages/realtime/tests/mutations/revocation_ttl_floor_380.ts`
  holds rows N1–N28 (§4). SUITES is the FR-013 file, plus `prefix_anchoring.test.ts` for N19. Each
  row is **proven live**: it ran, and it turned its named witness red.
- **FR-018**: **Two live-parity rows** in `live_fake_conformance.test.ts`, `ignore: !LIVE_BROKER`:
  - **WC a:** after one reap on a live broker and on the fake, the floor reads back the same members
    and scores (read raw by the test with `WITHSCORES`) and the same key TTL band;
  - **WC b:** the same for the announce.

  **`tasks.md` records whether the live run happened.**
- **FR-019**: **Battery repair** (§4). #359's `REAP` anchor (`revocation_paging_359.ts:80-87`) and
  M7's replacement text (`:244-249`) move to the two-key call form. The two rows are
  **re-anchored, never deleted**, and re-proven live. Then `deno task mutate realtime` runs. Any
  other `DEAD MUTANT` is repaired under "the source moved, the guard remains" (`docs/testing.md`),
  never deleted.

**Docs**

- **FR-020**:
  - **`docs/realtime.md`**:
    - **The revocation-timing paragraph** (`:1617-1636`) gains the **one operator statement** of
      the floor. A record lives at least the writer's `revocationTtlSeconds`, and up to the longest
      TTL among the instances that have reaped within their own TTL. One instance can therefore no
      longer shorten records on its own. When the floor cannot be read, a record is kept for the
      maximum TTL. Everything else links here.
    - **`:1791`** ("self-expires after `revocationTtlSeconds`") links the timing paragraph.
    - **The bound paragraph** (`:1978-1984`) loses "assumed **uniform across the fleet**". It now
      says the fleet's longest live TTL is **enforced** by the floor (ADR 013), and it keeps the
      mixed-release caveat.
    - **Item 22** of *Upgrading to v0.4.0* (D8):
      - before and after;
      - the new key, with its own TTL;
      - one more read per mark;
      - the new WARNs;
      - the fail-closed read and its cost;
      - protection only once every instance runs this release;
      - no wire change and no migration step. Observable, not breaking.
    - The intro gets the new count, and "one new Redis key family" becomes "two new Redis keys".
      Item 3 gains one line linking item 22.
  - **`packages/realtime/README.md`**: the #362 bullet gains one clause linking the timing
    paragraph.
  - **`packages/realtime/AGENTS.md`**:
    - the **bounded-read inventory** (`:614-622`, S4) gains: *revocation floor → unbounded, small
      by construction (one member per distinct live TTL); `MAX_REPLY_BYTES` is the backstop; an
      oversized reply is a read failure → MAX TTL*;
    - a pitfall: *never decode the floor in Lua, never let a floor entry or an unreadable floor fail
      a mark, never write the floor outside `FLOOR_WRITE`, never announce outside the
      first-registration gate, and never put the index key on the announce*, pointing at ADR 013;
    - the `:960` sink count dropped (A3);
    - the *Tests* list, regenerated by `deno task agents:brief`.
  - **ADR 013** (the number is assigned at landing, D7),
    `docs/adr/013-realtime-revocation-ttl-floor.md`, records:
    - the question;
    - the floor key, its write, its read, its lifetime, the announce and its retry, and the
      fail-closed read;
    - **the D2 ruling in full**, including the bounded TOCTOU;
    - the rejected options with their costs:
      - fleet keys;
      - a per-record TTL field (fails open, `redis.ts:3133`);
      - write-time scoring;
      - a writer TTL in a reply or in metadata;
      - an operator check (ADR 011 §3);
      - the four D2 rejections;
      - a `LIMIT` on the floor read, since truncation fails open (S4);
      - an announce that is only reported, not retried, and admission that waits on the announce
        (S1);
    - the residue (§9).

    **ADR 011**: §5 gains `> **Amended by [ADR 013](…)**`, and the `**Status:**` line gains
    "amended by ADR 013". Its body is not rewritten.
  - **JSDoc**:
    - the `revocationTtlSeconds` option (`:803-809`): **at least** this long;
    - `MARK_REVOKED_SCRIPT` and `REAP_REVOKED_SCRIPT`;
    - `FLOOR_WRITE` (with its two callers), `ANNOUNCE_FLOOR_SCRIPT` and `revocationFloorKey`;
    - `markRevocation`: two round trips, the fail-closed read, and `@throws` only for the `EVAL`;
    - `decodeRevocationFloor`, `MAX_REVOCATION_TTL_SECONDS` and the five new constants;
    - `onRevocationReconcile` and `#announceFloor`: the announce and its retry;
    - `enforcement_deadline.ts:14`: "at least".

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
- **SC-004** (S3): Nothing in or about the floor, whether malformed or unreadable, stops a
  revocation from being recorded. When the floor cannot be read, the record is kept for the maximum
  lifetime rather than a shorter one. The operator sees one warning per affected revocation, and a
  warning never echoes floor content.
- **SC-005**: No floor-write or floor-warning failure escapes as an uncaught error. It is reported
  on one line.
- **SC-006**: During a rolling upgrade, no record lives shorter than it does today.
- **SC-007** (S1): A reader whose first announce fails is covered within seconds, not after its
  first pass.

**Witnesses** (FR-013), in `tests/revocation_ttl_floor_380.test.ts`. "Red" means the witness fails
on `main` at `32baca7b`. All share one FakeRedis unless stated.

| # | Setup → assertion |
| :--- | :--- |
| F1 (red, **the item's witness**) | W: raw driver, interval 5 000, TTL 10. R: raw driver, interval 60 000, TTL 300, handler `R.onRevocationReconcile(() => …R.listRevocations(owns c1))` capturing results. R registers, and one R reap runs. W marks `{ target: 'c1' }`, and **no control frame is sent**. The broker clock (`setTime`) and FakeTime advance 59 s, and R's next pass runs → **R's pass returns `c1`**. Today it returns nothing |
| F2 (pin) | A uniform fleet: two drivers at TTL 300, each reaped once → a mark scores `t + 300` exactly, and the index key's TTL is in `[300, 360]`. Green before and after |
| F3 (red) | After one reap by a TTL-300 driver, the floor holds exactly `{ '300': t + 300 }` and its key TTL is 360 (read raw) |
| F4 (red) | (i) The first `onRevocationReconcile` issues exactly one `isAnnounce` command, operands `1 <floor> 300 360`, **before** any reap. (ii) Re-registration issues none. (iii) A registration after `close()` issues none. (iv) `new ChannelManager` over the driver issues exactly one. (v) (A2) The announce is matched by `isAnnounce` and **not** by `isReap`: `issued(isReap)` is 0 until the first pass, then 1 |
| F5 (red) | (i) The announce rejects → exactly one `REVOCATION_FLOOR_ANNOUNCE_FAILED` WARN, and no escaped rejection. (ii) The same with `console.warn` throwing → exactly one marked `REVOCATION_FLOOR_LOG_FAILED` line carrying both halves. (iii) After (i), the first completed reap writes the entry and stops the retry. (iv) (S5) An injected `RedisCommandClient` whose `command()` **throws synchronously** → `onRevocationReconcile` returns normally, `onReconnect` is still registered, and one WARN is written with no escape |
| F6 (red) | The floor seeded raw with `300`, `1e3`, `0x10`, ` 5`, `5.5`, `inf`, `''` and `012`. A TTL-10 driver marks → the record scores `t + 300`, and exactly one `REVOCATION_FLOOR_SKIPPED 7` WARN, written **after** the `EVAL` is issued, with no member text |
| F7 (red) | The floor seeded raw with `9999999` → the record scores `t + 2147483`, and the index key TTL is `2147483 + 60` |
| F8 (red) | R (TTL 300) reaps once and then stops. After 301 s, W (TTL 10) reaps → R's entry is gone, and the next W mark scores `t + 10` (US3) |
| F9 (red) | GT on both halves. (i) A TTL-300 reap at t, then a TTL-10 reap at t+5 → the `300` entry keeps `t + 300`, and the key TTL stays ≥ 355. (ii) A TTL-10 reap first, then a TTL-300 reap → the key TTL is extended to 360 |
| F10 (pin, mixed fleet) | An **old-release** writer and reap, driven with the mark and reap call forms and script texts **frozen as literals from `32baca7b`**. These are pins of the old release's behaviour, not oracles for the new code. The old writer at TTL 10, beside a new TTL-300 reader → that record scores `t + 10`, as today. The old reap at t+5 deletes nothing live and leaves the floor untouched. Green before and after |
| F11 (red) | An absent or empty floor → the record scores `t + ownTtl`, and the mark is exactly two commands: one `ZRANGEBYSCORE` of the floor, then the `EVAL`. Today it is one command |
| F12 (red) | `decodeRevocationFloor` as a unit: a non-array, an array holding an integer, and a nil → each throws `REVOCATION_FLOOR_REFUSED`, with no reply text. `[]` gives the own TTL. Grammar and clamp as in F6 and F7 |
| F13 (red, S1) | (i) The announce rejects **once**. A TTL-10 mark at **+2 s** scores `t + 300`, because the retry landed. The first backoff step is asserted below 2 s. (ii) The announce rejects on every attempt, then `close()` → no announce is issued after `close()`, and no timer is left pending |
| F14 (red, S3) | The floor read fails: (i) the floor key is seeded as a **string** (`WRONGTYPE`); (ii) the port rejects the `ZRANGEBYSCORE` (a transport error). In each case → the mark **resolves**, the record scores `t + 2147483`, and exactly one `REVOCATION_FLOOR_READ_FAILED` WARN is written after the `EVAL`. (iii) The `EVAL` itself rejects → the mark rejects, as today |
| F15 (red, S2) | `console.warn` throws while F6's and F14's WARNs are written → the mark still resolves, the record is written, and exactly one marked `REVOCATION_FLOOR_LOG_FAILED` line appears |
| — | Every existing realtime test stays green after the FR-014, FR-015 and FR-016 edits, and no assertion is weakened |

**Mutants** (FR-017), battery `tests/mutations/revocation_ttl_floor_380.ts`, each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| N1 | the mark ignores the floor: `eff = ownTtl` | F1 |
| N2 | `Math.min` instead of `Math.max` in the decoder | F1 |
| N3 | the index EXPIRE keeps `ownTtl + slack` | F7 |
| N4 | the decoder accepts by `Number.isFinite(Number(m))` instead of `EPOCH_SECONDS` | F6 (`1e3` counted) |
| N5 | the clamp's upper bound dropped | F7 |
| N6 | the skip count dropped from the WARN, or the WARN dropped | F6 |
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
| N17 | the announce's `catch` removed | F5 (i) (escaped) |
| N18 | the floor-WARN helper's `try` / marked fallback removed | F5 (ii), F15 |
| N19 | `revocationFloorKey` built without `RESERVED_SEPARATOR_LEAD` | `prefix_anchoring` FR-004 source and SC-001 |
| N20 | the reap passes `keyTtl = ownTtl` (slack dropped) | F3 (key TTL 300) |
| N21 (A2) | the announce sent in the reap's two-key form (`2 <index> <floor> …`) | F4 (v) |
| N22 (S1) | the announce retry removed | F13 (i) |
| N23 (S1) | `close()` does not clear the retry timer / the retry ignores `#closing` | F13 (ii) |
| N24 (S1) | the first backoff step raised to 5 000 ms | F13 (i) (the step assertion) |
| N25 (S3) | a failed floor read fails the mark (re-thrown) | F14 (i), (ii) |
| N26 (S3) | a failed floor read falls back to the own TTL | F14 (i), (ii) |
| N27 (S2) | the floor WARN written **before** the `EVAL` | F6 (order) |
| N28 (S5) | `#announceFloor` made synchronous (`command()` called outside the `try`) | F5 (iv) |

**Blast radius, counted on `main` at `32baca7b`** (a read of the tests, cross-checked by `git grep`;
nothing was run):

- **Production files**:
  - `packages/realtime/drivers/redis.ts`;
  - one JSDoc line in `drivers/enforcement_deadline.ts`;
  - the count removed from `marked_fallback.ts:5`.

  `manager.ts` is **not** edited: its constructor already registers (`:1212`).
- **Suites edited: 8.**
  - The three `isReap` owners move to the FR-014 helper: `revocation_paging_359`,
    `pass_sample_360` and `revocation_pass_bound_362`. About 52 dependent lines: 30 in #359
    (11 tests), 3 in #360 (3 tests, plus P13 transitively) and 19 in #362 (12 tests). **Only the
    predicate's definition moves.** Because the announce is one-key (A2), `issued(isReap) === 1`
    (`revocation_pass_bound_362.test.ts:348`), #359's `reaps()` and every `failFrom`/`hold(isReap)`
    keep their meaning.
  - `prefix_anchoring` (FR-015): the canned table, the roster, the set and `shapes`. Six tests fail
    through `exercise()` until the table is fixed.
  - `escaping_sinks_395` (FR-016): one `SINKS` row.
  - `live_fake_conformance` (FR-018).
  - `revocation_atomicity.test.ts:96-103`, which asserts that the mark is exactly **one** `EVAL` on
    a bare driver. FR-008 makes it one `ZRANGEBYSCORE` of the floor, then one `EVAL`, and the
    assertion is changed to say so. It is changed, not weakened.
  - `live_realtime.ts` `keys()`, a name table with no completeness assertion.
- **Suites that stay green by construction**:
  - `escaping_sinks_395.test.ts:142` and `lapse_rehold_349.test.ts:202` pick out the reap by the
    **index** key. The announce carries no index key (FR-004), so neither can match it,
    **whatever the construction order**. That was the A2 finding.
  - `revocation_atomicity.test.ts:221-224` (HIGH-2) rejects every `EVAL` from construction. The
    announce is caught and retried (FR-005). Its WARN assertions use `some()`, and its timers are
    unref'd and cleared by `close()`.
  - `revocation_retry.test.ts:20` answers every command `null`. The announce ignores its reply, and
    the mark decodes `null` as a refusal, so it marks at MAX (FR-008). **Re-verified by running**;
    `tasks.md` records the result.
  - Eleven key-filtered or script-filtered `EVAL` predicates (roster, presence, sweep) do not match
    the announce's keys or verbs.
- **Existing battery rows**:
  - **Re-anchored (2), never deleted:** `revocation_paging_359` M1 and M7, through `REAP`
    (`:80-87`) and M7's replacement (`:244-249`).
  - **Held byte-identical by FR-006 (2):** `revocation_pass_bound_362` N17 and N32.
  - **Unaffected (2):** `live_conformance_285`'s Lua and fake rows. The mark script is unchanged.
  - **Indirect:** every row of the #359, #360 and #362 batteries whose witness goes red until
    FR-014 lands. They are re-run, not edited.
  - `prefix_288` anchors `instancesKey`. The FR-001 getter goes below `revocationIndexKey`'s
    closing brace, and `deno task mutate realtime` confirms that no anchor split.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| 1. A record lives at least `max(writer's TTL, every live floor member)` — the fleet floor (disposition 2026-09-25) | `markRevocation`'s `eff`, computed by `decodeRevocationFloor`, `packages/realtime/drivers/redis.ts` | a max computed in Lua; a second max in the reap; the floor applied in the manager; a per-record TTL field |
| 2. What a floor reply means: an array of bulk strings, else refused; a member in the `EPOCH_SECONDS` grammar, else skipped and counted; clamped to the TTL range | `decodeRevocationFloor`, `packages/realtime/drivers/redis.ts` (D2) | a Lua `tonumber` / pattern; a second seconds regex; a `Number(...)` decode in `markRevocation`; a throw on a bad member |
| 3. The TTL range's ceiling, `⌊MAX_TIMER_MS / 1000⌋` | `MAX_REVOCATION_TTL_SECONDS`, `packages/realtime/drivers/redis.ts` (hoisted from `:1943`) | the constructor's local kept alongside; a literal `2147483` in the decoder, the fail-closed path or a test oracle |
| 4. The floor's name | `revocationFloorKey`, `packages/realtime/drivers/redis.ts` | the string built inline at a call site; a test fixture used as an oracle rather than a pin |
| 5. How the floor is written: `ZADD GT t+ttl ttl`, prune `≤ t`, `EXPIRE NX` then `GT` at `keyTtl`, over bound locals | `FLOOR_WRITE`, `packages/realtime/drivers/redis.ts` | the four lines spelled out again in a script; `KEYS[n]`/`ARGV[n]` inside the fragment; a `ZADD` without `GT`; an `EXPIRE` with `GT` alone |
| 6. When the floor is written: every reap, and the first registration's announce (and its retry); never elsewhere (A4) | **`FLOOR_WRITE`'s JSDoc**, naming its only two callers, `REAP_REVOKED_SCRIPT` and `ANNOUNCE_FLOOR_SCRIPT`, `packages/realtime/drivers/redis.ts` | a write in the mark, the heartbeat, `close()` or the sweep; running the reap at registration; a third script splicing the fragment |
| 7. The first announce and the deadline arm share one gate: first registration, and `close()` not begun | the `if (first && !this.#closing)` line, `onRevocationReconcile`, `packages/realtime/drivers/redis.ts` | a second `first` flag; a separate `#closing` check around the first announce |
| 8. The announce is `async`, never throws into its caller, and is retried with capped backoff (first step < 2 s) until an announce succeeds, a reap completes, or `close()` begins (S1, S5) | `#announceFloor`, `packages/realtime/drivers/redis.ts` (the retry re-arm asks `#closing`, the #355 gate) | an awaited announce; a synchronous `command()` outside the `try`; admission waiting on the announce; an unbounded retry; a retry that survives `close()` |
| 9. The reap and the announce are distinct on the wire: 2 keys (index, floor) vs 1 key (floor only) (A2) | the two call sites, `listRevocations` and `#announceFloor`, `packages/realtime/drivers/redis.ts`; as a test asks it, `isReap` / `isAnnounce` in `packages/realtime/tests/revocation_wire.ts` | the index key on the announce; matching by script text; three local `isReap` copies; a predicate matching any `EVAL` |
| 10. A floor that cannot be read makes the mark fail **closed** at `MAX_REVOCATION_TTL_SECONDS`; only a failed `EVAL` fails the mark (S3) | the floor-read `try` in `markRevocation`, `packages/realtime/drivers/redis.ts` | a re-throw of the read; a fallback to the own TTL; a retry of the read; a `LIMIT` on the read (truncation fails open) |
| 11. Every floor WARN is written after the `EVAL`, through one contained helper in the #391 shape (S2) | `#warnFloor`, `packages/realtime/drivers/redis.ts`; the fallback format lives in `marked_fallback.ts` | a bare `console.warn` on the mark path; a WARN before the `EVAL`; a WARN that propagates; a second fallback format |
| 12. The WARN and refusal texts: `REVOCATION_FLOOR_ANNOUNCE_FAILED`, `_SKIPPED`, `_READ_FAILED`, `_LOG_FAILED`, `REVOCATION_FLOOR_REFUSED` | five exported constants, `packages/realtime/drivers/redis.ts` (tests only, not `mod.ts`) | text inlined at a call site or copied into a test |
| 13. The mark script, the record format, the reap reply and every reply decoder are unchanged | `MARK_REVOKED_SCRIPT`, `decodeReapReply`, `decodeRevocationPage`, `packages/realtime/drivers/redis.ts` | a new ARGV or KEY on the mark script; a reply that carries the floor |
| 14. Every reply that grows with a collection has a named bound; the floor's is "small by construction, `MAX_REPLY_BYTES` backstop, oversized → MAX TTL" (S4) | the bounded-read inventory, `packages/realtime/AGENTS.md:614-622` | the bound restated in ADR 013 or JSDoc instead of linked; a `LIMIT` added "for safety" |
| 15. The operator statement of what a TTL now means for a record's life | the revocation-timing paragraph, `docs/realtime.md` (`#revocation-timing`) | a second statement in item 22, the bound paragraph, README or `AGENTS.md` (they link); the old "assumed uniform" sentence kept |
| 16. The fleet TTL is **enforced**, not assumed | ADR 013, `docs/adr/013-realtime-revocation-ttl-floor.md` (it amends ADR 011 §5 and Status) | ADR 011 §5 rewritten in place; #362's plan row 15 edited (a historical record) |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary dependencies**: `@lockness/realtime` only,
with no new edge (`renderError` and `writeMarkedFallback` are already imported) · **Storage**: one
new Redis sorted set per prefix, holding one member per distinct TTL, with its own TTL ·
**Testing**: `deno test`; FakeRedis with `setTime`; FakeTime; the #395 escape watcher; the shared
mutation harness; two live-only rows · **Target**: server library · **Project type**: framework
package · **Performance**:
- no new round trip per pass, since the floor write rides on the reap;
- one more round trip per `markRevocation`, a rare path;
- one round trip per driver at registration, plus bounded retries only on failure;
- the floor reply grows with the number of distinct TTLs.

· **Constraints**:
- Redis 7.0+ (already required);
- no wire, control-frame, manager, option-shape or `mod.ts` change;
- no change to the FakeRedis Lua subset;
- no reply shape change.

· **Scale**: as many floor members as there are distinct TTL values in the fleet.

### Domain model

- **Bounded context**: realtime (the Redis driver's durable-revocation record).
- **Vocabulary**:
  - *revocation record*: an index member, scored by its expiry;
  - **revocation floor**: the fleet-wide set of live readers' TTLs;
  - **floor entry**: one TTL value, scored by the broker second it lapses, and refreshed by any
    reap or announce at that TTL;
  - **effective TTL** (`eff`): `max(own, live floor members)`, or the maximum TTL when the floor
    cannot be read;
  - **announce**: the first registration's floor write, retried until it lands or a reap does;
  - *reap*: the pass's one script, now also refreshing the floor.
- **Entities**: `RedisBroadcastDriver`, the aggregate root. It owns the key names, the scripts, the
  announce and its retry timer, and the mark. No new class.
- **Value objects**:
  - the effective TTL;
  - the decoded floor, `{ ttl, skipped }`;
  - a floor entry `(ttl, lapsesAt)`, **conceptual**: no class exists.
- **Invariants**:
  - **a record written by this release lives at least as long as every floor entry that is live
    when its mark reads the floor, and at the maximum TTL when the floor cannot be read;**
  - a floor entry lives at least one TTL past its reader's last successful reap or announce;
  - no floor content or floor failure can shorten a record below its writer's own TTL, or fail a
    mark;
  - the floor is written only through `FLOOR_WRITE`, and only by a reap or an announce;
  - the announce never carries the index key;
  - no announce or floor-WARN failure escapes;
  - no timer is armed once `close()` has begun;
  - no record is scored above `t + MAX_REVOCATION_TTL_SECONDS`.
- **Out of scope**:
  - the per-instance bound and the pass deadline (#362);
  - retention through a long failure run;
  - changing any default;
  - third-party `BroadcastDriver`s.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | `decodeRevocationFloor(reply: unknown, …)` returns a typed record; the constants are strings; nothing is added to `mod.ts` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | per task, plus `deno task mutate realtime` and `deno task deps:analyze` |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-020 lists every block |
| MVC layering | pass | not applicable (driver) |
| Commit discipline | pass | test (red witnesses, `revocation_wire.ts`) / fix (`redis.ts`, the suite repairs it forces) / test (the battery, re-anchors, WC rows) / docs (ADR 013, the ADR 011 callout and Status, `realtime.md`, README, `AGENTS.md`) |
| No environment detail in versioned files | pass | none; the live rows are named by flag only |
| Design decisions go to architect-expert | pass | the disposition and every audit ruling are binding (§10, §11) |
| Product decisions go to the user | pass | none open (§12) |
| Act, don't recommend | pass | every audit finding was ruled on and folded |
| TDD, red first | pass | F1, F3–F9 and F11–F15 are red on `main`; F2 and F10 are pins |
| No silent catches | pass | the announce's `catch` and `#warnFloor` each write a WARN or a marked line (FR-005, FR-010) |
| Domain Model gate | pass | §6 |
| Fail closed on broker-sourced input | pass | a malformed floor is skipped, and an unreadable one gives the max TTL; neither can shorten a record (FR-008, FR-009) |
| #276 extend-only writes | pass | `ZADD GT`; `EXPIRE NX` then `GT` on the floor key (D3) |
| #288 reserved separator | pass | FR-001; N19 |
| #355 one timer gate | pass | the announce retry asks `#closing`; `close()` clears it (FR-005) |

### Complexity tracking

No violation. What is added:

- one broker key;
- one Lua fragment over bound locals, one new script, and three lines spliced into the reap;
- one pure decoder and five constants;
- one hoisted constant;
- two private methods (`#announceFloor`, `#warnFloor`), one retry-timer field and one getter;
- one test helper;
- one ADR.

`redis.ts` stays the package's largest file (4 287 lines). The floor is one more fact about the
revocation record, which this file owns, so nothing is extracted.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | no | no new export from `mod.ts`, no option change, no new constructor throw |
| Behaviour of `revocationTtlSeconds` | yes, **observable** | a record lives at least this long, up to the longest live reader's TTL, and at the maximum TTL when the floor is unreadable (item 22) |
| Broker keyspace | yes | `<prefix>__revocation-floor`, a sorted set with its own TTL |
| Wire (`EVAL` operands) | yes, internal | the reap takes 2 keys and 2 args; a new 1-key announce script; the mark is preceded by one `ZRANGEBYSCORE` |
| Logs | yes | three new WARNs (announce failed; floor members skipped; floor unreadable) and one marked fallback |
| `markRevocation` latency | yes | two round trips instead of one |
| Control plane, manager, `mod.ts`, record format | no | — |
| Tests | yes | a new witness file, battery and helper; 8 suites edited (§4); 2 battery rows re-anchored; 2 live rows |
| Docs | yes | the timing paragraph, `:1791`, the bound paragraph, item 22, the intro and item 3, README, `AGENTS.md` (the bounded-read row, the pitfall, the sink count), ADR 013, ADR 011's callout and Status, JSDoc |

### Documentation (this feature)

```text
.specnaut/specs/271-revocation-ttl-floor/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A suite confuses the announce with the reap | Removed by construction: the announce is one-key and carries no index key (A2, FR-004). FR-014 homes both shapes; F4 (v) and N21 pin it |
| A battery row goes DEAD | §4 lists the 2 re-anchors and the 2 held rows; FR-006 keeps the gate lines byte-identical; `deno task mutate realtime` is in the gate |
| The live broker and the fake disagree on a new script | the FR-018 WC rows; `tasks.md` records whether the live run happened |
| **Cost of the fail-closed read (S3).** A record marked while the floor is unreadable lives about 24.8 days: a larger index, longer passes, a longer enforcement bound | Accepted (ruling). Bounded because marks are rare and channel records are cleared once applied. Each such mark writes one WARN |
| **Residue: a wrong-typed floor key fails every reap**, not only the mark's read | Accepted. The same class as a wrong-typed index key; #362's deadline reports it |
| **Residue: the mixed-release gap.** Until every writer runs this release, an old writer's records live for its own TTL | Accepted (disposition). Item 22 states it. Nothing is worse than today (F10) |
| **Residue: the first-write race.** A mark in the round trip before a new reader's announce lands, or during its retry after a failure, uses the old floor | Narrowed by the retry (S1, first step < 2 s). Making admission wait on the announce was rejected: it changes `onRevocationReconcile`'s signature for third-party drivers |
| **Residue: the read-to-write race** (D2) | Bounded: once per new maximum TTL, at join |
| **Residue: a floor lost after a successful announce** (failover; `volatile-*` eviction, `docs/realtime.md:1640-1644`) leaves up to one interval of short records | Accepted. The index key has the same exposure; the next reap rewrites the entry |
| **Residue: records outlive their writer's TTL**, which costs index size | Accepted. It is paid in pages (ADR 009). The docs say one instance can no longer shorten the fleet's records |
| **Residue: a stalled reader drops out of the floor** | Reported by its #362 deadline, not prevented (ADR 011) |
| **Residue: retention through a long failure run** | Out of scope (#380), unchanged |
| **Residue: third-party drivers** get no floor | The floor is a Redis-driver fact; the port is unchanged |
| **Residue: broker-clock precision** | Accepted, as in ADR 011 |
| **Residue: floor size.** Anyone with bus access can fill it | `MAX_REPLY_BYTES` backstop → read failure → MAX TTL (S4). The same actor can already `DEL` the index |
| The ADR or item number collides with another landing | Assigned at landing (D7, D8) |

## 10. Architecture audit

*`architect-expert`, against this document before any code. Its rulings are **binding** (hard rule
#11), folded 2026-09-25.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | D2 cited an `architect-expert` ruling that the #380 thread does not hold; its rationale called the evaluator's refusals "by design", which `lua_eval.ts:108-111` contradicts | **Re-ruled, shape kept**: the TS read and the unchanged `MARK_REVOKED_SCRIPT`. Rationale corrected, TOCTOU bounded (once per new maximum TTL, at join), rejections recorded (`lua_eval` cannot spell `EPOCH_SECONDS`; the loop-free max breaks US3/SC-003 or fails open on `5.5`; `WATCH`/`MULTI` aborts, needs affinity and a new FakeRedis family). Recorded in D2 and in ADR 013 (FR-020). The coordinator posts it on #380 |
| A2 | **HIGH.** The announce and the reap were identical on the wire (`2 <index> <floor> <ttl> <ttl+60>`), so `isReap` matched both. That broke `issued(isReap) === 1` (`revocation_pass_bound_362.test.ts:348`), #359's `reaps()`, and `failFrom`/`hold(isReap)`. The index-key predicates survived only by construction order | Plan changed. `FLOOR_WRITE` runs over bound locals, each script binds its own `KEYS`/`ARGV`, and the announce is `EVAL <s> 1 <floor> <ttl> <ttl+60>` (FR-002–FR-004). `isAnnounce` matches numkeys `'1'` with the floor at `args[3]` (FR-014, row 9). Witness F4 (v); mutant N21. Rejected: matching by script text (`prefix_anchoring.test.ts:215-218`) |
| A3 | **MEDIUM.** D6's "seven → eight sinks" was wrong: `main` has 11 `writeMarkedFallback` call sites | Plan changed. The count is dropped from `marked_fallback.ts:5` and `AGENTS.md:960`; the announce's `.catch` row goes into `escaping_sinks_395.test.ts`'s `SINKS` (FR-016, D6) |
| A4 | **LOW.** Row 6's "only two callers" had no single home | Plan changed. `FLOOR_WRITE`'s JSDoc names them (FR-002, row 6) |
| A5 | **LOW.** ADR 011's `**Status:**` line should show the amendment | Plan changed (D7, FR-020) |
| A6 | **LOW.** F10 could read as an oracle of the new code | Plan changed. F10 drives the old mark and reap as frozen literals from `32baca7b`, stated as pins of the old release |
| — | D1, D3, D4's counts, D5, D8 | **Upheld.** The mixed fleet never fails open |

**Verdict** (as relayed): the design is confirmed, with A1–A6 and the security rulings folded.
**Coverage** (as relayed): this plan in full, including D1–D8, the decision table, the witnesses,
the mutants and the blast radius. The per-file list was not itemised in the relay.

## 11. Security audit

*`security-expert`, in parallel with the architecture audit. Each finding was ruled on by the
`architect-expert`; the rulings are binding.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | A failed first announce leaves a reader that may already hold sockets outside the floor until its first reap, a full interval later. "Holds no sockets yet" was false | **Retry.** `#announceFloor` retries the idempotent announce with capped backoff (first step < 2 s) until an announce succeeds, a reap completes (`#lastReadAt`) or `#closing`; `close()` clears the timer (FR-005, row 8). Witness F13; mutants N22–N24. Edge cases and §9 corrected. Residue: a floor lost after a successful announce (failover, `volatile-*` eviction) leaves up to one interval of short records, the same exposure as the index. Rejected: "reported, not prevented"; making admission wait for the announce (changes `onRevocationReconcile`'s signature for third-party drivers) |
| S2 | The skipped-member WARN before the `EVAL`, with "propagates" on a throwing sink, let a log failure cancel a revocation's durability | **Contained, after the `EVAL`.** Every floor WARN goes through one helper, `#warnFloor`, in the #391 shape, after the `EVAL` (FR-010, row 11). Witnesses F6 (order) and F15; mutants N18 and N27. "Propagates" is rejected |
| S3 | A floor read that fails (`WRONGTYPE`, a reply over `MAX_REPLY_BYTES` that resets the socket, a transport error) failed the mark, so one bad key disabled every durable revocation | **Fail closed.** On any floor-read failure the mark uses `MAX_REVOCATION_TTL_SECONDS` and writes one WARN; only a failed `EVAL` fails the mark. The decoder still throws, so N8 and F12 stand (FR-008, row 10). SC-004 restated. Cost stated: those records live about 24.8 days, bounded because marks are rare and channel records are cleared once applied. Witness F14; mutants N25 and N26. Residue: a wrong-typed floor key still fails every reap, like a wrong-typed index key, and #362's deadline reports it |
| S4 | The floor read is an unbounded reply with no entry in the bounded-read inventory | **Row added** to `packages/realtime/AGENTS.md:614-622`: small by construction, `MAX_REPLY_BYTES` backstop, oversized reply = read failure → MAX TTL (FR-020, row 14). Rejected: a `LIMIT`, because truncation fails open |
| S5 | A synchronous throw from an injected `RedisCommandClient` inside a non-async announce would escape `onRevocationReconcile` and skip the `onReconnect` registration | **`async` announce** with `try`/`await`/`catch` inside, called with `void` (FR-005, row 8). Witness F5 (iv); mutant N28 |

**Verdict** (as relayed): every finding was ruled on and folded above; no finding is left open.
**Coverage** (as relayed): the floor write, read and lifetime, the announce, log-sink failure,
the mixed fleet, reply size and broker-sourced input. The per-file list was not itemised in the
relay.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Approve the architecture as audited (tasks → implement → review)? | _Asked at stop 1._ | — |

No product question is open. A user sees two behaviour changes:

- a lower `revocationTtlSeconds` on one instance no longer shortens records while a longer-TTL
  reader is alive;
- a record marked while the floor is unreadable is kept for the maximum TTL.

Both are the prevention the disposition and the S3 ruling chose. They are recorded, not asked.

### Decided without asking

- The design is the #380 `architect-expert` disposition (2026-09-25), plus the audit rulings A1–A6
  and S1–S5 (2026-09-25). All are binding under hard rule #11.
- **D1:** the fail-open anchor is `redis.ts:3133`.
- **D3:** the floor key gets its own TTL, by the index's `NX`-then-`GT` discipline.
- **D4:** the floor is the tenth prefix-deriving member; the bounded-read list is
  `packages/realtime/AGENTS.md:614-622`.
- **D7:** a new ADR 013 amends ADR 011 §5 and its Status line. Numbers are assigned at landing.
- **D8:** item 22, unless another item lands first. It is observable, not breaking.
- The retry schedule is 1 000 ms, doubling, capped at `reconcileIntervalMs`. The ruling fixes only
  "capped, first step < 2 s"; the rest is an implementation choice the review may tighten.
- The announce sits inside the existing first-registration block, after the deadline arm, so #362's
  N17 and N32 keep their anchors.
- The skipped-member count is returned by the decoder and written by the mark, so the decoder stays
  pure, like `decodeRevocationPage`.
- #370 / #363 touch nothing under `drivers/` or `driver.ts`, so this work does not wait for them.
