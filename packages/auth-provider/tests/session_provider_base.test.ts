/**
 * @fileoverview The remember-me lifecycle `SessionProviderBase` owns (#457).
 *
 * The base decides issue, expiry, origin, ownership and fail-closed, and
 * delegates storage to a composed `RememberTokenStore`. These tests drive it
 * through an in-memory store whose steps can fail or misbehave, so every
 * policy decision is asserted without a database — the live suite
 * (`scripts/remember_me_live_test.ts`) covers the Drizzle store on Postgres.
 *
 * The #146 origin properties (recycle carries `firstIssuedAt` through
 * storage, and refuses a token without one) live in
 * `remember_preservation.test.ts`.
 *
 * @module @lockness/auth-provider/tests/session_provider_base
 */

import {
    assert,
    assertEquals,
    assertNotEquals,
    assertRejects,
    assertThrows,
} from '@std/assert'
import { FakeTime } from '@std/testing/time'
import type { RememberMeToken } from '@lockness/auth'
import * as base from '../base/mod.ts'
import { SessionProviderBase } from '../base/session_provider_base.ts'
import {
    MemoryRememberTokenStore,
    MemorySessionProvider,
    setup,
    type StoreStep,
} from './memory_remember_token_store.ts'

const THIRTY_DAYS_S = 2_592_000
const T0 = new Date('2026-01-01T00:00:00Z')

/** SHA-256, lowercase hex — the format the base promises to store. */
async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value),
    )
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

/** A presented value no store has ever seen, built at run time. */
function neverIssued(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(40))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// -----------------------------------------------------------------------------
// Storage
// -----------------------------------------------------------------------------

Deno.test('createRememberToken stores only the SHA-256 hash, never the plaintext', async () => {
    const { provider, store, alice } = setup()
    const token = await provider.createRememberToken(alice, THIRTY_DAYS_S)

    assertEquals(token.value.length, 80, '40 random bytes, hex')
    assert(/^[0-9a-f]+$/.test(token.value), 'opaque hex')
    assertEquals(store.rows.size, 1)
    const [row] = [...store.rows.values()]
    assertEquals(row.hash, await sha256(token.value))
    assertEquals(token.hash, row.hash)
    for (const [field, stored] of Object.entries(row)) {
        assertNotEquals(stored, token.value, `${field} holds the plaintext`)
    }
    assertEquals(row.userId, 1)
})

Deno.test('createRememberToken identifies the token by the store id, never the plaintext', async () => {
    const { provider, store, alice } = setup()
    const token = await provider.createRememberToken(alice, THIRTY_DAYS_S)
    const [row] = [...store.rows.values()]
    assertEquals(token.identifier, row.id)
    assertNotEquals(token.identifier, token.value)
})

Deno.test('createRememberToken rejects when the store reports a nullish id', async () => {
    for (const id of [null, undefined]) {
        const { provider, store, alice } = setup()
        store.reportedId = { id }
        await assertRejects(
            () => provider.createRememberToken(alice, THIRTY_DAYS_S),
            TypeError,
            'id',
        )
    }
})

// -----------------------------------------------------------------------------
// Round trip and units
// -----------------------------------------------------------------------------

Deno.test('a created token verifies, with value "" and its origin at creation', async () => {
    using _time = new FakeTime(T0)
    const { provider, alice } = setup()
    const created = await provider.createRememberToken(alice, THIRTY_DAYS_S)

    const result = await provider.verifyRememberToken(created.value)
    assert(result, 'the token verifies')
    assertEquals(result.user, alice)
    assertEquals(result.token.value, '', 'the plaintext is not recoverable')
    assertEquals(result.token.identifier, created.identifier)
    assertEquals(result.token.createdAt.getTime(), T0.getTime())
    assertEquals(result.token.firstIssuedAt?.getTime(), T0.getTime())
    assertEquals(created.firstIssuedAt?.getTime(), T0.getTime())
    assertEquals(created.createdAt.getTime(), T0.getTime())
})

