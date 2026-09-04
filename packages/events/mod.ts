/**
 * Lockness Events - Type-safe Event Emitter
 *
 * Provides a powerful event system with TypeScript generics, async support,
 * listener priorities, wildcards, and more.
 *
 * @module @lockness/events
 */

// =============================================================================
// Class-based Events (New)
// =============================================================================

export { BaseEvent } from './base_event.ts'
export { debugLog, isDebugEnabled, setEventsDebug } from './debug.ts'
export type { DebugRecord } from './debug.ts'
export {
    createEventQueue,
    DEFAULT_BUFFER_SIZE,
    DEFAULT_OVERFLOW,
    MAX_BUFFER_SIZE,
    OVERFLOW_POLICIES,
} from './stream.ts'
export type {
    EventQueue,
    OverflowPolicy,
    OverflowReport,
    StreamOptions,
} from './stream.ts'
export {
    configureEventDispatcher,
    dispatcher,
    EventDispatcher,
} from './dispatcher.ts'
export { Listener } from './decorators.ts'
export type { ListenerMetadata, ListenerOptions } from './listener_registry.ts'
export { getListenerMetadata } from './listener_registry.ts'

// Framework Lifecycle Events
export * from './kernel_events.ts'

// Testing utilities
export { EventBuffer, fake, getActiveFake, restore } from './testing.ts'

// =============================================================================
// Types & Interfaces
// =============================================================================

export type {
    EventData,
    EventListener,
    EventMap,
    EventName,
    ListenerConfig,
} from './types.ts'

// =============================================================================
// EventEmitter Class
// =============================================================================

export { EventEmitter } from './emitter.ts'

// =============================================================================
// Helper Functions & Utilities
// =============================================================================

export {
    configureEvents,
    createEventBus,
    emit,
    emitSync,
    events,
    eventStream,
    off,
    on,
    once,
    waitForEvent,
} from './helpers.ts'
