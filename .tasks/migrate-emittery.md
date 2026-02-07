# Technical Task: Migrate Events Engine to Emittery

## 📋 Task Overview

Migrate the `@lockness/events` runtime to use `npm:emittery` as the underlying
engine, replacing the in-house EventEmitter. The goal is a mature, robust, and
feature-complete events API suitable for a production-grade framework, while
maintaining compatibility with existing Lockness event usage.

## 🎯 Objectives

1. **Adopt Emittery Core**: Use `emittery` for event dispatching, async streams,
   and cancellation support.
2. **Harden Public API**: Align `EventDispatcher` and helper APIs to a stable
   contract with clear behavior under load, errors, and concurrency.
3. **Preserve DX**: Keep class-based events, decorator listeners, and testing
   utilities intact or improved.
4. **Allow Breaking Changes**: Prefer a clean, robust API over compatibility
   shims while the framework is still in development.
5. **Document Rationale**: Record concrete advantages and missing features in
   current implementation, plus migration guidance.

## ✅ Why Emittery (Concrete Advantages)

### Features we gain (not fully available today)

- **Async Iterators / Streams**: Native `emittery.events()` returns async
  iterables for event streams, enabling reactive pipelines and devtools.
- **AbortSignal support**: Listener and stream cancellation for clean shutdown
  and scoped listeners.
- **Meta-events**: `Emittery.listenerAdded` and `Emittery.listenerRemoved` allow
  tooling and diagnostics without patching internals.
- **Error isolation**: Well-tested error handling guarantees per-listener
  isolation with predictable behavior.
- **Performance under concurrency**: Mature, optimized event queueing and
  delivery, proven in high-traffic apps.
- **Stable semantics**: Consistent ordering and listener lifecycle guarantees
  across versions.
- **Any-event streams**: `anyEvent()` provides a unified async stream of all
  events, useful for devtools and tracing.
- **emitSerial()**: Optional sequential dispatch when ordering must be strict.
- **once() predicate**: Resolve once when a predicate matches event data.
- **Debug logging**: Built-in debug mode with named emitters.

### Gaps in the current in-house emitter

- No official async iterator surface.
- No built-in cancellation / AbortSignal integration.
- Meta-events are not exposed for tooling.
- Behavior under heavy async listener load is not formally specified.
- Custom maintenance burden for edge cases and regressions.
- No any-event async stream.
- No built-in debug logging controls.

## 📁 Affected File Paths

### Core Files to Modify

- /packages/events/dispatcher.ts - Re-implement on top of Emittery; update
  public API surface and compatibility layer.
- /packages/events/mod.ts - Re-export updated API and helper utilities.
- /packages/events/testing.ts - Update fakes to use Emittery and validate
  stream/listener behavior.
- /packages/events/deno.json - Add `npm:emittery` dependency.

### Framework Files to Extend

- /packages/core/events/listener_discovery.ts - Validate listener registration
  supports new APIs (priority mapping, AbortSignal, etc.).

### New Files to Create

- /packages/events/compat.ts - Backward compatibility helpers (if required).
- /packages/events/types.ts - Explicit public types aligned with Emittery.

### Test Files

- /packages/events/tests/emittery_compat.test.ts - Backward compatibility tests.
- /packages/events/tests/streams.test.ts - Async iterator behavior tests.
- /packages/events/tests/abort_signal.test.ts - Cancellation behavior tests.

### Documentation Files to Update

> ⚠️ Important: Follow the architecture and conventions documented in AGENTS.md

- /packages/events/docs/DOCS.md - Update engine rationale, streams, cancellation
  examples.
- /packages/events/README.md - Update feature list and API examples.
- /docs/dependencies.md - Add `npm:emittery` dependency.

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: Event engine + framework helpers are mixed in a custom
  implementation.
- **Solution**: Delegate core dispatch mechanics to Emittery; keep Lockness
  helpers thin and focused.

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Extending behavior requires modifying core emitter.
- **Solution**: Expose extension points via Emittery hooks and adapter layers.

**3. Liskov Substitution Principle (LSP)**

- **Current Problem**: No stable contract for alternative dispatchers.
- **Solution**: Define explicit types and adapter interface.

**4. Interface Segregation Principle (ISP)**

