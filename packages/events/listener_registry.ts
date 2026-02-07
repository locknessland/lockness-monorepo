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
 * Retrieve all listener metadata from a class constructor
 *
 * @param target - The class constructor
 * @returns Array of listener metadata
 * @internal
 */
export function getListenerMetadata(target: any): ListenerMetadata[] {
    return target[LISTENER_METADATA] || []
}
