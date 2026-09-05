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
    RealtimeControlConfig,
    Socket,
    WebSocketHooks,
    WSContext,
    WSMessageReceive,
} from './types.ts'
export {
    createWebSocketHandler,
    type WebSocketHandlerOptions,
} from './websocket.ts'
export {
    type Authorizer,
    type AuthorizeResult,
    type ChannelKind,
    channelKind,
    type PresenceMember,
} from './channel.ts'
export type {
    BroadcastDriver,
    BroadcastMessage,
    ControlMessage,
    PresenceCapableDriver,
} from './driver.ts'
export { MemoryBroadcastDriver } from './drivers/memory.ts'
export {
    RedisBroadcastDriver,
    type RedisBroadcastDriverOptions,
    type RedisCommandClient,
    type RedisSubscriber,
} from './drivers/redis.ts'
export {
    ChannelManager,
    type ChannelManagerOptions,
    type OutboundFrame,
    type SubscribeResult,
} from './manager.ts'
export {
    type ClientMessage,
    decodeClientMessage,
    encodeServerMessage,
    isValidName,
    MAX_FRAME_BYTES,
    MAX_NAME_LENGTH,
    ProtocolError,
    type ServerMessage,
} from './protocol.ts'
export { type Broadcastable, isBroadcastable } from './broadcastable.ts'
export {
    type AnyEventPayload,
    type BroadcastBridgeOptions,
    type DispatcherLike,
    forwardEvent,
    startBroadcasting,
} from './events_bridge.ts'
