# Plan: a lapsed-but-alive instance re-holds its presence slots, and no connection hears presence about itself

**Branch**: `263-lapse-rehold` | **Date**: 2026-09-23 | **Backlog item**:
[#349 — Realtime: an alive instance whose liveness lapsed is swept and never re-holds its presence slots while its sockets stay open](https://github.com/locknessland/lockness-monorepo/issues/349)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #349 (2026-09-23, hard rule #11, decided together with #355). The product question
it raised (P1, self-frames) was answered by the maintainer the same day: **no self-frames**. This
plan records both as binding.

It adds what the disposition left to the plan: the decision table, the requirements, the counted
blast radius, and the points where the code at `d9c330ef` (after #355) differs from what the
disposition read at `811e7e14`. Both plan audits are folded in (§10, §11). One of them brings a
binding ruling, A2 / S2: the re-assert first re-checks durable revocations.

#355 is merged, and this item depends on its FR-005: a sweep release is refused once its target
renews.

---

## 1. Why this exists

An instance can stay up while its liveness key lapses: a stalled event loop, a long GC pause, or a
partition to Redis. A peer's ghost sweep then treats it as crashed. Since #355 the sweep stops as
soon as the instance renews, but every hold it released **before** the renewal stays released, and
nothing puts it back. Measured on `main` by #348 W5
(`packages/realtime/tests/presence_sweep_departure_348.test.ts`):

- **Unbounded absence.** Member 7 disappears from `readRoster`, `here.members` and `here.total` on
  every instance, although its socket on the lapsed instance is still open and subscribed. It comes
  back only when that instance next writes 7's slot. A member who stays connected and does nothing
  is shown as gone **indefinitely**.
- **A self-`left` with no matching `joined`.** The sweep's `left` for 7 also reaches 7's own tabs,
  because a `left` excludes nobody (`manager.ts`, `emitPresence`). The later `joined` skips those
  same tabs (`exceptMemberId`). So 7's own tabs see themselves leave and never come back, until
  they resubscribe. The same happens on the sweeper, when 7's new tab there is held right after the
  sweep's release (#348 W8).
- **No self-repair.** `RedisBroadcastDriver` never compares what it thinks it holds with what the
  roster says, and its heartbeat cannot tell a renewal from a re-creation.

**Who is affected:** multi-instance deployments on the Redis driver, whenever an instance misses a
renewal without dying. The self-frame change reaches every deployment, but in a consistent roster it
excludes nobody (US4).

## 2. User scenarios

### US1 — a lapsed instance puts its members back (P1)

**Given** member 7 is held only on instance A, A's liveness key lapses, and B sweeps it (B's
observers receive `left` for 7)
**When** A can reach the broker again
**Then** 7 is back in every instance's `readRoster` and `here` within one heartbeat interval, plus
one revocation re-check, plus the re-assert's duration. Each observer on B and C has received
exactly one `left`, then exactly one `joined`, for 7.

### US2 — a member never hears presence about itself (P1)

**Given** 7 has a tab on A, and 8 has a tab on A
**When** A lapses, is swept, and re-asserts
**Then** 7's tab receives neither the `left` nor the `joined` for 7, and 8's tab receives `left`,
then `joined`, for 7. On the sweeper, a new tab of 7 whose hold commits right behind the sweep's
release also receives no `left` for 7.

### US3 — a revocation issued during the lapse stays enforced (P1)

**Given** A holds 7 (connection c7) on channel X, A is partitioned so its control deliveries are
lost, and B calls `revokeChannel(c7, X)` with its durable record written, then sweeps A
**When** A heals and re-asserts
**Then** no `joined` for 7 goes out anywhere, 7 stays absent from `readRoster`, and c7 has left X.

### US4 — nothing changes for a consistent roster (P2)

**Given** a single instance, the memory driver, a roster-less driver, or a third-party roster driver
without the new hook
**When** members join and leave as usual
**Then** every frame any connection receives is what it received before. A `left` is announced only
when no process holds the slot, and a live local connection of that member means this process holds
it or has a hold queued. So the self-exclusion removes a frame only in the two defect cases of US2.

### US5 — a lapse nobody swept costs nothing visible (P2)

**Given** A lapses and renews before any peer sweeps it, or 7 is also held on D
**When** A re-asserts
**Then** no frame goes out, and the roster is unchanged.

### US6 — shutting down during a re-assert (P2)

**Given** A is re-asserting K slots
**When** the application calls `A.driver.close()`
**Then** the re-assert stops before its next slot, `close()` resolves only after the slot in flight
settles, and no hold is issued after it resolves.

### Edge cases

- **A leave during the re-assert.** 8's last tab on A closes mid-run. 8's own write releases a slot
  that was already swept (`gone: false`, no frame). The re-assert's write for 8 runs on the same
  slot tail, finds no local 8, and releases nothing: 8 stays absent, and no `joined` goes out.
- **A join during the re-assert.** A new tab's own join holds its slot. If the re-assert reaches
  that slot, it holds it again (`arrived: false`, no frame).
- **Lapse during a run.** Exactly one trailing run follows, however many lapses were seen during the
  run.
- **A beat whose reply is lost after it committed.** The beat counts as failed, so the lapse is
  suspected. The next successful beat re-asserts, whatever its own reply says.
- **Every failed beat after the first hold costs one full re-assert** (A7): K repeat holds and no
  frame. A failed run followed by a successful trailing run leaves suspicion set, which costs one
  redundant run. Both are accepted; the upgrade path is in ADR 007.
- **Broker backoff (#358, S3).** A backoff that makes beats fail marks the lapse suspected on every
  failure. Each surviving instance then re-holds K slots per recovery. The cost is bounded by
  coalescing and by writing one slot at a time, and no frame goes out.
- **A hold fails during the re-assert.** The other slots are still tried, then the run rejects. The
  lapse run logs one WARN and marks the lapse suspected, and the next successful beat runs it again.
- **The revocation re-check fails** (the store cannot be listed). The manager logs one WARN and
  still re-asserts. That failure never makes the run reject and never marks the lapse suspected.
  For one interval, a revoke that was lost during the lapse can therefore show `left`, `joined` and
  `left` again, carrying `info`, until the periodic revocation reconcile catches it.
- **The boot beat on the production client** (A4). The command client serializes. A second
  `holdMember` enqueued while the boot beat is in flight sets `#holdIssued` before the beat's tail
  reads it. The boot nil therefore counts as a lapse: one harmless re-assert, and no frame. The flag
  is still read at the tail and not when the beat is issued, because reading it at issue time would
  miss W7 (ii) on a port that does not serialize.
- **Before any hold, a failed beat** marks nothing suspected: nothing can have been swept.
- **A beat reply that arrives after `close()` began** starts no run.
- **A non-string value at the alive key** (S4), written by some other broker client. `SET … GET`
  answers `WRONGTYPE` and, unlike a plain `SET`, does not overwrite it. So every beat fails until
  the key is removed, where before a plain `SET` healed it. Deleting the alive key forces a
  re-assert. ADR 007 records both.
- **The sweeper's `presence-leave` is lost**, for example because the lapsed instance's subscribe
  socket was down during a partition, and pub/sub keeps nothing. The lapsed instance's local
  observers then receive a `joined` for 7 with no `left` before it. Clients that key members by id
  absorb this (ADR 005 residue).
- **Frame order across two publishers.** If the sweeper's `presence-leave` publish is delayed past
  the re-assert's `presence-join`, an observer hears `joined`, then `left`. The roster and `here`
  stay right (ADR 004 residue).
- **7 held on A and D with different `info`.** The re-assert rewrites the shown entry with A's
  entry, as any hold does (last hold wins, ADR 004), with no frame.
- **Broker data loss.** Every instance's next beat reports a lapse and rebuilds the roster, with a
  `joined` for each member and no `left` before it.
- **Mixed `0.3.0` / `0.4.0` fleet.** A `0.3.0` sweeper has no liveness check and can release holds
  after the re-assert. A `0.3.0` instance still sends a self-`left` to its own tabs.
- **An instance that stays stalled** stays missing: from the fleet's side, it is down.

## 3. Requirements

**Detection: the renewal reports the lapse**

- **FR-001**: `#heartbeat`'s liveness write becomes `SET <alive key> 1 EX <ttl> GET`. `GET` needs
  Redis 6.2 or later, and the driver's floor is already 7.0.
  - It stays a `SET` on the alive key, so `withFaultyInstance`'s matcher is unchanged.
  - It is still written **before** `SADD instances`, and the `SADD` is still attempted when it
    failed (#355 FR-008a).
  - **`decodeBeatReply` runs inside the SET's `try`** (S1). Its result goes into a local variable
    that the beat's tail reads. A decode that throws therefore lands in the existing `catch`, which
    keeps its current two lines (`failure = { error }`, the #355 M20 anchor), and nothing escapes
    `#heartbeat`.
- **FR-002**: `decodeBeatReply(reply)`, beside the other decoders in `drivers/redis.ts`, is the only
  place a beat reply is given meaning:
  - `{ type: 'nil' }` → `lapsed`;
  - any bulk → `continuous`;
  - anything else throws a **constant** message that names the accepted shapes and never includes
    the reply, its type or its length (#355 S4).
- **FR-003**: `holdMember` sets `#holdIssued = true` **synchronously, immediately before** it issues
  its `EVAL`, after `await this.#ensureSweepStarted()`. Nothing else sets it, and it is never
  cleared.
- **FR-004**: After both writes, `#heartbeat`'s tail decides once, reading `#holdIssued` **at that
  moment** (A4):
  - If the decoded outcome is absent (the SET failed or the decode threw) and `#holdIssued` is set,
    it sets `#lapseSuspected`.
  - If the outcome is present, `#holdIssued` is set, and the outcome is `lapsed` or `#lapseSuspected`
    is set, it clears `#lapseSuspected` and calls `this.#lapse.trigger()`. It never awaits it.

  A failed `SADD` sets nothing. The existing one WARN per failed beat is unchanged.

**The seam: a fifth optional hook**

- **FR-005**: `BroadcastDriver` (`driver.ts`) gains
  `onRosterLapse?(handler: (signal: AbortSignal) => void | Promise<void>): void`. Its JSDoc covers:
  - what it reports: this process's holds may have been released on its behalf, so its owner should
    write them again through its normal write path;
  - the delivery contract of FR-007;
  - why it takes an `AbortSignal`;
  - an `@example`.

  `PresenceCapableDriver` does not require it, and no new type is exported.
- **FR-006**: `BroadcastDriver`'s JSDoc states the hooks' **shared lifecycle once**:
  - one owner per driver, so a second registration replaces the first;
  - one handler;
  - the driver's own shutdown drops it (`BroadcastDriver` declares no `close()`, A5), so a shut-down
    driver calls nothing.

  `onControlRefused`, `onRevocationReconcile`, `onRosterDeparture` and `onRosterLapse` each refer to
  it instead of restating it. `onControl` is named as the one exception: its lifetime is its
  subscription.

  The JSDoc also states the **rule for a sixth hook**: a new driver-to-owner notification becomes a
  new hook only if its payload **and** its delivery contract differ from every existing one. The
  bookkeeping is consolidated only when a **second** production driver implements three or more of
  these hooks.
- **FR-006a** (accepted, A5): `RedisBroadcastDriver.close()` also drops `controlRefusedHandler`, so
  the stated lifecycle holds for every hook it names. It is documented in one line in
  `docs/realtime.md`'s `onControlRefused` section and one line in "Writing a presence driver". It is
  not a numbered upgrade item.
- **FR-007**: **`LapseRun`** (A6) is a concrete, non-exported class in its own module,
  `packages/realtime/drivers/lapse_run.ts`. It is specific to the lapse hook: no interface, and no
  generic runner. It owns the handler, the run in flight, the trailing flag, the `AbortController`,
  its closed state, and the contained invocation (S1):
  - `register(handler)` replaces the handler.
  - `trigger()` starts nothing if the run is closed or no handler is registered. While a run is in
    flight it sets the trailing flag and returns, so however many lapses arrive during a run, they
    make **exactly one** trailing run. Otherwise it starts a run.
  - A run is `try { await handler(signal) } catch (error) { <one WARN>; onFailure() }`. Its
    `finally` clears the run and, if the trailing flag is set and the run is not closed, clears the
    flag and starts once more. A run never throws, whether the handler rejects or throws
    synchronously.
  - The WARN reads
    `realtime: re-asserting this instance's presence holds after a liveness lapse failed — the next successful heartbeat retries: <renderError>`,
    with no member id or channel.
  - `onFailure` is a constructor callback. The driver passes `() => { this.#lapseSuspected = true }`.
    There is no retry timer; the heartbeat bounds the retries.
  - `close()` marks the run closed, aborts the signal, and returns a promise that settles once the
    run in flight (if any) has settled, then drops the handler.

  The driver keeps detection (`#holdIssued`, `#lapseSuspected`, `decodeBeatReply`) and a single
  field, `#lapse`. `onRosterLapse(handler)` is `this.#lapse.register(handler)`.
- **FR-008**: `close()` order (A1, A6):
  1. set `#closing`;
  2. clear every timer;
  3. `const stopped = this.#lapse.close()` (aborts the lapse signal, synchronous);
  4. drop `revocationHandler`, keeping it adjacent to the `// The pass stops at its next write`
     comment, which is #355 M15's anchor;
  5. `await this.#reconcilePass`;
  6. `await stopped`, on its own line, never `Promise.all`;
  7. drop `#departureHandler` and `controlRefusedHandler`;
  8. close the owned resources.

  It stays idempotent. A beat already in flight is still not awaited, and its tail starts nothing
  because `LapseRun` is closed. `close()`'s JSDoc states the wait (S5): at most one slot write plus
  whatever is queued ahead of it on that slot. That is at most 30 s per `EVAL` on the built-in
  client, and unbounded on an injected port.
- **FR-009**: The manager registers `this.driver.onRosterLapse?.((signal) => this.#reassertRoster(signal))`
  inside the existing `if (roster) {` block of its constructor, **after** the `onRosterDeparture`
  registration, whose lines stay untouched.

**The re-assert: revocations first, then `#syncRosterMember` one slot at a time**

- **FR-010a** (A2 / S2, **binding ruling**): `#reassertRoster(signal)` first runs the manager's own
  durable revocation re-check:
  `try { await this.reconcileRevocations() } catch (error) { console.warn(<constant text> + renderError(error)) }`.
  The WARN names no target and no member.
  - Then `if (signal.aborted) return`, then FR-010 and FR-011, unchanged.
  - A failed re-check is **not** part of FR-011's aggregate rejection, and never sets
    `#lapseSuspected`.
  - No change to the seam or the driver.
- **FR-010**: It snapshots the `(channel, origin)` pairs to write:
  - the channels are the keys of `presence`;
  - each channel's members are `#localRoster(channel)`, the one dedupe rule (#343);
  - each member's origin is `{ clientId, member }`, where `clientId` is the connection whose presence
    entry **is** that member object: the one `#localRoster` kept, found by object identity.
- **FR-011**: It awaits `this.#syncRosterMember(channel, origin)` for each pair, **one at a time**
  (never `Promise.all` / `allSettled`), and checks `signal.aborted` **before each**. When the signal
  is aborted it returns (resolves).
  - A slot that rejects is recorded, and the loop goes on.
  - After the loop, if any slot failed, it rejects with one `Error` carrying the count of failed slots
    and the first failure's `renderError`, with no member id and no `info`.
  - Its only log line is FR-010a's WARN.
- **FR-012**: The re-assert adds no write path and no announcement path.
  - The desired state is derived inside the slot's tail (ADR 003).
  - The hold's `arrived` bit decides the frame (ADR 004).
  - `#announcePresence` keeps exactly two callers (ADR 005 §6).
  - `#syncRosterMember` is not modified.

**No self-frames (product decision, 2026-09-23)**

- **FR-013**: `emitPresence(channel, frame)` excludes **every** local subscriber of `channel` whose
  presence entry on that channel has the frame's member id (`sameMemberId`, read at emit time). This
  applies to `joined` **and** `left`.
  - `frame` is typed as the internal
    `PresenceTransitionFrame = Extract<OutboundFrame, { type: 'presence' }> & { action: 'joined' | 'left'; member: PresenceMember }`
    (A8).
  - The `options` parameter and `exceptMemberId` are removed.
  - The `(channel, frame)` shape is kept, so the injected code of #344 M6 and #323's first row still
    compiles.
- **FR-014**: Both call sites that passed `exceptMemberId` now pass only `(channel, frame)`: the
  local emit in `#announcePresence`, and `handleControl`'s `presence-join` arm. The `presence-leave`
  arm is unchanged and now excludes through FR-013.
  `grep -n 'emitPresence(' packages/realtime/manager.ts` shows the definition and exactly three
  calls.

**FakeRedis**

- **FR-015**: FakeRedis's `SET` arm (`tests/fake_redis.ts`) models `GET`:
  - at most once, in any position among the options;
  - it returns the previous string as a bulk, or nil when the key is absent **or expired** (expiry is
    checked before the write);
  - every other option is still refused;
  - the `GET` branch sits **above** the line `if (opts[i].toUpperCase() !== 'EX') {`, which is kept
    verbatim;
  - a `GET` over a key of another type is refused (the broker answers `WRONGTYPE`).

**Tests, anchors, docs**

- **FR-016**: Witnesses (§4):
  - The driver and manager witnesses go in `packages/realtime/tests/lapse_rehold_349.test.ts`.
  - The `LapseRun` unit witnesses (W11, W12, W14, WS2) go in
    `packages/realtime/tests/lapse_run_349.test.ts`, with no FakeRedis (A6).
  - W1, W2, W3, W3b, W7 and W15 are committed **red on `main` first**.
  - W1 also runs on a live broker in `redis_broker_integration.test.ts`: `withFaultyInstance` for A,
    unchanged, with a normal `withInstances` peer nested inside its body on the same namespace.
  - WC extends `fake_redis_conformance.test.ts` and the #285 live conformance suite.
- **FR-017**: Existing tests this change makes wrong are repaired, not weakened:
  - `fake_redis_conformance.test.ts`, "#280 SET rejects an option it does not model": `['GET']`
    leaves the list of refused options.
  - `presence_sweep_departure_348.test.ts` W5 and W8: their self-`left` comments are rewritten, and
    W8 gains W3b's assertion.
  - `prefix_anchoring.test.ts`, `channel_watch_295.test.ts` and `connection_id_charset.test.ts`: each
    gets a canned `SET` reply (`{ type: 'nil' }`) where `recordingPorts`' default `null` would now
    fail the decode.
- **FR-018**: A new mutation battery, `packages/realtime/tests/mutations/lapse_rehold_349.ts`, holds
  the §4 mutant table, every row proven live. Its `LapseRun` rows mutate `drivers/lapse_run.ts` and
  run only the unit suite.

  The **re-anchor list** is **18 existing rows in 6 batteries**. It was counted on `main` `d9c330ef`
  and confirmed by the architecture audit. The audit's one misclassification was #355 M15, which the
  first `close()` order would have broken; A1's order keeps it intact.
  - *Anchor text replaced: merge, subsume or re-anchor* (3):
    - `presence_member_transitions_344` **M7** (three anchors) and its **`handleControl` row** merge
      into one row, M12, with both reasons carried verbatim;
    - `reconcile_single_pass_355` **M19** (`BEAT_SET`) is re-anchored on the new call text.
  - *Anchor intact, but the code under it or its witness changes: re-prove live* (8):
    - `fake_redis_280`: "SET accepts an unmodelled option again", "SET stops checking its EX
      argument", "a plain SET stops clearing the TTL";
    - `reconcile_single_pass_355` **M20** (intact because FR-001 keeps the SET's catch);
    - `presence_member_transitions_344` **M13** and **M6**;
    - `presence_join_323`, "the announcement moves back ABOVE the authoritative write";
    - `self_skip_310` (needs a live broker).
  - *Anchor intact unless the implementer moves the line* (7):
    - `presence_sweep_departure_348` **M5** and **M12** (its `expectSurvival` reason still holds);
    - `reconcile_single_pass_355` **M11**, **M15** (kept by FR-008 step 4), **M14**, **M23** and
      **M24** (`#lapse` goes after `#departureHandler`).

  The 280 battery also gains one row, "SET … GET answers OK", killed by WC.
- **FR-019**: Docs.
  - **ADR 007 (new)**, `docs/adr/007-realtime-lapsed-instance-reasserts.md`, records:
    - lapse detection on renewal, and the boot-beat reading (A4);
    - the revocation re-check as the re-assert's precondition (A2 / S2) and its residue (§10);
    - the re-assert through `#syncRosterMember`, one slot at a time;
    - the fifth hook, `LapseRun`'s delivery contract, and the rule for a sixth hook;
    - no self-frames (maintainer, 2026-09-23);
    - the cost of a failed beat, the redundant run, and the upgrade path: suspect only if the next
      successful reply arrives at least one TTL after the last successful beat was issued (A7);
    - #358's backoff cost (S3);
    - the `WRONGTYPE` non-healing change (S4);
    - the rewrite of the shown `info`.

    It amends ADR 004 §2 and §5, ADR 005 §5 and ADR 006 §5, with Status-line and inline callouts.
  - `docs/realtime.md`:
    - "Ghost sweep": rewrite the "not a repair" bullet with the lapsed instance's self-repair, its
      latency (one heartbeat interval, plus one revocation re-check, plus the re-assert), its cost
      (K `EVAL`s, one `PUBLISH` per returning member, and a full re-assert per failed beat once
      holding; A7, S3) and the upgrade path;
    - "Writing a presence driver": the optional hook, its delivery contract, the shared lifecycle,
      and the refusal handler dropped on `close()` (FR-006a);
    - the `onControlRefused` section: one line for FR-006a;
    - "What a `joined` frame promises": "a connection never receives `joined` **or `left`** for its
      own member id";
    - **v0.4.0 upgrade item 14**, "A connection never receives `joined` or `left` for its own member
      id". The header becomes "Ten breaking changes" and "read items 1, 3, 5, 6, 8, 9, 10, 11, 12, 13
      and 14".
  - `packages/realtime/AGENTS.md` pitfalls:
    - the `GET` bit, the hold gate, and decoding inside the `try`;
    - `LapseRun` owns when the handler runs;
    - revocations are re-checked before the re-assert;
    - one slot at a time;
    - the hook rule;
    - `#announcePresence` has two callers;
    - the self-exclusion lives in `emitPresence` with no option (this rewrites the
      `exceptMemberId` / "`left` excludes nobody" pitfall);
    - the battery count goes from 31 to 32.
  - JSDoc: `onRosterLapse` (both files), `BroadcastDriver`, the four hooks' cross-references,
    `LapseRun` and its methods, `decodeBeatReply`, `#heartbeat`, `holdMember`, `close` (the S5
    bound), `#reassertRoster`, `emitPresence`, `handleControl` and `#announcePresence`.

## 4. Success criteria

- **SC-001**: A member with a live connection on a lapsed-but-alive instance is back in the
  authoritative roster on every instance within one heartbeat interval after its instance can reach
  the broker again, plus one revocation re-check, plus the re-assert.
- **SC-002**: One lapse, one sweep and one re-assert give every observer at most one `left` and one
  `joined` per affected member. A member revoked during the lapse gets no `joined`.
- **SC-003**: No connection ever receives a `joined` or `left` whose member is its own.
- **SC-004**: A lapse nobody swept, or a member another instance still holds, produces no frame.
- **SC-005**: The heartbeat never waits behind more than one re-assert hold and its publish.
- **SC-006**: Once `close()` resolves, no re-assert hold is issued and no lapse handler runs.
- **SC-007**: The memory driver, roster-less drivers and third-party drivers without the hook build
  and behave as before. The only application-visible change is upgrade item 14.

**Witnesses** (FR-016). They use FakeRedis with FakeTime unless stated otherwise:

| # | Setup → assertion |
| :--- | :--- |
| W1 (red) | 7 held only on A; A's liveness `SET`s refused (command wrapper); its key lapses; B sweeps it. Writes restored → 7 in B's `readRoster` and `here` within one heartbeat interval plus the re-assert, plus slack. **Also on a live broker** |
| W2 (red) | As W1, with observers on B and C: each receives exactly `['left', 'joined']` for 7 |
| W3 (red) | As W1, with 7's and 8's tabs on A: 7's tab receives no presence frame for 7; 8's receives `left`, then `joined` |
| W3b (red) | #348 W8's race on the sweeper: 7's new tab on B receives no `left` for 7; the observer still gets `joined`, `left`, `joined` |
| W4 (guard) | 8's only tab on A closes during the lapse, and the leave lands mid-re-assert (a gated hold) → 8 absent everywhere, no `joined` for 8 |
| W5 (guard) | 7 held on A and D; A swept → no frame; A re-asserts → A a holder again, still no frame |
| W6 (guard) | A lapses and nobody sweeps it → the re-assert runs (K hold `EVAL`s counted), no frame, roster unchanged |
| W7 (red) | (i) boot beat before any hold `EVAL` → no re-assert (hold `EVAL`s = 1). (ii) non-serializing port, boot `SET` gated: a second `holdMember`'s `EVAL` commits first, a peer sweeps it, the gate opens → the boot beat reports the lapse and the slot is re-asserted. (iii) (A4) two holds race the boot beat on the serializing wrapper → exactly one re-assert run, no frame |
| W8 | A beat's `SET` commits but its reply is rejected → no run; the next successful beat (bulk reply) re-asserts |
| W9 | One of three holds rejects during a re-assert → the other two are written; exactly one WARN; the next successful beat re-runs and the slot comes back |
| W10 | The memory driver, a roster-less driver, and a hand-rolled **roster** driver without `onRosterLapse` construct and pass a join/leave round unchanged |
| W11 (unit) | `LapseRun`: `close()` while a run is gated → the handler's signal is aborted; `close()`'s promise stays pending until the run settles; no run starts afterwards |
| W11b | The manager: the signal aborted between slots → `#reassertRoster` resolves before the next slot's write; through the driver, no hold `EVAL` after `close()` resolves |
| W12 (unit) | `LapseRun`: three `trigger()`s during a gated run → exactly one trailing run |
| W13 | K = 5 slots on a serialized client; a beat fired during the re-assert's first hold → its `SET` commits before the last hold |
| W14 (unit) | `LapseRun`: `trigger()` after `close()` → the handler is never called; through the driver, a beat reply that arrives after `close()` starts nothing |
| W15 (red) | A holds 7 (c7) on X; A partitioned, its control deliveries dropped by a subscriber wrapper; B calls `revokeChannel(c7, X)` with its durable record written; B sweeps A. After A heals: no `joined` for 7 anywhere, 7 absent from `readRoster`, c7 has left X |
| W15b | `listRevocations` rejects once during the re-assert → exactly one manager WARN; 8 still restored; no extra run on the next beat |
| WS1 | `SET` answered with simple `OK`, then with an integer → `#heartbeat` and `holdMember` resolve; one WARN per beat; no run; suspicion only if a hold was issued; an `unhandledrejection` listener sees nothing |
| WS2 (unit) | `LapseRun` with `() => { throw new Error() }` → one WARN, `onFailure` called, nothing escapes (`unhandledrejection` listener) |
| WD | `decodeBeatReply`: nil → lapsed; bulk `'1'` and `''` → continuous; integer, array, simple `OK` and `null` throw a constant message; an array carrying a marker → the marker is absent from the message |
| WL | `onRosterLapse` re-registration replaces the handler; `close()` drops the lapse handler **and** the `onControlRefused` handler (a refusal after `close()` calls nothing) |
| WC | FakeRedis and a live broker agree: `SET k v EX 30 GET` absent → nil; again → bulk `v`; `SET k v GET EX 30` → bulk; expired → nil; `GET` twice → refused |
| — | #344 W9 (local and remote), #348 W1–W8 and #355 W1–W7 stay green |

**Mutants** (FR-018), each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| M1 | the lapse bit ignored (no `trigger()` on `lapsed`) | W1 |
| M2 | the re-assert calls `roster.holdMember` over the snapshot | W4 |
| M3 | the re-assert announces `joined` itself | W5, W6 |
| M4 | the re-assert ignores `arrived` | W2 |
| M5a | `#holdIssued` set at `holdMember`'s entry | W7 (i) |
| M5b | the gate is "skip the first beat" | W7 (ii) |
| M5c | `#holdIssued` read when the beat is issued, not at the tail | W7 (ii) |
| M6 | a failed beat does not set `#lapseSuspected` | W8 |
| M7 | `LapseRun` has no trailing run | W12 |
| M8 | the self-exclusion applies to `joined` only | W3, W3b |
| M9 | the manager's registration drops `?.` | W10 |
| M10 | `Promise.all` over the slots | W13 |
| M11 | `LapseRun.close()` does not abort the signal | W11 |
| M12 | the self-exclusion dropped from `emitPresence` (**merged row**, subsumes #344 M7 and the #344 `handleControl` row, reasons verbatim) | #344 W9, #344 W9 remote, W3 |
| M13 | `LapseRun.trigger()` ignores its closed state | W14 |
| M14 | a failed run does not call `onFailure` | W9, WS2 |
| M15 | the beat awaits the run | W13 |
| M16 | `decodeBeatReply` reads any non-bulk as `lapsed` | WD |
| M17 | `close()` keeps `controlRefusedHandler` | WL |
| M18 | the re-assert stops at the first failed slot | W9 |
| M19 | the revocation re-check removed from `#reassertRoster` | W15 |
| M20 | the revocation re-check moved after the slot loop | W15 |
| M21 | a failed re-check rethrown into the aggregate rejection | W15b |
| M22 | `decodeBeatReply` moved outside the SET's `try` | WS1 |
| M23 | the handler called outside the `try` (a synchronous throw escapes) | WS2 |
| 280+ | FakeRedis `SET … GET` answers `OK` (`fake_redis_280`) | WC |

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| A lapse is detected by the command that renews liveness: `SET … EX … GET`, where nil means the key was re-created | `#heartbeat`, `packages/realtime/drivers/redis.ts` | a separate `GET` / `EXISTS` / `TTL` around the `SET`; the heartbeat as one `EVAL`; a `swept:<id>` marker key; inferring a lapse from an incoming `presence-leave`; a periodic `SMEMBERS` / `SCARD` self-audit |
| What a beat reply means (nil lapsed, bulk continuous, else a constant throw), decoded inside the SET's `try` | `decodeBeatReply`, called only inside `#heartbeat`'s SET `try`, `packages/realtime/drivers/redis.ts` | `asBulk(reply) === undefined` in `#heartbeat`; truthiness; `OK` or `null` read as continuous; decoding after the `try`; a message quoting the reply |
| A nil or a failed beat counts only once a hold's `EVAL` was issued, read when the beat's tail decides | `#holdIssued`, set only in `holdMember` just before its `EVAL`, read only in `#heartbeat`'s tail, `packages/realtime/drivers/redis.ts` | set at `holdMember`'s entry or in `#ensureSweepStarted`; "skip the boot beat"; tied to `sweepStarted`; read when the beat is issued; a beat counter; the manager's `presence` map |
| A failed beat or a failed run makes the lapse suspected; the next successful beat re-asserts whatever its reply says | `#lapseSuspected`, written by `#heartbeat`'s tail and the `onFailure` callback the driver hands `LapseRun`, consumed only by the tail, `packages/realtime/drivers/redis.ts` | set inside the SET's `catch` (moves #355 M20); a failed `SADD` setting it; `LapseRun` keeping its own suspicion; a retry timer; clearing it on a failed beat |
| When the lapse handler runs: never awaited by the beat, at most one in flight, lapses during a run give exactly one trailing run, none once closed; a run never throws and a failure is one WARN plus `onFailure` | `LapseRun`, `packages/realtime/drivers/lapse_run.ts` (concrete, internal, lapse-only) | `await` in `#heartbeat`; the scheduling inlined into the driver; a second trigger (reconnect, `presence-leave`, `holdMember`, the sweep); a queue of runs; a flag in the manager; a retry `setTimeout`; a generic runner or an interface; a WARN per slot in the manager |
| How the lapse run is shut down: closed, the signal aborted, the run awaited, then the handler dropped | `LapseRun.close()`, `packages/realtime/drivers/lapse_run.ts` | the driver holding an `AbortController`; the manager checking a closed flag; dropping the handler before the run settles |
| `close()` order: `#closing` → clear timers → `const stopped = this.#lapse.close()` → drop `revocationHandler` → await `#reconcilePass` → `await stopped` (own line) → drop `#departureHandler`, `controlRefusedHandler` → close owned | `close()`, `packages/realtime/drivers/redis.ts` | aborting after an await; a line between `revocationHandler = undefined` and its comment; `Promise.all` of the pass and the run; a second shutdown path |
| The hook is optional and exists only for a roster owner | the `if (roster)` block of `ChannelManager`'s constructor, `packages/realtime/manager.ts` (type: `BroadcastDriver.onRosterLapse`, `packages/realtime/driver.ts`) | registering outside the roster block; `!` instead of `?.`; making it part of `PresenceCapableDriver` or `presenceRoster`; an `onRosterEvent` union with `onRosterDeparture` |
| The hooks share one lifecycle (one owner per driver, a second registration replaces the first, the driver's shutdown drops it), with `onControl` the named exception (its lifetime is its subscription), and the rule for a sixth | `BroadcastDriver`'s JSDoc, `packages/realtime/driver.ts` (ADR 007 records it) | each hook restating the lifecycle; the rule only in an ADR or AGENTS.md; claiming `onControl` follows it; an `attach(owner)` / `onDriverEvent(union)` built now |
| Before re-holding anything, the re-assert applies durable revocations; a failed re-check is one WARN and never fails the run | `#reassertRoster` (its first statement: `reconcileRevocations()`), `packages/realtime/manager.ts` | the driver running `#runRevocationReconcile` before the lapse handler; a revocation filter over the snapshot; `#syncRosterMember` consulting the store; the re-check failure joining the aggregate rejection or setting suspicion |
| The re-assert walks every local slot one at a time, checking the signal before each, trying all slots before it rejects | `#reassertRoster`, `packages/realtime/manager.ts` | `Promise.all` / `allSettled`; the driver re-holding from its own memory of holds; stopping at the first failure; iterating the live `presence` map across awaits |
| The re-assert writes through the slot's serial tail, so the desired state is read at issue time and a concurrent leave or join is ordered with it | `#syncRosterMember` (unchanged), `packages/realtime/manager.ts` | `roster.holdMember` / `releaseMember` called from `#reassertRoster`; a separate re-assert tail; checking `presence` before enqueueing; an epoch |
| Which connection a re-assert names as its origin: the one whose entry `#localRoster` kept, found by object identity | `#reassertRoster`, asking `#localRoster`, `packages/realtime/manager.ts` | a second `String(id)` dedupe over the entries; re-keying `presence` by member; the channel name passed as `clientId` |
| Who announces a re-asserted member: the hold's `arrived` bit, through `#announcePresence` (two callers) | `#syncRosterMember`'s queued run, `packages/realtime/manager.ts` | `#reassertRoster` calling `#announcePresence` or `emitPresence`; a third caller; a driver-published `presence-join`; announcing on the lapse signal |
| No presence frame reaches a local connection whose presence entry has the frame's member id, for `joined` and `left`, on both paths | `emitPresence(channel, frame: PresenceTransitionFrame)`, with `PresenceTransitionFrame = Extract<OutboundFrame, { type: 'presence' }> & { action: 'joined' \| 'left'; member: PresenceMember }`, `packages/realtime/manager.ts` | an `exceptMemberId` / `except` option; exclusions at the call sites; an exclusion conditioned on `action`; excluding only the origin connection; filtering in the client |
| The heartbeat stays an unguarded `setInterval` and never waits on the re-assert | `#ensureSweepStarted` and `#heartbeat`, `packages/realtime/drivers/redis.ts` | an in-flight guard; a self-re-arming timeout; awaiting the lapse run in the beat |
| FakeRedis models `SET … GET` (previous string or nil, expiry honoured, `GET` once) and still refuses every other option | the `SET` arm, `packages/realtime/tests/fake_redis.ts` | `GET` handled in a test wrapper; answering `OK`; reading the previous value before the expiry check; accepting `GET` as a no-op |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary Dependencies**: `@lockness/realtime` only; no
change to `@lockness/redis` · **Storage**: no new key or field; `GET` reads the alive key's previous
value · **Testing**: `deno test`, FakeRedis (with `GET`) behind the serializing wrapper, FakeTime,
`LapseRun` unit tests with no broker double, the live conformance and integration suites, the
mutation harness · **Target**: server library · **Project type**: framework package ·
**Performance**: one lapse costs one `listRevocations` read, K hold `EVAL`s, and one `PUBLISH` per
member that comes back, one at a time. A steady-state beat keeps its two round trips ·
**Constraints**: Redis ≥ 7.0 (already the floor); no wire, control-frame or key-family change; the
seam change is additive and optional. The new module is published through the package's `exclude`
list, with no include entry needed · **Scale**: K is the number of distinct (channel, member) slots
held locally.

### Domain model

- **Bounded context**: realtime — presence, and the Redis driver's liveness and reconcile.
- **Vocabulary**:
  - *lapsed instance*: running, with its liveness key expired;
  - *swept*;
  - *lapse bit*: the reply to `SET … GET`;
  - *hold issued*;
  - *lapse suspected*;
  - *lapse run*: one invocation of the handler; *trailing run*;
  - *re-assert*: revocation re-check, then `#syncRosterMember` for each local slot;
  - *self-frame*: a presence frame about the receiving connection's own member id.
- **Entities**:
  - `RedisBroadcastDriver` owns renewal and detection;
  - `LapseRun` (internal) owns when the handler runs and how it stops;
  - `ChannelManager` owns revocations, the desired state, the re-assert and announcements.
- **Value objects**:
  - the beat outcome;
  - the `onRosterLapse` handler;
  - `RosterHold { arrived }`;
  - `PresenceOrigin`;
  - `PresenceTransitionFrame` (internal).
- **Invariants**:
  - A live, unrevoked member is back in the roster within one interval plus one re-check plus the
    re-assert.
  - A revoked member is never re-held by a re-assert whose re-check succeeded.
  - A nil counts as a lapse only after a hold was issued.
  - Every roster write goes through `#syncRosterMember`, and `#announcePresence` has two callers.
  - Each observer gets at most one `left` and one `joined` per departure and return.
  - There are no self-frames.
  - At most one lapse run is in flight, none runs after `close()` resolves, and a run never throws.
  - The hook is optional.
- **Out of scope**:
  - the sweep side, which is #355;
  - crash announcements, which are #348;
  - suppressing the sweeper's `left`;
  - frame order across publishers;
  - mixed fleets;
  - Redis Cluster;
  - the memory driver;
  - the revocation window itself.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | `onRosterLapse` fully typed |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | required per task |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-019 lists every block |
| MVC layering | pass | the driver reports; the manager decides the desired state (ADR 003) |
| Commit discipline | pass | fix / test / docs split |
| No environment detail in versioned files | pass | none |
| Design decisions → architect-expert | pass | disposition plus audit rulings A2 and A6 |
| Product decisions → the user | pass | P1 answered 2026-09-23 |
| Act, don't recommend | pass | — |
| TDD, red first | pass | W1, W2, W3, W3b, W7, W15 red on `main` first |
| No silent catches | pass | the per-slot catch rethrows an aggregate; a failed re-check, a failed run and a failed beat each WARN once |
| Domain Model gate | pass | §6 |

### Complexity tracking

None. `LapseRun` is a split for unit-testability that the audit asked for (A6), not a violation.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` driver seam | yes, additive | optional `onRosterLapse`; shared-lifecycle JSDoc; no new export |
| Client wire (presence frames) | yes | no `left` for a connection's own member id (upgrade item 14); frame bytes unchanged |
| Control plane | no | a re-assert's `joined` is an ordinary `presence-join` |
| Redis commands / keys | yes | the heartbeat `SET` gains `GET`; no new key family; a non-string at the alive key no longer self-heals (S4) |
| Redis driver internals | yes | beat decode, hold gate, suspicion, new `drivers/lapse_run.ts`, the `close()` order; `close()` drops the refusal handler |
| Manager internals | yes | `#reassertRoster` (revocation re-check, then slots); `emitPresence` loses its option; `PresenceTransitionFrame` |
| Memory / third-party drivers | no | the hook is optional |
| Operator logs | yes | one WARN per failed lapse run; one WARN per failed pre-re-assert revocation re-check |
| Test doubles | yes | FakeRedis `SET … GET`; canned `SET` reply in three `recordingPorts` suites |
| Docs | yes | ADR 007 (amends 004, 005, 006); `docs/realtime.md` (five places, including item 14); AGENTS.md; JSDoc |

### Documentation (this feature)

```text
.specnaut/specs/263-lapse-rehold/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| K re-assert holds queue in front of the next beat and cause the next lapse | one slot at a time (FR-011); W13 / M10, M15 |
| A member who left during the lapse is re-held | through the slot tail (FR-012); W4 / M2 |
| A member revoked during the lapse is re-held and announced (`left`, `joined`, `left` with `info`) | revocation re-check first (FR-010a, A2 / S2); W15 / M19, M20. Residue in §10 |
| A broken revocation store makes every beat re-assert K slots | a re-check failure never fails the run and never sets suspicion; W15b / M21 |
| A duplicated or missing `joined` | `arrived` decides (FR-012); W2, W5, W6 / M3, M4 |
| The boot beat misread, or a racing hold's sweep missed | `#holdIssued` set just before the `EVAL` and read at the tail (FR-003, FR-004); W7 / M5a–c |
| A lapse carried by a lost reply is missed | suspicion (FR-004); W8 / M6 |
| A decode throw or a handler throw escapes as an unhandled rejection | decode inside the `try` (FR-001); the contained run (FR-007); WS1, WS2 / M22, M23 |
| A handler runs or a hold is issued after `close()` | `LapseRun` closed, aborted and awaited (FR-007, FR-008); W11, W11b, W14 / M11, M13 |
| `close()` waits on the broker | bounded by one slot write plus its queue; stated in JSDoc (S5) |
| The self-exclusion hides a frame a client needed | in a consistent roster it excludes nobody (US4); upgrade item 14; #344 W9 green |
| Repeated failed beats or #358 backoff cost K holds each | accepted and bounded (A7, S3); the upgrade path is recorded in ADR 007 |
| A foreign non-string value at the alive key no longer heals | accepted (S4); recorded in ADR 007 |
| The stated hook lifecycle is false for an existing hook | `onControl` named as the exception; FR-006a; WL / M17 |
| `withFaultyInstance` stops injecting | the command stays a `SET` on the alive key; #310's row re-proven |
| 18 mutation rows lose or move anchors | the FR-018 list; FR-001, FR-008 step 4 and FR-015 keep the at-risk lines verbatim |

## 10. Architecture audit

_`architect-expert`, 2026-09-23, against this document before any code. Verdict at audit time:
**needs follow-up — 0 CRITICAL, 0 HIGH, 3 MEDIUM, 4 LOW**. Every finding became a plan edit; A2 is
a binding ruling, shared with S2. None re-opens the disposition._

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 MED | FR-008's `close()` order put the lapse abort between `this.revocationHandler = undefined` and `// The pass stops at its next write`, breaking #355 M15's anchor. This was the re-anchor list's one misclassification | Plan changed. FR-008's new order: `#closing` → timers → lapse close (abort) → drop `revocationHandler` → await pass → `await stopped` on its own line (never `Promise.all`) → drop handlers → close owned. Decision row updated; M15 stays intact; the count stays 18 rows / 6 batteries |
| A2 MED (ruling, with S2) | A revocation whose frame was lost during the lapse would be undone by the re-assert: re-held, then announced `joined`, then revoked again | Plan changed. FR-010a: `#reassertRoster` first awaits `reconcileRevocations()` in a try/catch with a constant WARN, then checks the signal, then runs FR-010 and FR-011 unchanged. A failed re-check stays out of the aggregate and never sets suspicion. No seam or driver change. New decision row, US3, W15, W15b, M19–M21, ADR 007 precondition. **Rejected:** (b) accept it as a residue (breaks SC-002: `left`, `joined`, `left` with `info`); (c) the driver sequencing hooks (couples hook contracts, and every third-party driver must repeat it); (d) filtering the snapshot (a second spelling of revocation); failing the re-assert when the re-check fails (a broken store would re-assert K slots every beat). **Residue:** the revocation window is unchanged; a lost revoke with no lapse; a revoke issued after the re-check's read whose frame is also lost; a revocation with no durable record; a re-check failure leaves the (b) residue for one interval |
| A4 LOW | On the serializing production client, a second hold enqueued during the boot beat sets `#holdIssued` before the tail reads it, so the boot nil counts as a lapse | Plan changed. Edge case rewritten: one harmless re-assert, no frame. Reading at the tail is kept, because reading at issue time misses W7 (ii). Added W7 (iii) and M5c; recorded in ADR 007 |
| A5 LOW | FR-006 said "closing the driver drops it", but `BroadcastDriver` declares no `close()`; and `onControl`'s exception was not in the decision row | Plan changed. The wording is now "the driver's own shutdown drops it", plus "one owner per driver: a second registration replaces the first". Row 9 names the `onControl` exception. FR-006a **accepted**, and documented in the `onControlRefused` section and "Writing a presence driver", not as a numbered upgrade item |
| A6 MED | Scheduling, abort and containment inlined into a 3 000-line driver can only be tested through FakeRedis | Plan changed. A new non-exported `LapseRun` class in `drivers/lapse_run.ts` owns the handler, the run, the trailing flag, the abort, the closed state and the contained invocation. The driver keeps detection and one field, `#lapse`. In `close()`, `const stopped = this.#lapse.close()` goes after the timers and `await stopped` after the pass. W11, W12, W14 and WS2 are unit tests with no FakeRedis, and so are their mutants. Rows 5–7 re-homed. Concrete, internal and lapse-specific: no interface, no generic runner |
| A7 LOW | Every failed beat after the first hold costs a full re-assert; a failed run followed by a successful trailing run leaves suspicion set (one redundant run) | Accepted. Recorded in ADR 007 and the "Ghost sweep" bullet, with the upgrade path: suspect only if the next successful reply arrives at least one TTL after the last successful beat was issued |
| A8 LOW | The presence-transition frame type was left unnamed | Plan changed. `PresenceTransitionFrame = Extract<OutboundFrame, { type: 'presence' }> & { action: 'joined' \| 'left'; member: PresenceMember }`, named in row 14's home. `emitPresence(channel, frame)` kept for the #344 M6 and #323 anchors |
| — | Item 14; `onControl` never dropped; `close()` never dropping `controlRefusedHandler`; the origin by object identity (sound: `uniqueMembers` keeps the first reference); the ADR 004 §2 and ADR 006 §5 amendments; W7 (ii) impossible on the serialized client; the `info` rewrite with no frame (last hold wins) | Verified and accepted |
| — | The 16 decision rows and the 18-row / 6-battery re-anchor list | Confirmed, except A1's misclassification of M15, now fixed |

**Verdict** (as reported by the seat): needs follow-up, and every finding is folded in above.
**Coverage** (as reported by the seat): this plan in full; the disposition; `drivers/redis.ts`
(heartbeat, `#ensureSweepStarted`, `holdMember`, `close()`, the hook fields); `manager.ts`
(`#syncRosterMember`, `#announcePresence`, `emitPresence`, `handleControl`, `reconcileRevocations`,
the constructor); `driver.ts`'s hooks; ADR 003–006; and the anchors of the realtime mutation
batteries. The relay did not itemise the per-file list further.

## 11. Security audit

_`security-expert`, 2026-09-23, in parallel. Verdict: **needs follow-up — 0 CRITICAL, 0 HIGH,
1 MEDIUM, 2 LOW, 2 INFO**._

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 MED | A strict beat decode or a throwing lapse handler could escape as an unhandled rejection from an interval callback or from `holdMember`'s boot beat | Plan changed. `decodeBeatReply` runs inside the SET's `try`, into a local variable the tail reads, and the `catch` keeps its two lines (FR-001, #355 M20 anchor). The lapse run is `try { await handler(signal) } catch → one WARN + onFailure`, whose `finally` clears the run and starts the trailing run. It never throws, and now lives in `LapseRun` (FR-007, A6). WS1, WS2; M22, M23 |
| S2 LOW | The re-assert can re-hold a member revoked during the lapse | Resolved by A2's binding ruling (FR-010a); W15, W15b |
| S3 LOW | #358's backoff makes beats fail → suspicion → K re-holds per survivor per pass | Accepted: bounded by coalescing and one write at a time, with no frames. Recorded in ADR 007 and "Ghost sweep". The coordinator notes it on #358 |
| S4 INFO | A broker writer can `DEL` the alive key (forcing re-asserts), or write a non-string at it: `SET … GET` answers `WRONGTYPE` and, unlike a plain `SET`, does not overwrite it, so every beat fails until it is removed | Accepted. ADR 007 records the `WRONGTYPE` non-healing as a behaviour change; edge case added |
| S5 INFO | `close()` waits at most one slot write plus whatever is queued ahead on that slot: at most 30 s per `EVAL` on the built-in client, unbounded on an injected port | Accepted. Stated in `close()`'s JSDoc (FR-008) |
| — | The self-exclusion; the re-announced `joined`; the hook as a public seam; decoder strictness; WARN content | Checked, no finding |

**Verdict** (as reported by the seat): needs follow-up, and every finding is folded in above.
**Coverage** (as reported by the seat): **partial**. It covered the plan's detection, scheduling,
re-assert and self-exclusion paths, the WARN content, and the decoder. It did **not** cover:
`driver.ts`'s hook JSDoc and RESP3 contract; `HOLD_MEMBER_SCRIPT`'s error echo; the ordering of
`reconcileRevocations` (since covered by A2); `#announceDeparture` / `sameMemberId`; and knowledge
base files 01, 03 and 10.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| P1: should a connection receive a presence frame about its own member id? | **No self-frames**, the maintainer's decision. A connection never receives `joined` or `left` about its own member id; `emitPresence` excludes the frame's member itself; `exceptMemberId` goes away; the #344 M7 and `handleControl` rows merge; v0.4.0 upgrade item **14** | 2026-09-23 |
| Any other product question? | None. A2 / S2 is a design ruling that restores a documented promise (a revoked member stays out); the other audit findings change only how the software is built | 2026-09-23 |
| Approve the architecture as audited (tasks → implement → review)? | Approved by the maintainer at stop 1 | 2026-09-23 |

### Decided without asking

- The design shape comes from the #349 `architect-expert` disposition (2026-09-23); the binding
  audit rulings A2 / S2 and A6 are folded in as written.
- The upgrade item is **14**, not 13, because #357 took 13. The header becomes "Ten breaking
  changes".
- ADR 007 also amends ADR 004 §2 and ADR 006 §5, where the disposition named only ADR 004 §5 and
  ADR 005 §5 (confirmed by A5 / the verified list).
- **The shared hook lifecycle was not true of every hook.**
  - `onControl` is named as the exception.
  - `close()` now drops the refusal handler (FR-006a, accepted by A5).
- **The re-assert's origin is found by object identity** against what `#localRoster` kept, with no
  second dedupe rule (verified sound by the architecture audit).
- `withFaultyInstance` already has `healLivenessWrites()`. The live W1 nests a normal peer inside
  its body instead of changing the helper, whose single-instance design #310 relies on.
- **Suspicion is gated by the hold flag too.** Before any hold, a failed beat carries no lapse.
- **The beat's outcome is decoded inside the SET's `try` and decided at the tail** (S1, A4). This
  keeps #355 M20's anchor, and registration happens before the re-assert.
- A slot failure makes the manager reject once, with a count and the first error, and no member id.
  `LapseRun`'s one WARN renders it. A failed revocation re-check is the manager's one exception to
  logging nothing (FR-010a).
- `emitPresence` keeps its `(channel, frame)` shape, so #344 M6's and #323's injected code still
  compiles.
- FakeRedis refuses `GET` on a key of another type; it is a declared gap in the live conformance.
- `README.md` does not list `onRosterDeparture`, so it gains no line.
- The #358 cross-reference comment is the coordinator's to post (S3), not this plan's.
