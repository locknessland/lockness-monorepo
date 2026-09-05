/**
 * @fileoverview The connection-memo key discipline for Redis clients.
 *
 * A memoized {@link RedisClient} is shared across a process, so the key that
 * identifies "the same connection" must fold the password — two configs with
 * different credentials must never collapse onto one authenticated socket —
 * WITHOUT ever placing a value in the key from which the cleartext credential
 * could be recovered, even if the key were logged (FR-015, #248).
 *
 * The credential is therefore folded through {@link credentialFingerprint}: an
 * HMAC-SHA256 under a **per-process random key**, not a bare SHA-256. A bare
 * SHA-256 of a low-entropy password is offline-brute-forceable from a single
 * leaked hash; a keyed HMAC is not, because the attacker never sees the
 * per-process key (which exists only in memory and differs every run).
 * {@link redisMemoKey} is the assembled key. A consumer that keys on a richer
 * config (the session driver keys on its own `SessionConfig`) imports
 * {@link credentialFingerprint} and builds its own key with the same discipline.
 *
 * @module @lockness/redis/memo
 */

import { crypto } from '@std/crypto'
import type { RedisClientConfig } from './client.ts'

/** The SHA-256 block size in bytes — the HMAC key is padded to this width. */
const SHA256_BLOCK_SIZE = 64

/**
 * The per-process random key that turns the credential digest from a bare
 * SHA-256 (offline-brute-forceable) into a keyed HMAC. Generated once at module
 * load and never exported: it lives only in this process's memory and differs
 * on every run, so a fingerprint that leaks into a log cannot be reversed by an
 * attacker hashing candidate passwords. Stable within the process, so the memo
 * stays consistent for the life of the process.
 */
const PROCESS_CREDENTIAL_KEY: Uint8Array<ArrayBuffer> = new Uint8Array(32)
globalThis.crypto.getRandomValues(PROCESS_CREDENTIAL_KEY)

/** Lowercase-hex encoding of a byte array. */
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The raw SHA-256 digest of a byte array, computed synchronously.
 *
 * `@std/crypto`'s `digestSync` (WASM-backed) keeps the caller — and any `Map`
 * memo it feeds — synchronous, so a memo lookup stays race-free by construction;
 * an async key would reintroduce a construction race.
 */
function sha256Bytes(input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    return new Uint8Array(crypto.subtle.digestSync('SHA-256', input))
}

/**
 * A hex SHA-256 digest of a string, computed synchronously.
 *
 * An **unkeyed**, collision-resistant digest — a general-purpose fingerprint,
 * NOT a credential-folding primitive. Do not use it to fold a secret into a key
 * that might be logged: an unsalted SHA-256 of a low-entropy secret is
 * offline-brute-forceable from the hash alone. Use {@link credentialFingerprint}
 * for credentials.
 *
 * @param input - The string to digest.
 * @returns The 64-character lowercase hex SHA-256 digest.
 * @example
 * ```typescript
 * const fingerprint = sha256Hex(someNonSecretIdentifier)
 * ```
 */
export function sha256Hex(input: string): string {
    return toHex(sha256Bytes(new TextEncoder().encode(input)))
}

/**
 * HMAC-SHA256 of `message` under `key`, as lowercase hex, computed
 * synchronously.
 *
 * A hand-rolled HMAC (RFC 2104) over the synchronous {@link sha256Bytes}, so the
 * whole memo-key path stays synchronous — WebCrypto's `crypto.subtle.sign` is
 * async and would ripple through every synchronous `Map` memo that keys on a
 * config. It exists so {@link credentialFingerprint} can key its digest, and is
 * cross-checked against WebCrypto in the tests. Re-exported from `mod.ts` so
 * `@lockness/realtime` can key its control/presence authenticity MAC (FR-015,
 * #268) with a **shared per-deployment** secret — a cross-instance-stable HMAC,
 * unlike {@link credentialFingerprint}'s per-process key which is deliberately
 * process-local and therefore unusable across instances.
 *
 * @param key - The HMAC key bytes; keys longer than the block size are hashed
 *   down first, per RFC 2104.
 * @param message - The message bytes to authenticate.
 * @returns The 64-character lowercase hex HMAC-SHA256 digest.
 * @example
 * ```typescript
 * const mac = hmacSha256Hex(keyBytes, new TextEncoder().encode('payload'))
 * ```
 */
export function hmacSha256Hex(
    key: Uint8Array<ArrayBuffer>,
    message: Uint8Array<ArrayBuffer>,
): string {
    // RFC 2104: a key longer than the block size is replaced by its hash.
    const normalizedKey = key.length > SHA256_BLOCK_SIZE
        ? sha256Bytes(key)
        : key
    const block = new Uint8Array(SHA256_BLOCK_SIZE)
    block.set(normalizedKey)

    const inner = new Uint8Array(SHA256_BLOCK_SIZE + message.length)
    const outerPad = new Uint8Array(SHA256_BLOCK_SIZE)
    for (let i = 0; i < SHA256_BLOCK_SIZE; i++) {
        inner[i] = block[i] ^ 0x36 // ipad
        outerPad[i] = block[i] ^ 0x5c // opad
    }
    inner.set(message, SHA256_BLOCK_SIZE)
    const innerDigest = sha256Bytes(inner)

    const outer = new Uint8Array(SHA256_BLOCK_SIZE + innerDigest.length)
    outer.set(outerPad)
    outer.set(innerDigest, SHA256_BLOCK_SIZE)
    return toHex(sha256Bytes(outer))
}

/**
 * A log-safe fingerprint of a credential, for folding a password into a
 * connection-memo key.
 *
 * HMAC-SHA256 of the secret under a **per-process random key**, so the digest is
 * NOT a bare SHA-256 an attacker could brute-force offline from a leaked log
 * line — reversing it would require the per-process key, which never leaves
 * memory and differs every run. Stable within the process (same secret → same
 * fingerprint), so two different-credential configs still resolve to different
 * keys and never collapse onto one authenticated socket; deliberately NOT stable
 * across processes, which is irrelevant because memo maps are per-process.
 *
 * @param secret - The credential to fold (e.g. a Redis password).
 * @returns A 64-character lowercase hex, keyed fingerprint of the secret.
 * @example
 * ```typescript
 * const key = `redis:${host}:${port}:${db}:${credentialFingerprint(password)}`
 * ```
 */
export function credentialFingerprint(secret: string): string {
    return hmacSha256Hex(
        PROCESS_CREDENTIAL_KEY,
        new TextEncoder().encode(secret),
    )
}

/**
 * The canonical connection-memo key for a {@link RedisClientConfig}.
 *
 * `host:port:db` identify the resource; the password is folded through
 * {@link credentialFingerprint} (a per-process-keyed HMAC) so two
 * different-credential configs on the same host never collapse onto one
 * authenticated socket, and so no value from which the cleartext could be
 * recovered ever enters the (potentially loggable) key (FR-015, #248). TLS is
 * folded in too, since a TLS and a plaintext socket to the same endpoint are
 * distinct resources.
 *
 * @param config - The client configuration to key.
 * @returns A stable, log-safe key string.
 * @example
 * ```typescript
 * redisMemoKey({ hostname: 'h', port: 6379, db: 0, password: 's3cret' })
 * // "redis:h:6379:0:plain:<hmac(s3cret)>"
 * ```
 */
export function redisMemoKey(config: RedisClientConfig): string {
    const scheme = config.tls ? 'tls' : 'plain'
    return `redis:${config.hostname}:${config.port ?? 6379}:${
        config.db ?? 0
    }:${scheme}:${credentialFingerprint(config.password ?? '')}`
}
