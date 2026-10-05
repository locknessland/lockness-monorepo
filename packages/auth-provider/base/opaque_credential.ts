/**
 * @fileoverview The primitives every opaque bearer credential shares — how one
 * is minted and hashed, how much entropy it needs, and when it has expired.
 * Internal: not re-exported from any entry point.
 *
 * Two lifecycles use them: access tokens (`TokenProviderBase`) and remember-me
 * tokens (`SessionProviderBase`). They differ in what they do around a
 * credential (a touch step against a recycle with an origin, milliseconds
 * against seconds), so each base owns its own lifecycle; what they must never
 * disagree on is the bottom layer, which lives here once (#457). It is a set
 * of functions, not an injectable policy object, so no subclass and no caller
 * can swap a weaker one in — the seam #452 closed on purpose.
 *
 * @module
 * @internal
 */

/** Default credential length, in random bytes (80 hex characters). */
export const DEFAULT_CREDENTIAL_BYTES = 40

/**
 * The shortest credential accepted, in random bytes. 128 bits of entropy is
 * the floor below which an opaque bearer credential can be guessed.
 */
export const MIN_CREDENTIAL_BYTES = 16

/** A freshly minted credential: the plaintext to hand out, the hash to store. */
export interface MintedCredential {
    /** Random bytes, lowercase hex. Shown to its owner once, never stored. */
    readonly plaintext: string
    /** {@link hashCredential} of the plaintext. */
    readonly hash: string
}

/**
 * Check a configured credential length.
 *
 * @param tokenLength - The candidate, in random bytes.
 * @returns The length, unchanged.
 * @throws {RangeError} When it is not an integer of at least
 * {@link MIN_CREDENTIAL_BYTES}.
 */
export function assertCredentialBytes(tokenLength: number): number {
    if (
        !Number.isInteger(tokenLength) || tokenLength < MIN_CREDENTIAL_BYTES
    ) {
        throw new RangeError(
            `tokenLength must be an integer of at least ${MIN_CREDENTIAL_BYTES} bytes, got ${tokenLength}`,
        )
    }
    return tokenLength
}

/**
 * Draw a new credential from the platform CSPRNG and hash it.
 *
 * @param bytes - Random bytes to draw; the caller has validated it.
 * @returns The plaintext and its hash.
 */
export async function mintCredential(
    bytes: number = DEFAULT_CREDENTIAL_BYTES,
): Promise<MintedCredential> {
    const random = new Uint8Array(bytes)
    crypto.getRandomValues(random)
    const plaintext = toHex(random)
    return { plaintext, hash: await hashCredential(plaintext) }
}

/**
 * Hash a credential with SHA-256.
 *
 * A fast hash is right here, unlike for passwords: the input is 128+ bits of
 * randomness, so there is nothing for a slow hash to protect.
 *
 * No constant-time comparison goes with it, deliberately. A lookup matches
 * the SHA-256 of the **presented** value against stored hashes; a timing
 * difference could at most reveal how many leading bytes of the attacker's
 * own hash match a stored one, and preimage resistance makes that useless for
 * building a credential. The secret is the plaintext, and the plaintext is
 * never compared.
 *
 * @param plaintext - The credential as presented.
 * @returns The digest, lowercase hex (64 characters).
 */
export async function hashCredential(plaintext: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(plaintext),
    )
    return toHex(new Uint8Array(digest))
}

/**
 * Whether `expiresAt` is still ahead of `now`. Written so that `null`, a
 * non-Date and an Invalid Date all read as expired: storage that lost the
 * expiry must deny, never grant "forever".
 *
 * @param expiresAt - The stored expiry, as read back.
 * @param now - The caller's single clock read.
 * @returns `true` only for a valid Date strictly after `now`.
 */
export function isUnexpired(expiresAt: unknown, now: Date): boolean {
    return expiresAt instanceof Date && now.getTime() < expiresAt.getTime()
}

/**
 * The instant `durationMs` after `now`.
 *
 * The error is the caller's to build, because each lifecycle states its
 * duration in its own unit — milliseconds for access tokens, seconds for
 * remember-me — and the message must name the unit the caller's API takes.
 *
 * @param now - The caller's single clock read.
 * @param durationMs - The lifetime in milliseconds.
 * @param invalid - Builds the error for a duration that is not accepted.
 * @returns The expiry.
 * @throws {RangeError} The one `invalid` builds, when `durationMs` is not a
 * finite number greater than 0, or lands past the last representable date.
 */
export function expiryAfter(
    now: Date,
    durationMs: number,
    invalid: () => RangeError,
): Date {
    const expiresAt = new Date(now.getTime() + durationMs)
    if (
        !Number.isFinite(durationMs) || durationMs <= 0 ||
        Number.isNaN(expiresAt.getTime())
    ) {
        throw invalid()
    }
    return expiresAt
}

/** Bytes as lowercase hex. */
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}
