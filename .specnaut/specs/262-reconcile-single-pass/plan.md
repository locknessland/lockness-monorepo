# Plan: one Redis reconcile pass at a time, sweeping only while the target is dead

**Branch**: `262-reconcile-single-pass` | **Date**: 2026-09-23 | **Backlog item**:
[#355 — Realtime: run one Redis reconcile pass at a time, sweep only while the target is dead, and count only effective releases](https://github.com/locknessland/lockness-monorepo/issues/355)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #355 (2026-09-23, hard rule #11, decided together with #349); this plan records it
as binding and adds what the disposition left to the plan: the decision table, the requirements,
the counted blast radius and the audits (whose two binding rulings, A3 and A4, are folded in). It
lands **before** #349, which depends on FR-005.

---

## 1. Why this exists

`RedisBroadcastDriver` starts its ghost sweep with a bare
`setInterval(() => this.#reconcile(), reconcileIntervalMs)` (`packages/realtime/drivers/redis.ts`
`#ensureSweepStarted`). A pass slower than the interval — a slow broker, and the command client
runs one exchange at a time — gets a second pass started beside it, then a third. Measured in the
#354 review: one FakeTime `tickAsync(3_500)` fired **three** passes over one dead instance and logged
three "released 1 hold(s)" lines for one departure. Exactly-once holds (the release script is
atomic); the **load** multiplies on the broker that is already the reason the pass was slow.

Three defects, one incident:

- **Overlap.** K passes in flight issue K× the `SMEMBERS` / `EXISTS` / `EVAL` / `SREM`.
- **A dishonest log.** `#sweepInstance` counts every `#release` call whatever it answered, so an
  overlapping pass that removed nothing still logs `released N hold(s) of dead instance <id>` — the
  operator reading WARNs during a slow-broker incident sees one crash as several sweeps.
- **A stale precondition.** `#reconcile` reads `EXISTS alive:<id>` **once**, then keeps releasing.
  An instance that was only lapsed and renews mid-sweep keeps losing holds, and the final
  `SREM instancesKey deadId` deregisters a live instance (ADR 004 §5 residue).

**Who is affected:** multi-instance deployments on the Redis driver — operators during broker
slowness, and every room whose lapsed-but-alive instance loses holds it would have kept.

## 2. User scenarios

### US1 — a slow broker gets one pass, not a pile-up (P1)

**Given** instance B sweeps dead instance A and every broker command is slow
**When** two reconcile intervals elapse while B's pass is still waiting on the broker
**Then** B has exactly one pass in flight; when it finishes, one departure and one "released" line.

### US2 — the log counts what was removed (P1)

**Given** A's owned set lists three entries: one A held alone, one also held by a live peer, one
already released by another sweeper
**When** B sweeps A
**Then** one line: 2 hold(s) released, 1 emptied its slot. A sweep that removed nothing logs nothing.

### US3 — a lapsed instance that renews stops being swept (P1)

**Given** A's liveness lapsed and B's pass has released A's first slot
**When** A renews its liveness before B's second release
**Then** that release is refused, A's second slot is still held, A stays registered, exactly one
`left` went out (the first slot), and B logs one line saying A renewed — a lapse, not a crash.

### US4 — shutting down mid-sweep (P2)

**Given** B's pass has a release in flight
**When** the application calls `B.close()`
**Then** `close()` resolves only after that release settles, its departure is still announced, and
no further sweep command is issued.

### US5 — one bad instance does not starve the others (P2)

**Given** two dead instances, and the first one's owned set cannot be read
**When** B's pass runs
**Then** one WARN names the first instance and what was released before the failure; the second is
swept in the same pass; the first stays registered and is retried next pass.

### Edge cases

- The pass's instance-set read, or an instance's `EXISTS`, rejects: `#reconcile`'s outer catch logs
  today's one WARN, and the next interval's pass runs.
- Anything thrown while sweeping one instance (a rejected owned-set read, a broker error, a reply
  the decoder does not know — integer `1`, nil, array, empty bulk): one WARN
  `sweep of dead instance <id> failed after N hold(s) released (E emptied): <error>`, no
  deregistration of that instance, and the pass goes on to the next (A3).
- A refused reply on the **first** release: the "renewed" line says 0 released; no "released" line.
- A renews **after** its last release, before deregistration: it stays registered, and the
  "renewed" line is logged instead of the "released" line.
- Every entry already released by another sweeper (N = 0): no "released" line; A is still
  deregistered.
- `close()` before the sweep ever started, during the boot heartbeat, or called twice: nothing is
  armed after it, idempotent.
- `close()` cuts a sweep short after it removed N > 0 holds: the one "released" line still reports
  N and E; cut short before any removal (N = 0): no line (amendment 2026-09-23, FR-012).
- A lapsed instance **holds** a new slot between the sweep's owned-set read and its deregistration:
  its owned set is not empty, so deregistration answers *kept* — A stays registered and the next
  pass releases that hold (A4; the ADR 004 §5 residue is closed).
- An owned entry the sweep skips as unparsable (`!entry`, `sep < 0`) keeps a dead instance
  registered — re-read every pass, never deregistered (A4 residue).
- Mixed `0.3.0` / `0.4.0` fleet: a `0.3.0` sweeper has no liveness check, releases a renewed
  instance and deregisters with a raw `SREM`.
- Two **different** instances sweeping the same dead one: both still read and `EVAL` every entry;
  one gets each entry (unchanged).

## 3. Requirements

**Scheduling**

- **FR-001**: One method, `#armReconcile()`, is the **single** place the sweep timer is armed. It
  returns without arming while `#closing` is set; otherwise it arms one
  `setTimeout(reconcileIntervalMs)` whose callback stores the pass in `#reconcilePass`, runs
  `#reconcile()`, and in the pass's `finally` clears `#reconcilePass` and calls `#armReconcile()`
  again. `#armReconcile` — not `#reconcile` — owns `#reconcilePass`. No `setInterval` drives the
  sweep and no in-flight flag exists. `reconcileTimer` is typed as a timeout handle. FakeTime
  `tickAsync` fires a callback without awaiting its promise, so one `tickAsync(k × interval)` now
  runs **one** pass, not k (A6).
- **FR-002**: `#ensureSweepStarted` awaits the boot heartbeat, then arms the heartbeat interval
  **only if `#closing` is unset**, and calls `#armReconcile()` for the first pass (A2, S2).
  `#reconcile` has exactly **one** caller, the callback armed by `#armReconcile` (search:
  `grep -n '#reconcile(' packages/realtime/drivers/redis.ts`). The reconnect trigger and its retry
  stay on the revocation reconcile.
- **FR-003**: `close()` runs, in order (A1): set `#closing`; clear the reconcile, heartbeat,
  revocation and retry timers; drop `revocationHandler` **synchronously**, as today; **await
  `#reconcilePass`**; drop `#departureHandler`; close the owned resources. Idempotent.
- **FR-004**: The pass reads `#closing` **synchronously at three points and nowhere else**: at the
  top of `#reconcile`'s per-instance loop body, **before** that instance's `EXISTS` (A7); before
  each release and before deregistration (`#sweepInstance`). Set → the pass returns. **No check
  sits between a release's reply and the departure handler call**, so #348's W8, M8 and M9 hold, and
  an in-flight release's departure is announced.
- **FR-004a**: `#sweepInstance` wraps one instance's sweep in its own `catch` (A3, S1a): a throw
  ends that instance's sweep with **one** WARN (FR-012), no deregistration, and the pass continues
  with the next instance. `#reconcile` keeps its outer catch for the instance-set read and the
  per-instance `EXISTS` only.

**The sweep writes only while its target is dead**

- **FR-005**: `RELEASE_MEMBER_SCRIPT` declares a fourth key, `KEYS[4]` = the liveness key of
  **`releaserId`**, built by `#release` as `this.aliveKey(releaserId)` and nowhere else (S5), and a
  fourth argument, `ARGV[4]` = `'1'` when the caller asks for the liveness check, `'0'` otherwise.
  Its **first** statements are
  `if ARGV[4] == '1' then` / `local alive = redis.call('EXISTS', KEYS[4])` /
  `if alive == 1 then` / `return <REFUSED>` / `end` / `end` — refused **before any read or write**.
  The rest of the body is unchanged except its tail: after the `shown == mine` promotion block,
  `if mine == false then` / `return 0` / `end` / `return <KEPT>`. The absent test goes **after**
  the promotion so a non-holder's release still restores a missing shown field (AGENTS.md pitfall).
  It stays one script (ADR 004 rejected a second release script).
- **FR-006**: `#release` takes an explicit boolean saying whether the release is on another
  process's behalf. `#sweepInstance` is the **only** caller passing `true`; `releaseMember` passes
  `false`. `#release` never derives it from `releaserId !== this.instanceId`.
- **FR-007**: The final `SREM instancesKey deadId` becomes `DEREGISTER_INSTANCE_SCRIPT`, which
  deregisters only while the instance is **dead and owns nothing** (A4): `KEYS[1]` instances set,
  `KEYS[2]` the dead instance's liveness key, `KEYS[3]` its owned set, `ARGV[1]` its id —
  `local alive = redis.call('EXISTS', KEYS[2])` / `if alive == 1 then` / `return <REFUSED>` /
  `end` / `local owns = redis.call('EXISTS', KEYS[3])` / `if owns == 0 then` /
  `redis.call('SREM', KEYS[1], ARGV[1])` / `return 0` / `end` / `return <KEPT>`. `EXISTS`, not
  `SCARD`: Redis deletes an emptied set, FakeRedis models that, and `SCARD` is not modelled. Its
  reply is decoded strictly by `decodeDeregisterReply`, beside it: `0` → deregistered, `REFUSED` →
  renewed, `KEPT` → a late hold, left for the next pass; anything else throws.
- **FR-008**: Both scripts stay inside the subset `packages/redis/tests/lua_eval.ts` evaluates today:
  nested `if … == … then`, no `~=`, `and`, `or`, `not`, `else`, unary minus, no call as a comparison
  operand. **No change to `@lockness/redis`.** Template literals appear **only** on the script lines
  that hold `KEPT` / `REFUSED` (A7); every other line keeps its current quoting, so surviving
  mutation anchors keep matching.
- **FR-008a**: `#heartbeat` writes the liveness key (`SET alive … EX`) **before** `SADD instances`,
  and still attempts the `SADD` when the `SET` failed; one WARN per failed beat (A4, S3). This keeps
  #310's live scenario: an instance whose `SET` fails stays registered and is not swept by itself.

**The reply names four outcomes**

- **FR-009**: The release reply is a closed set: a non-empty bulk = **emptied** (the entry), integer
  `KEPT` = **kept**, integer `0` = **absent**, integer `REFUSED` = **refused**. `KEPT = 2` and
  `REFUSED = 3` are two named constants in `redis.ts`, interpolated into both scripts and read by
  both decoders — one spelling each. **Never `1`** (the #348 FR-004a test pins integer 1 as a reply
  that must throw), never negative.
- **FR-010**: `decodeReleaseReply` returns an internal, **unexported** discriminated union
  `ReleaseOutcome` = `{ kind: 'emptied', entry }` | `{ kind: 'kept' }` | `{ kind: 'absent' }` |
  `{ kind: 'refused' }`, and stays the only place a release reply is given meaning. Every other
  reply throws. **Both decoders' error messages are constant**: they name the accepted shapes and
  never include the reply, its type or its length (S4).
- **FR-011**: `releaseMember` maps `emptied` → `gone: true`, `kept` / `absent` → `gone: false`, and
  **throws a constant message** on `refused` (a leave never asks for the check, so the reply is a
  defect). `RosterRelease` (`driver.ts`), the seam and `mod.ts` do not change.

**Counting and logging**

- **FR-012**: `#sweepInstance` counts N = emptied + kept and E = emptied, and logs **exactly one**
  WARN per swept instance, or none:
  - completed and deregistered (or *kept* by deregistration), N > 0:
    `realtime: released N hold(s) of dead instance <id> (E emptied their slot)` — the substring
    `hold(s) of dead instance` is kept; N = 0 → no line;
  - **cut short by `close()`** (a closing check before a release or before deregistration fired),
    N > 0: the same "released" line — the honest count covers every hold removed, whatever stopped
    the sweep; N = 0 → no line, as before (*amended 2026-09-23 by the coordinator*: the plan as
    approved left a close-interrupted sweep silent, which under-reported removals to the operator);
  - a release or the deregistration answered *refused*: the sweep of that instance stops (no
    further release, no deregistration) and logs
    `realtime: instance <id> renewed its liveness while being swept — a lapse, not a crash; N hold(s) released (E emptied) before it did`;
  - a throw (FR-004a):
    `realtime: sweep of dead instance <id> failed after N hold(s) released (E emptied): <renderError>`.

  Ids go through `safeForLog`. The pass moves on to the next instance in every case.
- **FR-013**: The heartbeat stays an **unguarded `setInterval`** — FR-002's closing check gates
  only its arming, it is not an in-flight guard. The revocation timer is unchanged.

**Tests, anchors, docs**

- **FR-014**: Witnesses (§4) in a new `packages/realtime/tests/reconcile_single_pass_355.test.ts`;
  W1, W2, W4, W5, W6, W6b, W7 committed red on `main` first. WD extends the #348 FR-004a test in
  `roster_holders_345.test.ts`; WC extends the #285 conformance suite (FakeRedis **and** live
  broker). **Scheduling lands first**: 12 test files (the audit's count) drive the sweep clock with `tickAsync`, and
  under FR-001 one tick runs one pass; the scheduling task records which of them change and why
  (A6).
- **FR-015**: Existing tests this change makes wrong are repaired, not weakened:
  - `presence_sweep_departure_348.test.ts` **A6**, second half ("close() drops it even mid-sweep")
    asserts the **reverse** of W4 and would now deadlock (it awaits `close()` before opening the
    gate). Rewritten as: registration replaces; `close()` drops the handler; the mid-sweep case is
    W4's.
  - **#348 W8**'s `holdIssued` predicate matches on `args[2] === '4'`, which the release now also
    declares. Re-keyed to B's hold (B's owned key / not A's owned key); its assertions unchanged.
  - `prefix_anchoring.test.ts` `CANNED.EVAL` (`numkeys >= 3 → 0`) already answers the 3-key
    deregistration; only its comment ("the release script 3") is updated.
  - `roster_holders_345.test.ts` FR-004a expected message follows FR-010.
- **FR-016**: Mutation battery `packages/realtime/tests/mutations/reconcile_single_pass_355.ts`,
  every row proven live — the §4 mutant table. **Re-anchor list** (counted on `main` 6a828c09 by
  evaluating every battery's `edits` against `redis.ts`; confirmed by the architecture audit):
  **20 rows in 6 batteries**.
  - *Anchor text replaced — repair or subsume* (8): `presence_member_holds_345` "sweep goes back to
    a raw presence HDEL", "sweep releases with its OWN id", "sweep DELs the dead instance's owned
    set again" (anchor: the `SREM` line); `presence_sweep_departure_348` M1, M4 (anchor: the sweep's
    `#release(channel, field, deadId)` call), M2 (the tail `'end', 'return 0'` becomes the kept
    code — rewritten as "the kept reply answers the entry"), M3 (`gone: released !== undefined`),
    M7 (`if (entry) return entry`).
  - *Anchor survives, code under it changed — re-prove live* (7): `presence_member_holds_345` the
    four release-script rows (holders `HDEL`, presence `HDEL` at `n == 0`, `shown == mine` guard,
    copy branch); `presence_member_transitions_344` M4 (still dies on the decoder's nil throw);
    `self_skip_310` (the heartbeat reorder, FR-008a); `presence_sweep_departure_348` **M12**
    ("close() keeps the departure handler") — once `close()` awaits the pass, the pass stops on
    `#closing`, and `#armReconcile` never arms while closing, nothing can call the handler after
    `close()`: it becomes `expectSurvival` with that falsifiable reason, never deleted
    (`docs/testing.md`).
  - *Anchor intact unless the implementer moves the line* (5): `presence_sweep_departure_348` M9,
    M10; `sweep_parse_316` ×2; `revocation_retry_308` "close() stops clearing the pending retry"
    (inside the reordered `close()`).
- **FR-017**: Docs: **ADR 006** (new) — a sweep writes only while its target is dead, decided inside
  each write; deregistration also requires an empty owned set; the release reply names four
  outcomes; amends ADR 004 §2, §5 and ADR 005 §2, §5 (overlapping passes **closed**; the
  deregistration residue **closed**; lapsed-instance bullet narrowed), with Status-line and inline
  callouts per ADR 003's convention. It states the residues: an unparsable owned entry keeps a dead
  instance registered; a `0.3.0` sweeper still deregisters with a raw `SREM`; an owned set too
  large for one reply is never swept (filed separately). `docs/realtime.md` "Ghost sweep": one pass
  at a time, what N and E mean, no line at 0, the "renewed" and "failed" lines, the crash `left`
  latency bound (liveness TTL + reconcile interval **+ one pass**), and that `close()` can wait up
  to two broker round trips plus one departure-handler call (S6). `packages/realtime/AGENTS.md`:
  strict-decoder pitfall (four replies, two decoders), sweep bullet, heartbeat order, battery list.
  JSDoc: `RELEASE_MEMBER_SCRIPT`, `DEREGISTER_INSTANCE_SCRIPT`, `decodeReleaseReply`,
  `decodeDeregisterReply`, `#release`, `releaseMember`, `#sweepInstance`, `#reconcile`,
  `#armReconcile`, `#ensureSweepStarted`, `#heartbeat`, `close`. The two existing comments that
  claim `tickAsync` awaits a timer callback's promise (`#ensureSweepStarted`, the revocation timer)
  are corrected (A6). No numbered upgrade item.

## 4. Success criteria

- **SC-001**: However slow the broker, one driver never has more than one sweep pass in flight.
- **SC-002**: The "released" line's N equals the holds actually removed and E the departures
  announced; a sweep that removed nothing logs nothing.
- **SC-003**: An instance that renews while being swept keeps every hold not yet released, stays
  registered, and the operator sees exactly one "renewed" line.
- **SC-004**: Once `close()` resolves, the driver issues no sweep command and runs no revocation
  handler, and a release already in flight still has its departure announced.
- **SC-005**: One instance that cannot be swept never stops the others from being swept.
- **SC-006**: No instance that still owns a hold is deregistered.
- **SC-007**: No application or third-party driver needs a code change; the public seam is
  byte-identical.

**Witnesses** (FR-014):

| # | Setup → assertion |
| :--- | :--- |
| W1 (red) | Serialized FakeRedis; the dead instance's owned-set `SMEMBERS` gated; two reconcile intervals elapse → one owned-set `SMEMBERS`, no second instance-set `SMEMBERS`. Gate opened → one departure, one "released" line |
| W2 (red) | One sweep over emptied + kept (live peer) + absent → "2 hold(s) … (1 emptied …)"; an all-absent sweep → no "released" line |
| W3 (guard) | Instance-set read rejects → one WARN; the next interval's pass sweeps |
| W4 (red) | (i) first of two releases gated, `close()` called → `close()` pending until it settles; its departure announced; no second release. (ii) last release gated → no deregistration. (iii) a second dead instance → no `EXISTS` or owned-set `SMEMBERS` for it. (iv) after `close()` resolves, two more intervals elapse → no command. (v) `close()` while the boot heartbeat is gated → after it resolves, two intervals elapse → no command (no heartbeat, no pass). (vi) a subscriber reconnect fires while `close()` awaits a gated release → the revocation handler does not run, and no retry timer is pending after `close()` resolves |
| W4 (vii) (amendment, red) | `close()` while the first of two releases is in flight → exactly one "released" line with N = 1 (E = 1); `close()` during the last release → one line with N = 1 and no deregistration; `close()` while the owned-set read is gated → no line (N = 0) |
| W5 (red) | A lapses, B sweeps; B's second release gated, A's key renewed → *refused*, B stops; A's second slot held; A still registered; one `left` total; one "renewed" line, no "released" line |
| W6 (red) | All A's releases done; deregistration gated, A's key renewed → A still registered; one "renewed" line |
| W6b (red) | All A's releases done; while A is still lapsed, a hold of A lands between the owned-set read and the deregistration → A still registered, no "renewed" line; the next pass releases that hold and deregisters A |
| W7 (red) | Two dead instances; the first's owned-set `SMEMBERS` rejects → one "failed" WARN naming it, it stays registered; the second is swept and deregistered **in the same pass** |
| WD | Each of the four release replies and three deregistration replies decodes; integer 1, nil, an array, an empty bulk throw; an array reply carrying a marker string → the message lacks the marker; *refused* on `releaseMember` throws its constant message |
| WC | #285 conformance, fake and live broker: each of the four release replies and the three deregistration replies |
| — | #348 W8, M8, M9 green (W8's predicate re-keyed only, FR-015) |

**Mutants** (FR-016), each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| M1 | the sweep re-armed with `setInterval` again | W1 |
| M2 | the re-arm moved into `#reconcile`'s `try`, after the loop (A5) | W3 |
| M3 | an *absent* reply counted | W2 |
| M4 | *kept* not counted | W2 |
| M5 | the liveness check dropped from the release script | W5 |
| M6 | the check applied to a leave too (`releaseMember` passes `true`) | the #344 leave witnesses and `roster_holders_345` W1 — a leave of a held slot is refused |
| M7 | the sweep asks with `false` (S5) | W5 |
| M8 | `KEYS[4]` is the sweeper's own liveness key (S5) — every release refused, the sweep jammed | W2 |
| M9 | deregistration without the liveness condition | W6 |
| M10 | deregistration without the owned-set condition (A4) | W6b |
| M11 | `close()` does not await the pass | W4 (i) |
| M12a / b / c | the `#closing` check dropped at the top of the loop body / before each release / before deregistration | W4 (iii) / (i) / (ii) |
| M13 | `#armReconcile`'s closing check dropped (A2, S2 — one mutant, one home) | W4 (iv), (v) |
| M14 | `#ensureSweepStarted` arms the heartbeat while closing | W4 (v) |
| M15 | `revocationHandler` dropped after the await instead of before (A1) | W4 (vi) |
| M16 | the decoder maps *refused* to *absent* | WD and W5 |
| M17 | the per-instance catch removed (A3) | W7 |
| M18 (amendment) | the "released" line dropped on the `close()` path (both closing checks return silently) | W4 (vii) |

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| A driver runs at most one sweep pass at a time, by construction | `#armReconcile`, `packages/realtime/drivers/redis.ts` | a `setInterval` for the sweep; a `running` / in-flight flag; a coalesced trailing pass; any second caller of `#reconcile` (reconnect trigger, heartbeat, `holdMember`) |
| The sweep timer is armed — first and after every pass, success or failure — only while not closing | `#armReconcile` (the only arming site; it stores and clears `#reconcilePass`), `packages/realtime/drivers/redis.ts` | a `setTimeout` for the sweep anywhere else; a re-arm inside `#reconcile`'s `try` or `catch`; a closing check at the call sites instead of inside `#armReconcile`; `#reconcile` touching `#reconcilePass` |
| `close()` order: `#closing` → clear timers → drop `revocationHandler` → await `#reconcilePass` → drop `#departureHandler` → close owned | `close()`, `packages/realtime/drivers/redis.ts` | dropping `revocationHandler` after the await; dropping `#departureHandler` before it; the pass reading or clearing `#reconcilePass`; a second shutdown path |
| Where a pass stops on close: top of each instance (before `EXISTS`), each release, deregistration — never between a release reply and the handler | `#reconcile` (instance) and `#sweepOwned` (release, deregistration; `#sweepInstance` before the review split), `packages/realtime/drivers/redis.ts` — one flag, three askers | a check after `await this.#release(…)`; a check inside `#release` or the departure handler; an `AbortSignal` threaded through; the manager checking closure |
| The heartbeat is armed only while not closing, and stays an unguarded `setInterval` | `#ensureSweepStarted`, `packages/realtime/drivers/redis.ts` | an in-flight guard, a self-re-arming timeout or an await chain on the heartbeat |
| The liveness key is written before the instance registers itself, and registration is attempted even when that write failed | `#heartbeat`, `packages/realtime/drivers/redis.ts` | `SADD` first; skipping `SADD` after a failed `SET`; a second registration write elsewhere |
| One instance's failure ends only that instance's sweep: one WARN, no deregistration, the pass goes on | the per-instance `catch` in `#sweepInstance`, `packages/realtime/drivers/redis.ts` (`#reconcile`'s outer catch covers only the instance-set read and `EXISTS`) | a whole-pass catch around the loop; a catch in `#reconcile` around `#sweepInstance`; per-release catches that continue past a failure |
| A sweep writes only while its target is dead, decided **inside** each write | `RELEASE_MEMBER_SCRIPT` and `DEREGISTER_INSTANCE_SCRIPT`, `packages/realtime/drivers/redis.ts` (`#reconcile`'s up-front `EXISTS` only selects candidates; it never authorises a write) | a TypeScript `EXISTS` before each release or before deregistration; an `HEXISTS` / `HGET` pre-read; a second release script for sweeps; a sweep lock |
| Which release asks for the liveness check (on another process's behalf only), and whose key it checks (always `releaserId`'s) | `#sweepOwned` passes the flag; `#release` builds `KEYS[4]` as `this.aliveKey(releaserId)`, `packages/realtime/drivers/redis.ts` | `#release` deriving the flag from `releaserId !== this.instanceId`; `releaseMember` passing `true`; a default-on parameter; `KEYS[4]` built from `this.instanceId` or passed in by the caller |
| An instance is deregistered only while dead **and** owning nothing | `DEREGISTER_INSTANCE_SCRIPT`, `packages/realtime/drivers/redis.ts` | any raw `SREM instancesKey`; `EXISTS` then `SREM` in two round trips; an `SCARD` or `SMEMBERS` check in TypeScript; a `DEL` of the instances set |
| What a deregistration reply means (0 deregistered / `REFUSED` renewed / `KEPT` late hold) | `decodeDeregisterReply`, `packages/realtime/drivers/redis.ts` | `asInteger(reply) === …` in `#sweepInstance`; ignoring the reply; folding it into `decodeReleaseReply` |
| The reply codes (`KEPT = 2`, `REFUSED = 3`, never `1`) | two named constants beside `RELEASE_MEMBER_SCRIPT`, `packages/realtime/drivers/redis.ts`, interpolated into both scripts and read by both decoders | literal `2` / `3` in a decoder, a script or a test apart from the constants; reusing `1`; a negative code; a `{ removed, entry }` tuple |
| What a release reply means | `decodeReleaseReply` → unexported `ReleaseOutcome`, `packages/realtime/drivers/redis.ts` | `asInteger(reply) === …` in `#sweepInstance` or `#release`; truthiness; a second decoder for sweeps; exporting the union |
| A decoder's error never carries the reply | `decodeReleaseReply` and `decodeDeregisterReply`, `packages/realtime/drivers/redis.ts` | interpolating the reply, its type or length into a message; `renderError` of a wrapped reply |
| A leave's public answer is `gone` only; a refused leave is a fault | `releaseMember`, `packages/realtime/drivers/redis.ts` (`RosterRelease` in `packages/realtime/driver.ts` unchanged) | a `kept` / `outcome` field on `RosterRelease`; the manager reading the union; `releaseMember` mapping `refused` to `gone: false` |
| What a sweep logs: one line per instance — "released" (N = emptied + kept, E = emptied, none at N = 0), "renewed", or "failed" | `#sweepInstance`'s one log site, fed by the end `#sweepOwned` returns (review, 2026-09-23), `packages/realtime/drivers/redis.ts` | counting in `#release`; incrementing before the reply is decoded; counting *absent*; a line at 0; two lines for one instance; the "failed" line written by `#reconcile` |
| A refused sweep stops that instance | `#sweepOwned` (returns `renewed`), `packages/realtime/drivers/redis.ts` | `continue` after *refused*; a retry; throwing out of the pass; deregistering anyway |
| **Amendment, 2026-09-23 (coordinator):** a sweep cut short by `close()` after removing N > 0 holds still emits its one "released N hold(s) (E emptied)" line; at N = 0 no line | `#sweepInstance`'s one log site: both closing checks in `#sweepOwned` return `closed`, logged like `completed` (review, 2026-09-23; was a `reportReleased` closure), `packages/realtime/drivers/redis.ts` | a second "released" format for the close path; a line at N = 0; logging from `close()` or `#reconcile`; the closing checks returning silently |
| `left` precedes an in-flight hold's `joined` (#348, unchanged) | as ADR 005 records: no I/O await between the release reply and the handler call: `#sweepOwned` calls `#announceSwept`, which calls the handler before its first await, `packages/realtime/drivers/redis.ts` | a `#closing` check or the count update awaited between reply and handler; routing the departure through the slot tail |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary Dependencies**: `@lockness/realtime` only;
`@lockness/redis`'s `lua_eval.ts` test helper unchanged · **Storage**: presence hash, holders hash
per slot, owned set, instances set, liveness key (ADR 004) · **Testing**: `deno test`, FakeRedis
behind the serializing wrapper (#348 W8's `serializedCommands`), FakeTime, live-broker conformance
(#285), mutation harness · **Target**: server library · **Project type**: framework package ·
**Performance**: per driver, sweep load is bounded by one pass per interval; each release gains one
`EXISTS` **inside** its script (no round trip); deregistration stays one round trip with two
`EXISTS` inside. The crash `left` latency bound grows by one pass duration · **Constraints**: no
seam, wire or control-frame change; the Lua subset of FR-008 · **Scale**: one pass in flight per
driver.

### Domain model

- **Bounded context**: realtime — Redis ghost sweep.
- **Vocabulary**: *pass* (one run of `#reconcile`), *arm* / *re-arm*, *lapse* (liveness key expired,
  process alive) vs *crash*, *release outcome* (**emptied**, **kept**, **absent**, **refused**),
  *deregistration* (**deregistered**, **renewed**, **kept**), *late hold*.
- **Entities**: `RedisBroadcastDriver` (owns the pass, its timer and `#reconcilePass`).
- **Value objects**: `ReleaseOutcome` (new, internal); the deregistration outcome (new, internal);
  `RosterRelease { gone }` (unchanged).
- **Invariants**: at most one pass per driver; no sweep write lands while its target's liveness key
  exists; no instance owning a hold is deregistered; the count equals holds removed; once `close()`
  resolves, no sweep command and no revocation handler run; exactly-once announcement across
  sweepers (unchanged).
- **Out of scope**: re-holding a lapsed instance's swept slots (#349); cross-instance sweep overlap;
  paging a huge owned set (filed separately); the revocation timer; Redis Cluster; batching
  `PUBLISH`.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | nothing exported changes |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | required per task |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-017 lists every block |
| MVC layering | pass | driver-internal |
| Commit discipline | pass | fix / test / docs split |
| No environment detail in versioned files | pass | none |
| Design decisions → architect-expert | pass | disposition 2026-09-23; audit rulings A3, A4 |
| Act, don't recommend | pass | — |
| TDD, red first | pass | W1, W2, W4, W5, W6, W6b, W7 red on `main` first |
| No silent catches | pass | the outer and per-instance catches WARN; the refused path logs |

### Complexity tracking

None.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API / driver seam | no | `RosterRelease`, `mod.ts` unchanged |
| Redis driver internals | yes | scheduling, `close()`, heartbeat order, release script (4 keys, 4 replies), deregistration script (3 keys, 3 replies), two decoders, per-instance containment, count |
| Control-plane / client wire | no | bytes unchanged; fewer spurious `left` for a lapsed instance that renews |
| Operator logs | yes | "released" line counts removals and names E, none at 0; new "renewed" and "failed" WARNs |
| Memory driver / third-party drivers | no | — |
| `@lockness/redis` | no | Lua subset suffices (FR-008) |
| Docs | yes | ADR 006, `docs/realtime.md`, `packages/realtime/AGENTS.md`, JSDoc, two comments |

### Documentation (this feature)

```text
.specnaut/specs/262-reconcile-single-pass/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| `close()` waits on the broker: up to two round trips plus one departure-handler call (≈60 s worst case on `fromConfig` at 30 s per command) | accepted (disposition, S6); documented with that bound in "Ghost sweep" |
| A timer is armed after `close()` (re-arm, or first arm during the boot beat) | one arming site with the closing check (FR-001, FR-002); M13, M14 / W4 (iv), (v) |
| A reconnect runs the revocation handler while `close()` awaits the pass | handler dropped before the await (FR-003); M15 / W4 (vi) |
| A `#closing` check slips between reply and handler, breaking #348's order | decision row; #348 W8 / M8 / M9 kept green |
| One unreadable owned set stalls every sweep fleet-wide | per-instance catch (FR-004a); W7 / M17. Residue: an owned set too large for one reply is never swept — SSCAN-budgeted sweep filed separately (S1b) |
| Reordering the script tail changes a non-holder's promotion | FR-005 puts the absent test after the promotion; the #345 rows re-proven live |
| A new code collides with the pre-#348 `1` and reverses FR-004a | FR-009 constants 2 / 3; WD |
| A decoder message leaks broker bytes into logs | constant messages (FR-010); WD marker case |
| The script leaves the evaluator's subset and forces an `@lockness/redis` change | FR-008 shapes written out; the evaluator parses the whole script before running |
| A lapsed instance's late hold is orphaned by deregistration | closed: deregistration requires an empty owned set (FR-007); W6b / M10 |
| An unparsable owned entry keeps a dead instance registered forever | accepted residue, ADR 006; deleting it needs its own guarded script |
| The heartbeat reorder changes #310's scenario | `SADD` still attempted after a failed `SET` (FR-008a); `self_skip_310` re-proven live |
| One `tickAsync` now runs one pass; existing sweep tests assume several | scheduling lands first; the task records each changed test and why (FR-014) |
| Crash `left` latency grows by one pass duration | documented in "Ghost sweep" |
| 20 mutation rows lose or move anchors | FR-016 list; template literals only on the constant lines (FR-008); harness names every `DEAD MUTANT` |
| Mixed fleet: a `0.3.0` sweeper keeps releasing a renewed instance and deregisters with a raw `SREM` | documented residue |

## 10. Architecture audit

*`architect-expert`, 2026-09-23, against this document before any code. Verdict at audit time:
**fail — 1 HIGH, 4 MEDIUM, 2 LOW**, every one a plan edit; two MEDIUMs are binding rulings. None
reopens the disposition.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 HIGH | `close()` awaited the pass before dropping `revocationHandler`, so a reconnect during the await could run the revocation reconcile and arm its retry after `close()` | Plan changed: FR-003 order drops `revocationHandler` synchronously before the await; row 3's third column gains "dropping `revocationHandler` after the await"; W4 (vi), M15 |
| A2 MED | "Arm unless closing" had no single home; FR-001 had the pass own `#reconcilePass` while row 3 said only `close()` reads it; the first arm after the boot beat ignored `#closing` | Plan changed: `#armReconcile()` is the one arming site and owns `#reconcilePass` (FR-001, new row); `#ensureSweepStarted` skips arming the heartbeat while closing (FR-002, FR-013); W4 (v), M13, M14; #348 M12's `expectSurvival` reason names the arm check |
| A3 MED (ruling) | A throw while sweeping one instance aborted the whole pass, starving every later instance | Plan changed: per-instance catch in `#sweepInstance` with the "failed" WARN, no deregistration, pass continues (FR-004a, FR-012, new row, edge cases 1–2, US5, SC-005); W7, M17. Rejected: whole-pass catch (starvation); a catch in `#reconcile` around `#sweepInstance` (splits reporting, loses N / E). Residue: an owned set too large for one reply — filed separately |
| A4 MED (ruling) | Conditional deregistration on liveness alone only narrowed ADR 004 §5's orphan: a lapsed instance's late hold was still orphaned | Plan changed: `DEREGISTER_INSTANCE_SCRIPT` requires dead **and** an empty owned set (`EXISTS`, not `SCARD`), three decoded outcomes via `decodeDeregisterReply` (FR-007, two new rows); heartbeat writes `SET` before `SADD` and still attempts `SADD` (FR-008a, new row); the residue is **closed** (FR-017, §9, edge case); W6b, M10; `prefix_anchoring` needs only a comment edit; `self_skip_310` re-proven live. Rejected: reorder only (orphan stays); owned set replacing liveness (loses "renewed"); the sweep deleting unparsable owned entries (needs its own guarded script); the hold script refusing while lapsed (a product decision). Residues stated in ADR 006: an unparsable owned entry keeps a dead instance registered; a `0.3.0` sweeper still uses a raw `SREM` |
| A5 MED | Old M2 ("re-arm only on success") was equivalent: `#reconcile` never rejects | Plan changed: M2 restated as "the re-arm moved into `#reconcile`'s `try`, after the loop", killed by W3 |
| A6 LOW | "FakeTime `tickAsync` awaits the callback's promise" is false: it fires callbacks and discards the promise, so one `tickAsync(k · interval)` now runs one pass | Plan changed: claim removed (FR-001); scheduling lands first and the task records which sweep-clock tests change and why (FR-014); FR-017 corrects the two existing comments |
| A7 LOW | The per-instance closing check must precede `EXISTS`; template literals on every script line would kill five surviving anchors | Plan changed: FR-004 places it at the top of the loop body (W4 (iii) asserts no `EXISTS`; M12a has one anchor); FR-008 confines template literals to the constant lines |
| — | FR-006 boolean parameter; `KEPT` / `REFUSED` constants; unexported `ReleaseOutcome`; `releaseMember` throwing on refused; absent test after the promotion; both scripts in the Lua subset; #355 before #349 | Accepted as is |
| — | The four conflicts this plan flagged (#348 A6 deadlock, W8's numkeys predicate, the script length, the deregistration residue) and the 20-row / 6-battery count | Confirmed |

**Coverage** (as reported by the seat): this plan in full, the disposition, the scheduling, `close()`,
heartbeat, release and sweep paths of `redis.ts`, the Lua subset, FakeTime's timer semantics and
the realtime mutation batteries' anchors. The per-file list was not itemised in the relay.

## 11. Security audit

*`security-expert`, 2026-09-23, in parallel. Verdict: **needs follow-up — 0 CRITICAL, 0 HIGH,
1 MEDIUM, 4 LOW, 2 INFO**.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 MED (pre-existing) | One oversized or unreadable owned set stalls every sweep fleet-wide | (a) Plan changed: A3's per-instance catch (FR-004a), W7 / M17. (b) An SSCAN-budgeted sweep is filed separately as a backlog item; ADR 006 names the residue |
| S2 LOW | The first arm ignored `#closing` | Plan changed: same fix as A2 — one mutant, M13 (plus M14 for the heartbeat arm), W4 (v) |
| S3 LOW | Heartbeat order let a failed liveness write register an instance with no liveness key | Plan changed: resolved by A4's reorder (FR-008a) |
| S4 LOW | Decoder messages could carry broker bytes | Plan changed: FR-010 / FR-011 constant messages that name only the accepted shapes; WD adds an array reply carrying a marker and asserts it is absent; new decision row |
| S5 LOW | Nothing pinned that the sweep asks for the check, or whose key it checks; a wrong `KEYS[4]` (the sweeper's own) jams the sweep forever | Plan changed: FR-005 states `KEYS[4]` is always `releaserId`'s liveness key, built one way; decision row extended; M7 (sweep asks with `false`) and M8 (sweeper's own key), killed by W5 and W2 |
| S6 INFO | `close()` can wait up to two broker round trips plus one departure-handler call (≈60 s worst case on `fromConfig`) | Accepted; §9 risk row and the FR-017 docs wording corrected |
| S7 INFO | The in-write liveness check is placed correctly (before any read or write, sweep releases only) | Accepted — no change |

**Coverage** (as reported by the seat): the plan's scripts, decoders, scheduling and `close()`
paths, the log lines, and the sweep's failure behaviour against a hostile or slow broker. The
per-file list was not itemised in the relay.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Any product question? | None — the disposition and both audits found none; A4 explicitly rejected the one shape that would have been a product decision (the hold script refusing while lapsed) | 2026-09-23 |
| Approve the architecture as audited (tasks → implement → review)? | Approved by the maintainer at stop 1 | 2026-09-23 |

### Decided without asking

- The design shape — the #355 `architect-expert` disposition (2026-09-23); not re-opened.
- A3 and A4 — binding audit rulings by the same seat, folded in as written.
- The liveness key travels as `KEYS[4]` and the ask as `ARGV[4] = '1'`: the subset cannot test an
  absent `KEYS[4]`, and every key stays declared.
- Codes `KEPT = 2`, `REFUSED = 3`, as named constants interpolated into the scripts — one spelling;
  the deregistration script reuses both for the same meanings.
- The absent test sits after the promotion block — preserves the non-holder's field restore.
- "Instead" read literally: one line per swept instance, carrying N and E.
- "No command after `close()` resolves" covers the sweep, the heartbeat arming and the revocation
  handler; an already in-flight heartbeat command is not awaited.
- #348 A6's mid-sweep half, W8's numkeys predicate and #348 M12 are repaired as FR-015 / FR-016 say;
  "W8 unchanged" is read as its assertions.
- The SSCAN-budgeted sweep is out of this item and filed separately (S1b, A3 residue).
