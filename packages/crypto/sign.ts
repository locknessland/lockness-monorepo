/**
 * @fileoverview `sign` / `verify` — HMAC-SHA-256 over a message, keyed by a
 * `APP_KEY`-derived value with its **own** HKDF `info` (distinct from `Crypt`'s
 * and the session cookie's — security S6). The primitive signed URLs are built
 * on.
 *
 * @module @lockness/crypto/sign
 * @since 0.2.1
 */

import { HKDF_INFO, resolveAppKey } from './key.ts'

const INFO = new TextEncoder().encode(HKDF_INFO.sign)

function b64urlEncode(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll(
        '=',
        '',
    )
}

function b64urlDecode(value: string): Uint8Array {
    const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + pad)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

async function hmacKey(override?: string): Promise<CryptoKey> {
    const keyBytes = resolveAppKey(override)
    const material = await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        'HKDF',
        false,
        ['deriveKey'],
    )
    return await crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: INFO },
        material,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
    )
}

/**
 * Sign a message, returning a base64url HMAC-SHA-256 tag.
 *
 * @param message - The message to authenticate.
 * @param key - An explicit key; defaults to `APP_KEY`.
 * @returns The base64url signature.
 * @throws {KeyMaterialError} In production when no usable key is set.
 *
 * @example
 * ```typescript
 * const sig = await sign('/verify?id=1&expires=1780000000')
 * ```
 */
export async function sign(message: string, key?: string): Promise<string> {
    const cryptoKey = await hmacKey(key)
    const tag = new Uint8Array(
        await crypto.subtle.sign(
            'HMAC',
            cryptoKey,
            new TextEncoder().encode(message),
        ),
    )
    return b64urlEncode(tag)
}

/**
 * Verify a message against a signature, timing-safely (WebCrypto `verify`).
 *
 * @param message - The message.
 * @param signature - The base64url signature from {@link sign}.
 * @param key - An explicit key; defaults to `APP_KEY`.
 * @returns `true` when the signature is valid.
 *
 * @example
 * ```typescript
 * const ok = await verify(message, sig)
 * ```
 */
export async function verify(
    message: string,
    signature: string,
    key?: string,
): Promise<boolean> {
    let tag: Uint8Array
    try {
        tag = b64urlDecode(signature)
    } catch {
        return false
    }
    const cryptoKey = await hmacKey(key)
    return await crypto.subtle.verify(
        'HMAC',
        cryptoKey,
        tag as BufferSource,
        new TextEncoder().encode(message),
    )
}
