/**
 * @fileoverview Registry for storing listener metadata from decorators.
 *
 * Uses Symbol-based storage to attach listener metadata to service classes
 * for auto-discovery during application bootstrap.
 *
 * @module @lockness/events/listener_registry
 */

import type { BaseEvent } from './base_event.ts'

/**
 * Symbol used to store listener metadata on service classes
 * @internal
 */
export const LISTENER_METADATA = Symbol('lockness:listener:metadata')

/**
 * Configuration options for a listener
 */
export interface ListenerOptions {
    /**
     * Priority for listener execution (higher = executes first)
     * @default 0
     */
    priority?: number
}

/**
 * Metadata about a single listener method
 */
export interface ListenerMetadata {
    /**
     * The event class this listener handles
     */
    eventClass: new (...args: any[]) => BaseEvent

    /**
     * The method name that handles the event
     */
    methodName: string | symbol

    /**
     * Listener configuration options
     */
    options: ListenerOptions
}

/**
 * Store listener metadata on a class constructor
 *
 * @param target - The class constructor
 * @param metadata - Listener metadata to store
 * @internal
 */
export function addListenerMetadata(
    target: any,
    metadata: ListenerMetadata,
): void {
    if (!target[LISTENER_METADATA]) {
        target[LISTENER_METADATA] = []
    }
    target[LISTENER_METADATA].push(metadata)
}

/**
 * Retrieve all listener metadata from a class constructor.
 *
 * Public introspection API: given a `@Listener`-decorated class (already
 * instantiated at least once, since the metadata is attached by the decorator's
 * construction-time initializer), returns each handler's event class, method
 * name and options. Consumed by tooling such as the `debug:event-dispatcher`
 * CLI command.
 *
 * @param target - The class constructor.
 * @returns Array of listener metadata (empty if the class declares none, or has
 *   not yet been instantiated).
 *
 * @example
 * ```typescript
 * new MyListener() // fire the initializer
 * const meta = getListenerMetadata(MyListener)
 * ```
 */
export function getListenerMetadata(target: object): ListenerMetadata[] {
    return (target as Record<symbol, ListenerMetadata[] | undefined>)[
        LISTENER_METADATA
    ] ?? []
}
