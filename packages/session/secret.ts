/**
 * @fileoverview The session secret contract — what `APP_KEY` must be, and the
 * one place that decides it.
 *
 * **Why a shape and not a length.** The cookie driver derives its AES key with
 * HKDF, which expands key material but does not *stretch* it: a weak input stays
 * weak, and an attacker holding one captured cookie can guess offline at roughly
 * a derivation per microsecond. A character count cannot establish strength —
 * 16 characters is 128 bits only if every character is a uniformly random byte,
 * and a human-chosen one carries closer to 30. So the key must arrive as
 * declared key material: `base64:` followed by exactly 32 decoded bytes. That
 * makes {@link generateAppKey}'s output the natural way to satisfy it.
 *
 * **What this establishes, and what it does not.** It establishes *shape*: the
 * value is 32 bytes and was declared as such. It does **not** establish entropy,
 * and no parse can — `base64:` + a 32-character passphrase passes, as does any
 * 32 bytes an operator chose badly. Only the degenerate case (one byte repeated)
 * is refused, because that is the specific mistake of padding a value out to
 * length. The rest is the operator's to get right, and {@link generateAppKey}
 * exists so they never have to.
 *
 * **Why the value never leaves.** {@link assertUsableSecret} receives the key and
 * throws, at boot, where output is collected by whatever gathers container logs
 * and by whoever pastes a stack trace into an issue. {@link SessionSecretError}
 * therefore cannot be constructed with the value — not by convention, but
 * because its constructor does not accept one. Its *length* is withheld too: a
 * length is key metadata.
 *
 * @module @lockness/session/secret
 * @since 0.2.2
 */

/** Where a secret came from, so an operator knows what to change. */
export type SecretSource = 'config' | 'app-key' | 'generated'

/** Why a secret was refused. Carries no part of the value. */
export type SecretRejection =
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
 * Every placeholder secret this project has shipped.
 *
 * Once {@link assertUsableSecret} requires a declared shape, none of these could
 * pass anyway — the list is what lets the error *name* the mistake, and it is
 * what the tree-wide grep test enumerates so a placeholder cannot creep back
 * into a stub or a doc. Three of these are longer than sixteen characters, which
 * is why a length floor was the wrong control: `a-very-long-secret-key-32-chars`
 * is the session package's own documented example.
 */
export const REJECTED: readonly string[] = [
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

/*
 * `'secret'` is deliberately NOT on that list.
 *
 * It is a legitimate string elsewhere — a DI config value in
 * `@lockness/container`, a `basicAuth` password in `@lockness/hono`'s own
 * examples — so a tree-wide search for it reports fifteen files that have
 * nothing to do with session keys, and a guard that cries wolf is a guard
 * somebody switches off. It cannot pass the shape check regardless: six
 * characters decode to nothing like 32 bytes.
 *
 * That is the division of labour worth remembering. The **shape** is the
 * control; this list only lets an error name the mistake, and lets
 * `no_placeholder_keys.test.ts` find a placeholder somebody pasted back in. An
 * entry too generic to search for makes the second job impossible without
 * helping the first.
 */

const REASONS: Record<SecretRejection, string> = {
    missing: 'no session secret was provided',
    'not-prefixed': `a session secret must start with "${KEY_PREFIX}"`,
    'not-base64': 'the session secret is not valid base64',
    'wrong-length':
        `a session secret must decode to exactly ${KEY_BYTES} bytes`,
    degenerate: 'the session secret is a single byte repeated 32 times',
    'known-placeholder':
        'the session secret is one of the placeholders this framework ships; it is public',
}

const SOURCES: Record<SecretSource, string> = {
    config: 'the session configuration',
    'app-key': 'the APP_KEY environment variable',
    generated: 'a generated key',
}

/**
 * A session secret was absent or unusable.
 *
 * **The value is not a constructor parameter.** Nothing that constructs this
 * error can attach the secret to it, so no message, stack or aggregator entry
 * can carry one.
 *
 * @example
 * ```typescript
 * throw new SessionSecretError('missing', 'app-key')
 * ```
 */
export class SessionSecretError extends Error {
    /** Why it was refused. */
    readonly reason: SecretRejection
    /** Where it came from. */
    readonly source: SecretSource

    /**
     * @param reason - Why the secret was refused.
     * @param source - Where the secret came from.
     */
    constructor(reason: SecretRejection, source: SecretSource) {
        super(
            `Session secret rejected: ${REASONS[reason]} (from ${
                SOURCES[source]
            }). ` +
                `Set APP_KEY to a value of the form "${KEY_PREFIX}<${KEY_BYTES} random bytes, base64>".`,
        )
        this.name = 'SessionSecretError'
        this.reason = reason
        this.source = source
    }
}

/**
 * Generate a usable application key.
 *
 * The **only** key generator in the framework: core's development fallback and
 * `lockness init`'s scaffolding both call this one, so the length and encoding
 * cannot drift apart between them.
 *
 * @returns A key of the exact shape {@link assertUsableSecret} accepts.
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
 * Parse a session secret, or refuse it.
 *
 * This is the **single** decider for "is this secret usable". Every gate — the
 * cookie driver, the bootstrap step — calls it rather than testing the secret
 * itself; a second test is a second decider, and they agree only until one
 * changes.
 *
 * @param secret - The candidate, or `undefined` when nothing was configured.
 * @param source - Where it came from, for the error message.
 * @returns The 32 decoded key bytes.
 * @throws {SessionSecretError} When the secret is absent or not key material.
 *
 * @example
 * ```typescript
 * const keyBytes = assertUsableSecret(Deno.env.get('APP_KEY'), 'app-key')
 * ```
 */
export function assertUsableSecret(
    secret: string | undefined,
    source: SecretSource,
): Uint8Array {
    if (!secret) throw new SessionSecretError('missing', source)
    if (REJECTED.includes(secret)) {
        throw new SessionSecretError('known-placeholder', source)
    }
    if (!secret.startsWith(KEY_PREFIX)) {
        throw new SessionSecretError('not-prefixed', source)
    }

    let bytes: Uint8Array
    try {
        bytes = decodeBase64(secret.slice(KEY_PREFIX.length))
    } catch {
        throw new SessionSecretError('not-base64', source)
    }

    if (bytes.byteLength !== KEY_BYTES) {
        throw new SessionSecretError('wrong-length', source)
    }
    if (bytes.every((byte) => byte === bytes[0])) {
        // All-zero, all-0xff, any single byte repeated. Shape-valid and
        // worthless. This is NOT an entropy test — no parse can be one — it
        // catches the one specific mistake of padding a value out to 32 bytes
        // to satisfy the length check.
        throw new SessionSecretError('degenerate', source)
    }

    return bytes
}

/**
 * Base64-encode bytes without spreading them.
 *
 * `String.fromCharCode(...bytes)` throws `RangeError` somewhere between 125 000
 * and 200 000 arguments — measured on this runtime — and a session payload is
 * application-influenced, so the ceiling is reachable.
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
