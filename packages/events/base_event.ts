/**
 * @fileoverview Base class for all events in the Lockness framework.
 *
 * Provides a foundation for class-based events with TypeScript support.
 * All events should extend this class to be recognized by the event system.
 *
 * @module @lockness/events/base_event
 */

/**
 * Abstract base class for all events.
 *
 * Events are immutable data containers that carry information about
 * something that has happened in the application.
 *
 * @example
 * ```typescript
 * export class UserRegistered extends BaseEvent {
 *     constructor(
 *         public readonly user: User,
 *         public readonly timestamp: Date = new Date()
 *     ) {
 *         super()
 *     }
 * }
 * ```
 */
export abstract class BaseEvent {
    /**
     * Timestamp when the event was created
     */
    public readonly createdAt: Date

    constructor() {
        this.createdAt = new Date()
    }

    /**
     * Get the event name (class name)
     */
    get eventName(): string {
        return this.constructor.name
    }
}