Deno.test('expiresIn is in seconds: 30 days of seconds is 30 days of expiry (defect 1)', async () => {
    using _time = new FakeTime(T0)
    const { provider, store, alice } = setup()
    const created = await provider.createRememberToken(alice, THIRTY_DAYS_S)

    const [row] = [...store.rows.values()]
    assertEquals(
        row.expiresAt!.getTime() - row.createdAt.getTime(),
        2_592_000_000,
    )
    assertEquals(
        created.expiresAt.getTime() - created.createdAt.getTime(),
        2_592_000_000,
    )

    const verified = await provider.verifyRememberToken(created.value)
    assert(verified)
    const recycled = await provider.recycleRememberToken(
        alice,
        verified.token,
        THIRTY_DAYS_S,
    )
    const fresh = store.rows.get(Number(recycled.identifier))
    assert(fresh)
    assertEquals(
        fresh.expiresAt!.getTime() - fresh.createdAt.getTime(),
        2_592_000_000,
    )
    assertEquals(
        recycled.expiresAt.getTime() - recycled.createdAt.getTime(),
        2_592_000_000,
    )
})

// -----------------------------------------------------------------------------
// Deny paths — each resolves to null
// -----------------------------------------------------------------------------

Deno.test('an empty or non-string value does not verify', async () => {
    const { provider, alice } = setup()
    await provider.createRememberToken(alice, THIRTY_DAYS_S)
    assertEquals(await provider.verifyRememberToken(''), null)
    for (const bad of [undefined, null, 42, {}]) {
        assertEquals(
            await provider.verifyRememberToken(bad as unknown as string),
            null,
        )
    }
})

Deno.test('an unknown token does not verify', async () => {
    const { provider, alice } = setup()
    await provider.createRememberToken(alice, THIRTY_DAYS_S)
    assertEquals(await provider.verifyRememberToken(neverIssued()), null)
})

Deno.test('a row whose hash differs from the presented hash does not verify', async () => {
    const { provider, store, alice } = setup()
    const other = await provider.createRememberToken(alice, THIRTY_DAYS_S)
    store.wrongRow = store.rows.get(Number(other.identifier))!
    assertEquals(await provider.verifyRememberToken(neverIssued()), null)
})

Deno.test('a token expires exactly at expiresAt — one millisecond earlier it verifies', async () => {
    using time = new FakeTime(T0)
    const { provider, alice } = setup()
    const token = await provider.createRememberToken(alice, 60)

    time.tick(60_000 - 1)
    assert(await provider.verifyRememberToken(token.value), 'still live')
    time.tick(1)
    assertEquals(await provider.verifyRememberToken(token.value), null)
    time.tick(3_600_000)
    assertEquals(await provider.verifyRememberToken(token.value), null)
})

Deno.test('a null, Invalid or non-Date expiresAt read back does not verify', async () => {
    for (
        const expiresAt of [
            null,
            new Date(Number.NaN),
            '2099-01-01T00:00:00Z' as unknown as Date,
        ]
    ) {
        const { provider, store, alice } = setup()
        const token = await provider.createRememberToken(alice, THIRTY_DAYS_S)
        store.patch(token.identifier, { expiresAt })
        assertEquals(
            await provider.verifyRememberToken(token.value),
            null,
            `expiresAt ${String(expiresAt)}`,
        )
    }
})

Deno.test('a null or Invalid firstIssuedAt read back does not verify', async () => {
    for (const firstIssuedAt of [null, new Date(Number.NaN)]) {
        const { provider, store, alice } = setup()
        const token = await provider.createRememberToken(alice, THIRTY_DAYS_S)
        store.patch(token.identifier, { firstIssuedAt })
        assertEquals(await provider.verifyRememberToken(token.value), null)
    }
})

Deno.test('a token whose user no longer exists does not verify', async () => {
    const { provider, alice } = setup()
    const token = await provider.createRememberToken(alice, THIRTY_DAYS_S)
    provider.users.delete(1)
    assertEquals(await provider.verifyRememberToken(token.value), null)
})

