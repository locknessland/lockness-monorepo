# Plan: Close four gaps in the events emitter

**Branch**: `003-events-emitter-gaps` | **Date**: 2026-09-01 | **Backlog item**:
[#135 — Close four gaps in the events emitter: AbortSignal, anyEvent(), bounded streams, debug](https://github.com/locknessland/lockness-monorepo/issues/135)

**This is the feature's one planning document.** Business and technical together, read whole by
whoever implements it.

> **Revised 2026-09-01 after both plan audits.** The first draft led with a memory leak that no
> user can currently reach, and homed the abort wiring somewhere `onAny()` cannot get to. Both are
> corrected below; §10 and §11 record every finding and its disposition.

---

## 1. Why this exists

`@lockness/events` has **one live defect, one latent one, and three missing capabilities**. They are
what survived the review of [#91](https://github.com/locknessland/lockness-monorepo/issues/91),
which proposed replacing the emitter with Emittery and was closed as not planned.

### The live defect: a dispatch silently skips a listener

`emit()` iterates the **live** array held in the Map (`mod.ts:183`) while `off()` splices that same
array (`mod.ts:150`). A listener that removes itself mid-dispatch shifts the cursor past its
neighbour. Reproduced 2026-09-01:

```
expected  ['A', 'B', 'C']
actual    ['A',      'C']     ← B never ran. No throw, no log.
```

The wildcard path copies first (`[...this.wildcardListeners]`, `mod.ts:207`) and does **not** have
the bug. The asymmetry is accidental.

This is reachable today by any listener calling `off()` on itself. It is also a **hard blocker for
this feature**: an abort handler removing a listener is exactly that shape, so shipping
`AbortSignal` on top of the live array would turn a rare bug into a common one.

### The latent defect: an unbounded stream buffer

`eventStream()` (`mod.ts:460`) pushes into an array nothing bounds. **It has zero callers** — not in
the framework, not in any application, and `@lockness/core` does not re-export it
(`packages/core/mod.ts:48-70` is a named list of 20 symbols that excludes it). So nobody is leaking
today; the defect is latent, and it becomes reachable the moment the API is exported.

That reframing matters: **this feature is about making the streaming surface reachable and correct
in the same change**, not about plugging an active leak. The first draft claimed otherwise.

### The three gaps

| Gap | What it costs today |
| :--- | :--- |
| No `AbortSignal` | Cancelling means holding the exact function reference and calling `off()`. |
| No `anyEvent()` iterator | `onAny()` is callback-only; `eventStream()` is per-event and unreachable. |
| No debug hook | When a listener silently does not fire there is nothing to switch on. |

## 2. User scenarios

### US0 — A listener that unsubscribes itself does not break the dispatch (P1)

**Given** three listeners on one event
**When** the first removes itself during the dispatch
**Then** all three still run, because the dispatch iterates a snapshot taken before it started

### US1 — A stream that nobody drains stops growing (P1)

**Given** a controller opens `eventStream(emitter, 'RequestCompleted')` for an SSE response
**When** the client disconnects and the loop body stops pulling
**Then** the buffer stops at its bound, the oldest frames are dropped, and the episode is reported
once with a running count — never by echoing a dropped frame

### US2 — A listener is cancelled with a signal (P1)

**Given** a request-scoped listener registered with `on(Event, fn, { signal: c.req.raw.signal })`
**When** the request is aborted
**Then** the listener is removed, its abort handler is detached, and nothing retains the context

**And given** a signal that is *already* aborted
**When** it is passed to `on()`
**Then** the listener is never registered at all

### US3 — Everything that happens can be iterated (P2)

**Given** a diagnostics surface that wants every event
**When** it iterates `anyEvent()`
**Then** it receives each event as `{ event, data }` in dispatch order, and `break` detaches it

### US4 — A listener that does not fire can be diagnosed (P2)

**Given** a listener that appears not to run
**When** debug is enabled at boot
**Then** registration, emit and dispatch are logged, naming the event and the listener count — and
never the payload's contents

### Edge cases

- A signal aborting **during** an emit: the listener runs if it was in the snapshot, and is gone
  before the next dispatch. FR-000 is what makes this statable.
- `once` plus `signal`: whichever fires first removes the listener; the other is a no-op.
- `removeAllListeners()` with signalled listeners: every abort handler is detached too — it is the
  one removal path that never calls `off()`.
- Two streams on the same event: separate buffers; one overflowing does not affect the other.
- A `bufferSize` outside `1..MAX_BUFFER_SIZE`: rejected at the call.
- Debug enabled in a process without `--allow-env`: reads as off, never throws.

## 3. Requirements

### The blocker

- **FR-000** `emit()` iterates a **snapshot** of the listener array, not the live one. A listener
  added or removed during a dispatch does not change that dispatch. Applies to both the
  specific-event and wildcard paths, which must use one shared shape.

### AbortSignal

- **FR-001** `on()`, `once()` and `onAny()` accept an optional `signal: AbortSignal`. Aborting
  removes the listener.
- **FR-002** A listener registered with an already-aborted signal is never registered.
- **FR-003** Aborting a signal whose listener is already removed is a no-op, never a throw. The
  decision lives with the removal path, not with each caller.
- **FR-004** `off()` **and** `removeAllListeners()` detach the abort handler as well as the
  listener. Verified by asserting on the signal — that no handler runs after removal — **not** by
  `listenerCount()`, which reads `listenerMap` only and cannot see a wildcard or an orphaned
  handler.
- **FR-005** `EventDispatcher.on/once/onAny` pass `signal` through unchanged and wire nothing
  themselves.
- **FR-015** A listener registered with a signal is exempt from the `maxListeners` warning
  (`mod.ts:117-124`), which fires once per registration and would otherwise emit one line per
  request under the pattern US2 recommends.

### Streams

- **FR-006** `anyEvent()` returns an `AsyncIterable<{ event: string; data: unknown }>` — the same
  shape `onAny()` delivers. It is a **method on `EventEmitter`**, mirroring `onAny()`, and is
  forwarded by `EventDispatcher`. `eventStream()` stays a free function for compatibility.
- **FR-007** Both detach their listener when the iterator ends by `return()`, `break` or `throw`.
- **FR-008** Both take `{ bufferSize, onOverflow }`. `onOverflow` is a **closed union** —
  `'drop-oldest' | 'drop-newest'`, defaulting to `'drop-oldest'` (Q3) — and an unrecognised value is
  refused, not defaulted.
  `bufferSize` is a developer-supplied constant and **must never be derived from request input**.
- **FR-009** Overflow is reported **twice per episode and no more** — once when it starts, once
  when it ends with the running total — and the report carries the **event name, the count and the
  bound — never the dropped frame or any part of it.**

  _Amended 2026-09-01, during implementation._ The requirement first said "once per episode". Once
  at the **start** leaves a permanently stalled consumer's total unknown; once at the **end** never
  fires at all while it stays stalled, which is exactly when someone needs to know. Two is the
  smallest number that is useful in both cases, and it is still bounded — never one line per dropped
  frame, which is the flood the report exists to replace.
- **FR-010** `bufferSize` must be an integer in `1..MAX_BUFFER_SIZE`. `Number.isInteger(1e21)` is
  `true`, so a lower-edge check alone restores the unbounded queue behind an API documented as
  bounded.
- **FR-016** A buffered frame is a **retained reference to everything the event carries**. The
  default bound is chosen with the Hono `Context` in mind, and the arithmetic
  (`streams × bufferSize × sizeof(Context)`) is written down for the caller who owns the ceiling.

### Debug

- **FR-011** Debug is enabled by `@lockness/core`'s bootstrap, which reads the environment with the
  `SCHEDULER_ENABLED` allowlist (trim, lowercase, ON/OFF sets, refuse the unrecognised) and calls
  `setEventsDebug(true)`. `@lockness/events` itself makes **no `Deno.*` call** — it has none today
  and must keep none.
- **FR-012** `debugLog` accepts a **typed record**, never a string and never a rest parameter:
  `{ event: string; listenerCount: number; index?: number }`. A payload must be
  *unrepresentable*, not merely forbidden.
- **FR-017** A debug line encodes the event name with `safeForLog` before writing it. That function
  **moves to `@lockness/contract`** (Q2): today it lives in `packages/core/logging/sanitize.ts` and
  is unreachable from here, because core imports events and the reverse edge would be a cycle.
  `@lockness/core` re-exports the name, so its two existing callers do not change.

### Non-regression

- **FR-013** `@Listener({ priority })` ordering is unchanged, including for a listener registered
  after the first emit.
- **FR-014** `emit()` continues to isolate a throwing listener and resolve, rather than rejecting.
  **Load-bearing:** the auth guards make **18 unawaited `emit()` calls** (`session_guard.ts` 9,
  `token_guard.ts` 6, `basic_auth_guard.ts` 3; zero awaited). Every one is a floating promise that
  is safe only because `emit()` never rejects.

## 4. Success criteria

- **SC-000** A listener that unsubscribes itself mid-dispatch does not prevent any other listener in
  that dispatch from running.
- **SC-001** An unconsumed stream's memory is flat after 100 000 events, not linear.
- **SC-002** Cancelling a listener requires no reference to the function that was registered.
- **SC-003** A developer whose listener does not fire can see why from one environment variable,
  without editing framework code.
- **SC-004** No existing application changes behaviour: every current test passes unmodified.
- **SC-005** The new API is reachable from `@lockness/core` — the only package an application
  imports.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **That a dispatch is immune to concurrent modification** | `mod.ts` → `EventEmitter.emit()`, one snapshot helper used by both the specific and wildcard paths | The wildcard path keeping its own `[...spread]` while the specific path grows a different guard — today's asymmetry, preserved |
| **When a listener is registered at all** *(incl. an aborted signal)* | `mod.ts` → a private `#register(bucket, entry, signal)` that **both** `on()` and `onAny()` call | An `if (signal?.aborted) return` in `onAny()` as well — `onAny()` does **not** delegate to `on()` (`mod.ts:262-276`), so "the home is `on()`" is unreachable and this row replaces it |
| **When a listener is removed, and what else goes with it** | `mod.ts` → a private `#unregister(entry)` called by `off()`, `offAny()`, `removeAllListeners()` and the abort handler | `off()` detaching the handler while `removeAllListeners()` does not — it is the path that never calls `off()` |
| **What a listener entry must carry to be removable** | `mod.ts` → `ListenerEntry`, which gains `dispose?: () => void` | Storing the signal in a side Map keyed by the listener function, which two registrations of one bound method would collide in |
| **How a stream buffers, and what it drops** | `packages/events/stream.ts` → `createEventQueue()` | `eventStream()` and `anyEvent()` each keeping their own array and bound |
| **The bounds and the policy set** | `stream.ts` → `DEFAULT_BUFFER_SIZE`, `MAX_BUFFER_SIZE`, `OVERFLOW_POLICIES` | A literal repeated in a JSDoc `@default`, a README, or a second caller |
| **What an overflow report may contain** | `stream.ts` → its reporter, typed like `debugLog` | A `console.warn` at the drop site formatting its own line and reaching the frame |
| **Whether debug is on** | `packages/events/debug.ts` → a module flag set by `setEventsDebug()` | Any `Deno.env.get` inside `@lockness/events` — the read belongs in core's bootstrap, matching `steps/scheduler.ts:83`, where `@lockness/scheduler` itself reads no env either |
| **What a debug line may contain** | `debug.ts` → `debugLog(record)`, typed | A `debugLog(string)` overload, which makes the violation one interpolation away forever |
| **How an untrusted string is made safe for a log** | `@lockness/contract` → `safeForLog()`, moved there from `packages/core/logging/sanitize.ts` | A second encoder in `debug.ts`. `core` re-exports the name so its two callers are untouched; `events` can now reach the original instead of copying it. |
| **Listener order for one event** *(existing)* | `mod.ts` → `EventEmitter.on()`'s sort | The re-sorts at `mod.ts:186`, `:208`, `:273`. **These already exist and FR-000's snapshot removes the need for them** — deleting them is part of this work, not a note |
| **What happens when a listener throws** *(existing, unchanged)* | `mod.ts` → `emit()`'s per-listener `try` | A `try` in `lifecycle_middleware.ts` compensating for a rejecting emit. **FR-014 guards this for 18 auth call sites.** |

## 6. Technical context

- **Language / runtime**: TypeScript on Deno 2.x. **No new dependency** — this feature exists
  because the alternative was one.
- **Package**: `@lockness/events`. Manifest: `@std/assert`, `@lockness/hono`. It makes **zero
  `Deno.*` runtime calls** today (one hit, in a docstring) and FR-011 keeps it that way.
- **Testing**: `Deno.test`, `FakeTime` where timing matters.
- **Constraint**: `@lockness/core` imports `events`, so this is on the boot path and on every
  request through `lifecycle_middleware.ts:83`.

### Domain model

- **Bounded context**: the in-process event bus. It owns *what is subscribed*, *what order they run
  in*, and *what a stream buffers*. Not what an event means.
- **Vocabulary**: *event*, *listener*, *wildcard listener*, *stream*, *dispatch*, *frame* (one
  `{ event, data }` in a buffer), *episode* (a contiguous run of drops).
- **Entities**: `EventEmitter` (identity is the instance), `EventBuffer` (the capture session).
- **Value objects**: the `{ event, data }` frame, `StreamOptions`.
- **`ListenerEntry` is NOT a value object.** It gains `dispose?: () => void` and is identified by
  reference in the removal paths. The first draft called it a value object while §9 required
  removing something it had no field for.
- **Invariants**:
  1. A listener registered with an aborted signal does not exist, and a removed listener leaves no
     abort handler behind — by **any** removal path.
  2. A stream's buffer never exceeds its bound.
  3. A dispatch runs the listeners that existed when it started, in priority order.
  4. One listener throwing never prevents another from running, and never rejects `emit()`.
  5. A debug line never contains a payload's contents.
  6. **An overflow report never contains a dropped frame.** It is on by default; invariant 5's
     protection does not extend to it.
  7. **A buffered frame retains everything its event carries**, including a request `Context`.
- **Out of scope**: distributed dispatch, persistence, replay.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| 1. No direct `hono` import | 🟢 Not touched here. 🔵 The architect noted `lifecycle_middleware.ts:16` violates it today — pre-existing, out of scope, worth its own ticket. |
| 2. JSR-only specifiers | 🟢 **No dependency added.** |
| 3. No `any` in exported APIs | 🟠 Pre-existing in `EventMap` / `configureEvents`. Not introduced, not fixed — see Complexity tracking. |
| 4. Tailwind v4 | 🟢 Not applicable. |
| 5. Pre-completion gate | 🟢 Applies. |
| 6. Never edit `deno.lock` | 🟢 No dependency change. |
| 7. JSDoc on public APIs | 🟢 Applies to `anyEvent`, `stream.ts`, `debug.ts`. |
| 8. MVC layering | 🟢 Not applicable — library package. |
| 9. Commit discipline | 🟢 Five commits, one category each; FR-000 ships first and alone. |
| TDD | 🟢 FR-000's failing test exists already (reproduced above). |
| No silent catches | 🟢 FR-009 exists because of this rule — and FR-009's *content* is constrained by invariant 6, because "report it" and "report it safely" are different requirements. |

### Complexity tracking

| Violation | Why it stands |
| :--- | :--- |
| Rule 3 — `any` in `EventMap`, `configureEvents`, `EventEmitter<any>` | Removing it changes the generic signature of every public method. Its own ticket, not a passenger on a correctness fix. |

## 8. Surface impact

| Surface | Change |
| :--- | :--- |
| `@lockness/events` public API | **Additive**: `signal` on `ListenerConfig`; `EventEmitter.anyEvent()`; `StreamOptions`; `debug.ts` exports. Nothing removed. |
| **`packages/core/mod.ts:48-70`** | 🔴 **Must be edited.** It is a named list of 20 symbols; `EventEmitter`, `eventStream`, `waitForEvent` and everything new are **absent**. Without this the feature ships unreachable — SC-005. |
| `packages/core/kernel/bootstrap/steps/` | **New**: a step reading `LOCKNESS_EVENTS_DEBUG` with the `SCHEDULER_ENABLED` allowlist and calling `setEventsDebug()`. |
| `packages/contract` | **New**: `safeForLog()`, moved from `packages/core/logging/sanitize.ts` with its tests (Q2). |
| `packages/core/logging/sanitize.ts` | Becomes a re-export of the contract version, so `exceptions/formatter.ts:74` and `app/middleware/logger_middleware.ts` are untouched. |
| `EventDispatcher` | `signal` on `on/once/onAny`; `anyEvent()` forwarded. |
| Listener discovery | 🟢 Unchanged — an added optional field does not affect it. |
| `lifecycle_middleware.ts` | 🟢 Unchanged, and FR-014 exists so it stays that way. |
| `EventBuffer` (`testing.ts:45-69`) | 🔵 It **constructs a real `EventDispatcher`** and forwards nothing, so it inherits the new API free. The first draft's "the double diverges" risk was structurally impossible. The real risk is different — see Risks. |

### Documentation (this feature)

- `packages/events/docs/DOCS.md` — the capabilities, the bounds, the debug switch, the retention
  arithmetic from FR-016.
- `packages/events/AGENTS.md` — regenerated.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| FR-000 changes dispatch semantics under 83 existing `emit()` call sites | It only makes the dispatch match what every test already asserts. SC-004 is the check; the wildcard path has behaved this way since day one. |
| A bounded buffer loses events that today are kept | FR-009 reports the episode. Nothing consumes `eventStream()` today, so no behaviour regresses for anyone. |
| The abort handler outlives the listener | FR-004 covers `off()` **and** `removeAllListeners()`, and verifies on the signal rather than on `listenerCount()`, which cannot see it. |
| **`removeAllListeners()` kills `EventBuffer`'s recorder** | Its recorder is an ordinary wildcard (`testing.ts:55`); `removeAllListeners()` clears wildcards (`mod.ts:169-170`). Any test calling it makes later `assertEmitted` fail pointing at innocent production code. A test pins this. |
| Debug logging reaches a payload | FR-012 makes it unrepresentable rather than forbidden. |
| An operator tightens permissions and the framework stops booting | FR-011 keeps every `Deno.*` call out of the package; the read is in core, where it already belongs. |

## 10. Architecture audit

**Seat**: `architect-expert`, plan-time, read-only. **Verdict: `fail`** — 1 CRITICAL, 6 HIGH,
3 MEDIUM, 1 LOW. Coverage: `plan.md` plus 11 source files; call-site counts obtained by grep, not
estimated.

🔵 The seat exhausted its 20-turn budget on the first attempt and produced a half-sentence. It was
re-dispatched with a fixed output shape and a three-call budget, and delivered in full. Recorded
because it is the second Specnaut-shipped agent to fail this way.

| # | Finding | Disposition |
| :-- | :--- | :--- |
| 1 | **CRITICAL** — `emit()` iterates the live array `off()` splices; an abort mid-dispatch skips the next listener | **Accepted, and reproduced before acting.** Promoted to FR-000, US0, SC-000, and the first decision row. It ships first and alone. |
| 2 | **HIGH** — the abort home in `on()` is unreachable from `onAny()`, which never delegates | **Accepted.** Row rewritten: the home is a private `#register()` both call. |
| 3 | **HIGH** — `ListenerEntry` has no field for what `off()` must detach; §6 and §9 contradicted | **Accepted.** It gains `dispose`, and §6 no longer calls it a value object. |
| 4 | **HIGH** — FR-004 verified by `listenerCount()`, which cannot see wildcards; the test passes vacuously | **Accepted.** FR-004 now asserts on the signal. |
| 5 | **HIGH** — `debug.ts` puts a `Deno.env` read in a boot-path library, against its own cited precedent | **Accepted, fully.** Verified: the package makes zero `Deno.*` calls today, and `@lockness/scheduler` reads no env either — core's bootstrap does. FR-011 moves the read to core. |
| 6 | **HIGH** — a module-level switch cannot hold FR-011's "per-instance flag" | **Accepted.** The per-instance flag is dropped; one process-wide switch, set from core. |
| 7 | **HIGH** — §8 claimed a `@lockness/core` re-export that does not exist | **Accepted, and verified.** `packages/core/mod.ts:48-70` is a named list excluding every relevant symbol. Now a 🔴 row in §8 and SC-005. |
| 8 | **MEDIUM** — FR-013's row calls a second emit-time sort "the duplicate to avoid" while three already exist | **Accepted.** Deleting them is now part of the work, enabled by FR-000's snapshot. |
| 9 | **MEDIUM** — `EventBuffer` does not proxy; the planned test guards nothing, and the real risk is `removeAllListeners()` killing its recorder | **Accepted.** §8 corrected, and the real risk is now a Risks row with a test. |
| 10 | **MEDIUM** — `waitForEvent()` is in scope by symmetry and absent | 🟠 **Deferred, deliberately.** It has zero callers and is not re-exported. Adding it is a fourth surface for no reader. Recorded here so the omission is visible. |
| 11 | **LOW/PLAUSIBLE** — overflow reporting has no home | **Accepted** — merged with the security seat's FINDING 1, which is the stronger form. |

**Blast radius, counted**: production call sites — `emit(` 27, `on(` 5, `off(` 5, `once(` 3,
`onAny(` 2, `eventStream` **0**, `waitForEvent` **0**. Packages depending on `@lockness/events`: 2
(`auth`, `core`). **18 unawaited `emit()` in the auth guards** — the number that makes FR-014
load-bearing rather than decorative.

## 11. Security audit

**Seat**: `security-expert`, plan-time, read-only, Mode 3. **Verdict: `fail`** — 0 CRITICAL, 1 HIGH,
5 MEDIUM, 3 LOW. It named what it did **not** load (`05-configuration-and-hardening.md`,
`07-data-protection.md`) and flagged the two findings whose citation is weaker as a result.

**Q2 answered explicitly**: `@lockness/events` has no authorization surface and this plan adds none
— checked against `mod.ts` in full, `dispatcher.ts:45-177`, `kernel_events.ts`,
`lifecycle_middleware.ts:42-121` and the manifest. `anyEvent()` creates **no new capability**:
`onAny()` already delivers every event, ungated, to any in-process caller. What changes is
**retention**, not access.

| # | Finding | Disposition |
| :-- | :--- | :--- |
| 1 | **HIGH** — FR-009's overflow report is **on by default** and content-unconstrained; FR-012 guards only the debug path, which is **off** by default. The dropped frame is a lifecycle event holding the Hono `Context` | **Accepted — the finding of the audit.** FR-009 now constrains content to name + count + bound, and invariant 6 states it separately from invariant 5 because the two have different default states. |
| 2 | **MEDIUM** — FR-012 is a behaviour rule where it must be a signature constraint; narrowing it after `debug.ts` ships is a breaking change to a published package | **Accepted.** FR-012 now specifies the typed record and forbids a string parameter. |
| 3 | **MEDIUM** — FR-010 bounds only the lower edge; `Number.isInteger(1e21)` is `true` | **Accepted, and verified in a REPL.** `MAX_BUFFER_SIZE` added; FR-008 states `bufferSize` is never request-derived. |
| 4 | **MEDIUM** — FR-011 does not carry the allowlist §12 claimed for it, and inheriting the scheduler's `throw` verbatim would put a `TypeError` on the request path | **Accepted, and it reinforces finding 5 of the architecture seat.** The allowlist moves into core's bootstrap with the read, where a throw is a boot failure rather than a per-request 500. |
| 5 | **MEDIUM** — US2's own pattern makes `maxListeners` a client-driven log flood: one `console.warn` per request past the tenth | **Accepted.** FR-015 exempts signalled listeners. |
| 6 | **MEDIUM** — the bound is per stream, not across streams; US1 opens one per request, so `N × bufferSize` request Contexts are client-controlled, and SC-001 measures only the axis that was fixed | **Accepted.** FR-016 and invariant 7. 🔵 Corroborated in-repo: `packages/sse/channel.ts:26` defaults `maxClients: Infinity`, so no ceiling exists by convention either. |
| 7 | **LOW** — `onOverflow` has no enumerated values, and a `'throw'` policy would be swallowed by `emit()`'s own `try` | **Accepted.** FR-008 makes it a closed union of two; `'throw'` is deliberately **not** offered, precisely because FR-014 would eat it. |
| 8 | **LOW** — `debug.ts` would introduce an `--allow-env` requirement into a package that makes no `Deno` calls | **Accepted** — subsumed by FR-011 moving the read out entirely, which is stronger than the try/catch the seat proposed. |
| 9 | **LOW** — FR-004's verification cannot observe the leak it exists to prevent; `removeAllListeners()` never calls `off()` | **Accepted**, and merged with architecture finding 4. |
| 10 | **Note, not a finding** — `safeForLog` (`packages/core/logging/sanitize.ts`) is **structurally unreachable** from `@lockness/events`: core imports events, so the reverse edge is a cycle. FR-011 adds logging to the one package that cannot use the project's log encoder | **Open — question 2 below.** Verified: events' manifest has no path to it. The seat correctly declined to call it log injection, having found no attacker-controlled event name. |

## 12. Open questions

_All three answered at the stop, 2026-09-01. Settled decisions._

### Q1 — Does FR-000 ship on its own first? → **Yes, alone and first**

Its own `fix(events)` commit on this branch: the snapshot plus the regression test already written.
It corrects a defect reachable today, depends on nothing, and a revert of the feature work must not
be able to take it back out. The rest of #135 follows behind on the same branch. Cost accepted: two
gate passes instead of one.

### Q2 — How is an event name encoded before it is logged? → **Move `safeForLog` to `@lockness/contract`**

`packages/core/logging/sanitize.ts` is 61 lines with **zero imports** — a pure function already
shaped like foundation code — and has **two production callers**
(`packages/core/exceptions/formatter.ts:74`, `app/middleware/logger_middleware.ts`). `contract` is
imported by everything, so `events` reaches it; `core` re-exports the same name, so no caller
changes and nothing breaks.

The alternative — a small encoder inside `debug.ts` — was rejected as a second spelling of one rule,
which is what the decision table's third column exists to catch. The two would diverge on the first
escape sequence somebody remembers to handle in only one of them.

**This is cheaper than the security seat priced it** ("a package move plus every caller"): it is a
move plus a re-export line.

### Q3 — Default overflow policy? → **`drop-oldest`**

A slow consumer gets the recent state, which is what a dashboard or a devtools panel wants. The cost
is a hole in the middle of the history, invisible in the order received — which is exactly why
FR-009 carries a running drop count rather than a bare warning.

`drop-newest` was rejected: a stream that saturates once would never become useful again, serving a
frozen past while the present is discarded.

### Decided without asking

| Decision | Why it needed no question |
| :--- | :--- |
| **`anyEvent()` yields `{ event, data }`, not `[name, data]`** | #135 suggested the tuple, from Emittery's API, which we are not adopting. `onAny()` already delivers `{ event, data }`; a tuple is a second shape for one concept. |
| **`anyEvent()` is a method on `EventEmitter`** | `onAny()` is. A free function beside a method for the same concept is two receivers for one idea. |
| **`waitForEvent()` stays out** | Zero callers, not re-exported. Adding a fourth surface for no reader is scope, not symmetry. |
| **`'throw'` is not an overflow policy** | `emit()`'s per-listener `try` would swallow it and FR-014 keeps that `try`. Offering a policy that cannot work is worse than not offering it. |
| **The per-instance debug flag is dropped** | Both seats found it incompatible with a single home. One process-wide switch, set from core's bootstrap. |
| **A new file, `stream.ts`** | `mod.ts` is 512 lines. The queue is the piece two callers share; giving it a file is what makes "one home" checkable. |
| **No `EventEngine` abstraction** | #135 excludes it; one engine, no second candidate. |
