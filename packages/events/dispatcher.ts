/**
 * @fileoverview Event dispatcher with class-based event support.
 *
 * Wraps the existing EventEmitter to provide class-based events while
 * maintaining backward compatibility with string-based events.
 *
 * @module @lockness/events/dispatcher
 */

import {
    EventEmitter,
    type EventListener,
    type ListenerConfig,
    type StreamOptions,
} from './mod.ts'
import type { BaseEvent } from './base_event.ts'

/**
 * Event dispatcher that supports both class-based and string-based events.
 *
 * Provides a unified interface for emitting and listening to events,
 * with special support for BaseEvent classes.
 *
 * @example Class-based events
 * ```typescript
 * class UserCreated extends BaseEvent {
 *     constructor(public userId: string) {
 *         super()
 *     }
 * }
 *
 * const dispatcher = new EventDispatcher()
 * dispatcher.on(UserCreated, (event) => {
 *     console.log('User created:', event.userId)
 * })
 *
 * await dispatcher.emit(new UserCreated('123'))
 * ```
 *
 * @example String-based events (backward compatibility)
 * ```typescript
 * dispatcher.on('user:created', (data) => {
 *     console.log('User created:', data)
 * })
 *
 * await dispatcher.emitString('user:created', { userId: '123' })
 * ```
 */
export class EventDispatcher {
    private emitter: EventEmitter

    constructor() {
        this.emitter = new EventEmitter()
    }

    /**
     * Emit a class-based event
     *
     * @param event - The event instance to emit
     */
    async emit<T extends BaseEvent>(event: T): Promise<void> {
        await this.emitter.emit(event.eventName, event)
    }

    /**
     * Emit a string-based event (for backward compatibility)
     *
     * @param eventName - The event name
     * @param data - The event data
     */
    async emitString<T = unknown>(eventName: string, data: T): Promise<void> {
        await this.emitter.emit(eventName, data)
    }

    /**
     * Register a listener for a class-based event
     *
     * @param eventClass - The event class to listen for
     * @param listener - The listener function
     * @param options - Optional listener configuration
     * @returns Unsubscribe function
     */
    on<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
        listener: EventListener<T>,
        options?: ListenerConfig,
    ): () => void {
        const eventName = eventClass.name
        this.emitter.on(eventName, listener, options)

        // Return unsubscribe function
        return () => this.emitter.off(eventName, listener)
    }

    /**
     * Register a one-time listener for a class-based event
     *
     * @param eventClass - The event class to listen for
     * @param listener - The listener function
     * @param options - Optional listener configuration
     */
    once<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
        listener: EventListener<T>,
        options?: ListenerConfig,
    ): void {
        const eventName = eventClass.name
        this.emitter.once(eventName, listener, options)
    }

    /**
     * Remove a listener for a class-based event
     *
     * @param eventClass - The event class
     * @param listener - The listener function to remove
     */
    off<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
        listener: EventListener<T>,
    ): void {
        const eventName = eventClass.name
        this.emitter.off(eventName, listener)
    }

    /**
     * Register a wildcard listener that receives all events
     *
     * @param listener - The listener function
     * @param options - Optional listener configuration
     */
    onAny(
        listener: EventListener<{ event: string; data: unknown }>,
        options?: ListenerConfig,
    ): void {
        this.emitter.onAny(listener, options)
    }

    /**
     * Every event, as an async iterable of `{ event, data }`.
     *
     * Forwarded to the emitter. The dispatcher adds nothing — see
     * {@link EventEmitter.anyEvent}.
     *
     * @param options - Buffer size and overflow policy.
     * @returns Every event, in dispatch order.
     *
     * @example
     * ```ts
     * for await (const { event } of dispatcher().anyEvent()) console.log(event)
     * ```
     */
    anyEvent(
        options?: StreamOptions,
    ): AsyncIterableIterator<{ event: string; data: unknown }> {
        return this.emitter.anyEvent(options)
    }

    /**
     * Remove a wildcard listener
     *
     * @param listener - The listener function to remove
     */
    offAny(listener: EventListener<{ event: string; data: unknown }>): void {
        this.emitter.offAny(listener)
    }

    /**
     * Get the number of listeners for a class-based event
     *
     * @param eventClass - The event class
     * @returns The number of listeners
     */
    listenerCount<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
    ): number {
        return this.emitter.listenerCount(eventClass.name)
    }

    /**
     * Remove all listeners for a class-based event
     *
     * @param eventClass - The event class (optional)
     */
    removeAllListeners<T extends BaseEvent>(
        eventClass?: new (...args: any[]) => T,
    ): void {
        if (eventClass) {
            this.emitter.removeAllListeners(eventClass.name)
        } else {
            this.emitter.removeAllListeners()
        }
    }

    /**
     * Get the underlying EventEmitter instance
     * For advanced use cases and backward compatibility
     */
    getEmitter(): EventEmitter {
        return this.emitter
    }
}

/**
 * Global event dispatcher instance
 */
let globalDispatcher: EventDispatcher | null = null

/**
 * Configure the global event dispatcher
 */
export function configureEventDispatcher(): EventDispatcher {
    globalDispatcher = new EventDispatcher()
    return globalDispatcher
}

/**
 * Get the global event dispatcher (creates one if it doesn't exist)
 *
 * Note: This function checks for fake dispatchers during testing
 */
export function dispatcher(): EventDispatcher {
    // Check if we're in testing mode with a fake dispatcher
    // This is set by the fake() function in testing.ts
    if (
        typeof globalThis !== 'undefined' &&
        (globalThis as any).__locknessTestDispatcher
    ) {
        return (globalThis as any).__locknessTestDispatcher
    }

    if (!globalDispatcher) {
        globalDispatcher = new EventDispatcher()
    }
    return globalDispatcher
}
