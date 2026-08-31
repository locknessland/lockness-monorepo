# Tasks: Close four gaps in the events emitter

**Feature**: `003-events-emitter-gaps` | **Backlog item**: [#135](https://github.com/locknessland/lockness-monorepo/issues/135)
**Derived from**: `plan.md` (approved 2026-09-01, after both plan audits)

## Format: `[ID] [P?] [Story] Description`

- `[P]` — parallelisable: different file, no dependency on an incomplete task.
- `[USn]` — the user story from `plan.md` §2. Setup, Foundational and Polish carry none.

**Tests are REQUIRED here.** The constitution makes TDD non-negotiable: a failing test first, the
minimal code to pass, then refactor. Every implementation task below has its test task before it.

## Path Conventions

Repository root is `/Users/kevin/Sites/lockness`. Paths below are project-relative.

- Emitter and public surface: `packages/events/`
- Framework re-export and bootstrap: `packages/core/`
- Foundation layer: `packages/contract/`

## 🔒 Decision homes carried forward from `plan.md` §5

A task may not put a decision anywhere but its named home. Where a task touches one, the home is
named in the task itself.

| Decision | Home |
| :--- | :--- |
| Dispatch immune to concurrent modification | `packages/events/mod.ts` → `emit()`'s snapshot helper |
| Whether a listener is registered at all | `packages/events/mod.ts` → `#register()` |
| What a removal takes with it | `packages/events/mod.ts` → `#unregister()` |
| What an entry carries to be removable | `packages/events/mod.ts` → `ListenerEntry.dispose` |
| How a stream buffers and what it drops | `packages/events/stream.ts` → `createEventQueue()` |
| The bounds and the policy set | `packages/events/stream.ts` → the three constants |
| What an overflow report may contain | `packages/events/stream.ts` → its reporter |
| Whether debug is on | `packages/events/debug.ts` → the flag, set from core |
| What a debug line may contain | `packages/events/debug.ts` → `debugLog(record)` |
| How an untrusted string is made log-safe | `packages/contract` → `safeForLog()` |

---

## Phase 1: Setup

Nothing to initialise — the package, its manifest and its test suite all exist. One task, to fix the
starting point.

- [x] T001 Confirm the branch is `003-events-emitter-gaps` and the tree is clean, then run `deno task test` to record the pre-change baseline (expect 754 passed)

---

## Phase 2: User Story 0 — a self-removing listener does not break the dispatch (Priority: P1) 🎯 SHIPS FIRST, ALONE

**Goal**: `emit()` runs the listeners that existed when the dispatch started.

**Why first and alone** (answered at the plan stop, Q1): this corrects a defect reachable in shipped
code, depends on nothing else here, and a revert of the feature work must not be able to take it
back out.

**Independent test**: three listeners; the first removes itself; all three still run.

### Tests for User Story 0

- [x] T002 [US0] Write the failing regression test in `packages/events/tests/events.test.ts`: three listeners on one event, the first calls `off()` on itself, assert all three ran. It must fail with `['A','C']` before any fix.
- [x] T003 [P] [US0] Add the wildcard counterpart in `packages/events/tests/events.test.ts`: a wildcard listener calling `offAny()` on itself, asserting the other still runs. It passes today — it pins the behaviour the specific path is being brought up to.
- [x] T004 [P] [US0] Add a test in `packages/events/tests/events.test.ts` asserting a listener ADDED during a dispatch does not run in that dispatch, and does run in the next.

### Implementation for User Story 0

- [x] T005 [US0] In `packages/events/mod.ts` `emit()`, take a snapshot of the specific-event listeners before iterating — the decision's home. Reuse the same shape the wildcard path already uses at `mod.ts:207` rather than inventing a second one.
- [x] T006 [US0] Delete the now-redundant re-sorts at `packages/events/mod.ts:186` and `:208` — the two that run at EMIT time. **Not `:273`**: that is `onAny()`'s registration sort, the wildcard analogue of `on()`'s at `:113`, and deleting it would break wildcard priority. The task as first written named three sites; checking each one before touching it found the third was load-bearing.
- [x] T007 [US0] Run the gate (`deno fmt && deno lint && deno check && deno task test`). SC-004: every existing test must pass unmodified.
- [x] T008 [US0] Commit alone: `fix(events): run the listeners that existed when the dispatch started`

**Checkpoint**: US0 is shippable on its own. Everything below can be reverted without touching it.

---

## Phase 3: Foundational (blocking prerequisites for US1–US4)

**⚠️ No user story below can start until this phase is done.**

- [x] T009 [P] Move `safeForLog` and its JSDoc from `packages/core/logging/sanitize.ts` to `packages/contract/logging/sanitize.ts`, and export it from `packages/contract/mod.ts` — its home per the decision table (Q2)
- [x] T010 [P] Move `packages/core/tests/log_sanitize.test.ts` to `packages/contract/tests/log_sanitize.test.ts`, unchanged
- [x] T011 Make `packages/core/logging/sanitize.ts` a re-export of the contract version so `packages/core/exceptions/formatter.ts:74` and `app/middleware/logger_middleware.ts` are untouched, and confirm `packages/core/mod.ts` still exports the name
- [x] T012 Declare `@lockness/contract` in `packages/events/deno.json` imports, pinned and fully qualified per hard rule #2
- [x] T013 Run `deno task deps:analyze` — the new `events → contract` edge must be inside `deps.policy.jsonc`'s allow list for `events`; add it there if not, since `contract` is the foundation tier
- [x] T014 In `packages/events/mod.ts`, give `ListenerEntry` a `dispose?: () => void` field. `plan.md` §6 no longer calls it a value object; it is identified by reference in the removal paths.
- [x] T015 In `packages/events/mod.ts`, extract a private `#register(bucket, entry, signal?)` and have BOTH `on()` and `onAny()` go through it. `onAny()` does not delegate to `on()` (`mod.ts:262-276`), which is why the home is here and not in `on()`.
- [x] T016 In `packages/events/mod.ts`, extract a private `#unregister(bucket, entry)` and route `off()`, `offAny()` and `removeAllListeners()` through it. `removeAllListeners()` is the path that never calls `off()`, which is what made the first draft's mitigation incomplete.
- [x] T017 Run the gate. No behaviour has changed yet; every existing test must still pass.
- [x] T018 Commit: `refactor(events): route every registration and removal through one pair of gates`

**Checkpoint**: the emitter has one registration gate and one removal gate. US1–US4 can proceed.

---

## Phase 4: User Story 2 — a listener is cancelled with a signal (Priority: P1)

Ordered before US1 because `stream.ts` (US1) registers its own listener and will use the signal
plumbing built here.

**Independent test**: register with a signal, abort, assert the listener is gone and no handler
remains.

### Tests for User Story 2

- [x] T019 [P] [US2] In `packages/events/tests/events.test.ts`, assert `on(ev, fn, { signal })` then `abort()` removes the listener (FR-001)
- [x] T020 [P] [US2] Assert a listener registered with an ALREADY-aborted signal is never registered — `listenerCount()` is 0, and the listener never runs (FR-002)
- [x] T021 [P] [US2] Assert aborting a signal whose listener was already removed by `off()` is a no-op and does not throw (FR-003)
- [x] T022 [US2] Assert on the SIGNAL, not on `listenerCount()`: after `off()` and after `removeAllListeners()`, aborting runs no handler. `listenerCount()` reads `listenerMap` only and cannot see a wildcard or an orphaned handler — that is what made the first draft's FR-004 pass vacuously (FR-004)
- [x] T023 [P] [US2] Assert `onAny(fn, { signal })` is removed on abort — the wildcard path, which has its own array and its own removal (FR-001)
- [x] T024 [P] [US2] Assert `once(ev, fn, { signal })`: whichever of the two fires first removes the listener, and the other is a no-op
- [x] T025 [P] [US2] Assert a signalled listener does NOT emit the `maxListeners` warning: register 15 with signals, capture `console.warn`, expect zero lines (FR-015)
- [x] T026 [P] [US2] In `packages/events/tests/class_based_events.test.ts`, assert `EventDispatcher.on/once/onAny` forward `signal` and wire nothing themselves (FR-005)

### Implementation for User Story 2

- [x] T027 [US2] Add `signal?: AbortSignal` to `ListenerConfig` in `packages/events/mod.ts`, and to `EventDispatcher`'s options type in `packages/events/dispatcher.ts` — the existing options object, never a positional parameter
- [x] T028 [US2] In `#register()` (`packages/events/mod.ts`), refuse an aborted signal before the entry is pushed, and otherwise attach the abort handler and store its detach function in `entry.dispose`
- [x] T029 [US2] In `#unregister()` (`packages/events/mod.ts`), call `entry.dispose?.()` so every removal path detaches the handler
- [x] T030 [US2] In `packages/events/mod.ts`, exempt entries carrying a signal from the `maxListeners` count that drives the warning at `mod.ts:117-124`
- [x] T031 [US2] Forward `signal` from `EventDispatcher.on/once/onAny` in `packages/events/dispatcher.ts` — pass-through only
- [x] T032 [US2] Run the gate
- [x] T033 [US2] Commit: `feat(events): cancel a listener with an AbortSignal`

**Checkpoint**: signals work on both the specific and the wildcard path, and leave nothing behind.

---

## Phase 5: User Story 1 — a stream that nobody drains stops growing (Priority: P1)

**Independent test**: emit past the bound into an unconsumed stream; assert the buffer stops and the
episode is reported with a count.

### Tests for User Story 1

- [x] T034 [P] [US1] In a new `packages/events/tests/stream.test.ts`, assert an unconsumed stream's buffer never exceeds its bound after 10 000 events (FR-008, SC-001)
- [x] T035 [P] [US1] Assert `drop-oldest` keeps the NEWEST frames — the default chosen at the stop (Q3)
- [x] T036 [P] [US1] Assert `drop-newest` keeps the oldest, and that the two policies are the only accepted values; anything else is refused, not defaulted (FR-008)
- [x] T037 [P] [US1] Assert the overflow report carries the event name, the drop count and the bound — and assert it does NOT contain the dropped frame. Emit a frame with a recognisable marker and assert the marker is absent from the report (FR-009, invariant 6)
- [x] T038 [P] [US1] Assert the report fires ONCE per episode with a running count, not once per dropped event (FR-009)
- [x] T039 [P] [US1] Assert `bufferSize` bounds: `0`, `-1`, `1.5`, `NaN` and `1e21` are all refused. `Number.isInteger(1e21)` is `true`, so a lower-edge check alone lets it through and restores the unbounded queue (FR-010)
- [x] T040 [P] [US1] Assert `eventStream()` detaches its listener on `return()`, on `break` out of a `for await`, and on `throw` (FR-007)
- [x] T041 [P] [US1] Assert two streams on the same event have independent buffers: one overflowing does not affect the other

### Implementation for User Story 1

- [x] T042 [US1] Create `packages/events/stream.ts` with `DEFAULT_BUFFER_SIZE`, `MAX_BUFFER_SIZE` and `OVERFLOW_POLICIES` — the single home for the bounds and the policy set. Document the retention arithmetic (`streams × bufferSize × sizeof(Context)`) required by FR-016 beside them.
- [x] T043 [US1] Implement `createEventQueue()` in `packages/events/stream.ts`: the bounded buffer, the waiter list, the drop policy and the episode reporter. This is the one home; neither caller keeps its own array.
- [x] T044 [US1] Type the reporter's parameter as a record — event name, count, bound — so a frame is unrepresentable rather than merely forbidden, the same treatment `debugLog` gets
- [x] T045 [US1] Rewrite `eventStream()` in `packages/events/mod.ts` to use `createEventQueue()`, accepting `StreamOptions` and keeping its current signature working with no options passed
- [x] T046 [US1] Export `StreamOptions` and the two policy names from `packages/events/mod.ts`
- [x] T047 [US1] Run the gate
- [x] T048 [US1] Commit: `feat(events): bound a stream's buffer and report what it drops`

**Checkpoint**: the latent leak is closed and the queue has one home.

---

## Phase 6: User Story 3 — everything that happens can be iterated (Priority: P2)

**Independent test**: iterate `anyEvent()`, emit three different events, assert all three arrive as
`{ event, data }` in order.

### Tests for User Story 3

- [x] T049 [P] [US3] In `packages/events/tests/stream.test.ts`, assert `anyEvent()` yields `{ event, data }` — the same shape `onAny()` delivers, not the `[name, data]` tuple #135 suggested from Emittery's API (FR-006)
- [x] T050 [P] [US3] Assert events arrive in dispatch order across several different event names
- [x] T051 [P] [US3] Assert `break` out of `for await (… of anyEvent())` detaches the wildcard listener — `listenerCount` is not the check here; assert via `eventNames()` / the wildcard array (FR-007)
- [x] T052 [P] [US3] Assert `anyEvent()` and `eventStream()` open at once both receive the same event
- [x] T053 [P] [US3] Assert `anyEvent()` honours `bufferSize` and `onOverflow` identically to `eventStream()` — one queue, one behaviour

### Implementation for User Story 3

- [x] T054 [US3] Add `anyEvent(options?: StreamOptions)` as a METHOD on `EventEmitter` in `packages/events/mod.ts`, mirroring `onAny()`. Built on `createEventQueue()` — no second buffer.
- [x] T055 [US3] Forward `anyEvent()` from `EventDispatcher` in `packages/events/dispatcher.ts`
- [x] T056 [US3] Run the gate
- [x] T057 [US3] Commit: `feat(events): iterate every event with anyEvent()`

---

## Phase 7: User Story 4 — a listener that does not fire can be diagnosed (Priority: P2)

**Independent test**: enable debug, emit, assert the lines name the event and the listener count and
contain no payload.

### Tests for User Story 4

- [x] T058 [P] [US4] In a new `packages/events/tests/debug.test.ts`, assert debug is OFF by default: emit with a captured `console`, expect no debug lines (FR-011)
- [x] T059 [P] [US4] Assert `setEventsDebug(true)` produces lines for registration, emit and dispatch, naming the event and the listener count
- [x] T060 [P] [US4] Assert a payload never reaches a line: emit an event whose data carries a recognisable marker, assert the marker is absent from every captured line (FR-012, invariant 5)
- [x] T061 [P] [US4] Assert an event name containing `\n`, `\r` or `` is encoded before it is written, via `safeForLog` from `@lockness/contract` (FR-017)
- [x] T062 [P] [US4] Assert `packages/events` makes no `Deno.*` call: a test that greps the package's own sources for `Deno.` outside a docstring, so the constraint cannot regress silently (FR-011)
- [x] T063 [P] [US4] In `packages/core/tests/`, assert the bootstrap step parses `LOCKNESS_EVENTS_DEBUG` with the `SCHEDULER_ENABLED` allowlist: `1/true/on/yes` enable, `0/false/off/no` disable, `"true "` with a trailing space still enables after trimming, and an unrecognised value throws at BOOT (FR-011)

### Implementation for User Story 4

- [x] T064 [US4] Create `packages/events/debug.ts` with a module-level flag, `setEventsDebug(enabled)`, `isDebugEnabled()`, and `debugLog(record)` typed as `{ event: string; listenerCount: number; index?: number }` — no string parameter, no rest parameter, so a payload is unrepresentable (FR-012)
- [x] T065 [US4] In `debugLog`, encode the event name with `safeForLog` from `@lockness/contract` (FR-017)
- [x] T066 [US4] Call `debugLog` from the registration, emit and dispatch points in `packages/events/mod.ts`. No `console` call at those sites — `debugLog` is the sole authority over a line's contents.
- [x] T067 [US4] Export `setEventsDebug` and `isDebugEnabled` from `packages/events/mod.ts`
- [x] T068 [US4] Add a bootstrap step in `packages/core/kernel/bootstrap/steps/` that reads `LOCKNESS_EVENTS_DEBUG` with the `SCHEDULER_ENABLED` allowlist (`steps/scheduler.ts:83-98`) and calls `setEventsDebug()`. The read lives here, not in the library — `@lockness/scheduler` reads no env either.
- [x] T069 [US4] Register the step in `packages/core/kernel/bootstrap/registry.ts` with an order before any event can be emitted
- [x] T070 [US4] Run the gate
- [x] T071 [US4] Commit: `feat(events): a debug switch that cannot log a payload`

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T072 🔴 Add every new symbol to the named export list in `packages/core/mod.ts:48-70` — `EventEmitter`, `eventStream`, `anyEvent`'s types, `StreamOptions`, `setEventsDebug`, `isDebugEnabled`. Without this the whole feature is unreachable from the only package an application imports (SC-005).
- [x] T073 [P] Add a test in `packages/core/tests/` asserting the new names are importable from `@lockness/core`, so SC-005 cannot regress
- [x] T074 [P] Add a test in `packages/events/tests/` pinning that `removeAllListeners()` detaches `EventBuffer`'s recorder — its recorder is an ordinary wildcard (`testing.ts:55`), so any test calling `removeAllListeners()` makes later `assertEmitted` fail while pointing at innocent production code
- [x] T075 [P] Update `packages/events/docs/DOCS.md`: the four capabilities, the bounds, the two overflow policies, the debug variable, and the retention arithmetic from FR-016
- [x] T076 [P] Update `packages/events/README.md` if it documents the emitter's surface
- [x] T077 Run `deno task agents:brief` to regenerate `packages/events/AGENTS.md`, `packages/core/AGENTS.md` and `packages/contract/AGENTS.md`
- [x] T078 Run the full gate plus `deno task publish:check` — the `events → contract` edge is new and must resolve outside the workspace
- [x] T079 Commit the docs separately: `docs(events): document signals, bounded streams, anyEvent and the debug switch`

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 (Setup)
   └─> Phase 2 (US0) ──────────────► SHIPPABLE ALONE, commit and stop here if desired
          └─> Phase 3 (Foundational)
                 └─> Phase 4 (US2 — signals)
                        └─> Phase 5 (US1 — bounded streams)
                               ├─> Phase 6 (US3 — anyEvent)
                               └─> Phase 7 (US4 — debug)
                                      └─> Phase 8 (Polish)
```

### User story dependencies

- **US0** depends on nothing. It is the MVP and it ships first, alone.
- **US2** (signals) needs Foundational's `#register` / `#unregister` / `dispose`.
- **US1** (streams) needs US2 only because `createEventQueue()` registers a listener and uses the
  signal plumbing to detach it. Without that it would be independent.
- **US3** (`anyEvent`) needs US1's queue. It is a second caller of one home, not a second queue.
- **US4** (debug) is independent of US1 and US3 but follows Foundational for `safeForLog`.

### Parallel opportunities

- T009 and T010 (the `safeForLog` move and its tests) run together.
- Every test task marked `[P]` within one story runs together — they are separate assertions in the
  same or different files, with no shared state.
- **Phase 6 and Phase 7 are fully parallel** once Phase 5 lands: `anyEvent()` touches `mod.ts` and
  `dispatcher.ts`; debug touches `debug.ts` and core's bootstrap. The only overlap is `mod.ts`'s
  export block, resolved by doing T067 and T054 in either order but not simultaneously.

## Implementation Strategy

### MVP: US0 alone

T001–T008. A production defect corrected, in one `fix(events)` commit, gated and shippable
independently of everything else. This was the answer to Q1 at the plan stop.

### Incremental delivery

Each phase after that ends in its own commit and its own gate pass, one Conventional Commits
category each — `refactor`, then three `feat`, then `docs`. Six commits for the feature, plus the
MVP's `fix`. Atomicity over brevity, per the constitution.

### Where to stop early if needed

After Phase 5. US0, US2 and US1 together close both defects — the live one and the latent one — and
deliver the capability with the most demand. US3 and US4 are the two P2 conveniences, and #135
stays open for them without anything half-built on `main`.

## Notes

- **`waitForEvent()` is deliberately out of scope.** Zero callers, not re-exported. Recorded in
  `plan.md` §10 finding 10 so the omission is visible rather than accidental.
- **Every task that touches a decision names its home.** A review finding that a decision has two
  homes is a plan violation, not a style opinion.
- **FR-014 is load-bearing for 18 unawaited `emit()` calls** in the auth guards. No task here may
  make `emit()` reject.