// -----------------------------------------------------------------------------
// Storage errors propagate
// -----------------------------------------------------------------------------

Deno.test('a storage error rejects, never resolves to null or a user', async () => {
    type Call = (
        p: MemorySessionProvider,
        token: RememberMeToken,
    ) => Promise<unknown>
    const alice = { id: 1 }
    const cases: Array<[StoreStep | 'findById', Call]> = [
        ['findByHash', (p, t) => p.verifyRememberToken(t.value)],
        ['findById', (p, t) => p.verifyRememberToken(t.value)],
        ['insert', (p) => p.createRememberToken(alice, THIRTY_DAYS_S)],
        ['delete', (p, t) => p.deleteRememberToken(alice, t.identifier)],
        ['deleteAllForUser', (p) => p.deleteAllRememberTokens(alice)],
    ]
    for (const [step, call] of cases) {
        const { provider, store } = setup()
        const token = await provider.createRememberToken(alice, THIRTY_DAYS_S)
        if (step === 'findById') provider.failFindById = true
        else store.failing.add(step)
        await assertRejects(() => call(provider, token), Error, 'unreachable')
    }
})

// -----------------------------------------------------------------------------
// Owner scoping
// -----------------------------------------------------------------------------

Deno.test('deleteRememberToken is scoped by owner: another user cannot revoke a token', async () => {
    const { provider, alice, bob } = setup()
    const token = await provider.createRememberToken(alice, THIRTY_DAYS_S)

    await provider.deleteRememberToken(bob, token.identifier)
    assert(await provider.verifyRememberToken(token.value), 'A still verifies')

    await provider.deleteRememberToken(alice, token.identifier)
    assertEquals(await provider.verifyRememberToken(token.value), null)
})

Deno.test('deleteAllRememberTokens revokes every token of one user and no other', async () => {
    const { provider, alice, bob } = setup()
    const a1 = await provider.createRememberToken(alice, THIRTY_DAYS_S)
    const a2 = await provider.createRememberToken(alice, THIRTY_DAYS_S)
    const b1 = await provider.createRememberToken(bob, THIRTY_DAYS_S)

    await provider.deleteAllRememberTokens(alice)
    assertEquals(await provider.verifyRememberToken(a1.value), null)
    assertEquals(await provider.verifyRememberToken(a2.value), null)
    assert(await provider.verifyRememberToken(b1.value), "B's token survives")
})

// -----------------------------------------------------------------------------
// Recycle order
// -----------------------------------------------------------------------------

Deno.test('recycle deletes before it inserts: a failed insert leaves the old token revoked', async () => {
    const { provider, store, alice } = setup()
    const token = await provider.createRememberToken(alice, THIRTY_DAYS_S)
    const verified = await provider.verifyRememberToken(token.value)
    assert(verified)

    store.failing.add('insert')
    await assertRejects(
        () =>
            provider.recycleRememberToken(alice, verified.token, THIRTY_DAYS_S),
        Error,
        'unreachable',
    )
    assertEquals(await provider.verifyRememberToken(token.value), null)
    assertEquals(
        store.writes.slice(-2).map((w) => w.step),
        ['delete', 'insert'],
    )
})

// -----------------------------------------------------------------------------
// Without a store
// -----------------------------------------------------------------------------

Deno.test('without a store: create and recycle throw naming rememberTokensTable, verify denies, deletes resolve', async () => {
    const provider = new MemorySessionProvider()
    const alice = { id: 1 }
    provider.users.set(1, alice)

    await assertRejects(
        () => provider.createRememberToken(alice, THIRTY_DAYS_S),
        Error,
        'rememberTokensTable',
    )
    const token: RememberMeToken = {
        identifier: 1,
        value: '',
        hash: 'h',
        userId: 1,
        expiresAt: new Date(),
        createdAt: new Date(),
        firstIssuedAt: new Date(),
    }
    await assertRejects(
        () => provider.recycleRememberToken(alice, token, THIRTY_DAYS_S),
        Error,
        'rememberTokensTable',
    )
    assertEquals(await provider.verifyRememberToken(neverIssued()), null)
    await provider.deleteRememberToken(alice, 1)
    await provider.deleteAllRememberTokens(alice)
})

