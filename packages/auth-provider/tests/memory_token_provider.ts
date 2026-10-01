/**
 * @fileoverview An in-memory `TokenProviderBase` binding for tests (#452).
 *
 * Map-backed, with switches that make a storage step fail or lie, so the
 * base's fail-closed paths are reachable without a database. Shared by the
 * lifecycle suite and the deny-path suite — one double, not two that drift.
 *
 * Not a `.test.ts` file, so `deno test` does not collect it.
 *
 * @module @lockness/auth-provider/tests/memory_token_provider
 */

import { assert } from '@std/assert'
import type { Authenticatable } from '@lockness/auth'
import {
    type NewStoredAccessToken,
    type StoredAccessToken,
    TokenProviderBase,
    type TokenProviderBaseOptions,
} from '../base/token_provider_base.ts'

/**
 * A Map-backed binding. Each storage step can be swapped for a failing or
 * lying one, which is how the fail-closed paths are reached.
 */
export class MemoryTokenProvider extends TokenProviderBase<Authenticatable> {
    readonly rows = new Map<number, StoredAccessToken>()
    readonly users = new Map<number | string, Authenticatable>()
    readonly touches: Array<{ id: string | number; at: Date }> = []
    #nextId = 1

    failLookup = false
    failFindById = false
    failTouch = false
    /** When set, the lookup returns this row whatever hash was asked for. */
    wrongRow: StoredAccessToken | null = null

    constructor(options?: TokenProviderBaseOptions) {
        super(options)
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

    protected insertTokenRecord(
        record: NewStoredAccessToken,
    ): Promise<StoredAccessToken> {
        const row = { ...record, id: this.#nextId++ }
        this.rows.set(row.id, row)
        return Promise.resolve({ ...row })
    }

    protected findTokenRecordByHash(
        hash: string,
    ): Promise<StoredAccessToken | null> {
        if (this.failLookup) {
            return Promise.reject(new Error('access_tokens unreachable'))
        }
        if (this.wrongRow) return Promise.resolve(this.wrongRow)
        for (const row of this.rows.values()) {
            if (row.hash === hash) return Promise.resolve({ ...row })
        }
        return Promise.resolve(null)
    }

    protected deleteTokenRecord(
        userId: string | number,
        tokenId: string | number,
    ): Promise<void> {
        const row = this.rows.get(Number(tokenId))
        if (row && row.userId === userId) this.rows.delete(row.id as number)
        return Promise.resolve()
    }

    protected deleteTokenRecordsForUser(
        userId: string | number,
    ): Promise<void> {
        for (const [id, row] of this.rows) {
            if (row.userId === userId) this.rows.delete(id)
        }
        return Promise.resolve()
    }

    protected touchTokenRecord(
        tokenId: string | number,
        at: Date,
    ): Promise<void> {
        if (this.failTouch) {
            return Promise.reject(new Error('read-only replica'))
        }
        this.touches.push({ id: tokenId, at })
        const row = this.rows.get(Number(tokenId))
        if (row) row.lastUsedAt = at
        return Promise.resolve()
    }

    /** Overwrite a stored row's expiry, the way a DBA or a clock would. */
    setExpiry(id: string | number, expiresAt: Date | null): void {
        const row = this.rows.get(Number(id))
        assert(row, `no row ${id}`)
        row.expiresAt = expiresAt
    }
}

/** A provider with users 1 and 2 registered. */
export function setup(options?: TokenProviderBaseOptions): {
    provider: MemoryTokenProvider
    alice: Authenticatable
    bob: Authenticatable
} {
    const provider = new MemoryTokenProvider(options)
    const alice = { id: 1, email: 'alice@example.test' }
    const bob = { id: 2, email: 'bob@example.test' }
    provider.users.set(1, alice)
    provider.users.set(2, bob)
    return { provider, alice, bob }
}
