# Plan: Bounded presence snapshot on subscribe

**Branch**: `258-presence-roster-ceiling` | **Date**: 2026-09-14 | **Backlog item**:
[#339 — Realtime: SubscribeResult.members has no ceiling — a presence room's population is the reply size of every subscribe](https://github.com/locknessland/lockness-monorepo/issues/339)

**This is the feature's one planning document.** The design decisions are the `architect-expert`
disposition recorded on #339 (2026-09-14), which is binding. This plan turns it into requirements,
rules and a decision table. It does not re-decide it.

---

## 1. Why this exists

A presence `subscribe` returns `SubscribeResult.members`: the **whole room, cluster-wide**, with
every member's application-supplied `info`. #333 limited how **often** that read happens (one
authoritative read per channel per round-trip). It did not limit how **large** one reply is.

Nothing caps how many members a room holds. Each member can be up to `maxPresenceMemberBytes`
(4096). So one reply is at most N·4097+1 bytes, and N has no limit. Measured on the current bounds,
a room of 10 000 members at the maximum size puts **40 970 001 bytes (≈ 39 MiB)** into a single
`subscribe` result. That cost is paid again on every re-join (#327 removed the write, not the read).
Frame-rate policy (#329) cannot touch it, because the room grows without the frame rate changing.

The people affected are application developers running presence rooms that grow past a few hundred
members. Their servers build and relay huge replies, and their clients parse them, on every join.

## 2. User scenarios

### US1 — A join in a large room gets a bounded snapshot that says it is partial (P1)

**Given** a presence channel whose authoritative roster holds 251 members
**When** a new member subscribes
**Then** `here.members` holds exactly 100 members, `here.total === 251`, and the joiner's own member
is among the 100.

### US2 — A small room is unchanged (P1)

**Given** a presence channel with 2 members (at or under the bound)
**When** a member subscribes, or re-subscribes
**Then** `here.members` is the whole room in driver order, and `here.total === here.members.length`.

### US3 — The application raises or lowers the bound (P2)

**Given** a manager built with `maxPresenceSnapshotMembers: 10`
**When** a member subscribes to a room larger than 10
**Then** at most 10 members come back, self included. A manager built with `0`, `1.5` or `NaN` is
refused at construction.

### US4 — A re-join in a large room behaves exactly like a first join (P2)

**Given** a member already in a 251-member room
**When** it subscribes again
**Then** it gets the same shape as US1, self included, with nothing written or announced (#327).

### US5 — The broker is unreachable (P3)

**Given** `listMembers` rejects
**When** a member subscribes
**Then** the local-fallback snapshot is bounded by the same rule: `source: 'local'`, cut to the
bound, self kept, and `total` counts this instance's members.

### Edge cases

- Several joiners share one barrier read (#333). Each one's snapshot contains **its own** member,
  never another caller's, and the shared array is never mutated.
- A superseded join on a roster-capable driver: its member is not in the roster, so there is no
  self to keep, and the cut is plain driver order. On a driver **without** roster support, every
  first join also takes the superseded exit (`manager.ts:1752`, `:1328-1335`). The snapshot is
  then read from the local view, which does hold self, so self is kept. The missing `joined`
  announcement on that path is a pre-existing defect filed as #342, not fixed here.
- On a local view (the fallback, or a roster-less driver), entries are keyed by **connection**. One
  member with two tabs takes two slots and counts twice in `total`. That is documented, not
  changed; see #343.
- Self falls outside the first K in driver order: it replaces the last slot, so the snapshot is
  still exactly K.
- `joined`/`left` frames for members outside the snapshot keep flowing. A client building its list
  from updates can see `left` for someone it never saw (documented, not fixed; see section 9).
- A fleet mixing 0.3.0 and 0.4.0 instances during a deploy: old instances answer with the whole
  room, new ones with the bounded snapshot.

## 3. Requirements

- **FR-001**: A presence `subscribe` returns `SubscribeResult.here: PresenceSnapshot` with
  `members`, `total` and `source`. `SubscribeResult.members` and `SubscribeResult.rosterSource` are
  **removed**, not deprecated.
- **FR-002**: `here.members.length <= maxPresenceSnapshotMembers`. The default is
  `MAX_PRESENCE_SNAPSHOT_MEMBERS = 100`.
- **FR-003**: When the roster fits the bound, `here.members` is the roster unchanged, in driver
  order.
- **FR-004**: When it does not fit, `here.members` is the first K in driver order, except that the
  caller's own member, if the roster holds it and it is not among them, replaces the last slot.
  Identity is compared as `String(id)`.
- **FR-005**: `here.total` is the number of entries the source reported, computed **before**
  cutting and taken from the read already made. It never costs an extra driver command.
  `members.length < total` if and only if the snapshot is partial. On a local view it counts
  connections (#343).
- **FR-006**: The bound applies on **every** exit that returns a snapshot: first join, superseded
  join, re-join. It also applies on **both** roster sources, authoritative and local.
- **FR-007**: `maxPresenceSnapshotMembers` must be a positive integer. Anything else is refused at
  construction, with the same `assertCap` error every other cap uses.
- **FR-008**: Cutting the snapshot logs nothing, meters nothing, and changes neither `ok` nor the
  number of driver commands issued.
- **FR-009**: The wire protocol gains an optional `total?: number` on the `subscribed` frame and on
  the presence `here` frame. `members` keeps its flat position. No field is renamed or removed on
  the wire.
- **FR-010**: `listMembers`, the driver seam, the `RosterReadBarrier` and every Redis key or script
  are unchanged.
- **FR-011**: `PresenceSnapshot` and `MAX_PRESENCE_SNAPSHOT_MEMBERS` are exported from `mod.ts` with
  JSDoc. The cutting function is internal.
- **FR-012**: `docs/realtime.md` § Upgrading to v0.4.0 gains migration item 6, written before the
  change lands. It must:
  - say that removing the fields is a compile error;
  - for old clients, give a **finite** interim K with its cost formula K·(M+1)+1 and "lower it once
    clients read `total`". It never advises "above the largest room", which would bring back the
    unbounded reply (S2).
- **FR-013**: `presence_rejoin_327.test.ts:169-190` stays a whole-room assertion, because its
  2-member room fits the bound. It gains a call-site comment citing #339 and the bound. The "never
  a fragment that does not say so" clause moves to test row 4.
- **FR-014**: The rules that must outlive this plan are carried into code, as JSDoc on
  `boundPresenceSnapshot` and `#closingRead`, and into `packages/realtime/AGENTS.md` pitfalls:
  - the cut never happens in the barrier or a driver;
  - the cut is silent;
  - `total` costs no command and is a snapshot-time number, never added to `joined`/`left` frames;
  - the function does not sort;
  - each caller's copy comes from `rosterSnapshot`'s spread.
- **FR-015**: The docs say plainly that the snapshot is a UI hint, not an access list. On drivers
  that list members in join order (memory), the first K joiners hold the visible window.
  Authorizers should return a member id per identity, not `true`, so that one account holds one
  slot (S1).

## 4. Success criteria

- **SC-001**: With the default bound, one presence subscribe hands the application at most 409 701
  bytes of member JSON, however large the room. It was 40 970 001 bytes for a 10 000-member room.
- **SC-002**: Every room of 100 members or fewer returns the same members, in the same order, as
  before the change.
- **SC-003**: A joiner finds itself in its own snapshot whenever the roster the snapshot was cut
  from holds it, at any room size and under concurrent joins.
- **SC-004**: The number of broker commands per presence subscribe is identical before and after.
- **SC-005**: A developer upgrading from 0.3.0 learns every place they read `members` or
  `rosterSource` from compile errors, and the migration item tells them what to write instead.
- **SC-006**: With the bound configured to 10, one presence subscribe hands the application at most
  40 971 bytes of member JSON.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| How a roster is cut to the bound: fits → unchanged; otherwise first K in driver order, self replaces the last slot; `total` computed before the cut; input never mutated. Return type `Omit<PresenceSnapshot, 'source'>` | `packages/realtime/presence_snapshot.ts` (`boundPresenceSnapshot`) | A `.slice(0, limit)` or `.length` comparison on members anywhere in `manager.ts`; self-inclusion logic in a caller; `total` computed in the manager; a second cut in a driver or in `protocol.ts`; a literal `{ members; total }` return type |
| Driver order is kept: no sort, no relevance or join-time ordering | `packages/realtime/presence_snapshot.ts` (JSDoc on `boundPresenceSnapshot`) | A `.sort(...)` inside the function or in `#closingRead` (O(N log N) per caller on a shared read) |
| Where the cut is applied: once, after the read settles, on both roster sources | `packages/realtime/manager.ts` (`#closingRead`, one call) | A call at each of the three exits (`:1306`, `:1335`, `:1433`); a cut inside `rosterSnapshot` or `RosterReadBarrier` (which would break read sharing); a separate cut on the local-fallback branch |
| Who "self" is, and **when** it is looked up: after the read settles, in the same statement as the cut, so the roster, the local fallback and self describe one moment | `packages/realtime/manager.ts` (`#closingRead`: `this.presence.get(channel)?.get(clientId)?.id`) | Passing an id from each exit (at `:1306` the `member` argument is the discarded new payload); a lookup before `await this.rosterSnapshot`; reading self from the driver reply |
| Ids compare as `String(id)` | `packages/realtime/presence_snapshot.ts` (`sameMemberId`, extracted from `manager.ts:1757-1758`; the manager imports it, so the edge stays `manager.ts → presence_snapshot.ts`) | A new `String(a.id) === String(b.id)` anywhere as another copy; `presence_snapshot.ts` importing from `manager.ts` (cycle). The drivers' map keys (`memory.ts:62,72`, `redis.ts:1420`) are storage keys, not comparisons, and stay |
| `total` comes from the read already made: no extra driver command | `packages/realtime/presence_snapshot.ts` (`roster.length`) | An `HLEN`/count call on the driver seam; a live counter in the manager |
| Each caller gets its own array | `packages/realtime/manager.ts` (`rosterSnapshot` spread at `:1800`, pinned by `presence_roster_read_333.test.ts:280-304`) | Removing the spread "because the function copies" (it returns its input unchanged when the room fits) |
| The cutting function stays internal | `packages/realtime/mod.ts` (not exported) | An `export { boundPresenceSnapshot }` from `mod.ts` |
| The bound's default value | `packages/realtime/manager.ts` (`MAX_PRESENCE_SNAPSHOT_MEMBERS`) | A literal `100` in docs code, `presence_snapshot.ts` or tests. **Exception:** the measured-ceiling test pins `100` and `409 701` literally and asserts `MAX_PRESENCE_SNAPSHOT_MEMBERS === 100` (a witness, not a magic number); importing the constant into `presence_snapshot.ts` (creates a `manager.ts ↔ presence_snapshot.ts` cycle) |
| The bound is a positive integer | `packages/realtime/manager.ts` (constructor, via the existing `assertCap`) | A guard inside `boundPresenceSnapshot`; a new error type |
| The shape of a snapshot (`members`, `total`, `source` travel together) | `packages/realtime/channel.ts` (`PresenceSnapshot`) | Flat `total`/`source` fields reintroduced on `SubscribeResult`; an inline object type in `manager.ts` |
| The wire carries `total` flat beside `members` | `packages/realtime/protocol.ts` | A nested `here` object on the wire; renaming `members` on the wire |
| Truncation is silent: no log, no meter, no error | `packages/realtime/presence_snapshot.ts` (pure function, no logger reachable) | A WARN/INFO in `#closingRead`; a counter; a `truncated` error or event |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2.x
**Primary Dependencies**: `@lockness/realtime` internals only. No new dependency edge.
**Storage**: Redis hash per presence channel (unchanged: `HGETALL` via `listMembers`); memory driver map
**Testing**: `Deno.test`; the `FakeRedis` fake; gated live-broker tests (`LOCKNESS_REDIS_INTEGRATION=1`); the mutation batteries under `tests/mutations/`
**Target Platform**: Server (Deno), with the browser `RealtimeClient` untouched
**Project Type**: library (framework package)
**Performance Goals**: at most K·(M+1)+1 bytes of member JSON per reply; zero extra driver commands
**Constraints**: #329 (no verb meter, budget or error type); #323 same-turn rule (no work added before the first `await`); #333 barrier's shared read stays shared and unmutated

**Why `maxPresenceSnapshotMembers` is not what #329 declined** (from the disposition): it keeps no
state across frames and counts no frames, so it is not a meter. Nothing is spent or refilled, so it
is not a budget. Every frame is answered, `ok` and the read count do not change, so nothing is
rationed. It adds no error type: the only check is `assertCap`'s existing plain `Error` at
construction. It is an option on `ChannelManagerOptions` that limits the size of **one** reply, in
the same family as `maxPresenceMemberBytes` (#326).

### Test plan (binding)

`packages/realtime/tests/presence_snapshot_bound_339.test.ts`. It is written first, and must fail
against today's code.

1. **Pin the ceiling.** Create 250 members, each padded so `JSON.stringify(member)` is exactly 4096
   bytes; a 251st member joins last in driver order.
   - Assert `total === 251`, `members.length === 100`, and that the joiner is included.
   - Assert that `JSON.stringify(here.members)` encodes to **409 701** bytes, pinned as a literal,
     and that `MAX_PRESENCE_SNAPSHOT_MEMBERS === 100`.
   - Assert the encoded `subscribed` frame size as a literal.
2. **Configured bound.** Same room with `maxPresenceSnapshotMembers: 10`: **40 971** bytes.
3. **A room within the bound is unchanged.** Whole room, driver order, `total === members.length`.
4. **A re-join in a room over the bound** has the same shape as a first join, self included, and
   `members.length < total`.
5. **The local fallback is bounded.** `listMembers` rejects: `source: 'local'`, cut, self kept.
6. **A shared barrier read.** Gated double, over the bound: A issues read 1; B and C share read 2.
   B's snapshot holds B, C's holds C, and neither leaks the shared array or the other's self.
7. **Construction** refuses `0`, `1.5` and `NaN`.

Rows 1, 4 and 6 rely on "joins last in driver order", which only the memory driver and FakeRedis
guarantee. Each of those tests states that at its call site.

Plus unit rows for `boundPresenceSnapshot`, and the mutation battery
`tests/mutations/presence_snapshot_339.ts`:

| Mutant | Killed by |
| :--- | :--- |
| self kept → bare `slice` | rows 1 and 6 |
| `limit` → `limit + 1` | pinned byte count |
| `total` computed after the cut | row 1 |
| cut applied only on the authoritative branch | row 5 |
| default `100 → 101` | row 1's literal |

**Existing batteries.** Re-anchor `tests/mutations/presence_join_323.ts:241-243`: its anchor
`return await this.#closingRead(channel)` changes at all three exits. Then run
`deno task mutate presence_join_323 roster_sync_330 roster_read_barrier_333 presence_snapshot_339`.
The pre-completion gate never runs batteries, so this is an explicit review step.

**Unchanged by design:** the totals in `churn_cost_329.test.ts`. They are run and confirmed, not
edited.
**Scale/Scope**: rooms from 1 to unbounded members; 10 test files with 21 reader lines to migrate; zero readers outside the package

### Domain model

- **Bounded context**: realtime presence (`domain:realtime`).
- **Vocabulary**: roster (the whole membership a source reports), snapshot (what one subscribe
  returns), bound (K, `maxPresenceSnapshotMembers`), self (the subscribing connection's member),
  source (`authoritative` | `local`), total.
- **Entities**: `PresenceMember`, identified by `id` (existing, unchanged).
- **Value objects**: `PresenceSnapshot { members, total, source }` (new).
- **Invariants**:
  - `members.length <= K`.
  - `members.length <= total`.
  - `members.length < total` ⇔ the snapshot is partial.
  - If the roster holds self, `members` holds self.
  - `total` is the pre-cut roster size.
  - The roster array a snapshot was cut from is never mutated.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 No direct `hono` import | pass | Not touched |
| #2 JSR-only, declared per package | pass | No new dependency |
| #3 No `any` in exported APIs | pass | `PresenceSnapshot` is fully typed |
| #4 Tailwind v4 syntax | pass | No UI |
| #5 Pre-completion gate | pass | Full gate, plus the four mutation batteries named in §6 at review |
| #6 `deno.lock` untouched | pass | No dependency change |
| #7 JSDoc on public APIs | pass | FR-011: type, constant, option, wire `total` fields |
| #8 MVC layering | pass | Pure rule in its own module; manager only calls it |
| #9 Commit discipline | pass | `feat`/`test`/`docs` split at merge |
| #10 Public repo | pass | Nothing environment-specific |
| #11 Design → `architect-expert` | pass | Disposition recorded on #339 |
| #12 Act, don't recommend | pass | Chain runs through `tasks` → `implement` → `review` unprompted |
| TDD | pass | Measured-ceiling test written first, red on current code |
| No silent catches | pass | No new catch; truncation is not an error |
| Audits read the open backlog first | pass | Plan audits are told to read `domain:realtime` |

### Complexity tracking

No violation. The breaking removal of `members`/`rosterSource` is deliberate (FR-001): a compile
error is the migration signal. A flat additive `total` was rejected because it keeps compiling
while silently changing what `members` means.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public TS API | yes | `SubscribeResult.here` replaces `members`/`rosterSource` (break); new `PresenceSnapshot`, `MAX_PRESENCE_SNAPSHOT_MEMBERS`, option `maxPresenceSnapshotMembers` |
| Wire protocol (`protocol.ts`) | yes | Additive `total?` on `subscribed` and presence `here` |
| Browser `RealtimeClient` | no | Passes frames through as-is; never reads `members` |
| Driver seam (`listMembers`, Redis scripts/keys) | no | FR-010 |
| Control frames / MAC | no | Nothing published |
| In-code prose | yes | `manager.ts` JSDoc/comments at `:573-588`, `:1115-1117`, `:1144-1146`, `:1250-1253`, `:1283-1285`, `:1453-1454`; test messages `presence_join_compensation_323.test.ts:289-290`, `presence_rejoin_327.test.ts:184`; comment `presence_authoritative.test.ts:8` |
| Docs | yes | `docs/realtime.md` `:592-596` and `:617-621` (ceiling; the read stays O(room), #341), `:1036-1062` (example → `here`, the bound, keep-self, `total`, update-frame drift, UI hint not an access list, join-order window, one id per identity), the v0.4.0 intro `:1477-1479`, and new item 6; `packages/realtime/README.md:129-134`; `packages/realtime/AGENTS.md` (where-to-work row, FR-014 pitfalls, fix the stale "fallback is in `subscribe`" at `:377-393`, regenerated surface); `docs/testing.md:270` (battery count: 16 today, 17 after) |
| Prose that stays true: leave it | — | `docs/realtime.md:598-602` (only say "the `HGETALL` reply") and `:732-734`; `manager.ts:1777-1787`; `roster_read_barrier.ts:5-7`, `:48-50`; `churn_cost_329.test.ts:34,89,217,279,299` |
| Test readers | yes | 20 reader lines in 10 files → `here?.members` / `here?.source` |
| Other packages | no | Zero readers outside `@lockness/realtime` |

### Documentation (this feature)

```text
.specnaut/specs/258-presence-roster-ceiling/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A consumer counts `members.length` as the room size | The fields are removed, so every reader fails to compile; the migration item says to use `here.total` |
| Old deployed browser clients render K members as everyone | The wire is additive and nothing throws; the migration item (FR-012, S2) documents a **finite** interim `maxPresenceSnapshotMembers` K, costing K·(M+1)+1 bytes of member JSON per subscribe, lowered once clients read `total` — never "above the largest room", which would bring back the unbounded reply |
| A bare `slice` drops self on a shared barrier read | Test 6 (shared read, two joiners) plus a mutation row "self kept → bare slice" |
| The cut lands on only one roster source | Test 5 (local fallback) plus a mutation row |
| `total` computed after the cut | Pinned test plus a mutation row |
| The byte ceiling is exceeded when peers run a larger `maxPresenceMemberBytes` | Documented residue (K·(M_max+1)+1); not re-measured at read time, which would hide members (#326) |
| 0.4.0 is cut before this lands | It moves **whole** to 0.5.0; it is never split into additive-now, rename-later |
| `joined`/`left` drift outside the snapshot, and someone asks for a live `total` on those frames | Documented in the roster section; FR-014 records that `total` is a snapshot-time number (a per-frame count is the state #329 declined) |
| The instance still ingests O(room) per read | Out of scope; tracked as #341 (R1e). The docs say the reply is bounded and the read is not |
| An early joiner holding many sockets fills the K visible slots on join-ordered drivers (S1) | FR-015: documented as a UI hint rather than an access list, with the advice of one member id per identity. The ordering rule has a single home, so changing it later costs no migration. Not targetable on Redis (hash order) |
| The members shown change between re-joins on Redis (hash order), and someone adds a sort | Decision row "driver order kept, no sort"; JSDoc on the function |
| On a roster-less driver, self is kept through the local view rather than the roster | Covered by the lookup rule; the missing `joined` on that path is pre-existing, #342 |
| On a local view, one member with two tabs takes two slots and counts twice | Documented; deduping would change small-room results (SC-002), so #343 |
| The flat wire `presence` type also admits `total?` on `joined`/`left` | Accepted: same looseness `members?` already has; narrowing later is its own break |

## 10. Architecture audit

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 (HIGH) | The disposition's test plan and two issue criteria (a pin at a configured K, the 327 call-site comment) were missing; the #329 "no option" reasoning was dropped | Plan changed: §6 test plan (binding), SC-006, FR-013, #329 paragraph in §6 |
| A2 | The `presence_join_323` mutation anchor breaks; battery counts were wrong | Plan changed: re-anchor and the four-battery `mutate` run in §6; §7 wording; `testing.md:270` in §8 |
| A3 | Five decided rules had no decision row | Plan changed: rows for `String(id)` (extracted as `sameMemberId`, avoiding a cycle), "no extra command", internal function, driver order, and the per-caller spread |
| A4 | When self is looked up was unspecified; SC-003 overstated | Plan changed: the self row says "after the read settles, same statement as the cut"; SC-003 qualified |
| A5 | On a roster-less driver every first join takes the superseded exit; the edge case was wrong; the missing `joined` is a pre-existing defect | Plan changed: edge case and risk corrected. Defect filed as #342, not fixed here |
| A6 | The constant-only rule would let a `100 → 101` mutant survive | Plan changed: the measured-ceiling test is exempt and pins literals; battery row added |
| A7 | Prose impact undercounted | Plan changed: §8 lists every passage to change and every one to leave |
| A8 (LOW) | On a local view `total` counts connections | Plan changed: FR-005 wording, edge case and risk. Dedupe filed as #343 |
| A9 (LOW) | Homes right, but the return type re-declared the shape and importing the constant would create a cycle | Plan changed: return type `Omit<PresenceSnapshot, 'source'>`; cycle named in the constant's row |

**Verdict**: fail as delivered, with 1 HIGH and 6 MEDIUM, all plan edits and no redesign. Every
finding is applied above. Coverage: all of `plan.md`, the #339 disposition, the open realtime
items, and the cited ranges of `manager.ts`, `channel.ts`, `protocol.ts`, `mod.ts`,
`drivers/memory.ts`, the three existing batteries, `presence_roster_read_333.test.ts`, and the
realtime docs. Not covered: `drivers/redis.ts`, `client.ts`, `websocket.ts`, the body of
`roster_read_barrier.ts`.

## 11. Security audit

| # | Finding | What was done |
| :--- | :--- | :--- |
| S3 (MEDIUM, pre-existing) | Every presence subscribe still reads and parses the whole room on the instance (`redis.ts:1469-1495`, re-join exit `manager.ts:1305`); the barrier limits frequency, never size; CWE-770 | Accepted for this plan: not introduced and not worsened (SC-004, FR-010). Filed as #341; the docs say the reply is bounded and the read is not |
| S1 (LOW) | On join-ordered drivers, an early joiner holding many sockets (a `true` authorizer makes each socket a member) fills all K slots; late joiners never appear in later snapshots | Accepted and documented: FR-015 plus a risk row. The ordering rule has one home. Not targetable on Redis |
| S2 (LOW) | The rollout advice "set K above the largest room" brings back the unbounded reply | Plan changed: FR-012 requires a finite interim K with its cost formula and a note to lower it |

**Verdict**: needs follow-up, with no CRITICAL or HIGH. Access control is unchanged: only the
authorizer decides, before any read, and the cut can only remove members. `total` exposes nothing
new. Self cannot be chosen by a client. Coverage: `plan.md`, the #339 disposition, the #333
residues, `manager.ts` (caps, `SubscribeResult`, constructor, `subscribe`, `#joinPresence`,
`#closingRead`, `rosterSnapshot`), `protocol.ts`, `client.ts`, `websocket.ts` (connection id),
`drivers/memory.ts`, and `drivers/redis.ts` (`addMember`, `listMembers`). Not loaded: security
memory files `07` and `10`.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Approve the architecture: bounded `here: PresenceSnapshot`, `members`/`rosterSource` removed, additive wire `total?`, riding 0.4.0? | Approved, no veto | 2026-09-14 |
| Default bound K? | 100 (`MAX_PRESENCE_SNAPSHOT_MEMBERS = 100`) | 2026-09-14 |

### Decided without asking

- **The design:** the shape, K=100, the self rule, removing `members`/`rosterSource` and riding 0.4.0 are the `architect-expert` disposition on #339 (hard rule #11), not choices made here.
- **Which members stay:** driver order is accepted, with no relevance or join-time ordering, because no caller asks for one.
- **No paging:** no server-side way to read past K, because no caller asks for one.
- **The witness commit's red:** `0056b9a3` is red on a missing export, not on a behavioural assertion. The behavioural red evidence is the mutation battery `tests/mutations/presence_snapshot_339.ts`, where every row is killed. Accepted, because the type break is the contract change.
