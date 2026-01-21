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
    /** Number of PBKDF2 iterations (default: 100000, OWASP 2023 recommendation) */
    iterations?: number
    /** Hash algorithm (default: 'SHA-256') */
    hashAlgorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
}

/**
 * Default configuration (OWASP 2023 recommendations)
 */
const DEFAULT_CONFIG: Required<PasswordHashConfig> = {
    saltLength: 16,
    keyLength: 32,
    iterations: 100000, // OWASP recommends 100k+ for PBKDF2-SHA256
    hashAlgorithm: 'SHA-256',
}

let globalConfig: Required<PasswordHashConfig> = { ...DEFAULT_CONFIG }

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
    const encoder = new TextEncoder()
    const salt = crypto.getRandomValues(new Uint8Array(cfg.saltLength))

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
    )

    const hash = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations: cfg.iterations,
            hash: cfg.hashAlgorithm,
        },
        keyMaterial,
        cfg.keyLength * 8,
    )

    // Combine salt + hash and encode as base64
    const combined = new Uint8Array(cfg.saltLength + cfg.keyLength)
    combined.set(salt)
    combined.set(new Uint8Array(hash), cfg.saltLength)

    return btoa(String.fromCharCode(...combined))
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
        const cfg = { ...globalConfig, ...config }
        const encoder = new TextEncoder()
        const combined = new Uint8Array(
            atob(storedHash)
                .split('')
                .map((c) => c.charCodeAt(0)),
        )

        const salt = combined.slice(0, cfg.saltLength)
        const originalHash = combined.slice(cfg.saltLength)

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits'],
        )

        const newHash = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt,
                iterations: cfg.iterations,
                hash: cfg.hashAlgorithm,
            },
            keyMaterial,
            cfg.keyLength * 8,
        )

        // Constant-time comparison
        const newHashArray = new Uint8Array(newHash)
        if (originalHash.length !== newHashArray.length) return false

        let result = 0
        for (let i = 0; i < originalHash.length; i++) {
            result |= originalHash[i] ^ newHashArray[i]
        }

        return result === 0
    } catch {
        return false
    }
}
