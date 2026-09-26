# ADR 013 — A fleet-wide revocation TTL floor: every record outlives the longest live reader's TTL

**Status:** Accepted **Date:** 2026-09-25 **Owner:** architect **Affects:**
`packages/realtime/drivers/redis.ts`, `docs/realtime.md`,
`packages/realtime/AGENTS.md` **Amends:** ADR
[011](011-realtime-revocation-bound-is-checked.md) §5

---

## 1. The question

A durable revocation record is the only thing that applies a revocation whose
one-shot control frame was lost. It lived for its **writer's**
`revocationTtlSeconds`. ADR 011 made each instance check its own timing against
its **own** TTL and nothing more, and its §5 left the fleet to an assumption:
the TTL is uniform.

When it is not, a peer with a short TTL writes records that expire before a
reader with a long interval runs its next pass. A writer at TTL 10 and a reader
at interval 60 000 ms (TTL 300) both pass their own boot check; the record
expires 10 s after it is written; the reader's next pass is up to 60 s away; the
revocation is never applied, and the socket it should have killed stays
subscribed. Nothing reports it: the reader's deadline measures its own passes,
which succeed
([#380](https://github.com/locknessland/lockness-monorepo/issues/380)).

The question: **how does a record written by any instance outlive every live
reader's TTL**, without a new wire format, a migration, or trusting any one
instance's configuration?

## 2. The decision

**Prevent the mismatch in the broker, with a fleet-wide floor.**

### The floor key

`<prefix>__revocation-floor` is a sorted set: member = one live reader's
`revocationTtlSeconds`, score = the broker second that entry lapses. Its one
production home is the driver's `revocationFloorKey` getter. It grows with the
number of **distinct** TTLs in the fleet, not with the number of instances.

### Its write, and its lifetime

One Lua fragment, `FLOOR_WRITE`, is the only code that writes the floor. It runs
over bound locals and does four things against the broker's `TIME` `t`: write
the entry at `t + ttl` with `ZADD … GT`; prune every entry at or below `t`; then
arm and extend the key's own TTL (`ttl` plus the index's 60 s slack) with
`EXPIRE … NX` and `EXPIRE … GT`, the index's two-call discipline. So a reader
drops out of the floor one TTL after its last write, and a fleet that stops
leaves no floor behind.

The fragment has exactly two callers:

- **the reap**, which every revocation pass already runs: the floor write rides
  on it, with no new round trip per pass. The reap now takes two keys (index,
  then floor) and two arguments; it is still the pass's only index delete;
- **the announce**, a one-key script sent once, at a driver's first
  registration, so a new reader is on the floor before its first pass. It
  **never carries the index key**, so nothing that picks out the reap on the
  wire can pick up the announce.

### Self-heal: a wrong-typed floor key no longer stops enforcement (#405)

The floor key is on the shared bus, not this driver's alone to trust: a
`string`, `list`, `set`, `hash` or `stream` written there by anything else with
bus access used to raise `WRONGTYPE` on `FLOOR_WRITE`'s first call and abort the
whole reap or announce — halting revocation enforcement fleet-wide for as long
as the key stayed wrong-typed, the exact class of gap this record exists to
close for the mark. `FLOOR_WRITE` now opens with
`local kind =
redis.call('TYPE', floor)['ok']` and five independently-gated
`if kind ==
'<X>' then redis.call('DEL', floor) end` blocks, one per type other
than `zset`/`none`, before the `ZADD`/`ZREMRANGEBYSCORE`/`EXPIRE` body above
runs — so a corrupt key heals inside the SAME atomic `EVAL` that already writes
the floor, not in a second round trip, and the pass that hit the corruption is
the one that recovers from it. **`DEL` never touches anything but the floor key
itself — never the revocation index.** No `pcall`, `else`, `~=` or reassignment:
the shared Lua evaluator (`packages/redis/tests/lua_eval.ts`, also depended on
by `session`, `queue` and `core`'s scheduler locks) proves all four unsupported,
and extending it further for one driver's edge case would be the same "second,
weaker home" this record already rejected for the floor's own decode (§3). The
evaluator gained one narrow, additive construct instead —
`redis.call(...)['ok']`, reading the flattened text a real broker's status reply
carries at `.ok` — needed because `TYPE`'s reply is itself a status reply, and
no earlier script had ever read one's content rather than ignore it.

**Both callers' replies changed to carry `kind`.** The reap now returns
`{t, kind}` (`decodeReapReply` widened to the pair) instead of `t` alone; the
announce returns `kind` alone instead of nothing. `kind` is `FLOOR_WRITE`'s
`TYPE` read, taken before any heal — `zset`/`none` on the healthy path, the
prior wrong type on a heal. `listRevocations` and `#announceFloor` each WARN
once through the existing `#warnFloor` when they see a heal, naming only the
prior Redis type; the hot path never WARNs.

### Self-heal extended to the index (#411)

The revocation **index** is on the same shared bus as the floor, and the same
class of writer with bus access can put a `string`, `list`, `set`, `hash` or
`stream` there — which used to raise `WRONGTYPE` on `REAP_REVOKED_SCRIPT`'s
`ZREMRANGEBYSCORE` or `MARK_REVOKED_SCRIPT`'s `ZADD` and abort the whole reap or
mark, exactly the class of gap this record's §4 named out of scope for #405.
`INDEX_HEAL` — the `FLOOR_WRITE`-shaped heal generalised to the index — is
spliced into both scripts, before each one's own body: a `TYPE` read plus five
type-gated `DEL` blocks, over the bound local `index` rather than `KEYS`/`ARGV`
directly, the same discipline `FLOOR_WRITE` keeps for `floor`.

**Why `DEL` is safe here, for a DIFFERENT reason than the floor's.** The floor's
heal is safe because the floor is fully re-derivable — every entry is rewritten
by the next reap or announce, so nothing is lost that was not already about to
be recomputed. The index holds primary, non-derived revocation records, and has
no such re-derivation — so the argument has to be narrower, and it is: **any
command able to change a key's TYPE has already discarded the prior value,
unconditionally, before Redis ever raises `WRONGTYPE`.** A `SET`,
`RENAME … REPLACE`, `COPY … REPLACE` or `RESTORE … REPLACE` overwrites the value
first; a WRONGTYPE-refusing write (`SADD`, `HSET`, `LPUSH`) never reaches far
enough to matter. So the former zset is already gone, at the Redis layer, the
instant `TYPE` disagrees — before any remedy here runs. Quarantining the key
(renaming it aside) would therefore preserve nothing recoverable beyond the
WARN's own "prior type" word, at the cost of an unbounded, un-TTL'd key an
attacker can keep spawning under repeated corruption — a storage-growth vector
bought for zero recoverability. Rebuilding from per-record keys is inapplicable,
not merely rejected: every revocation is a member of this ONE sorted set; no
per-record key is ever written, and manufacturing one now would double every
mark's round trips.

**The reap and the mark leave a healed index in different shapes**, because they
write it differently. The reap only prunes the index (`ZREMRANGEBYSCORE`) — it
never `ZADD`s — so a reap-side heal leaves the index ABSENT (`none`), not a
fresh `zset`, until the next mark or a raw write; "usable again", not "a zset
again", is the property that matters, and it holds either way. The mark writes
the SAME key it heals, inside the SAME atomic `EVAL` (`ZADD` right after
`INDEX_HEAL`'s `DEL`), so a mark-side heal IS a `zset` again immediately, in the
very same round trip that recorded the revocation.

Both scripts' replies widen again to carry the index's prior kind: the reap's
`{t, kind}` (#405) becomes `{t, indexKind, floorKind}` (`decodeReapReply`
widened to a triple, `kind` renamed `floorKind`); the mark, which returned
nothing decoded before, now returns `{indexKind}` (`decodeMarkReply`, new).
`listRevocations` and `markRevocation` each WARN once through the SAME
`#warnFloor` sink (never a sibling) via the new `#warnIfIndexHealed`, naming
only the prior Redis type — `REVOCATION_INDEX_WRONG_TYPE`, wording twin to
`REVOCATION_FLOOR_WRONG_TYPE`.

**Folded LOW, found alongside this fix**: `#announceFloor` used to read the
announce's bare `kind` reply with `asBulk(reply)` directly — a non-bulk reply
was read as `undefined` and the heal check was silently skipped, no throw and no
WARN. `decodeAnnounceReply` now decodes it strictly, throwing on anything but a
bulk string, so a decode failure lands in the announce's existing WARN+retry
`catch` like any other failed attempt, rather than passing unnoticed.

### The announce, and its retry

The announce shares the deadline arm's gate — first registration, `close()` not
begun — so a re-registration or a registration after `close()` announces
nothing. It is `async`, with the command awaited inside its `try`, so a port
that throws synchronously is caught like a rejection and registration still
completes. A failure writes one WARN and is **retried**: 1 s, doubling, capped
at `reconcileIntervalMs`, until an announce succeeds, a revocation pass
completes its whole enumeration (its reap wrote the entry; a pass that fails
after its reap does not count), or `close()` begins; `close()` clears the timer.
Every failed attempt writes its own WARN.

### Its read, and the fail-closed rule

`markRevocation` makes two round trips on its one command port:
`ZRANGEBYSCORE <floor> -inf +inf`, then the **unchanged** mark script, with the
record's TTL set to `eff = max(own TTL, every floor member)` and the index key's
own TTL at `eff + 60`.

`decodeRevocationFloor` is the one home of what a floor reply means: a reply
that is not an array of bulk strings is refused; a member outside the
epoch-seconds grammar is skipped and counted; a member inside it is clamped to
`[1, MAX_REVOCATION_TTL_SECONDS]`.

**A floor that cannot be read fails the mark closed**, never open: a rejected
command (`WRONGTYPE`, a reply over the command client's cap that resets the
socket, a transport error) or a refused reply marks the record at
`MAX_REVOCATION_TTL_SECONDS`, about **24.8 days**. Only a failed `EVAL` fails
the mark. That cost is accepted: such a record grows the index and lengthens
passes and the enforcement bound, and it stays bounded because marks are rare
and a channel-scoped record is cleared once its owner applies it.

Every floor WARN — skipped members (a count, never a member), an unreadable
floor, a failed announce — is written **after** the write it reports, through
one helper that never throws: when `console.warn` throws, one marked fallback
line carries both halves instead.

### The D2 ruling: the mark reads the floor in TypeScript

The disposition first described the max as computed inside the mark script. As
written, that needs a loop, comparisons and a strict numeric decode in Lua. The
ruling keeps the shape of the disposition — `max(own TTL, live floor members)` —
and moves only where it is computed:

- **The mark script's text, the record format and every reply are unchanged.**
  The script receives the effective TTL as `ARGV[1]` and does not know the floor
  exists.
- **One strict decode**, `decodeRevocationFloor`, beside the index-page decoder
  and sharing its grammar, never a second one in Lua.
- **No clock on the read.** Every reap and every announce prunes entries at or
  below its own `t`, so a lapsed entry survives the read only until the fastest
  reader's next reap. That can only lengthen a record, which fails closed.
- **The read-to-write race is bounded, not recurring.** The read comes one round
  trip before the write, so a mark can miss an entry written in between. That
  gap opens **once per new maximum TTL, at join**: an established reader
  refreshes its entry every interval, and the interval is at most half its TTL.

## 3. Rejected, and what each would have cost

- **Fleet keys** publishing each instance's TTL: a boot round trip, a
  mixed-fleet decode hazard, and the question of how long a minimum key lives
  (ADR 011 §5).
- **A per-record TTL field**, read back from the index: it fails open
  mid-deploy, because an instance on an older release cannot decode the new
  member and skips it (`listRevocations`' decode filter).
- **Write-time scoring by the reader**, or **a writer TTL in a reply or in
  metadata**: each changes a reply or the record format, and an older reader
  would misread it.
- **An operator check** that refuses to boot on a mismatch: the instance cannot
  see its peers' configuration without the fleet keys above, and ADR 011 §3
  already prefers a guarantee the driver enforces to one an operator must keep.
- **Extending the FakeRedis Lua evaluator** to decode the floor in Lua: Lua 5.1
  patterns cannot spell the epoch-seconds grammar, so it would be a second,
  weaker home, and `tonumber` accepts `0x10`, `1e3` and `inf`.
- **A loop-free max** (take the top score): it moves per-entry expiry onto the
  key, so a stopped long-TTL reader would lengthen records forever; the
  `ZINTERSTORE` variant coerces `5.5`, which the page decoder then skips (fail
  open).
- **`WATCH`/`MULTI`** around the read and the write: it aborts constantly under
  load, needs connection affinity the command port does not offer, and needs a
  new FakeRedis command family.
- **Running the reap at registration** instead of a separate announce: it would
  give the pass's only index delete a second trigger.
- **A `LIMIT` on the floor read**: truncation fails open — the dropped members
  might be the longest TTLs. The floor is small by construction, and the reply
  cap is the backstop (an oversized reply is a read failure, so the mark uses
  the maximum TTL).
- **An announce that is only reported, not retried**: a reader whose first
  announce fails may already hold sockets, and would sit outside the floor for a
  whole interval.
- **Admission that waits on the announce**: it changes `onRevocationReconcile`'s
  signature for every third-party driver.

## 4. What this does not solve

- **The mixed-release gap, on both sides.** Until every **writer** runs this
  release, an old writer's records live for its own TTL. And until every
  **reader** runs it, an old reader never announces or refreshes a floor entry,
  so its TTL is not on the floor and new writers do not lengthen records for it:
  an old reader with a long interval is exactly as exposed as before. Nothing is
  worse than before: an old reap deletes only what has expired and never touches
  the floor.
- **The first-write race.** A mark in the round trip before a new reader's
  announce lands, or during its retry after a failure, uses the old floor. The
  retry's first step is under 2 s.
- **The read-to-write race** above, once per new maximum TTL, at join.
- **A floor lost after a successful announce** (a failover, a `volatile-*`
  eviction) leaves up to one interval of short records, until the reader's next
  reap rewrites its entry. The index key has the same exposure.
- **A refill-window under-score, right after a heal** (#405). The heal makes
  this pass's own entry current again, but every OTHER live instance's entry is
  momentarily missing from the floor until each re-reaps its own — bounded to
  one reconcile interval per peer, the same bound this section already accepts
  for a stalled reader below. A mark scored in that window could compute a
  smaller max than the true fleet ceiling: strictly better than the pre-#405
  alternative (enforcement halted fleet-wide, forever, until an operator
  intervened), but a real, bounded reopening of the narrower defect this record
  exists to close. Repeated corruption costs one WARN per pass, fleet-wide, for
  as long as it recurs — a log-volume concern under sustained abuse, not a
  blackout. **The wrong-typed revocation index is no longer out of scope**: #411
  closed it with the same self-heal shape — see below.
- **A stalled reader drops out of the floor** one TTL after its last reap, when
  its ADR 011 deadline fires. The loss is reported, not prevented.
- **Records outlive their writer's TTL**, which costs index size, paid in pages
  (ADR [009](009-realtime-revocation-recheck-reads-index-in-pages.md)).
- **Anyone with bus access can fill the floor**; the reply cap turns an
  oversized floor into a read failure, so the mark uses the maximum TTL. The
  same actor can already delete the index.
- **Retention through a long failure run** is unchanged, and **third-party
  drivers** get no floor: it is a Redis-driver fact, and the port is unchanged.
- **Precision.** Entry expiry and record expiry both run on the broker's `TIME`,
  and agree with local time only to within one round trip, as in ADR 011.

## 5. Related

- ADR [011](011-realtime-revocation-bound-is-checked.md): the per-instance
  checks, unchanged; its §5 is amended by this record.
- The enforcement bound's one home is the `onRevocationReconcile` JSDoc in
  `packages/realtime/drivers/redis.ts`; this record does not restate it.
- The operator statement of what a TTL now means lives in `docs/realtime.md`,
  [Revocation timing](../realtime.md#revocation-timing).
