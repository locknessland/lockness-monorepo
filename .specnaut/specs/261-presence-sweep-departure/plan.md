# Plan: announce a crashed instance's swept presence members as left

**Branch**: `261-presence-sweep-departure` | **Date**: 2026-09-22 | **Backlog item**:
[#348 — Realtime: a crashed instance's swept presence members are never announced as left](https://github.com/locknessland/lockness-monorepo/issues/348)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #348 (2026-09-15, hard rule #11); this plan records it as binding and adds what the
disposition left to the plan: the decision table, the requirements and the audits.

---

## 1. Why this exists

When a Redis-backed instance crashes, a surviving instance's reconcile pass sweeps the dead
instance's roster holds (`packages/realtime/drivers/redis.ts` `#reconcile` → `#sweepInstance`). The
authoritative roster is then correct, but **nobody tells the room**: `#sweepInstance` discards the
release script's reply, and no `left` frame or `presence-leave` control frame is sent.

An application that builds its member list from `joined` / `left` frames — a documented integration
style — keeps a **ghost for every member the crashed instance held**, until each subscriber
resubscribes and receives a fresh `here` snapshot. #344 made `left` per member and #345 made the
sweep reuse the release script, which already knows when a slot empties; the sweep throws that
answer away. The #344 disposition's product question P1 settled that a crash produces a plain
`left`.

**Who is affected:** multi-instance deployments on the Redis driver, when an instance crashes or its
liveness lapses. Single-instance deployments and the memory driver have no survivor to announce.

## 2. User scenarios

### US1 — a crash is announced once (P1)

**Given** member 7 is held only on instance A, and an observer is subscribed to the channel on B
**When** A dies without releasing, its liveness key expires, and B's reconcile sweeps A
**Then** the observer receives exactly one `left` for member 7, carrying A's last stored entry, and
every other instance's subscribers receive exactly one `left` too (via `presence-leave`).

### US2 — a member still held elsewhere is not announced (P1)

**Given** member 7 is held on A and on B
**When** A is swept
**Then** no `left` is sent anywhere; the roster keeps showing 7 through B's entry.

### US3 — two sweepers, one announcement (P1)

**Given** three instances, member 7 held only on A
**When** B and C both sweep A concurrently
**Then** every observer receives exactly one `left` for 7.

### US4 — a lapsed-but-alive instance (P2)

**Given** A is alive but its liveness lapsed, and B sweeps it
**When** A later releases 7, then later holds 7 again
**Then** the fleet sees one `left` (from the sweep), nothing on A's release, and one `joined` on A's
next hold — a `joined` that now follows a real `left`.

### Edge cases

- A driver without `onRosterDeparture` (memory, roster-less, third-party): unchanged, silent sweep.
- A driver with the method but the manager has no roster: the handler is never registered.
- The dead entry does not parse: one WARN, no frame, the release is still committed.
- The departure handler throws: one WARN naming the channel only; the sweep continues.
- The winning sweeper's publish fails: its local subscribers get `left`, one WARN, peers miss it
  (they heal on resubscribe).
- An ordinary leave: the handler is never called; the queued run announces as today.
- Mixed 0.3.0 / 0.4.0 fleet: a 0.3.0 sweeper announces nothing — at most one `left`, not exactly one.
- A crashed **0.3.0** instance wrote no holders entry: its release returns `0`, nobody announces.
- A holders entry whose member id is not the slot it was released from (corruption, a foreign or
  broker-level write): dropped with one WARN, no frame (A2/S1).
- A hold of the same member on the sweeper, committed right after the sweep's release: `left` then
  `joined`, in that order, on the bus and locally (A1, W8).

## 3. Requirements

- **FR-001**: `RELEASE_MEMBER_SCRIPT` replies with the released holder's stored entry (a bulk
  string) when its release empties the slot, and integer `0` otherwise. There is no third reply.
