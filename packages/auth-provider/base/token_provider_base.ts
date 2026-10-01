/**
 * @fileoverview Abstract base class for token-based (API) authentication
 * providers — the whole access-token lifecycle, over five storage steps.
 *
 * The base is a **Template Method**. It owns every security decision a token
 * needs — how one is generated and hashed, when it expires, who may revoke
 * it, what a verification failure means, when last use is recorded — and a
 * binding (Drizzle, Kysely, an in-memory test double) supplies only the five
 * storage steps. That split exists because a binding that re-implemented the
 * policy is how the Drizzle provider shipped returning `null` for every token
 * (#452): each new binding is another place to get expiry or ownership wrong.
 *
 * @module @lockness/auth-provider/base/token
 */

import type {
    AccessToken,
    Authenticatable,
    PROVIDER_REAL_USER,
    TokenUserProviderContract,
} from '@lockness/auth'

/** Default token length, in random bytes (80 hex characters). */
const DEFAULT_TOKEN_LENGTH = 40

/**
 * The shortest token accepted, in random bytes. 128 bits of entropy is the
 * floor below which an opaque bearer credential can be guessed.
 */
const MIN_TOKEN_LENGTH = 16

/** Default lifetime of an access token: one year, in milliseconds. */
const DEFAULT_EXPIRES_IN_MS = 365 * 24 * 60 * 60 * 1000

/**
 * How stale `lastUsedAt` may get before a verification writes it again.
 * Writing it on every request would turn each authenticated read into a
 * write; once a minute is precise enough to answer "is this token in use?".
 */
const LAST_USED_RESOLUTION_MS = 60_000

/**
 * An access token as a binding stores it — the hash, never the plaintext.
 *
 * Property names are the contract between the base and its bindings; how they
 * map to columns is the binding's business.
 */
export interface StoredAccessToken {
    /** The row's primary key — what `deleteToken` is given back. */
    id: string | number
    /** The owning user's id. Every revocation is scoped by it. */
    userId: string | number
    /** A label the user chose ("ci", "laptop"). */
    name: string
    /** SHA-256 of the plaintext, lowercase hex (64 characters). */
    hash: string
    /**
     * When the token stops verifying. Always written by the base; a `null`
     * read back from storage is treated as expired, never as "forever".
     */
    expiresAt: Date | null
    /** The last verification that recorded use, at minute resolution. */
    lastUsedAt: Date | null
    /** When the token was issued. */
    createdAt: Date
}

/** A token row about to be inserted — everything but the generated id. */
export type NewStoredAccessToken = Omit<StoredAccessToken, 'id'>

/** Options every token provider accepts. */
export interface TokenProviderBaseOptions {
    /**
     * Random bytes per token (default 40, minimum 16). The plaintext is twice
     * as many hex characters.
     */
    tokenLength?: number
}

/**
 * Abstract base class for token user providers.
 *
 * The lifecycle — {@link createToken}, {@link verifyToken},
 * {@link deleteToken}, {@link deleteAllTokens} — is concrete and is the
 * template: **do not override it** (TypeScript has no `final`; this sentence
 * is the guard). A subclass implements:
 *
 * - `findById()` and `findByCredentials()` — the user lookups;
 * - `insertTokenRecord()` — store a new row, return it with its id;
 * - `findTokenRecordByHash()` — the row whose hash equals the argument;
 * - `deleteTokenRecord()` — delete one row, **scoped by its owner**;
 * - `deleteTokenRecordsForUser()` — delete every row of one user;
 * - `touchTokenRecord()` — set `lastUsedAt` on one row.
 *
 * Storage errors must propagate. A step that swallows a failure and returns
 * `null` turns an outage into a storm of 401s that a login throttle then
 * punishes; a thrown error denies the request just as surely, and says why.
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 *
 * @example
 * ```ts
 * class MyTokenProvider extends TokenProviderBase<User> {
 *   async findById(id: string | number): Promise<User | null> {
 *     return await db.users.findFirst({ where: { id } })
 *   }
 *   protected async findTokenRecordByHash(hash: string) {
 *     return await db.tokens.findFirst({ where: { hash } }) ?? null
 *   }
 *   // ... findByCredentials and the four other storage steps
 * }
 * ```
 */
