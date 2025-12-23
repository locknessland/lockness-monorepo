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

        if (!this.listenerMap.has(event as string)) {
            this.listenerMap.set(event as string, [])
        }

        const entries = this.listenerMap.get(event as string)!
        entries.push(entry as ListenerEntry)

        // Sort by priority (higher first)
        entries.sort((a, b) => b.priority - a.priority)

        // Warn about too many listeners
        if (entries.length > this.maxListeners) {
            console.warn(
                `Warning: Possible EventEmitter memory leak detected. ${entries.length} ${String(event)} listeners added. ` +
                `Use emitter.setMaxListeners() to increase limit.`
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

        const index = entries.findIndex(entry => entry.listener === listener)
        if (index !== -1) {
            entries.splice(index, 1)
        }

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
            this.listenerMap.delete(event as string)
        } else {
            this.listenerMap.clear()
            this.wildcardListeners = []
        }
        return this
    }

    /**
     * Emit an event to all registered listeners
     */
    async emit<K extends EventName<Events>>(
        event: K,
        data: EventData<Events, K>,
    ): Promise<void> {
        // Get specific event listeners
        const entries = this.listenerMap.get(event as string) || []

        // Combine with wildcard listeners
        const allEntries = [...entries, ...this.wildcardListeners]

        // Sort by priority
        allEntries.sort((a, b) => b.priority - a.priority)

        // Execute listeners
        const toRemove: ListenerEntry[] = []

        for (const entry of allEntries) {
            try {
                await entry.listener(data)
            } catch (error) {
                console.error(`Error in event listener for "${String(event)}":`, error)
            }

            if (entry.once) {
                toRemove.push(entry)
            }
        }

        // Remove once listeners
        for (const entry of toRemove) {
            const entries = this.listenerMap.get(event as string)
            if (entries) {
                const index = entries.indexOf(entry)
                if (index !== -1) {
                    entries.splice(index, 1)
                }
            }
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
        this.emit(event, data).catch(error => {
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

        this.wildcardListeners.push(entry)
        this.wildcardListeners.sort((a, b) => b.priority - a.priority)

        return this
    }

    /**
     * Remove a wildcard listener
     */
    offAny(listener: EventListener<{ event: string; data: unknown }>): this {
        const index = this.wildcardListeners.findIndex(entry => entry.listener === listener)
        if (index !== -1) {
            this.wildcardListeners.splice(index, 1)
        }
        return this
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
        return entries.map(entry => entry.listener) as EventListener<EventData<Events, K>>[]
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
export function configureEvents<T extends EventMap = EventMap>(): EventEmitter<T> {
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
export function off<T = unknown>(event: string, listener: EventListener<T>): EventEmitter {
    return events().off(event as any, listener as EventListener<any>)
}

// =============================================================================
// Utility: Event Bus Pattern
// =============================================================================

/**
 * Create an isolated event bus
 */
export function createEventBus<T extends EventMap = EventMap>(): EventEmitter<T> {
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
        let timer: number | undefined

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
 * Convert events to an async iterable stream
 */
export function eventStream<T = unknown>(
    emitter: EventEmitter,
    event: string,
): AsyncIterable<T> {
    const queue: T[] = []
    const waiting: Array<(value: IteratorResult<T>) => void> = []
    let done = false

    const listener = (data: T) => {
        if (waiting.length > 0) {
            const resolve = waiting.shift()!
            resolve({ value: data, done: false })
        } else {
            queue.push(data)
        }
    }

    emitter.on(event as any, listener as EventListener<any>)

    return {
        [Symbol.asyncIterator]() {
            return {
                next(): Promise<IteratorResult<T>> {
                    if (queue.length > 0) {
                        return Promise.resolve({ value: queue.shift()!, done: false })
                    }

                    if (done) {
                        return Promise.resolve({ value: undefined as unknown as T, done: true })
                    }

                    return new Promise<IteratorResult<T>>((resolve) => {
                        waiting.push(resolve)
                    })
                },
                return(): Promise<IteratorResult<T>> {
                    done = true
                    emitter.off(event as any, listener as EventListener<any>)
                    return Promise.resolve({ value: undefined as unknown as T, done: true })
                },
            }
        },
    }
}
