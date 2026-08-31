/**
 * Lockness Events - Type-safe Event Emitter
 *
 * Provides a powerful event system with TypeScript generics, async support,
 * listener priorities, wildcards, and more.
 *
 * Note: Type casts to 'any' are necessary for generic type compatibility across helper functions
 */

// deno-lint-ignore-file no-explicit-any

// =============================================================================
// Class-based Events (New)
// =============================================================================

import { createEventQueue, type StreamOptions } from './stream.ts'
import { debugLog } from './debug.ts'

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
 * Internal listener entry
 */
interface ListenerEntry<T = unknown> {
    listener: EventListener<T>
    priority: number
    once: boolean
    /**
     * Cleanup owed by this entry, run by {@link EventEmitter} when it is
     * removed — by any path.
     *
     * This is why an entry is **not** a value object: it is identified by
     * reference in the removal gate, because the thing to detach cannot be
     * looked up from the listener function alone. Two registrations of one
     * bound method are two entries with two different cleanups.
     */
    dispose?: () => void
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

// =============================================================================
// EventEmitter Class
// =============================================================================

/**
 * Type-safe event emitter with support for:
 * - Generic event types
 * - Async listeners
 * - Listener priorities
 * - Once listeners
 * - Wildcard listeners
 * - Listener removal
 */
export class EventEmitter<Events extends EventMap = EventMap> {
    private listenerMap = new Map<string, ListenerEntry[]>()
    private wildcardListeners: ListenerEntry[] = []
    private maxListeners = 10

    /**
     * The one place an entry enters a bucket.
     *
     * `on()` and `onAny()` both come through here. They have to: `onAny()` does
     * **not** delegate to `on()` — it owns a separate array with a separate
     * removal path — so "registration is decided in `on()`" would leave the
     * wildcard path with nowhere to inherit that decision from.
     *
     * @param bucket - The array this kind of listener lives in.
     * @param entry - The entry to add.
     */
    /**
     * A copy of a bucket, taken before a dispatch iterates it.
     *
     * **One helper, both paths.** The decision table names a single home for
     * "a dispatch is immune to concurrent modification", and two identical
     * inline spreads are not that home — they are the shape that drifts when
     * one of them later grows a filter and the other does not, recreating the
     * specific/wildcard asymmetry FR-000 removed.
     *
     * @param bucket - The live array.
     * @returns A snapshot nothing else holds.
     */
    #snapshot(bucket: ListenerEntry[]): ListenerEntry[] {
        return [...bucket]
    }

