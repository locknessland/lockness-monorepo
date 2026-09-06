# Plan: Give a socket generation an object

**Branch**: `251-socket-generation-object` | **Date**: 2026-09-06 | **Backlog item**:
[#298 — Redis: give a socket generation an object instead of five parallel fields](https://github.com/locknessland/lockness-monorepo/issues/298)

---

## 1. Why this exists

`RedisSubscribeConnection` carries per-socket state as parallel fields, and **each has had to learn
the same ownership guard separately, one incident at a time.**

| Field | Guard in `#discardSocket` |
| :--- | :--- |
| `loopConn` (`:189`) | `if (this.loopConn === conn)` |
| `loopDone` (`:191`) | none — `close()` awaits whatever it holds |
| `#keepaliveTimer` (`:202`) | via `#keepaliveConn` |
| `#keepaliveConn` (`:211`) | `if (this.#keepaliveConn === conn)` |
| `#writeChain` (`:255`) | via `#writeChainConn` |
| `#writeChainConn` (`:269`) | `if (this.#writeChainConn === conn)` |
| `#handlerFaults` (`:277`) | **unconditional**, deliberately |

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
**Then** the live generation's timer, read loop, write queue and fault counters are all untouched —
by **one** check rather than three, so a seventh field cannot be added without one.

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
holds exactly three members — `conn`, `keepaliveTimer`, `writeChain` — with `loopConn`,
`#keepaliveConn` and `#writeChainConn` collapsing into `conn`; and it excludes, by name and with a
reason each:

| Excluded | Why it is not released with the generation |
| :--- | :--- |
| `loopDone` | **Never released.** `close()` awaits it *after* discarding the socket, so it must outlive the drop — that is its whole purpose. |
| `#handlerFaults` | **Released unconditionally.** A stale reset costs one log line; a missed reset silences a real fault for a generation's lifetime. |
| `#loopStartedAt` | **Never released.** An eighth per-socket field the first draft's table missed entirely — set beside `loopConn` and `loopDone`, read by `#reportRecovery` to decide whether a socket survived. |

- **FR-001**: `SocketGeneration` holds `conn`, `keepaliveTimer` and `writeChain`, and **`conn` is
  `readonly`**. Identity is not re-pointed: MECHANISM 1 at `subscriber.ts:454-457` is literally an
  in-place rebase of an identity field, and translated member-for-member it produces one object
  claiming to be `conn2` while its timer pings `conn1` and its loop is `conn1`'s — after which
  FR-002's single check answers about the wrong resources and the orphaned interval id, being
  unref'd, is unreachable forever.
- **FR-002 — one construction site.** A generation is created in `#activate`, after the `closed`
  re-check and before the first `#write`. `#write` neither creates nor rebases one. MECHANISM 1 and
  MECHANISM 2 collapse into a single predicate, `this.#generation?.conn !== conn`, evaluated at entry
  and again inside the queued closure.
- **FR-003 — the install side, which the first draft never mentioned.** There are **six** `=== conn`
  predicates in this file, not three: `:454`, `:467` and `:641` guard *installation*, and only
  `:498`, `:510`, `:512` guard *discard*. A generation is installed only when
  `this.#generation?.conn !== conn`; installing replaces by **discarding first, then creating** —
  never by assignment. Without this, `psubscribe()` on an already-live connection reaches `#activate`,
  `connect()` returns the **cached** socket, and a per-activation generation silently drops the live
  write chain and orphans the live keepalive. **That is reachable on the second `psubscribe` call**,
  not through an exotic race.
- **FR-004 — `#discardSocket` gates the RELEASE, not the close.** `this.conn.discard(conn)`
  (`subscriber.ts:511`) is unconditional today and must stay so. It is the only path that calls
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
- **FR-008 — the battery row has three dispositions, not two.** The `#286 discard clear made
  unconditional` row's anchor is deleted by this refactor, so the mutation becomes *the same edit* as
  SC-004's. It is **subsumed**: merged into that row, carrying its original `expectSurvival` prose
  forward as a note, so the recorded reason is not lost with the anchor. It may not simply vanish.
- **FR-009**: The #296 log-content prohibition at `subscriber.ts:886-897` — never `topic`, never
  `payload` — is preserved verbatim wherever it moves, and `SocketGeneration` introduces no
  identifier into any log line and is never interpolated into one.

## 4. Success criteria

- **SC-001**: Discarding a stale socket while a newer one is live leaves the live one's keepalive
  armed, its read loop running and its write chain intact.
- **SC-002**: A stale discard still **closes its socket** — the release is gated, the close is not.
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

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| What is released together when a socket is dropped | `subscriber.ts` — the `SocketGeneration` type | A new bare field beside it. The type is the list. |
| Whether a discard owns this socket | `subscriber.ts` — `#discardSocket`'s single check | A per-field `=== conn` comparison — but note it gates the **release only**, never `this.conn.discard`. |
| Which loop `close()` awaits | `subscriber.ts` — `loopDone`, outside the generation, never cleared | Awaiting `#generation?.loopDone`, which awaits **nothing** after a discard. |
| **Which socket is live** | `AuthenticatedConnection.connection`, read as `this.conn.socket` | `SocketGeneration.conn` is a deliberate **shadow**, not a second authority — `#readLoop:793` asks the connection, not the generation, and must keep doing so. A third pointer, or the read loop switching, is the duplication. |
| That the fault counter resets regardless, and stays reachable | `subscriber.ts` — the field and its comment | Owning it, which makes it unreachable from a deferred `.catch`. |
| How a generation is released | `subscriber.ts` — `#discardSocket` | A `Symbol.dispose` implementation — release here is event-driven, not scope-bound, and every release site is a callback or a catch. |

## 6. Technical context

**Language/Version**: TypeScript on Deno
**Testing**: `deno test`, the live-broker suite, and `tests/mutations/subscribe_hardening_248.ts`
**Constraints**: `subscriber.ts` only. `AuthenticatedConnection` is **not** touched — #299 established
that it is shared with `RedisClient` and that per-consumer state does not belong in it. The
`onReconnect` seam's timing is #290's and is not touched.
**Scale/Scope**: 1 production file, 1–2 test files

### Domain model

- **Socket generation** — the aggregate this feature names. Identity: the `Deno.Conn`. Owns: the read
  loop's promise, the keepalive timer, the write chain, the per-pattern fault counters. Invariant:
  **every piece of it is released together, or none is** — which is what one check buys over four.
- **Reporting counter** — `#handlerFaults`. Deliberately *not* owned by the generation for release
  purposes: it resets on any discard, because a stale reset costs a log line and a missed reset
  hides a fault.

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
| `AuthenticatedConnection` | **no** | #299 settled that per-consumer state stays out of it. |
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

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| _pending the stop_ | | |

### Decided without asking

- **`AuthenticatedConnection` is not touched.** #299 established the boundary and this stays on the
  right side of it.
- **`#handlerFaults` keeps its unconditional reset**, as a named exception rather than an
  inconsistency to smooth away.
