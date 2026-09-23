# Plan: read the revocation index in bounded pages, one pass at a time

**Branch**: `265-paged-revocation-read` | **Date**: 2026-09-23 | **Backlog item**:
[#359 — Realtime: the revocation re-check reads every live revocation in one reply that can breach the shared client's reply cap](https://github.com/locknessland/lockness-monorepo/issues/359)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #359 (2026-09-23, hard rule #11); this plan records it as binding and adds what the
disposition left to the plan: the decision table, the requirements, the witnesses and mutants in
testable form, and the blast radius **re-counted on `main` at `15997dd5`**, after #349 and #358
landed. The disposition was written at `d9c330ef`. Where the code moved since, this plan says so.
Five places where the disposition did not fit the current tree (D1–D5) were put to the plan
audits. Both audits are folded in (§10, §11), and the `architect-expert` rulings on D1–D5, S1 and
S2 are binding:
- the manager's re-check becomes a serial tail (A1);
- a malformed score is counted and WARNed, never skipped silently (S1/A12);
- no slow-pass WARN is added (S2).

---

## 1. Why this exists

`RedisBroadcastDriver#listRevocations` (`packages/realtime/drivers/redis.ts:2391`) runs
`LIST_REVOKED_SCRIPT` (`redis.ts:135`). That script reaps expired revocations and then returns
**every** live one in a single reply: `return redis.call('ZRANGEBYSCORE', KEYS[1], t, '+inf')`.
Nothing limits how many members the reply holds.

The read runs often, and on every instance:

- `onRevocationReconcile` (`redis.ts:2482`) arms a `setInterval` on every instance;
- each tick calls `ChannelManager#reconcileRevocations` (`manager.ts:2925`), which reads the
  whole index;
- since #349 it also runs once per lapse, before the re-assert (`manager.ts:2178`).

All of these reads go through the **shared** command client that every other consumer uses.

The index is bounded by time, not by count. Each record lives `revocationTtlSeconds` (default 300
s), and each `revoke` / `revokeChannel` call adds one member. Two revocations of the same pair are
two members (#337). A channel-scoped member carries three names, up to 602 bytes (about 620 wire
bytes in a `ZRANGEBYSCORE` reply), so about 55k maximal records fill the 32 MiB `MAX_REPLY_BYTES`
cap (`packages/redis/resp.ts`). Once the cap is crossed:

- **Every consumer of the client is refused.** The reader throws, the client drops its socket and
  opens its refusal window. This happens on every instance, on every tick, for as long as the index
  stays that large.
- **The re-check enforces nothing.** It fails on every tick, so a revoke whose one-shot control
  frame was lost is never recovered (S1/FR-014 stops holding).
- **Heap before the cap.** Below the cap, the reply is still parsed whole at about 20× wire, on
  every instance, every tick.

CWE-770 on a shared connection. #358 closed the same class for the ghost sweep's owned-set read.
It wrote the `MAX_REPLY_BYTES` rule ("a reply that grows with a collection is bounded by its
caller"), and its reply-bound inventory in `packages/realtime/AGENTS.md` lists this read as
**unbounded, tracked as #359**. This plan retires that line.

**Who is affected:** multi-instance Redis deployments that revoke at a high enough rate. Through
the shared client, every other user of each instance is affected too. How much a user can grow the
index depends on what the application revokes on, which is narrower than #358's reach.

## 2. User scenarios

### US1 — a large revocation index is fully enforced (P1)

**Given** 307 live revocations in the index (three pages plus 7), five of them for sockets on
instance B
**When** B runs one revocation pass
**Then** all five are applied, B never holds more than one page of other instances' records, and
the pass is one reap followed by `ZSCAN` pages from cursor `0` to cursor `0`.

### US2 — an index past the reply cap no longer breaks the instance (P1)

**Given** the index is larger on the wire than `MAX_REPLY_BYTES`
**When** B runs a revocation pass
**Then** B's own revocations are applied with no "revocation reconcile failed" line, and B's command
client keeps working: no socket drop, no refusal window.

### US3 — a slow pass never runs beside another (P2)

**Given** one page read is slow, taking three reconcile intervals
**When** timers and reconnects fire during it
**Then** no second pass starts beside it. The next timer pass starts one interval after the slow
pass ends, and any number of reconnects during it cause **one** trailing `reconnect` pass.

### US4 — a pair split across pages leaves once (P2)

**Given** two revocations of one local pair (two ids) land on different pages
**When** the pass applies them
**Then** the pair gets one leave and one `unsubscribed` frame, both ids are cleared, and a legitimate
re-subscribe is not kicked on the next tick (#337).

### US5 — shutting down mid-pass stops reading (P3)

**Given** B is between two page reads
**When** the application calls `B.close()`
**Then** B issues no reap or page read after `close()` begins, except the one already in flight.
There is one WARN carrying the constant closing message, and no retry, trailing pass or timer is
armed.

### Edge cases

- **The index fits in one page** (the common case): two commands, the reap `EVAL` and one `ZSCAN`
  that returns cursor `0`. Records are applied exactly as today.
- **A record written mid-pass, ahead of the cursor**: applied this pass. **Behind the cursor**: not
  returned. It is present for the whole of the next pass, so the next pass applies it. Worst case
  for a lost frame: `reconcileIntervalMs + 2P`.
- **A record whose Redis-time expiry falls mid-pass**: applied. It was live at the pass's one `now`.
- **A record that another instance's later reap removes mid-pass**: not returned. It had expired at
  that reap's `now`, so missing it is correct.
- **A member returned twice** by `ZSCAN` (a rehash): the `live` Map keyed by member absorbs it.
- **An undecodable member** (two parts, four parts, an out-of-charset part): skipped on every page
  of every pass and never deleted. It expires on its score. It is **not** counted: during a rolling
  deploy it is expected state, not a fault.
- **A malformed pair inside a well-formed page** (a non-bulk member, or a score that is not
  canonical epoch seconds, `inf` included): the pair is skipped **and counted**. After the loop
  ends, the pass logs one WARN carrying the constant message and the count. It never throws, since
  a planted `+inf` member is never reaped and would otherwise fail every pass.
- **An empty page with a non-zero cursor**: the pass goes on.
- **A page read throws, or a page is malformed**: nothing is applied, not even earlier pages'
  matches. One WARN names the trigger. On the reconnect trigger the one #308 retry is armed.
- **A reconnect while a pass is running**: one trailing `reconnect` pass, which takes the one #308
  retry if it fails. A `reconnect-retry` while a pass is running is also coalesced, and `'reconnect'`
  wins over it.
- **The timer fires while a reconnect or retry pass is running**: nothing starts, and that pass's
  end arms the next timer (§12 D2).
- **The lapse run's re-check (#349) while a driver-triggered pass is running**: it queues behind
  the pass on the manager's re-check tail (FR-009a) and then reads fresh. The two never overlap, so
  a pair left by one pass is never re-kicked by the other's stale snapshot (A1). The lapse re-hold
  can wait up to one driver pass (≤ P).
- **`onRevocationReconcile` re-registered while a pass is running**: at most one timer exists, and
  the re-registration's timer is the one that stays.
- **A small sorted set** (listpack: by default ≤ 128 entries of ≤ 64 bytes): Redis answers it whole
  with cursor `0`, whatever `COUNT` says. It is small by construction.
- **A broker that ignores `COUNT`** (raised `zset-max-listpack-*`, or a Redis-compatible server that
  answers `ZSCAN` whole) reopens the large reply on that deployment. This is #358's S4 residue for
  this read.
- **A mixed `0.3.0` / `0.4.0` fleet**: a `0.3.0` instance still reads the whole index with
  `LIST_REVOKED_SCRIPT` on its own client.
- **A third-party driver that ignores `owns`**: correct, because the manager filters again, but
  unbounded in its own store.

## 3. Requirements

**The reap: the only delete**

- **FR-001**: `REAP_REVOKED_SCRIPT` replaces `LIST_REVOKED_SCRIPT` (module-private, beside
  `MARK_REVOKED_SCRIPT`). It reads `TIME`, runs `ZREMRANGEBYSCORE KEYS[1] -inf t` as a **bare call
  statement**, and **returns `t`**, the seconds field as Redis gives it. It is `EVAL <script> 1
  <index>` with no `ARGV`. After this change:
  - `grep -n "ZRANGEBYSCORE" packages/realtime/drivers/redis.ts` finds no production use;
  - `grep -n "'ZSCAN'"` finds exactly one line, in `listRevocations`;
  - `grep -n "ZREMRANGEBYSCORE"` finds exactly one line, in `REAP_REVOKED_SCRIPT`.

  Its JSDoc records why the split does not re-open #276. The delete is still one script, bounded by
  its own `TIME`; the read deletes nothing; and `t` is carried, never re-read.
- **FR-002**: **One grammar for epoch seconds** (A12): a module constant `EPOCH_SECONDS =
  /^(0|[1-9][0-9]{0,14})$/` (canonical, at most 15 digits, so `Number` is exact). It is shared by
  the reap reply and the page's score parse, and it is spelled nowhere else.
  `decodeReapReply(reply): number` accepts **only** a bulk string matching `EPOCH_SECONDS` and
  returns it as a number. Anything else throws **one constant message**, `REAP_REPLY_REFUSED`,
  which never carries the reply, its type or its length. Both are exported for the test suite only.
  `mod.ts` does not re-export them.

**The paged read**

- **FR-003**: `REVOCATION_SCAN_COUNT = 100` sits beside `REVOCATION_SCOPE_SEPARATOR`. It is exported
  for the test suite only and is not configurable: no driver option, no environment variable. Its
  JSDoc states the bound:
  - a member is at most 602 bytes and its score about 12;
  - a page of about 100 pairs plus the rest of the last bucket is under about 130 KB of wire
    (typically about 12 KB), which is a few MiB of heap at the 20× amplification `resp.ts` measured;
  - it holds only while the broker honours `COUNT`;
  - why the page is 100 and not 1,000: the pass runs on every instance on every tick.
- **FR-004**: `listRevocations(owns?)` is **the single home of the pass's read half**: the reap, the
  pages, the one `now`, the decode filter and the selection. Its shape:
  - `if (this.#closing) throw new Error(REVOCATION_PASS_CLOSING)`;
  - `const t = decodeReapReply(await …EVAL REAP_REVOKED_SCRIPT…)`;
  - then `let cursor = '0'` and a loop. Each iteration checks
    `if (this.#closing) throw new Error(REVOCATION_PASS_CLOSING)`, then reads one
    `ZSCAN <index> <cursor> COUNT <REVOCATION_SCAN_COUNT>` through `decodeRevocationPage`, then runs
    the per-entry steps (FR-006), then takes `cursor = page.cursor`;
  - it ends **only** when the cursor comes back `'0'` (never on an empty or short page), and the
    loop is spelled naturally, `} while (cursor !== '0')`;
  - after the loop, if the pages' `skipped` counts sum to more than zero, one WARN (FR-006a);
  - it returns `[...live.values()]`.

  **No budget, no resume state, no page counter.** `ZSCAN` takes **no option but `COUNT`**.
  `sweep_paging_358` M3 anchors on that same `while` line in `#sweepOwned`. It is re-anchored on
  its sweep-only context (A5, §4) and re-proven live.
- **FR-005**: `decodeRevocationPage(reply)` **reuses #358's `decodeScanReply`** for the envelope, so
  every envelope refusal throws `SCAN_REPLY_REFUSED`. It then pairs the items, and it is **the one
  home of "a well-formed pair"** (A12):
  - an **odd-length** item list throws one constant message, `REVOCATION_PAGE_REFUSED`, because from
    that point every score would be read as a member;
  - inside a well-formed page, a pair whose member is not a bulk string, or whose score is not a
    bulk string matching `EPOCH_SECONDS` (so `inf`, `+inf`, a decimal point, an exponent), is
    **skipped and counted**, never thrown (S1: a planted `+inf` would otherwise fail every pass).

  It returns
  `{ cursor, entries: readonly { member: string; score: number }[], skipped: number }`. It and its
  messages are exported for the test suite only. This is the **one** `ZSCAN`-specific decoding
  step. There is no second envelope decoder, and `decodeScanReply` stays in `realtime` (its second
  caller is in the same module).
- **FR-006**: **Per entry, in this order**:
  1. `if (!(entry.score > t)) continue`;
  2. `const revocation = this.#decodeRevocation(entry.member)`, with the existing #304/#332 comment
     block moved beside it (its argument is unchanged: the filter is still the boundary);
  3. `if (revocation === undefined) continue`;
  4. `if (owns !== undefined && !owns(revocation.target)) continue`;
  5. `live.set(entry.member, revocation)`.

  `#decodeRevocation`, `#encodeRevocation` and `REVOCATION_SCOPE_SEPARATOR` stay **byte for byte**.
  The decode filter stays non-destructive, and nothing in the read path deletes. A member that is
  well formed but does not decode is **not** counted (see the edge cases).
- **FR-006a** (S1, A12): **The skip count and its one WARN.** `listRevocations` sums each page's
  `skipped`. Only after the loop has ended, and only if the sum is above zero, it logs **one WARN
  per pass**: a constant message (`REVOCATION_PAIRS_SKIPPED`, saying well-formed pages carried
  pairs that were not revocations and that a broker formatting scores differently would leave
  every revocation unenforced) followed by the integer. It carries no member or score bytes.
  - A pass that throws reports only its own failure, not a skip count.
  - A failing pass is caught by `#runRevocationReconcile`'s catch, and a skip WARN is not
    a failure.
- **FR-007**: The old `unexpected reply shape — treating it as empty` WARN is **removed**. A
  malformed reap reply or page, or a closing driver, **throws**. It never returns `[]`, which is
  the answer "nobody is revoked". No thrown message carries broker bytes.

**The port**

- **FR-008**: `packages/realtime/driver.ts`:
  `listRevocations?(owns?: (target: string) => boolean): Revocation[] | Promise<Revocation[]>`,
  with the same signature on `RevocationStoreDriver.listRevocations`. The JSDoc (hard rule #7)
  carries:
  - `@param owns`: implementations SHOULD apply it while enumerating; the caller filters again, so
    ignoring it is correct but unbounded; it is called synchronously, and a throw from it fails
    the call;
  - the refined liveness contract, **whose one home is this JSDoc** (A7a): every record live at
    the pass's one `now` and present for the whole enumeration is returned, and a record written
    or removed during the enumeration may or may not be;
  - an `@example`.

  `revocationStore`'s feature detection is unchanged. The zero-argument call returns everything, so
  existing callers and custom drivers need no change.
- **FR-009**: `ChannelManager#reconcileRevocations` (`manager.ts:2939`) passes
  `(target) => this.connections.has(target)` and **keeps** its own
  `if (!this.connections.has(revocation.target)) continue` byte for byte. It also keeps the grouping
  by pair, the per-revocation `try` from #349 and the apply order. It applies **nothing before
  `listRevocations` returns**: "apply as you stream" is forbidden, because it re-opens #337 across
  page boundaries.
- **FR-009a** (A1, the binding D1 ruling): **The manager's re-check is serial.**
  `reconcileRevocations()` becomes a gate. It appends one run to a manager-private serial tail (the
  ADR 003 slot-tail idiom) and returns that run's promise.
  - **Order.** Each run starts only after the previous one has settled, so every run reads the
    index fresh. That satisfies #349 A2: a record written while the lapse re-check waited is
    applied before any re-hold.
  - **Failure.** A rejected run never stops the tail, which continues on **both** settle branches.
    The caller of that run still gets its rejection.
  - **No coalescing.** The tail is at most two deep, one running and one queued, because the
    callers (the driver's single-flight pass and the serialized lapse run) are each one at a time.
  - **Verbatim move.** Today's body moves **byte for byte into a private method at the same
    indentation**. `channel_revoke_332`'s two manager anchors (the `connections.has` line and the
    `JSON.stringify` pair key) and `lapse_rehold_349` M19–M21 (`#reassertRoster`'s
    `await this.reconcileRevocations()`) therefore stay byte-identical: 0 re-anchors.
  - **Callers.** Both call sites, the driver's handler registration (`manager.ts:1058`) and
    `#reassertRoster`, keep calling `reconcileRevocations()`.

  This closes the #337 re-kick window. Before it, pass A leaves pair X, sends `unsubscribed` and
  clears id1; the client re-subscribes; then a concurrent pass B, still holding id1 from its older
  snapshot, kicks it again.

**One revocation pass at a time**

- **FR-010**: `#armRevocationReconcile()` is **the single arming site of the revocation timer**.
  **The timer is armed from the end of the pass that consumed it; an edge-triggered pass never
  moves a pending timer** (A2). The residue is at most one extra pass per reconnect.
  - It returns while `#closing`, and returns while a timer is already pending.
  - Otherwise it arms one `setTimeout(reconcileIntervalMs)`. Its callback clears the field and calls
    `#startRevocationPass('timer')`.
  - The field's type becomes `ReturnType<typeof setTimeout>`. The bare `setInterval` is gone.
  - `onRevocationReconcile` replaces the handler, clears any pending timer (`clearTimeout`), then
    calls `#armRevocationReconcile()`.
- **FR-011**: `#startRevocationPass(trigger): void` is **the single entry point for all three
  triggers**: the timer callback, the reconnect seam (`subscriber.onReconnect`) and the #308 retry
  lambda, which is re-pointed to `() => this.#startRevocationPass('reconnect-retry')`.
  - **It returns `void`** (A6). A promise returned to a coalesced caller would resolve before that
    caller's trailing pass, and it would read as "my pass finished".
  - **The seam and tests.** The reconnect seam therefore no longer hands back a pass promise. Tests
    that `await fireReconnect()` to observe a finished pass wait with the drain (FR-015).
  - **While a pass is in flight:**
    - `'timer'` does nothing;
    - `'reconnect'` or `'reconnect-retry'` sets `#revocationRerun`, and `'reconnect'` wins.
  - **Otherwise** it stores
    `#revocationPass = this.#runRevocationReconcile(trigger).finally(…)`. The `finally`:
    1. clears the slot;
    2. takes and clears `#revocationRerun`;
    3. starts that trailing pass through `#startRevocationPass` **or** calls
       `#armRevocationReconcile()`.
  - It has **no `#closing` check of its own**. The handler drop in `close()` and
    `#runRevocationReconcile`'s `if (!this.revocationHandler) return` are the one gate that
    quiesces a pass start (the #271 comment's standing rule). `#armRevocationReconcile`'s check is
    the one gate for timers. So after `close()` begins, a trailing pass runs nothing, and the timer
    is not re-armed.
- **FR-012**: `#runRevocationReconcile`'s **body stays verbatim**: the handler guard, the call, the
  catch and its WARN template, both `return` guards (`trigger !== 'reconnect'` and the #355
  `#closing`), the retry `clearTimeout`, `Deno.unrefTimer` and the field write. Only the retry
  lambda's target changes (no battery row anchors it). Its JSDoc sentence "the timer keeps running"
  becomes "the next pass is armed from this one's end".
- **FR-013**: `close()`:
  - `clearInterval(this.revocationTimer)` becomes `clearTimeout(this.revocationTimer)`;
  - it clears `#revocationRerun`;
  - the lines that drop the handler and clear the retry stay **byte for byte** (the #308 and #355
    M15 anchors);
  - it adds no `await` of the revocation pass (out of scope, disposition "Not solved").

  Its JSDoc sentence about the lapse run's wait changes (A9). "The revocation re-check in flight
  (the run's first step, which the signal cannot cut short)" becomes a statement of both cases:
  - the re-check stops before its next page read, so at most the one command in flight;
  - **but** if that command is the **last** page, `listRevocations` returns normally, and the
    manager's apply phase (roster writes, leaves, clears) then runs while `close()` waits.

  Residue: a closing throw inside the lapse run surfaces as `#reassertRoster`'s WARN ("the holds
  are re-asserted anyway…"), whose text is false at shutdown. It is named in ADR 009 and not
  reworded here, because that text is #349's.

**Test infrastructure**

- **FR-014**: `packages/realtime/tests/fake_redis.ts` gains a `ZSCAN` arm on **#358's private scan
  core** (`#scan`, `scanSlot`, `scanOrder`, the per-key and cumulative ceilings). It does not walk
  its own way.
  - It reads the live sorted set (`#liveZset`, so key expiry is honoured).
  - It answers `[cursor, [member, score, …]]`. Each score is formatted as Redis formats it, so an
    integral score is `String(n)` with no decimal point.
  - An absent key answers `['0', []]`.
  - It **refuses** a missing `COUNT`, any option but `COUNT` (`MATCH`, and `NOSCORES` on Redis 8),
    a non-canonical cursor and a non-positive `COUNT`.
  - The header adds `ZSCAN` to the modelled surface and states what it does not model
    (duplicates). It notes that `ZRANGEBYSCORE` is now issued by tests only.
  - The ceilings' sizing sentence is re-checked against the revocation index, which is scanned once
    per pass by every driver on the fake for the whole test (§9).
- **FR-015**: **A test that needs a finished revocation pass waits with FakeTime's drain** (#358
  FR-012, whose one home is the `packages/realtime/AGENTS.md` pitfall): `await time.runMicrotasks()`
  or `await time.tickAsync(0)` after the tick that fires it. A witness that holds a page or an
  apply (R8–R10, R14) waits on the hold's `reached`. A test that fires the reconnect seam drains
  afterwards: the seam returns `void` (FR-011). Never a fixed count of microtasks, and never `close()` unless
  `close()` is the subject.

**Tests, anchors, docs**

- **FR-016**: Witnesses R1, R3–R15 go in a new `packages/realtime/tests/revocation_paging_359.test.ts`.
  R2 goes in the same file, gated on `LIVE_BROKER` (`packages/redis/tests/live_broker.ts`). R1, R2,
  R8, R9, R10, R12 (the skip WARN) and R14 are committed red on `main` first. WC extends:
  - `fake_redis_conformance.test.ts` (#280, the refusals);
  - `live_fake_conformance.test.ts` (#285, the reply shape, the score format and full-iteration
    coverage, fake **and** live).
- **FR-016a** (A10): **One pair-list rule.** A `sortedPairs` helper in the #285 normalizer sorts a
  flat `[k, v, k, v, …]` list by pair and keeps each pair together. It is used for:
  - `HGETALL`, which today goes through `sortedItems` and so has the same defect: a field paired
    with the wrong value compares equal;
  - a `ZSCAN` reply, **only when its cursor is `'0'`**.

  `sortedItems` stays for `SMEMBERS` and the `SSCAN` items, which are single elements.
  - The coverage case seeds fixed far-future scores through `ZADD`, so members **and** scores
    compare equal.
  - It iterates each backend to cursor `0` and compares the union of pairs.
  - Its live seed has more than 128 entries, or one longer than 64 bytes, and it asserts the live
    broker needed **more than one call**.
- **FR-017**: The existing tests this makes wrong are repaired, never weakened. They are listed in
  §4.
- **FR-018**: Mutation battery `packages/realtime/tests/mutations/revocation_paging_359.ts`, rows
  M1–M21, each proven live, plus the WC rows in `fake_redis_280` and `live_conformance_285` (§4). Its
  anchors must be unique in `redis.ts` **after** this change. `cursor = page.cursor` and the loop's
  `while` line also exist in `#sweepOwned`, so each row anchors on revocation-specific context.
- **FR-019**: Docs.
  - **ADR 009 (new)**, `docs/adr/009-realtime-revocation-recheck-reads-index-in-pages.md`, "The
    revocation re-check reads the index in pages, one pass at a time". It records:
    - the reap/read split and why it keeps #276's race closed;
    - the carried `now`;
    - the `owns` port parameter;
    - nothing applied before the enumeration ends;
    - the manager's serial re-check tail (A1);
    - the timer rule: armed from the end of the pass that consumed it, and never moved by an
      edge-triggered pass (A2);
    - the counted skip and its one WARN (S1);
    - no budget, and the enforcement bound `reconcileIntervalMs + 2P`, **linked** to its one home,
      the `onRevocationReconcile` JSDoc (A7d, S2);
    - the rejected shapes with their cost, including a slow-pass WARN (S2 ruling);
    - what is not solved:
      - the lapse re-hold can wait up to one driver pass (≤ P);
      - `#reassertRoster`'s WARN text is false at shutdown (A9);
      - `close()` still waits through an apply phase when the page in flight is the last one (A9);
      - undecodable well-formed members are not counted;
      - the owner-partitioned index. Its revisit trigger ("a pass above 10% of
        `reconcileIntervalMs`") **cannot be observed until the pass-duration metric exists**. That
        metric is one duration-and-pages measure for both ADR 006 passes on the observability
        surface, filed separately;
    - the standing constraint: *the revocation index is read only by `listRevocations`' `ZSCAN`,
      with `COUNT` set to `REVOCATION_SCAN_COUNT`, and deleted only by `REAP_REVOKED_SCRIPT`; no
      re-check reply grows with the index.*

    It amends **ADR 006 §2** through its Status line and an inline callout (ADR 003's convention):
    the one-pass rule now covers the revocation timer, with a coalesced trailing pass for the
    reconnect trigger, because the reconnect is edge-triggered where the sweep is level-triggered.
    ADR 009 contains no "two passes may overlap" statement: the manager's tail removes the overlap
    (A1).
    ADR 008 §5's "`LIST_REVOKED_SCRIPT` → #359" line gets an inline callout pointing at ADR 009.
  - **`docs/realtime.md`, the revocation section**:
    - "reaping and listing happen in one server-side operation against one `now`" is replaced by
      the split and the carried `now`;
    - the #278 note "one round trip whatever the number of revocations" is corrected to one reap
      plus pages, never one per member;
    - the triggers table gains one pass at a time and the trailing pass;
    - "a window of roughly one round-trip" becomes one pass;
    - the enforcement bound gains the `2P` term, linked to its home and not restated;
    - the skip WARN in the failure table;
    - custom-driver guidance on `owns`;
    - the mixed-fleet note.

    It is **not** a numbered v0.4.0 upgrade item.
  - **`packages/realtime/AGENTS.md`**:
    - the reply-bound inventory's revocation line becomes
      `the revocation index → REVOCATION_SCAN_COUNT (paged, #359); the reap answers one integer`;
    - the pitfall "Revocation liveness is decided by Redis" is reworded: the reap's `TIME`, carried
      to every page, never re-read, never `Date.now()`;
    - the `listRevocations fails CLOSED` pitfall gains "the read path never deletes; the reap is
      the only delete";
    - new pitfalls:
      - the re-check applies nothing before the enumeration ends (#337 across pages);
      - one revocation pass at a time, with its homes (the driver's single-flight **and** the
        manager's serial re-check tail, and why both exist);
      - a malformed page fails the pass rather than reading as empty; a malformed pair inside a
        well-formed page is counted and WARNed, never thrown and never silent;
    - the #358 FakeTime-drain pitfall gains "revocation passes too";
    - **Tests** lists the new file and battery.
  - **JSDoc**: `REAP_REVOKED_SCRIPT`, `REVOCATION_SCAN_COUNT`, `decodeReapReply`,
    `decodeRevocationPage`, `EPOCH_SECONDS`, the four message constants, `listRevocations`
    (`@param owns`, the paged `@example`, the skip WARN; it links to the port's contract rather than
    restating it), and `#armRevocationReconcile` and `#startRevocationPass` in the style of
    `#armReconcile`. Also: the `revocationTimer` field, `#revocationPass`, `#revocationRerun`,
    `#runRevocationReconcile` (FR-012), `close()` (FR-013), and the manager's `reconcileRevocations`
    gate, its private body method and the tail field (FR-009a).
  - **`onRevocationReconcile`'s JSDoc is the one home of the enforcement bound** (A7d, S2):
    - `~reconcileIntervalMs` becomes `reconcileIntervalMs + 2P`;
    - P is defined there as **1 + ⌈N / `REVOCATION_SCAN_COUNT`⌉ one-at-a-time round trips, each
      capped at the command client's read timeout**;
    - a failed pass restarts the clock;
    - the bound holds only while the broker honours `COUNT`.

    `docs/realtime.md`, ADR 009 and this plan link to it rather than restating it.
  - **Test prose**: `tests/recording_ports.ts:46-49` ("anything unlisted answers `null`…" gains the
    reap and `ZSCAN`); `tests/reconcile_single_pass_355.test.ts:25` (the `driver_redis.test.ts` row,
    "no — the revocation timer is still an interval", is no longer true); and the comments in §4.
  - **Nothing in `packages/redis/resp.ts`**: #358 wrote the rule, and each consumer documents its
    own bound.

## 4. Success criteria

- **SC-001**: Every revocation live at a pass's `now` and present for the whole pass is applied by
  that pass, however large the index. A record written mid-pass is applied within
  `reconcileIntervalMs + 2P`.
- **SC-002**: No re-check reply grows with the index. An instance holds at most one page of other
  instances' records, plus its own matches, until the pass ends.
- **SC-003**: An index past the reply cap is enforced without a failure line and without disturbing
  any other command on the instance's client.
- **SC-004**: A live revocation is never deleted, and an undecodable one is never deleted by a
  reader that cannot decode it.
- **SC-005**: At most one revocation re-check runs per instance at a time, whether the timer, a
  reconnect or a lapse triggered it. After `close()` begins, no reap or page read starts except
  the one in flight.
- **SC-006**: A pair whose records sit on different pages leaves once and has every id cleared. A
  client that re-subscribes after that leave is not kicked by another re-check.
- **SC-007**: No application or custom driver needs a code change. The `owns` parameter is optional,
  and `mod.ts` is byte-identical.
- **SC-008**: A broker whose pairs cannot be read (a score format this driver does not parse) is
  visible in the log, as one WARN per pass with a count, never as silence.

**#278 SC-001 is refined, not kept.** It becomes "one reap plus pages, **never one command per
member**": exactly two commands for an index that fits one page, at most 1 + ⌈N/COUNT⌉ (give or take
the rest of a bucket) beyond that. **#276's port contract** is refined as FR-008 says.

**Witnesses** (FR-016). "Red" means it fails on `main` at `15997dd5`. Every FakeRedis witness that
needs a finished pass waits per FR-015.

| # | Setup → assertion |
| :--- | :--- |
| R1 (red) | FakeRedis index of 307 live records, five for B's sockets (connection and channel scope). One pass on B, drained → all five applied; the command log shows **one** reap `EVAL` whose script has no `ZRANGE`, then ≥ 4 `ZSCAN <index> <cursor> COUNT <REVOCATION_SCAN_COUNT>`, the first at `0` and the last answered `0`; no other read of the index |
| R2 (red, live broker) | One seeding `EVAL` returning an integer seeds about 60,000 channel-scoped members of maximum length (602 B each, about 620 wire bytes in a `ZRANGEBYSCORE` reply, about 37 MB > 33,554,432 B), scored at `TIME + 300`, plus 3 for B's sockets. After one pass on B: the 3 are applied, there is no "revocation reconcile failed" WARN, and a command on B's client right afterwards completes. On `main`: "RESP reply exceeds", then the refusal window. The only witness of the cap itself |
| R3 | The pass's one `now`, with a hook between the reap and the first page: (a) the fake's Redis clock moves past record A's expiry → A **is** applied; (b) a member planted with `score ≤ t` → not applied; (c) FakeTime skewed ±1 h from `setTime()` → the outcome does not change |
| R4 | Undecodable members (two parts, four parts, bad charset), spread across pages, **plus** two expired members (score ≤ `t`). After one pass: the undecodable members survive and none is applied; the two expired members **are gone**: `redis.zcard(INDEX)` falls by exactly 2, and a raw `ZRANGEBYSCORE -inf +inf` no longer lists them. This is the witness that the reap runs (A11); no skip WARN, since undecodable members are not counted |
| R5 | #337 across pages: two ids of one local pair placed on different pages (`FakeRedis.scanSlot`) → one leave, one `unsubscribed`, both ids cleared; after a legitimate re-subscribe, the next tick does not kick. Green on `main`; it kills "apply per page" |
| R6 | A record for a local socket written between two pages: (a) ahead of the cursor → applied this pass; (b) behind it → not this pass, applied by the next |
| R7 | A page that comes back empty with a non-zero cursor does not end the pass. The fake's call ceiling turns a stalled cursor into a failure, not a hang |
| R8 (red) | One `ZSCAN` held across 3× the interval, released at 3.5× → exactly one reap before release; **no** reap in (3.5×, 4.5×); the next reap at 4.5× (one interval after the held pass ends, which `setInterval` would put at 4×) |
| R9 (red) | One reconnect during a held pass → exactly one trailing pass with trigger `reconnect` after it. Two reconnects → one trailing pass. A reconnect and a retry → one pass, trigger `reconnect`, in both arrival orders (review: one order alone cannot tell "reconnect wins" from "the last one wins"). A failing trailing pass arms the one #308 retry |
| R10 (red) | `close()` during a held page read, with a reconnect fired during the hold (`close()` is the subject) → no `ZSCAN` after `close()` begins other than the one in flight. **Only after the held page is released and drained**: `revocationTimer` is unset (asserted then, or M18 survives); **no reap follows**, so the recorded rerun had no effect (the effect, not the private field, A3); one WARN with `REVOCATION_PASS_CLOSING`; no retry |
| R11 | B's second `ZSCAN` throws → **nothing** is applied, including page 1's matches; the WARN names the trigger; the next pass applies everything |
| R12 (unit) | `decodeReapReply`: anything but a canonical digit bulk string of ≤ 15 digits throws a byte-identical `REAP_REPLY_REFUSED`, which carries no marker. `decodeRevocationPage`: nil, the wrong arity, a missing or non-canonical cursor and a non-array body each throw `SCAN_REPLY_REFUSED`; an odd-length body throws `REVOCATION_PAGE_REFUSED`; neither carries a marker planted in the reply. In a well-formed page, a non-bulk member, a non-bulk score, and scores `inf`, `+inf`, `1.5`, `1e9`, `01` and a 16-digit value each skip that pair only, and `skipped` counts each one. Through `listRevocations` on FakeRedis, pairs planted with such scores (and one `+inf` member added raw) → the other records are applied; after the pass, **exactly one** WARN with `REVOCATION_PAIRS_SKIPPED` and the exact count; no marker from the planted member or score appears in it; no throw; a second pass logs it again. A clean pass logs no skip WARN (S1, A12) |
| R13 | The predicate: (a) `listRevocations(owns)` returns only the targets `owns` accepts, and calls it once per decoded record; `listRevocations()` returns everything; (b) the manager's predicate accepts exactly its local ids (recording driver); (c) a driver that ignores the argument and returns every record → the manager still applies only local records; (d) as built: an id absent from `connections` while a membership stranded by #361 still names it → its record is not applied, so not cleared; (e) (review) a throw from `owns` fails `listRevocations`: it rejects with that error and deletes nothing |
| R14 (red) | The manager's tail (A1). The apply of a driver-triggered pass is held (a hold on its first `ZREM` clear). Then A's lapse fires its re-assert. Assert: **no second reap** is issued until the hold is released. A channel revocation written during the hold, for a pair A holds, is applied **before** any re-hold of that slot (no `joined`). A pair that the first pass left and whose client re-subscribed during the hold is **not** kicked by the queued run (#337 re-kick window, S3) |
| R15 | The tail survives a failure. One re-check run rejects (its reap `EVAL` refused). Its caller sees the rejection (the #308 WARN, or #349's re-check WARN). A later `reconcileRevocations()` call still issues a reap and applies a planted record |
| WC | FR-014, FR-016a. Fake **and** live: the `ZSCAN` reply shape; an absent key answers `['0', []]`; a full iteration's union of pairs equals the seeded set, and live needed more than one call; a `MARK_REVOKED_SCRIPT` score reads back as a decimal-integer string. Fake only: `ZSCAN` without `COUNT`, with `MATCH`, `NOSCORES` or any other option, or with a non-canonical cursor is **refused** (#280) |
| — | #276, #278 (refined), #304, #308, #332, #337, #349 W15/W15b/W15c and #355 W4 (vi)/WR stay green, repaired as listed below |

**Mutants** (FR-018), battery `tests/mutations/revocation_paging_359.ts`, each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| M1 | `LIST_REVOKED_SCRIPT` restored as the read (the one-reply `ZRANGEBYSCORE`) | R1 (R2 live) |
| M2a / M2b | `ZSCAN` with no `COUNT` / with `REVOCATION_SCAN_COUNT * 10` | R1 (the fake refuses the first; the value is pinned to the constant) |
| M3 | the page loop runs once | R1 |
| M4 | an inserted `if (page.entries.length === 0) break`: an empty page ends the pass | R7 |
| M5 | every `ZSCAN` sends cursor `'0'`: the cursor never advances | R7 (the ceiling) |
| M6 | the `score > t` filter removed | R3(b) |
| M7 | `TIME` re-read for each page (the reap moved inside the loop) | R3(a) |
| M8 | the filter judged against `Date.now() / 1000` | R3(c) |
| M9 | no `#closing` check before a page read (anchored on the check **plus** the `ZSCAN` read line, since the check appears twice) | R10 |
| M10 | the matches so far returned when a page throws (a `try` around the loop) | R11 |
| M11 | the pairing step accepts an odd-length body, dropping the trailing item (re-targeted, §12 D4) | R12 |
| M12 | the Redis driver ignores `owns` | R13(a) |
| M13 | the manager stops passing the predicate | R13(b) |
| M14 | the manager's own `connections.has` check deleted | R13(d), as built: against a foreign id R13(c) cannot see it, since applying is a no-op there. R13(d) builds the one reachable state that tells them apart, #361's stranded membership. Once #361 is fixed there is no reachable state where deleting the check is wrong, and M14 moves to `expectSurvival` |
| M15 | the revocation timer back on `setInterval` | R8 (the 4× vs 4.5× timing) |
| M16 | a reconnect during a pass dropped (the rerun not recorded) | R9 |
| M17 | trailing passes not coalesced (a counter instead of one slot) | R9 |
| M18 | `#armRevocationReconcile`'s `#closing` check dropped: the timer re-armed after close | R10 (asserted after the release and drain) |
| M19 | the manager's re-check tail removed: `reconcileRevocations()` calls the body directly | R14 |
| M20 | the tail continued only on success (`.then(run)` instead of both settle branches) | R15 |
| M21 | the skip counter dropped: a malformed pair skipped without being counted (no WARN) | R12 |
| M22 (review) | the rerun slot's last writer wins, instead of `'reconnect'` | R9(c), the reconnect-then-retry order |
| M23 (review) | a throw from `owns` swallowed and read as "not mine" | R13(e) |
| F1 (`fake_redis_280`) | `ZSCAN` accepts a missing `COUNT` again | WC |
| F2 (`fake_redis_280`) | `ZSCAN` accepts `MATCH` again | WC |
| L1 (`live_conformance_285`) | the fake's **`ZSCAN` arm** drops one member before calling the core. The core's own skip mutant is #358's L1 and is not duplicated | WC |
| L2 (`live_conformance_285`) | the fake formats an integral score with a decimal point | WC |
| L3 (`live_conformance_285`, review) | the fake's `HGETALL` pairs each field with another field's value: guards `sortedPairs`, since a flat element sort hides it | the #285 sequence comparison |

**Re-anchor and repair list**: counted on `main` at `15997dd5` by grepping every battery under
`tests/mutations/` for anchors in the code this touches, and every test for `LIST_REVOKED`,
`ZRANGEBYSCORE`, the index key, `listRevocations` and the revocation cadence.

*Adjacent battery rows: 19. Of these, **1 is re-anchored**, **1 is relabelled** and 17 stay as
they are, provided the verbatim constraints of FR-006, FR-009, FR-009a, FR-012 and FR-013 hold.
The architecture audit confirmed the count.*

- The disposition's 13, plus one it missed (A8), all unchanged if kept verbatim:
  - #304: `parts.every`;
  - #332 ×5: the separator, `parts.length`, `parts.every`, the encoder `join`, and the manager's
    `if (!this.connections.has(revocation.target)) continue`;
  - #332 "#337 the reconcile applies each record on its own", which anchors on the manager's
    `const key = JSON.stringify([revocation.target, revocation.channel])`. FR-009a moves the body
    at the same indentation, so it stays byte-identical;
  - #308 ×5: `if (trigger !== 'reconnect') return` ×3, the WARN template, and `close()` clearing the
    retry (`expectSurvival`);
  - #355: M15 (`this.revocationHandler = undefined` in `close()` plus `await this.#reconcilePass`,
    which must stay unique) and M25 (the retry guard block).
- **New since the disposition, unchanged**: `lapse_rehold_349` M19, M20 and M21 anchor on
  `#reassertRoster`'s `await this.reconcileRevocations()` `try`, which FR-009a leaves as it is (the
  gate keeps the name).
- **New since the disposition, 1 re-anchored** (A5, decided): `sweep_paging_358` M3 anchors on
  `        } while (cursor !== '0')\n`. `listRevocations` uses the same natural spelling, which makes
  that anchor match twice. M3 is re-anchored on
  `"            if (end !== 'swept') return end\n            cursor = page.cursor\n        } while (cursor !== '0')\n"`
  (its mutant text changes to match) and re-proven live. #358's other anchors (`PAGE_LOOP`,
  `SCAN_ARGS`, `CLOSING_BEFORE_PAGE_READ`, `SWEEP_PAGE_CALL`, M7, and M8/M10/M11 inside
  `decodeScanReply`) stay unique.
- **1 relabelled, and 2 re-verified live** (A11): `live_conformance_285`'s "the Lua subset drops a
  statement — the reap never runs" is relabelled "…— `MARK_REVOKED_SCRIPT`'s `ZADD` never runs".
  After the split, that is the only way the killing test ("the revocation scripts agree") catches
  it: the dropped reap alone leaves the membership unchanged. The reap itself is proven to run by
  R4's expired-members assertion. The same row and "Lua `[n]` indexing off by one" are re-verified
  live. FR-001 keeps the reap's `ZREMRANGEBYSCORE` a bare call statement.
- **Also re-run** (A10): the `live_conformance_285` rows whose killing tests compare `HGETALL`,
  since `sortedPairs` replaces `sortedItems` there. The comparison gets stricter, so a row can only
  gain kills.
- Unaffected: the two `fake_redis_280` `ZRANGEBYSCORE` rows (the arm stays, and tests still use it).

*Tests to re-script: 5 sites in 5 files.*

1. `revocation_atomicity.test.ts:322` (#278/SC-001): for 0, 1 and 50 revocations the command list
   is `['EVAL', 'ZSCAN']`. The test is renamed to the refined wording. The positive control stays.
2. `connection_id_charset.test.ts:157-218` (#304 reconcile filter): the canned 1-key `EVAL` list
   becomes a reap `t` (digit bulk) plus a canned `ZSCAN` page of `(member, score)` pairs, scores
   greater than `t`. The comment at `:173` ("the driver logs 'unexpected reply shape' and returns
   nothing") becomes "the pass throws".
3. `prefix_anchoring.test.ts:206-225` (`CANNED`):
   - `EVAL` with one declared key and **no operand after it** (the reap) answers a digit bulk
     string, keyed on key and operand counts, never on script text;
   - `ZSCAN` answers `['0', []]`;
   - the comment is updated.

   Without this, `listRevocations()` at `:276` throws on the roster-shaped reply.
4. `redis_broker_integration.test.ts:411-413` (US4 reap): re-targeted to `REAP_REVOKED_SCRIPT`.
   Its "the only test that makes LIST_REVOKED_SCRIPT execute against a real Redis" comment and
   title name the reap. The `:393` sibling is unchanged.
5. `driver_redis.test.ts:395-420` (FR-004: a seam-less subscriber arms its periodic trigger). It
   counts **three** revocation ticks from one `tickAsync(3_500)`. A self-re-arming one-shot fires
   **one** pass per `tickAsync` (measured with `@std/testing` FakeTime; #355's JSDoc says the same).
   Re-scripted as three `tickAsync(1_000)` steps, each drained. **Not in the disposition's list.**

*Prose to correct: 6 sites in 5 files.*

- `live_fake_conformance.test.ts:89` (`LIST_REVOKED_SCRIPT reads TIME…` becomes the reap), `:583`
  (drives `listRevocations`, now reap plus `ZSCAN`) and `:632` ("`ZRANGEBYSCORE t +inf` still returns
  everything" becomes "the `score > t` filter still keeps everything");
- `lapse_rehold_349.test.ts:197` (`isListRevocations`: "the one `EVAL` naming the revocation index"
  becomes "the reap, the pass's first command"; its one use at `:1402` still fails the re-check as
  intended);
- `reconcile_single_pass_355.test.ts:25` (its timer-coupling table's `driver_redis.test.ts` row);
- `recording_ports.ts:46-49`.

Plus the `fake_redis.ts` header (FR-014).

*Re-verified, not edited: 9 timer-coupled files.* These run the revocation timer under FakeTime:
`eviction_durable`, `eviction_reconnect` (its `failNextRead` on the first `EVAL` now fails the reap,
the same effect), `revocation_retry` (6 ticks; the pending-timer rule keeps the cadence, §12 D2),
`reconcile_single_pass_355` (W4 (vi), WR), `lapse_rehold_349`, `presence_member_frozen_354`,
`presence_sweep_departure_348` and `roster_holders_345` (`.test.ts`), plus `driver_redis` (edited
above). The disposition counted 7 at `d9c330ef`; #349's and #354's files added two, and the
architecture audit confirmed 9. Each must stay green unmodified. Two things can surface here:
- A test that counts **every** command after an event may now see a `ZSCAN` where it saw only the
  `EVAL` (§9).
- A test that `await`s `fireReconnect()` to observe a finished pass now needs the drain (FR-011).
  `lapse_rehold_349`'s re-check now queues on the manager tail behind any driver pass (FR-009a).

*Unchanged:* the zero-argument `listRevocations()` call sites: **26** by the audit's count (the
first draft said 27; the disposition counted 16 at `d9c330ef`). All stay green, because `owns` is
optional.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The pass deletes only through the reap: `TIME`, then `ZREMRANGEBYSCORE -inf t` in one script, returning `t`, the pass's one `now` | `REAP_REVOKED_SCRIPT`, `packages/realtime/drivers/redis.ts` | a `ZREM` / `ZREMRANGEBYSCORE` / `ZPOPMIN` from TypeScript; a reap folded into the first page's script; a delete of an undecodable member; a second reap per pass; `LIST_REVOKED_SCRIPT` kept beside it |
| What epoch seconds look like on the wire: canonical, ≤ 15 digits, one grammar for the reap's `t` and every score | `EPOCH_SECONDS`, `packages/realtime/drivers/redis.ts` | a second regex in the score parse; `Number.isFinite(Number(s))`, which accepts `1e9`, `1.5` and `' 1'`; `parseInt`; a grammar in the manager |
| What a reap reply means: a bulk string matching `EPOCH_SECONDS` → a number, else the one constant `REAP_REPLY_REFUSED` | `decodeReapReply`, `packages/realtime/drivers/redis.ts` | `Number(asBulk(reply))` at the call site; `?? 0`; a lenient `/^[0-9]+$/`; a message carrying the reply; accepting an integer reply as well |
| The index is read in pages: `ZSCAN <index> <cursor> COUNT REVOCATION_SCAN_COUNT`, no other option; 100, not configurable | `REVOCATION_SCAN_COUNT` and the one `ZSCAN` in `listRevocations`, `packages/realtime/drivers/redis.ts` (exported for tests only) | a literal `'100'`; a driver option or env var; reusing `OWNED_SCAN_COUNT`; `MATCH` on the scan; any `ZRANGE*` read of the index in production; a second `ZSCAN` site |
| The loop ends only when the cursor comes back `'0'`: one full iteration per pass, no budget, no resume state | the loop in `listRevocations`, `packages/realtime/drivers/redis.ts` | ending on an empty or short page; a per-tick page budget; a cursor kept in memory or in Redis; a page counter |
| Liveness is `score > t`, with the reap's `t` carried to every page and never re-read, never instance time | the per-entry filter in `listRevocations`, `packages/realtime/drivers/redis.ts` | a `TIME` per page; `Date.now()`; a `ZRANGEBYSCORE t +inf` re-check; a filter in the manager; a `>=` |
| Which members decode, and to what scope: exactly one or three charset-valid parts, else skipped, never deleted | `#decodeRevocation`, `packages/realtime/drivers/redis.ts` (unchanged, byte for byte) | a second decoder for paged members; a partial decode to `{ target }`; the reap dropping undecodable members; a decode in the manager |
| What a `ZSCAN` page means, and what a **well-formed pair** is: the envelope through `decodeScanReply`, then pairs; an odd-length body throws `REVOCATION_PAGE_REFUSED`; a pair with a non-bulk member or a score outside `EPOCH_SECONDS` is skipped **and counted** (`skipped`) | `decodeRevocationPage` (pairing, pair validity, the count) calling `decodeScanReply` (envelope), `packages/realtime/drivers/redis.ts` | **a second SCAN-envelope decoder**; the envelope re-checked inline; an `asBulk(member)` skip left in `listRevocations`; a throw on a bad score (a planted `+inf` would wedge every pass); moving `decodeScanReply` to `@lockness/redis` now; a `?? '0'` cursor; an odd body truncated; a message carrying broker bytes; a battery row mutating `decodeScanReply` outside `sweep_paging_358` |
| Malformed pairs are visible: one WARN per pass, after the loop ends, with a constant message and the summed count; never member or score bytes; not emitted by a pass that throws; undecodable well-formed members not counted | `listRevocations` (sums `skipped`, emits the WARN), `packages/realtime/drivers/redis.ts`; the message is `REVOCATION_PAIRS_SKIPPED` | a WARN per page or per pair; a WARN inside the decoder; a count in the manager; counting `#decodeRevocation` rejects; a slow-pass WARN (S2 ruling, which belongs to a future pass-duration metric filed separately) |
| Which targets the pass keeps is the caller's `owns`, applied per decoded record and called synchronously (a throw fails the pass); the zero-argument call returns all | the `owns` parameter of `listRevocations`: declared in `packages/realtime/driver.ts`, applied in `packages/realtime/drivers/redis.ts` | registering the predicate once (`onRevocationReconcile(handler, owns)`); a `ReadonlySet` of targets; the driver reading the manager's connections; a required parameter; an async predicate; a `try` around `owns` that swallows |
| What a port implementation must return: every record live at the pass's `now` and present for the whole enumeration; mid-enumeration writes and removals may or may not appear | the `listRevocations` JSDoc on `BroadcastDriver` / `RevocationStoreDriver`, `packages/realtime/driver.ts` (others link to it) | the contract restated in `drivers/redis.ts`, `docs/realtime.md` or ADR 009 instead of linked; the #276 "exactly the ids live at call time" wording kept anywhere |
| The manager applies only local sockets, whatever the driver returns | `if (!this.connections.has(revocation.target)) continue` in the manager's re-check body, `packages/realtime/manager.ts` (the decider; `owns` is the driver *asking* it early) | removing it because `owns` exists; a second check inside `#applyRevocation`; a check in the driver only |
| Nothing is applied before the enumeration ends; groups by pair are built from the whole result (#337) | the re-check body's single `await listRevocations(owns)`, then group, then apply, `packages/realtime/manager.ts` | an `AsyncIterable` seam; a per-page callback; applying page by page; grouping per page |
| One manager re-check at a time, whoever calls it (driver pass or lapse run); each run reads fresh; a rejected run never stops the next; no coalescing | the serial tail behind `reconcileRevocations()`, `packages/realtime/manager.ts` (FR-009a, the ADR 003 slot-tail idiom) | a lock or boolean flag; a coalescing "rerun" flag (a second mechanism beside the driver's); routing the lapse re-check through the driver; the tail continued only on success; a second tail in `#reassertRoster` |
| A failed, malformed or closing pass throws a constant message, never `[]` | `listRevocations` and its decoders (`REVOCATION_PASS_CLOSING`, `REAP_REPLY_REFUSED`, `REVOCATION_PAGE_REFUSED`, `SCAN_REPLY_REFUSED`), `packages/realtime/drivers/redis.ts`; `#runRevocationReconcile`'s catch is the one WARN | the "treating it as empty" WARN kept; `return []` on `#closing`; a catch inside `listRevocations`; returning the matches so far |
| At most one timer- or reconnect-triggered pass per driver at a time. **The timer is armed from the end of the pass that consumed it; an edge-triggered pass never moves a pending timer**; a timer that fires during a pass starts nothing | `#startRevocationPass` (the one entry, the `#revocationPass` slot, returns `void`) and `#armRevocationReconcile` (the one arming site, pending-timer check), `packages/realtime/drivers/redis.ts` | a `setInterval`; an in-flight boolean beside the slot; a second arming site (in `onRevocationReconcile`'s body or the retry); the reconnect seam calling `#runRevocationReconcile` directly; clearing and re-arming the timer on every pass start; returning a pass promise to a coalesced caller |
| A reconnect or retry during a pass gives at most one trailing pass, and `'reconnect'` wins | `#revocationRerun`, set in `#startRevocationPass` and consumed in its `finally`, `packages/realtime/drivers/redis.ts` | a queue or counter; a trailing pass per reconnect; dropping the reconnect; a trailing `'timer'` pass |
| Once `close()` begins: no timer is armed, no pass does anything, and no reap or page read starts after the one in flight | `#armRevocationReconcile`'s `#closing` check (timers); `close()`'s handler drop read by `#runRevocationReconcile`'s existing guard (passes, the #271 gate); `listRevocations`' two `#closing` checks (reads). One flag, three askers, each deciding a different thing | a `#closing` check in `#startRevocationPass` (a second gate for pass starts); a check after a page read; an `AbortSignal`; `close()` awaiting the revocation pass |
| The failure and retry policy (WARN naming the trigger, the one #308 retry, none while closing) | `#runRevocationReconcile`'s body, `packages/realtime/drivers/redis.ts` (verbatim) | a second WARN in `#startRevocationPass`; a retry armed from the `finally`; the trailing pass counted as the retry |
| The FakeRedis `ZSCAN` model: refuses everything but `COUNT` and a canonical cursor, walks the live sorted set through #358's scan core, answers `[cursor, [member, score…]]` with Redis's score format | the `ZSCAN` arm calling `#scan`, `packages/realtime/tests/fake_redis.ts` | a second walk in the arm; a canned `ZSCAN` in a helper that disagrees with it; ignoring `MATCH` / `NOSCORES`; reading `#zsets` without expiry; a `ZCARD` arm added only for a witness (`redis.zcard()` exists) |
| How a flat pair list is compared across backends: sorted by **pair**, never element by element. Used for `HGETALL`, and for `ZSCAN` only at cursor `'0'`; `ZSCAN` coverage is the union of pairs over a full iteration | `sortedPairs` and the #285 normalizer and coverage case, `packages/realtime/tests/live_fake_conformance.test.ts` | flat-sorting a pair list through `sortedItems`; a `ZSCAN`-only pair sort beside an unfixed `HGETALL`; comparing non-zero-cursor pages; a second comparison site |
| The lost-frame enforcement bound, `reconcileIntervalMs + 2P`, with P = 1 + ⌈N / `REVOCATION_SCAN_COUNT`⌉ one-at-a-time round trips, each capped at the read timeout; a failed pass restarts the clock; it holds only while the broker honours `COUNT` | the `onRevocationReconcile` JSDoc, `packages/realtime/drivers/redis.ts` (ADR 009 and `docs/realtime.md` link to it) | the bound restated with its own P in ADR 009, `docs/realtime.md`, `driver.ts` or `AGENTS.md`; a configurable bound; a slow-pass WARN standing in for it |
| Which realtime replies grow with a collection, and what bounds each | the inventory pitfall, `packages/realtime/AGENTS.md` (the revocation line updated) | the inventory restated in ADR 009, `resp.ts` or `docs/realtime.md`; a second list |
| A multi-page or held-pass test waits for the pass itself | #358 FR-012, whose one home is the FakeTime-drain pitfall in `packages/realtime/AGENTS.md` (extended to revocation passes) | a fixed microtask count; waiting through `close()`; a new per-file `settle()`; a handler-wrapper helper copied per file |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary Dependencies**: `@lockness/realtime` only;
`@lockness/redis` untouched · **Storage**: the revocation index sorted set `{prefix}__revocations`,
unchanged in layout · **Testing**: `deno test`; FakeRedis with the new `ZSCAN` arm on #358's scan
core; FakeTime with the `runMicrotasks` drain; the serializing hold wrapper; the recording ports; the
#280 and #285 conformance suites (fake and live broker); the mutation harness · **Target**: server
library · **Project type**: framework package · **Performance**: a pass is 1 + ⌈N/100⌉ round trips
(two for the common single page). At N = 10k that is about 50 ms; at N = 100k it is about 0.3–0.5 s
per 10 s interval per instance. Heap per page is a few MiB at worst · **Constraints**: optional port
parameter only; no wire, control-frame, record-format or option change · **Scale**: an index of any
size, with the reply cap unreachable from the re-check while the broker honours `COUNT`.

### Domain model

- **Bounded context**: realtime (the Redis driver's durable revocation re-check). It touches
  `@lockness/redis` only through #358's reply-cap rule.
- **Vocabulary**:
  - *revocation index*: the sorted set, scored by expiry second;
  - *revocation pass*: one reap plus one full `ZSCAN` iteration;
  - *reap*;
  - *the pass's `now` (`t`)*;
  - *page*;
  - *cursor*;
  - *`owns`*;
  - *trailing pass*;
  - *trigger*: `timer`, `reconnect` or `reconnect-retry`;
  - *re-check tail*: the manager's serial queue of re-check runs;
  - *skipped pair*: a malformed pair inside a well-formed page, counted;
  - *reply cap*.
- **Entities**:
  - `RedisBroadcastDriver`, the aggregate root of the index: it owns the scripts, the paged read,
    the timer and the single-flight slot;
  - `ChannelManager`, which supplies `owns`, runs re-checks one at a time on its tail, groups by
    pair and applies.
- **Value objects**:
  - `Revocation`, unchanged;
  - `t`, new, internal;
  - the decoded page `{ cursor, entries, skipped }`, new, internal;
  - the rerun trigger `'reconnect' | 'reconnect-retry'`, new, internal.
- **Invariants**:
  - no re-check command reads a reply that grows with the index;
  - a live revocation is never removed, and the reap is the only delete;
  - every record live at `t` and present for the whole enumeration is returned;
  - an undecodable member is skipped, never reaped;
  - nothing is applied before the enumeration ends;
  - at most one driver-triggered pass per driver, and at most one manager re-check running per
    instance;
  - a failed or closing pass throws and never returns `[]`;
  - a malformed pair is never skipped silently;
  - once `close()` begins, at most the command in flight completes.
- **Out of scope**:
  - the owner-partitioned index (deferred, with a revisit trigger);
  - `close()` awaiting the revocation pass;
  - revocation semantics (TTL, scope, `clearRevocation`);
  - moving `decodeScanReply` to `@lockness/redis`;
  - Redis Cluster;
  - a slow-pass WARN and a pass-duration metric (the S2 ruling; the metric is filed separately).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | `owns` is typed; decoded members are `string`, scores `number` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | required per task |
| `deno.lock` untouched | pass | no dependency change; scratch runs use `--no-lock` |
| JSDoc on public APIs | pass | FR-008 and FR-019 list every block, including the test-only exports; the bound and the port contract each have one home |
| MVC layering | pass | driver-internal, one optional port parameter, one manager-private tail |
| Commit discipline | pass | test (fake and conformance) / fix (driver and manager) / test (battery) / docs split |
| No environment detail in versioned files | pass | the live witness reads `LIVE_BROKER`; no host or port is written |
| Design decisions → architect-expert | pass | disposition 2026-09-23; plan audit A1–A12 folded; rulings on D1–D5, S1 and S2 binding |
| Act, don't recommend | pass | the pass-duration metric is filed separately, not left as advice |
| TDD, red first | pass | the FakeRedis `ZSCAN` arm and WC land first; R1, R2, R8, R9, R10, R12 (the skip WARN) and R14 are committed red on `main` |
| No silent catches | pass | no new catch; the "treating it as empty" WARN, which hid a malformed reply as `[]`, is removed; a malformed pair is counted and WARNed (S1), never skipped silently |
| Domain Model gate | pass | §6 |

### Complexity tracking

One addition beyond the disposition: the manager's serial re-check tail (A1), which replaces
accepting two concurrent passes. It is justified by the #337 re-kick window that overlap reopens.
The rest:

- the decoding: one script, one shared grammar constant, two decoders (one reusing
  `decodeScanReply`), four message constants, one page-size constant, and one skip count with its
  WARN;
- the scheduling: two private methods, two private fields and one field type change in the
  driver; one gate, one private body method and one tail field in the manager;
- the port: one optional parameter;
- the fake: one arm, plus `sortedPairs` in the conformance normalizer.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API | yes, additive | `listRevocations?(owns?)` on `BroadcastDriver` and `RevocationStoreDriver` (optional parameter); `mod.ts` unchanged; the new exports are test-only |
| Custom drivers | no code change | may ignore `owns` (correct, unbounded); guidance in `driver.ts` and `docs/realtime.md` |
| Redis driver internals | yes | reap/read split, `ZSCAN` pages, the counted skip, single-flight revocation timer, trailing pass, constant-message throws, the old WARN removed |
| Manager internals | yes | `reconcileRevocations()` becomes a gate over a private serial tail; the body moves verbatim; it passes `owns` |
| Redis wire | yes | one `EVAL` of `ZRANGEBYSCORE t +inf` becomes one reap `EVAL` plus `ZSCAN <index> <cursor> COUNT 100` pages; the record format is unchanged |
| Control plane / client frames | no | same leaves, `unsubscribed` frames and 4403 closes. The only difference is that a re-subscribed client is no longer re-kicked by an overlapping re-check |
| Operator logs | yes | "unexpected reply shape — treating it as empty" is gone; a malformed page or a closing pass is a "revocation reconcile failed (<trigger>)" WARN; malformed pairs give one `REVOCATION_PAIRS_SKIPPED` WARN per pass with a count |
| Enforcement bound (documented) | yes, wording | `~reconcileIntervalMs` becomes `reconcileIntervalMs + 2P`, stated once in `onRevocationReconcile`'s JSDoc |
| `@lockness/redis` | no | — |
| Memory driver | no | has no revocation store |
| Test infrastructure | yes | FakeRedis `ZSCAN` arm and header; the #280 refusals; the #285 normalizer (`sortedPairs` for `HGETALL` and `ZSCAN`) and coverage case |
| Docs | yes | ADR 009 (amends ADR 006 §2; callout in ADR 008 §5), `docs/realtime.md`, `packages/realtime/AGENTS.md`, JSDoc, test prose |

### Documentation (this feature)

```text
.specnaut/specs/265-paged-revocation-read/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A verbatim constraint is broken and one of the 17 unchanged adjacent rows goes DEAD or moves | FR-006, FR-009, FR-009a (the body moves at the same indentation), FR-012 and FR-013 name the lines. The harness reports every DEAD anchor, and the battery run is part of the gate |
| `sweep_paging_358` M3 goes DEAD because `listRevocations` uses the same `while` line | Re-anchored on its sweep-only context and re-proven live (A5, §4). The new battery's anchors are unique after the change (FR-018) |
| Two re-checks overlap (the driver pass and the lapse run), and the older snapshot re-kicks a client that re-subscribed after the first leave (#337 window of about P) | Closed by the manager's serial tail (FR-009a), which each run enters to read fresh; R14, M19 |
| A failed re-check wedges the tail, and no later re-check runs | The tail continues on both settle branches; R15, M20 |
| The lapse re-hold waits behind a long driver pass | Accepted residue: at most one driver pass (≤ P), named in ADR 009 |
| The one-shot timer changes cadence tests: `driver_redis.test.ts` FR-004 counts three ticks per `tickAsync(3_500)` | Re-scripted (§4 item 5). The pending-timer rule keeps `revocation_retry.test.ts`'s cadence. All 9 timer-coupled files are re-run before any edit |
| The reconnect seam now returns `void`, and a test that awaited it to observe a finished pass reads too early | FR-011 and FR-015: drain after firing the seam. The 9 files are re-run first |
| A test that counts every command after an event now sees a `ZSCAN` beside the reap `EVAL` | The 9 timer-coupled files are re-run first. A breakage is repaired by filtering on the index key, never by removing the assertion |
| Apply-as-you-stream sneaks back in (a per-page callback or iterator "for memory") | Decision row; `AGENTS.md` pitfall; R5 guards it |
| The `owns` predicate replaces the manager's check | M14, killed by R13(d) as built (R13(c), with a driver that ignores `owns`, cannot see it); decision row naming the manager's check as the decider |
| A malformed reply read as empty hides every revocation this instance owns | FR-007: throws, never `[]`; R11 and R12; M10 and M11 |
| A broker that formats scores differently makes every revocation unenforced with no log (fail-open, S1) | FR-005 and FR-006a: the pair is skipped **and counted**, with one WARN per pass; one strict grammar (`EPOCH_SECONDS`); R12, M21 |
| A planted `+inf` member wedges every pass | Never thrown, only counted (S1). The reap never removes it, so the WARN recurs every pass, which is the signal |
| A decoder or skip message carries broker bytes into a log | Constant messages plus an integer; R12 marker cases |
| The fake's per-key scan ceiling (1,000 cumulative) is reached by a long timer-driven test, because the index is scanned every pass by every driver on the fake | FR-014 re-checks the sizing. The longest timer test today runs tens of passes, and a breach is a loud ledger rejection, never a hang. Resize with the arithmetic in the header rather than remove it |
| The fake's model diverges from Redis (pairing, score format, small-set behaviour) | WC on fake **and** live, `sortedPairs` (FR-016a) and a forced skiplist-encoded live seed; the fake refuses what it does not model |
| The page bound rests on the broker honouring `COUNT` (raised `zset-max-listpack-*`, or a server answering `ZSCAN` whole) | Accepted residue, as for #358 S4. Named in ADR 009, `REVOCATION_SCAN_COUNT`'s JSDoc and the bound's home; WC's multi-call assertion detects it |
| A revocation storm faster than the scan stretches one pass | Accepted: the index TTL bounds it, and one pass at a time stops passes piling up (S4) |
| `close()` during the **last** page read still waits for the manager's apply phase (roster writes, leaves, clears) | Accepted residue (A9); stated in `close()`'s JSDoc and ADR 009 |
| A closing throw in the lapse run logs `#reassertRoster`'s WARN, whose "re-asserted anyway" text is false at shutdown | Accepted residue (A9); named in ADR 009; the text is #349's |
| Mixed fleet: a `0.3.0` instance still reads the whole index | Documented in `docs/realtime.md` and ADR 009 |
| Fleet-wide amplification: every instance reads the whole index every pass | Accepted. Revisit when a pass measures above 10% of `reconcileIntervalMs`, or the index's wire × instances per interval shows on the broker. The escalation is the owner-partitioned index. The trigger **cannot be observed** until the pass-duration metric (both ADR 006 passes, observability surface) exists. That metric is filed separately (S2 ruling); no slow-pass WARN is added |

## 10. Architecture audit

*`architect-expert`, 2026-09-23, against this document before any code. Verdict: **needs
follow-up — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 9 LOW**. Its rulings on D1–D5, S1 and S2 are binding
(hard rule #11). The design is confirmed; the disposition is not re-opened.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 MED (D1 ruling) | "Applying twice is idempotent" is false for concurrent re-checks. Pass A leaves pair X, sends `unsubscribed` and clears id1; the client re-subscribes; pass B, still holding id1, re-kicks it (#337, a window of about P) | Plan changed: FR-009a. `reconcileRevocations()` is a gate onto a manager-private serial tail (ADR 003 slot-tail idiom): each run starts after the previous one settles and reads fresh (#349 A2 holds); a rejected run never stops the tail; no coalescing (depth ≤ 2); the body moves verbatim at the same indentation (0 re-anchors). R14 and R15, M19 and M20. New decision row; §6's out-of-scope line removed; §9 rewritten; ADR 009 has no "two passes". Residue: the lapse re-hold can wait up to one driver pass. Rejected: accepting the overlap (its "harmless" claim is false); routing through the driver (port growth or driver-dependent ordering, and re-anchors of #349 M19–M21); a coalescing flag (a second mechanism) |
| A2 LOW (D2) | D2 accepted; its wording should state the rule, not the mechanism | Plan changed: FR-010, the decision row and ADR 009 say "the timer is armed from the end of the pass that consumed it; an edge-triggered pass never moves a pending timer". Residue: at most one extra pass per reconnect |
| A3 LOW (D3) | D3 accepted. R10 asserted a private field (`#revocationRerun`), and it checked `revocationTimer` too early, so M18 would survive | Plan changed: R10 asserts the effect (no reap after the release), and asserts `revocationTimer` unset only after the held page is released and drained |
| A4 | D4 accepted as written | — |
| A5 LOW (D5 decided) | Use the natural `} while (cursor !== '0')`; re-anchor #358 M3 on its sweep-only context | Plan changed: FR-004 and §4, with M3 re-anchored on `if (end !== 'swept') return end` / `cursor = page.cursor` / the `while` line and re-proven live; the "either outcome" wording is removed from §12. Rejected: a shared async-generator page loop (two callers with different closing semantics; it would re-anchor 5 #358 rows) |
| A6 LOW | `#startRevocationPass` returning the in-flight promise misleads a coalesced caller, whose promise would resolve before its trailing pass | Plan changed: it returns `void` (FR-011). Tests drain after firing the seam (FR-015) |
| A7 MED | The table missed rules the plan introduces | Plan changed. Rows added: (a) the port's liveness contract, homed in `driver.ts`'s JSDoc; (b) the manager's re-check tail; (c) the skip count and its WARN; (d) the enforcement bound `reconcileIntervalMs + 2P`, homed in `onRevocationReconcile`'s JSDoc, which others link to. "`owns` is synchronous, a throw fails the pass" is folded into the `owns` row. The epoch-seconds grammar and the pair-list comparison rows were also added (A10, A12) |
| A8 LOW | The adjacent-battery list missed `channel_revoke_332` "#337 the reconcile applies each record on its own", anchored on `const key = JSON.stringify([revocation.target, revocation.channel])` | Plan changed: §4 now lists 19 adjacent rows. It stays byte-identical under FR-009a's same-indentation move |
| A9 LOW | `close()`'s "at most one command" is wrong when the read in flight is the **last** page: the apply phase then runs while `close()` waits. A closing throw in the lapse run surfaces as `#reassertRoster`'s WARN, whose text is false at shutdown | Plan changed: FR-013's JSDoc states both cases; both are residue in ADR 009 and §9 |
| A10 LOW | One pair-list rule: `HGETALL` has the same flat-sort defect `ZSCAN` would | Plan changed: FR-016a introduces `sortedPairs` for `HGETALL` and `ZSCAN` at cursor `'0'`; the table row is updated; the `live_conformance_285` rows that compare `HGETALL` are re-run |
| A11 LOW | `live_conformance_285` "the reap never runs" is now killed only through `MARK_REVOKED_SCRIPT`'s bare `ZADD`, and no witness proved expired members are removed (R4 checked only survivors) | Plan changed: the row is relabelled (§4), and R4 asserts the two expired members are gone |
| A12 LOW (S1 counter home) | Where the skip is counted, and one grammar for epoch seconds | Plan changed: `decodeRevocationPage` owns "well-formed pair" (the non-bulk-member skip moves into it; `member: string`) and returns `skipped`; `listRevocations` sums it and logs one WARN per pass after the loop, with a constant message and an integer, none from a throwing pass, never broker bytes; well-formed undecodable members are not counted (residue); `EPOCH_SECONDS` is shared by the reap and the score parse; M21 |
| S2 ruling | No slow-pass WARN in #359: a different policy from #358's sweep, the wrong instrument for a continuous quantity that fires every pass at scale, and clock reads in FakeTime paths | Plan changed: none is added. Its future home is one pass-duration metric (duration, pages) for both ADR 006 passes on the observability surface, filed separately. ADR 009 states that the revisit trigger cannot be observed until then |
| — | 9 timer-coupled files, 5 re-scripts, `driver_redis.test.ts:395-420`, 18 adjacent rows / 1 re-anchor (19 with A8), 26 zero-argument call sites (immaterial) | Confirmed |

**Verdict** (as reported by the seat): needs follow-up — 0 CRITICAL / 0 HIGH / 2 MEDIUM / 9 LOW,
all folded above; design confirmed. **Coverage** (as reported by the seat): this plan in full; the
disposition; `drivers/redis.ts` (`LIST_REVOKED_SCRIPT`, `listRevocations`, `onRevocationReconcile`,
`#runRevocationReconcile`, `close()`, `#sweepOwned` and `decodeScanReply`); `manager.ts`
(`reconcileRevocations`, `#reassertRoster`, `#applyRevocation`); `driver.ts`; `tests/fake_redis.ts`;
the #285 normalizer; the realtime batteries' anchors; and the timer-coupled test files. The per-file
list was not itemised in the relay.

## 11. Security audit

*`security-expert`, 2026-09-23, in parallel. Verdict: **needs follow-up — 0 CRITICAL, 0 HIGH,
1 MEDIUM, 1 LOW, 2 INFO**.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 MED | An unparseable score was skipped silently. That fails open: a broker that formats scores differently leaves every revocation unenforced, with no log | Plan changed (with A12): the pair is skipped **and counted**, with one `REVOCATION_PAIRS_SKIPPED` WARN per pass (a constant message plus the integer, no broker bytes) and one strict grammar (`EPOCH_SECONDS`). R12 asserts the WARN, its exact count and the absence of any reply marker; M21 (the skip counter dropped). **Not** a throw: a planted `inf` would wedge every pass, since the reap never removes `+inf` |
| S2 LOW | P was undefined, so the enforcement bound was not checkable | Plan changed: P is defined at the bound's one home, `onRevocationReconcile`'s JSDoc (A7d), as "1 + ⌈N / `REVOCATION_SCAN_COUNT`⌉ one-at-a-time round trips, each capped at the read timeout". A failed pass restarts the clock, and the bound holds only while the broker honours `COUNT`. FR-019 and ADR 009 link to it. The suggested slow-pass WARN was rejected by the architecture ruling (§10, S2 ruling) |
| S3 INFO | The #337 stale-snapshot window grows to P under overlapping re-checks. It errs toward revoking | Resolved by A1: the manager's serial tail removes the overlap (FR-009a, R14) |
| S4 INFO | One pass at a time plus one trailing pass bounds the load a revocation storm can put on the shared client | Accepted as written |

**Verdict** (as reported by the seat): needs follow-up — 1 MEDIUM, 1 LOW, 2 INFO, no blocking
finding; all folded above. **Coverage** (as reported by the seat): the reap/read split against #276's
race, the decode and skip paths against a hostile or non-conforming broker, the log messages, the
enforcement bound and its availability under a revocation storm, and the live witness. The per-file
list was not itemised in the relay.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Any product question? | None. The disposition and both audits found none: which revocations are enforced, their scope, their TTL and the frames a client receives do not change. The one guarantee whose wording moves is the lost-frame bound, "~`reconcileIntervalMs`" → `reconcileIntervalMs + 2P` (stated once, in `onRevocationReconcile`'s JSDoc). It moves only where N is large enough for P to show, and at those sizes today's re-check breaches the cap and enforces nothing. Decision: document the wording, add no setting | 2026-09-23 |
| Approve the architecture as audited (tasks → implement → review)? | Approved by the maintainer at stop 1 | 2026-09-23 |

### Decided without asking

- The design shape is the #359 `architect-expert` disposition (2026-09-23). It is not re-opened.
- ADR number **009**: #349 took 007 and #358 took 008, and both have landed.
- **D1, ruled by A1:** the lapse run's re-check and the driver's pass never overlap. The manager's
  `reconcileRevocations()` is a serial tail (FR-009a), not the "accept two passes" first draft.
- **D2, ruled by A2:** the timer is armed from the end of the pass that consumed it, and an
  edge-triggered pass never moves a pending timer. A tick during a running pass starts nothing.
  Rejected: clearing and re-arming on every pass start, which breaks `revocation_retry.test.ts`'s
  `(timer)` witness; and two timers.
- **D3, ruled by A3:** no `#closing` check in `#startRevocationPass`. `close()`'s handler drop,
  read by `#runRevocationReconcile`'s existing guard, is the one gate for pass starts. M18 is the
  dropped check in `#armRevocationReconcile`, and R10 asserts it after the release and drain.
- **D4, ruled by A4:** M11 targets the pairing step. The missing-cursor mutant stays #358's M8,
  because #358's table forbids a second row mutating `decodeScanReply`. R12 still asserts the case.
- **D5, ruled by A5:** `listRevocations` uses the natural `} while (cursor !== '0')`, and
  `sweep_paging_358` M3 is re-anchored on its sweep-only context and re-proven live (1 re-anchor).
- **S1, ruled with A12:** a malformed pair is counted and WARNed once per pass. It is never thrown
  and never skipped silently. Undecodable well-formed members are not counted.
- **S2 ruling:** no slow-pass WARN in #359. The pass-duration metric for both ADR 006 passes is
  filed separately.
- `#startRevocationPass` returns `void` (A6).
- `EPOCH_SECONDS` bounds `t` and every score at 15 canonical digits, so `Number` is exact. This
  tightens the disposition's "decimal digits" in the spirit of #358 S1.
- `decodeRevocationPage` is the name of the "small `ZSCAN`-specific step". It composes
  `decodeScanReply`, so there is one envelope decoder, and it is the one home of a well-formed
  pair. The #304/#332 comment block moves beside `#decodeRevocation`'s call in `listRevocations`.
- R4 reads the member count through FakeRedis's existing `zcard()` helper. No `ZCARD` arm is added.
- The fake's `ZRANGEBYSCORE` arm stays. Tests read the index raw with it (`mixed_fleet_332`,
  `live_fake_conformance`).
- `onRevocationReconcile` re-registration clears the pending timer and re-arms. Stacked
  `onReconnect` registrations on re-registration are existing behaviour and out of scope.
- The revocation timer is not `unref`'d, as today. The retry timer keeps its `Deno.unrefTimer`.
- The manager tail's queued run is never coalesced: its depth is at most two by construction, and
  coalescing would be a second mechanism beside the driver's rerun slot (A1).
