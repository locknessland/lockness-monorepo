# Tasks: Give a socket generation an object

**Feature dir**: `.specnaut/specs/251-socket-generation-object/` | **Branch**:
`251-socket-generation-object` | **Backlog item**:
[#298 — Redis: give a socket generation an object instead of five parallel fields](https://github.com/locknessland/lockness-monorepo/issues/298)

Derived from the **approved** `plan.md` (stop 1 answered 2026-09-07: ship as re-scoped). Every task
below names the decision-table home it touches; a decision may not move out of its home without the
plan being amended first.

**Tests are requested.** The constitution makes TDD non-negotiable for the `developer` seat, and the
plan's §7 records TDD as `watch` precisely because a refactor's oracle is the existing suite — so
SC-001, SC-002, SC-009 and SC-012 are written **before** the production change and must fail first.

**Scope, as re-scoped**: `SocketGeneration` holds three members and subsumes **two** ownership
guards (`#keepaliveConn`, `#writeChainConn`). `loopConn` keeps its own guard at `:553` — FR-001.

> **Broker discipline for every live-broker task below.** Port **6379 on this machine belongs to an
> unrelated project's container and must not be touched.** Bind scratch brokers to 6388/6389/6390,
> and remove them when the task ends.

---

## Phase 1 — Setup: establish the baseline the whole feature is measured against

FR-007 says "no expectation edited" and SC-006 says every suite passes. Neither is checkable without
a recorded green baseline **before** a line changes. This phase produces that record.

- [X] T001 Record the unit-suite baseline: run `deno task test` and write the pass/fail counts into `.specnaut/specs/251-socket-generation-object/baseline.md`
- [X] T002 [P] Record the mutation baseline for the two affected batteries: `deno run -A packages/redis/tests/mutations/subscribe_hardening_248.ts` and `deno run -A packages/redis/tests/mutations/reconnect_intent_290.ts`, appending both survivor counts to `.specnaut/specs/251-socket-generation-object/baseline.md`
- [X] T003 [P] Record the live-broker baseline: start a scratch Redis on **6388**, run `LOCKNESS_REDIS_PORT=6388 deno task test:redis -- --trace-leaks`, append the result to `.specnaut/specs/251-socket-generation-object/baseline.md`, then remove the container
- [X] T004 Record the current fire-count behaviour of `onReconnect` across the three SC-009 paths (failed first dial, first dial + failing `PSUBSCRIBE`, fault after delivery) in `.specnaut/specs/251-socket-generation-object/baseline.md` — this is the "today" half of SC-009 and must be measured before the refactor, not after

---

## Phase 2 — Foundational: the type and its release

Blocking prerequisite for both stories. Nothing in Phase 3+ can start until the type exists and
`release()` is the only drop path.

- [X] T005 Add the `SocketGeneration` type to `packages/redis/subscriber.ts` — `readonly conn: Deno.Conn`, `keepaliveTimer: ReturnType<typeof setInterval> | undefined`, `writeChain: Promise<void>` — with a docblock stating the membership criterion ("everything released together when a socket is dropped") and naming the four excluded fields. **Home**: the type IS the decision-table home for "what is released together" (§5 row 1); do not restate the list anywhere else
- [X] T006 Add `SocketGeneration.release()` in `packages/redis/subscriber.ts` — clears its own interval via `clearInterval` and settles its own chain. **FR-014**: a `setInterval` id is not released by dropping the reference. **Home**: §5 row "How an interval is released"; `#clearKeepalive` must not remain a second home
- [X] T007 Add the `#generation: SocketGeneration | null` field to `packages/redis/subscriber.ts`, replacing `#keepaliveConn` (`:215`) and `#writeChainConn` (`:290`). **Leave `loopConn` (`:193`), `loopDone` (`:195`), `#loopStartedAt` (`:235`) and `#handlerFaults` (`:298`) exactly as they are** — FR-001, FR-005, FR-006

---

## Phase 3 — US1: a stale discard cannot damage the live generation (P1)

**Story goal**: one ownership check replaces two, and a stale discard leaves the live generation's
timer and write chain intact while still closing its own socket.

**Independent test criteria**: with a two-generation fixture, discarding the stale socket leaves the
live keepalive firing and the live write chain intact (SC-001), closes the stale socket (SC-002),
and — after a *live* generation is dropped — its interval stops firing (SC-012).

### Tests first (must fail before T013)

- [X] T008 [P] [US1] Write the two-generation fixture in `packages/redis/tests/fake_server.ts`: a server that answers the first `PSUBSCRIBE` then stops reading, so a low `livenessMs` makes the keepalive's stalled `PING` reject *after* the read-loop fault has already brought up the successor. This is the fixture the #248 battery records at `:186` as "constructible in principle and not constructed here"
- [X] T009 [P] [US1] Write **SC-001** in `packages/redis/tests/subscriber.test.ts`: a stale discard leaves the live generation's keepalive armed and its write chain intact. Assert on observable writes, not on private fields
- [X] T010 [P] [US1] Write **SC-002** in `packages/redis/tests/subscriber.test.ts`: the stale discard still **closes its socket** — asserted by the fake server observing its connection drop, or by a subsequent read on the stale socket rejecting `BadResource`. **Not** by the absence of a leak warning
- [X] T011 [P] [US1] Write **SC-012** in `packages/redis/tests/subscriber.test.ts`: after a generation is dropped, its keepalive **interval no longer fires** — advance fake time past two `keepaliveMs` windows and count writes on the stale socket. Assert on the interval's effect, never on `#keepaliveTimer`
- [X] T012 [US1] **Prove the three witnesses live — against the MUTANT, not against the unchanged file.** Corrected during implementation: this task originally said "confirm all three fail against the unchanged production file", which is wrong for a refactor. Today's code is *correct* — the conditional clears already exist — so SC-001, SC-002 and SC-012 all pass before the change and must. What proves them live is that each **fails against the mutation it exists to catch**: make `#discardSocket`'s clear unconditional (SC-001), gate `this.conn.discard(conn)` behind the ownership check (SC-002), and drop the generation without clearing its interval (SC-012). Run each mutation, watch the matching witness go red, revert. A witness never observed failing is a witness that proves nothing

### Implementation

- [X] T013 [US1] Rewrite `#discardSocket` (`packages/redis/subscriber.ts:531-554`) around one ownership check: `this.#generation?.conn === conn` gates the **release** only, calling `release()` and nulling the field. **FR-004**: `this.conn.discard(conn)` at `:552` stays **unconditional** — it is the only path that closes the socket, clears the cached socket and clears the single-flight `pending`. **Keep** `this.#handlerFaults.clear()` unconditional at the top (FR-005) and `if (this.loopConn === conn) this.loopConn = null` at the bottom (FR-001)
- [X] T014 [US1] Collapse the install side in `#activate` (`packages/redis/subscriber.ts`): construct the generation once after the `closed` re-check and before the first `#write`, **binding it to a `const` local that is never re-read from `this.#generation` after an await** (FR-002 — the single condition making FR-013 true). Install replaces by **discarding first, then creating**, never by assignment (FR-003)
- [X] T015 [US1] Route `#write`'s MECHANISM 1 (`:495-498`) and MECHANISM 2 (`:508`) through the single predicate `this.#generation?.conn !== conn`. Add the one-sentence comment FR-002 requires, recording that the collapsed predicate **refuses** where MECHANISM 1 **rebased**, and why no reachable sequence distinguishes them
- [X] T016 [US1] Route `#armKeepalive`'s bare `#clearKeepalive()` (`:580`) and `close()`'s (`:1071`) through the generation's `release()`. **Preserve the conditional/unconditional asymmetry** that FR-003 documents: `close()` releases unconditionally, `#discardSocket` conditionally
- [X] T017 [US1] Verify T009–T011 now **pass**, and that removing the single ownership check from T013 makes SC-001 fail — **SC-005**, the mutation the whole consolidation is worth

---

## Phase 4 — US2: nothing else changes (P1)

**Story goal**: the refactor is observably neutral, and the two batteries say so rather than the
author saying so.

**Independent test criteria**: the full suite, the live suite and both batteries pass with **no
expectation edited** — only battery anchors whose text moved.

- [X] T018 [US2] Repair the moved anchor on the `#286 no in-closure generation check` row (`packages/redis/tests/mutations/subscribe_hardening_248.ts:158`): `this.#writeChainConn !== conn` becomes `this.#generation?.conn !== conn`. **Anchor repair only** — the row lives, it is not subsumed
- [X] T019 [US2] Subsume the `#286 no rebase on a generation change` row (`:169`) and the `#286 the discard clear is made unconditional` row (`:186`) into the SC-005 row per **FR-008**, carrying **both** `expectSurvival` texts forward as notes on the surviving row. Neither reason may be lost with its anchor
- [X] T020 [P] [US2] Confirm the three rows FR-008 expects to survive are untouched and still killing: `:121`, `:203` and `:307`. The last anchors on `'        this.#handlerFaults.clear()'` with literal 8-space indentation, so it survives only if T013 placed the gate around the **release** and not around `#discardSocket`'s whole body
- [X] T021 [US2] Run `deno run -A packages/redis/tests/mutations/subscribe_hardening_248.ts` and `reconnect_intent_290.ts`; **SC-007** — zero unexpected survivors and zero DEAD anchors, compared against T002's baseline
- [X] T022 [US2] Write **SC-009** in `packages/redis/tests/subscriber.test.ts`: `onReconnect` fires exactly as often as T004 recorded across all three paths — zero on a failed first dial, zero on a first dial whose `PSUBSCRIBE` fails, once on a fault after delivery began. Count on the handler; do not infer from a log line. This is the criterion that replaced one which passed under its own regression
- [X] T023 [US2] **SC-006** — run `deno task test` and diff the result against T001. Then confirm `git diff main...HEAD -- packages/redis/tests/subscriber.test.ts` contains **additions only**: FR-007 permits new tests, never an edited expectation
- [X] T024 [US2] **SC-004** — confirm `close()` after a read-fault discard still awaits the faulted loop's unwind, asserted by resolution ordering rather than by the absence of a sanitizer complaint. `loopDone` stays on the class (FR-006), so this should pass unchanged; a failure here means T013 or T016 folded it in
- [X] T025 [US2] **SC-003** — two `psubscribe()` calls on one live socket leave the first call's keepalive interval armed and unchanged. This is FR-003's install-side regression, reachable on the **second call** rather than through a race
- [X] T026 [US2] Live-broker run on port **6389**: `LOCKNESS_REDIS_PORT=6389 deno task test:redis -- --trace-leaks`, compared against T003. Remove the container when done

---

## Phase 5 — Polish and cross-cutting

- [X] T027 [P] **SC-013** — assert no log line emitted by `packages/redis/subscriber.ts` contains any generation member's **contents**, by capturing `console.error` / `console.warn` across a fault, a discard and a reconnect. FR-009's second clause, which was satisfied vacuously before
- [X] T028 [P] **SC-008 / FR-009** — confirm the #296 prohibition docblock (`:1013-1022`) and the `console.error` it governs (`:1042-1047`) moved **together** if either moved, and that the handler-fault line still carries neither `topic` nor `payload`
- [X] T029 **SC-010 / FR-013** — write the fourth-member diff against the shipped type in `.specnaut/specs/251-socket-generation-object/tasks.md` (this file, as a closing note) and confirm it costs one field, one initialiser and **zero** new `=== conn` comparisons on the threading route. If it does not, the shape is wrong and #295 is the issue that pays — say so rather than adjusting the claim
- [X] T030 **SC-011** — confirm `git diff main...HEAD --stat` names neither `packages/redis/connection.ts` nor `packages/redis/tests/connection.test.ts` (FR-010, FR-011)
- [X] T031 [P] Update `packages/redis/AGENTS.md` — the per-socket field list and the "each field learned the guard separately" pitfall are both now stale. State the membership criterion and that `loopConn` is deliberately outside it, or the next agent re-folds it
- [X] T032 [P] Update `packages/redis/README.md` if it describes the subscribe socket's per-generation state; **grep for the identifiers** (`keepaliveConn`, `writeChainConn`, `discardSocket`), not for the concept
- [~] T033 Full gate: `deno fmt && deno lint && deno check && deno task test` — **done, green** (2135/0, live broker 377/0). `deno task mutate --require-all` ran **15/15 clean** on the pre-review tree; the post-review re-run of the 248 battery was killed twice by machine memory at 11 and 15 of 25 rows, so the five rows changed since were verified individually instead. **Marked `[~]`, not `[X]`** — the nightly CI job is what closes it

---

## Dependencies

```
Phase 1 (T001-T004)  ── the baseline; nothing may change before it is recorded
        ↓
Phase 2 (T005-T007)  ── the type + release(); blocks both stories
        ↓
Phase 3 US1 (T008-T017)  ── tests T008-T012 BEFORE implementation T013-T017
        ↓
Phase 4 US2 (T018-T026)  ── neutrality; needs US1's implementation to exist
        ↓
Phase 5 (T027-T033)
```

**US2 depends on US1** — unusually for this template, and deliberately: "nothing else changed" is not
testable until something changed. They are not independent stories, they are a change and its proof.

## Parallel opportunities

| Group | Tasks | Why safe |
| :--- | :--- | :--- |
| Baseline | T002, T003 | different suites, different ports; T003 owns 6388 |
| US1 tests | T008, T009, T010, T011 | T008 is `fake_server.ts`, the rest are separate cases in `subscriber.test.ts` — write T008 first if one agent does all four |
| Battery checks | T020 alongside T018/T019 | read-only verification of untouched rows |
| Docs | T031, T032 | different files |
| Log witnesses | T027, T028 | different assertions, same file — serialise if one agent |

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That is the consolidation and its witness, and it is
the point at which the branch has bought something: the #248 battery's highest-value uncovered guard
becomes covered, by one test rather than three.

Phase 4 is not optional polish — FR-007 and SC-006 are what make "no behaviour change" a claim rather
than a hope, and the branch does not ship without them. Phase 5 carries the two obligations that
outlive this branch: FR-013's shape check, which #295 depends on, and the docs, which this repo's
record shows are the thing most reliably missed.

---

## T029 / SC-010 — the fourth member's diff, written out against the SHIPPED type

The plan demanded this be **demonstrated, not asserted** — the first draft
asserted it, and the architecture audit found the assertion priced a different
member than §6 defines. Written against `SocketGeneration` as it now stands:

```ts
class SocketGeneration {
    readonly conn: Deno.Conn
    writeChain: Promise<void> = Promise.resolve()
    #keepaliveTimer: ReturnType<typeof setInterval> | undefined
+   /** Patterns the broker has ACKNOWLEDGED on this socket (#295). */
+   readonly issued = new Set<string>()
    ...
}
```

| Cost | Claimed in the first draft | Actual, measured |
| :--- | :--- | :--- |
| field on the type | 1 | **1** |
| initialiser at the construction site | 1 | **0** — a field initialiser needs no line in `#activate` |
| release line | 1 | **0** — a `Set` is released by the drop; the clause was struck from SC-010 |
| new branch in `#dispatch` | — | **1**, to recognise the 3-element `+psubscribe` frame `#dispatch` discards at its `length !== 4` guard |
| signature changes | — | **2** — `#readLoop` and `#dispatch` must carry the generation |
| **new `=== conn` identity predicates** | 0 | **0** |

**The zero holds, and only on one route.** Thread the generation down
(`#readLoop(gen)` → `#dispatch(reply, gen)` → `gen.issued.add(p)`) and no new
identity predicate is needed, because the object in hand *is* the generation
that frame arrived on. Reach it through `this.#generation` instead and a discard
landing inside `readReply` records a pattern on a generation that never confirmed
it — #245 again — so correctness then demands
`if (this.#generation?.conn === conn)` plus a `conn` parameter: the seventh
predicate FR-013 forbids.

Two things the shipped shape does that make the threading route available:

- **`#activate` holds its generation in a `const`** and never re-reads
  `this.#generation` after an await (FR-002), so the write-side already has the
  object rather than the field.
- **§5's "which socket is live" row was amended** so it cannot be read as
  forbidding a generation *parameter*. It governs the liveness question only —
  `#readLoop`'s `this.conn.socket === conn` still asks the connection, and a
  generation passed as an argument introduces no second authority.

**What is NOT owed here and must not be smuggled in**: bounding the member. Its
element type is a charset-validated channel name and it carries its own cap —
one sentence in FR-013, and #295's own security audit records why (its
`ChannelManager.subscribe` calls no `isValidName`, and the pattern set is
client-driven and unbounded). That belongs to #295's implementation, not to this
branch, but the requirement is written now because it is one sentence today and a
migration once deployments hold live channels.
