# ADR 016 — Which presence/roster key may self-heal, and which must fail closed

**Status:** Accepted **Date:** 2026-09-26 **Owner:** architect **Affects:**
`packages/realtime/drivers/redis.ts`, `packages/realtime/tests/fake_redis.ts`,
`docs/realtime.md`, `packages/realtime/AGENTS.md` **Amends:** ADR
[013](013-realtime-revocation-ttl-floor.md) §2 (extends its self-heal shape to a
second key family, under a narrower rule)

---

## 1. The question

#405 and #411 closed the WRONGTYPE-halt class for the revocation floor and the
revocation index: a `TYPE`-gated self-heal now runs inside the same atomic
`EVAL` that would otherwise abort. The same class was still open in the four
presence/roster scripts — `HOLD_MEMBER_SCRIPT`, `RELEASE_MEMBER_SCRIPT`,
`DEREGISTER_INSTANCE_SCRIPT`, `READ_ROSTER_SCRIPT` — which together touch five
keys: the presence hash, the holders hash, the owned set, the instances set, and
the liveness key. A wrong-typed key among these could abort a hold, a release, a
deregistration or a roster read fleet-wide, for as long as the key stayed
corrupt.

Unlike the revocation floor and index, a blind self-heal is not safe for every
one of these five: some hold **live membership state**, where a heal-`DEL` would
not recover a fleet, it would corrupt the room. The question — tracked as
[#414](https://github.com/locknessland/lockness-monorepo/issues/414), a
follow-up of the #411 security review's Finding 2 — is which of the five may
self-heal, and which must instead fail closed, loudly.

## 2. The decision

**A key self-heals only if it feeds no `arrived`/`gone` decision the manager
announces from, AND is either single-writer-scoped or fully re-derived on a
bounded cadence. Otherwise it fails closed, loudly.** This is the standing rule
this record exists to state; the per-key table below is its first application,
and it governs any future presence/roster key, not just these five.

| Key                                   | Touched by                                                                        | Remedy                    |
| :------------------------------------ | :-------------------------------------------------------------------------------- | :------------------------ |
| Presence hash `presence:<channel>`    | HOLD (`HSET`), RELEASE (`HGET`/`HDEL`), READ_ROSTER (`HLEN`/`HRANDFIELD`/`HMGET`) | **Fail closed.**          |
| Holders hash `holders:<channel> <id>` | HOLD (`HSET`/`HLEN`), RELEASE (`HGET`/`HDEL`/`HLEN`)                              | **Fail closed.**          |
| Owned set `owned:<instanceId>`        | HOLD (`SADD`), RELEASE (`SREM`)                                                   | **Self-heal.**            |
| Instances set `instances` (global)    | HOLD (`SADD`), DEREGISTER (`SREM`, gated)                                         | **Self-heal.**            |
| Liveness key `alive:<instanceId>`     | RELEASE, DEREGISTER — both `EXISTS` only                                          | **Documented exemption.** |

### Presence and holders: fail closed

**Whole-channel scope, not per-slot.** The presence hash holds every member's
shown entry for a channel; a heal-`DEL` would erase every OTHER member's entry
with **zero** `left` frames — a silent vanish, worse than a spurious one.
RELEASE's `n == 0` branch would also `HDEL` the presence field while returning
"absent" — a **missing `left`**. The holders hash is narrower in scope (one
slot) but no safer to heal: `HLEN` here is the _sole_ input to `arrived`/`gone`
(ADR 006: "decided HERE and nowhere else"). Resetting it produces a spurious
extra `joined` on HOLD, or the same missing-`left` shape on RELEASE.

Both now fail closed **structurally**, not merely by omission: every command
either script issues against either key goes through `FakeRedis`'s new
`#assertHashKey` guard in tests, and a real broker's own `WRONGTYPE` in
production — no `TYPE` read, no `DEL`, ever, for either key.

### Owned set and instances set: self-heal, `INDEX_HEAL`-shaped

Both get the same shape #405/#411 already established for the revocation floor
and index: `local <kind> = redis.call('TYPE', <key>)['ok']`, five
independently-gated `if <kind> == '<X>' then redis.call('DEL', <key>) end`
blocks (one per type other than the key's own native `set`), spliced before the
script's own write. `OWNED_HEAL` and `INSTANCES_HEAL` are the two fragments,
mirroring `INDEX_HEAL`'s own docstring almost verbatim — the same
`packages/redis/tests/lua_eval.ts` discipline applies: never `pcall`, `else`,
`~=` or reassignment.

**Why each is safe, and each for a different reason:**

- **Owned set** is scoped to ONE writer — the instance whose id names it — and
  feeds no `arrived`/`gone` decision; it is bookkeeping the ghost sweep
  enumerates, never roster membership itself. Its prior members are already
  destroyed at the Redis layer the instant `TYPE` disagrees (the same argument
  `INDEX_HEAL`'s own docstring makes for the revocation index) — a `DEL` here
  changes nothing about that loss, it only lets THIS hold or release proceed
  instead of aborting the whole `EVAL`.
- **Instances set** is fully re-derivable rather than single-writer-scoped:
  every live instance's heartbeat unconditionally re-`SADD`s itself every
  `heartbeatIntervalMs` (#349), so a wipe self-repairs fleet-wide within one
  interval — the same re-derivability `FLOOR_WRITE` already rests on for the
  revocation floor. It feeds no `arrived`/`gone` decision either.

Both replies widen to carry the healed kind — `HOLD_MEMBER_SCRIPT`'s to
`{arrived, ownedKind, instancesKind}`, `RELEASE_MEMBER_SCRIPT`'s to
`{value, ownedKind}` (the _refused_ outcome stays bare, since the liveness gate
answers before `owned` is ever read), `DEREGISTER_INSTANCE_SCRIPT`'s to
`{code, instancesKind}` — decoded by `decodeHoldReply` / `decodeReleaseReply` /
`decodeDeregisterReply` and WARN'd once through the existing `#warnFloor` sink
(`OWNED_SET_WRONG_TYPE` / `INSTANCES_SET_WRONG_TYPE`, the #391 marked-fallback
discipline — never a second sink).

### The `HOLD_MEMBER_SCRIPT` ordering hazard

**Required alongside the table above, not optional.** Before this record,
`HOLD_MEMBER_SCRIPT`'s first statement was the holders `HSET`, and the presence
`HSET` ran second. A presence-only corruption let the holders write commit, then
aborted on the presence write — a holder entry with no matching owned or
instances entry, the exact orphan shape ADR
[004](004-realtime-roster-slots-held-per-instance.md) §5 already closed for a
different cause. Fail-closed must mean "nothing commits", not "whatever happened
to run first, ran."

The fix is a bare `redis.call('HGET', KEYS[1], ARGV[1])` as the script's new
first statement — the SAME field the hold is about to write, its value
discarded. It never heals: it exists only so a wrong-typed presence key raises
`WRONGTYPE` here, before the holders `HSET` ever runs. `RELEASE_MEMBER_SCRIPT`
needed no equivalent change: its own presence read (`shown`) already runs before
its first write (the holders `HDEL`), so the same property held there already —
an accident of the existing statement order, now load-bearing and documented as
such.

### Liveness key: the documented exemption

Read only with `EXISTS` at both its two call sites (RELEASE's liveness gate,
DEREGISTER's alive check) — `EXISTS` is never type-sensitive, so no `WRONGTYPE`
can reach either script through it. Its own write path (`#heartbeat`'s
`SET … EX … GET`) carries a _different_, already-accepted residue (ADR 007 §5
S4) — out of scope here.

### `FakeRedis` gained the WRONGTYPE modelling it lacked

Before #414, every hash-family arm (`HSET`/`HGET`/`HDEL`/`HLEN`/`HMGET`/
`HRANDFIELD`/`HGETALL`) wrote into its own `#hashes` map unconditionally, and
every set-family arm (`SADD`/`SREM`) did the same for `#sets` — neither ever
checked whether the key already held a DIFFERENT type. A corrupted
presence/holders key therefore read as merely ABSENT to a later `HGET`,
indistinguishable from one that never existed: no `WRONGTYPE`, nothing for a
fail-closed witness to observe. A plain `SET` had the mirror gap: it wrote into
`#strings` without clearing `#sets`/`#hashes`/`#zsets`, so a key could exist
under two types simultaneously.

`#assertHashKey` and `#assertSetKey` close both gaps: each hash/set command now
refuses `WRONGTYPE` against a key already held by the OTHER family, and a plain
`SET` now clears every other type's map before writing its own — matching a real
broker destroying the prior value unconditionally. This surfaced one masking
case worth naming: the boot heartbeat's own raw `SADD instances <id>`, issued
OUTSIDE any script, could otherwise "heal" a corrupted instances key by accident
before `INSTANCES_HEAL`'s own `TYPE` read ever saw the corruption —
`#assertSetKey` closes that path too, by making the heartbeat's own write refuse
(caught and WARN'd there, exactly as a failed registration already was — #345
S1b), leaving the corruption for the script's own heal to find and report.

## 3. Rejected, and what each would have cost

- **Heal all five, verbatim #405/#411's shape.** Silently wipes live membership
  (presence) or falsifies the one `arrived`/`gone` signal (holders); the real
  cost is a missing or duplicate frame, not a log line — strictly worse than the
  fleet-wide halt it would "fix".
- **Fail closed on all five.** Needlessly leaves owned/instances corruption to
  manual recovery when both are provably self-repairing and touch no
  announcement path; also under-fixes the truly fleet-wide key (`instances`),
  whose corruption would otherwise halt every instance's registration.
- **Quarantine (rename aside) instead of `DEL`.** ADR 013's own rejection,
  restated here for the same two keys: unbounded, un-TTL'd growth an attacker
  can keep spawning, with no recoverable forensic value beyond the WARN's own
  "prior type" word.

## 4. What this does not solve

- **The RENAME/COPY REPLACE/RESTORE REPLACE/MIGRATE/SWAPDB "value that lands"
  gap**, generalised to all five keys — the same ACL control as ADR 013 §2
  already names. Presence/holders corruption still halts that channel/slot's
  join, leave, sweep-release and roster reads until an operator clears the key —
  an accepted exemption, not a new defect.
- **The liveness key's own `SET … GET` WRONGTYPE** (ADR 007 §5 S4) — untouched
  by this record.
- **Mixed-fleet reply-shape compatibility.** An old reader or writer sees no
  reply-shape change awareness; this is the same residue #411 already accepted
  for the revocation index, carried here unchanged.

## 5. Related

- ADR [004](004-realtime-roster-slots-held-per-instance.md) §5: the orphan shape
  this record's presence guard closes for a different cause.
- ADR [006](006-realtime-sweep-writes-only-while-dead.md): `HLEN` "decided HERE
  and nowhere else" — why the holders hash cannot heal.
- ADR [013](013-realtime-revocation-ttl-floor.md) §2/§4: the `INDEX_HEAL` shape
  this record's `OWNED_HEAL`/`INSTANCES_HEAL` reuse, and the ACL control this
  record's §4 points back to.
- `docs/realtime.md`'s "What the roster asks of Redis" section states the
  operator-facing summary of this table.
- `packages/realtime/AGENTS.md`'s Pitfalls section carries the #414 entry.
