# Plan: sweep a dead instance's owned set in bounded pages

**Branch**: `264-paged-owned-sweep` | **Date**: 2026-09-23 | **Backlog item**:
[#358 — Realtime: sweep a dead instance's owned set in bounded pages, not one SMEMBERS that can breach the shared client's reply cap](https://github.com/locknessland/lockness-monorepo/issues/358)

**This is the feature's one planning document.** The design was settled by the `architect-expert`
disposition on #358 (2026-09-23, hard rule #11); this plan records it as binding and adds what the
disposition left to the plan: the decision table, the requirements, the witnesses and mutants in
testable form, and the blast radius **re-counted on `main` at `1986b2c9`**, after #349 landed. The
disposition was written at `d9c330ef`; where the code moved since, this plan says so. Both plan
audits are folded in (§10, §11): the architecture audit's HIGH (A1) and its MEDIUMs changed the
body; the security audit's LOWs tightened the decoder and the sizing.

---

## 1. Why this exists

`#sweepOwned` (`packages/realtime/drivers/redis.ts`) reads a dead instance's whole owned set with
one `SMEMBERS owned:<id>`. The reply grows with the number of slots that instance held. It is read
on the **shared** command client, whose `readReply` refuses any reply over `MAX_REPLY_BYTES`
(32 MiB of wire, `packages/redis/resp.ts`). An owned entry is at most a 200-byte channel, a space
and a member id of up to 600 bytes (200 characters of UTF-8) — about **812 wire bytes** with its
RESP framing — so roughly **41k** maximal holds are enough to cross the cap (S3).

When it is crossed:

- **The sweep never finishes.** The reply is refused, `#sweepInstance` logs
  `sweep of dead instance <id> failed … RESP reply exceeds …`, the instance stays registered, and
  the next pass reads the same oversized set again. The ghosts never leave.
- **The survivor's whole client pays.** The client discards the socket and opens its refusal window,
  so every other command on that client — holds, leaves, roster reads, the heartbeat — fails for the
  window, on **every** survivor, **every** pass.
- **Heap before the cap.** Below the cap the reply is still parsed whole: 4 MB of wire was measured
  at 81.5 MB of heap (the `MAX_REPLY_BYTES` JSDoc). Each survivor holds the entire set at once.
- **It now feeds #349's cost (S3 note on the issue).** Since #349 landed, a beat that fails during
  the refusal window marks a lapse suspected, and the next successful beat makes each survivor
  re-hold all K of its own slots. Paging the read removes that trigger; it does not change #349.

CWE-770 (allocation without limits) on a shared resource. **Who is affected:** multi-instance
Redis deployments where one instance held a very large number of presence slots and crashed — and,
through the shared client, every other user of the surviving instances.

## 2. User scenarios

### US1 — a huge dead instance is swept in one pass (P1)

**Given** instance A held more slots than one page (e.g. 307) and crashed
**When** survivor B runs one reconcile pass
**Then** every slot is released, each emptied slot's room hears one `left`, A is deregistered, and
B never held more than one page of A's owned set in memory.

### US2 — an owned set past the reply cap no longer breaks the survivor (P1)

**Given** A's owned set is larger, on the wire, than `MAX_REPLY_BYTES`
**When** B sweeps A
**Then** A is swept and deregistered with no "failed" line, and B's command client keeps working —
no socket discard, no refusal window.

### US3 — shutting down mid-scan leaves the rest to the fleet (P2)

**Given** B has swept the first page of A
**When** the application calls `B.close()`
**Then** B issues no further page read or release, A stays registered with the rest of its owned
set, B's "released" line says the sweep is *unfinished*, and a later pass (on any survivor) finishes
it with each member announced once overall.

### US4 — a renewal mid-scan stops the scan (P2)

**Given** A had only lapsed, and B has swept A's first page
**When** A renews its liveness
**Then** B's next release is refused, B reads no further page, and logs the "renewed" line.

### US5 — two survivors sweep the same huge instance (P3)

**Given** B and C both find A dead and page through its owned set at the same time
**Then** each slot is announced `left` exactly once across both, and N_B + N_C equals the holds
removed.

### Edge cases

- **An entry returned twice** (SCAN may, on a rehash) or already released by another survivor: the
  release answers *absent* — not counted, not announced.
- **A page that comes back empty with a non-zero cursor** (its members were released by another
  survivor, or the table is sparse): the scan goes on to the next page.
- **A hold of a still-lapsed A lands mid-scan**: released this pass if the scan has not passed its
  position; otherwise the deregistration answers *kept*, A stays registered, the "released" line
  carries the *unfinished* suffix, and the next pass releases it. Never orphaned.
- **A page read throws** (broker error, timeout, a reply `decodeScanReply` refuses): one "failed"
  line with N so far, A stays registered, the next pass restarts at cursor `0` on what is left.
- **Parsable and unparsable entries mixed**: the pass that releases the parsable ones ends *kept*
  (the unparsable ones keep the owned set alive) and logs one "released" line with the suffix.
- **Only unparsable entries remain**: every later pass pages through them, releases nothing, keeps
  A registered and logs nothing (ADR 006 §5 residue, unchanged).
- **`close()` during a run of pages that releases nothing** (empty pages, unparsable entries): no
  `SSCAN` is issued after `close()` begins, beyond the one already in flight.
- **A set small enough for one reply** (≤ 128 entries of ≤ 64 bytes, Redis's default listpack
  limits): Redis answers it whole with cursor `0` whatever `COUNT` says — one read, as today.
- **A broker that ignores `COUNT`** (listpack thresholds raised by the operator, or a
  Redis-compatible server answering `SSCAN` whole) reopens the large reply on that deployment (S4).
- **A broker that never returns cursor `0`** stalls that survivor's sweep of that instance (S5).
- **Mixed `0.3.0` / `0.4.0` fleet**: a `0.3.0` survivor still reads the whole set with `SMEMBERS`
  and still breaches the cap on its own client.

## 3. Requirements

**The read**

- **FR-001**: `OWNED_SCAN_COUNT = 100` is a module constant beside `OWNED_SEP` in
  `packages/realtime/drivers/redis.ts`. It is **exported for the test suite only**, like `KEPT` and
  `REFUSED` (`mod.ts` does not re-export it), and it is **not configurable**: no driver option, no
  environment variable. Its JSDoc states the bound and its arithmetic: an entry is at most about
  812 wire bytes (≤ 200 B channel + 1 + ≤ 600 B member id, plus framing); a hashtable-encoded set
  answers about `COUNT` members plus the rest of the last bucket visited, so a page stays around
  100 KB of wire at maximum entry length (typically about 5 KB), against a 32 MiB cap. It also
  states that the bound holds only while the broker honours `COUNT` (S4).
- **FR-002**: The owned set is read **only** by `#sweepOwned`, **only** with
  `SSCAN <ownedKey(deadId)> <cursor> COUNT <OWNED_SCAN_COUNT>` — **no option but `COUNT`**. After
  this change `grep -n "'SMEMBERS'" packages/realtime/drivers/redis.ts` returns exactly one line,
  the instance-set read in `#reconcile`, and `grep -n "'SSCAN'"` returns exactly one line, in
  `#sweepOwned`.
- **FR-003**: `decodeScanReply(reply)` sits beside `decodeReleaseReply` and
  `decodeDeregisterReply` and is **the single home of what a SCAN-family reply envelope means**
  (#359's `ZSCAN` is its announced second caller, so it is shaped command-neutral now, A4). It
  accepts only a two-element array whose first element is a bulk string matching
  `/^(0|[1-9][0-9]{0,19})$/` — a canonical cursor of at most 20 digits, kept as a string, never
  parsed as a number (S1) — and whose second is an array. It returns
  `{ cursor: string, items: readonly unknown[] }`: the items stay raw replies, each parsed by the
  per-entry loop as today. Anything else — nil, the wrong arity, a missing, empty, non-digit,
  leading-zero or over-long cursor, an item list that is not an array — throws **one constant
  message**, held in a named module constant (`SCAN_REPLY_REFUSED`), which describes the
  `[cursor, array]` shape and **never names a command or key** and never carries the reply, its
  type or its length (S2). It is exported for the test suite only (like `decodeBeatReply`), and it
  stays in `realtime`, not `@lockness/redis`.

**The loop**

- **FR-004**: `#sweepOwned(deadId, count)` becomes the page loop, in this shape:
  `let cursor = '0'` / `do {` / `if (this.#closing) return 'closed'` / read and decode one page /
  `const end = await this.#sweepPage(deadId, page.items, count)` /
  `if (end !== 'swept') return end` / `cursor = page.cursor` / `} while (cursor !== '0')`; then
  today's `if (this.#closing) return 'closed'` and the deregistration, whose lines stay
  byte-identical. It ends **only** when the cursor comes back `'0'`: one full iteration per instance
  per pass. **No budget** (per instance or per pass), **no resume state** (no cursor kept in memory
  or in Redis), no page counter.
- **FR-005**: `#sweepPage(deadId, owned, count): Promise<'swept' | 'closed' | 'renewed'>` holds
  today's `for (const raw of owned) {` loop **moved byte for byte** — same indentation (loop at 8
  spaces, body at 12), same parameter names (`deadId`, `owned`, `count`) — followed by
  `return 'swept'`. Its declared return type makes a bare `return` a compile error (the #355 rule).
  Nothing in the per-entry body changes: the parse, the pre-release `#closing` check, the
  `#release(channel, field, deadId, true)` call, the absent / kept / emptied counting and the
  `#announceSwept` call.
- **FR-006**: The pass reads `#closing` synchronously at **four** points and nowhere else: the top
  of each instance (`#reconcile`, before its `EXISTS`), **before each page read** (`#sweepOwned`,
  new), before each release (`#sweepPage`), and before the deregistration (`#sweepOwned`). No check
  sits between a release reply and the departure handler call, and **no page read sits there
  either**: the next `SSCAN` is issued only after the page's last `#announceSwept` has been called
  (#348 A1).
- **FR-007**: A refused release ends the scan: `#sweepPage` returns `'renewed'` at the first
  refusal and `#sweepOwned` returns it without reading another page or attempting the
  deregistration. A throw from a page read, a decoder or a release propagates to `#sweepInstance`'s
  per-instance catch, unchanged.

**Deregistration and the log**

- **FR-008**: A half-swept instance stays registered, guaranteed twice: (a) the closed, renewed and
  thrown exits all return before the deregistration; (b) `DEREGISTER_INSTANCE_SCRIPT` answers
  *kept* while its owned set exists. **(b) decides**; `DEREGISTER_INSTANCE_SCRIPT` and
  `decodeDeregisterReply` do not change.
- **FR-009**: `SweepStop` gains `'kept'` — the deregistration answered *kept*. `'completed'` keeps
  its name and now means *deregistered* only. `#sweepOwned`'s last line maps the three
  deregistration outcomes one to one (`deregistered` → `'completed'`, `renewed` → `'renewed'`,
  `kept` → `'kept'`).
- **FR-010**: `#sweepInstance` stays the one log site. When N > 0 and the end is `'kept'` or
  `'closed'`, the "released" line gains exactly one suffix:
  `— unfinished: it stays registered and a later pass resumes it`. `'completed'` has no suffix.
  N = 0 stays silent on every end. The line gives **no count of what remains** (no `SCARD`). The
  existing branch line `        } else if (released > 0) {` stays byte-identical (the #355 M18
  anchor); the suffix is chosen inside it.

**Test infrastructure**

- **FR-011**: `packages/realtime/tests/fake_redis.ts` gains a **private scan core** — member list,
  cursor and `COUNT` in, one page out — with the `SSCAN` arm as its first caller (#359's `ZSCAN`
  reuses it, A5). The model, documented in the file header:
  - **Refused, never ignored** (the #280 rule): a missing `COUNT`; **any option but `COUNT`**
    (`MATCH` among them); a non-canonical cursor; a non-positive `COUNT`.
  - **A set of at most `COUNT` members, asked at cursor `0`, is answered whole with cursor `0`.**
    Every existing sweep test therefore still issues exactly one owned-set read. **Deliberate
    divergence, stated in the header**: Redis answers whole only for a listpack set (by default
    ≤ 128 entries of ≤ 64 bytes), so the fake pages sets of 101–128 short entries that Redis would
    answer whole — the fake is the stricter of the two.
  - **A larger set** is walked over a fixed virtual table of slots: a member's slot is a
    deterministic hash of the member (so removals never shift another member), each call visits
    `COUNT` slots from the cursor and returns their members, and the next cursor is the next
    unvisited slot, or `0` past the end. Empty pages with a non-zero cursor therefore happen, and
    every member present for the whole iteration is returned exactly once.
  - **The slot function is exported** under a command-neutral name, `FakeRedis.scanSlot(member)`,
    so a test can place a member ahead of or behind a cursor (W6, W7, W8).
  - **It never duplicates** — stated in the header as not modelled; W3 proves duplicates are safe
    with two sweepers instead.
  - **A call ceiling, per key and cumulative** (a per-iteration ceiling cannot catch M5, which
    restarts at cursor `0` every call), sized above the longest legitimate test and stated with
    that sizing in the header; exceeded → a ledger rejection that throws, so a loop that stops
    advancing fails instead of hanging.
  - An absent key answers `['0', []]`.
  The file header's modelled-surface list gains `SSCAN` and states what it does not model; its stale
  "`#reconcile` runs on a real `setInterval`" sentence is corrected (#355 made it a self-re-arming
  `setTimeout`).
- **FR-012** (rewritten by A1): **A test that needs a finished sweep waits for the pass with
  FakeTime's drain** — `await time.runMicrotasks()` (or `await time.tickAsync(0)`) after the tick
  that fires it. The drain runs real macrotasks until the pass is done or stops at a `serial.hold`,
  so a 307-entry sweep (about 310 FakeRedis round trips) finishes inside it. **Never** wait with a
  fixed count of microtasks, and **never** with `close()` unless `close()` is the subject (W4,
  W10): `close()` sets `#closing` first, so it truncates the very pass the test means to observe.
  The live witness (W2) waits by polling `SISMEMBER <instances> A` until it answers 0 behind a
  **progress watchdog** (review amendment, 2026-09-23 — a fixed 120 s deadline flaked under host
  load): it samples `SCARD owned:A` every 250 ms and fails only when the set has not shrunk for
  30 s, with a 10 min overall ceiling as a backstop; a "failed" line still ends the wait early.

**Tests, anchors, docs**

- **FR-013**: Witnesses W1, W3–W11 in a new `packages/realtime/tests/sweep_paging_358.test.ts`; W2
  in the same file, gated on `LIVE_BROKER` (`packages/redis/tests/live_broker.ts`). W1, W2, W4, W6
  and W7 are committed red on `main` first (W1, W2 on the read itself; W4, W6, W7 on the suffix).
  WC extends `fake_redis_conformance.test.ts` (#280, the refusals) and `live_fake_conformance.test.ts`
  (#285, the reply shape and full-iteration coverage, fake **and** live broker), with FR-013a.
- **FR-013a** (A6): WC is **the one place SCAN replies are compared across backends** (#359's
  `ZSCAN` WC reuses it). The #285 normalizer sorts `value[1]` of an `SSCAN` reply **only when its
  cursor is `'0'`** (a whole answer, whose order Redis does not specify), and its comment — today
  "sort those two, and only those two" — is amended to say so. A separate coverage case iterates to
  cursor `0` on each backend and compares the **union** of pages with the seeded set; its live seed
  has more than 128 entries or one longer than 64 bytes, and asserts that the live broker needed
  **more than one call**, so the case exercises a real hashtable scan.
- **FR-014**: The existing tests this makes wrong are repaired, never weakened — the §4 repair list.
- **FR-015**: Mutation battery `packages/realtime/tests/mutations/sweep_paging_358.ts`, every row
  proven live (§4 mutant table), plus two `fake_redis_280` rows and one `live_conformance_285` row.
- **FR-016**: The bound rule and its inventory (A3).
  - `MAX_REPLY_BYTES`'s JSDoc (`packages/redis/resp.ts`) states a **rule**, not a list of
    consumers: *a reply that grows with a collection must be bounded by its caller — paged, or
    bounded inside its script. The cap is a backstop that costs every consumer the socket, not a
    budget to plan against.* The sentence "the largest is a roster read" is removed (already wrong:
    `LIST_REVOKED_SCRIPT` is unbounded). No code change in `@lockness/redis`.
  - `packages/redis/AGENTS.md`'s pitfall "A bound on peer-controlled input is a SIZE check…" gains
    one line pointing at that rule.
  - `packages/realtime/AGENTS.md` gains **one** pitfall that is the inventory of every realtime
    reply that grows with a collection, with its bound: the roster read → `READ_ROSTER_SCRIPT`
    (bounded inside the script); the owned set → `OWNED_SCAN_COUNT` (paged); the instance set →
    unbounded, small by construction; the revocation index → `LIST_REVOKED_SCRIPT`, unbounded,
    tracked as [#359](https://github.com/locknessland/lockness-monorepo/issues/359).
- **FR-017**: Docs.
  - **ADR 008 (new)**, `docs/adr/008-realtime-sweep-reads-owned-set-in-pages.md`, "The ghost sweep
    reads the owned set in pages": the decision, the rejected shapes with their cost, what is not
    solved, and the standing constraint — *the owned set is read only by `#sweepOwned`'s `SSCAN`,
    with `COUNT` set to `OWNED_SCAN_COUNT`; no sweep read grows with the owned set.* It amends
    ADR 006 by its Status line and inline callouts (ADR 003's convention):
    - §2: three `#closing` checks become four; the list of sweep ends gains `kept`
      (deregistration answered *kept*), and `completed` narrows to *deregistered*; the log-line
      spec gains the *unfinished* suffix on `kept` / `closed` at N > 0 (A8);
    - §5: the bullet "an owned set too large for one reply is never swept" is dropped (a textual
      neighbour of ADR 007's §5 callout, not a conflict);
    - §6: the read rule is added.

    Its "not solved" states: round trips (one `EVAL` per entry); head-of-line delay, with its
    revisit trigger **and the fact that no instrument measures pass duration today** (A9); overlap
    across survivors; unparsable entries; **the page bound is the broker honouring `COUNT`** —
    raised listpack thresholds or a broker answering `SSCAN` whole reopen #358 on that deployment,
    and WC is the check that detects it (S4); **a broker that never returns cursor `0` stalls that
    survivor's sweep** — no new capability, since such a broker already controls the data (S5);
    SCAN's termination under a set growing faster than it is swept; the mixed fleet; and
    `LIST_REVOKED_SCRIPT` → #359 (S6).
  - **`docs/realtime.md` "Ghost sweep"**: the owned set is read in pages; the log table's
    "released" row gains the suffix and when it appears; the "failed" row's "its owned set could not
    be read" becomes "a page of its owned set could not be read"; the mixed-fleet note (a `0.3.0`
    survivor still reads the whole set). **Not** a numbered v0.4.0 upgrade item.
  - **`packages/realtime/AGENTS.md` pitfalls**: the single owned-set read and its constant; the
    fourth `#closing` check (the sweep bullet's "only at the top of each instance, before each
    release and before the deregistration" is updated); a page read never sits between a release
    reply and its announcement; the one SCAN guarantee the sweep relies on and the two scripts that
    cover the others; a multi-page test waits with FakeTime's drain (FR-012); the reply-bound
    inventory (FR-016). **Tests**: the new battery.
  - **JSDoc**: `OWNED_SCAN_COUNT`, `decodeScanReply`, `SCAN_REPLY_REFUSED`, `SweepStop`,
    `#sweepOwned` (its "between the `SMEMBERS` below and the end" sentence and its exits list),
    `#sweepPage`, `#sweepInstance` (the suffix), `DEREGISTER_INSTANCE_SCRIPT` (no change of
    behaviour; its "after the sweep read that set" wording covers a page), `MAX_REPLY_BYTES`.
  - **Test prose** (A7): `tests/recording_ports.ts:46-47` ("anything unlisted answers `null`, which
    every driver read path treats as absent" becomes false for `SSCAN`, whose decoder throws on
    `null`; no test sweeps through the recording ports, so only the sentence changes);
    `tests/mutations/reconcile_single_pass_355.ts:8` and `:24-26` ("the three `#closing` checks");
    `tests/mutations/presence_sweep_departure_348.ts:248` (optional).

## 4. Success criteria

- **SC-001**: A dead instance's holds are all released in **one** pass, however many it held, plus
  one pass for each wave of holds that lands mid-scan.
- **SC-002**: No sweep reply grows with the size of the dead instance's owned set; a survivor holds
  at most one page of it at a time.
- **SC-003**: An owned set larger than the reply cap is swept without a "failed" line and without
  disturbing any other command on the survivor's client.
- **SC-004**: Once `close()` has begun, a survivor issues no further page read or release beyond the
  one in flight, and the instance it was sweeping stays registered until someone finishes it.
- **SC-005**: Across all survivors, each emptied slot is announced exactly once.
- **SC-006**: The operator can tell an unfinished sweep from a finished one from the log line alone.
- **SC-007**: No application or third-party driver needs a code change; the public seam and
  `mod.ts` are byte-identical.

**Witnesses** (FR-013). "Red" = fails on `main` at `1986b2c9`. Every FakeRedis witness that needs a
finished pass waits per FR-012.

| # | Setup → assertion |
| :--- | :--- |
| W1 (red) | A holds 307 slots (3 pages + 7). A closed, its liveness expires, B runs **one** pass, drained → every slot gone from B's `readRoster`, one `left` each, A deregistered; the command log has **no** `SMEMBERS` on `owned:A` and **≥ 4** `SSCAN`s on it, each with `COUNT` = `OWNED_SCAN_COUNT` |
| W2 (red, live broker) | One seeding `EVAL` fills `owned:A` with ≈ 42,000 maximal entries (≈ 812 wire bytes each, ≈ 34 MB > 33,554,432 bytes = `MAX_REPLY_BYTES`) → polled per FR-012: A deregistered, `owned:A` gone, no "failed" line; a command issued on B's client right after completes with no refusal-window error. On `main`: "failed … RESP reply exceeds", then the refusal window. The only witness that proves the cap itself |
| W3 | B and C sweep A (3 pages), page reads interleaved → one `left` per member overall; N_B + N_C = 307 |
| W4 (red: the suffix) | `close()` on B after its first page (`close()` is the subject) → A still registered, the rest still in `owned:A`, no sweep command after `close()` resolves, B's "released" line carries the suffix. Then C's next pass finishes; each member announced once overall |
| W5 | B's second `SSCAN` rejects → one "failed" line whose N is the first page's releases; A stays registered; the next pass finishes |
| W6 (red: the suffix) | A hold of still-lapsed A lands between two pages. (i) placed **ahead** of the cursor → released this pass; (ii) placed **behind** it → missed, deregistration *kept*, suffix logged, the next pass releases it. Re-targets #345 S1c; a second killer for #355 M10 |
| W7 (red: the suffix; rewritten by A2) | 150 unparsable entries placed ahead of 5 parsable ones → one pass releases all 5 and ends; exactly one "released" line, N = 5, **with** the suffix (the end is `kept`); A stays registered. A second pass logs nothing and A stays registered |
| W8 | A page that comes back empty with a non-zero cursor (its slots released by another survivor) does not end the scan |
| W9 (unit) | `decodeScanReply` accepts `[canonical cursor, array]`, including `'0'` and a 20-digit cursor. It refuses nil; the wrong arity (including a three-element reply with a marker in its extra member); a missing, empty or non-digit cursor; `'00'`, `'01'`; a 21-digit cursor; a cursor `'x<marker>'`; a non-array item list — and every refusal throws a **byte-identical** message equal to `SCAN_REPLY_REFUSED`, which contains no marker |
| W10 | `close()` during a run of pages that yields no release → no `SSCAN` issued after `close()` begins, other than the one in flight |
| W11 | A renews after B's first page → no release `EVAL` after the first refused one, no further `SSCAN`, one "renewed" line |
| WC | FR-013a. Fake **and** live: the `SSCAN` reply shape; an absent key answers `['0', []]`; a full iteration's union equals the seeded set, and the live broker needed more than one call. Fake only: `SSCAN` without `COUNT`, with `MATCH` or any other option, or with a non-canonical cursor is **refused** (#280) |
| — | #348 W8, M8, M9 and #355 W4 (i)–(vii) green (W4 (iii) and (vii) repaired as the list below says) |

**Mutants** (FR-015), battery `tests/mutations/sweep_paging_358.ts`, each proven live:

| # | Mutant | Killed by |
| :--- | :--- | :--- |
| M1 | `SMEMBERS` restored for the owned set | W1 (W2 on a live broker) |
| M2 | `SSCAN` with no `COUNT`, or with a different `COUNT` | W1 (the fake refuses a missing one; the value is pinned to the constant) |
| M3 | the page loop runs only once (`while (false)`) | W1 |
| M4 | the loop ends on an empty page instead of on cursor `0` (an inserted `if (page.items.length === 0) break` — `page` is block-scoped, so the `while` condition cannot test it) | W8 |
| M5 | the read never advances: every `SSCAN` sends cursor `'0'` while the loop still tests the returned cursor | W7 (the fake's call ceiling) |
| M6 | no `#closing` check before a page read (anchored on the check **plus** the page-read line, §12) | W10 |
| M7 | a refused release no longer stops the scan (`#sweepOwned` goes on to the next page on `'renewed'`) | W11 |
| M8 | the decoder reads a missing cursor as `'0'` | W9 |
| M9 | `kept` logged like `completed` (the suffix dropped) | W6, W7 |
| M10 (S2) | the decoder's message interpolates the cursor | W9 |
| M11 (S1) | the decoder accepts a leading-zero cursor (`/^[0-9]+$/`) | W9 |
| F1 (`fake_redis_280`) | `SSCAN` accepts a missing `COUNT` again | WC |
| F2 (`fake_redis_280`) | `SSCAN` accepts `MATCH` again | WC |
| L1 (`live_conformance_285`) | the fake's scan core skips a member present throughout | WC |

**Re-anchor and repair list** — counted on `main` at `1986b2c9` by evaluating every realtime
battery's `edits` against `redis.ts` (each anchor matches exactly once today) and by grepping every
test for `'SMEMBERS'`; confirmed by the architecture audit.

*Battery rows anchored on the code this moves — **0 re-anchored** if FR-005 is followed verbatim
(9 break if the loop is nested in place instead):*

- the per-entry body (9, indentation-dependent): `reconcile_single_pass_355` M3, M4, M7, M12b, M21;
  `presence_sweep_departure_348` M1, M4; `presence_member_holds_345` "sweep goes back to a raw
  presence HDEL", "sweep releases with its OWN id";
- `sweep_parse_316` ×2 (single-line anchors, indentation-free): unchanged;
- the deregistration tail, which stays in `#sweepOwned` at 8 spaces: `reconcile_single_pass_355`
  M12c and `presence_member_holds_345` "DELs the dead instance's owned set": unchanged;
- the log site: `reconcile_single_pass_355` M17, M18, M22 unchanged (FR-010 keeps M18's anchor
  line); M18's mutant (`end === 'completed'`) still compiles;
- #349's three row arrays and `presence_member_transitions_344`: no anchor in the moved code.

*Row text to change — 1:* `presence_member_holds_345`'s `killedBy` quoting the renamed #345 S1c
test (and its comment "between the sweep's SMEMBERS and its end").

*Test code to repair — 10 sites in 3 files (7 / 2 / 1):*

1. `reconcile_single_pass_355.test.ts:241` (W1) — `serial.hold` on owned-set `SMEMBERS` →
   `SSCAN`. Left alone, `await slow.reached` **hangs**.
2. `reconcile_single_pass_355.test.ts:253` (W1) — `issued('SMEMBERS', OWNED_KEY(DEAD))` → `SSCAN`,
   still 1 (one page). Left alone: fails.
3. `reconcile_single_pass_355.test.ts:436` (W4 (iii)) — "no owned-set read for the next instance"
   filter → `SSCAN`. Left alone, its owned-set half never matches; the `EXISTS(ALIVE_KEY(DEAD2))`
   half still kills #355 M12a, so the witness is **weakened, not vacuous**.
4. `reconcile_single_pass_355.test.ts:634` (W4 (vii), third case) — `hold` on the owned-set read →
   `SSCAN`. Left alone: **hangs**.
5. `reconcile_single_pass_355.test.ts:823` (W7) — the rejected owned-set read → `SSCAN`. Left
   alone: fails (no "failed" line).
6. `reconcile_single_pass_355.test.ts:584–587` (W4 (vii), close mid-release) — the exact "released"
   line gains the suffix (a `closed` end, N = 1).
7. `reconcile_single_pass_355.test.ts:613–616` (W4 (vii), close during the last release) — same.
8. `roster_holders_345.test.ts:277` (#345 W4, two interleaved sweeps) — the `sweepsOfA >= 2`
   precondition counts owned-set `SMEMBERS` → `SSCAN`. Left alone: fails.
9. `roster_holders_345.test.ts:689` + `:700` (#345 S1c) — renamed to "… between a sweep's
   owned-set read and its end …" and its intercept re-keyed to `SSCAN`. Left alone: fails on its
   `landed` precondition.
10. `live_fake_conformance.test.ts:385` — "SMEMBERS, which three production call sites depend on":
    two today, **one** after this change; corrected.

*Prose to correct* (no behaviour): the FR-017 "test prose" sites, the #285 normalizer comment
(FR-013a) and the FakeRedis header (FR-011).

*Re-run, not edited:* the six sweep-driving files that drain with a fixed microtask count —
`lapse_rehold_349`, `presence_sweep_departure_348`, `reconcile_single_pass_355`, `presence_sweep`,
`roster_holders_345`, `roster_atomicity_323` (`.test.ts`). Their owned sets fit one page, so their
chains do not lengthen; they must stay green unmodified. New tests do not copy their drain (FR-012).

Sites checked and left alone: the tests' own direct `SMEMBERS` reads of state
(`roster_holders_345.test.ts:633`, `:673`, `:721`; `presence_sweep_departure_348.test.ts:301`;
`reconcile_single_pass_355.test.ts:152`; `redis_broker_integration.test.ts:793`, `:852`), every
predicate on `SMEMBERS INSTANCES_KEY` (`reconcile_single_pass_355.test.ts:316`,
`lapse_rehold_349.test.ts:1228`), `prefix_anchoring.test.ts` (no timer runs the sweep, so no canned
`SSCAN` is needed), and comments in `eviction_reconnect.test.ts:75` (the revocation reconcile) and
`mutations/lapse_rehold_349.ts:415` (the instance-set read).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| A page is 100 entries, and that number is not configurable | `OWNED_SCAN_COUNT`, `packages/realtime/drivers/redis.ts` (exported for tests only) | a literal `'100'` at the `SSCAN` call or in a test; a driver option or env var; a second constant in `@lockness/redis`; a test asserting the literal instead of the constant |
| The owned set is read only by `#sweepOwned`'s `SSCAN … COUNT OWNED_SCAN_COUNT`, with no other option — no sweep read grows with the set | `#sweepOwned`, `packages/realtime/drivers/redis.ts` | any `SMEMBERS` / `SRANDMEMBER` / `SPOP` / `SINTER` of an owned key; a second `SSCAN` site (e.g. a re-assert or audit that reads the owned set); reading it inside a Lua script; `MATCH` on the scan |
| The scan is one full iteration per instance per pass, ending only when the cursor returns `'0'` — no budget, no resume state | the `do … while (cursor !== '0')` in `#sweepOwned`, `packages/realtime/drivers/redis.ts` | ending on an empty or short page; a page or entry budget; a `Map<deadId, cursor>`; a cursor key in Redis; an early re-arm; a page counter |
| `close()` stops the scan before each page read — the fourth of four `#closing` askers | `#sweepOwned` (before each page read and before the deregistration), `#sweepPage` (before each release), `#reconcile` (top of each instance), `packages/realtime/drivers/redis.ts` — one flag, four askers | a check after the page read; a check inside `decodeScanReply` or `#release`; a check between a release reply and `#announceSwept`; an `AbortSignal` threaded through |
| A page read never sits between a release reply and its announcement (#348 A1) | `#sweepPage`'s loop (the per-entry body moved verbatim), `packages/realtime/drivers/redis.ts` | reading the next page before the page's last `#announceSwept`; prefetching a page concurrently; announcing after the loop from a collected list |
| Each entry is released exactly as before: one `RELEASE_MEMBER_SCRIPT` per entry, liveness checked inside the write, exactly-once by the script's atomic read-and-delete | `#sweepPage` → `#release(…, deadId, true)` → `RELEASE_MEMBER_SCRIPT`, `packages/realtime/drivers/redis.ts` | a batch release script (K entries per `EVAL`); a TypeScript "seen" set de-duplicating SCAN repeats (the script's *absent* already does); an `SREM` or `SPOP` from TypeScript; a TS `EXISTS` before a page |
| A refused release stops the scan: no further release, no further page, no deregistration | `#sweepPage` returns `'renewed'`; `#sweepOwned`'s `if (end !== 'swept') return end`, `packages/realtime/drivers/redis.ts` | continuing to the next page on `'renewed'`; retrying the page; throwing out of the pass; deregistering anyway |
| A half-swept instance stays registered — the script decides, control flow only asks | `DEREGISTER_INSTANCE_SCRIPT`'s owned-set `EXISTS`, `packages/realtime/drivers/redis.ts` (the closed / renewed / thrown exits returning before it are the second guarantee, not the decider) | a TS "scan finished" flag gating the deregistration; an `SCARD` or page-count check; deregistering whenever the cursor reached `0`; a raw `SREM instancesKey` |
| How a sweep ended — `completed` (deregistered), `kept` (deregistration answered *kept*), `closed`, `renewed` — and the *unfinished* suffix on `kept` / `closed` at N > 0 | `SweepStop` (the four ends) and `#sweepInstance`'s one log site, `packages/realtime/drivers/redis.ts` | a second "unfinished" line; a log line inside `#sweepOwned` or `#sweepPage`; an `SCARD` to report what remains; a suffix at N = 0; mapping `kept` to `completed`; renaming `completed` |
| What a SCAN-family reply envelope means (`[canonical cursor ≤ 20 digits, array]` → `{ cursor, items }`, else the one constant `SCAN_REPLY_REFUSED`, which names no command or key) | `decodeScanReply` and `SCAN_REPLY_REFUSED`, `packages/realtime/drivers/redis.ts` | `asArray(reply)?.[0]` at the call site; a `?? '0'` fallback for a missing cursor; a lenient `/^[0-9]+$/`; parsing the cursor as a number; a copy in `@lockness/redis`; an error message carrying the reply or naming `SSCAN`; **a second SCAN-envelope decoder** (e.g. for #359's `ZSCAN`); **a second battery row that mutates `decodeScanReply`** outside `sweep_paging_358` |
| A reply that grows with a collection is bounded by its caller; the reply cap is a backstop, not a budget | the `MAX_REPLY_BYTES` JSDoc, `packages/redis/resp.ts` (each consumer documents its own bounds at the bounding site; `packages/redis/AGENTS.md` points at the rule) | a list of one consumer's reads in `resp.ts`; raising the cap; a per-command cap; a size check in `realtime` that re-implements the cap |
| Which realtime replies grow with a collection, and what bounds each (A3) | one pitfall in `packages/realtime/AGENTS.md`: roster read → `READ_ROSTER_SCRIPT`; owned set → `OWNED_SCAN_COUNT`; instance set → unbounded, small by construction; revocation index → `LIST_REVOKED_SCRIPT`, unbounded, #359 | the inventory restated in `resp.ts`, in ADR 008 or in `docs/realtime.md`; a per-read note that lists the others; a second inventory in `packages/redis/AGENTS.md` |
| The FakeRedis scan model: refuses every option but `COUNT` and a non-canonical cursor, answers ≤ `COUNT` members whole at cursor `0` (stricter than Redis's listpack rule, stated), walks a larger set by stable member-derived slots, never duplicates, and has a per-key **and** cumulative call ceiling | a private scan core in `packages/realtime/tests/fake_redis.ts` (member list, cursor, `COUNT` → page), the `SSCAN` arm its first caller; `FakeRedis.scanSlot(member)` its one exported slot function | a second fake scan in a test file or a second arm with its own walk (#359's `ZSCAN` reuses the core); a canned `SSCAN` in `recording_ports.ts` that disagrees with it; ignoring `MATCH`; insertion-order paging that removals shift; a per-iteration-only ceiling |
| A multi-page test waits for the pass with FakeTime's drain — `close()` only where `close()` is the subject | FR-012 of this plan, recorded as the pitfall in `packages/realtime/AGENTS.md` (#359 reuses the rule) | a fixed microtask count; waiting through `close()` (it truncates the pass); a per-file quiet-poll or `settle()` copy (8 exist today); a wall-clock sleep |

## 6. Technical context

**Language/Version**: TypeScript on Deno 2 · **Primary Dependencies**: `@lockness/realtime`;
`@lockness/redis` for the JSDoc and `AGENTS.md` line only · **Storage**: owned set per instance
(ADR 004), unchanged · **Testing**: `deno test`, FakeRedis (with the new scan core and `SSCAN` arm)
behind the serializing wrapper, FakeTime (`runMicrotasks` drain), the #280 and #285 conformance
suites (fake and live broker), the mutation harness · **Target**: server library · **Project type**:
framework package · **Performance**: one extra round trip per page (≈ 1 per 100 entries) on top of
one `EVAL` per entry; heap per survivor bounded by one page (≈ 100 KB of wire at maximum entry
size); a pass's duration unchanged in order (a 30k-hold instance ≈ 15 s at 0.5 ms per round trip,
as today) · **Constraints**: no seam, wire, control-frame or script change; no new option ·
**Scale**: owned sets of any size; the reply cap no longer reachable from the sweep while the broker
honours `COUNT`.

### Domain model

- **Bounded context**: realtime — Redis ghost sweep.
- **Vocabulary**: *page* (one `SSCAN` reply's items), *cursor* (the broker's opaque canonical
  decimal position; `'0'` starts and ends an iteration), *iteration* (cursor `0` to cursor `0`),
  *pass*, *sweep end* (**completed**, **kept**, **closed**, **renewed**, **failed**), *unfinished*
  (an end that leaves the instance registered with work behind: `kept`, `closed`).
- **Entities**: `RedisBroadcastDriver` (owns the pass); the dead instance (identified by its id,
  owns its owned set).
- **Value objects**: the decoded page `{ cursor, items }` (new, internal); `SweepStop` (gains
  `kept`); `ReleaseOutcome` and the deregistration outcome (unchanged).
- **Invariants**: no sweep reply grows with the owned set; at most one page in memory per survivor;
  a member present for the whole iteration is visited at least once per pass; each emptied slot is
  announced exactly once fleet-wide; no instance owning a hold is deregistered; once `close()`
  begins, at most the command already in flight completes.
- **Out of scope**: round-trip cost (one `EVAL` per entry stays); head-of-line fairness between dead
  instances; batching releases; `LIST_REVOKED_SCRIPT`'s unbounded reply (#359); the
  `SMEMBERS instancesKey` read (small by construction); releasing holds on a graceful `close()`;
  moving the decoders out of `redis.ts` (A10).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | not touched |
| JSR-only deps, declared per package | pass | no new dependency |
| No `any` in exported APIs | pass | the test-only exports are typed; `items` is `readonly unknown[]` |
| Tailwind v4 syntax | pass | no UI |
| Pre-completion gate | pass | required per task |
| `deno.lock` untouched | pass | no dependency change |
| JSDoc on public APIs | pass | FR-017 lists every block, including the test-only exports |
| MVC layering | pass | driver-internal |
| Commit discipline | pass | test (fake + conformance) / fix / test (battery) / docs split |
| No environment detail in versioned files | pass | the live witness reads `LIVE_BROKER`; no host or port is written |
| Design decisions → architect-expert | pass | disposition 2026-09-23; audit A1–A10 folded |
| Act, don't recommend | pass | — |
| TDD, red first | pass | W1, W2, W4, W6, W7 red on `main` first; the FakeRedis core and WC land before them |
| No silent catches | pass | no new catch; a page failure is the existing "failed" WARN |
| Domain Model gate | pass | §6 |

### Complexity tracking

None. One new private method (`#sweepPage`), one decoder and its message constant, one page-size
constant, one `SweepStop` member, one fake scan core.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` public API / driver seam | no | `mod.ts`, `driver.ts` unchanged; the new exports are test-only, like `KEPT` / `REFUSED` / `decodeBeatReply` |
| Redis driver internals | yes | the owned-set read (`SSCAN` pages), `#sweepPage`, a fourth `#closing` check, `SweepStop` `kept`, the log suffix, `decodeScanReply` |
| Redis wire | yes | `SMEMBERS owned:<id>` → `SSCAN owned:<id> <cursor> COUNT 100`; nothing else |
| Control plane / client frames | no | same `left` frames, same order |
| Operator logs | yes | "released" gains `— unfinished: …` on `kept` / `closed`; "failed" may now follow a page read |
| `@lockness/redis` | yes (docs only) | `MAX_REPLY_BYTES` JSDoc states the rule; one line in its `AGENTS.md` |
| Memory driver / third-party drivers | no | — |
| Test infrastructure | yes | FakeRedis scan core, `SSCAN` arm, `scanSlot`, header; #280 / #285 conformance and the normalizer |
| Docs | yes | ADR 008 (amends ADR 006 §2, §5, §6), `docs/realtime.md`, both `AGENTS.md`, JSDoc, test prose |

### Documentation (this feature)

```text
.specnaut/specs/264-paged-owned-sweep/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| The per-entry loop is nested instead of extracted, breaking 9 battery anchors | FR-005 (verbatim move, same names and indentation); the harness names every `DEAD MUTANT` |
| A lenient decoder reads a missing cursor as `undefined` and the pass never ends, or accepts a non-canonical cursor | FR-003 strict, canonical pattern; W9 / M8, M11 |
| A decoder message carries broker bytes into a log | FR-003 one constant message; W9 marker cases / M10 |
| A run of empty or unparsable pages keeps issuing `SSCAN`s after `close()` | FR-006 fourth check; W10 / M6 |
| A witness waits through `close()` and observes a truncated pass as the whole one | FR-012 (A1): FakeTime's drain; `close()` only where it is the subject |
| A predicate left on `SMEMBERS` hangs a test (`await slow.reached`) or weakens it | the counted repair list (§4): two hang, one (#355 W4 (iii)) is weakened but still kills M12a |
| Multi-page witnesses read a half-finished pass as finished | FR-012: wait with the drain, never a microtask count |
| The fake's model diverges from Redis (ordering, empty pages, small-set behaviour) | WC on fake **and** live (FR-013a), the live case forced into a hashtable scan; the fake refuses what it does not model and states its one deliberate divergence; W3 proves duplicate-safety on two sweepers since the fake never duplicates |
| A mutant that stops advancing hangs the battery instead of failing | the fake's per-key and cumulative call ceiling (FR-011); M5 killed by W7 |
| The page bound rests on the broker honouring `COUNT`: raised `set-max-listpack-entries`, or a Redis-compatible server answering `SSCAN` whole, reopens a large reply | accepted residue (S4); named in ADR 008, `OWNED_SCAN_COUNT`'s JSDoc and "Ghost sweep"; WC detects a broker that answers whole |
| A broker that never returns cursor `0` stalls that survivor's sweep | accepted (S5): no new capability — such a broker already controls the data; one line in ADR 008 |
| A still-lapsed instance holding faster than it is swept stretches one pass | accepted: its renewal ends the sweep within a heartbeat through the in-write check |
| Head-of-line delay: a large dead instance delays the others in the same pass | accepted; revisit trigger in ADR 008, which also says no instrument measures pass duration today (A9); escalation is the deferred page budget with an immediate re-arm, never an interval-paced budget |
| Mixed fleet: a `0.3.0` survivor still reads the whole set | documented in "Ghost sweep" |
| #349's re-assert `SADD`s into a set a survivor is scanning | the instance renewed first, so the next release is refused (W11); at most one more `SSCAN`, a read |

## 10. Architecture audit

*`architect-expert`, 2026-09-23, against this document before any code. Verdict at audit time:
**fail — 1 HIGH, 5 MEDIUM, 4 LOW**, every one a plan edit or an accepted residue. The design is
confirmed; the disposition is not reopened.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 HIGH | FR-012's "wait through `close()`" truncates the pass it means to observe: `close()` sets `#closing` first | Plan changed: FR-012 rewritten — finished-sweep witnesses wait with FakeTime's drain (`runMicrotasks` / `tickAsync(0)`), `close()` only where it is the subject (W4, W10), never a microtask count; W2's live wait is a `SISMEMBER` poll against a named, sized deadline; new decision row (the 8 per-file `settle` copies named as its duplicate shape; #359 reuses the rule) |
| A2 MED | W7 contradicted FR-010: N = 5 with a `kept` end logs one "released" line **with** the suffix, not nothing | Plan changed: W7 asserts one line at N = 5 with the suffix, A registered, and a second pass logging nothing (covers the "only unparsable entries remain" edge case); W7 is red first; second killer for M9 |
| A3 MED | The `MAX_REPLY_BYTES` rule had no inventory of which realtime replies grow and what bounds each | Plan changed: FR-016 — one pitfall in `packages/realtime/AGENTS.md` is the inventory (roster read, owned set, instance set, revocation index / #359); one line in `packages/redis/AGENTS.md` points at the rule; new decision row |
| A4 MED | `decodeScanReply`'s home is right (#359 is its second caller) but its shape was SSCAN-specific | Plan changed: FR-003 returns `{ cursor, items }`; the message is a named module constant (`SCAN_REPLY_REFUSED`) describing `[cursor, array]`, never naming a command or key; row 10's duplicates gain "a second SCAN-envelope decoder" and "a second battery row that mutates `decodeScanReply`" |
| A5 MED | The fake's `SSCAN` model should be a reusable core, and its ceiling as specified could not catch M5 | Plan changed: FR-011 and row 12 — a private scan core in `tests/fake_redis.ts`, the `SSCAN` arm its first caller; `FakeRedis.scanSlot(member)`; the ceiling is per key **and** cumulative, sized above the longest legitimate test; the header states the deliberate divergence (whole at ≤ `COUNT` = 100 vs Redis's listpack ≤ 128 entries of ≤ 64 B — the fake is stricter) |
| A6 MED | WC did not say how SCAN replies are compared across backends | Plan changed: FR-013a — the #285 normalizer sorts an `SSCAN` reply's `value[1]` only when its cursor is `'0'` (comment amended); a coverage case compares the union of pages with the seeded set on each backend; the live seed forces a hashtable scan and asserts more than one call. The one comparison site; #359 reuses it |
| A7 LOW | Counts and prose: 10 sites in **3** files (7 / 2 / 1), not 4; `:436` is weakened, not vacuous (the `EXISTS` half still kills M12a); prose sites missing; the fixed-microtask files unnamed; the duplicated check line and M4's scoping unstated | Plan changed: §4 list corrected; risk wording softened; FR-017 "test prose" lists `recording_ports.ts:46-47`, `reconcile_single_pass_355.ts:8, :24-26`, `presence_sweep_departure_348.ts:248` (optional); the six files named "re-run, not edited"; §12 records the M6 anchor and M4's inserted `break` |
| A8 MED | ADR 008 must also amend ADR 006 §2's list of sweep ends and its log-line spec | Plan changed: FR-017 — §2 callout adds `kept`, narrows `completed`, adds the *unfinished* suffix |
| A9 LOW | The head-of-line revisit trigger has no instrument measuring pass duration | Accepted; ADR 008 says so (FR-017, §9) |
| A10 LOW | `redis.ts` keeps growing; the decoders could later move to a sibling module like `lapse_run.ts` | Accepted — not a finding against this plan; recorded as out of scope (§6) |
| A-NV LOW | `NOVALUES` is an `HSCAN`-only option | Plan changed: FR-002, FR-011, WC and row 2 say "no option but `COUNT`" |
| — | The 12 original rows, 0 re-anchors, the M5 restatement, M4 needing a `break`, the test-only `decodeScanReply`, the fake header correction, FR-002's grep and the W4 (vii) suffix repair | Confirmed |

**Verdict** (as reported by the seat): fail at audit time, 1 HIGH / 5 MEDIUM / 4 LOW, all folded
above; design confirmed. **Coverage** (as reported by the seat): this plan in full, the disposition,
`drivers/redis.ts`'s sweep, decoders and `close()`, `packages/redis/resp.ts`, `tests/fake_redis.ts`,
the #280 and #285 conformance suites, FakeTime's drain semantics, the realtime batteries' anchors and
the tests' `settle` / microtask drains. The per-file list was not itemised in the relay.

## 11. Security audit

*`security-expert`, 2026-09-23, in parallel. Verdict: **needs follow-up — 0 CRITICAL, 0 HIGH,
0 MEDIUM, 4 LOW, 2 INFO**.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 LOW | The cursor pattern `/^[0-9]+$/` accepts non-canonical and unbounded cursors | Plan changed: FR-003 uses `/^(0|[1-9][0-9]{0,19})$/`, kept as a string; W9 refuses `'00'`, `'01'` and a 21-digit cursor; M11 (a leading-zero cursor accepted) killed by W9 |
| S2 LOW | Nothing proved the decoder's message never carries reply bytes on every refusal path | Plan changed: W9 puts a marker in the cursor slot (`'x<marker>'`) and in the extra member of a three-element reply, and asserts every refusal throws a byte-identical `SCAN_REPLY_REFUSED`; M10 (the message interpolates the cursor) killed by W9 |
| S3 LOW | The sizing used characters, not bytes: a member id can be 600 B, so an entry is ≈ 812 wire bytes and ≈ 41k holds cross the cap, not 85k | Plan changed: §1, FR-001 (the per-entry figure lives in `OWNED_SCAN_COUNT`'s JSDoc) and W2's seed stated in bytes (≈ 42,000 × 812 B ≈ 34 MB > 33,554,432 B) |
| S4 LOW | The page bound is the broker honouring `COUNT`; raised listpack thresholds or a broker answering `SSCAN` whole reopen #358 on that deployment | Accepted residue: ADR 008 "not solved", §9 row, edge case, `OWNED_SCAN_COUNT`'s JSDoc; WC (the live multi-call assertion) is the check that detects it |
| S5 INFO | A broker that never returns cursor `0` stalls that survivor's sweep | Accepted — no new capability (such a broker already controls the data); one line in ADR 008's "not solved", edge case, §9 |
| S6 INFO | The plan said `LIST_REVOKED_SCRIPT` was "to be filed" / handed to the product-owner; it is already #359 | Plan changed: every mention now references #359; nothing new is filed |

**Verdict** (as reported by the seat): needs follow-up — 4 LOW, 2 INFO, no blocking finding; all
folded above. **Coverage** (as reported by the seat): the plan's decoder, the page bound and its
sizing, the log lines, the live witness and the sweep's behaviour against a hostile or
non-conforming broker. The per-file list was not itemised in the relay.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Any product question? | None — the disposition and both audits found none: how long a sweep takes and which frames a room receives do not change | 2026-09-23 |
| Approve the architecture as audited (tasks → implement → review)? | Approved by the maintainer at stop 1 | 2026-09-23 |

### Decided without asking

- The design shape — the #358 `architect-expert` disposition (2026-09-23); not re-opened.
- `close()` stays equivalent to a crash (it does not release its holds), and nothing is filed for
  it — the disposition's recommendation, recorded as decided: its availability argument is gone.
- ADR number **008**: #349 landed first and took ADR 007.
- `#sweepPage`'s second parameter is named `owned`, not the disposition sketch's `entries`, so the
  loop header `for (const raw of owned) {` moves byte for byte too.
- M5 is spelled as "every `SSCAN` sends cursor `'0'`": deleting `cursor = page.cursor` in the
  sketched shape ends the loop after one page, which is M3 again (confirmed by A7).
- M4 is an inserted `if (page.items.length === 0) break`: `page` is block-scoped inside `do {}`,
  so the `while` condition cannot test it (A7).
- M6 anchors on the check **plus** the page-read line: after this change
  `if (this.#closing) return 'closed'` appears twice at 12 spaces (before each page read and before
  each release), and the harness requires each anchor to match exactly once (A7).
- `decodeScanReply` is exported for the test suite only, like `decodeBeatReply`, because W9 is a
  unit witness; `mod.ts` does not re-export it.
- The cursor is kept as a string and never parsed as a number: it is opaque and may exceed 2^53.
- `'completed'` now means deregistered only; `'kept'` is split out of it. #355 M18 keeps its
  anchor and its meaning.
- The #355 W4 (vii) exact-line assertions gain the suffix: they are `closed` ends at N = 1, which
  the disposition's own rule marks *unfinished* (confirmed by A7).
- The FakeRedis slot walk uses a fixed virtual table (no rehash); duplicates are not modelled, as
  the disposition says.
- W2 waits on progress, not a deadline (review amendment): 30 s with no removal is a stalled
  sweep; a slow host only stretches the wait, up to the 10 min ceiling.
- `LIST_REVOKED_SCRIPT`'s unbounded reply is out of this item and already tracked as #359 (S6).