    #register(
        bucket: ListenerEntry[],
        entry: ListenerEntry,
        signal?: AbortSignal,
        event = '*',
    ): boolean {
        // Refused BEFORE the push, so an already-aborted signal means the
        // listener never existed. Registering and then removing would be
        // observable through listenerCount between the two, and would run any
        // bookkeeping a registration implies.
        if (signal?.aborted) return false

        if (signal) {
            const onAbort = () => this.#unregister(bucket, entry)
            signal.addEventListener('abort', onAbort, { once: true })
            // Stored on the entry so EVERY removal path detaches it — the
            // handler outliving its listener is the leak this feature exists
            // to avoid, one indirection out.
            entry.dispose = () => signal.removeEventListener('abort', onAbort)
        }

        bucket.push(entry)
        // Sorted at REGISTRATION, which is what makes priority hold for a
        // listener added after the first emit. `emit()` deliberately does not
        // sort: a second sort is a second decision that can disagree.
        bucket.sort((a, b) => b.priority - a.priority)
        debugLog({ phase: 'register', event, listenerCount: bucket.length })
        return true
    }

    /**
     * The one place an entry leaves a bucket, and the only place its cleanup runs.
     *
     * `off()`, `offAny()` and `removeAllListeners()` all come through here.
     * `removeAllListeners()` especially: it is the path that never calls
     * `off()`, so anything wired into removal there alone would leak.
     *
     * @param bucket - The array the entry lives in.
     * @param entry - The entry to remove. A no-op if it is already gone.
     */
    #unregister(
        bucket: ListenerEntry[],
        entry: ListenerEntry,
        event = '*',
    ): void {
        const index = bucket.indexOf(entry)
        if (index !== -1) bucket.splice(index, 1)
        // Runs even when the entry was already out of the bucket: a removal
        // asked for twice must still leave nothing behind, and must not throw.
        entry.dispose?.()
        entry.dispose = undefined
        // Reported, because a listener that VANISHES is the case debugging is
        // switched on for. Without this the `unregister` phase was declared in
        // DebugRecord and emitted by nobody: the developer sees `register` and
        // `emit` lines, never a removal, and concludes the removal path did not
        // run when it did.
        debugLog({ phase: 'unregister', event, listenerCount: bucket.length })
    }

    /**
     * Register an event listener
     */
    on<K extends EventName<Events>>(
        event: K,
        listener: EventListener<EventData<Events, K>>,
        config?: ListenerConfig,
    ): this {
        const entry: ListenerEntry<EventData<Events, K>> = {
            listener,
            priority: config?.priority ?? 0,
            once: config?.once ?? false,
        }

        // The bucket is inserted only once the registration has TAKEN.
        // Creating it first left an empty array under the name whenever
        // `#register` refused — an already-aborted signal — so `eventNames()`
        // reported an event nobody listens to. An existing bucket is reused, so
        // a refusal never disturbs listeners already registered under it.
        const entries = this.listenerMap.get(event as string) ?? []
        if (
            !this.#register(
                entries,
                entry as ListenerEntry,
                config?.signal,
                event as string,
            )
        ) {
            return this
        }
        this.listenerMap.set(event as string, entries)

        // Warn about too many listeners — counting only the ones that have no
        // signal to end them. See ListenerConfig.signal.
        const unsignalled =
            entries.filter((e) => e.dispose === undefined).length
        if (unsignalled > this.maxListeners) {
            console.warn(
                `Warning: Possible EventEmitter memory leak detected. ${unsignalled} ${
                    String(event)
                } listeners added. ` +
                    `Use emitter.setMaxListeners() to increase limit.`,
            )
        }

        return this
    }

    /**
     * Register a one-time listener
     */
    once<K extends EventName<Events>>(
        event: K,
        listener: EventListener<EventData<Events, K>>,
        config?: Omit<ListenerConfig, 'once'>,
    ): this {
        return this.on(event, listener, { ...config, once: true })
    }

    /**
     * Remove a specific listener
     */
    off<K extends EventName<Events>>(
        event: K,
        listener: EventListener<EventData<Events, K>>,
    ): this {
        const entries = this.listenerMap.get(event as string)
        if (!entries) return this

        const entry = entries.find((candidate) =>
            candidate.listener === listener
        )
        if (entry) this.#unregister(entries, entry)

        if (entries.length === 0) {
            this.listenerMap.delete(event as string)
        }

        return this
    }

    /**
     * Remove all listeners for an event, or all listeners if no event specified
     */
    removeAllListeners<K extends EventName<Events>>(event?: K): this {
        if (event) {
            const entries = this.listenerMap.get(event as string)
            if (entries) {
                // Through the gate, so each entry's cleanup runs. Iterating a
                // copy because the gate splices the live array.
                for (const entry of [...entries]) {
                    this.#unregister(entries, entry)
                }
            }
            this.listenerMap.delete(event as string)
            return this
        }

        for (const entries of this.listenerMap.values()) {
            for (const entry of [...entries]) this.#unregister(entries, entry)
        }
        this.listenerMap.clear()

        for (const entry of [...this.wildcardListeners]) {
            this.#unregister(this.wildcardListeners, entry)
        }
        // `length = 0`, not `= []`: the array's identity is captured by the
        // removal gate's callers, and swapping it would strand them on a
        // detached array.
        this.wildcardListeners.length = 0

        return this
    }

    /**
     * Emit an event to all registered listeners
     */
    async emit<K extends EventName<Events>>(
        event: K,
        data: EventData<Events, K>,
    ): Promise<void> {
        // A SNAPSHOT, not the live array. `off()` splices the array held in the
        // map, so iterating it directly meant a listener removing itself
        // mid-dispatch shifted its neighbour out from under the cursor — and
        // that neighbour silently never ran. An abort handler is exactly that
        // shape, which is why this had to be right before signals could land.
        //
        // The wildcard path below has always copied; this brings the two to one
        // behaviour rather than leaving the asymmetry to be rediscovered.
        //
        // No sort here: `on()` sorts at registration, which is the single home
        // for order, and a sort at dispatch time is a second one that could
        // disagree with it.
        const entries = this.#snapshot(
            this.listenerMap.get(event as string) ?? [],
        )

        debugLog({
            phase: 'emit',
            event: String(event),
            listenerCount: entries.length,
        })

        // Execute specific event listeners
        const toRemoveSpecific: ListenerEntry[] = []

        let dispatchIndex = 0
        for (const entry of entries) {
            debugLog({
                phase: 'dispatch',
                event: String(event),
                listenerCount: entries.length,
                index: dispatchIndex++,
            })
            try {
                await entry.listener(data)
            } catch (error) {
                console.error(
                    `Error in event listener for "${String(event)}":`,
                    error,
                )
            }

            if (entry.once) {
                toRemoveSpecific.push(entry)
            }
        }

        // Execute wildcard listeners (they receive event name and data).
        // Copied for the same reason, and likewise unsorted: `onAny()` sorts at
        // registration.
        const wildcardCopy = this.#snapshot(this.wildcardListeners)
        const toRemoveWildcard: ListenerEntry[] = []

        for (const entry of wildcardCopy) {
            try {
                await entry.listener({ event: String(event), data })
            } catch (error) {
                console.error(
                    `Error in wildcard listener for "${String(event)}":`,
                    error,
                )
            }

            if (entry.once) {
                toRemoveWildcard.push(entry)
            }
        }

        // Remove once listeners — through the gate, like every other removal.
        // These two loops used to splice directly, which meant `dispose` never
        // ran and a `once(…, { signal })` left its abort handler attached to a
        // signal that may outlive the process's interest in it. The gate exists
        // precisely so there is one answer to "what else goes with a removal",
        // and two callers inside this very file were bypassing it.
        const listenerEntries = this.listenerMap.get(event as string)
        if (listenerEntries) {
            for (const entry of toRemoveSpecific) {
                this.#unregister(listenerEntries, entry)
            }
            // `off()` deletes an emptied key; this path did not, so
            // `eventNames()` reported an event with no listeners depending on
            // how its last one happened to be removed.
            if (listenerEntries.length === 0) {
                this.listenerMap.delete(event as string)
            }
        }

        for (const entry of toRemoveWildcard) {
            this.#unregister(this.wildcardListeners, entry)
        }

        return
    }

    /**
     * Emit an event synchronously (doesn't wait for async listeners)
     */
    emitSync<K extends EventName<Events>>(
        event: K,
        data: EventData<Events, K>,
    ): void {
        this.emit(event, data).catch((error) => {
            console.error(`Unhandled error in async event listener:`, error)
        })
    }

    /**
     * Register a wildcard listener that receives all events
     */
    onAny(
        listener: EventListener<{ event: string; data: unknown }>,
        config?: ListenerConfig,
    ): this {
        const entry: ListenerEntry = {
            listener: listener as EventListener,
            priority: config?.priority ?? 0,
            once: config?.once ?? false,
        }

        this.#register(this.wildcardListeners, entry, config?.signal)

        return this
    }

    /**
     * Remove a wildcard listener
     */
    offAny(listener: EventListener<{ event: string; data: unknown }>): this {
        const entry = this.wildcardListeners.find((candidate) =>
            candidate.listener === listener
        )
        if (entry) this.#unregister(this.wildcardListeners, entry)
        return this
    }

    /**
     * Every event, as an async iterable of `{ event, data }`.
     *
     * The same shape {@link onAny} delivers, deliberately: a tuple would be a
     * second shape for one concept, and `onAny` was here first. Built on the
     * one bounded queue, so it buffers and drops exactly as
     * {@link eventStream} does.
     *
     * **It creates no new capability.** `onAny()` already hands every event to
     * any in-process caller with no gate. What is new is *retention*: a
     * buffered frame keeps a reference to everything its event carries, and for
     * the framework's own lifecycle events that is the request `Context`.
     * Size the buffer accordingly.
     *
     * Ending the iteration — `break`, an exception in the loop body, or
     * `return()` — detaches the wildcard listener.
     *
     * @param options - Buffer size and overflow policy.
     * @returns Every event, in dispatch order.
     * @throws {RangeError} If `bufferSize` is outside `1..MAX_BUFFER_SIZE`.
     * @throws {TypeError} If `onOverflow` names no known policy.
     *
     * @example
     * ```ts
     * for await (const { event, data } of emitter.anyEvent()) {
     *     console.log(event)
     *     if (enough) break // detaches
     * }
     * ```
     */
    anyEvent(
        options?: StreamOptions,
    ): AsyncIterableIterator<{ event: string; data: unknown }> {
        type Frame = { event: string; data: unknown }

        // Same const-pair shape as eventStream(): neither body runs before both
        // bindings exist.
        const listener: EventListener<Frame> = (frame: Frame) =>
            queue.push(frame)

        const queue = createEventQueue<Frame>(
            '*',
            () => this.offAny(listener),
            options,
        )

        this.onAny(listener)
        return queue.stream
    }

    /**
     * Get listener count for an event
     */
    listenerCount<K extends EventName<Events>>(event: K): number {
        const entries = this.listenerMap.get(event as string)
        return entries ? entries.length : 0
    }

    /**
     * Get all event names
     */
    eventNames(): string[] {
        return Array.from(this.listenerMap.keys())
    }

    /**
     * Get all listeners for an event
     */
    listeners<K extends EventName<Events>>(
        event: K,
    ): EventListener<EventData<Events, K>>[] {
        const entries = this.listenerMap.get(event as string) || []
        return entries.map((entry) => entry.listener) as EventListener<
            EventData<Events, K>
        >[]
    }

    /**
     * Set maximum listeners warning threshold
     */
    setMaxListeners(n: number): this {
        this.maxListeners = n
        return this
    }

    /**
     * Get maximum listeners
     */
    getMaxListeners(): number {
        return this.maxListeners
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Global event emitter instance
 */
let globalEmitter: EventEmitter<any> | null = null

/**
 * Configure global event emitter
 */
export function configureEvents<T extends EventMap = EventMap>(): EventEmitter<
    T
> {
    globalEmitter = new EventEmitter<T>()
    return globalEmitter as EventEmitter<T>
}

/**
 * Get the global event emitter
 */
export function events<T extends EventMap = EventMap>(): EventEmitter<T> {
    if (!globalEmitter) {
        globalEmitter = new EventEmitter<T>()
    }
    return globalEmitter as EventEmitter<T>
}

/**
 * Quick event listener registration
 */
export function on<T = unknown>(
    event: string,
    listener: EventListener<T>,
    config?: ListenerConfig,
): EventEmitter {
    return events().on(event as any, listener as EventListener<any>, config)
}

/**
 * Quick one-time listener registration
 */
export function once<T = unknown>(
    event: string,
    listener: EventListener<T>,
    config?: Omit<ListenerConfig, 'once'>,
): EventEmitter {
    return events().once(event as any, listener as EventListener<any>, config)
}

/**
 * Quick event emission
 */
export async function emit<T = unknown>(event: string, data: T): Promise<void> {
    return await events().emit(event as any, data as any)
}

/**
 * Quick synchronous event emission
 */
export function emitSync<T = unknown>(event: string, data: T): void {
    events().emitSync(event as any, data as any)
}

/**
 * Remove a listener
 */
export function off<T = unknown>(
    event: string,
    listener: EventListener<T>,
): EventEmitter {
    return events().off(event as any, listener as EventListener<any>)
}

// =============================================================================
// Utility: Event Bus Pattern
// =============================================================================

/**
 * Create an isolated event bus
 */
export function createEventBus<T extends EventMap = EventMap>(): EventEmitter<
    T
> {
    return new EventEmitter<T>()
}

// =============================================================================
// Utility: Wait for Event
// =============================================================================

/**
 * Wait for an event to be emitted and return its data
 */
export function waitForEvent<T = unknown>(
    emitter: EventEmitter,
    event: string,
    timeout?: number,
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined

        const listener = (data: T) => {
            if (timer) clearTimeout(timer)
            resolve(data)
        }

        emitter.once(event as any, listener as EventListener<any>)

        if (timeout) {
            timer = setTimeout(() => {
                emitter.off(event as any, listener as EventListener<any>)
                reject(new Error(`Timeout waiting for event: ${event}`))
            }, timeout)
        }
    })
}

