/**
 * @fileoverview The application key contract — what `APP_KEY` must be, and the
 * **one** place in the framework that decides it.
 *
 * **Why here, in the foundation.** Both `@lockness/session` (cookie sealing) and
 * `@lockness/crypto` (`Crypt`/`Hash`/`sign`) need the same guarantee about the
 * same secret; a session-less app that uses only `Crypt` must not run on a
 * weaker validator than a session app. `@lockness/contract` imports nothing from
 * the workspace, so it is the only place both can share without a cycle — the
 * same reason `safeForLog` lives here. `@lockness/session`'s `secret.ts`
 * delegates to {@link resolveKeyMaterial}; it is not a second validator.
 *
 * **What this establishes, and what it does not.** It establishes *shape*:
 * `base64:` + exactly 32 decoded bytes, and refuses the framework's shipped
 * placeholder keys and the degenerate one-byte-repeated case. It does **not**
 * establish entropy — no parse can — so {@link generateAppKey} exists so an
 * operator never has to hand-pick one.
 *
 * **The value never leaves.** {@link KeyMaterialError} cannot be constructed with
 * the secret — not by convention, its constructor does not accept one — so no
 * message, stack, or log aggregator entry can carry it, nor its length.
 *
 * @module @lockness/contract/crypto_key
 * @since 0.2.2
 */

/** Why a key was refused. Carries no part of the value. */
export type KeyRejection =
    | 'missing'
    | 'not-prefixed'
    | 'not-base64'
    | 'wrong-length'
    | 'degenerate'
    | 'known-placeholder'

/** The declared-key-material prefix. */
export const KEY_PREFIX = 'base64:'

/** The exact decoded size of a usable key. AES-256 wants 32 bytes. */
export const KEY_BYTES = 32

/**
 * Every placeholder key this project has shipped. The shape check refuses them
 * all anyway; this list lets the error *name* the mistake and lets the
 * tree-wide grep test keep a placeholder from creeping back into a stub or doc.
 */
export const REJECTED_KEYS: readonly string[] = [
    'change-me-in-production',
    'your-secret-key-here-change-in-production',
    'your-secret-key-here',
    'production-secret-key',
    'a-very-long-secret-key-32-chars',
    'your-32-char-secret-key-here!!!',
    'your-32-character-secret-key!',
    'your-secret-key-min-32-chars!!!',
    'change_me',
    'jwt-secret',
    'your-secret',
]

const REASONS: Record<KeyRejection, string> = {
    missing: 'no application key was provided',
    'not-prefixed': `an application key must start with "${KEY_PREFIX}"`,
    'not-base64': 'the application key is not valid base64',
    'wrong-length':
        `an application key must decode to exactly ${KEY_BYTES} bytes`,
    degenerate: 'the application key is a single byte repeated 32 times',
    'known-placeholder':
        'the application key is one of the placeholders this framework ships; it is public',
}

/**
 * An `APP_KEY` was absent or unusable. **The value is not a constructor
 * parameter**, so no message, stack, or aggregator entry can carry it.
 *
 * @example
 * ```typescript
 * throw new KeyMaterialError('missing')
 * ```
 */
export class KeyMaterialError extends Error {
    /** Why it was refused. */
    readonly reason: KeyRejection

    /**
     * @param reason - Why the key was refused.
     */
    constructor(reason: KeyRejection) {
        super(
            `Application key rejected: ${REASONS[reason]}. ` +
                `Set APP_KEY to "${KEY_PREFIX}<${KEY_BYTES} random bytes, base64>".`,
        )
        this.name = 'KeyMaterialError'
        this.reason = reason
    }
}

/**
 * Base64-encode bytes without spreading them (avoids the `fromCharCode` arg
 * ceiling on large inputs).
 *
 * @param bytes - The bytes to encode.
 * @returns Standard base64.
 *
 * @example
 * ```typescript
 * encodeBase64(new Uint8Array([1, 2, 3]))
 * ```
 */
export function encodeBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(
            ...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)),
        )
    }
    return btoa(binary)
}

/**
 * Decode standard base64 to bytes.
 *
 * @param value - The base64 text.
 * @returns The decoded bytes.
 * @throws {DOMException} When `value` is not valid base64.
 *
 * @example
 * ```typescript
 * decodeBase64('AQID')
 * ```
 */
export function decodeBase64(value: string): Uint8Array {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

/**
 * Generate a usable application key — the **only** key generator in the
 * framework, so length and encoding cannot drift between callers.
 *
 * @returns A key of the exact shape {@link resolveKeyMaterial} accepts.
 *
 * @example
 * ```typescript
 * await Deno.writeTextFile('.env', `APP_KEY=${generateAppKey()}\n`)
 * ```
 */
export function generateAppKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES))
    return KEY_PREFIX + encodeBase64(bytes)
}

/**
 * Resolve `APP_KEY` to 32 bytes of key material, or refuse it. **The single
 * decider** for "is this key usable" — `@lockness/session` and
 * `@lockness/crypto` both call this rather than testing the value themselves.
 *
 * @param secret - The candidate, or `undefined` when nothing was configured.
 * @returns The 32 decoded key bytes.
 * @throws {KeyMaterialError} When the key is absent or not usable material.
 *
 * @example
 * ```typescript
 * const keyBytes = resolveKeyMaterial(Deno.env.get('APP_KEY'))
 * ```
 */
export function resolveKeyMaterial(secret: string | undefined): Uint8Array {
    if (!secret) throw new KeyMaterialError('missing')
    if (REJECTED_KEYS.includes(secret)) {
        throw new KeyMaterialError('known-placeholder')
    }
    if (!secret.startsWith(KEY_PREFIX)) {
        throw new KeyMaterialError('not-prefixed')
    }

    let bytes: Uint8Array
    try {
        bytes = decodeBase64(secret.slice(KEY_PREFIX.length))
    } catch {
        throw new KeyMaterialError('not-base64')
    }

    if (bytes.byteLength !== KEY_BYTES) {
        throw new KeyMaterialError('wrong-length')
    }
    if (bytes.every((byte) => byte === bytes[0])) {
        // Shape-valid and worthless — the one specific mistake of padding a
        // value out to 32 bytes. NOT an entropy test; no parse can be one.
        throw new KeyMaterialError('degenerate')
    }

    return bytes
}
