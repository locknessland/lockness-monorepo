/**
 * @fileoverview Key material for the crypto facades — reads `APP_KEY` through the
 * single-home validator in `@lockness/contract` and applies the fail-closed
 * production rule.
 *
 * **Fail closed (security S7).** The per-process ephemeral dev key is used
 * **only on an explicit development signal** (`isExplicitlyDevelopment()`); an
 * unset/ambiguous environment resolves to production, where a missing/invalid
 * `APP_KEY` throws rather than silently running on a throwaway key.
 *
 * **HKDF `info` label registry.** Each primitive derives its key with a distinct
 * `info`, none equal to the session cookie's (`lockness/session/cookie/v1`), so
 * one derived value is never reused across purposes (security S6).
 *
 * @module @lockness/crypto/key
 * @since 0.2.1
 */

import {
    generateAppKey,
    isExplicitlyDevelopment,
    KeyMaterialError,
    resolveKeyMaterial,
} from '@lockness/contract'

/** The HKDF `info` labels — one per derived-key purpose. Never collide. */
export const HKDF_INFO = {
    /** AES-256-GCM key for {@link Crypt}. */
    crypt: 'lockness/crypt/v1',
    /** HMAC-SHA-256 key for {@link sign}. */
    sign: 'lockness/sign/v1',
} as const

let ephemeralKey: Uint8Array | undefined
let warnedEphemeral = false

/**
 * Resolve the application key bytes for a crypto facade.
 *
 * @param override - An explicit key (`base64:`+32), else `APP_KEY` from the env.
 * @returns The 32 key bytes.
 * @throws {KeyMaterialError} In production (or an ambiguous env) when no usable key is set.
 *
 * @example
 * ```typescript
 * const bytes = resolveAppKey() // reads APP_KEY, fails closed in production
 * ```
 */
export function resolveAppKey(override?: string): Uint8Array {
    const candidate = override ?? Deno.env.get('APP_KEY')
    try {
        return resolveKeyMaterial(candidate)
    } catch (error) {
        if (!(error instanceof KeyMaterialError)) throw error
        // Fail closed: only an EXPLICIT development signal earns the ephemeral
        // key; anything else (production, or unset/ambiguous) re-throws.
        if (!isExplicitlyDevelopment()) throw error
        if (!warnedEphemeral) {
            console.warn(
                '⚠️  APP_KEY is unusable; @lockness/crypto is using a per-process ephemeral key. ' +
                    'Encrypted data and signed URLs will not survive a restart. Set APP_KEY for stable crypto.',
            )
            warnedEphemeral = true
        }
        ephemeralKey ??= resolveKeyMaterial(generateAppKey())
        return ephemeralKey
    }
}