// -----------------------------------------------------------------------------
// Input validation
// -----------------------------------------------------------------------------

Deno.test('createRememberToken refuses an expiresIn that is not a finite positive number of seconds', async () => {
    const { provider, store, alice } = setup()
    for (const bad of [0, -1, Number.NaN, Infinity, 1e20, '3600']) {
        await assertRejects(
            () => provider.createRememberToken(alice, bad as number),
            RangeError,
            'seconds',
        )
    }
    assertEquals(store.writes, [], 'nothing was written')
})

Deno.test('the constructor refuses a store that lacks a port method, and never calls it', () => {
    const steps: StoreStep[] = [
        'insert',
        'findByHash',
        'delete',
        'deleteAllForUser',
    ]
    for (const missing of steps) {
        const store = new MemoryRememberTokenStore()
        const partial: Record<string, unknown> = {
            insert: store.insert.bind(store),
            findByHash: store.findByHash.bind(store),
            delete: store.delete.bind(store),
            deleteAllForUser: store.deleteAllForUser.bind(store),
        }
        delete partial[missing]
        assertThrows(
            () => new MemorySessionProvider(partial as never),
            TypeError,
            missing,
        )
    }
    assertThrows(
        () => new MemorySessionProvider(null as never),
        TypeError,
        'RememberTokenStore',
    )

    const untouched = new MemoryRememberTokenStore()
    untouched.failing.add('insert')
    untouched.failing.add('findByHash')
    new MemorySessionProvider(untouched)
    assertEquals(untouched.writes, [])
})

// -----------------------------------------------------------------------------
// Surface
// -----------------------------------------------------------------------------

Deno.test('the base exposes no credential primitive', () => {
    const proto = SessionProviderBase.prototype as unknown as Record<
        string,
        unknown
    >
    assertEquals('generateTokenValue' in proto, false)
    assertEquals('hashTokenValue' in proto, false)

    const exported = Object.keys(base)
    for (
        const name of [
            'mintCredential',
            'hashCredential',
            'isUnexpired',
            'expiryAfter',
            'assertCredentialBytes',
            'DEFAULT_CREDENTIAL_BYTES',
            'MIN_CREDENTIAL_BYTES',
        ]
    ) {
        assertEquals(exported.includes(name), false, `${name} is exported`)
    }
})

// -----------------------------------------------------------------------------
// A broken token id
// -----------------------------------------------------------------------------

Deno.test('a row read back without an id does not verify', async () => {
    for (const id of [null, undefined]) {
        const { provider, store, alice } = setup()
        const token = await provider.createRememberToken(alice, THIRTY_DAYS_S)
        store.patch(token.identifier, {
            id: id as unknown as number,
        })
        assertEquals(
            await provider.verifyRememberToken(token.value),
            null,
            `id ${String(id)}`,
        )
    }
})

Deno.test('recycle refuses a token without an identifier, before any write', async () => {
    for (const identifier of [null, undefined]) {
        const { provider, store, alice } = setup()
        const created = await provider.createRememberToken(alice, THIRTY_DAYS_S)
        const verified = await provider.verifyRememberToken(created.value)
        assert(verified)
        const writesBefore = store.writes.length

        await assertRejects(
            () =>
                provider.recycleRememberToken(
                    alice,
                    {
                        ...verified.token,
                        identifier: identifier as unknown as number,
                    },
                    THIRTY_DAYS_S,
                ),
            TypeError,
            'identifier',
        )
        assertEquals(store.writes.length, writesBefore, 'nothing was written')
        assert(
            await provider.verifyRememberToken(created.value),
            'the old token still verifies',
        )
    }
})
