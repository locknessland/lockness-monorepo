/**
 * @fileoverview The broadcast-driver seam — how a broadcast crosses (or does
 * not cross) process boundaries.
 *
 * A driver takes a published {@link BroadcastMessage} and delivers it back to
 * `onMessage` on **every** instance that subscribed — including the publisher.
 * The manager registers one `onMessage` handler and, on receive, fans the
 * message out to its **locally authorized** subscribers (security S6). Thus
 * local and cross-process delivery share one path.
 *
 * @module @lockness/realtime/driver
 */

/** A message broadcast to a channel. */
export interface BroadcastMessage {
    /** The channel name. */
    readonly channel: string
    /** The event name. */
    readonly event: string
    /** The event payload. */
    readonly data: unknown
}

/**
 * A broadcast transport. `publish` emits a message; every instance's
 * `onMessage` handler (registered once) receives it and re-resolves local
 * delivery. The memory driver loops back in-process; the Redis driver fans out
 * across processes.
 */
export interface BroadcastDriver {
    /**
     * Publish a message to all instances (including this one).
     *
     * @param message - The message to broadcast.
     */
    publish(message: BroadcastMessage): void | Promise<void>
    /**
     * Register the handler invoked for every received message.
     *
     * @param handler - Called with each delivered message.
     */
    onMessage(handler: (message: BroadcastMessage) => void): void
}
