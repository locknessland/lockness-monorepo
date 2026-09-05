/**
 * @fileoverview Core real-time types — the `Connection` a hook receives, the
 * lifecycle hooks, and the structural view of a Hono `WSContext`.
 *
 * `WSContext` is imported as a **type** from `@lockness/hono/network` (an
 * allowed edge — a real type, no mirror drift). Driver payloads are kept
 * structural + `unknown` at the wire boundary (hard rule #3).
 *
 * @module @lockness/realtime/types
 */

import type { WSContext, WSMessageReceive } from '@lockness/hono/network'

export type { WSContext, WSMessageReceive }

/**
 * Per-deployment configuration for the authenticity of control-plane and
 * presence-identity messages (FR-015, #268).
 *
 * The reserved control topic is isolation-by-**convention** only — Redis pub/sub
 * has no per-topic ACL, so anyone with bus `PUBLISH` could otherwise forge an
 * evict or spoof a presence member. Every control / presence-identity frame
 * therefore carries an HMAC over its payload, keyed by this **shared** secret;
 * a frame whose MAC is absent or fails to verify is dropped on ingest and never
 * obeyed. The secret must be identical on every instance of one deployment (so
 * the MAC is cross-instance-stable) and is redacted from every log line.
 *
 * A value object: it carries the secret, no behaviour.
 *
 * @example
 * ```ts
 * const control: RealtimeControlConfig = { secret: Deno.env.get('REALTIME_SECRET')! }
 * ```
 */
export interface RealtimeControlConfig {
    /**
     * The per-deployment shared secret keying the control/presence authenticity
     * MAC. Identical on every instance; never logged in cleartext.
     */
    readonly secret: string
    /**
     * How long after issue a control frame may still be obeyed, in
     * milliseconds — the anti-replay freshness window (#272). Also how long a
     * frame's nonce is remembered, which is the same number by construction.
     *
     * The default absorbs NTP-synchronised skew with a wide margin while
     * keeping both the replay window and the nonce store small. Widen it only
     * for a fleet whose clocks genuinely drift: a longer window is a longer
     * period during which a captured frame remains replayable against an
     * instance that restarted, and a proportionally larger store.
     *
     * A fleet whose clocks are far enough apart will see control frames dropped
     * as stale — the WARN names the observed delta, so the cause is legible
     * rather than looking like a dead bus.
     *
     * @default 30000
     */
    readonly windowMs?: number
    /**
     * The largest control payload, in bytes, that will be published or
     * accepted.
     *
     * It bounds cost at ingest: a receiving instance rejects an oversized frame
     * before parsing it and before hashing it, so an unauthenticated peer
     * cannot make every instance in the fleet do real work on demand.
     *
     * Raise it only if a legitimate frame is genuinely near the limit — a
     * presence member with an unusually large `info` payload is the realistic
     * case. **Raise it on every instance at once.** The publisher refuses to
     * send above its own limit and each receiver enforces its own, so a fleet
     * running mixed values silently loses the frames that fall between them.
     *
     * @default 8192
     */
    readonly maxPayloadBytes?: number
}

/**
 * A live WebSocket connection handed to the lifecycle hooks.
 *
 * `identity` is the **server-derived** identity resolved at the upgrade (never
 * from a wire frame) and is immutable; `metadata` is free-form and is never
 * treated as identity (security S1).
 *
 * @typeParam Identity - The app's identity shape (e.g. a user id or record).
 */
export interface Connection<Identity = unknown> {
    /**
     * A stable per-connection transport id (not an identity).
     *
     * **It must be unguessable and never reused.** The framework's own upgrade
     * path generates `crypto.randomUUID()`, but an application wiring its own
     * transport supplies this itself, and "stable" has been read as an
     * invitation to pass a user id or a session id. It is not.
     *
     * The reason is the control plane. `manager.evict(id)` travels between
     * instances as a signed frame naming this id, and an id that is guessable
     * or reused across connections turns a captured frame into a repeatable
     * weapon: it hard-closes whatever socket currently holds that id,
     * unsubscribes every channel, and removes the member from the authoritative
     * roster. With a fresh random id per connection the same frame targets
     * something that no longer exists and does nothing.
     */
    readonly id: string
    /** The server-verified identity, or `null` for an unauthenticated socket. */
    readonly identity: Identity | null
    /** Free-form connection metadata; never an identity source. */
    readonly metadata: Readonly<Record<string, unknown>>
    /**
     * Send a frame to this connection.
     *
     * @param data - The payload (string or binary).
     */
    send(data: string | ArrayBuffer | Uint8Array): void
    /**
     * Close this connection.
     *
     * @param code - An optional close code.
     * @param reason - An optional close reason.
     */
    close(code?: number, reason?: string): void
}

/**
 * The lifecycle hooks a connection drives. Any hook may be async; a throw in
 * `onMessage` is routed to `onError`, never crashing the connection.
 *
 * @typeParam Identity - The app's identity shape.
 */
export interface WebSocketHooks<Identity = unknown> {
    /** Fired once the socket is open. */
    onOpen?(connection: Connection<Identity>): void | Promise<void>
    /** Fired for each inbound frame. */
    onMessage?(
        connection: Connection<Identity>,
        data: WSMessageReceive,
    ): void | Promise<void>
    /** Fired once the socket closes. */
    onClose?(
        connection: Connection<Identity>,
        code: number,
        reason: string,
    ): void | Promise<void>
    /** Fired on a transport error or a throwing hook. */
    onError?(
        connection: Connection<Identity>,
        error: unknown,
    ): void | Promise<void>
}

/**
 * The minimal structural view of a Hono `WSContext` the handler drives — the
 * two methods used. `WSContext` satisfies it.
 */
export interface Socket {
    /** Send a frame. */
    send(data: string | ArrayBuffer | Uint8Array): void
    /** Close the socket. */
    close(code?: number, reason?: string): void
}
