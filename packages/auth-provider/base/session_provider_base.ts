/**
 * @fileoverview Abstract base class for session-based authentication
 * providers — user lookups, password verification, and the whole remember-me
 * token lifecycle over a composed storage port.
 *
 * Remember-me is an **optional** capability of a session provider, so its
 * storage is a port the base is given ({@link RememberTokenStore}), not a set
 * of abstract methods every subclass must stub. Stubbing them is how both
 * bindings shipped placeholders that never stored a token, or stored one
 * with the wrong expiry and no origin (#457). The base owns every decision —
 * how a token is minted and hashed, when it expires, who may revoke it, what
 * a verification failure means, which origin a renewal keeps — and a binding
 * (Drizzle, Kysely, an in-memory test double) supplies only four storage
 * steps.
 *
 * @module @lockness/auth-provider/base/session
 */

import type {
    Authenticatable,
    PROVIDER_REAL_USER,
    RememberMeToken,
    SessionUserProviderContract,
    SessionWithRememberMeProviderContract,
} from '@lockness/auth'
import {
    expiryAfter,
    hashCredential,
    isUnexpired,
    mintCredential,
} from './opaque_credential.ts'

/**
 * A remember-me token as a store keeps it — the hash, never the plaintext.
 *
 * Property names are the contract between the base and its stores; how they
 * map to columns is the store's business.
 */
export interface StoredRememberToken {
    /** The row's primary key — what `deleteRememberToken` is given back. */
    id: string | number
    /** The owning user's id. Every revocation is scoped by it. */
    userId: string | number
    /** SHA-256 of the plaintext, lowercase hex (64 characters). Unique. */
    hash: string
    /**
     * When the token stops verifying. Always written by the base; a `null`,
     * non-Date or Invalid Date read back is treated as expired, never as
     * "forever".
     */
    expiresAt: Date | null
    /**
     * The first issuance of this token's renewal chain — the origin the
     * guard's absolute-lifetime cap is measured from (#146). Always written by
     * the base and carried across every recycle; a `null` or Invalid Date
     * read back denies.
     */
    firstIssuedAt: Date | null
    /** When this particular token was issued (re-minted by each recycle). */
    createdAt: Date
}

/** A token row about to be inserted — everything but the generated id. */
export type NewStoredRememberToken = Omit<StoredRememberToken, 'id'>

/**
 * The storage port of the remember-me lifecycle — owned by
 * {@link SessionProviderBase}, implemented by each binding.
 *
 * Every step must let errors propagate. A step that swallows a failure and
 * returns `null` turns an outage into silent log-outs; a thrown error fails
 * just as closed, and says why.
 *
 * @example
 * ```ts
 * const store: RememberTokenStore = {
 *     insert: async (record) => await repo.save(record),
 *     findByHash: async (hash) => await repo.findOneBy({ hash }) ?? null,
 *     delete: async (userId, id) => { await repo.delete({ id, userId }) },
 *     deleteAllForUser: async (userId) => { await repo.delete({ userId }) },
 * }
 * ```
 */
export interface RememberTokenStore {
    /**
     * Store a new row.
     *
     * @param record - The row; its `hash` is unique.
     * @returns The stored row, with its generated (non-nullish) id.
     */
    insert(record: NewStoredRememberToken): Promise<StoredRememberToken>

    /**
     * Find the row whose hash equals `hash` exactly — with **no** expiry
     * predicate: the base decides expiry, against one clock read.
     *
     * @param hash - SHA-256 of a presented token, lowercase hex.
     * @returns The row, or `null` when none matches.
     */
    findByHash(hash: string): Promise<StoredRememberToken | null>

    /**
     * Delete one row — only if it belongs to `userId`.
     *
     * @param userId - The owner the deletion is scoped by.
     * @param tokenId - The row's id.
     * @returns Nothing; a foreign or missing id deletes nothing.
     */
    delete(userId: string | number, tokenId: string | number): Promise<void>

