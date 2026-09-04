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
 * A live WebSocket connection handed to the lifecycle hooks.
 *
 * `identity` is the **server-derived** identity resolved at the upgrade (never
 * from a wire frame) and is immutable; `metadata` is free-form and is never
 * treated as identity (security S1).
 *
 * @typeParam Identity - The app's identity shape (e.g. a user id or record).
 */
export interface Connection<Identity = unknown> {
    /** A stable per-connection transport id (not an identity). */
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