- **Current Problem**: Event APIs are monolithic and custom.
- **Solution**: Separate core dispatch, testing, and convenience helpers.

**5. Dependency Inversion Principle (DIP)**

- **Current Problem**: Framework depends on a bespoke emitter.
- **Solution**: Framework depends on a public contract backed by Emittery.

## 🎨 Proposed API Design (Non-breaking target)

```typescript
import { dispatcher, Listener } from '@lockness/events'

class UserCreated extends BaseEvent {}

dispatcher().on(UserCreated, (event) => {
    // Listener logic
})

// New: async iterator for event stream
for await (const event of dispatcher().events(UserCreated)) {
    // stream handling
}
```

## 🧭 Emittery API Mapping

Mapping between current Lockness events API and Emittery primitives.

| Lockness API                                   | Emittery API                    | Notes                                                                 |
| ---------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| `dispatcher().emit(event)`                     | `emit(eventName, data)`         | Use class name or symbol as event name.                               |
| `dispatcher().emitString(name, data)`          | `emit(name, data)`              | String-based events remain supported.                                 |
| `dispatcher().on(EventClass, fn, options)`     | `on(eventName, fn, { signal })` | Options map to AbortSignal.                                           |
| `dispatcher().once(EventClass, fn)`            | `once(eventName, predicate?)`   | Emittery returns a promise; wrap to support callback style if needed. |
| `dispatcher().onAny(fn)`                       | `onAny(fn, { signal })`         | Receives `(eventName, data)`.                                         |
| `dispatcher().offAny(fn)`                      | `offAny(fn)`                    | Same.                                                                 |
| `dispatcher().events(EventClass)`              | `events(eventName)`             | Async iterator stream.                                                |
| `dispatcher().anyEvent()`                      | `anyEvent()`                    | Stream of `[eventName, data]`.                                        |
| `dispatcher().listenerCount(EventClass)`       | `listenerCount(eventName?)`     | Same semantics.                                                       |
| `dispatcher().removeAllListeners(EventClass?)` | `clearListeners(eventName?)`    | Clear all or per-event.                                               |
| `dispatcher().emitSerial(event)`               | `emitSerial(eventName, data)`   | Sequential dispatch (new capability).                                 |
| `Emittery.listenerAdded/Removed`               | `listenerAdded/Removed`         | Meta-events for diagnostics.                                          |

## 🧱 Abstraction Layer Requirements

The events package must wrap Emittery behind a stable adapter so the runtime
engine can be swapped later without touching framework or user code.

**Goals:**

- Single public facade (`EventDispatcher` + helpers) used everywhere.
- No direct Emittery types leaked through public APIs.
- Engine is injectable (factory/adapter) for future replacement.

**Design outline:**

- Define an `EventEngine` interface (core methods: on/off/once/emit/onAny,
  events/anyEvent, listenerCount, clearListeners).
- Provide an `EmitteryEngine` implementation hidden in
  `/packages/events/engine/`.
- `EventDispatcher` composes an `EventEngine` instance and exposes Lockness API.
- Add a factory (`createEventEngine`) to select the engine at runtime.
- Keep tests focused on the facade + contract, not the engine implementation.

**Non-goals:**

- Exposing Emittery-specific types in public exports.
- Requiring consumers to import `emittery` directly.

## 🧾 Exact Type Signatures (Authoritative)

These signatures must be implemented exactly to avoid ambiguity.