- **FR-002**: A new strict decoder `decodeReleaseReply` maps `0` → no departure and a non-empty bulk
  → the entry; every other reply (integer `1`, nil, array, empty bulk, error) throws.
  `decodeTransitionReply` becomes hold-only.
- **FR-003**: `releaseMember` keeps its public contract (`RosterRelease { gone }`), with
  `gone = entry !== undefined`. It **never** invokes the departure handler.
- **FR-004**: `#sweepInstance` hands every entry its release returned to the registered departure
  handler, parsed through `#parseRosterValue`, awaited one at a time. Before the handler it
  **drops** (one WARN naming the channel only, no frame, release stays committed) an entry whose
  owned-entry channel fails `isValidName`, whose value does not parse, or whose member id is not the
  slot it was released from (`sameMemberId(member.id, field)`) (A2, S1). A handler throw is the same
  single WARN; the loop continues. **No WARN on this path renders the entry, the member or a parser
  error message** — `#parseRosterValue`'s catch logs a fixed reason instead of `renderError(error)`,
  which fixes its `readRoster` caller too (S2: V8's `SyntaxError` quotes input bytes). There is **no
  I/O await between the release reply and the handler call** (A1).
- **FR-005**: The driver seam gains one **optional** member,
  `onRosterDeparture?(handler: (departure: RosterDeparture) => void | Promise<void>): void`, and one
  exported type `RosterDeparture { readonly channel: string; readonly member: PresenceMember }`,
  both from `mod.ts`. JSDoc: called only for a slot the driver emptied while releasing **another
  process's** hold.
- **FR-006**: `ChannelManager` registers the handler at construction **only when it has a roster**,
  via `this.driver.onRosterDeparture?.(…)`. The manager's handler **drops** (one WARN, channel only,
  never throws) a departure whose channel fails `isValidName` or whose member fails the receive-side
  member predicate (#346 id rule + plain-object `info`) — so a buggy third-party driver cannot emit
  locally what every peer would refuse (S3). The seam has **one handler, replaced on
  re-registration, dropped by `close()`** — the `onRevocationReconcile` precedent (A6).
- **FR-007**: The handler announces through `#announcePresence('left', …)` — the one announcement
  home — with `target` = the channel name, and **no await before that call** (A1).
  `#announcePresence`'s `origin: PresenceOrigin` parameter becomes `target: string`.
  `ControlMessage.target`'s JSDoc (`driver.ts`) is amended: acted on only for `evict` /
  `revoke-channel`; **informational** on `presence-join` / `presence-leave` (the announcing
  connection's id, or the channel for a driver-reported departure); no receiver may act on it (A3,
  S4).
- **FR-007a**: `decodeTransitionReply` is renamed `decodeHoldReply` and loses its `script` parameter
  (A7).
- **FR-007b**: The `RedisCommandClient` port's JSDoc states **one exchange in flight at a time** as a
  contract, since the ordering of FR-008 depends on it (A1).
- **FR-008**: The departure is **not** queued on the slot's roster tail (see decision table).
- **FR-009**: Exactly once per emptied slot across concurrent sweepers — from the script's atomicity
  alone: no lock, no leader, no new key family.
- **FR-010**: The Redis conformance suite (#285) pins, on fake **and** live broker, that the release
  reply is a bulk equal to the released entry when the slot is gone and integer `0` otherwise.
- **FR-011**: ADR 005 amends ADR 004 **§2** (release reply, sweep no longer ignores it), **§5**
  (loses "sweep removals announce nothing"; lapsed-instance bullet rewritten) and **§6** (the
  departure handler is the second caller of `#announcePresence`); ADR 004's Status line gains
  "amended by ADR 005 (§2, §5, §6)" with inline callouts, per ADR 003's convention (A9). ADR 005
  states that a swept `presence-leave` carries broker-sourced bytes (S1).
- **FR-012**: Docs, **every surface that states the old rule** (A4, counted by the audit):
  `docs/realtime.md` — "Ghost sweep" (what the room receives after a crash, and the latency: up to
  liveness TTL + reconcile interval, ~25 s by default, plus the burst on a large crash), "Writing a
  presence driver" (the optional callback and its lifecycle), the `joined`-frame promises (a crash
  is a second cause of a `left` with no `joined`), and "Upgrading to v0.4.0" item 8;
  `packages/realtime/AGENTS.md` pitfalls ("one strict decoder (1 / 0 / throw)", "return ignored",
  "`#syncRosterMember` is the only caller") and its battery list; the seven JSDoc blocks that become
  false (`redis.ts` ×5, `manager.ts` `#announcePresence`, `driver.ts` `ControlMessage.target`).
- **FR-013**: Mutation anchors that move are re-anchored and **re-proven live**: #345
  `presence_member_holds_345.ts` ×2, #344 `presence_member_transitions_344.ts` M4 (reason comment
  rewritten: it now dies because the decoder throws on nil), M7 and M11. The sweep names the
  released holder's entry `released`, not `entry`, so `sweep_parse_316.ts` keeps its anchors.
  The `roster_holders_345` FR-004a release-message assertion is updated.