export abstract class TokenProviderBase<User extends Authenticatable>
    implements TokenUserProviderContract<User> {
    /**
     * Symbol to access real user type
     */
    declare [PROVIDER_REAL_USER]: User

    /** Random bytes per token. */
    readonly #tokenLength: number

    /**
     * @param options - Provider options.
     * @throws {RangeError} When `tokenLength` is not an integer of at least 16.
     */
    constructor(options: TokenProviderBaseOptions = {}) {
        const tokenLength = options.tokenLength ?? DEFAULT_TOKEN_LENGTH
        if (!Number.isInteger(tokenLength) || tokenLength < MIN_TOKEN_LENGTH) {
            throw new RangeError(
                `tokenLength must be an integer of at least ${MIN_TOKEN_LENGTH} bytes, got ${tokenLength}`,
            )
        }
        this.#tokenLength = tokenLength
    }

    /**
     * Generate a cryptographically secure token value.
     *
     * @param lengthInBytes - Random bytes to draw.
     * @returns The bytes, lowercase hex.
     */
    // deno-lint-ignore require-await
    async #generateTokenValue(
        lengthInBytes: number = DEFAULT_TOKEN_LENGTH,
    ): Promise<string> {
        const bytes = new Uint8Array(lengthInBytes)
        crypto.getRandomValues(bytes)
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    }

    /**
     * Hash a token value with SHA-256.
     *
     * A fast hash is right here, unlike for passwords: the input is 128+ bits
     * of randomness, so there is nothing for a slow hash to protect.
     *
     * @param token - The plaintext.
     * @returns The digest, lowercase hex (64 characters).
     */
    async #hashTokenValue(token: string): Promise<string> {
        const encoder = new TextEncoder()
        const data = encoder.encode(token)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        return Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    }

    /**
     * Find a user by their unique identifier.
     *
     * @param id - The user id stored on the token row.
     * @returns The user, or `null` when there is none.
     */
    abstract findById(id: string | number): Promise<User | null>

    /**
     * Find a user by credentials (email/password) for token generation.
     *
     * @param email - The submitted email.
     * @param password - The submitted password.
     * @returns The user, or `null` when the pair does not match.
     */
    abstract findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null>

    /**
     * Store a new token row.
     *
     * @param record - The row; its `hash` is unique.
     * @returns The stored row, with its generated id.
     */
    protected abstract insertTokenRecord(
        record: NewStoredAccessToken,
    ): Promise<StoredAccessToken>

    /**
     * Find the row whose hash equals `hash` exactly.
     *
     * @param hash - SHA-256 of a presented token, lowercase hex.
     * @returns The row, or `null` when none matches. Errors propagate.
     */
    protected abstract findTokenRecordByHash(
        hash: string,
    ): Promise<StoredAccessToken | null>

    /**
     * Delete one row — only if it belongs to `userId`.
     *
     * @param userId - The owner the deletion is scoped by.
     * @param tokenId - The row's id.
     * @returns Nothing; a foreign or missing id deletes nothing.
     */
    protected abstract deleteTokenRecord(
        userId: string | number,
        tokenId: string | number,
    ): Promise<void>

    /**
     * Delete every row owned by `userId`.
     *
     * @param userId - The owner.
     * @returns Nothing.
     */
    protected abstract deleteTokenRecordsForUser(
        userId: string | number,
    ): Promise<void>

    /**
     * Record that a token was used.
     *
     * @param tokenId - The row's id.
     * @param at - The time of use.
     * @returns Nothing.
     */
    protected abstract touchTokenRecord(
        tokenId: string | number,
        at: Date,
    ): Promise<void>

    /**
     * Issue an access token. Only its hash is stored; the plaintext is in the
     * returned `value` and nowhere else, ever again.
     *
     * @param user - The owner.
     * @param name - A label for the token.
     * @param expiresIn - Lifetime in **milliseconds** (default: one year).
     * @returns The issued token, `value` holding the plaintext.
     * @throws {RangeError} When `expiresIn` is not a finite positive duration
     * that lands on a valid date.
     */
    async createToken(
        user: User,
        name: string,
        expiresIn: number = DEFAULT_EXPIRES_IN_MS,
    ): Promise<AccessToken> {
        const now = new Date()
        const expiresAt = new Date(now.getTime() + expiresIn)
        if (
            !Number.isFinite(expiresIn) || expiresIn <= 0 ||
            Number.isNaN(expiresAt.getTime())
        ) {
            throw new RangeError(
                `expiresIn must be a finite number of milliseconds greater than 0, got ${expiresIn}`,
            )
        }

        const value = await this.#generateTokenValue(this.#tokenLength)
        const stored = await this.insertTokenRecord({
            userId: user.id,
            name,
            hash: await this.#hashTokenValue(value),
            expiresAt,
            lastUsedAt: null,
            createdAt: now,
        })
        return { ...toAccessToken(stored), value }
    }

    /**
     * Verify a presented token.
     *
     * Allows only a token whose stored hash matches, that is unexpired, and
     * whose user still exists. Storage errors **reject** — the guard then
     * denies the request — rather than resolving to `null`.
     *
     * @param tokenValue - The plaintext from `Authorization: Bearer`.
     * @returns The user and the token (`value` is `''`: the plaintext is not
     * recoverable), or `null` when the token does not verify.
     * @throws Whatever `findTokenRecordByHash` or `findById` throws — a
     * storage failure is propagated, never turned into an allow or a `null`.
     */
    async verifyToken(
        tokenValue: string,
    ): Promise<{ user: User; token: AccessToken } | null> {
        if (typeof tokenValue !== 'string' || tokenValue === '') return null
        // One clock read per call: expiry and last use agree on "now".
        const now = new Date()

        const hash = await this.#hashTokenValue(tokenValue)
        const row = await this.findTokenRecordByHash(hash)
        if (!row) return null
        // Defence in depth against a binding that returns the wrong row.
        if (row.hash !== hash) return null
        if (!isUnexpired(row.expiresAt, now)) return null

        const user = await this.findById(row.userId)
        if (!user) return null

        const lastUsedAt = await this.#recordUse(row, now)
        return { user, token: { ...toAccessToken(row), lastUsedAt } }
    }

    /**
     * Revoke one token. Scoped by `user`: naming another user's token id, or
     * one that does not exist, deletes nothing and does not throw.
     *
     * @param user - The owner.
     * @param tokenId - The token's `identifier`.
     * @returns Nothing.
     */
    async deleteToken(user: User, tokenId: string | number): Promise<void> {
        await this.deleteTokenRecord(user.id, tokenId)
    }

    /**
     * Revoke every token of `user`.
     *
     * @param user - The owner.
     * @returns Nothing.
     */
    async deleteAllTokens(user: User): Promise<void> {
        await this.deleteTokenRecordsForUser(user.id)
    }

    /**
     * Write `lastUsedAt` when it is unset or a minute stale.
     *
     * A failed write does **not** deny. The verification has already been
     * decided by the reads above; failing it on a bookkeeping write would
     * turn a read-only replica into an authentication outage. The failure is
     * logged — the row id and the error, never the plaintext.
     *
     * @param row - The verified row.
     * @param now - This verification's clock read.
     * @returns The `lastUsedAt` the caller should report.
     */
    async #recordUse(
        row: StoredAccessToken,
        now: Date,
    ): Promise<Date | undefined> {
        const last = row.lastUsedAt
        if (
            last instanceof Date &&
            now.getTime() - last.getTime() < LAST_USED_RESOLUTION_MS
        ) {
            return last
        }
        try {
            await this.touchTokenRecord(row.id, now)
            return now
        } catch (error) {
            console.warn(
                `[auth-provider] could not record the last use of access token ${
                    JSON.stringify(row.id)
                }; the token was verified anyway`,
                error,
            )
            return last ?? undefined
        }
    }
}

/**
 * Whether `expiresAt` is still ahead of `now`. Written so that `null`, a
 * non-Date and an Invalid Date all read as expired.
 */
function isUnexpired(expiresAt: Date | null, now: Date): boolean {
    return expiresAt instanceof Date && now.getTime() < expiresAt.getTime()
}

/** The contract's view of a stored row; the plaintext is not part of it. */
function toAccessToken(row: StoredAccessToken): AccessToken {
    return {
        identifier: row.id,
        name: row.name,
        value: '',
        hash: row.hash,
        userId: row.userId,
        expiresAt: row.expiresAt ?? undefined,
        lastUsedAt: row.lastUsedAt ?? undefined,
        createdAt: row.createdAt,
    }
}
