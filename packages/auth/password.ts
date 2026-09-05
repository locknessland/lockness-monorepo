/**
 * @fileoverview Password hashing utilities.
 *
 * Hashing and verification are PBKDF2, and the single-home implementation of
 * that primitive is `@lockness/crypto`'s {@link Hash} facade. At auth's default
 * configuration the two produce a byte-identical self-describing string
 * (`pbkdf2$SHA-256$<iterations>$<salt>$<hash>`), so this module delegates the
 * default hash and every SHA-256 verification to the facade — the hashing
 * primitive is owned in one place, not duplicated here.
 *
 * Two capabilities the parameter-less facade does not expose stay local, by
 * design: the configurable-parameter API ({@link configurePasswordHashing} —
 * custom iteration counts, algorithms, salt/key lengths) and verification of
 * the legacy parameter-less format. Both remain fully backward compatible.
 *
 * Follows OWASP 2023 recommendations for iteration counts.
 *
 * @module @lockness/auth/password
 */

import { decodeBase64, encodeBase64 } from '@lockness/contract'
import { Hash } from '@lockness/crypto'

/**
 * Configuration for password hashing
 */
export interface PasswordHashConfig {
    /** Salt length in bytes (default: 16) */
    saltLength?: number
    /** Key length in bytes (default: 32) */
    keyLength?: number
    /** Number of PBKDF2 iterations (default: 600000, OWASP guidance for PBKDF2-SHA256) */
    iterations?: number
    /** Hash algorithm (default: 'SHA-256') */
    hashAlgorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
}

/**
 * Default configuration (current OWASP guidance for PBKDF2-SHA256).
 *
 * These values mirror `@lockness/crypto`'s `Hash` facade exactly, which is what
 * lets {@link hashPassword} delegate the default hash to the shared primitive.
 */
const DEFAULT_CONFIG: Required<PasswordHashConfig> = {
    saltLength: 16,
    keyLength: 32,
    iterations: 600000, // OWASP guidance for PBKDF2-HMAC-SHA256
    hashAlgorithm: 'SHA-256',
}

/**
 * The historical default iteration count. Hashes stored in the old
 * parameter-less format carry no `$` and no embedded count, so they are
 * verified at this value (M2, #168) — raising {@link DEFAULT_CONFIG} therefore
 * never strands a hash created before this change.
 */
const LEGACY_ITERATIONS = 100000

/** Scheme tag prefixing every self-describing hash. Base64 never contains `$`. */
const PBKDF2_SCHEME = 'pbkdf2'

/**
 * The derived-key length, in bytes, that `@lockness/crypto`'s `Hash` facade
 * produces. A self-describing SHA-256 hash of this key length is exactly the
 * facade's format and is verified through it; anything else came from the
 * configurable local API and is verified locally.
 */
const CRYPTO_KEY_BYTES = 32

let globalConfig: Required<PasswordHashConfig> = { ...DEFAULT_CONFIG }

/**
 * Whether an effective config is byte-for-byte the shape `@lockness/crypto`'s
 * `Hash.make` emits, so hashing can be delegated to the shared primitive.
 *
 * @param cfg - The resolved (global + override) configuration.
 * @returns `true` when every parameter matches the facade's fixed values.
 */
function matchesCryptoFacade(cfg: Required<PasswordHashConfig>): boolean {
    return cfg.hashAlgorithm === 'SHA-256' &&
        cfg.iterations === DEFAULT_CONFIG.iterations &&
        cfg.saltLength === DEFAULT_CONFIG.saltLength &&
        cfg.keyLength === CRYPTO_KEY_BYTES
}

/**
 * Derive PBKDF2 bits for `password` under the given parameters.
 *
 * Retained for the two paths the parameter-less `@lockness/crypto` facade does
 * not cover: hashing at a non-default configuration, and verifying legacy or
 * non-SHA-256 self-describing hashes.
 *
 * @param password - The plain-text password.
 * @param salt - The per-hash salt.
 * @param iterations - The PBKDF2 iteration count.
 * @param hashAlgorithm - The underlying digest (e.g. `SHA-256`).
 * @param keyLengthBytes - The derived-key length in bytes.
 * @returns The derived key bytes.
 */
async function deriveBits(
    password: string,
    salt: Uint8Array,
    iterations: number,
    hashAlgorithm: string,
    keyLengthBytes: number,
): Promise<Uint8Array> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt as BufferSource,
            iterations,
            hash: hashAlgorithm,
        },
        keyMaterial,
        keyLengthBytes * 8,
    )
    return new Uint8Array(bits)
}

/**
 * Constant-time equality for two byte arrays.
 *
 * @param a - First array.
 * @param b - Second array.
 * @returns `true` when equal in length and content.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    let result = 0
    for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i]
    return result === 0
}

/**
 * Configure password hashing parameters
 *
 * @example
 * ```typescript
 * // Increase security (slower but more secure)
 * configurePasswordHashing({
 *   iterations: 500000,
 *   hashAlgorithm: 'SHA-512'
 * })
 *
 * // For development/testing (faster but less secure)
 * configurePasswordHashing({
 *   iterations: 10000
 * })
 * ```
 */
export function configurePasswordHashing(config: PasswordHashConfig): void {
    globalConfig = { ...globalConfig, ...config }
}

