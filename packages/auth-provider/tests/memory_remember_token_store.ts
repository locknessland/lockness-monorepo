/**
 * @fileoverview An in-memory `RememberTokenStore` and a minimal
 * `SessionProviderBase` subclass over it, for tests (#457).
 *
 * Map-backed, with switches that make a storage step fail or lie, so the
 * base's fail-closed paths are reachable without a database. Shared by the
 * lifecycle suite, the #146 origin suite and the deny-path suite.
 *
 * Not a `.test.ts` file, so `deno test` does not collect it.
 *
 * @module @lockness/auth-provider/tests/memory_remember_token_store
 */

import { assert } from '@std/assert'
import type { Authenticatable } from '@lockness/auth'
import {
    type NewStoredRememberToken,
    type RememberTokenStore,
    SessionProviderBase,
    type StoredRememberToken,
} from '../base/session_provider_base.ts'

/** The four port methods, by name — what a failure switch can target. */
export type StoreStep = keyof RememberTokenStore

/**
 * A Map-backed store. Each step can be made to reject, and the lookup can be
 * made to return a foreign row, which is how the fail-closed paths are
 * reached. Every call that reaches a write step is logged in `writes`.
 */
export class MemoryRememberTokenStore implements RememberTokenStore {
    readonly rows = new Map<number, StoredRememberToken>()
    /** Every write step that ran, in order, with its arguments. */
    readonly writes: Array<{ step: StoreStep; args: unknown[] }> = []
    /** Steps that reject instead of running. */
    readonly failing = new Set<StoreStep>()
    #nextId = 1

    /** When set, the lookup returns this row whatever hash was asked for. */
    wrongRow: StoredRememberToken | null = null
    /** When set, `insert` reports `reportedId.id` instead of the row's own. */
    reportedId: { id: unknown } | null = null

    insert(record: NewStoredRememberToken): Promise<StoredRememberToken> {
        this.writes.push({ step: 'insert', args: [record] })
        if (this.failing.has('insert')) {
            return Promise.reject(new Error('remember_me_tokens unreachable'))
        }
        const row = { ...record, id: this.#nextId++ }
        this.rows.set(row.id, row)
        if (this.reportedId) {
            return Promise.resolve({
                ...row,
                id: this.reportedId.id as StoredRememberToken['id'],
            })
        }
        return Promise.resolve({ ...row })
    }

    findByHash(hash: string): Promise<StoredRememberToken | null> {
        if (this.failing.has('findByHash')) {
            return Promise.reject(new Error('remember_me_tokens unreachable'))
        }
        if (this.wrongRow) return Promise.resolve({ ...this.wrongRow })
        for (const row of this.rows.values()) {
            if (row.hash === hash) return Promise.resolve({ ...row })
        }
        return Promise.resolve(null)
    }

    delete(userId: string | number, tokenId: string | number): Promise<void> {
        this.writes.push({ step: 'delete', args: [userId, tokenId] })
        if (this.failing.has('delete')) {
            return Promise.reject(new Error('remember_me_tokens unreachable'))
        }
        const row = this.rows.get(Number(tokenId))
        if (row && row.userId === userId) this.rows.delete(row.id as number)
        return Promise.resolve()
    }

    deleteAllForUser(userId: string | number): Promise<void> {
        this.writes.push({ step: 'deleteAllForUser', args: [userId] })
        if (this.failing.has('deleteAllForUser')) {
            return Promise.reject(new Error('remember_me_tokens unreachable'))
        }
        for (const [id, row] of this.rows) {
            if (row.userId === userId) this.rows.delete(id)
        }
        return Promise.resolve()
    }

    /** Overwrite fields of a stored row, the way a DBA or a clock would. */
    patch(id: string | number, fields: Partial<StoredRememberToken>): void {
        const row = this.rows.get(Number(id))
        assert(row, `no row ${id}`)
        Object.assign(row, fields)
    }
}

/** The smallest session provider: users in a Map, remember-me on a store. */
export class MemorySessionProvider
    extends SessionProviderBase<Authenticatable> {
    readonly users = new Map<number | string, Authenticatable>()
    failFindById = false

    constructor(store?: RememberTokenStore) {
        super(store === undefined ? {} : { rememberTokens: store })
    }

    findById(id: string | number): Promise<Authenticatable | null> {
        if (this.failFindById) {
            return Promise.reject(new Error('users table unreachable'))
        }
        return Promise.resolve(this.users.get(id) ?? null)
    }

    findByCredentials(): Promise<Authenticatable | null> {
        return Promise.resolve(null)
    }

    verifyPassword(): Promise<boolean> {
        return Promise.resolve(false)
    }
}

/** A provider over a fresh store, with users 1 and 2 registered. */
export function setup(): {
    provider: MemorySessionProvider
    store: MemoryRememberTokenStore
    alice: Authenticatable
    bob: Authenticatable
} {
    const store = new MemoryRememberTokenStore()
    const provider = new MemorySessionProvider(store)
    const alice = { id: 1, email: 'alice@example.test' }
    const bob = { id: 2, email: 'bob@example.test' }
    provider.users.set(1, alice)
    provider.users.set(2, bob)
    return { provider, store, alice, bob }
}
