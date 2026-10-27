/**
 * @fileoverview Testing utilities for events.
 *
 * Provides `fake()` and assertion methods for testing event-driven code.
 * Inspired by AdonisJS testing utilities.
 *
 * @module @lockness/events/testing
 */

import type { BaseEvent } from './base_event.ts'
import { dispatcher, EventDispatcher } from './dispatcher.ts'

/**
 * Recorded event information
 */
interface RecordedEvent<T extends BaseEvent = BaseEvent> {
    /**
     * The event instance that was emitted
     */
    event: T

    /**
     * Timestamp when the event was recorded
     */
    timestamp: Date
}

/**
 * Event buffer for capturing and asserting emitted events in tests.
 *
 * @example
 * ```typescript
 * Deno.test('user registration emits event', async () => {
 *     const fake = events().fake()
 *
 *     await userService.register({ email: 'test@example.com' })
 *
 *     fake.assertEmitted(UserRegistered)
 *     fake.assertEmittedCount(UserRegistered, 1)
 *
 *     events().restore()
 * })
 * ```
 */
export class EventBuffer {
    private recorded: RecordedEvent[] = []
    private originalDispatcher: EventDispatcher
    private fakeDispatcher: EventDispatcher

    constructor(originalDispatcher: EventDispatcher) {
        this.originalDispatcher = originalDispatcher
        this.fakeDispatcher = new EventDispatcher()

        // Capture all events
        this.fakeDispatcher.onAny(({ data }) => {
            this.recorded.push({
                event: data as BaseEvent,
                timestamp: new Date(),
            })
        })
    }

    /**
     * Get the fake dispatcher that records events
     * @internal
     */
    getDispatcher(): EventDispatcher {
        return this.fakeDispatcher
    }

    /**
     * Get the original dispatcher
     * @internal
     */
    getOriginalDispatcher(): EventDispatcher {
        return this.originalDispatcher
    }

    /**
     * Get all recorded events
     */
    all(): RecordedEvent[] {
        return [...this.recorded]
    }

    /**
     * Get all events of a specific type
     */
    allOfType<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
    ): RecordedEvent<T>[] {
        return this.recorded.filter((record) =>
            record.event instanceof eventClass
        ) as RecordedEvent<T>[]
    }

    /**
     * Assert that an event was emitted
     *
     * @param eventClass - The event class to check
     * @param predicate - Optional predicate to filter events
     * @throws {Error} If no matching event was found
     */
    assertEmitted<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
        predicate?: (event: T) => boolean,
    ): void {
        const events = this.allOfType(eventClass)

        if (events.length === 0) {
            throw new Error(
                `Expected event ${eventClass.name} to be emitted, but it was not`,
            )
        }

        if (predicate) {
            const matching = events.filter((record) =>
                predicate(record.event as T)
            )

            if (matching.length === 0) {
                throw new Error(
                    `Expected event ${eventClass.name} matching predicate to be emitted, but none matched`,
                )
            }
        }
    }

    /**
     * Assert that an event was NOT emitted
     *
     * @param eventClass - The event class to check
     * @throws {Error} If the event was found
     */
    assertNotEmitted<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
    ): void {
        const events = this.allOfType(eventClass)

        if (events.length > 0) {
            throw new Error(
                `Expected event ${eventClass.name} NOT to be emitted, but it was emitted ${events.length} time(s)`,
            )
        }
    }

    /**
     * Assert the exact number of times an event was emitted
     *
     * @param eventClass - The event class to check
     * @param count - Expected count
     * @throws {Error} If the count doesn't match
     */
    assertEmittedCount<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
        count: number,
    ): void {
        const events = this.allOfType(eventClass)

        if (events.length !== count) {
            throw new Error(
                `Expected event ${eventClass.name} to be emitted ${count} time(s), but it was emitted ${events.length} time(s)`,
            )
        }
    }

    /**
     * Clear all recorded events
     */
    clear(): void {
        this.recorded = []
    }

    /**
     * Get the number of recorded events
     */
    count(): number {
        return this.recorded.length
    }

    /**
     * Get the number of events of a specific type
     */
    countOfType<T extends BaseEvent>(
        eventClass: new (...args: any[]) => T,
    ): number {
        return this.allOfType(eventClass).length
    }
}

/**
 * Original dispatcher before faking
 * @internal Used to track the original dispatcher for restoration
 */
let _originalGlobalDispatcher: EventDispatcher | null = null

/**
 * Active fake buffer
 */
let activeFake: EventBuffer | null = null

/**
 * Start faking events and return an EventBuffer for assertions.
 *
 * @returns EventBuffer instance for making assertions
 *
 * @example
 * ```typescript
 * const fake = events().fake()
 *
 * // Your test code...
 *
 * fake.assertEmitted(UserCreated)
 * events().restore()
 * ```
 */
export function fake(): EventBuffer {
    if (activeFake) {
        throw new Error(
            'Events are already being faked. Call restore() before faking again.',
        )
    }

    const current = dispatcher()
    _originalGlobalDispatcher = current
    activeFake = new EventBuffer(current)

    // Set the fake dispatcher on globalThis for dispatcher() to use
    const fakeDispatcher = activeFake.getDispatcher()
    ;(globalThis as any).__locknessTestDispatcher = fakeDispatcher

    return activeFake
}

/**
 * Restore the original event dispatcher after faking.
 *
 * @example
 * ```typescript
 * const fake = events().fake()
 * // ... test code ...
 * events().restore()
 * ```
 */
export function restore(): void {
    if (!activeFake) {
        return
    }

    // Remove the fake dispatcher from globalThis
    delete (globalThis as any).__locknessTestDispatcher

    activeFake = null
    _originalGlobalDispatcher = null
}

/**
 * Get the active fake buffer (if any)
 *
 * @returns The active EventBuffer or null
 */
export function getActiveFake(): EventBuffer | null {
    return activeFake
}
