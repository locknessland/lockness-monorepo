# Plan: Roster slots held per instance, presence announced per member

**Branch**: `260-presence-member-holds` | **Date**: 2026-09-15 | **Backlog items**:
[#344 — Realtime: presence `joined` / `left` are announced per connection, not per member](https://github.com/locknessland/lockness-monorepo/issues/344) ·
[#345 — Realtime: one member on two instances — the Redis roster slot is last-writer-wins, and a leave on one instance deletes a slot the other still holds](https://github.com/locknessland/lockness-monorepo/issues/345)

Shape decided by two `architect-expert` dispositions (hard rule #11, 2026-09-15), recorded as
comments on both issues. #344's disposition supersedes #345's "manager unchanged" and "seam
signatures unchanged". This plan binds both.

---

## 1. Why this exists

`docs/realtime.md` promises one roster slot per identity "however many tabs it opens". Two things
break that promise, and they share one cause: nobody counts **who holds** a slot.

- **#345 — the Redis slot.** `ADD_MEMBER_SCRIPT` (`drivers/redis.ts:174`) `HSET`s one field per
  member id naming a single `owner`; `REMOVE_MEMBER_SCRIPT` (`:197`) `HDEL`s it unconditionally; the
  sweep (`#sweepInstance`, `:2200`) `HDEL`s whatever a dead instance's owned set lists. With member
  M on instances A and B: A's leave deletes the slot B still holds (every later `here` omits M), the
  last writer wins `info`, and A's death sweeps B's live slot.
- **#344 — the announcements.** `#joinPresence` emits `joined` and publishes `presence-join` per
  connection (`manager.ts:1486`, `:1503`); `unsubscribe` emits `left` and publishes
  `presence-leave` per connection (`:2050`, `:2058`). A second tab announces a join for a member
  already listed; closing one of two tabs removes a member who is still present from every
  client's list until the next snapshot. It hits every multi-tab user on the default configuration.

Only the code that changes a slot's holder count atomically sees "member arrived" (0 → 1) and
"member gone" (1 → 0) exactly — so both fixes live in the same place and ship together in 0.4.0
(unreleased: tags stop at `v0.3.0`).

## 2. User scenarios

### US1 — A second tab is silent (P1)

**Given** member 7 is present with one connection
**When** 7 opens a second connection (same or other instance)
**Then** no `joined` frame reaches the room and no `presence-join` is published.

### US2 — Closing one of two tabs is silent; closing the last is one `left` (P1)

**Given** member 7 has two connections (same instance, or one on A and one on B)
**When** one closes → nothing is sent, and 7 stays in every `here` snapshot (`total` unchanged)
**When** the last closes → exactly one local `left` and one `presence-leave`, from the releasing instance.

### US3 — A dead instance never removes a member another instance holds (P1)

**Given** 7 is held by A and B on Redis
**When** A's liveness lapses and B's reconcile sweeps A (whichever of A/B wrote last)
**Then** 7 stays in the roster with B's entry; two interleaved sweeps of A change nothing further.

### US4 — The shown info is a current holder's (P2)

**Given** A and B hold 7 and A's entry is shown
**When** A releases
**Then** B's entry is shown; releasing a holder whose entry is not shown leaves the info unchanged.

### US5 — A stale custom driver fails at construction (P2)

**Given** a `BroadcastDriver` still implementing `addMember` / `removeMember`
**When** a `ChannelManager` is constructed over it
**Then** construction throws, naming the upgrade item.

### US6 — A failed `presence-leave` publish no longer fails `unsubscribe` (P3)

**Given** the control publish rejects
**When** a member's last connection unsubscribes
**Then** `unsubscribe` resolves `'left'` and logs one WARN.

### Edge cases

- Join overtaken by its own leave (#330): neither announces — no `left` without `joined` (W6).
- Join whose queued write finds the slot emptied by an earlier leave: that join's write sends the
  `left` (W8).
- Two instances 0 → 1 at once: the script serialises; exactly one sees `arrived`.
- #323: a hold that committed but whose reply was lost — the rollback's release returns `gone` and
  sends a truthful `left` (no `joined` was sent). Accepted by the disposition.
- A instance swept while still live, then releasing: `mine` is absent → B's slot untouched (W6 #345).
- Legacy 0.3.0 field with no holders hash: a 0.4.0 release or sweep deletes it (n = 0, no `gone`);
  a 0.4.0 hold on it reports `arrived` (residue).
- Holders hash present but field missing (not producible by 0.4.0 scripts; producible in a mixed
  fleet by a 0.3.0 `HDEL`): only a non-holder release (`false == false`) copies a holder back in; a
  holder's own release does not repair it (residue).
- Roster-less driver: arrived/gone from the manager's private `#heldSlots`.
- Crash: the sweep announces nothing (#348).

## 3. Requirements

- **FR-001**: The presence seam is `holdMember(channel, member): RosterHold` and
  `releaseMember(channel, memberId): RosterRelease` (sync or `Promise`), with
  `RosterHold { readonly arrived: boolean }` and `RosterRelease { readonly gone: boolean }`.
  Hold means "this process holds `String(id)` with this entry"; `arrived` is true only if no process
  held it. Release means "this process drops its hold"; `gone` is true only if this process held it
  and no holder is left. `addMember` / `removeMember` no longer exist on the seam.
- **FR-002**: `assertNotLegacyRosterDriver` collects every retired roster member present
  (`listMembers`, `addMember`, `removeMember`) and throws **once**, naming all of them and citing
  the upgrade section by **title** ("The driver roster seam…"), never by number (A6). A driver is
  presence-capable iff it has `holdMember` + `releaseMember` + `readRoster`.
- **FR-003 (Redis)**: Each roster slot has a holders hash `<prefix>__holders:<channel> <String(id)>`
  mapping `instanceId → that instance's latest entry JSON`, with no TTL. `holdersKey`'s JSDoc names
  `#assertUsableChannel` (no space in a channel) as the check its unambiguity depends on (S-1).
- **FR-004 (Redis)**: A hold is one `EVAL` over four keys (presence hash, holders hash, own owned
  set, instances set): `HSET holders instanceId entry`, `HSET presence field entry`,
  `SADD owned entry`, `SADD instances instanceId` — no hold can exist on an unregistered instance
  (S1b); it returns 1 iff the holders `HSET` added a field and `HLEN holders` is then 1.
- **FR-004a**: `holdMember` / `releaseMember` decode the `EVAL` reply strictly: integer 1 → true,
  integer 0 → false, anything else throws (A-L3).
- **FR-005 (Redis)**: A release is one `EVAL` over three keys (presence hash, holders hash, the
  releaser's owned set) with the releaser's id as an argument: read `mine = HGET holders releaser`
  and `shown = HGET presence field`; `HDEL holders releaser`; `SREM owned entry`;
  `n = HLEN holders`; if `n == 0` delete the presence field and return 1 iff `mine ~= false`; else,
  if `shown == mine`, copy one remaining holder's entry (`HRANDFIELD holders 1 WITHVALUES`) into the
  field; return 0.
- **FR-006 (Redis)**: `#sweepInstance(deadId)` runs the release script once per owned entry with
  `ownedKey(deadId)` and `deadId`, ignores the return, then `SREM instances deadId`. It **no longer
  `DEL`s the owned set**: each release already `SREM`s its entry, so a hold that lands between the
  `SMEMBERS` and the end of the sweep stays sweepable (S1c). No raw `HDEL` on the presence hash
  remains in the driver.
- **FR-007 (Redis)**: `readRoster` / `READ_ROSTER_SCRIPT` are byte-unchanged.
- **FR-008 (memory)**: `arrived = !members.has(key)` before the set; `gone = members.delete(key)`.
- **FR-009 (manager)**: `#syncRosterMember(channel, origin: { clientId, member }): Promise<void>`
  computes `desired` inside the queue (ADR 003 §7, unchanged), holds or releases, and on
  `arrived` calls `#announcePresence('joined', desired, origin)`, on `gone`
  `#announcePresence('left', origin.member, origin)`. On a roster-less driver arrived/gone come
  from a private `#heldSlots: Set<string>` keyed like the queue, updated **before** the
  announcement runs (A-L3).
- **FR-010 (manager)**: `#announcePresence` emits locally first, then awaits `publishControl` with
  `target: origin.clientId`. Payloads: `joined` carries `desired`, `left` carries `origin.member`.
  A publish error — and an `encode` throw — is one WARN and is not rethrown (a throw inside the
  queue would reject another call's write and roll back a committed hold, A-L3). The WARN carries
  only the channel (`safeForLog`), the action and `renderError(error)`: never the member id or
  `info` (S-4).
- **FR-010a**: The `joined` exclusion is **one rule keyed by member id**:
  `emitPresence(channel, frame, { exceptMemberId })` skips every local subscriber whose presence
  entry has that `String(id)`, computed from `presence.get(channel)` at emit time. Both
  `#announcePresence` and `handleControl`'s `presence-join` arm use it, so a connection that
  claimed the member on another instance never receives `joined` for itself (A5). `left` excludes
  nobody. Receive-side only: no frame or MAC change.
- **FR-011 (manager)**: `#joinPresence` and `unsubscribe` emit and publish nothing; the
  `applied === undefined` branch is removed (a superseded join still returns `#closingRead`).
  `origin` only names who to announce as, never the desired state. `handleControl` changes only by
  FR-010a; control-frame kinds, fields and MAC bytes are unchanged.
- **FR-012**: `unsubscribe` resolves `'left'` when its `presence-leave` publish fails; a failed
  **release** still rejects, as today (S). `LeaveOutcome` JSDoc states `'left'` means "a membership
  was removed here", not "a frame was sent".
- **FR-013**: Every search below returns nothing, except inside `.specnaut/specs/` (historical),
  `docs/superpowers/specs/` (historical), the legacy guard's `RETIRED_ROSTER_MEMBERS`, the 344-W12
  refusal tests, and upgrade item 7's Before/After table and refusal paragraph in `docs/realtime.md`
  (amended 2026-09-15 at implement: FR-014 requires that table to name the old methods):
  `grep -rn "addMember\|removeMember\|REMOVE_MEMBER_SCRIPT" packages/ docs/realtime.md docs/adr/ README.md`
  and `grep -n "'HDEL'" packages/realtime/drivers/redis.ts` outside a script constant.
- **FR-014**: Docs: `docs/realtime.md` — "What a `joined` frame promises" (61–90, including that a
  join whose reply was lost after commit can now send `left`), the failed-join path (737–744), the
  roster section and ghost sweep (1048–1192), the `evict` / `revokeChannel` wording, "Writing a
  presence driver" (1193–1232), the v0.4.0 intro (1585–1589: count of breaking changes, "No Redis
  migration", reading list), item 3 (1692–1714), **item 7 holds the whole driver-author break**
  (bounded read, hold/release rename and return values, the single refusal), **new item 8 holds
  only what applications see** (per-member frames, `unsubscribe` no longer rejecting on publish
  failure, cross-linked to item 4); the Redis requirements: roster keys carry no TTL, so the
  realtime Redis must run `noeviction` or a `volatile-*` policy (S1d); memory is `1 + k` entries
  per member held on k instances (S). New `docs/adr/004-realtime-roster-slots-held-per-instance.md`,
  which also states that a per-identity unique `member.id` is what makes `joined`/`left` truthful
  (S-3, #346). ADR 003 §3/§6/§7 amended. `packages/realtime/AGENTS.md` pitfalls (145–156, 262–269)
  rewritten, plus one pitfall: announcements live in the queue, never back in `subscribe` /
  `unsubscribe`; `packages/redis/AGENTS.md` for the evaluator subset.
- **FR-015 (in-code prose, A7)**: every comment and JSDoc stating per-connection announcement, the
  removed return value, or two-key scripts is corrected in the same change: `manager.ts` 389–407,
  749–750, 786–788, 1326–1328, 1355–1356, 1544–1545, 1788–1790, 1845–1877, 1977–1979, 1988–1992,
  2071–2072, 2112–2114, 2237–2238, 2648–2654 (`emitPresence`), 2703–2709; `redis.ts` 150–200,
  1450–1500, 2199, 2230–2232; `driver.ts` seam JSDoc.

## 4. Success criteria

- **SC-001**: A member with any number of connections on any number of instances produces exactly
  one `joined` per arrival and one `left` per departure, observed by a subscriber on every instance
  — on a driver with an authoritative roster (memory, Redis). A roster-less driver with a control
  plane decides per instance (A-L1, residue).
- **SC-002**: While at least one live instance holds a member, every `here` snapshot on every
  instance lists it (subject to K) and counts it in `total`.
- **SC-003**: No instance death removes a member another live instance holds.
- **SC-004**: For every slot written by 0.4.0, a presence field exists iff its holders hash has ≥ 1
  entry — pinned on fake and live Redis.
- **SC-005**: Broker commands per subscribe/unsubscribe unchanged (`churn_cost_329` totals do not
  move: still one `EVAL` per hold/release).
- **SC-006**: Applications need no code change; driver authors get one documented 0.4.0 break.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The seam: `holdMember` / `releaseMember`, `RosterHold` / `RosterRelease`, hold/release meaning | `packages/realtime/driver.ts` | kept `addMember`/`removeMember` aliases; a `boolean` return; the meaning restated differently in a driver JSDoc |
| A driver is presence-capable iff `holdMember` + `releaseMember` + `readRoster` | `packages/realtime/manager.ts` `presenceRoster` | `if (driver.holdMember)` at a call site |
| A driver with any retired roster member (`listMembers`, `addMember`, `removeMember`) is refused, once, naming all of them | `packages/realtime/manager.ts` `assertNotLegacyRosterDriver` (extended, still separate from the revocation guard) | a second guard; two sequential throws; a check inside the queue; a `TypeError` left to surface in the #323 rollback; an item number in the message |
| Redis "arrived" = holders `HSET` added and `HLEN` is 1; a hold registers its instance | `packages/realtime/drivers/redis.ts` `HOLD_MEMBER_SCRIPT` (NEW, replaces `ADD_MEMBER_SCRIPT`) | an `HLEN`/`EXISTS` issued from TypeScript; arrival inferred from the presence `HSET` reply; registration left to the heartbeat alone |
| The `EVAL` reply decodes 1 → true, 0 → false, else throw | `packages/realtime/drivers/redis.ts` one private decoder used by `holdMember` and `releaseMember` | `reply === 1` inline in each method; truthiness |
| Holders hashes carry no TTL | `packages/realtime/drivers/redis.ts` (no `EXPIRE` on `holdersKey`) + the eviction-policy requirement in `docs/realtime.md` | an `EXPIRE` in the hold script; a TTL "safety net" |
| `readRoster` / `READ_ROSTER_SCRIPT` unchanged | `packages/realtime/drivers/redis.ts` (carried from #341) | a holders read on the snapshot path |
| Redis "gone" = n = 0 and the releaser held it; field deleted only at n = 0; shown info replaced only when `shown == mine` | `packages/realtime/drivers/redis.ts` `RELEASE_MEMBER_SCRIPT` (NEW, replaces `REMOVE_MEMBER_SCRIPT`) | an owner check in TypeScript; a second release script for the sweep; a raw `HDEL` on the presence hash anywhere |
| The sweep releases exactly as a leave does, and never `DEL`s the owned set | `packages/realtime/drivers/redis.ts` `#sweepInstance` (asks `RELEASE_MEMBER_SCRIPT` with `deadId`) | its own `HDEL`; passing `this.instanceId`; a final `DEL owned` |
| The holders key layout | `packages/realtime/drivers/redis.ts` `holdersKey(channel, id)` (NEW, beside `presenceKey`/`ownedKey`, reusing `OWNED_SEP`) | the key built inline in `holdMember`, `releaseMember` or the sweep; a second separator constant |
| Memory arrived/gone | `packages/realtime/drivers/memory.ts` `holdMember` / `releaseMember` | a pre-read in the manager |
| Roster-less arrived/gone | `packages/realtime/manager.ts` `#heldSlots` (NEW, private, touched only inside `#syncRosterMember`'s queued run, updated before announcing) | reading `presence` sizes in `subscribe`/`unsubscribe`; a counter per member |
| What `desired` is (earliest local connection of the member) | `packages/realtime/manager.ts` `#syncRosterMember` via `#localRoster` (unchanged, ADR 003 §7) | `origin.member` used as the entry to hold |
| Who announces: the queued write that observes arrived/gone, and only it | `packages/realtime/manager.ts` `#syncRosterMember` → `#announcePresence` (NEW) | any `emitPresence(… 'joined'/'left' …)` or `publishControl({ kind: 'presence-join'/'presence-leave' })` outside `#announcePresence` (receive side excepted) |
| Announcement order and payload: emit locally, then publish; `joined` = `desired`, `left` = `origin.member`, `target` = `origin.clientId` | `packages/realtime/manager.ts` `#announcePresence` | a payload rebuilt at a call site; publish before emit |
| `joined` never reaches a connection of the same member id (local or remote origin); `left` excludes nobody | `packages/realtime/manager.ts` `emitPresence` option `exceptMemberId`, asked by `#announcePresence` and `handleControl`'s `presence-join` arm | `except: origin.clientId` only (M7); an id filter in `handleControl` or `#announcePresence` itself; the old single `except` kept for presence |
| A publish or encode failure is a WARN with channel + action + error only, never rethrown from the queue | `packages/realtime/manager.ts` `#announcePresence` | a `try/catch` in `unsubscribe`/`#joinPresence`; rethrow (rolls back a committed join); member id or `info` in the message |
| `'left'` means a membership was removed here | `packages/realtime/manager.ts` `LeaveOutcome` JSDoc | a second outcome (`'left-unannounced'`) |
| Hold/release atomicity: one `EVAL` each (hold four keys, release three) | `drivers/redis.ts` script constants (JSDoc key legend) | a `MULTI`; a follow-up command after the `EVAL` |
| Lua subset: `==` only, type-strict (`'1' == 1` is false), numeric literals are numbers in comparisons, `false` literal, nested `if … then … end`, `return` as the last statement of a block, `[n]` on a local | `packages/redis/tests/lua_eval.ts` | a Lua special case in `FakeRedis`; loose equality; `~=` or `>` added unused; a script rewritten to dodge the evaluator |
| A nil reply reaches Lua as `false` | `packages/realtime/tests/fake_redis.ts` EVAL bridge (reply-to-Lua conversion, `:584`) + `LuaValue` doc in `lua_eval.ts` | an `HGET` arm returning `false`; a per-command nil rule |

**Supersedes** (shipped records, not rewritten): ADR 003 §3's "three call sites … the join, the
join's failed-write compensation, and `unsubscribe`" still holds for writes, but the announcement
now moves into the writer; §6's "Cross-instance slot ownership" and "Announcement interleaving"
residues are closed by ADR 004; #342's `@returns` contract on `#syncRosterMember` (member or
`undefined`) is replaced by `Promise<void>`; #341 plan §6 constraint "no key, write script …
change" and upgrade item 3's "adds no key and changes no write" no longer hold.

## 6. Technical context

**Language/Version**: TypeScript on Deno 2
**Primary Dependencies**: `@lockness/realtime`; `@lockness/redis` test evaluator `lua_eval.ts`
**Storage**: Redis ≥ 7.0 (presence hash, NEW holders hashes, owned sets); in-process `Map`
**Testing**: `deno test`, `FakeRedis`, live Redis (`LOCKNESS_REDIS_INTEGRATION=1`), mutation batteries
**Project Type**: library · **Target**: server
**Constraints**: no control-frame or MAC change; `readRoster` byte-unchanged; Redis Cluster out of
scope (hold four keys, release three, cross-slot); Redis must not evict roster keys
(`noeviction` or `volatile-*`)
**Scale/Scope**: multi-instance rooms; `1 + k` Redis entries per member held on k instances

### Scripts (normative; the evaluator subset of §5 must run them unchanged)

```lua
-- HOLD: KEYS presence, holders, owned, instances · ARGV field, instanceId, entry, ownedEntry
local added = redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('SADD', KEYS[3], ARGV[4])
redis.call('SADD', KEYS[4], ARGV[2])
local n = redis.call('HLEN', KEYS[2])
if added == 1 then
  if n == 1 then
    return 1
  end
end
return 0
```

```lua
-- RELEASE: KEYS presence, holders, owned · ARGV field, releaserId, ownedEntry
local mine = redis.call('HGET', KEYS[2], ARGV[2])
local shown = redis.call('HGET', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[2], ARGV[2])
redis.call('SREM', KEYS[3], ARGV[3])
local n = redis.call('HLEN', KEYS[2])
if n == 0 then
  redis.call('HDEL', KEYS[1], ARGV[1])
  if mine == false then
    return 0
  end
  return 1
end
if shown == mine then
  local promoted = redis.call('HRANDFIELD', KEYS[2], 1, 'WITHVALUES')
  redis.call('HSET', KEYS[1], ARGV[1], promoted[2])
end
return 0
```

### Domain model

- **Bounded context**: realtime (presence, Redis driver)
- **Vocabulary**: Roster slot — field `String(id)` of a channel's presence hash; Holder — a process
  holding the slot; Holders hash — `instanceId → entry`; Hold / release — `holdMember` /
  `releaseMember`; Arrived — holder count 0 → 1 cluster-wide; Gone — 1 → 0; Shown entry — the
  presence field's value; Origin — the connection a queued write announces as; Ghost sweep —
  releasing a dead instance's holds.
- **Entities**: `ChannelManager` [aggregate root: local presence, per-slot queue, announcements];
  `RedisBroadcastDriver` [aggregate root for the authoritative roster: scripts, holders, sweep];
  `MemoryBroadcastDriver`.
- **Value objects**: `PresenceMember(id, info)`; `RosterEntry(member, owner)`; `RosterHold(arrived)`;
  `RosterRelease(gone)`; `RosterWindow` (#341, unchanged).
- **Invariants**: field exists ⇔ holders ≥ 1 (0.4.0 slots); a release or sweep never deletes a slot
  another instance holds; the shown entry never belongs to a departed holder; one `joined` per
  arrival and one `left` per departure; only the queued write that observes the transition
  announces; an announcement never claims a membership the roster refused (#323); a superseded join
  and the leave that overtook it announce nothing (#330); at most one write in flight per slot per
  instance; `readRoster` one entry per `String(id)`, `total` = `HLEN` presence.
- **Out of scope**: local snapshot counting (#343, shipped); read size (#341, shipped); crash-sweep
  announcements (#348); member-id type validation (#346); Redis Cluster.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1 No direct `hono` import | pass | untouched |
| 2 JSR-only deps | pass | no new dependency |
| 3 No `any` in exported APIs | pass | `RosterHold` / `RosterRelease` fully typed |
| 4 Tailwind syntax | pass | n/a |
| 5 Pre-completion gate | pass | full gate + `test:redis` + batteries |
| 6 `deno.lock` | pass | untouched |
| 7 JSDoc on public APIs | pass | seam methods and both result types with `@example` |
| 8 MVC layering | pass | n/a (library) |
| 9 Commit discipline | pass | squash by scope: `test(redis)`, `fix(345)`, `fix(344)`, `test(344/345)`, `docs(344/345)` |
| 10 Public repo | pass | no environment detail |
| 11 Design → architect-expert | pass | both dispositions, 2026-09-15 |
| 12 Act, don't recommend | pass | — |
| TDD / witness red first | pass | W1–W8 (#345) and W1–W12 (#344) red on `main` first, except W7s |
| No silent catches | pass | publish failure is a WARN; sweep ignores only the release return |
| DDD / Domain Model gate | pass | §6 |

### Complexity tracking

A second seam break (rename + return values) is justified: 0.4.0 is unreleased and already breaks
this seam (#341 item 7); keeping `addMember` / `removeMember` with new return types contradicts the
hold/release meaning, and a stale driver would fail with a `TypeError` inside the #323 rollback
instead of at construction.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `BroadcastDriver` / `PresenceCapableDriver` (exported types) | yes — breaking | rename + `RosterHold` / `RosterRelease` (type exports in `mod.ts`) |
| Application-facing frames | yes | fewer `joined` / `left` (per member); no frame shape change |
| `unsubscribe` (exported) | yes | resolves `'left'` on publish failure (was: rejects) |
| Redis key layout | yes | NEW `<prefix>__holders:<channel> <id>`; hold/release scripts; sweep |
| Memory driver | yes | rename + return values |
| Control frames / MAC / wire | no | — |
| `packages/redis/tests/lua_eval.ts` (own `test(redis)` commit) | yes | the §5 subset (type-strict `==`, numeric literals, `false`, nested `if`, `return` in a block, local `[n]`); `LuaValue` doc (nil → `false`); docstring; `lua_eval.test.ts` rows including `'1' == 1` is false; `packages/redis/AGENTS.md` |
| `packages/realtime/tests/fake_redis.ts` | yes | `HGET`; EVAL bridge maps a nil reply to `false`; `fake_redis_280` + `fake_redis_conformance` rows (`HGET` missing field is `false` inside a script, on fake and live) |
| Realtime tests — rename | yes | 146 references in 27 test files, ~34 double definitions in 21 files: rename, return `{arrived}`/`{gone}`, keep each `source: 'authoritative'` / read-count assertion |
| Realtime tests — **assertions intentionally inverted** (A1) | yes | `presence_join_rosterless_342.test.ts:178-182` (W2 expects `presence-leave` = 1 from an overtaking leave → 0 by W6; struck from "stays green"); `roster_control_atomicity.test.ts:217-248` ("#323 the ONE log", two connections as `'ada'` → the newcomer's log is `[holdMember]`). **Sweep rule**: any test with two connections on one member id, or an overtaken join, that counts `joined` / `left` / `presence-*` is listed in `tasks.md` and re-proven red→green, never silently edited |
| `prefix_anchoring.test.ts` | yes | `PREFIX_MEMBERS` gains `holdersKey`; its canned `EVAL` reply `[0,[],[]]` (`:215`) must decode under FR-004a |
| Mutation batteries — **10 breaking anchors** (A2) | yes | `presence_join_rosterless_342.ts` all 3 rows (`:42`, `:52-56`, `:66`) **retired**, reason carried to successors W4/W6 via M2/M5 (`docs/testing.md` retired-row rule); `presence_join_323.ts` `:69-72` (emit `except` → successor M7), `:128-134` (`throw error` + braces), `:153` (`roster.addMember` → `holdMember`), `:187-205` (EVAL argument text); `roster_sync_330.ts:61` (`applied === undefined`); `presence_member_306.ts:90-91` (`const applied = …`, an edit anchor); `live_conformance_285.ts:125` (evaluator statement loop); `sweep_parse_316.ts` (sweep body); `prefix_288.ts` gains a `holdersKey` row. Every re-anchored battery is run and each row proven live |
| NEW batteries | yes | `presence_member_holds_345.ts` (8 mutants), `presence_member_transitions_344.ts` (M1–M10 + FR-010 WARN-content row + FR-010a remote exclusion row) |
| In-code prose | yes | FR-015 anchors |
| Docs | yes | `docs/realtime.md` 61–90, 1048–1192 (1096–1107, 1131–1160), 1193–1232, items 3 (1692–1714) and 7 (1785–1817), NEW item 8; ADR 003 (31, 32, 41–58, 86, 91–110); NEW ADR 004; `packages/realtime/AGENTS.md` 145–156, 262–269 + new pitfall; README if it names the seam |

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Evaluator growth lets a script invalid on real Redis pass | evaluator throws outside the named subset; live rows run the real scripts |
| `HGET` nil → Lua `false` differs between fake and Redis — the `gone` bit #344 announces from | nil → `false` at the EVAL bridge (A3); conformance row on fake and live; `mine == false` covered by W6 and W11 on both |
| A stale battery anchor reads as DEAD MUTANT and only runs nightly | all 10 anchors listed (§8); every touched battery run in the gate and each row proven live |
| The design's intended behaviour changes are hidden inside a mechanical rename | the inverted-assertion list and its sweep rule (§8) |
| `HRANDFIELD k 1 WITHVALUES` shape (`[f, v]`) | live row; W2′/W5 |
| An emptied holders hash lingers in the fake | `#dropIfEmpty` already on `HDEL`; W3 asserts `EXISTS holders` = 0 on fake and live |
| Announcements inside the queue reorder frames vs. today (subscribe replies before `joined`) | W7 pins `joined` before `left`; #330 batteries re-run |
| A thrown publish inside the queue rejects another call's write / rolls back a committed join | FR-010 WARN; M8 |
| 27-file test migration silently turns doubles roster-less | each migrated double keeps its `source: 'authoritative'` / read-count assertion |
| Mixed 0.3.0/0.4.0 fleet during deploy | documented in item 7; releases idempotent, nothing carries past the deploy |
| A holders entry no sweep can reach makes a departed member permanently present (S1: rollback, crash before registration, a hold racing a sweep, key eviction) | hold registers its instance (FR-004); sweep keeps the owned set (FR-006); eviction policy documented; rollback cleanup is P1; pruning holders of unregistered instances named as the later fix |
| `1 + k` Redis entries per member held on k instances | documented with the Redis requirements |

## 10. Architecture audit

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 (HIGH) | Tests the design inverts on purpose (`presence_join_rosterless_342` W2, `roster_control_atomicity` "#323 the ONE log") listed as migrated / "stays green" | Plan changed: §8 inverted-assertion list + sweep rule; 342 struck from "stays green" with its reason |
| A2 (HIGH) | Battery re-anchor list missed 7 of 10 breaking anchors (whole 342 battery, 306 edit anchor, 323 `:69-72`/`:128-134`, 285 evaluator loop, prefix row); stale anchors fail silently | Plan changed: §8 full list; 342 battery retired with successors; M7 successor to 323 row; `holdersKey` in #288 and `PREFIX_MEMBERS`; risk row |
| A3 | nil → `false` homed in `HGET`, but the EVAL bridge maps a nil reply to `undefined` — `gone` would differ between fake and Redis | Plan changed: §5 row rehomed to the bridge; conformance row |
| A4 | Evaluator subset neither sufficient nor minimal (`~=`/`>` unused; numeric literals are strings) | Plan changed: §5 subset `==` type-strict, numeric literals, `'1' == 1` row; M4 targets `if mine == false` |
| A5 | `joined` exclusion asked in two places: `handleControl`'s join arm excludes nobody → W9 fails across instances | Plan changed: FR-010a, `emitPresence({ exceptMemberId })` asked by both; remote W9 witness; FR-011 softened |
| A6 | A 0.3.0 driver would hit two sequential refusals naming two upgrade items; numbers drift | Plan changed: FR-002 one throw naming all retired members, section title not number; item 7 = driver-author break, item 8 = application-visible; intro 1585–1589 in FR-014 |
| A7 | Stale in-code prose not inventoried | Plan changed: FR-015 anchors; §8 row |
| A-L1 | SC-001 overclaims for a roster-less driver with a control plane | Plan changed: SC-001 qualified; residue |
| A-L2 | Unnamed residue: swept-while-live member never gets `left`; lost release reply skips `left`; holders-without-field unrepaired by a holder's release | Recorded as residue (§12) |
| A-L3 | Reply decoding, encode throw, `#heldSlots` ordering, `next` shadowing undecided | Plan changed: FR-004a, FR-009, FR-010, §5 rows, `promoted` |
| A-L4 | W6's "no local `left`" unobservable on the #330 rig | Recorded for `tasks`: W6 counts control frames or observes from a second manager |
| A-L5 | FR-003 no TTL, FR-007, FR-010 order/payload/target, FR-011 without rows | Plan changed: rows added |

**Verdict**: fail as first written (two HIGH, both inventory, not design); design shape and both
scripts upheld (every case traced); all findings folded. Blast radius counted: 173 references in 37
files, 3 `#syncRosterMember` callers, 4 moved emits/publishes, 2 receive-side re-emits, 10 battery
anchors. Covered: both scripts case by case, `manager.ts`/`redis.ts`/`memory.ts`/`lua_eval.ts`/fake
bridge, every realtime battery anchor, the 342/330/323/control-atomicity/churn/prefix tests, upgrade
sections. Not covered: remaining test assertions one by one (sweep rule instead), live broker.

## 11. Security audit

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 (MEDIUM) | A holders entry no sweep can reach makes a departed member permanently present (old `info` in every `here`, all future `joined`/`left` suppressed) and removes today's self-heal. Ways in: (a) rollback then re-upgrade; (b) a hold before the instance ever registered; (c) a hold between the sweep's `SMEMBERS` and `DEL owned`; (d) key eviction (evicting a holders hash alone brings #345 back) | Plan changed: (b) hold `SADD`s the instances set (FR-004); (c) sweep no longer `DEL`s the owned set (FR-006); (d) `noeviction`/`volatile-*` requirement documented (FR-014); (a) is P1; residue records "prune holders of unregistered instances" as the later, migration-free fix |
| S2 (LOW) | The P1 cleanup as worded (`DEL <prefix>__holders:*`) deletes nothing (`DEL` takes literal names); a `--scan \| xargs DEL` pipeline splits on whitespace in member ids and could delete a reserved key | Plan changed: P1 re-put with a safe mechanism (§12) |
| S3 (LOW) | Confirms #346: two identities sharing an id now keep the first listed and suppress their `joined`/`left` | Plan changed: ADR 004 / docs tie truthful announcements to per-identity unique ids (FR-014); #346 stays Ready |
| S4 (LOW) | FR-010's new WARN did not pin its content (ids can be emails, `info` is PII) | Plan changed: FR-010 content rule; battery row asserts it |

**Verdict**: no CRITICAL/HIGH; all findings folded. Checked: script inputs (all server-derived or
bounded: `String(id)` ≤ 200, `randomUUID` instance id, #326 entry cap, all via `ARGV`), holders key
unambiguity (channel regex has no space; prefix may not contain `__`), who selects the releaser
(private `instanceId` or server-side `deadId`), `arrived`/`gone` unforgeable (own connection;
control frames MAC'd), `owner` never reaching a client (`#parseRosterValue` rebuilds `{id, info}`),
churn cost unchanged, both scripts traced. `unsubscribe` no longer rejecting on publish failure is
judged safe (and lets `#revokeChannelLocal` clear its record). Not checked: memory driver, MAC
ingest path, prefix character validation, test infrastructure, no runtime probe.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| P1 — 0.4.0 adds one Redis key family (`<prefix>__holders:*`), no backfill, no deploy step. A rollback to 0.3.0 followed by a re-upgrade must clear that family first, or a crashed 0.4.0 instance swept by a 0.3.0 peer leaves a member permanently present. Accept the key family, and how is the cleanup offered? Recommended: accept, with a documented `SCAN MATCH` + `UNLINK` procedure that treats each key as opaque (S2). | **Accepted** — the holders key family ships; "No Redis migration" becomes "no migration step; one new key family"; the rollback-then-re-upgrade cleanup is a documented `SCAN MATCH` + `UNLINK` procedure handling each key as opaque (no `KEYS`, no whitespace-splitting pipeline, no shipped purge command). | 2026-09-15 |

**Architecture approved by the maintainer at the plan stop, 2026-09-15** (holders hash + hold/release scripts, slot owner announces from the queue, v0.4.0, with A1–A7, A-L1–A-L5 and S1–S4 folded).

### Decided without asking

- Shape: holders hash + hold/release scripts (#345 disposition); slot owner announces from the queue
  (#344 disposition). Rejected alternatives and their costs are in both disposition comments;
  summarised at the plan stop.
- Crash `left`: its own item (#348), default accepted 2026-09-15.
- Presence unit = members: decided in #343's groom.
- Ships in 0.4.0 (not cut); moves whole to 0.5.0 if cut first.
- Upgrade item numbering (A6): item 7 carries the whole driver-author break (bounded read,
  hold/release, the single refusal); new item 8 carries only what applications see.
- W6's observation (A-L4) counts control frames or uses a second manager — decided for `tasks`.
- **Residue, not solved here**: mixed-fleet defect until the last 0.3.0 instance is gone; rollback
  hazard (P1); unreachable holders entries from key eviction or a hold racing the sweep's final
  `SREM instances` on an instance that then dies — later fix: prune holders whose instance is not
  registered (no migration); a live instance whose heartbeat lapsed loses its holds, its next hold
  announces a duplicate `joined`, and its member never gets a `left` (#348); a lost **release**
  reply skips the `left` with no retry; holders without a field (mixed fleet) not repaired by a
  holder's release; a roster-less driver with a control plane decides arrived/gone per instance;
  Redis Cluster; sweep removals announce nothing (#348); promoted info random
  with 3+ holders; `left.member.info` is the releasing connection's; frame order across two
  publishers within one Redis round-trip; a third-party driver can fake `arrived`/`gone` or ignore
  holds; apps counting tabs from frames lose that signal; #323 lost-reply case sends `left` without
  `joined`.
