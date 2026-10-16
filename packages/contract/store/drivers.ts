/**
 * @fileoverview Store-driver names, decided once (plan 274 §5, Storage).
 *
 * Every configuration type that names a backing store — the cache, session
 * and queue configs and core's `@Kernel` cache, session and scheduler-lock
 * options — references these types instead of spelling a union of string
 * literals. A driver is added (`sqlite`, epic #584) or retired here, and every
 * list follows.
 *
 * Types, plus the one runtime list a parser needs ({@link QUEUE_DRIVER_NAMES}):
 * each type is derived from its tuple, so the two cannot drift.
 *
 * @example
 * ```ts
 * import type { CacheDriverName } from '@lockness/contract/store'
 *
 * interface CacheConfig {
 *     driver: CacheDriverName
 * }
 * ```
 *
 * @module @lockness/contract/store
 */

/** The in-process store; nothing survives a restart. */
export type MemoryDriverName = 'memory'

/** Deno KV — a Deno-only API (see `assertDenoKvRuntime`). */
export type DenoKvDriverName = 'deno-kv'

/** Redis — needs a connection block (host, port, credentials). */
export type RedisDriverName = 'redis'

/** The signed-cookie session store: session data lives in the client. */
export type CookieDriverName = 'cookie'

/**
 * Every key-value backing store a subsystem can be configured with, as a
 * runtime list for code that parses a driver name (an environment variable).
 */
export const STORE_DRIVER_NAMES = [
    'memory',
    'deno-kv',
    'redis',
] as const satisfies readonly (
    | MemoryDriverName
    | DenoKvDriverName
    | RedisDriverName
)[]

/** Every key-value backing store a subsystem can be configured with. */
export type StoreDriverName = typeof STORE_DRIVER_NAMES[number]

/** The drivers `@lockness/cache` accepts. */
export type CacheDriverName = StoreDriverName

/** The drivers `@lockness/queue` accepts, as a runtime list (`QUEUE_DRIVER`). */
export const QUEUE_DRIVER_NAMES: readonly QueueDriverName[] = STORE_DRIVER_NAMES

/** The drivers `@lockness/queue` accepts. */
export type QueueDriverName = StoreDriverName

/** The drivers `@lockness/session` accepts: every store, plus the cookie. */
export type SessionDriverName = CookieDriverName | StoreDriverName

/**
 * The drivers that can hold a scheduler lock across replicas — every store
 * shared between processes, so not `memory`.
 */
export type SchedulerLockDriverName = Exclude<StoreDriverName, MemoryDriverName>
