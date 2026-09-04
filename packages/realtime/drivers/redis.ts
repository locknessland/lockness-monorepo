/**
 * @fileoverview The Redis broadcast driver — cross-process fan-out.
 *
 * Publishing is a normal `PUBLISH` command (args are RESP bulk strings via the
 * client — no inline construction, no RESP injection). Receiving push messages
 * needs a **subscribe-mode connection**, which `@lockness/redis`'s
 * serialized-command `RedisClient` does not provide; that connection is
 * injected as a {@link RedisSubscriber} port. The concrete pub/sub connection
 * is a `@lockness/redis` follow-up (tracked) — this driver owns the fan-out
 * semantics + the reserved-prefix isolation, and is proven against a fake bus.
 *
 * @module @lockness/realtime/drivers/redis
 */

import type { BroadcastDriver, BroadcastMessage } from '../driver.ts'
import { isValidName } from '../protocol.ts'

/**
 * The minimal command surface used for publishing. `@lockness/redis`'s
 * `RedisClient` satisfies it; a test passes a fake. `PUBLISH` is an ordinary
 * command — the serialized-command client handles it.
 */
export interface RedisCommandClient {
    /**
     * Run a Redis command; args are sent as RESP bulk strings.
     *
     * @param args - The command and its arguments.
     * @returns The reply (unused here).
     */
    command(...args: string[]): Promise<unknown>
}

/**
 * A subscribe-mode connection that pushes messages for a topic pattern. A test
 * passes a fake bus; production supplies a real pub/sub connection (a
 * `@lockness/redis` follow-up — the serialized client cannot subscribe).
 */
export interface RedisSubscriber {
    /**
     * Subscribe to a topic pattern and receive each published payload.
     *
     * @param pattern - The topic glob (e.g. `lockness:realtime:*`).
     * @param handler - Called with `(topic, payload)` for each message.
     */
    psubscribe(
        pattern: string,
        handler: (topic: string, payload: string) => void,
    ): void
}

/** Options for the Redis broadcast driver. */
export interface RedisBroadcastDriverOptions {
    /** Reserved topic prefix for multi-app / multi-tenant isolation. */
    prefix?: string
}

/**
 * A cross-process broadcast driver over Redis pub/sub.
 *
 * @example
 * ```ts
 * const driver = new RedisBroadcastDriver(redisClient, pubsubConn, { prefix: 'myapp' })
 * ```
 */
export class RedisBroadcastDriver implements BroadcastDriver {
    private readonly prefix: string

    /**
     * @param command - The command client used to `PUBLISH`.
     * @param subscriber - The subscribe-mode connection pushing messages.
     * @param options - The reserved prefix.
     */
    constructor(
        private readonly command: RedisCommandClient,
        private readonly subscriber: RedisSubscriber,
        options: RedisBroadcastDriverOptions = {},
    ) {
        this.prefix = options.prefix ?? 'lockness:realtime'
    }

    /** The reserved topic for a channel. */
    private topic(channel: string): string {
        return `${this.prefix}:${channel}`
    }

    /**
     * Publish a message to the channel's Redis topic.
     *
     * @param message - The message to broadcast.
     */
    async publish(message: BroadcastMessage): Promise<void> {
        await this.command.command(
            'PUBLISH',
            this.topic(message.channel),
            JSON.stringify({ event: message.event, data: message.data }),
        )
    }

    /**
     * Register the delivery handler and start the pattern subscription. Each
     * received payload is decoded back into a {@link BroadcastMessage} whose
     * channel is the topic with the reserved prefix stripped.
     *
     * @param handler - Called with each received message.
     */
    onMessage(handler: (message: BroadcastMessage) => void): void {
        const pattern = `${this.prefix}:*`
        this.subscriber.psubscribe(pattern, (topic, payload) => {
            const channel = topic.startsWith(`${this.prefix}:`)
                ? topic.slice(this.prefix.length + 1)
                : topic
            let parsed: { event?: unknown; data?: unknown }
            try {
                parsed = JSON.parse(payload)
            } catch {
                console.warn('realtime: dropped a malformed Redis payload')
                return // a malformed payload is dropped, never a throw
            }
            // Re-validate names on ingest — a peer (or a poisoned topic) must
            // not inject an out-of-charset channel/event name into local fan-out.
            if (
                typeof parsed.event !== 'string' ||
                !isValidName(parsed.event) || !isValidName(channel)
            ) {
                console.warn(
                    'realtime: dropped a Redis message with an invalid name',
                )
                return
            }
            handler({ channel, event: parsed.event, data: parsed.data })
        })
    }
}
