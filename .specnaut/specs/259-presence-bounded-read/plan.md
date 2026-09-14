# Plan: Bound the roster read a presence subscribe ingests

**Branch**: `259-presence-bounded-read` | **Date**: 2026-09-14 | **Backlog item**:
[#341 — Realtime: every presence subscribe still reads and parses the whole room on the instance (R1e)](https://github.com/locknessland/lockness-monorepo/issues/341)

---

## 1. Why this exists

#339 capped what a presence subscribe **returns** at K members (default 100). It did not cap what the
instance **reads** to build that reply. On Redis, `listMembers` is one `HGETALL` of the whole
presence hash followed by one `JSON.parse` per entry, and every presence subscribe runs it —
re-joins included. #333's barrier limits how *often* the read runs, never its *size*.

So the bytes and CPU an instance spends per subscribe grow with the room. An authorizer that
returns `true` makes each socket its own member, so one account can grow a room and make every
subscribe to it more expensive for everyone (CWE-770). With #339's pinned member size (4 KiB
`info`), a 10 000-member room is ~40 MB ingested per subscribe to return 100 members.

Last open residue (R1e) of the #333 disposition; source S3 of the #339 plan security audit.

## 2. User scenarios

### US1 — A large room costs the same per subscribe as a small one (P1)

**Given** a Redis presence room of 10 000 members
**When** a client subscribes (first join or re-join)
**Then** the instance ingests at most K members plus the requesting self entries, the reply's
`total` is 10 000, and the joiner is in `members`.

### US2 — Concurrent subscribes still share one read (P1)

**Given** B and C subscribe to the same room while a read is in flight
**When** the shared read returns and neither is in the sampled window
**Then** each reply contains its own self and not the other's, and exactly two reads ran (the
in-flight one and one trailing read).

### US3 — Small rooms are unchanged (P2)

**Given** a room with ≤ K members
**When** a client subscribes
**Then** the reply lists the whole room, in the driver's order, exactly as today.

### US4 — A pre-0.4.0 custom driver fails loudly (P2)

**Given** a custom `BroadcastDriver` that still implements `listMembers`
**When** a `ChannelManager` is constructed over it
**Then** construction throws an error naming the migration to `readRoster`.

### Edge cases

