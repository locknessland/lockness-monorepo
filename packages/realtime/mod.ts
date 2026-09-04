/**
 * @fileoverview Public surface of `@lockness/realtime` — WebSockets +
 * broadcasting over authorized channels.
 *
 * `createWebSocketHandler` upgrades a request (guarding the origin, resolving a
 * server-derived identity) and drives lifecycle hooks over a typed
 * `Connection`. Channels, drivers, the wire protocol and the events bridge are
 * added by the epic's later children.
 *
 * @module @lockness/realtime
 *
 * @example
 * ```ts
 * import { createWebSocketHandler } from '@lockness/realtime'
 *
 * app.get('/ws', createWebSocketHandler({
 *     hooks: { onMessage: (conn, data) => conn.send(`echo: ${data}`) },
 *     resolveIdentity: (c) => c.get('user') ?? null,
 * }))
 * ```
 */

export type {
    Connection,
    Socket,
    WebSocketHooks,
    WSContext,
    WSMessageReceive,
} from './types.ts'
export {
    createWebSocketHandler,
    type WebSocketHandlerOptions,
} from './websocket.ts'
