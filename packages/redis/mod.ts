/**
 * @fileoverview Public surface of `@lockness/redis`.
 *
 * A foundation package: the raw-RESP wire codec, the shared authenticated-socket
 * primitive both connection kinds dial through, a reusable {@link RedisClient}
 * that owns one self-healing, serialized connection, a
 * {@link RedisSubscribeConnection} that owns an exclusive subscribe-mode socket,
 * and the connection-memo key discipline that folds the password through a
 * per-process keyed HMAC (never cleartext, never a bare SHA-256). Session, the
 * scheduler lock, and the durable queue driver build on {@link RedisClient.command};
 * `@lockness/realtime`'s pub/sub fan-out builds on {@link RedisSubscribeConnection}.
 * Depends only on `@lockness/contract`.
 *
 * @module @lockness/redis
 */

export {
    encodeCommand,
    readReply,
    RespError,
    RespFramingError,
    type RespReply,
    RespServerError,
    writeFrame,
} from './resp.ts'

export {
    AuthenticatedConnection,
    type AuthenticatedConnectionConfig,
    exchange,
} from './connection.ts'

export { RedisClient, type RedisClientConfig } from './client.ts'

export {
    RedisSubscribeConnection,
    type RedisSubscribeConnectionConfig,
} from './subscriber.ts'

export {
    credentialFingerprint,
    hmacSha256Hex,
    redisMemoKey,
    sha256Hex,
} from './memo.ts'
