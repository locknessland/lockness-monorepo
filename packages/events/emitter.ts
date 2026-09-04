/**
 * @fileoverview The type-safe {@link EventEmitter} at the heart of the package.
 *
 * All registration and removal funnel through a single private gate so that
 * cleanup, priority ordering and the leak warning have exactly one home. See
 * the inline notes on `#register` / `#unregister` for why the specific and
 * wildcard paths were unified.
 *
 * @module @lockness/events/emitter
 */

import { createEventQueue, type StreamOptions } from './stream.ts'
import { debugLog } from './debug.ts'
import { safeForLog } from '@lockness/contract'
import type {
    EventData,
    EventListener,
    EventMap,
    EventName,
    ListenerConfig,
} from './types.ts'

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
            const onAbort = () =>
                this.#unregister(bucket, entry, event, this.listenerMap)
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

        // The growth warning lives HERE, in the single registration gate, so it
        // covers wildcards too. It used to live in `on()` alone, which left
        // `onAny()` — and therefore `anyEvent()`, which registers exclusively
        // through it — with no diagnostic at all. Each wildcard listener owns a
        // queue holding up to bufferSize frames, so that is the path where
        // silent growth costs the most.
        //
        // Only listeners with no signal are counted: the request-scoped pattern
        // is one registration per request and would otherwise warn on every
        // request past the tenth.
        const unsignalled = bucket.filter((e) => e.dispose === undefined).length
        if (unsignalled > this.maxListeners) {
            console.warn(
                `Warning: Possible EventEmitter memory leak detected. ${unsignalled} ${
                    safeForLog(event)
                } listeners added. ` +
                    `Use emitter.setMaxListeners() to increase limit.`,
            )
        }
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
        /**
         * Passed when the bucket belongs to a named event, so an emptied key is
         * deleted rather than left behind. `off()` and the `once` cleanup both
         * do this; the ABORT path did not, and it is the one this feature
         * added — a dynamically-named event registered against a request signal
         * left one Map key per name, for the life of the process.
         */
        owner?: Map<string, ListenerEntry[]>,
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
        if (owner && bucket.length === 0) owner.delete(event)
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
                    `Error in event listener for "${
                        safeForLog(String(event))
                    }":`,
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
                    `Error in wildcard listener for "${
                        safeForLog(String(event))
                    }":`,
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
