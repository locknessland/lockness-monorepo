# ADR 008 — The ghost sweep reads the owned set in pages

**Status:** Accepted **Date:** 2026-09-23 **Owner:** architect **Amends:**
[ADR 006](006-realtime-sweep-writes-only-while-dead.md) §2, §5, §6 **Affects:**
`packages/realtime/drivers/redis.ts`, `packages/redis/resp.ts` (JSDoc only),
`packages/realtime/tests/fake_redis.ts`, `docs/realtime.md`,
`packages/realtime/AGENTS.md`, `packages/redis/AGENTS.md`

---

## 1. The question

The Redis driver's ghost sweep read a dead instance's whole owned set with one
`SMEMBERS owned:<id>`, on the survivor's **shared** command client. That reply
grows with the number of slots the dead instance held, and the client refuses
any reply over `MAX_REPLY_BYTES` (32 MiB of wire). An owned entry is at most a
200-byte channel, a space and a 600-byte member id — about 812 wire bytes — so
roughly 41,000 maximal holds cross the cap. When they did:

- **The sweep never finished.** The reply was refused, the sweep logged
  "failed", the instance stayed registered, and the next pass read the same
  oversized set again. The ghosts never left.
- **The survivor's whole client paid.** A refused reply discards the socket and
  opens the client's refusal window, so every other command on it — holds,
  leaves, roster reads, the heartbeat — failed for the window, on every
  survivor, every pass. A heartbeat failing in that window also feeds
  [ADR 007](007-realtime-lapsed-instance-reasserts.md)'s re-assert.
- **Heap before the cap.** Below the cap the reply was still parsed whole — 4 MB
  of wire was measured at 81.5 MB of heap.