```ts
export type EventName = string

export interface EventEngine {
    on(
        eventName: EventName | readonly EventName[],
        listener: (data: unknown) => void | Promise<void>,
        options?: { signal?: AbortSignal },
    ): () => void

    off(
        eventName: EventName | readonly EventName[],
        listener: (data: unknown) => void | Promise<void>,
    ): void

    once(
        eventName: EventName | readonly EventName[],
        predicate?: (data: unknown) => boolean,
    ): Promise<unknown> & { off: () => void }

    emit(eventName: EventName, data?: unknown): Promise<void>
    emitSerial(eventName: EventName, data?: unknown): Promise<void>

    onAny(
        listener: (eventName: EventName, data: unknown) => void | Promise<void>,
        options?: { signal?: AbortSignal },
    ): () => void

    offAny(
        listener: (eventName: EventName, data: unknown) => void | Promise<void>,
    ): void

    events(
        eventName: EventName | readonly EventName[],
    ): AsyncIterableIterator<unknown>
    anyEvent(): AsyncIterableIterator<readonly [EventName, unknown]>

    listenerCount(eventName?: EventName | readonly EventName[]): number
    clearListeners(eventName?: EventName | readonly EventName[]): void
}

export interface EventDispatcherFacade {
    emit(event: BaseEvent): Promise<void>
    emit(name: string, data?: unknown): Promise<void>
    emitSerial(event: BaseEvent): Promise<void>
    emitSerial(name: string, data?: unknown): Promise<void>

    on<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
        listener: (event: T) => void | Promise<void>,
        options?: { priority?: number; signal?: AbortSignal },
    ): () => void

    once<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
        listener: (event: T) => void | Promise<void>,
        options?: { signal?: AbortSignal },
    ): () => void

    onAny(
        listener: (eventName: string, data: unknown) => void | Promise<void>,
        options?: { signal?: AbortSignal },
    ): () => void

    offAny(
        listener: (eventName: string, data: unknown) => void | Promise<void>,
    ): void

    events<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
    ): AsyncIterableIterator<T>

    anyEvent(): AsyncIterableIterator<readonly [string, unknown]>

    listenerCount<T extends BaseEvent>(
        eventClass?: new (...args: any[]) => T,
    ): number

    removeAllListeners<T extends BaseEvent>(
        eventClass?: new (...args: any[]) => T,
    ): void
}
```

## 🗂️ File Layout (Exact)

- /packages/events/engine/event_engine.ts
  - Exports `EventEngine` interface and `EventName` type.
- /packages/events/engine/emittery_engine.ts
  - Implements `EventEngine` using `Emittery`.
- /packages/events/dispatcher.ts
  - Implements `EventDispatcherFacade` and maps to `EventEngine`.
- /packages/events/mod.ts
  - Re-exports `EventDispatcher` and public helpers only (no Emittery types).

## 🧪 Minimal Implementation Sketch (Pseudo-code)

These snippets are illustrative, not final code.

```ts
// /packages/events/engine/emittery_engine.ts
import Emittery from 'emittery'
import type { EventEngine, EventName } from './event_engine.ts'

export class EmitteryEngine implements EventEngine {
    private emitter = new Emittery()

    on(eventName, listener, options) {
        return this.emitter.on(eventName as any, listener as any, options)
    }

    off(eventName, listener) {
        this.emitter.off(eventName as any, listener as any)
    }

    once(eventName, predicate) {
        return this.emitter.once(eventName as any, predicate as any) as any
    }

    emit(eventName, data) {
        return this.emitter.emit(eventName as any, data)
    }

    emitSerial(eventName, data) {
        return this.emitter.emitSerial(eventName as any, data)
    }

    onAny(listener, options) {
        return this.emitter.onAny(listener as any, options)
    }

    offAny(listener) {
        this.emitter.offAny(listener as any)
    }

    events(eventName) {
        return this.emitter.events(eventName as any)
    }

    anyEvent() {
        return this.emitter.anyEvent()
    }

    listenerCount(eventName) {
        return this.emitter.listenerCount(eventName as any)
    }

    clearListeners(eventName) {
        this.emitter.clearListeners(eventName as any)
    }
}
```

```ts
// /packages/events/dispatcher.ts (outline)
import type { BaseEvent } from './base_event.ts'
import type { EventEngine } from './engine/event_engine.ts'

export class EventDispatcher {
    constructor(private engine: EventEngine) {}

    private getName(eventOrName: BaseEvent | string): string {
        return typeof eventOrName === 'string'
            ? eventOrName
            : eventOrName.constructor.name
    }

    emit(eventOrName: BaseEvent | string, data?: unknown): Promise<void> {
        const name = this.getName(eventOrName)
        const payload = typeof eventOrName === 'string' ? data : eventOrName
        return this.engine.emit(name, payload)
    }

    emitSerial(eventOrName: BaseEvent | string, data?: unknown): Promise<void> {
        const name = this.getName(eventOrName)
        const payload = typeof eventOrName === 'string' ? data : eventOrName
        return this.engine.emitSerial(name, payload)
    }

    on(eventClass, listener, options) {
        const name = eventClass.name
        // priority handling: register in sorted order outside this snippet
        return this.engine.on(name, listener as any, options)
    }

    onAny(listener, options) {
        return this.engine.onAny(listener, options)
    }
}
```