- Self unsubscribes while the read is in flight → self is not kept (the roster no longer holds it).
- Self's roster entry was removed elsewhere (ghost sweep, #345) → self is not kept; `members.length ≤ total`.
- A reconnect storm of S **distinct members** → ⌈S / 1 000⌉ + 1 sequential reads, each bounded;
  N frames from one socket (or one account's tabs) share one id and cost 2 reads, as today.
- A read whose callers carry no self id (a superseded join) → still one valid read (A1).
- An unparseable stored entry → skipped; `members.length` may be below `min(K, total)`.
- Read failure → the local fallback, unchanged in shape (`source: 'local'`).
- Roster-less driver → the local window, unchanged.

## 3. Requirements

- **FR-001**: The driver seam's roster read takes a limit and a list of self ids and returns at most
  `limit` members, the roster's `total`, and the `PresenceMember`s among the self ids (never the
  stored `owner`) — all read at the same instant. Each shipped driver throws before any command
  unless `limit` is a positive integer and `selfIds.length ≤ MAX_ROSTER_READ_SELF_IDS` (S2, S4).
  A self is accepted only when the entry under its own field carries that same id (S3; amended
  2026-09-15 at review: set-based matching was tried and rejected, since it accepts an entry vouched
  for by another requested id's field).
- **FR-002**: No unbounded roster read remains on the driver seam or in any shipped driver. Search:
  `grep -n "listMembers\|HGETALL" packages/realtime/*.ts packages/realtime/drivers/*.ts` returns
  nothing except the legacy-driver guard's `listMembers` probe, and no code block in
  `docs/realtime.md` calls either (A4 — tests inspect the store with `HGETALL` legitimately).
- **FR-003**: A driver that still implements `listMembers` is refused at construction with an error
  naming the migration.
- **FR-004**: On Redis the read is one atomic command (one `EVAL`) per read; the command count per
  subscribe does not rise.
- **FR-005**: The #333 barrier keeps at most one read in flight per channel, and a shared read
  carries the self ids of every caller it serves, deduplicated by `String(id)`; the cap
  `MAX_ROSTER_READ_SELF_IDS` (1 000) counts distinct ids, a caller whose id is already pending joins
  that batch without counting, and a caller with no id contributes nothing (S1, A3).
- **FR-005a**: A read with zero self ids is valid on real Redis (A1).
- **FR-006**: A caller's self is kept in its reply iff the roster holds it at read time; it is looked
  up after the await.
- **FR-007**: `here.total` is the roster's population on every path.
- **FR-008**: The memory driver returns the first `limit` entries in join order, as today.
- **FR-009**: The driver-authoring contract and upgrade item 7 are documented in `docs/realtime.md`;
  every passage §8 lists as describing the unbounded read, `HGETALL` or hash-order is corrected; the
  existing Redis 7.0 statement is linked, not restated (A6).

## 4. Success criteria

- **SC-001**: Bytes ingested per presence subscribe are identical for rooms of 1 000 and 10 000
  members (pinned by a test at a fixed member size).
- **SC-002**: Rooms at or below K return the same members and order as before.
- **SC-003**: Every reply still contains the requesting member whenever the roster holds it.
- **SC-004**: Broker commands per subscribe are unchanged (`churn_cost_329` totals do not move).
- **SC-005**: A burst of concurrent subscribes never runs more than one read at a time per channel.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The roster read's contract (`RosterWindow`, `readRoster`, `MAX_ROSTER_READ_SELF_IDS`) | `packages/realtime/driver.ts` | a second read method (`listMembersBounded`, a kept `listMembers`); the cap as a literal in the barrier or a driver |
| Which members fill the window | each driver's `readRoster` (`drivers/redis.ts`, `drivers/memory.ts`) | a sort, shuffle or slice of `members` in the manager or `presence_snapshot.ts` |
| `total` is counted inside the same read | each driver's `readRoster` | `members.length`; a separate `HLEN`/`size` call in the manager |
| A driver is presence-capable iff it has `addMember` + `removeMember` + `readRoster` | `packages/realtime/manager.ts` `presenceRoster` | a second capability check at a call site (`if (driver.readRoster)`) |
| A driver still carrying `listMembers` is refused | `packages/realtime/manager.ts` `assertNotLegacyRosterDriver` (NEW, beside and separate from `assertNotLegacyRevocationDriver`) | a check inside a driver, the barrier, or `#closingRead` |
| Self ids batch per shared read, deduplicated by `String(id)`, cap counts distinct ids, FIFO overflow, one read in flight | `packages/realtime/roster_read_barrier.ts` | per-caller reads; a barrier keyed by (channel, self); cap enforced in the manager; counting frames instead of distinct ids |
| A driver refuses a non-positive/non-integer `limit` or more than `MAX_ROSTER_READ_SELF_IDS` ids before any command | each driver's `readRoster` (the manager's `assertCap` guards only its own call) | trusting the manager's validation alone |
| Self is kept iff in `members` or `selves`, looked up after the await; it replaces the last slot only when `members.length === limit`, else it is appended | `packages/realtime/presence_snapshot.ts` `boundPresenceSnapshot` | a local-map self lookup; appending self in the manager; a pre-await self id at the cut; always overwriting `members[limit-1]` |
| The self id to FETCH is taken in `#closingRead` before the barrier call; it only widens the read and never decides what is kept | `packages/realtime/manager.ts` `#closingRead` | the pre-await id passed to `boundPresenceSnapshot`; a second lookup inside the barrier or driver |
| Each caller gets its own `members` array (carried from #339 row 155) | `packages/realtime/manager.ts` `rosterSnapshot` | handing the shared window's array to two callers |
| `rosterSnapshot` returns a `RosterWindow` (authoritative or local) | `packages/realtime/manager.ts` `rosterSnapshot` | a second read path returning `PresenceMember[]` |
| A zero-self-id read is valid: the script pads self ids with `''`, which no member id can be (1–200 chars, #306) | `packages/realtime/drivers/redis.ts` read script | an `if` in Lua; a manager-side "no self, skip" branch; FakeRedis accepting `HMGET` with no field |
| The reply cap K | `packages/realtime/presence_snapshot.ts` (value from `MAX_PRESENCE_SNAPSHOT_MEMBERS` in `manager.ts`, unchanged) | a second slice in a driver; the driver trusted to honour K without the cut |
| The local path's window shape | `packages/realtime/presence_snapshot.ts` `localWindow` (NEW) | building `{members,total,selves}` inline at the fallback and roster-less sites |
| Redis read atomicity (`HLEN` + `HRANDFIELD … WITHVALUES` + `HMGET` in one `EVAL`; any small-room `HGETALL` branch also inside it) | `packages/realtime/drivers/redis.ts` (script constants; ids only via `ARGV`) | `HLEN` issued outside the script; a per-caller `HGET`; a two-command small-room fallback (S5) |

**Supersedes four #339 rows** (`.specnaut/specs/258-presence-roster-ceiling/plan.md`, a shipped
record, not rewritten): line 149 (the cut rule — the window's membership is now the driver's
choice, while the self rule and K stay in `presence_snapshot.ts`); line 152 (no self lookup before
the await / no self from the driver reply — the pre-await id now only widens the read, and self may
come from `selves`); line 154 (`total` from the read already made, no count on the seam — the count
now lives inside the one read); line 155 (per-caller
array — carried forward as its own row above).

## 6. Technical context

**Language/Version**: TypeScript on Deno 2
**Primary Dependencies**: `@lockness/realtime`, `@lockness/redis` (RESP client, `lua_eval.ts` test evaluator)
**Storage**: Redis ≥ 7.0 presence hash (`HRANDFIELD` needs 6.2; 7.0 is already required by `EXPIRE NX/GT`); in-process `Map` for the memory driver
**Testing**: `deno test`, `FakeRedis`, live Redis via `LOCKNESS_REDIS_INTEGRATION=1`, mutation batteries (`deno task mutate`)
**Target Platform**: server
**Project Type**: library
**Performance Goals**: per-subscribe ingest ≤ (K + selves) · (entry size), independent of room size
**Constraints**: no key, write script, control frame or MAC change (upgrade item 3 "no Redis migration" stays true); Lua `unpack` under 8 000 results (cap 1 000)
**Scale/Scope**: rooms of 10⁴+ members; reconnect bursts of 10³+

### Domain model

- **Bounded context**: realtime (presence)
- **Vocabulary**: Roster read — `BroadcastDriver.readRoster`; Roster window — `RosterWindow{members, total, selves}`; Self ids — member ids of the callers a shared read serves; Reply cap K — #339's bound; Closing read — `ChannelManager#closingRead`; Barrier — `RosterReadBarrier` (#333).
- **Entities**: `ChannelManager` [aggregate root]; `BroadcastDriver` (Redis, memory, third-party) owns the authoritative roster and its read.
- **Value objects**: `PresenceMember(id, info)`; `RosterWindow` — `members.length === min(limit, total)` modulo unreadable entries, one per `String(id)`; `PresenceSnapshot(members, total, source)`.
- **Out of scope**: reply cap K (#339); read frequency (#333); subscribe-frame rate policy (#329); local-view unit (#343); cross-instance slot ownership (#345); member-id type validation (#346).
- **Invariants**: ingest per read bounded by `(limit + MAX_ROSTER_READ_SELF_IDS)` entries; `total` and `members` read at one instant; at most one read in flight per channel; self kept only if the roster holds it; `members.length ≤ total`; the framework does not meter subscribe frames (#329).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1 No direct `hono` import | pass | untouched |
| 2 JSR-only deps | pass | no new dependency |
| 3 No `any` in exported APIs | pass | `RosterWindow` fully typed |
| 4 Tailwind syntax | pass | n/a |
| 5 Pre-completion gate | pass | full gate + live Redis tests + batteries |
| 6 `deno.lock` | pass | untouched |
| 7 JSDoc on public APIs | pass | `readRoster`, `RosterWindow`, cap constant documented with `@example` |
| 8 MVC layering | pass | n/a (library) |
| 9 Commit discipline | pass | squash by scope at merge |
| 10 Public repo | pass | no environment detail |
| 11 Design → architect-expert | pass | shape decided by its disposition (2026-09-14) |
| 12 Act, don't recommend | pass | — |
| TDD / witness red first | pass | byte-pin test written first |
| No silent catches | pass | unparseable entries: existing WARN path kept |
| DDD / Domain Model gate | pass | §6 |

### Complexity tracking

Breaking the driver seam (`listMembers` → `readRoster`) is justified: realtime 0.4.0 is unreleased
and already breaks this seam (upgrade item 2) under the "no third-party drivers before 1.0" policy
(`manager.ts`). Keeping `listMembers` as a fallback would keep the unbounded read public, which is
the defect.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `BroadcastDriver` / `PresenceCapableDriver` (exported) | yes | `listMembers` removed; `readRoster` + `RosterWindow` added — breaking; `MAX_ROSTER_READ_SELF_IDS` needs a VALUE export in `mod.ts` (driver.ts is re-exported as types only) |
| `SubscribeResult.here` (application-facing) | yes, Redis only | on rooms > K, a different random sample per subscribe (P1); `total` and self unchanged |
| Redis driver | yes | new read script; `listMembers` removed; keys and write scripts unchanged |
| Memory driver | yes | `readRoster`; same order as today |
| `RosterReadBarrier` (internal) | yes | self-id batches, FIFO overflow |
| `packages/redis/tests` (cross-package, own `test(redis)` commit) | yes | `lua_eval.ts`: widen `LuaValue` for nested tables and nil/false elements, `unpack(ARGV, n)` argument expansion, table-constructor `return`; its "Supported:" docstring, `lua_eval.test.ts` rows, `packages/redis/AGENTS.md` |
| Realtime test infrastructure | yes | `FakeRedis` `HLEN`, `HMGET` (enforces ≥ 1 field; returns nil for absent), `HRANDFIELD count WITHVALUES`; new `fake_redis_280` rows; 32 test files (72 lines) migrated, of which 24 inline doubles in 20 files each assert `source: 'authoritative'` or a read count after migration (A8) |
| Mutation batteries | yes | re-anchor: `roster_read_barrier_333` (4/4 rows), `presence_snapshot_339` (up to 6/8), `presence_local_member_343` (2/6), `live_conformance_285` (2 Lua rows); `presence_join_323` untouched unless `#closingRead`'s signature changes |
| `docs/realtime.md`, `README.md`, `packages/realtime/AGENTS.md` | yes | new "writing a presence driver" section; upgrade item 7; correct `HGETALL`/unbounded-read/hash-order passages (docs/realtime.md ~599, ~628, ~719, ~739-743, ~1057, ~1070-1074; README.md ~142; AGENTS.md ~402 and the reversed pitfalls ~423/~429); link the existing 7.0 minimum (docs/realtime.md ~1282, README.md ~63) |
| Wire protocol / control frames / MAC | no | — |

### Documentation (this feature)

```text
.specnaut/specs/259-presence-bounded-read/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| `HRANDFIELD count ≥ N` does not return the whole hash in `HGETALL` order on some Redis version → SC-002 breaks | live conformance row on Redis 7 pins it; if it fails, the same `EVAL` returns `HGETALL` when `HLEN ≤ limit` (still one command, still bounded — S5) |
| `HMGET` with zero fields errors on real Redis while FakeRedis accepts it | `''` padding (A1); FakeRedis enforces the one-field minimum; live row with zero self ids |
| Migrated test doubles silently become roster-less and test the local path | each asserts `source: 'authoritative'` or a read count (A8) |
| `FakeRedis` sampling (first `count` in insertion order) hides a real-Redis difference | property-based conformance rows when count < N; gated live test |
| Reconnect storm latency: ⌈S/1 000⌉+1 sequential reads | accepted residue; each read is bounded and one is in flight |
| Third-party driver types-match but reads everything | JSDoc states the cost contract; unenforceable, named residue |
| `members.length < min(K,total)` from unparseable entries | documented; the existing skip + WARN stays |
| Barrier change regresses #333's trailing edge or rejection path | `roster_read_barrier_333` battery re-anchored and re-run; new overflow mutants |
| Lua evaluator growth lets a real-Redis-invalid script pass in tests | evaluator still throws on anything outside the three additions; live test runs the real script |

## 10. Architecture audit

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 (HIGH) | A read with zero self ids makes `HMGET key` fail on real Redis (a superseded join reaches `#closingRead` with no member; pipelined subscribe/unsubscribe forces local fallback + WARN); FakeRedis hides it | Plan changed: `''` padding row in §5, FR-005a, FakeRedis minimum, live row, risk row |
| A2 | The pre-await "fetch" self id had no home; #339 rows 152 and 155 superseded/dropped unlisted | Plan changed: two rows added; all four superseded #339 rows listed by line |
| A3 | No batch normalisation rule; self slot placement when the window is short | Plan changed: dedupe by `String(id)` (merged with S1); append-vs-replace in the self row |
| A4 | FR-002 grep would hit legitimate test `HGETALL` inspection | Plan changed: grep scoped to production files and doc code blocks |
| A5 | Evaluator change crosses into `packages/redis` and its types | Plan changed: §8 row, separate `test(redis)` scope |
| A6 | Prose impact undercounted; 7.0 already documented | Plan changed: §8 lists the passages; FR-009 links rather than restates |
| A7 | Confirms #345; new: `readRoster` rules out #345's "per-instance fields aggregated at read time" on the same hash | Recorded as residue (§12); comment to be posted on #345 |
| A8 | 24 inline doubles could silently become roster-less | Plan changed: §8 row, risk row |
| A9 | New symbols not marked, `rosterSnapshot` row, value export, domain "Out of scope" | Plan changed: all four |

**Verdict**: fail as first written (one HIGH), design shape upheld; all nine findings folded. Covered:
§3 against §5, every §5 home against `main` at 8497a223, the superseded #339 rows, the Redis version
claim, every `listMembers`/`HGETALL` reference (83 occurrences, 72 in tests), every mutation battery
anchored on touched files, the Lua evaluator, #344–#346. Not covered: security, performance
measurement, release policy.

## 11. Security audit

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 (MEDIUM) | Self-id batches not deduplicated: N pipelined re-join frames from one socket (unmetered, #329) fill batches with one id → ⌈N/1000⌉+1 reads of ~4 MB duplicate entries each, worse than #333's 2 reads, delaying honest joiners | Plan changed: FR-005 dedupe by `String(id)`, cap counts distinct ids; barrier row; edge case restated; mutant "5 000 frames, one id → 2 reads" |
| S2 | `readRoster` doesn't validate its inputs; a negative `HRANDFIELD` count returns \|count\| entries with repeats; the seam is exported | Plan changed: FR-001 driver-side asserts; §5 row; conformance row for `-1`, `0`, `1.5`, MAX+1 |
| S3 | Positional matching of `selves` + a nil-truncating Lua table could hand a caller another member's entry | Plan changed: FR-001 match by parsed id, drop mismatches; live row with an absent id between two present ones |
| S4 | "stored entries" would expose `owner` (instance id) through an exported type — expensive to fix after release | Plan changed: `selves` typed `PresenceMember[]`, driver strips `owner` |
| S5 | A small-room `HGETALL` fallback as two commands reintroduces the unbounded read under growth | Plan changed: any such branch lives inside the one `EVAL` |
| S6 | Confirms #345: a re-join on a shared id gets the last writer's `info` as self; nothing new | No change; barrier stays keyed by channel only |

**Verdict**: no CRITICAL/HIGH; all findings folded. Covered: every new input surface
(`readRoster` args, batches, `EVAL`/`ARGV`, reply parsing), authorization (unchanged, decided once in
`authorize`), reachable bytes (`total` already public, sample reveals only room membership, `owner`
fixed by S4), stranger impact (per-read ingest ≤ (K + 1 000) × `maxPresenceMemberBytes` ≈ 4.7 MB at
defaults, independent of room size, once S1 holds), the legacy-driver throw (construction-time,
operator-supplied — not a DoS). Code read at 8497a223. KB injection/footgun chapters not loaded.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| P1 — On Redis, a room larger than K shows a different random K members on every subscribe (re-joins included); memory keeps join order. Accept? Recommended: yes (unreleased; docs already say the order is arbitrary; no member is permanently hidden; a stable window costs a Lua loop or a new index key). | **Accepted** — the random per-subscribe sample on Redis for rooms > K ships as designed. | 2026-09-14 |

**Architecture approved by the maintainer at the plan stop, 2026-09-14** (atomic bounded `readRoster`, no fallback, v0.4.0, with A1–A9 and S1–S6 folded).

### Decided without asking

- The shape (atomic bounded `readRoster`, barrier self-id batches, no fallback) — architect-expert disposition, 2026-09-14. Rejected: plain `HLEN`+`HRANDFIELD`+per-caller `HGET` (non-atomic `total`, breaks read sharing); R1e local projection (drifts: sweep `HDEL`s publish nothing, frames are fire-and-forget; O(room) memory per instance; reload on rewatch); optional `listMembersBounded` with fallback (unbounded read stays public, two read shapes forever); self from the local map (claims a membership the roster refused, #323); `HSCAN` window (COUNT is a hint; needs Lua loops); join-order sorted-set index (new key breaks "no Redis migration"; early joiners capture the window); barrier keyed by (channel, self) (a burst of distinct joiners shares nothing).
- Ships in 0.4.0 with the seam break of item 2; moves whole to 0.5.0 if 0.4.0 is cut first — release policy already standing.
- Redis minimum 7.0 is not new (`EXPIRE NX/GT`), only newly documented.
- Self-id cap 1 000 — bounds per-read ingest to a constant and keeps Lua `unpack` far below its limit.
- **#345 interaction (A7):** `readRoster` samples hash fields with `total` = population, one entry per `String(id)` — this rules out #345 solving cross-instance ownership with per-instance fields aggregated at read time on the same hash.
- **Residue, not solved here:** local-path and roster-less reads still O(local members) CPU; storm latency; third-party drivers can ignore the cost contract; broker-side O(N) for listpack-encoded hashes (bounded by `hash-max-listpack-entries`); memory driver's O(limit) walk cannot be pinned by a mutant (equivalent to a full copy); R1b–R1d, #344, #345 unchanged.