Allocation without limits on a shared resource (CWE-770). Tracked as
[#358 — Realtime: sweep a dead instance's owned set in bounded pages, not one SMEMBERS that can breach the shared client's reply cap](https://github.com/locknessland/lockness-monorepo/issues/358).

---

## 2. The decision

### One read, in pages of a fixed size

`#sweepOwned` reads the owned set with
`SSCAN <owned key> <cursor> COUNT OWNED_SCAN_COUNT` and with no other option.
`OWNED_SCAN_COUNT = 100` is a module constant, **not configurable** — no driver
option, no environment variable. A hashtable-encoded set answers about `COUNT`
members plus the rest of the last bucket visited, so a page stays around 100 KB
of wire at maximum entry length (typically about 5 KB). A survivor holds one
page of a dead instance's owned set at a time. That `SSCAN` is the only read of
an owned set anywhere.

### One full iteration per pass

The scan starts at cursor `'0'` and ends **only** when the cursor comes back
`'0'`. There is no page or entry budget, no cursor kept in memory or in Redis,
and no page counter: the owned set shrinks under its own releases, and whatever
a pass leaves is the next pass's work. An empty page with a non-zero cursor does
not end the scan.

### Each page is released before the next is read

`#sweepPage` holds the per-entry release loop, moved verbatim out of
`#sweepOwned`: one `RELEASE_MEMBER_SCRIPT` per entry, the liveness check inside
the write, the count, and `#announceSwept` straight from the release reply. The
next `SSCAN` is issued only after the page's last announcement, so a page read
never sits between a release reply and its announcement (ADR 005's order). A
refused release ends the scan: no further release, no further page, no
deregistration.

### Four `#closing` checks

The pass reads `#closing` at four points and nowhere else: the top of each
instance, **before each page read** (new), before each release, and before the
deregistration. The page-read check is what bounds `close()` through a run of
pages that release nothing — empty pages or unparsable entries.

### A half-swept instance stays registered, and the log says so

`DEREGISTER_INSTANCE_SCRIPT` is unchanged: it answers _kept_ while the owned set
exists, so an instance whose scan missed a late hold, or whose set still holds
an unparsable entry, stays registered. The sweep end that records it is a new
`SweepStop`, **`kept`**; `completed` now means _deregistered_ only. On a `kept`
or `closed` end with N > 0, the one "released" line ends
`— unfinished: it stays registered and a later pass resumes it`. It gives no
count of what remains — no `SCARD`.

### One decoder for a SCAN-family reply

`decodeScanReply` accepts only `[cursor, array]`, where the cursor is a
canonical decimal string of at most 20 digits with no leading zero, kept as a
string and never parsed as a number. It returns `{ cursor, items }`, the items
still raw replies. Anything else throws one constant message,
`SCAN_REPLY_REFUSED`, which describes the shape, names no command or key, and
never carries the reply. A later paged read reuses it.

### The reply cap is a backstop

`MAX_REPLY_BYTES`'s JSDoc now states a rule, not a list of consumers: a reply
that grows with a collection is bounded by its caller — paged, or bounded inside
its script. The cap costs the consumer the socket; it is not a budget to plan
against. `realtime`'s inventory of such replies, and the bound of each, lives in
`packages/realtime/AGENTS.md`.

---

## 3. Why this shape

- **`SSCAN` bounds the reply at the source.** Each reply is a page, whatever the
  set's size, so nothing downstream — the reply cap, the heap, the shared socket
  — sees the set's size.
- **A full iteration needs no state.** The cursor lives in one local variable
  for one pass. Nothing survives a crash, a `close()` or a failed page read, so
  nothing can go stale: the next pass starts at `'0'` on what is left.
- **SCAN's guarantees are enough, because the scripts cover the rest.** The one
  guarantee relied on is that a member present for the whole iteration is
  returned at least once. A duplicate, or an entry another survivor released, is
  an _absent_ release (the script's atomic read-and-delete); a member added
  mid-iteration may be missed, and the deregistration then answers _kept_.
- **Moving the loop verbatim keeps the proven code proven.** The per-entry body
  and every mutation row anchored on it did not change.

---

## 4. Rejected, and what each would have cost

- **Raising `MAX_REPLY_BYTES`, or a per-command cap.** Moves the cliff and keeps
  the heap cost; the next larger instance breaks it again, and every consumer of
  the client inherits the larger ceiling.
- **A dedicated connection for the sweep's read.** Spares the shared client's
  socket, but the reply is still parsed whole in heap, still refused past the
  cap, and every survivor opens one more socket.
- **Reading and releasing inside one Lua script.** The script runs as long as
  the set is large and blocks the broker for all of it, and its reply — the
  emptied entries to announce — grows with the set again.
- **`SPOP` or `SRANDMEMBER … COUNT` batches.** `SPOP` removes the owned entry
  before its release runs, so a crash between them orphans the hold (the owned
  entry is its only index). `SRANDMEMBER` repeats members and has no end.
- **A per-pass page budget with a resume cursor** (in memory or in Redis). State
  that has to agree with a set that changes under it, a cursor that goes stale
  across passes, and one more key to clean up — to solve a head-of-line delay no
  one has measured. If that delay ever matters, the escalation is the budget
  with an **immediate** re-arm, never an interval-paced one.
- **Ending the scan on an empty or short page.** SCAN legitimately answers empty
  pages with a non-zero cursor; the scan would stop early and leave the instance
  registered with holds behind.
- **A batch release script** (K entries per `EVAL`). A second definition of
  "release" beside `RELEASE_MEMBER_SCRIPT` (ADR 004 rejected it), and a reply
  per call that grows with K.
- **A TypeScript "seen" set** to skip SCAN's duplicates. The script's _absent_
  already makes a duplicate harmless, and the set would grow with the owned set
  — the defect this ADR removes.

---

## 5. What this does not solve

- **Round trips.** One `EVAL` per entry stays, plus one `SSCAN` per ~100
  entries: a 30,000-hold instance still takes on the order of 15 s at 0.5 ms per
  round trip.
- **Head-of-line delay.** A large dead instance delays every other dead instance
  in the same pass. Revisit when a pass takes longer than the liveness TTL — but
  **no instrument measures pass duration today**, so nothing would report that
  trigger firing; adding the measurement is the first step of any revisit.
- **Overlap across survivors.** Two survivors sweeping the same instance both
  page and `EVAL` every entry; exactly-once still holds.
- **Unparsable entries.** They keep the instance registered, and every pass
  pages through them releasing nothing (ADR 006 §5, unchanged).
- **The page bound is the broker honouring `COUNT`.** A listpack-encoded set is
  answered whole whatever `COUNT` says — harmless at Redis's defaults (at most
  128 entries of at most 64 bytes). An operator who raises
  `set-max-listpack-entries` into the tens of thousands, or a Redis-compatible
  server that answers `SSCAN` whole, reopens #358 on that deployment. The #285
  live conformance case, which asserts a seeded set of 200 entries takes more
  than one call, is the check that detects such a broker.
- **A broker that never returns cursor `0`** stalls that survivor's whole ghost
  sweep, not just that instance: the pass sweeps its dead instances one after
  another and re-arms only once it ends, so every later instance of that pass,
  and every later pass, waits behind the scan that never finishes. Only
  `close()` ends it, at the check before the next page read. No new capability:
  such a broker already controls the data.
- **SCAN termination under a growing set.** A still-lapsed instance holding
  faster than it is swept stretches one pass; its renewal ends the sweep within
  a heartbeat through the in-write check.
- **Mixed `0.3.0` / `0.4.0` fleet.** A `0.3.0` survivor still reads the whole
  set with `SMEMBERS` and still breaches the cap on its own client.
- **The revocation index read.** `LIST_REVOKED_SCRIPT` answers every revoked id
  at once, unbounded — tracked as
  [#359](https://github.com/locknessland/lockness-monorepo/issues/359), whose
  paged read is to reuse `decodeScanReply` and the FakeRedis scan core.

---

## 6. The standing constraint

**The owned set is read only by `#sweepOwned`'s `SSCAN`, with `COUNT` set to
`OWNED_SCAN_COUNT` and no other option; no sweep read grows with the owned
set.** The scan is one full iteration per pass, ending only on cursor `'0'`, and
the deregistration script — never a TypeScript flag — decides whether a
half-swept instance stays registered.
