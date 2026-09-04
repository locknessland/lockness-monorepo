/**
 * @fileoverview `Crypt` — authenticated symmetric encryption of arbitrary data,
 * keyed by `APP_KEY`.
 *
 * AES-256-GCM with a **fresh HKDF salt per call** (so each derived key encrypts
 * exactly one message — removing the ~2³² random-IV birthday bound a single-key
 * scheme would face), a random 96-bit IV, and the version prefix fed as GCM
 * `additionalData` (so a future `v2` is not a silent downgrade). Mirrors the
 * proven `@lockness/session` cookie construction, generalised.
 *
 * Wire: `c1.` + base64( salt(16) ‖ iv(12) ‖ ciphertext‖tag ). Tampering fails
 * the GCM tag and {@link decrypt} returns `null` — never partial plaintext.
 *
 * @module @lockness/crypto/crypt
 * @since 0.2.1
 */

import { decodeBase64, encodeBase64 } from '@lockness/contract'
import { HKDF_INFO, resolveAppKey } from './key.ts'

const WIRE_VERSION = 'c1.'
const AAD = new TextEncoder().encode(WIRE_VERSION)
const INFO = new TextEncoder().encode(HKDF_INFO.crypt)
const SALT_BYTES = 16
const IV_BYTES = 12

async function deriveKey(
    keyBytes: Uint8Array,
    salt: Uint8Array,
): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        'HKDF',
        false,
        ['deriveKey'],
    )
    return await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: salt as BufferSource,
            info: INFO,
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    )
}

/**
 * Encrypt a UTF-8 string. Each call uses a fresh salt + IV, so the ciphertext of
 * the same input differs every time.
 *
 * @param plaintext - The string to encrypt.
 * @param key - An explicit key (`base64:`+32); defaults to `APP_KEY`.
 * @returns The versioned, base64 wire string.
 * @throws {KeyMaterialError} In production when no usable key is set.
 *
 * @example
 * ```typescript
 * const token = await Crypt.encrypt(JSON.stringify({ userId: 1 }))
 * ```
 */
async function encrypt(plaintext: string, key?: string): Promise<string> {
    const keyBytes = resolveAppKey(key)
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const cryptoKey = await deriveKey(keyBytes, salt)
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as BufferSource, additionalData: AAD },
            cryptoKey,
            new TextEncoder().encode(plaintext),
        ),
    )
    const combined = new Uint8Array(
        salt.length + iv.length + ciphertext.length,
    )
    combined.set(salt, 0)
    combined.set(iv, salt.length)
    combined.set(ciphertext, salt.length + iv.length)
    return WIRE_VERSION + encodeBase64(combined)
}

/**
 * Decrypt a {@link encrypt} token. Returns `null` on any tampering, a wrong key,
 * a bad version, or a malformed wire — never a partial or unauthenticated
 * plaintext.
 *
 * @param token - The wire string from {@link encrypt}.
 * @param key - An explicit key; defaults to `APP_KEY`.
 * @returns The plaintext, or `null` if it cannot be authenticated.
 *
 * @example
 * ```typescript
 * const plain = await Crypt.decrypt(token)
 * if (plain === null) throw new Error('tampered or wrong key')
 * ```
 */
async function decrypt(token: string, key?: string): Promise<string | null> {
    if (!token.startsWith(WIRE_VERSION)) return null
    let combined: Uint8Array
    try {
        combined = decodeBase64(token.slice(WIRE_VERSION.length))
    } catch {
        return null
    }
    if (combined.length < SALT_BYTES + IV_BYTES) return null

    const salt = combined.subarray(0, SALT_BYTES)
    const iv = combined.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES)
    const ciphertext = combined.subarray(SALT_BYTES + IV_BYTES)

    try {
        const keyBytes = resolveAppKey(key)
        const cryptoKey = await deriveKey(keyBytes, salt)
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as BufferSource, additionalData: AAD },
            cryptoKey,
            ciphertext as BufferSource,
        )
        return new TextDecoder().decode(plain)
    } catch {
        // GCM tag mismatch, wrong key, or an unusable key — no plaintext leaks.
        return null
    }
}

/** The `Crypt` facade — authenticated AES-256-GCM encrypt/decrypt. */
export const Crypt: {
    encrypt: typeof encrypt
    decrypt: typeof decrypt
} = { encrypt, decrypt }