    /**
     * Delete every row owned by `userId`.
     *
     * @param userId - The owner.
     * @returns Nothing.
     */
    deleteAllForUser(userId: string | number): Promise<void>
}

/** Options every session provider accepts. */
export interface SessionProviderBaseOptions {
    /**
     * Where remember-me tokens are stored. Present: remember-me is on.
     * Absent: off — creating or recycling a token throws, verifying one
     * denies, and deleting is a no-op.
     */
    rememberTokens?: RememberTokenStore
}

/** The four port steps, checked at construction. */
const STORE_STEPS = [
    'insert',
    'findByHash',
    'delete',
    'deleteAllForUser',
] as const satisfies readonly (keyof RememberTokenStore)[]

/**
 * Abstract base class for session user providers.
 *
 * A subclass implements `findById()`, `findByCredentials()` and
 * `verifyPassword()`. To turn remember-me on, it passes a
 * {@link RememberTokenStore} as `super({ rememberTokens: store })`.
 *
 * The remember-me lifecycle — {@link createRememberToken},
 * {@link verifyRememberToken}, {@link deleteRememberToken},
 * {@link deleteAllRememberTokens}, {@link recycleRememberToken} — is concrete:
 * **do not override it** (TypeScript has no `final`; this sentence is the
 * guard). Overriding it bypasses the expiry, ownership and origin checks.
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 *
 * @example
 * ```ts
 * class MySessionProvider extends SessionProviderBase<User> {
 *   constructor(store: RememberTokenStore) {
 *     super({ rememberTokens: store })
 *   }
 *   async findById(id: string | number): Promise<User | null> {
 *     return await db.users.findFirst({ where: { id } })
 *   }
 *   // ... findByCredentials and verifyPassword
 * }
 * ```
 */
