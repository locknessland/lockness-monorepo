/**
 * @fileoverview Public surface of `@lockness/redis`.
 *
 * A foundation package: the raw-RESP wire codec plus a reusable
 * {@link RedisClient} that owns one self-healing, serialized connection, and the
 * connection-memo key discipline that folds the password through a SHA-256
 * digest (never cleartext). Session, the scheduler lock, and the durable queue
 * driver all build on {@link RedisClient.command}. Depends only on
 * `@lockness/contract`.
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

export { RedisClient, type RedisClientConfig } from './client.ts'

export { redisMemoKey, sha256Hex } from './memo.ts'