// =============================================================================
// Utility: Event Stream
// =============================================================================

/**
 * Convert one event into an async iterable stream.
 *
 * **Bounded.** The buffer holds {@link DEFAULT_BUFFER_SIZE} frames unless told
 * otherwise, and drops the oldest beyond that, reporting the episode. It used
 * to be an unbounded array: a consumer that stopped pulling grew it for the
 * life of the process with nothing said about it.
 *
 * The listener is detached when the iteration ends — by `break`, by an
 * exception in the loop body, or by calling `return()`.
 *
 * @param emitter - The emitter to listen on.
 * @param event - The event name.
 * @param options - Buffer size and overflow policy.
 * @returns An async iterable of the event's payloads.
 * @throws {RangeError} If `bufferSize` is outside `1..MAX_BUFFER_SIZE`.
 * @throws {TypeError} If `onOverflow` names no known policy.
 *
 * @example
 * ```ts
 * for await (const payload of eventStream(emitter, 'tick')) {
 *     if (done) break // detaches
 * }
 * ```
 */
export function eventStream<T = unknown>(
    emitter: EventEmitter,
    event: string,
    options?: StreamOptions,
): AsyncIterableIterator<T> {
    // `listener` names `queue` in its body and `queue` names `listener` in its
    // detach callback. Both are const: neither body runs until after both
    // bindings are initialised, so there is no temporal-dead-zone hazard here.
    const listener: EventListener<T> = (data: T) => queue.push(data)

    const queue = createEventQueue<T>(
        event,
        () => emitter.off(event as never, listener as EventListener<unknown>),
        options,
    )

    emitter.on(event as never, listener as EventListener<unknown>)

    return queue.stream
}