export abstract class SessionProviderBase<User extends Authenticatable>
    implements
        SessionUserProviderContract<User>,
        SessionWithRememberMeProviderContract<User> {
    /**
     * Symbol to access real user type
     */
    declare [PROVIDER_REAL_USER]: User

    /** Where remember-me tokens live; `undefined` turns remember-me off. */
    readonly #store: RememberTokenStore | undefined

    /**
     * @param options - Provider options. The store is checked, never called.
     * @throws {TypeError} When `rememberTokens` is present but is not an
     * object with all four {@link RememberTokenStore} methods.
     */
    constructor(options: SessionProviderBaseOptions = {}) {
        const store = options.rememberTokens
        if (store !== undefined) assertRememberTokenStore(store)
        this.#store = store
    }

    /**
     * Default password verification (direct comparison - NOT secure for production)
     * Subclasses should override this with bcrypt.compare(), argon2, scrypt, etc.
     *
     * @param plain - The submitted password.
     * @param hash - The stored value.
     * @returns Whether they are identical.
     */
    // deno-lint-ignore require-await
    protected async defaultVerifyPassword(
        plain: string,
        hash: string,
    ): Promise<boolean> {
        return plain === hash
    }

    /**
     * Find a user by their unique identifier.
     *
     * @param id - The user id (also the one stored on a remember-me row).
     * @returns The user, or `null` when there is none.
     */
    abstract findById(id: string | number): Promise<User | null>

    /**
     * Find a user by credentials (email/password).
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
     * Verify a password against its stored hash.
     *
     * @param plain - The submitted password.
     * @param hash - The stored hash.
     * @returns Whether they match.
     */
    abstract verifyPassword(plain: string, hash: string): Promise<boolean>

    /**
     * Issue a remember-me token. Only its hash is stored; the plaintext is in
     * the returned `value` and nowhere else.
     *
     * @param user - The owner.
     * @param expiresIn - Lifetime in **seconds** — the guard passes its
     * `rememberMeTokensAge`, the same number it gives the cookie's `maxAge`.
     * @returns The issued token, `value` holding the plaintext and
     * `firstIssuedAt` equal to `createdAt`.
     * @throws {Error} When remember-me is off (no store).
     * @throws {RangeError} When `expiresIn` is not a finite positive number
     * of seconds that lands on a valid date.
     * @throws {TypeError} When the store returns a row without an id.
     * @throws Whatever the store's `insert` throws.
     */
    async createRememberToken(
        user: User,
        expiresIn: number,
    ): Promise<RememberMeToken> {
        const store = this.#requireStore()
        // One clock read: expiry, origin and creation agree on "now".
        const now = new Date()
        const expiresAt = rememberExpiry(now, expiresIn)
        return await issue(store, user.id, now, expiresAt, now)
    }

    /**
     * Verify a presented remember-me token.
     *
     * Allows only a token whose stored hash matches, that is unexpired, that
     * carries a valid origin, and whose user still exists. Storage errors
     * **reject** rather than resolving to `null`.
     *
     * @param tokenValue - The plaintext from the remember-me cookie.
     * @returns The user and the token (`value` is `''`: the plaintext is not
     * recoverable), or `null` when the token does not verify or remember-me
     * is off.
     * @throws Whatever the store's `findByHash` or `findById` throws.
     */
    async verifyRememberToken(
        tokenValue: string,
    ): Promise<{ user: User; token: RememberMeToken } | null> {
        if (typeof tokenValue !== 'string' || tokenValue === '') return null
        const store = this.#store
        if (!store) return null
        // One clock read per call.
        const now = new Date()

        const hash = await hashCredential(tokenValue)
        const row = await store.findByHash(hash)
        if (!row) return null
        // Defence in depth against a store that returns the wrong row. A
        // plain `!==` on purpose: both sides are hashes, never the plaintext,
        // so there is no secret for a timing side channel to leak (see
        // `hashCredential`).
        if (row.hash !== hash) return null
        if (!isUnexpired(row.expiresAt, now)) return null
        if (!isValidDate(row.firstIssuedAt)) return null
        // A row without an id cannot be revoked or recycled; never allow it.
        if (row.id === null || row.id === undefined) return null

        const user = await this.findById(row.userId)
        if (!user) return null

        return {
            user,
            token: {
                identifier: row.id,
                value: '',
                hash: row.hash,
                userId: row.userId,
                expiresAt: row.expiresAt as Date,
                createdAt: row.createdAt,
                firstIssuedAt: row.firstIssuedAt,
            },
        }
    }

    /**
     * Revoke one remember-me token. Scoped by `user`: naming another user's
     * token id, or one that does not exist, deletes nothing.
     *
     * Without a store this resolves and does nothing — such a provider could
     * never have issued a token.
     *
     * @param user - The owner.
     * @param tokenId - The token's `identifier`.
     * @returns Nothing.
     * @throws Whatever the store's `delete` throws.
     */
    async deleteRememberToken(
        user: User,
        tokenId: string | number,
    ): Promise<void> {
        await this.#store?.delete(user.id, tokenId)
    }

    /**
     * Revoke every remember-me token of `user` (#147) — called by the guard's
     * per-user eviction, so a captured cookie cannot re-mint a session.
     *
     * Without a store this resolves and does nothing — such a provider could
     * never have issued a token.
     *
     * @param user - The owner.
     * @returns Nothing.
     * @throws Whatever the store's `deleteAllForUser` throws.
     */
    async deleteAllRememberTokens(user: User): Promise<void> {
        await this.#store?.deleteAllForUser(user.id)
    }

    /**
     * Rotate a verified remember-me token: delete it, then issue a new one
     * that carries its `firstIssuedAt` forward (#146).
     *
     * Every argument is validated before any write. The old token is deleted
     * **before** the new one is inserted: if the insert fails, the user is
     * logged out (fail closed), whereas the other order leaves two live
     * credentials when the delete fails.
     *
     * @param user - The owner.
     * @param token - The verified token being rotated; its `identifier` names
     * the row to delete and its `firstIssuedAt` is the origin to keep. The
     * guard resolves that origin before calling; this method does no
     * fallback.
     * @param expiresIn - Lifetime of the new token, in **seconds**.
     * @returns The new token, `value` holding its plaintext.
     * @throws {Error} When remember-me is off (no store).
     * @throws {TypeError} When `token.firstIssuedAt` is not a valid Date,
     * `token.identifier` is missing, or the store returns a row without an id.
     * @throws {RangeError} When `expiresIn` is not a finite positive number
     * of seconds that lands on a valid date.
     * @throws Whatever the store's `delete` or `insert` throws.
     */
    async recycleRememberToken(
        user: User,
        token: RememberMeToken,
        expiresIn: number,
    ): Promise<RememberMeToken> {
        const store = this.#requireStore()
        const origin = token?.firstIssuedAt
        if (!isValidDate(origin)) {
            throw new TypeError(
                'recycleRememberToken needs the verified token with a valid firstIssuedAt — the guard resolves it before recycling',
            )
        }
        // Without an identifier the delete would target nothing and leave the
        // old token live beside the new one; refuse before any write.
        if (token.identifier === null || token.identifier === undefined) {
            throw new TypeError(
                'recycleRememberToken needs the verified token with its identifier',
            )
        }
        const now = new Date()
        const expiresAt = rememberExpiry(now, expiresIn)

        await store.delete(user.id, token.identifier)
        return await issue(store, user.id, now, expiresAt, origin)
    }

    /** The store, or the error that says how to configure one. */
    #requireStore(): RememberTokenStore {
        if (!this.#store) {
            throw new Error(
                'Remember-me tokens are off for this provider: pass rememberTokensTable to turn them on ' +
                    '(a custom SessionProviderBase passes a RememberTokenStore as rememberTokens)',
            )
        }
        return this.#store
    }
}

