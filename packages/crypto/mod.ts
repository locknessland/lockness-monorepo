/**
 * @fileoverview `@lockness/crypto` — application cryptography for Lockness.
 *
 * Three facades keyed by `APP_KEY`: {@link Crypt} (authenticated AES-256-GCM
 * encrypt/decrypt of arbitrary data), {@link Hash} (password-grade PBKDF2
 * make/check for arbitrary secrets), and {@link sign}/{@link verify} (HMAC-SHA-256,
 * the primitive signed URLs are built on). The `APP_KEY` validator itself is
 * single-homed in `@lockness/contract` (`resolveKeyMaterial`) and re-exported
 * here for convenience.
 *
 * @module @lockness/crypto
 *
 * @example
 * ```typescript
 * import { Crypt, Hash, sign } from '@lockness/crypto'
 *
 * const token = await Crypt.encrypt('secret data')
 * const hashed = await Hash.make(apiKey)
 * const sig = await sign('/verify?id=1')
 * ```
 */

export { Crypt } from './crypt.ts'
export { Hash } from './hash.ts'
export { sign, verify } from './sign.ts'
export { HKDF_INFO, resolveAppKey } from './key.ts'
export {
    generateAppKey,
    KeyMaterialError,
    resolveKeyMaterial,
} from '@lockness/contract'