/**
 * Get current password hashing configuration
 */
export function getPasswordHashingConfig(): Readonly<
    Required<PasswordHashConfig>
> {
    return { ...globalConfig }
}

/**
 * Reset configuration to defaults
 */
export function resetPasswordHashingConfig(): void {
    globalConfig = { ...DEFAULT_CONFIG }
}

/**
 * Hash a password using PBKDF2.
 *
 * At the default configuration this delegates to `@lockness/crypto`'s
 * {@link Hash.make}, the single-home implementation of the primitive; a custom
 * configuration (which the parameter-less facade does not accept) is derived
 * locally into the same self-describing format.
 *
 * @param password - Plain text password to hash
 * @param config - Optional configuration overrides (falls back to global config)
 * @returns A self-describing `pbkdf2$<algo>$<iterations>$<salt>$<hash>` string
 *
 * @example
 * ```typescript
 * const hash = await hashPassword('myPassword123')
 *
 * // With custom config for this hash only
 * const strongHash = await hashPassword('admin', { iterations: 500000 })
 * ```
 */
export async function hashPassword(
    password: string,
    config?: PasswordHashConfig,
): Promise<string> {
    const cfg = { ...globalConfig, ...config }

    // Default configuration → the shared crypto primitive owns the format.
    if (matchesCryptoFacade(cfg)) {
        return await Hash.make(password)
    }

    // Custom parameters the facade does not expose: derive locally, emitting the
    // identical self-describing layout so the parameters travel with the hash.
    const salt = crypto.getRandomValues(new Uint8Array(cfg.saltLength))
    const hash = await deriveBits(
        password,
        salt,
        cfg.iterations,
        cfg.hashAlgorithm,
        cfg.keyLength,
    )
    return [
        PBKDF2_SCHEME,
        cfg.hashAlgorithm,
        cfg.iterations,
        encodeBase64(salt),
        encodeBase64(hash),
    ].join('$')
}

/**
 * Verify a password against a previously stored hash.
 *
 * Self-describing SHA-256 hashes of the facade's key length — every hash auth
 * produces at its default config, and every hash any prior version produced —
 * are verified through `@lockness/crypto`'s {@link Hash.check}, which reads the
 * iteration count and salt from the string. Non-SHA-256 or non-default-key-length
 * self-describing hashes (from the configurable API) and legacy parameter-less
 * hashes are verified locally, so no stored hash is ever stranded.
 *
 * @param password - Plain text password to verify
 * @param storedHash - Previously hashed password
 * @param config - Optional configuration overrides (applies only to the legacy
 * parameter-less format; self-describing hashes carry their own parameters)
 * @returns True if password matches the hash
 *
 * @example
 * ```typescript
 * const hash = await hashPassword('myPassword123')
 * const isValid = await verifyPassword('myPassword123', hash) // true
 * const isInvalid = await verifyPassword('wrongPassword', hash) // false
 * ```
 */
export async function verifyPassword(
    password: string,
    storedHash: string,
    config?: PasswordHashConfig,
): Promise<boolean> {
    if (storedHash.includes('$')) {
        // Self-describing format: every parameter is read from the hash, so
        // verification never depends on the current global config.
        const parts = storedHash.split('$')
        if (parts.length !== 5) return false
        const [scheme, hashAlgorithm, iterationsRaw, saltB64, hashB64] = parts
        if (scheme !== PBKDF2_SCHEME || !saltB64 || !hashB64) return false

        let salt: Uint8Array
        let originalHash: Uint8Array
        try {
            salt = decodeBase64(saltB64)
            originalHash = decodeBase64(hashB64)
        } catch {
            // A malformed hash cannot match any password; deny it. This is the
            // predicate's contract, not the swallowing of an unexpected error.
            return false
        }

        // The crypto facade owns exactly PBKDF2-SHA-256 with a 32-byte key —
        // let the single-home primitive verify anything in that shape.
        if (
            hashAlgorithm === 'SHA-256' &&
            originalHash.length === CRYPTO_KEY_BYTES
        ) {
            return await Hash.check(password, storedHash)
        }

        // Otherwise the hash came from the configurable local API (custom
        // algorithm or key length); verify at its embedded parameters.
        const iterations = Number.parseInt(iterationsRaw, 10)
        if (!Number.isInteger(iterations) || iterations <= 0) return false
        const newHash = await deriveBits(
            password,
            salt,
            iterations,
            hashAlgorithm,
            originalHash.length,
        )
        return timingSafeEqual(originalHash, newHash)
    }

    // Legacy parameter-less format: base64(salt + hash) at the historical
    // defaults. An explicit `config` still overrides them.
    const cfg = {
        ...DEFAULT_CONFIG,
        iterations: LEGACY_ITERATIONS,
        ...config,
    }
    let combined: Uint8Array
    try {
        combined = decodeBase64(storedHash)
    } catch {
        // Not valid base64 → cannot match; deny without surfacing an error.
        return false
    }
    const salt = combined.slice(0, cfg.saltLength)
    const originalHash = combined.slice(cfg.saltLength)
    const newHash = await deriveBits(
        password,
        salt,
        cfg.iterations,
        cfg.hashAlgorithm,
        originalHash.length,
    )
    return timingSafeEqual(originalHash, newHash)
}