/**
 * Mint a credential, insert its row, and return the contract's view of it.
 *
 * @throws {TypeError} When the store returns a row without an id.
 */
async function issue(
    store: RememberTokenStore,
    userId: string | number,
    now: Date,
    expiresAt: Date,
    firstIssuedAt: Date,
): Promise<RememberMeToken> {
    const { plaintext, hash } = await mintCredential()
    const stored = await store.insert({
        userId,
        hash,
        expiresAt,
        firstIssuedAt,
        createdAt: now,
    })
    // The plaintext is never an identifier: a missing id is a broken store.
    if (stored?.id === null || stored?.id === undefined) {
        throw new TypeError(
            'The remember-me token store returned a row without an id',
        )
    }
    return {
        identifier: stored.id,
        value: plaintext,
        hash,
        userId,
        expiresAt,
        createdAt: now,
        firstIssuedAt,
    }
}

/**
 * The expiry `seconds` after `now` — the one place remember-me's unit is
 * converted.
 *
 * @throws {RangeError} When `seconds` is not a finite positive number that
 * lands on a valid date.
 */
function rememberExpiry(now: Date, seconds: number): Date {
    // A non-number must not be coerced by `* 1000` into a valid duration.
    const durationMs = typeof seconds === 'number' ? seconds * 1000 : Number.NaN
    return expiryAfter(
        now,
        durationMs,
        () =>
            new RangeError(
                `expiresIn must be a finite number of seconds greater than 0, got ${seconds}`,
            ),
    )
}

/** Whether `value` is a Date holding a real instant. */
function isValidDate(value: unknown): value is Date {
    return value instanceof Date && !Number.isNaN(value.getTime())
}

/**
 * Refuse a `rememberTokens` option that is not a full store.
 *
 * @throws {TypeError} Naming each missing method.
 */
function assertRememberTokenStore(
    store: unknown,
): asserts store is RememberTokenStore {
    if (typeof store !== 'object' || store === null) {
        throw new TypeError(
            `rememberTokens must be a RememberTokenStore, got ${
                store === null ? 'null' : typeof store
            }`,
        )
    }
    const missing = STORE_STEPS.filter((step) =>
        typeof Reflect.get(store, step) !== 'function'
    )
    if (missing.length > 0) {
        throw new TypeError(
            `rememberTokens is not a RememberTokenStore: missing ${
                missing.join(', ')
            }`,
        )
    }
}
