/**
 * @fileoverview Public type vocabulary for the Lockness event system.
 *
 * The generic building blocks — event maps, listener signatures and listener
 * configuration — shared by {@link EventEmitter} and the global helper
 * functions. Kept dependency-free so every other module in the package can
 * import from here without a cycle.
 *
 * @module @lockness/events/types
 */

// deno-lint-ignore-file no-explicit-any

/**
 * Event listener function
 */
export type EventListener<T = unknown> = (data: T) => void | Promise<void>

/**
 * Listener configuration
 */
export interface ListenerConfig {
    /**
     * Removes this listener when the signal aborts.
     *
     * An **already-aborted** signal means the listener is never registered at
     * all — not registered and then removed. A signalled listener is also
     * exempt from the `maxListeners` warning, because the request-scoped
     * pattern this enables (`{ signal: c.req.raw.signal }`) is one registration
     * per request and would otherwise warn about a leak that is not happening.
     *
     * @example
     * ```ts
     * emitter.on(SomeEvent, handle, { signal: c.req.raw.signal })
     * ```
     */
    signal?: AbortSignal

    priority?: number // Higher priority executes first (default: 0)
    once?: boolean // Remove after first execution
}

/**
 * Event map type for type-safe events
 * Can be a Record or an interface with string index signature
 */
export type EventMap = Record<string, any>

/**
 * Extract event names from event map
 */
export type EventName<T extends EventMap> = keyof T & string

/**
 * Extract event data type from event map
 */
export type EventData<T extends EventMap, K extends EventName<T>> = T[K]