## 4. Success criteria

- **SC-001**: After a crash of a **0.4.0** instance holding members no one else holds, and absent a
  lost control frame, every subscriber of the room on every surviving 0.4.0 instance receives
  exactly one `left` per such member.
- **SC-002**: No subscriber ever receives a `left` for a member another live instance still holds.
- **SC-003**: Any number of concurrent sweepers produce the same outcome as one.
- **SC-004**: Applications and third-party drivers that do not opt in see no behaviour change and
  need no code change.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Whether a release emptied the slot, and which entry left | `RELEASE_MEMBER_SCRIPT`, `packages/realtime/drivers/redis.ts` | an `HGET`/`HLEN` read before or after the `EVAL`; a `{gone, entry}` tuple; the sweep re-checking holders |
| What a release reply means (0 / entry / throw) | `decodeReleaseReply`, `packages/realtime/drivers/redis.ts` | a truthiness check on the reply; `decodeTransitionReply` still accepting release replies; `asBulk(reply) ?? …` inline in `#release` or `#sweepInstance` |
| A swept departure is reported to the manager | `#sweepInstance`, `packages/realtime/drivers/redis.ts` (the only caller of the handler) | `releaseMember` or `#release` calling the handler; the driver publishing `presence-leave` itself |
| A roster entry's member is decoded | `#parseRosterValue`, `packages/realtime/drivers/redis.ts` | a second `JSON.parse` of the entry in the sweep |
| A departure names the slot it emptied, on a valid channel | `#sweepInstance`, `packages/realtime/drivers/redis.ts` (asks `sameMemberId` from `presence_snapshot.ts` and `isValidName` from `protocol.ts`) | the check only in the manager (it does not know the slot); a refactor of `readRoster`'s S3 check into a shared helper in this change (anchors) |
| A decode failure never logs entry bytes | `#parseRosterValue`'s catch, `packages/realtime/drivers/redis.ts` | `renderError(error)` on a `JSON.parse` failure anywhere on the roster path |
| A reported departure is well-formed before any emit | the manager's departure handler, `packages/realtime/manager.ts` (asks `isValidName` and the #346 member predicate) | an emit that trusts the driver; the check copied into `#announcePresence` |
| What a well-formed wire member is (#346 id rule, plain-object `info`, at most `id` + `info` keys) | `packages/realtime/protocol.ts` — one predicate, asked by Redis `isPlainMember` and by the manager's departure handler (amended 2026-09-23: the implementation found the manager spelling the `info` rule inline and missing the key-count bound, so a driver-reported member peers refuse could still be emitted locally — S3's gap) | the rule inline in `manager.ts`; `isPlainMember` keeping its own copy |
| The handler's lifecycle (one, replaced, dropped on `close()`) | `onRosterDeparture` in `packages/realtime/drivers/redis.ts`; contract in `driver.ts` JSDoc | a handler list; a registration that survives `close()` |
| What `target` means on a presence control frame | `ControlMessage.target` JSDoc, `packages/realtime/driver.ts` | a receiver branch reading `target` on `presence-*`; a new field |
| The Redis command client runs one exchange at a time | `RedisCommandClient` JSDoc, `packages/realtime/drivers/redis.ts` (implemented by `@lockness/redis`) | pipelining; a second command client for the sweep |
| Whether the manager listens for departures | `ChannelManager` constructor, `packages/realtime/manager.ts` | a roster check inside the handler; registering without `?.` |
| A `joined` / `left` is announced (local emit + control publish) | `#announcePresence`, `packages/realtime/manager.ts` | an `emitPresence(... 'left' ...)` or `publishControl({ kind: 'presence-leave' })` in the handler or anywhere outside `#announcePresence` / `handleControl` |
| `left` precedes an in-flight hold's `joined` | enforced in three places, one decision: `#sweepInstance` (no I/O await between release reply and handler), the manager's handler (not on the slot tail, no await before `#announcePresence`), `RedisCommandClient` (one exchange in flight). Pinned by W8, M8, M9 | routing the departure through `#syncRosterMember` / `#rosterTails`; an `await` added before the handler; pipelining |
| Exactly-once across sweepers | `RELEASE_MEMBER_SCRIPT` atomic read-and-delete of the dead holder's entry | a `SET NX` sweep lock, a leader, a dedupe set |
| The seam's shape (`RosterDeparture`, `onRosterDeparture?`) | `packages/realtime/driver.ts` | a structurally identical inline type in `redis.ts` or `manager.ts` |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary Dependencies**: `@lockness/realtime` only
(Redis via the package's own RESP client) · **Storage**: Redis presence hash, per-slot holders hash,
per-instance owned set (ADR 004) · **Testing**: `deno test`, FakeRedis, live-broker conformance
(#285), mutation harness `tests/mutations/harness.ts` · **Target**: server library · **Project
type**: framework package · **Performance** (counted, A5): per exclusively-held member of the dead
instance, the sweeper now does the release `EVAL` **plus one `PUBLISH`** on the shared command
client and one HMAC; each peer does one verify and one replay-window entry. K such members → 2K
round trips instead of K, and the sweeper's other commands queue behind them. Same cost in kind as
a graceful mass unsubscribe · **Constraints**: no wire-format change for control frames (0.3.0 peers
must still apply `presence-leave`) · **Scale**: one handler call per emptied slot per sweep.

### Domain model

- **Bounded context**: realtime — presence, Redis ghost sweep.
- **Vocabulary**: *ghost sweep*, *swept-gone member* (a slot with no holder left after the sweep
  released the dead instance's hold), *surviving instance*, *departure*, `left` / `presence-leave`.
- **Entities**: `RedisBroadcastDriver` (owns the roster and the sweep); `ChannelManager` (owns every
  announcement).
- **Value objects**: `RosterDeparture(channel, member)` — new; `RosterRelease(gone)` — unchanged;
  `PresenceMember(id, info)`.
- **Invariants**: one departure → one `left`, crash included; a sweep never announces a member
  another live instance holds; an announcement never claims a departure the roster did not record;
  the seam change is optional.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | `RosterDeparture` fully typed |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | required per task |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | `RosterDeparture`, `onRosterDeparture` with `@example` |
| MVC layering | pass | driver reports, manager announces |
| Commit discipline | pass | fix/test/docs split |
| No environment detail in versioned files | pass | none |
| Design decisions → architect-expert | pass | disposition 2026-09-15 |
| Act, don't recommend | pass | — |
| TDD, red first | pass | W1, W3, W5 red on main before the fix |

### Complexity tracking

None.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | yes | + optional `onRosterDeparture?` on the driver seam, + `RosterDeparture` type (non-breaking) |
| Redis driver internals | yes | release script reply, new decoder, sweep hands entries on |
| Control-plane wire format | semantics yes, bytes no | `presence-leave` bytes unchanged; `target` = channel name passes `isValidName`; `ControlMessage.target` JSDoc amended (informational on presence frames) |
| Client (WebSocket) frames | yes (behaviour) | subscribers now receive `left` after a crash |
| Memory driver / roster-less drivers | no | — |
| Docs | yes | `docs/realtime.md`, `packages/realtime/AGENTS.md`, `docs/adr/005-…` |

### Documentation (this feature)

```text
.specnaut/specs/261-presence-sweep-departure/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A `left` sent while the member is in fact present (ordering with an in-flight hold) | departure not queued on the tail, no await before the handler, one command exchange in flight (FR-008); **W8** runs FakeRedis behind a serializing command wrapper and pins `left` → `joined`; M8, M9 |
| A large crash (K ≫ 1) bursts K `presence-leave`s; above the per-origin share of the replay window's 10 000 cap, peers WARN and evict that origin's oldest nonces (a replay is a duplicate `left`) | **accepted** — bounded by what the dead instance legitimately held; batching needs a new kind/field, rejected for 0.3.0 peers; documented in "Ghost sweep" (A5, S5) |
| A broker-level writer forges a swept entry that the sweeper signs into a MAC-valid `presence-leave` | slot-binding and channel checks drop it (FR-004); residue: such a writer already controls the unsigned data plane (S1) |
| Overlapping reconcile passes (no reentrancy guard) double the sweep's work | accepted — exactly-once still holds; perf only |
| A second announcement home creeps in | decision table row + ADR 005 §6; M3 kills a `releaseMember` caller |
| The reply change breaks a caller of `decodeTransitionReply` | FR-002 splits decoders; FR-004a rows; conformance on the live broker |
| A handler throw aborts the sweep, stranding other holds | FR-004 WARN-and-continue; W7 |
| Existing mutation batteries (#345, #344) lose anchors | re-anchor and re-prove live (task) |

## 10. Architecture audit

*`architect-expert`, 2026-09-22, against this document before any code. Verdict at audit time:
**fail — 1 HIGH, 4 MEDIUM, 4 LOW**, every one a plan edit; none reopens the disposition.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 HIGH | The `left`-before-`joined` ordering rests on one command in flight and no I/O await before the handler; no test checks it (FakeRedis settles instantly), and W5 is sequential | Plan changed: decision row rewritten naming its three enforcement points; FR-004/FR-007 "no await"; FR-007b states the client contract; **W8** (serializing FakeRedis wrapper, hold committed right after the sweep's release) + **M8** (departure chained on the slot tail) + **M9** (extra `PING` await before the handler); risk row points at W8 |
| A2 MED | A departure's member id is never checked against the slot emptied | Plan changed: new row + FR-004 drop via `sameMemberId(member.id, field)`; W7 case + mutant **M10**; no shared-helper refactor (anchors) |
| A3 MED | `target` = channel changes `ControlMessage.target`'s documented meaning | Plan changed: new row, FR-007 JSDoc amendment, §8 "semantics yes, bytes no" |
| A4 MED | Blast radius undercounted: 5 mutation rows move (+#344 M7, M11), 6 doc surfaces + 7 JSDoc blocks | Plan changed: FR-012 and FR-013 list them; sweep variable named `released`; #344 M4 reason rewritten |
| A5 MED | "No new round trip" is wrong: +1 PUBLISH per departure, replay-window cap on large K | Plan changed: §6 counted cost; risk row accepted explicitly |
| A6 LOW | Handler re-registration, `close()` and failure containment unstated | Plan changed: new row + FR-006 |
| A7 LOW | `decodeTransitionReply` keeps a name and parameter that no longer fit | Plan changed: FR-007a rename to `decodeHoldReply`, drop `script` |
| A8 LOW | SC-001 false for a 0.3.0 crash and a lost frame | Plan changed: SC-001 scoped; edge case added |
| A9 LOW | ADR 004 §2 also states the old rule | Plan changed: FR-011 amends §2, §5, §6 with ADR 003's convention |
| A10–A12 | Script reply shape, split decoder, seam/registration/narrowing, not queuing on the tail | Accepted as is |
| (note) | On a lapsed instance, 7's own open tabs receive the swept `left` (it excludes nobody) and never the later `joined` (it excludes their member id) until they resubscribe | Out of this plan — **appended to #349**, whose disposition owns the lapsed-alive case |

**Coverage**: plan.md in full; every named code path; all 24 realtime mutation batteries grepped for
anchors in the changed regions; the harness's dead-anchor rules; FakeRedis vs `RedisClient`
scheduling; ADR 003/004; the listed doc surfaces. Not covered: live broker behaviour, the control
plane's security (security seat), the memory driver, `docs/architecture.md` (no dependency change).

## 11. Security audit

*`security-expert`, 2026-09-22, in parallel. Verdict: **needs follow-up — 0 CRITICAL/HIGH/MEDIUM,
2 LOW, 3 INFO**; confirms #349.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 LOW | Broker-sourced swept bytes are signed into a MAC-valid `presence-leave` without being bound to their slot or name-checked — a broker writer can make a sweeper announce `left` for a live member (breaks SC-002) | Plan changed: FR-004 drops on `isValidName(channel)` failure and on `sameMemberId(member.id, field)` failure (shared with A2); witness in W7; ADR 005 states the provenance. Residue: that writer already owns the unsigned data plane |
| S2 LOW | `#parseRosterValue`'s parse-failure WARN quotes entry bytes (V8 `SyntaxError`) — an email-style member id reaches the log | Plan changed: new row; fixed-reason WARN at the one decode site (fixes `readRoster` too); witness asserts the bytes never appear |
| S3 INFO | The public `onRosterDeparture` seam has no manager-side check; a buggy driver could emit locally what peers refuse | Plan changed: FR-006 manager-side drop (channel name + #346 member predicate + plain `info`); forging by a malicious driver accepted — a driver is trusted code and already feeds `onControl` |
| S4 INFO | `target` = channel contradicts `ControlMessage.target`'s doc | Plan changed: FR-007 JSDoc amendment (same as A3) |
| S5 INFO | Large owned set → burst; over the replay window's per-origin share, peers evict that origin's nonces | Accepted, documented (same as A5) |

**Coverage**: triage + injection/input, logging, design/business-logic catalogues; the release and
hold scripts, `#release`, `#parseRosterValue`, `#verifyAndDecode` (MAC, replay, `isValidName` on
target/origin/channel), `#reconcile` / `#sweepInstance`, the manager's announce and control paths,
the replay window, and v0.3.0's `presence-leave` branch. Not loaded: access-control, data-protection
and language-footgun catalogues.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Should a swept departure carry a distinct reason (crash vs leave)? | No — #344 P1 settled a plain `left`; nothing asks for a reason | 2026-09-15 |
| Approve the architecture as audited (tasks → implement → review)? | Approved by the maintainer at stop 1 | 2026-09-23 |

### Decided without asking

- The design shape — settled by the #348 `architect-expert` disposition (2026-09-15); not re-opened.
- Crash latency is documented, not reduced — the disposition's residue; #349 owns the lapsed-alive
  re-hold.
- Witness and mutant lists are the issue's acceptance criteria (W1–W7, M1–M7), taken as written,
  plus the audits' **W8** and **M8–M10**.
- Every audit finding was folded into the plan or accepted with its reason (§10, §11); none reopened
  the disposition, so none became a question.