## 🧩 Decisions (Locked)

- Remove `emitString()` and use `emit()` for both string and class events.
- Keep listener priorities by re-registering in sorted order per event.
- Expose `emitSerial()` on `EventDispatcher`.
- Keep `onAny()` payload signature as `(eventName, data)`.
- Use class name string for class-based event names (no symbols).
- Expose debug toggles (`Emittery.isDebugEnabled`, per-instance debug).

## ✅ Behavior Rules (No Ambiguity)

- **Event naming:** class-based events use `EventClass.name` as the event name.
- **Dispatch default:** `emit()` maps to `Emittery.emit()` (concurrent
  listeners).
- **Sequential dispatch:** `emitSerial()` maps to `Emittery.emitSerial()`.
- **Listener order:** listeners are executed in registration order; priority is
  implemented by sorted registration (higher priority registered first).
- **onAny order:** `onAny` runs after event-specific listeners (Emittery
  default).
- **Errors:** `emit()` rejects if any listener throws; other listeners still
  run.
- **once():** keep callback-style helper that wraps Emittery's promise-based
  `once()` when needed.

## 📝 Detailed Implementation Steps

### Phase 1: Emittery Integration

1. Add `npm:emittery` to `/packages/events/deno.json`.
2. Rebuild `EventDispatcher` on Emittery with support for:
   - class-based events

- priorities (register sorted order per event)
- on/off/once/onAny/offAny

3. Support string-based events via `emit()` overload (no `emitString()`).

### Phase 2: Adapter & Safety

1. Implement `EventEngine` and `EmitteryEngine` per the abstraction section.
2. Validate listener metadata registration still works with the new dispatcher.
3. Preserve testing APIs (`fake()`, `EventBuffer`).

### Phase 3: Docs & Examples

1. Document new features (streams, AbortSignal).
2. Provide migration guidance and changelog entries.

## 🧪 Testing Strategy

### Unit Tests

- [ ] Listener registration/deregistration works as before.
- [ ] String-based event compatibility preserved.
- [ ] Priority ordering honored.
- [ ] `onAny` behavior preserved.

### Streams & Cancellation Tests

- [ ] Async iterator yields events in order.
- [ ] AbortSignal stops listener/stream.

### Integration Tests

- [ ] `@lockness/core` listener discovery still registers listeners correctly.

## 🔍 Quality Checks

- deno check packages/events/**/*.ts
- deno lint packages/events/
- deno test packages/events/tests/

## ✅ Definition of Done

- [ ] Emittery is the runtime engine.
- [ ] No regressions in class-based events.
- [ ] Async iterator API is exposed and documented.
- [ ] Backward compatibility validated or migration guide provided.
- [ ] Tests added and passing.

## 🚨 Breaking Changes Policy

Breaking changes are acceptable for this migration because the framework is
still in active development. Focus on a cleaner, more powerful API even if
existing behavior changes.

Expected breaking areas:

- **Listener ordering** if priority handling differs.
- **Error handling semantics** (per-listener isolation) if behavior changes.
- **Wildcard listener payload shape** if Emittery format differs.
- **Performance timing** for async listeners (different scheduling).

Requirements:

- Document breaking changes in migration notes.
- Update examples and docs to match new behavior.
- Add tests to lock down the new semantics.

## 📝 Migration Notes (Breaking)

Checklist of items to announce and document during migration:

- [ ] Listener ordering/priority behavior changes.
- [ ] Wildcard listener payload shape changes.
- [ ] Error handling semantics (per-listener isolation vs fail-fast).
- [ ] String-based event compatibility status.
- [ ] Removal/renaming of helper methods.
- [ ] Stream/async iterator behavior differences.
- [ ] Cancellation/AbortSignal support and defaults.
- [ ] Any API signature changes in `EventDispatcher`.

## 📅 Timeline

- **Start Date**: 2026-02-07
- **Estimated Completion**: 2026-02-14
- **Actual Completion**: [YYYY-MM-DD]
