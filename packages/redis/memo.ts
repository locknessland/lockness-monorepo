/**
 * @fileoverview The connection-memo key discipline for Redis clients.
 *
 * A memoized {@link RedisClient} is shared across a process, so the key that
 * identifies "the same connection" must fold the password — two configs with
 * different credentials must never collapse onto one authenticated socket — WITHOUT
 * ever placing the cleartext credential in a key that is routinely logged
 * (FR-015). {@link sha256Hex} is the one home of that digest; {@link redisMemoKey}
 * is the assembled key. A consumer that keys on a richer config (the session
 * driver keys on its own `SessionConfig`) can import {@link sha256Hex} and build
 * its own key with the same discipline.
 *
 * @module @lockness/redis/memo
 */

import { crypto } from '@std/crypto'
import type { RedisClientConfig } from './client.ts'

/**
 * A hex SHA-256 digest of a string, computed synchronously.
 *
 * Folds a Redis password into a memo key without ever placing the cleartext
 * credential there (it must stay safe to log). The digest must be
 * **collision-resistant** — a collision would hand two configs with different
 * passwords the same key, and thus one config the other's already-authenticated
 * socket. SHA-256 is that primitive; a non-cryptographic log fingerprint is
 * deliberately NOT reused here — a log fingerprint tolerates collisions, a
 * credential boundary does not.
 *
 * `@std/crypto`'s `digestSync` (WASM-backed) keeps the caller — and any `Map`
 * memo it feeds — synchronous, so the lookup stays race-free by construction; an
 * async key would reintroduce a construction race.
 *
 * @param input - The string to digest (the Redis password).
 * @returns The 64-character lowercase hex SHA-256 digest.
 * @example
 * ```typescript
 * const key = `redis:${host}:${port}:${db}:${sha256Hex(password)}`
 * ```
 */
export function sha256Hex(input: string): string {
    const digest = crypto.subtle.digestSync(
        'SHA-256',
        new TextEncoder().encode(input),
    )
    return Array.from(
        new Uint8Array(digest),
        (b) => b.toString(16).padStart(2, '0'),
    ).join('')
}

/**
 * The canonical connection-memo key for a {@link RedisClientConfig}.
 *
 * `host:port:db` identify the resource; the password digest keeps two
 * different-credential configs on the same host from collapsing onto one
 * authenticated socket, without the cleartext ever entering the (loggable) key
 * (FR-015). TLS is folded in too, since a TLS and a plaintext socket to the same
 * endpoint are distinct resources.
 *
 * @param config - The client configuration to key.
 * @returns A stable, log-safe key string.
 * @example
 * ```typescript
 * redisMemoKey({ hostname: 'h', port: 6379, db: 0, password: 's3cret' })
 * // "redis:h:6379:0:plain:<sha256(s3cret)>"
 * ```
 */
export function redisMemoKey(config: RedisClientConfig): string {
    const scheme = config.tls ? 'tls' : 'plain'
    return `redis:${config.hostname}:${config.port ?? 6379}:${
        config.db ?? 0
    }:${scheme}:${sha256Hex(config.password ?? '')}`
}
