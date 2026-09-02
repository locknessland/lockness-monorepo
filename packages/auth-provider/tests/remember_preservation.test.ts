/**
 * @fileoverview recycleRememberToken preserves the first-issuance origin (#146).
 *
 * The absolute-lifetime cap in `@lockness/auth` is only as good as the provider's
 * promise to carry `firstIssuedAt` forward on renewal. This exercises the real
 * DrizzleSessionProvider recycle (its create/recycle stubs touch no DB), proving
 * the persistence-home bare-copy — `new.firstIssuedAt = old.firstIssuedAt` — the
 * decision table assigns to the providers.
 *
 * @module @lockness/auth-provider/tests/remember_preservation
 */

import { assertEquals, assertNotEquals } from '@std/assert'
import type { RememberMeToken } from '@lockness/auth'
import { DrizzleSessionProvider } from '../drizzle/drizzle_session_provider.ts'
import { KyselySessionProvider } from '../kysely/kysely_session_provider.ts'

/** A chainable stub covering the query shapes create/delete use. */
function fakeKyselyDb() {
    const chain: Record<string, unknown> = {}
    Object.assign(chain, {
        values: () => chain,
        returning: () => chain,
        executeTakeFirst: () =>
            Promise.resolve({ id: `db-${crypto.randomUUID()}` }),
        where: () => chain,
        execute: () => Promise.resolve([]),
    })
    return { insertInto: () => chain, deleteFrom: () => chain }
}

Deno.test('drizzle recycle bare-copies firstIssuedAt, not a fresh clock (#146)', async () => {
    const provider = new DrizzleSessionProvider({
        // The remember-token stubs never touch the db; a null handle is fine here.
        // deno-lint-ignore no-explicit-any
        db: null as any,
        findUserById: () => Promise.resolve(null),
        findUserByCredentials: () => Promise.resolve(null),
        enableRememberTokens: true,
    })

    const origin = new Date('2020-01-01T00:00:00Z')
    const old: RememberMeToken = {
        identifier: 'old-id',
        value: 'v',
        hash: 'h',
        userId: 1,
        expiresAt: new Date(),
        createdAt: new Date(),
        firstIssuedAt: origin,
    }

    // deno-lint-ignore no-explicit-any
    const fresh = await provider.recycleRememberToken(
        { id: 1 } as any,
        old,
        3600,
    )

    assertEquals(
        fresh.firstIssuedAt?.getTime(),
        origin.getTime(),
        'the renewed token kept the original origin, not a re-minted one',
    )
    assertNotEquals(
        fresh.identifier,
        old.identifier,
        'a genuinely new token was minted (rotation still happened)',
    )
})

Deno.test('drizzle recycle bare-copies an ABSENT origin as-is (no ?? in the provider) (#146)', async () => {
    // The freeze policy is the guard's; a provider is a dumb bare-copy. Given an
    // old token with no firstIssuedAt, recycle must pass undefined through, not
    // invent a createdAt fallback of its own.
    const provider = new DrizzleSessionProvider({
        // deno-lint-ignore no-explicit-any
        db: null as any,
        findUserById: () => Promise.resolve(null),
        findUserByCredentials: () => Promise.resolve(null),
        enableRememberTokens: true,
    })
    const old: RememberMeToken = {
        identifier: 'legacy',
        value: 'v',
        hash: 'h',
        userId: 1,
        expiresAt: new Date(),
        createdAt: new Date('2019-06-01T00:00:00Z'),
        // firstIssuedAt intentionally absent
    }
    // deno-lint-ignore no-explicit-any
    const fresh = await provider.recycleRememberToken(
        { id: 1 } as any,
        old,
        3600,
    )
    assertEquals(
        fresh.firstIssuedAt,
        undefined,
        'the provider bare-copies undefined through — it does not apply the createdAt fallback',
    )
})

Deno.test('kysely recycle bare-copies firstIssuedAt, not a fresh clock (#146)', async () => {
    const provider = new KyselySessionProvider({
        // deno-lint-ignore no-explicit-any
        db: fakeKyselyDb() as any,
        findUserById: () => Promise.resolve(null),
        findUserByCredentials: () => Promise.resolve(null),
        enableRememberTokens: true,
    })

    const origin = new Date('2020-01-01T00:00:00Z')
    const old: RememberMeToken = {
        identifier: 'k-old',
        value: 'v',
        hash: 'h',
        userId: 1,
        expiresAt: new Date(),
        createdAt: new Date(),
        firstIssuedAt: origin,
    }

    // deno-lint-ignore no-explicit-any
    const fresh = await provider.recycleRememberToken(
        { id: 1 } as any,
        old,
        3600,
    )
    assertEquals(
        fresh.firstIssuedAt?.getTime(),
        origin.getTime(),
        'the renewed Kysely token kept the original origin',
    )
    assertNotEquals(
        fresh.identifier,
        old.identifier,
        'a genuinely new token was minted',
    )
})

Deno.test('drizzle create stamps firstIssuedAt at creation (#146)', async () => {
    const provider = new DrizzleSessionProvider({
        // deno-lint-ignore no-explicit-any
        db: null as any,
        findUserById: () => Promise.resolve(null),
        findUserByCredentials: () => Promise.resolve(null),
        enableRememberTokens: true,
    })

    // deno-lint-ignore no-explicit-any
    const token = await provider.createRememberToken({ id: 1 } as any, 3600)
    assertEquals(
        token.firstIssuedAt?.getTime(),
        token.createdAt.getTime(),
        'a freshly created credential anchors its origin at creation',
    )
})

Deno.test('kysely deleteAllRememberTokens targets the user rows (#147)', async () => {
    const calls = {
        table: '',
        col: '',
        op: '',
        val: undefined as unknown,
        executed: false,
    }
    const chain = {
        where: (col: string, op: string, val: unknown) => {
            calls.col = col
            calls.op = op
            calls.val = val
            return chain
        },
        execute: () => {
            calls.executed = true
            return Promise.resolve([])
        },
    }
    const db = {
        deleteFrom: (t: string) => {
            calls.table = t
            return chain
        },
    }
    const provider = new KyselySessionProvider({
        // deno-lint-ignore no-explicit-any
        db: db as any,
        findUserById: () => Promise.resolve(null),
        findUserByCredentials: () => Promise.resolve(null),
        enableRememberTokens: true,
    })

    // deno-lint-ignore no-explicit-any
    await provider.deleteAllRememberTokens({ id: 42 } as any)
    assertEquals(
        calls.table,
        'remember_me_tokens',
        'deletes from the tokens table',
    )
    assertEquals(calls.col, 'user_id', 'scoped by user_id')
    assertEquals(calls.val, 42, 'targets the given user')
    assertEquals(calls.executed, true, 'the delete was executed')
})
