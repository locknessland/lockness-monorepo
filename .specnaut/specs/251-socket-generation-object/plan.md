# Plan: Give a socket generation an object

**Branch**: `251-socket-generation-object` | **Date**: 2026-09-06 | **Backlog item**:
[#298 — Redis: give a socket generation an object instead of five parallel fields](https://github.com/locknessland/lockness-monorepo/issues/298)

---

## 1. Why this exists

`RedisSubscribeConnection` carries per-socket state as parallel fields, and **each has had to learn
the same ownership guard separately, one incident at a time.**

| Field | Declared | Release in `#discardSocket` |
| :--- | :--- | :--- |
| `loopConn` | `:193` | `if (this.loopConn === conn)` — `:553`. **Not a member** (FR-001) |
| `loopDone` | `:195` | none — `close()` awaits whatever it holds |
| `#keepaliveTimer` | `:206` | via `#keepaliveConn`. Released by a **call**, not a drop (FR-014) |
| `#keepaliveConn` | `:215` | `if (this.#keepaliveConn === conn)` — `:551` |
| `#loopStartedAt` | `:235` | none — read *after* a discard, by `#reportRecovery` |
| `#writeChain` | `:276` | via `#writeChainConn` |
| `#writeChainConn` | `:290` | `if (this.#writeChainConn === conn)` — `:539` |
| `#handlerFaults` | `:298` | **unconditional** (`:536`), deliberately |

> **Line numbers re-measured 2026-09-07 against `7568163b`.** Every number in the
> first draft had drifted by 4–74 lines, and one classification was wrong (see
> FR-003). They are re-stated here rather than trusted, because a plan that cites
> a line it never re-read is the same instrument failure this repo has already
> paid for twice.

The history is the argument, and it is written in the file's own comments. The keepalive's guard
exists because the unconditional version was a **live defect**: *"discarding a STALE socket while a
newer one was live disarmed the live one's keepalive — and the idle churn this feature removes came
silently back."* #286 then hit the identical shape for the write chain, one field over, and added
the same conditional clear with a comment saying it *"mirrors `#keepaliveTimer` / `#keepaliveConn`
deliberately"*. That is the **third** field to need it, and `#discardSocket` is by now a
hand-written destructor for a concept the type does not name — while `plan.md` for #286 already
names that concept in its domain model: **socket generation**.

**What this is not.** It is not a behaviour change, and the acceptance test is that the existing
suite passes untouched. The value is that the next field cannot learn the guard the hard way.

## 2. User scenarios

### US1 — A stale discard cannot damage the live generation (P1)

**Given** a socket that has already been replaced
**When** it is discarded
**Then** the live generation's timer, read loop and write queue are all untouched — by **one** check
rather than three, so a fourth member cannot be added without one.

**And** the fault counters ARE reset, because they are deliberately not a member (FR-005). The first
draft of this scenario said "and fault counters are all untouched", which contradicts its own edge
case one screen below and would have been implemented as written.

### US2 — Nothing else changes (P1)

**Given** the existing suite, including the live-broker tests and the #248 mutation battery
**When** the refactor lands
**Then** every test passes unmodified except where a battery anchor names a line that moved, and
each such edit is an anchor repair rather than an expectation change.

### Edge cases

- **`#handlerFaults` is cleared unconditionally today**, and that is correct — it is a reporting
  counter, not a resource, and resetting it for a generation already gone costs one extra log line
  while failing to reset it silences a real fault. The refactor must **preserve** that asymmetry, not
  tidy it away.
- **`loopDone` has no guard today.** `close()` awaits whatever it holds. Folding it into the
  generation must not make `close()` await a generation that has been dropped.
- **A discard of a socket that was never a generation** (already replaced twice) must remain a
  no-op beyond closing it.

## 3. Requirements

**The membership criterion is "released together", not "lives as long as".** That correction is the
one the first draft most needed, and it resolves three findings at once. Under it the generation
holds exactly three members — `conn`, `keepaliveTimer`, `writeChain` — with **`#keepaliveConn` and
`#writeChainConn`** collapsing into `conn`; and it excludes **four** fields, by name and with a
reason each. The re-entry's own error was to read that criterion off a field's *name* rather than
its *install moment*, which is what put `loopConn` in the third row of this table instead of the
first:

| Excluded | Why it is not released with the generation |
| :--- | :--- |
| `loopConn` | **Not released together — installed at a different moment.** `:716`, after the awaited writes and after #290's ownership re-check at `:714`, where `#writeChainConn` installs at `:497` and `#keepaliveConn` at `:632`. It means "a read loop is draining this socket" (`:836`), a phase flag rather than an identity shadow. Both re-entry audits found this independently; FR-001 carries the argument. |
| `loopDone` | **Never released.** `close()` awaits it *after* discarding the socket, so it must outlive the drop — that is its whole purpose. |
| `#handlerFaults` | **Released unconditionally.** A stale reset costs one log line; a missed reset silences a real fault for a generation's lifetime. |
| `#loopStartedAt` | **Never released.** An eighth per-socket field the first draft's table missed entirely — set beside `loopConn` and `loopDone`, read by `#reportRecovery` to decide whether a socket survived. |

- **FR-001**: `SocketGeneration` holds `conn`, `keepaliveTimer` and `writeChain` — and **not
  `loopConn`**, which both re-entry audits independently found to be the plan's central error
  (architecture C1, security S6). `conn` is **`readonly`**.

  `loopConn` fails the membership criterion on its **install moment**, which is the axis the
  criterion was always about and the first draft read off the field's *name* instead.
  `#writeChainConn` installs at `:497` (first write) and `#keepaliveConn` at `:632` (arm); `loopConn`
  installs at `:716` — **after** the awaited writes and **after** #290's ownership re-check at
  `:714`. `loopConn === conn` does not mean "this socket's chain"; it means **"a read loop is
  draining this socket"**, which `subscriber.ts:836` states in those words. It is a phase flag, not
  an identity shadow. The decisive evidence is one line away: `#loopStartedAt` is set at `:717`, by
  the same install, for the same loop — and the first draft already excluded it, correctly, as
  "never released". `loopConn` sits on that same side of the line.

  Folding it in produces a silent defect under **either** reading, which is why this is a CRITICAL
  and not a preference: with the generation created before the first `#write` (FR-002),
  `#generation?.conn !== conn` is statically false at `:715`, the read loop never starts, and the
  subscribe socket delivers nothing — including realtime's control topic — with a clean log; and
  starting the loop at construction instead moves it in front of `:714`, which is #290's HIGH fix,
  whose absence the comment at `:679-694` describes as "restarted a read loop that exits at once and
  QUIETLY … then consumed the intent and fired the seam with nothing subscribed anywhere".

  **What this costs the branch, stated plainly**: the generation subsumes two ownership guards, not
  four. `#keepaliveConn` and `#writeChainConn` collapse into `conn`; `loopConn` keeps its own guard
  at `:553`. Two-to-one today, three-to-one once #295's fourth member lands. §12 puts that to the
  user rather than burying it. Identity is not re-pointed: MECHANISM 1 at `subscriber.ts:495-498` is literally an
  in-place rebase of an identity field, and translated member-for-member it produces one object
  claiming to be `conn2` while its timer pings `conn1` and its loop is `conn1`'s — after which
  FR-002's single check answers about the wrong resources and the orphaned interval id, being
  unref'd, is unreachable forever.
- **FR-002 — one construction site, and `#activate` holds it in a LOCAL.** A generation is created
  in `#activate`, after the `closed` re-check and before the first `#write`. `#write` neither creates
  nor rebases one. MECHANISM 1 and MECHANISM 2 collapse into a single predicate,
  `this.#generation?.conn !== conn`, evaluated at entry and again inside the queued closure.

  **`#activate` binds the generation it constructed to a `const` and never re-reads
  `this.#generation` after an await.** This is not style: it is the single condition under which
  FR-013's "zero new identity predicates" is true rather than aspirational, and both audits arrived
  at it from opposite ends. Reaching the generation through the field after an await requires
  re-establishing that it is still this `conn`'s — the seventh predicate FR-013 forbids.

  **One recorded non-neutrality, and the review corrected it in this branch's favour.** MECHANISM 1
  was *permissive*: `if (this.#writeChainConn !== conn)` rebased the chain onto whatever socket
  arrived, adopting a stale one. The collapsed predicate *refuses* instead. This plan said "no
  reachable sequence distinguishes them"; the review's security seat tried to break that and found
  the claim is **too modest**. A distinguishing sequence does exist, and the new code is the safe
  side of it: on `main`, a suspended activation resuming with a stale `conn1` hits MECHANISM 1 and
  rebases the **live** generation's chain onto the dead socket, destroying `conn2`'s write
  serialization and failing the live activation with `ABANDONED_WRITE`. A per-generation chain
  cannot reach the live generation at all. So the refusal is a **strict improvement**, not a neutral
  swap — recorded here rather than left as folklore, because the next reader will otherwise price it
  as a risk taken instead of a defect removed. (Found 2026-09-08 by `security-expert`, and reached
  independently by `code-reviewer`, which also failed to construct a sequence where the new code
  refuses a write on a socket that is still live and writable.)
- **FR-003 — the install side, which the first draft never mentioned.** Re-measured against
  `7568163b`, there are **six** identity predicates over the three parallel fields, and the first
  draft classified one of them wrongly:

  | Site | Role |
  | :--- | :--- |
  | `:495` `#writeChainConn !== conn` | **install** — MECHANISM 1, the in-place rebase |
  | `:508` `#writeChainConn !== conn` | **in-closure re-check** — MECHANISM 2, *not* install (the draft called it install) |
  | `:715` `loopConn !== conn` | **install** — starts the read loop |
  | `:539` `#writeChainConn === conn` | release |
  | `:551` `#keepaliveConn === conn` | release |
  | `:553` `loopConn === conn` | release |

  **Six** sites sit outside that six, not three. The first draft found one of them and declared the
  enumeration closed; the architecture audit found the rest, and they are the same class — bare,
  unpredicated, nothing to grep for:

  | Site | Why it is outside | Disposition |
  | :--- | :--- | :--- |
  | `:632` `this.#keepaliveConn = conn` | bare install assignment, no predicate | subsumed by construction |
  | `:580` `#clearKeepalive()` in `#armKeepalive` | bare release, no predicate | see FR-014 |
  | `:1071` `#clearKeepalive()` in `close()` | **unconditional** where `:551` is conditional | see FR-014 |
  | `:1085` `this.loopConn = null` in `close()` | **unconditional** where `:553` is conditional | untouched — `loopConn` is not a member (FR-001) |
  | `:765` `wasDelivering = this.loopConn === conn` | reads the loop phase, not the generation | untouched (FR-012) |
  | `:714` / `:919` `this.conn.socket === conn` | reads the **authority**, not the generation | untouched per §5 |

  The two `close()` sites matter beyond the count: `close()` releases **unconditionally** where
  `#discardSocket` releases **conditionally**, and that asymmetry is load-bearing and undocumented.
  It is documented here so it is decided by this plan rather than by whoever writes the code.

  A generation is installed only when
  `this.#generation?.conn !== conn`; installing replaces by **discarding first, then creating** —
  never by assignment. Without this, `psubscribe()` on an already-live connection reaches `#activate`,
  `connect()` returns the **cached** socket, and a per-activation generation silently drops the live
  write chain and orphans the live keepalive. **That is reachable on the second `psubscribe` call**,
  not through an exotic race.
- **FR-004 — `#discardSocket` gates the RELEASE, not the close.** `this.conn.discard(conn)`
  (`subscriber.ts:552`, sandwiched between the keepalive clear at `:551` and the loop clear at
  `:553` — re-verified 2026-09-07) is unconditional today and must stay so. It is the only path that calls
  `conn.close()`, clears the cached socket and clears the single-flight `pending` entry — gating it
  behind the ownership check leaks an established, AUTH'd socket and a file descriptor per stale
  discard, and leaves `pending` pointing at a dead dial, which is the #287 defect this repo has
  already paid for once.
- **FR-005 — `#handlerFaults` stays a field of the class.** Not because the reset must stay
  unconditional (a stale reset is harmless), but because **ownership** is the hazard:
  `#reportHandlerFault` is reached from `#dispatch`'s *deferred* async `.catch`, which runs after
  `close()` or a fault may have dropped the generation. Inside a nullable generation that is either a
  `TypeError` thrown inside a `.catch` — a fresh unhandled rejection, which is the #296 process kill
  — or, with `?.`, no counting at all and therefore no throttle on a peer-driven ERROR flood. It must
  remain callable with no live generation.
- **FR-006 — `close()` awaits the last loop that was started**, whether or not its generation has
  been dropped. `loopDone` stays a field of the class. The first draft said "not of one already
  dropped", which **awaiting nothing satisfies** — and the suite is a weak oracle here, because the
  socket is closed so the pending read usually rejects fast and the loop unwinds anyway. The
  regression would be timing-dependent and green.
- **FR-007**: No behaviour change. The suite passes with **no expectation edited**; the only
  permitted test edits are mutation-battery anchors whose text moved.
- **FR-008 — three battery rows are affected, not one, and each differently.** The first draft named
  only the discard-clear row. Re-read against `subscribe_hardening_248.ts` on `7568163b`, the
  refactor reaches three of its rows, and conflating them would lose two recorded reasons:

  | Row | What the refactor does to it | Required disposition |
  | :--- | :--- | :--- |
  | `#286 the discard clear is made unconditional` (`:186`) | Deletes its anchor — the guarded clear becomes the single ownership check | **Subsumed** into the SC-005 row, carrying its `expectSurvival` prose forward as a note. It may not simply vanish. |
  | `#286 no rebase on a generation change` (`:169`) | Deletes its anchor too — MECHANISM 1 is exactly what FR-001's `readonly conn` and FR-002's single construction site remove | **Subsumed likewise.** Its `expectSurvival` records that the redundancy is a property of the *callers*, not the method — the very assumption this refactor converts into structure. That sentence is the argument for the branch and must survive the row. |
  | `#286 no in-closure generation check` (`:158`) | Moves its anchor only: `this.#writeChainConn !== conn` becomes `this.#generation?.conn !== conn` | **Anchor repair.** The row lives; it is not a survivor and not subsumed. |

  A row whose anchor matches zero times is reported DEAD by the harness, so a missed repair here
  fails loudly rather than silently — but a *deleted* row loses its reason with no trace at all,
  which is why subsumption is spelled out and removal is not on offer.

  **Three further rows anchor inside the restructured methods and are expected to survive**: `:121`
  (`#286 the write deadline is not passed to writeFrame`), `:203` (`#286 the keepalive no longer
  discards and schedules`) and `:307` (`#296 the per-generation fault counter never resets`). The
  last is worth naming: it anchors on `'        this.#handlerFaults.clear()'` with literal 8-space
  indentation — the exact line FR-005 governs — so it survives only if FR-014's release is placed
  *around the release*, not around `#discardSocket`'s whole body. Recorded as checked rather than
  assumed; SC-007 counts survivors, and a dead anchor is a different failure it does not count.
- **FR-009**: The #296 log-content prohibition — never `topic`, never `payload` — is preserved
  verbatim wherever it moves. It lives in `#reportHandlerFault`'s docblock at
  `subscriber.ts:1013-1022`, governing the `console.error` at `:1042-1047`; **both move together or
  neither moves.** (The first draft cited `:886-897`, which on `7568163b` is the tail of
  `#scheduleRetry` and `#fireReconnect`'s docblock — it was the one citation §1's drift note did not
  re-measure, caught by both audits.)
  Second clause, re-phrased positively because the original was satisfied vacuously — today no
  member is a string, so nothing would notice when that stopped being true: **only a count or a
  boolean derived from `SocketGeneration` may reach a log line; no member's contents may.** SC-012
  is its witness.
- **FR-010 — `packages/redis/connection.ts` is OUT of scope, and this is now a decision rather than
  an inheritance.** #298's AC 5b asked for the boundary to be settled here before anything is
  touched. It is settled **out**, for a reason stronger than #299's precedent: `AuthenticatedConnection`
  **is instantiated by two consumers** — `RedisClient` and `RedisSubscribeConnection` — so reshaping
  it is a two-consumer change made under a third branch's pressure. That is the whole reason, and it
  is sufficient.

  **Two claims the first re-entry draft made here are withdrawn**, both refuted by the architecture
  audit and both checked:
  - *"`AuthenticatedConnection.pending` already is a socket generation, so this is the pattern we are
    porting from."* It is not. `pending` is constructed `{ promise: p, conn: null }` (`:414`) and its
    identity is assigned **in place** at `:404` — the exact shape FR-001 forbids for
    `SocketGeneration`. Its identity is the **dial**, not the socket, and `:523-529` records that an
    unsettled dial deliberately survives a discard. It fails this plan's own membership criterion in
    the state that defines it. The analogy was doing more work than it could bear.
  - *"a reason stronger than #299's precedent."* #299 is *"a forced discard re-dials with no
    backoff"*; its criteria are about jitter and dial counts and its own Out of scope names #298. It
    established the two-consumer sharing — which is the reason above — and ruled nothing about
    per-consumer state.

  The decision does not change. Its ground does.
- **FR-011 — the `#287` witness stays, and the plan says why in a place the implementer will read.**
  Follows from FR-010 by construction: the `#287 the promise is never paired with its socket` row is
  `file: CONN`, and this refactor never opens that file, so "the refactor makes it structurally
  impossible" was never an available disposition for it. `packages/redis/tests/connection.test.ts`'s
  `#287: discarding the socket a dial PRODUCED frees that dial` is not to be re-derived, weakened or
  deleted, and its docblock — which names `pending.conn` and the row's label — needs no edit, because
  FR-010 leaves all three intact.
- **FR-012 — `subscriber.ts:765` is left BYTE-IDENTICAL, and this requirement exists to say why.**
  It follows from FR-001: `loopConn` is not a member, so `wasDelivering = this.loopConn === conn`
  needs no translation at all. That is the fix; what follows is the record of two errors it repairs,
  kept because a future reader will otherwise re-attempt the translation.

  **Error one — the wrong consumer.** The first re-entry draft said the regression was
  `#reportRecovery` silently ceasing to report. It is not. `#reportRecovery` (`:784`) reads only
  `#attempts` and `#loopStartedAt`, neither of them a member, and is called only from `#readLoop`
  at `:949`; **it cannot regress from this refactor in either direction.** `wasDelivering` feeds
  `#scheduleRetry(isReconnect)` (`:773`) → `#reconnectIntent ||= isReconnect` (`:849`) → consumed at
  `:734-736` → `#fireReconnect()` → realtime's `#runRevocationReconcile('reconnect')`, the **#271
  immediate revocation re-check**. The stake is not a log line; it is how quickly a revoked
  subscriber stops receiving broadcasts.

  **Error two — the expression inverts, and in the opposite direction from the one analysed.**
  `conn` is declared `let conn: Deno.Conn | undefined` (`:646`), and `:765` runs in the `catch`
  **before** `if (conn) this.#discardSocket(conn)` at `:770`. On a failed dial `conn` is `undefined`
  and the generation is `null`, so the prescribed `this.#generation?.conn === conn` evaluates
  `undefined === undefined` → **`true`**, where today's `this.loopConn === conn` is `null ===
  undefined` → `false`. The draft reasoned it would be `false`. It promotes reconnect intent on a
  **first connect**, breaking the contract at `:414-416`; `subscriber.test.ts:1009` catches the
  failed-dial path loudly, and does **not** catch the dial-succeeds-then-`PSUBSCRIBE`-fails variant,
  which would ship silent.

  Either error alone was enough to ship a defect with a green suite. Both were introduced by the
  requirement that was added to prevent one.
- **FR-014 — the generation's release is a CALL, not a reference drop.** The membership criterion
  says every member is released together; §6's invariant says "every piece of it is released
  together, or none is". That is true of `writeChain` (a promise) and `conn` (a reference). It is
  **false of `keepaliveTimer`**, which is a `setInterval` id: dropping the object releases the field
  and leaves the interval running forever — and that is the #274 idle churn, the very failure whose
  guard at `:207-214` is this issue's founding evidence. The member the issue was filed about is the
  one member a plain drop does not release.

  The only `clearInterval` in the file is inside `#clearKeepalive` (`:557-563`), a method the first
  draft never named once, called from `:551` (guarded), `:580` and `:1071` (both bare). So:
  `SocketGeneration` carries a **`release()` method** that clears its own interval and settles its
  own chain, and every drop goes through it — `#discardSocket`, `#armKeepalive`'s pre-arm clear, and
  `close()`. `Symbol.dispose` remains rejected per §5 (release here is event-driven, not
  scope-bound); an ordinary method is not the same proposal. SC-012 is the witness, and it asserts on
  the interval, not on the field.
- **FR-013 — the type must admit a fourth member without a seventh predicate.**
  [#295](https://github.com/locknessland/lockness-monorepo/issues/295) is gated on this issue for one
  reason: its architecture CRITICAL needs a per-generation *confirmed-issued* record (the patterns
  the broker has acknowledged **on this socket**), so that `#activate` writes the difference instead
  of re-issuing the whole set — the difference between ~3 000 and ~4.5M `PSUBSCRIBE` frames at
  N=3 000. That record satisfies the membership criterion exactly: a fresh socket has confirmed
  nothing, so it is released with the generation and with nothing else.
  **It is NOT built here** — it is a behaviour change and it belongs to #295's plan, whose 20
  requirements own it. What is owed here is that the shape can absorb it. SC-010 demanded the diff be
  **written out rather than asserted**; the first draft asserted it, the architecture audit wrote it,
  and the honest cost is larger than the draft claimed:

  | Cost | Draft claimed | Actual |
  | :--- | :--- | :--- |
  | field on `SocketGeneration` | 1 | 1 — `readonly issued = new Set<string>()` |
  | initialiser at the construction site | 1 | 1 |
  | release line | 1 | **0** — a `Set` is released by the drop, so SC-010 asked for one line too many |
  | new branch in `#dispatch` | — | **1** |
  | signature changes | — | **2** — `#readLoop(conn)` → also carries `gen`; `#dispatch(reply)` → `#dispatch(reply, gen)` |
  | new identity predicates | 0 | **0, but only on one of two routes** |

  **§6 and the draft's cost sentence were pricing two different members.** §6 defines it as
  *broker-**acknowledged***; a `psubscribe` acknowledgement is a **3-element** RESP array, and
  `#dispatch`'s first line is `if (reply.type !== 'array' || reply.value.length !== 4) return`
  (`:956`) — the ack is discarded before the "subscribe confirmation" comment at `:963` is reached.
  Its write site is therefore `#dispatch`, which today takes `(reply: RespReply)` and has neither a
  socket nor a generation. The draft priced a *write-time* member ("issued when the frame reached the
  socket"), which would live inside `#activate` with the local and cost exactly what it said.

  **Acknowledged is the required semantics, and it is #295's own reason**: its body records that the
  naive delta reintroduces #245, where a transient blip left a pattern recorded-but-never-subscribed
  and the instance permanently deaf on the control topic. `onReconnect`'s JSDoc at `:433-434` says
  the same thing from the other side — an activation "awaits only that its `PSUBSCRIBE` reached the
  socket, never that the broker answered `+psubscribe`". So the cheaper member is the wrong one.

  **The route is named here, because only one of the two keeps the predicate count at six.** Thread
  the generation down (`#readLoop` → `#dispatch` → `gen.issued.add(p)`) and no new identity predicate
  is needed. Reach it through `this.#generation` instead and a discard landing inside `readReply`
  records a pattern on a generation that never confirmed it — #245 again — so correctness then
  demands `if (this.#generation?.conn === conn)` plus a `conn` parameter: **the seventh predicate**.
  §5's "which socket is live" row is amended so it cannot be read as forbidding the threading route.

  **Bounded at the type, not by its callers.** The member's element type is a charset-validated
  channel name and it carries its own cap. #295's own security audit records that
  `ChannelManager.subscribe` calls no `isValidName` and that the pattern set is unbounded and
  client-driven; what is new here is that this plan turns that set into **retained per-generation
  state with a lifetime**, which is a different exposure from a transient argument. One sentence in
  this plan; a migration if it is discovered after #295 ships.

## 4. Success criteria

- **SC-001**: Discarding a stale socket while a newer one is live leaves the live one's keepalive
  armed, its read loop running and its write chain intact.
- **SC-002**: A stale discard still **closes its socket** — the release is gated, the close is not —
  asserted by the fake server observing its connection drop, or by a subsequent read on the stale
  socket rejecting `BadResource`. **Not** by the absence of a leak warning. (Its siblings SC-004 and
  SC-012 name their observation; this one did not, while guarding #287's leak of an established
  AUTH'd socket and its fd.)
- **SC-003**: Two `psubscribe()` calls on one live socket leave the first call's keepalive interval
  armed and unchanged.
- **SC-004**: `close()` after a read-fault discard still awaits the faulted loop's unwind — asserted
  by resolution ordering, not by the absence of a sanitizer complaint.
- **SC-005**: A mutation removing the single ownership check is killed.
- **SC-006**: The full suite, the live suite and every consumer suite pass with no expectation changed.
- **SC-007**: The #248 battery reports zero unexpected survivors, and the discard-clear row is
  KILLED or explicitly subsumed per FR-008.
- **SC-008**: The handler-fault ERROR line contains neither the topic nor the payload of the frame
  that triggered it.
- **SC-009**: `onReconnect` fires **exactly as often as it does today** across three paths: a failed
  first dial (zero), a first dial that succeeds with a failing `PSUBSCRIBE` (zero), and a fault after
  delivery has begun (once). Counted on the handler, not inferred from a log line.
  *Re-aimed.* It previously asserted that a read fault still logs a recovery report — an observable
  `#reportRecovery` produces regardless, so it passed under the very regression it was written for.
  Both audits caught that independently.
- **SC-010**: The diff that adds #295's fourth member is **written into this plan** (FR-013's table)
  rather than asserted, and adds **no new `=== conn` comparison** on the threading route. The "one
  release line" clause is struck: a member that needs a release line is a member the drop does not
  release, which FR-014 makes a design fault rather than a cost.
- **SC-011**: `git diff main...HEAD --stat` names neither `packages/redis/connection.ts` nor
  `packages/redis/tests/connection.test.ts`, which is FR-010 and FR-011 made mechanically checkable.
  (Base named explicitly — the first draft said `git diff --stat`, which compares against the index
  and is empty for a committed change.)
- **SC-012**: After a generation is dropped, its keepalive **interval no longer fires** — asserted by
  advancing fake time past two `keepaliveMs` windows and counting writes on the stale socket, not by
  reading `#keepaliveTimer`. This is FR-014's witness and the one criterion that would have caught
  the #274 idle churn returning.
- **SC-013**: No log line emitted by `subscriber.ts` contains any member's **contents** — FR-009's
  second clause, checked by capturing `console.error` / `console.warn` across a fault, a discard and
  a reconnect.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| What is released together when a socket is dropped | `subscriber.ts` — the `SocketGeneration` type | A new bare field beside it. The type is the list. |
| Whether a discard owns this socket | `subscriber.ts` — `#discardSocket`'s single check | A per-field `=== conn` comparison — but note it gates the **release only**, never `this.conn.discard`. |
| Which loop `close()` awaits | `subscriber.ts` — `loopDone`, outside the generation, never cleared | Awaiting `#generation?.loopDone`, which awaits **nothing** after a discard. |
| **Which socket is live** | `AuthenticatedConnection.connection`, read as `this.conn.socket` | `SocketGeneration.conn` is a deliberate **shadow**, not a second authority — the read-loop condition at `:919` (and the re-check at `:714`) asks the connection, not the generation, and must keep doing so. A third pointer is the duplication. **This row governs the liveness question only**: it does not forbid passing a generation into `#readLoop` / `#dispatch` as a parameter, which FR-013 requires and which introduces no second authority. (Cited `:793` in the first draft — that is inside `#reportRecovery`'s warn string.) |
| **Whether a read loop is running on this socket** | `subscriber.ts` — `loopConn`, on the class, outside the generation | A `loopStarted` member on `SocketGeneration`. Its install moment is `:716`, after the writes and after #290's re-check; a member sharing `conn`'s moment answers a different question and answers it wrongly (FR-001). |
| **How an interval is released** | `subscriber.ts` — `SocketGeneration.release()` | Dropping the object and trusting the field to go with it. A `setInterval` id is not released by losing the reference, and `#clearKeepalive` being called separately "first" is the same guard-per-field this branch removes (FR-014). |
| That the fault counter resets regardless, and stays reachable | `subscriber.ts` — the field and its comment | Owning it, which makes it unreachable from a deferred `.catch`. |
| How a generation is released | `subscriber.ts` — `#discardSocket` | A `Symbol.dispose` implementation — release here is event-driven, not scope-bound, and every release site is a callback or a catch. |
| **Which package owns socket-generation ownership for a DIAL** | `connection.ts` — `AuthenticatedConnection.pending` and its `discard` | A generation object in `subscriber.ts` that also tracks the dial. Two files already answer two different questions with the same pattern; merging them makes one class answer both (FR-010). |
| **What belongs to a generation** | `subscriber.ts` — the `SocketGeneration` type's field list | Prose in this plan, or a follow-up issue's own list. #295's confirmed-issued record is added to **the type**, never beside it (FR-013). |

## 6. Technical context

**Language/Version**: TypeScript on Deno
**Testing**: `deno test`, the live-broker suite, and `tests/mutations/subscribe_hardening_248.ts`
**Constraints**: `subscriber.ts` only. `AuthenticatedConnection` is **not** touched — #299
established that it is shared with `RedisClient` and that per-consumer state does not belong in it,
and FR-010 adds the stronger reason: it already *has* its generation, spelled `pending`. The
`onReconnect` seam's timing is #290's and is not touched. #295's per-channel subscribe is designed
*for* (FR-013) and not built here.
**Scale/Scope**: 1 production file, 1–2 test files. **40 references** — 8 declarations plus 32 access
sites across 8 methods, counted on `7568163b` (§10's second pass; the first pass recorded 32 across 6
and the difference is `#clearKeepalive` and `#reportRecovery`). SC-011 is the mechanical check that
the boundary held.

### Domain model

- **Socket generation** — the aggregate this feature names. Identity: the `Deno.Conn`. Owns: the read
  loop's promise, the keepalive timer, the write chain, the per-pattern fault counters. Invariant:
  **every piece of it is released together, or none is** — which is what one check buys over four.
- **Reporting counter** — `#handlerFaults`. Deliberately *not* owned by the generation for release
  purposes: it resets on any discard, because a stale reset costs a log line and a missed reset
  hides a fault.
- **Confirmed-issued record** — the designated **fourth member**, owned by
  [#295](https://github.com/locknessland/lockness-monorepo/issues/295) and named here so the type is
  shaped for it. It is the set of patterns the broker has *acknowledged* on this socket — the
  3-element `+psubscribe` frame `#dispatch` discards today at `:956` — as distinct from the set the
  process *wants*, which stays on the class, and as distinct from the set that merely *reached the
  socket*, which is the cheaper member #295's own #245 reasoning rules out. A fresh socket has acknowledged
  nothing, so it is released with the generation and with nothing else — the membership criterion,
  satisfied by a member that does not exist yet. That is the test of whether the criterion is a rule
  or a post-hoc description of three fields.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1–4, 6, 8 | pass | No hono, no dependency, no `any`, no UI, no lockfile, adapter layer. |
| 5. Pre-completion gate | pass | Plus the live suite and the battery. |
| 7. JSDoc on public APIs | pass | No public surface changes; the new type is private. |
| 9. One category per commit | pass | `refactor` + `test`. |
| TDD | **watch** | A refactor's oracle is the existing suite. SC-001 and SC-004 are new tests written first; the rest is "nothing changed", which FR-004 makes checkable by forbidding expectation edits. |
| No silent catches | pass | No new catch. |

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `RedisSubscribeConnection` public API | no | Same constructor, `psubscribe`, `close`, `onReconnect`. |
| Observable behaviour | no | That is the point; FR-004 is how it is checked. |
| `AuthenticatedConnection` | **no** | #299 settled that per-consumer state stays out of it; FR-010 adds that it already carries its own generation as `pending`. |
| `packages/redis/tests/connection.test.ts` | **no** | FR-011 — the `#287` witness is kept as written. SC-011 checks both files with `git diff --stat`. |
| `packages/redis/tests/mutations/subscribe_hardening_248.ts` | yes | Anchors move; one row's disposition changes (FR-005). |

### Visual Prototyping with Claude Artifacts

Nothing to prototype — an internal type extraction.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A refactor quietly changes behaviour | FR-004 forbids editing any expectation; the live suite and the battery are the check, not the unit suite alone. |
| `#handlerFaults` gets tidied into the generation | FR-003, its own decision-table row, and SC-005. |
| `close()` awaits a dropped generation's loop | FR-006 and the existing `close()` tests. |
| The battery's anchors rot silently | Its own dead-mutant guard already refuses an anchor that matches zero times — it caught this twice already. |
| A criterion is written for the wrong observable and passes under its own regression | It happened twice in this plan (SC-009 in the re-entry draft, SC-002 from the start), and both times a plan audit caught it rather than a test. Every criterion added or re-aimed today **names its observation**: SC-002 the connection drop, SC-009 the handler fire count, SC-012 the interval, SC-013 the captured console. A criterion that names no observation is the defect. |
| The refactor's own requirements introduce the defect they were written to prevent | The re-entry's FR-012 did exactly that (A11), and it was one line of arithmetic on a `let conn: Deno.Conn \| undefined`. Both audits run **before** any code for this reason, and both found it by evaluating the expression rather than by reading the prose around it. |

## 10. Architecture audit

*`architect-expert`. Verdict: **fail** — 0 critical, 4 high, 3 medium, 2 low.*

**It answered the attack question first, and the answer is worth keeping**: this *is* a pure refactor
for the release set, and it holds for two reasons the first draft never stated —
`AuthenticatedConnection.discard` is match-guarded, so a stale discard does not null the live
pointer; and a straggler activation is aborted by MECHANISM 2's in-closure re-check before it can
install anything. **Without that re-check the fields would diverge**, so today's safety is held by a
test, not by structure. But the draft was wrong that an object makes divergence impossible: A2, A3
and A4 are three ways the object reintroduces it *inside* itself, where the separate guards would
have failed independently and correctly.

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | HIGH — FR-001 instructed the implementer to fold `#handlerFaults` in, which FR-003 and the domain model forbade | Plan changed: FR-005, and the criterion rewritten so the contradiction cannot recur. Same as S1. |
| A2 | HIGH — the **install-side** check was unnamed; there are six `=== conn` predicates, not three | **Verified independently**: `:454`, `:467`, `:641` guard installation. Plan changed: FR-003 and SC-003. The audit's sharpest point is that this regresses on the **second `psubscribe`**, not in a race. |
| A3 | HIGH — nothing forbade `generation.conn = conn`, which is the literal shape of MECHANISM 1 | Plan changed: `readonly conn`, one construction site (FR-001, FR-002). |
| A4 | HIGH — FR-006 was phrased so that `close()` awaiting **nothing** satisfies it | **Verified independently**: `close()` discards, then awaits `loopDone`, which survives only because it has no guard. Plan changed: FR-006. The audit also noted the suite is a weak oracle here — the regression would be timing-dependent and green. |
| A5 | MEDIUM — `#loopStartedAt` is an unlisted **eighth** per-socket field, and the membership criterion was wrong | **Verified**. Plan changed: the criterion is now "released together", which excludes all three non-members by name. One correction answers A1, A4 and A5. |
| A6 | MEDIUM — FR-006 and "which socket is authoritative" had no decision row | Plan changed: both added. `SocketGeneration.conn` is a deliberate shadow of `AuthenticatedConnection.connection`, not a second authority. |
| A7 | MEDIUM — FR-005's binary was false; the true disposition is **subsumed** | Plan changed: FR-008 names three dispositions and requires the original reason to be carried forward rather than deleted with the anchor. |
| A8 | LOW — the strongest argument for the branch was absent | Accepted: the return is that one witness comes to cover four resources, converting the package's own highest-value uncovered guard from three-tests-needed to one. |
| A9 | LOW — two liveness predicates will read as duplicates in three cycles | Plan changed: the "which socket is live" row, and a §5 note that `Symbol.dispose` is the wrong shape here. |

**Counted blast radius**: 32 references — 7 declarations plus 25 access sites across 6 methods. The
first draft gave a file count and no site count.

**Verdict**: fail. **Coverage**: `plan.md` whole; `subscriber.ts` in the named ranges;
`connection.ts` 240-415, 504-532; the #248 battery 1-145. Nothing executed.

### Second pass — the re-entry, 2026-09-07

*`architect-expert`, dispatched on the revised plan and told not to re-find A1–A9. Verdict: **fail**
— 2 critical, 3 high, 4 medium, 3 low.*

It confirmed what the re-entry got right before finding what it got wrong: the re-measured §1 table
(all eight declarations, all five release lines), FR-003's six predicates including the `:508`
reclassification, FR-008's three battery line numbers, and FR-010's `connection.ts` citations.

| # | Finding | What was done |
| :--- | :--- | :--- |
| A10 | **CRITICAL** — FR-001 folded `loopConn` into `conn`, but `:715` is a loop-**started** flag installed after #290's re-check at `:714`, not an identity shadow. Statically false under FR-002's construction point → the read loop never starts; started at construction instead → in front of #290's fix. | **Verified independently.** Plan rewritten: FR-001 excludes it with the install-moment argument, and §5 gains a row for it. `#loopStartedAt` — already excluded as "never released", and set on the very next line — is the evidence the first draft had and did not use. |
| A11 | **CRITICAL** — FR-012's prescribed `this.#generation?.conn === conn` evaluates `undefined === undefined` → **`true`** on a failed dial, where `loopConn === conn` is `false`. Fires `onReconnect` on a first connect. | **Verified independently** at `:646`, `:765`, `:770`. Introduced *today*, by the requirement written to prevent a regression. Resolved by A10: `loopConn` is not a member, so `:765` is left byte-identical. FR-012 now records both errors. |
| A12 | HIGH — FR-013 priced a write-time member while §6 defines a broker-acknowledged one, whose only write site is a 3-element frame `#dispatch` discards at `:956`. SC-010's own demand to write the diff out was unmet. | **Verified.** Plan changed: FR-013 carries the diff as a table, names the true cost (a `#dispatch` branch + two signature changes), and names the **threading route** as the only one that keeps the predicate count at six. §5's authority row amended so it cannot be read as forbidding it. |
| A13 | HIGH — dropping the generation does not `clearInterval` the keepalive. The only `clearInterval` is in `#clearKeepalive` (`:557-563`), a method the plan never named, with two of three call sites bare. | **Verified.** The sharpest finding of the pass: the member this issue was *filed about* is the one a plain drop does not release, and the failure mode is #274 returning. Plan changed: **FR-014** and **SC-012**. |
| A14 | HIGH — FR-003's "three sites outside the six" missed three more (`:580`, `:1071`, `:1085`), two of them unconditional releases in `close()` where `#discardSocket`'s are conditional. Blast radius counted at **40** (8 declarations + 32 access sites across 8 methods), not §10's 32 across 6. | **Verified.** Plan changed: FR-003's outside table now has six rows and names the `close()` asymmetry as something this plan decides rather than the implementer. The undercount and the enumeration gap were one error — both omitted `#clearKeepalive` and `#reportRecovery`. |
| A15 | MEDIUM — FR-010's stated ground failed on both legs: `pending.conn` is late-assigned and mutable (the shape FR-001 forbids) and deliberately survives a discard; #299 ruled on backoff, not per-consumer state. | **Verified.** The *decision* stands and SC-011 still checks it; the *reason* is replaced with the two-consumer sharing fact, and both withdrawn claims are recorded in FR-010 rather than deleted. |
| A16 | MEDIUM — FR-002's collapsed predicate is not semantics-preserving: MECHANISM 1 is permissive, the collapse refuses. | Plan changed: FR-002 records the non-neutrality and why it is unreachable, rather than letting FR-007 imply it does not exist. |
| A17 | MEDIUM — SC-009 asserted an observable FR-012 does not affect. | Plan changed: re-aimed at `onReconnect` fire counts across three paths. Found by both seats independently. |
| A18 | MEDIUM — stale citations in the sections §1's drift note claims to have fixed: FR-009's `:886-897`, §5's `:793`. | Plan changed: both corrected. §1's note now over-claimed and is qualified by the corrections themselves. |
| A19 | LOW — FR-013 and SC-010 disagreed on "one release line". | Plan changed: struck from SC-010. A member needing a release line is not a member. |
| A20 | LOW — six battery rows anchor in the restructured methods; FR-008 dispositions three. | Accepted into FR-008 as a check obligation: the other three (`:121`, `:203`, `:307`) are recorded as checked and surviving. A broken anchor is reported DEAD by the harness, so this fails loudly rather than silently. |
| A21 | LOW — SC-011 named no diff base. | Plan changed: `git diff main...HEAD --stat`. |

**Counted blast radius, corrected**: **40** references — 8 declarations + 32 access sites across 8
methods. The first pass recorded 32 across 6, omitting `#clearKeepalive` (the only `clearInterval`)
and `#reportRecovery` (the only read of `#loopStartedAt`) — the same two methods whose sites FR-003
missed.

**Verdict**: fail. **Coverage**: `plan.md` whole; `subscriber.ts` whole (1088 lines); #298, #295 and
#299 with all comments; `connection.ts` `:240-439`, `:480-531`; the battery `:95-215` + `:303-325`;
`connection.test.ts` `:340-380`; `subscriber.test.ts` `:1009-1045` only. **Not read**: the rest of
`subscriber.test.ts`, the live-broker helper, realtime's `onReconnect` consumers. Nothing executed —
A10 and A11 are read from the code, not observed, and both are checkable by `deno check` the moment
a line of code exists.

## 11. Security audit

*`security-expert`. Verdict: **fail** — 1 high, 2 medium, 2 low.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | HIGH — FR-001 put the fault counters in a nullable generation, which `#dispatch`'s deferred `.catch` can reach after a drop | **Verified**. Either a `TypeError` inside a `.catch` — the #296 process kill, fixed two branches ago — or no throttle on a peer-driven flood. Plan changed: FR-005, and its defence re-aimed from *conditionality* to *ownership*, which was the wrong axis. |
| S2 | MEDIUM — FR-002's "one check, then release" would gate the socket close | **Verified independently** at `subscriber.ts:511`: `this.conn.discard(conn)` is unconditional today, between the guarded clears. Gating it leaks an AUTH'd socket and an fd per stale discard and leaves `pending` on a dead dial — the #287 defect. Plan changed: FR-004, SC-002. |
| S3 | MEDIUM — the consolidation concentrates four resources behind one check, and FR-005's escape hatch permitted shipping that with today's zero coverage | Accepted, and the hatch closed: FR-008 removes "or the row is removed with the reason recorded" as a free option. The seat's framing is the one that matters — taking the hatch would concentrate the blast radius and produce no new evidence, which is a net loss. |
| S4 | LOW — no test observes a stale discard; the cheapest fixture named | Accepted into SC-001, with the seat's construction: a fake server that answers the first `PSUBSCRIBE` then stops reading, a low `livenessMs`, and the keepalive's stalled PING rejecting *after* the read-loop fault brought up the successor. |
| S5 | LOW — the #296 log prohibition has no witness while its JSDoc is being restructured | Plan changed: FR-009 and SC-008. |

**Positive results**: the refactor moves no authenticity decision and structurally cannot —
`#verifyAndDecode`, the MAC check and the #272 replay window live in another package, downstream of
everything this file owns, and every rejection path there returns rather than throws, so no
authenticity verdict routes through the fault throttle. No new input surface; no new peer-influenced
bytes, if FR-009 holds.

**Coverage**: `plan.md` whole; `subscriber.ts` whole; the battery 90-232; `connection.ts`'s
`discard`; realtime's `onControl`/`#verifyAndDecode`. `09` and `10` knowledge files not loaded.

### Second pass — the re-entry, 2026-09-07

*`security-expert`, dispatched on the revised plan and told not to re-find S1–S5. Verdict: **fail**
— 0 critical, 1 high, 3 medium, 1 low.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S6 | **HIGH** — the `loopConn` collapse, reached independently of the architecture seat and by a different route: three sites depend on `loopConn`'s *meaning*, and the plan replaced none of them. It also identified the **wrong consumer** in FR-012 — `wasDelivering` feeds `#reconnectIntent` → `onReconnect` → realtime's #271 revocation re-check, not `#reportRecovery`. | **Verified.** Resolved with A10/A11: FR-001 excludes `loopConn`, FR-012 leaves `:765` byte-identical and records the misidentification. Two seats converging from opposite ends on one root cause is the strongest signal either pass produced. |
| S7 | MEDIUM — FR-009's `:886-897` citation is stale; the prohibition is at `:1013-1022` and the line it governs at `:1042-1047`. The one citation §1's drift note did not re-measure. | **Verified.** Plan changed: FR-009 names both ranges and requires them to move together. Held at MEDIUM by the seat because SC-008 is correctly aimed regardless of where FR-009 points. |
| S8 | MEDIUM — FR-013's fourth member is peer-adjacent and neither its charset nor its cap is bounded at the type; FR-009's second clause is satisfied **vacuously** today (no member is a string) and had no criterion. `confirms #295` S1/S2. | **Verified.** Plan changed: FR-009's second clause re-phrased positively (only a count or a boolean may reach a log line), **SC-013** added as its witness, and FR-013 records that the member's element type is a charset-validated channel name carrying its own cap rather than inheriting both from a caller. The seat's framing decides the priority: one sentence now, a migration once #295 ships. |
| S9 | MEDIUM — SC-002 named no observation, unlike SC-004 and SC-009, while guarding #287's AUTH'd-socket and fd leak. | Plan changed: SC-002 names the fake server's connection drop or a `BadResource` read as the observable. |
| S10 | LOW — SC-010's diff was nowhere in the plan. Written out by the seat it passes, but **only if** `#activate` holds the generation in a local rather than re-reading `this.#generation` after an await. | **Verified**, and the same conclusion the architecture seat reached from the `#dispatch` end. Plan changed: FR-002 requires the local, which is the single condition making FR-013's claim true rather than aspirational. |

**Positive results, second pass**: no path in the proposed design stops reaching
`this.conn.discard(conn)` (`:552`) — every discard site routes through `#discardSocket`, and FR-002's
replace-by-discard *adds* a call rather than removing one. The double-discard FR-002 introduces is
already neutralised: `AuthenticatedConnection.discard` wraps `close()` in `try/catch` and documents
idempotence (`connection.ts:517-520`). FR-005 is right on the axis it now names. And on the question
of whether a peer can influence **which** generation is live: **no** — generation identity is the
`Deno.Conn` the process owns, no peer-supplied byte reaches the install predicate, and churn is
bounded by `#scheduleRetry`'s jittered backoff (`:860-864`) and #274's keepalive. A peer selects
*when* a generation ends, never *which object* is live.

**What an authenticated stranger could do, if A11 had shipped**: delay another user's eviction by up
to `reconcileIntervalMs`, by healing the subscribe socket while stalling the command socket's `EVAL`
— a condition realtime's own `#runRevocationReconcile` docblock names as broker-controllable. The
plan could never *grant* access; it could delay its removal. That is now foreclosed by FR-012.

**Coverage**: `plan.md` whole; security knowledge `00`, `README`, `08`, `09`; #298 and #295 with all
comments. `subscriber.ts` `:108-300`, `:485-560`, `:640-780`, `:813-960`, `:985-1060` plus a
whole-file grep of every identity site; `connection.ts` `:265-280`, `:495-532`; the battery's rows;
realtime's `redis.ts` `:1330-1370`. **Not read**: `subscriber.test.ts`, `reconnect_intent_290.ts`.
Nothing executed.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| The honest scope is **two ownership guards becoming one**, not four. Is the branch still worth running now, or does the consolidation belong inside #295, where the fourth member is being built anyway? | **Ship it now, as re-scoped.** The 3-member type with FR-014's `release()`, taking `#keepaliveConn` and `#writeChainConn` to one guard. Rejected: folding it into #295 (a P1 waits on a P3 XL, and one branch would carry a refactor plus a CRITICAL fix through one review) and closing it with the criterion written in as a comment (nothing structural then stops the fourth field learning the guard the hard way). #295 adds the fourth member into an existing type, which is what its gate on this issue was for. | 2026-09-07 |

### Decided without asking

- **`AuthenticatedConnection` is not touched** — because it is instantiated by two consumers, so
  reshaping it is a two-consumer change under a third branch's pressure (FR-010). The first re-entry
  draft's stronger claim, that `pending` already *is* a socket generation, is withdrawn and recorded.
- **`#handlerFaults` keeps its unconditional reset**, as a named exception rather than an
  inconsistency to smooth away.
- **`loopConn` stays on the class** (FR-001). This is the largest change the re-entry makes and it is
  taken rather than asked, because the plan's own criterion decides it: `#loopStartedAt` is set on the
  next line, by the same install, and was already excluded as "never released". Both audits reached
  it independently. It is surfaced in the §12 question only through its consequence — the smaller
  scope — not as a design fork.
- **The generation releases through a `release()` method** rather than a reference drop (FR-014). A
  `setInterval` id is not released by losing its reference, and the alternative — remembering to call
  `#clearKeepalive` first at each drop site — is the per-field discipline this branch exists to
  remove. `Symbol.dispose` stays rejected for the reason §5 already gives.
- **#295's fourth member is acknowledgement-semantics, not write-time**, and the threading route is
  named (FR-013). Decided rather than asked because #295's body already settled it: the cheaper
  member reintroduces #245.
- **The battery's two anchor-losing rows are subsumed, not deleted** (FR-008), carrying their
  `expectSurvival` reasons forward. Removal was never on offer — it would lose a recorded reason with
  no trace, where a broken anchor fails loudly as a DEAD mutant.
