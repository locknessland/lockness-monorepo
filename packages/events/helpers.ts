/**
 * @fileoverview Process-global emitter and the free-function facade over it.
 *
 * Holds the single `globalEmitter` singleton (kept here and nowhere else so
 * there is exactly one global bus) plus the thin `on` / `once` / `emit` /
 * `emitSync` / `off` wrappers, the isolated-bus factory, and the
 * `waitForEvent` / `eventStream` utilities.
 *
 * @module @lockness/events/helpers
 */

// deno-lint-ignore-file no-explicit-any

import { EventEmitter } from './emitter.ts'
import type { EventListener, EventMap, ListenerConfig } from './types.ts'
import { createEventQueue, type StreamOptions } from './stream.ts'

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
