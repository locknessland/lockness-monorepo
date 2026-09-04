/**
 * @fileoverview `Hash` — a password-grade one-way hash for arbitrary secrets
 * (API keys, tokens), independent of `APP_KEY`.
 *
 * PBKDF2-SHA-256 at ≥600k iterations (OWASP), a **random per-hash salt**, and a
 * **self-describing PHC-like output** so parameters travel with the hash and can
 * evolve. **No `APP_KEY` pepper** (security S9): a key-derived pepper would make
 * key rotation a data-loss migration and cannot live in the self-describing
 * string. Mirrors `@lockness/auth`'s `password.ts` construction; that package
 * converges onto this one in a follow-up.
 *
 * @module @lockness/crypto/hash
 * @since 0.2.1
 */

import { decodeBase64, encodeBase64 } from '@lockness/contract'

const ALGO = 'SHA-256'
const ITERATIONS = 600_000
const SALT_BYTES = 16
const KEY_BYTES = 32

/** Output shape: `pbkdf2$<algo>$<iterations>$<saltB64>$<hashB64>`. */
const SCHEME = 'pbkdf2'

async function deriveBits(
    value: string,
    salt: Uint8Array,
    iterations: number,
): Promise<Uint8Array> {
    const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(value),
        'PBKDF2',
        false,
        ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            hash: ALGO,
            salt: salt as BufferSource,
            iterations,
        },
        material,
        KEY_BYTES * 8,
    )
    return new Uint8Array(bits)
}

/** Constant-time comparison — no early return on length or first difference. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
    return diff === 0
}

/**
 * Hash a value into a self-describing PHC-like string.
 *
 * @param value - The value to hash.
 * @returns `pbkdf2$SHA-256$600000$<salt>$<hash>`.
 *
 * @example
 * ```typescript
 * const stored = await Hash.make(apiKey)
 * ```
 */
async function make(value: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
    const hash = await deriveBits(value, salt, ITERATIONS)
    return `${SCHEME}$${ALGO}$${ITERATIONS}$${encodeBase64(salt)}$${
        encodeBase64(hash)
    }`
}

/**
 * Verify a value against a {@link make} hash, timing-safely.
 *
 * @param value - The candidate value.
 * @param stored - The stored hash string.
 * @returns `true` when the value matches.
 *
 * @example
 * ```typescript
 * const ok = await Hash.check(candidate, stored)
 * ```
 */
async function check(value: string, stored: string): Promise<boolean> {
    const parts = stored.split('$')
    if (parts.length !== 5 || parts[0] !== SCHEME) return false
    const [, algo, itersRaw, saltB64, hashB64] = parts
    if (algo !== ALGO) return false
    const iterations = Number(itersRaw)
    if (!Number.isInteger(iterations) || iterations < 1) return false

    let salt: Uint8Array
    let expected: Uint8Array
    try {
        salt = decodeBase64(saltB64)
        expected = decodeBase64(hashB64)
    } catch {
        return false
    }
    const actual = await deriveBits(value, salt, iterations)
    return timingSafeEqual(actual, expected)
}

/**
 * Whether a stored hash should be re-hashed (its parameters are below current).
 *
 * @param stored - The stored hash string.
 * @returns `true` when the hash is missing, malformed, or below current parameters.
 *
 * @example
 * ```typescript
 * if (Hash.needsRehash(stored)) stored = await Hash.make(value)
 * ```
 */
function needsRehash(stored: string): boolean {
    const parts = stored.split('$')
    if (parts.length !== 5 || parts[0] !== SCHEME) return true
    if (parts[1] !== ALGO) return true
    const iterations = Number(parts[2])
    return !Number.isInteger(iterations) || iterations < ITERATIONS
}

/** The `Hash` facade — password-grade PBKDF2 make/check/needsRehash. */
export const Hash: {
    make: typeof make
    check: typeof check
    needsRehash: typeof needsRehash
} = { make, check, needsRehash }
