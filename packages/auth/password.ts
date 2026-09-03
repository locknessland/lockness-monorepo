/**
 * @fileoverview Password hashing utilities.
 *
 * Provides secure password hashing and verification using PBKDF2.
 * Follows OWASP 2023 recommendations for iteration counts.
 *
 * @module @lockness/auth/password
 */

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

let globalConfig: Required<PasswordHashConfig> = { ...DEFAULT_CONFIG }

/**
 * Encode raw bytes as base64.
 *
 * @param bytes - The bytes to encode.
 * @returns The base64 string.
 */
function toBase64(bytes: Uint8Array): string {
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    return btoa(binary)
}

/**
 * Decode base64 back to raw bytes.
 *
 * @param b64 - The base64 string.
 * @returns The decoded bytes.
 */
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

/**
 * Derive PBKDF2 bits for `password` under the given parameters.
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
    salt: Uint8Array<ArrayBuffer>,
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
        { name: 'PBKDF2', salt, iterations, hash: hashAlgorithm },
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
 * Hash a password using PBKDF2
 *
 * @param password - Plain text password to hash
 * @param config - Optional configuration overrides (falls back to global config)
 * @returns Base64-encoded hash with embedded salt
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
    const salt = crypto.getRandomValues(new Uint8Array(cfg.saltLength))
    const hash = await deriveBits(
        password,
        salt,
        cfg.iterations,
        cfg.hashAlgorithm,
        cfg.keyLength,
    )

    // Self-describing PHC-like string: the parameters travel with the hash, so
    // the default cost can be raised without invalidating stored hashes (#168).
    return [
        PBKDF2_SCHEME,
        cfg.hashAlgorithm,
        cfg.iterations,
        toBase64(salt),
        toBase64(hash),
    ].join('$')
}

/**
 * @param password - Plain text password to verify
 * @param storedHash - Previously hashed password
 * @param config - Optional configuration overrides (must match the config used during hashing)
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
    try {
        if (storedHash.includes('$')) {
            // Self-describing format: read every parameter from the hash, so
            // verification never depends on the current global config matching.
            const [scheme, hashAlgorithm, iterationsRaw, saltB64, hashB64] =
                storedHash.split('$')
            if (scheme !== PBKDF2_SCHEME || !saltB64 || !hashB64) return false
            const iterations = Number.parseInt(iterationsRaw, 10)
            if (!Number.isInteger(iterations) || iterations <= 0) return false
            const salt = fromBase64(saltB64)
            const originalHash = fromBase64(hashB64)
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
        const combined = fromBase64(storedHash)
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
    } catch {
        return false
    }
}
