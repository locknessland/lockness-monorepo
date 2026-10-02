/**
 * @fileoverview Fail-closed deny-path tests for every provider kind (#182).
 *
 * Identity must never fail *open*: an unknown user, a bad credential, an
 * invalid/expired/revoked token, or an unknown session must all resolve to
 * `null`, never to a user. These tests exercise the real drizzle/kysely
 * providers with injected lookups and chainable DB fakes — no real database —
 * and assert the deny direction of every kind (basic-auth, token, session).
 *
 * They also pin the insecure `plain === hash` default of the base classes as
 * something to be *overridden*: it is asserted only to DENY a mismatch, never
 * codified as a correct check, and a custom verifier is shown to replace it.
 *
 * @module @lockness/auth-provider/tests/deny_paths
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import type { Authenticatable } from '@lockness/auth'
import { fakeUser } from '@lockness/testing'
import { DrizzleBasicAuthProvider } from '../drizzle/drizzle_basic_auth_provider.ts'
import { DrizzleTokenProvider } from '../drizzle/drizzle_token_provider.ts'
import type { DrizzleAccessTokensTable } from '../drizzle/access_tokens_table.ts'
import { setup } from './memory_token_provider.ts'
import { DrizzleSessionProvider } from '../drizzle/drizzle_session_provider.ts'
import { KyselySessionProvider } from '../kysely/kysely_session_provider.ts'

/** Injected lookups that always deny — the fail-closed baseline. */
const denying = {
    findUserById: () => Promise.resolve<Authenticatable | null>(null),
    findUserByCredentials: () => Promise.resolve<Authenticatable | null>(null),
}

/** A kysely `selectFrom(...).selectAll().where().where().executeTakeFirst()`
 * chain that resolves to `row` (use `undefined` for "not found / expired"). */
function fakeKyselySelect(row: unknown) {
    const chain: Record<string, unknown> = {}
    Object.assign(chain, {
        selectAll: () => chain,
        where: () => chain,
        executeTakeFirst: () => Promise.resolve(row),
    })
    return { selectFrom: () => chain }
}

// -----------------------------------------------------------------------------
// Basic-auth kind (drizzle)
// -----------------------------------------------------------------------------

Deno.test('basic-auth (drizzle) - unknown user and bad credentials resolve to null', async () => {
    const provider = new DrizzleBasicAuthProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any -- deny lookups never touch db
        db: () => null as any,
        ...denying,
    })
    assertEquals(await provider.findById(999), null)
    assertEquals(
        await provider.findByCredentials('nobody@example.test', 'wrong'),
        null,
    )
})

Deno.test('basic-auth (drizzle) - insecure default verifyPassword only ever denies a mismatch', async () => {
    const provider = new DrizzleBasicAuthProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any
        db: () => null as any,
        ...denying,
        // No verifyPassword → the `plain === hash` default, labelled not-for-production.
    })
    // Asserted in the SAFE direction only: a mismatch is denied. This never
    // certifies plain===hash as correct — production overrides it (next test).
    assertEquals(await provider.verifyPassword('secret', 'not-secret'), false)
})

Deno.test('basic-auth (drizzle) - a custom verifyPassword overrides the default', async () => {
    const seen: Array<[string, string]> = []
    const provider = new DrizzleBasicAuthProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any
        db: () => null as any,
        ...denying,
        verifyPassword: (plain, hash) => {
            seen.push([plain, hash])
            return Promise.resolve(false)
        },
    })
    // Even identical strings are denied: the custom verifier is consulted, not
    // the insecure default — proving the override takes effect.
    assertEquals(await provider.verifyPassword('secret', 'secret'), false)
    assertEquals(seen, [['secret', 'secret']])
})

// -----------------------------------------------------------------------------
// Token kind — the lifecycle lives in TokenProviderBase (#452), so its deny
// paths are asserted through an in-memory binding; the Drizzle binding is
// proven against a real Postgres by scripts/kit_token_flow_live_test.ts.
// -----------------------------------------------------------------------------

Deno.test('token - an unknown token does not verify', async () => {
    const { provider, alice } = setup()
    await provider.createToken(alice, 'ci')
    assertEquals(await provider.verifyToken('never-issued'), null)
})

Deno.test('token - an expired token does not verify', async () => {
    using time = new FakeTime(new Date('2026-01-01T00:00:00Z'))
    const { provider, alice } = setup()
    const token = await provider.createToken(alice, 'ci', 60_000)
    time.tick(60_000)
    assertEquals(await provider.verifyToken(token.value), null)
})

Deno.test('token - a revoked token does not verify, by deleteToken or deleteAllTokens', async () => {
    const { provider, alice } = setup()
    const one = await provider.createToken(alice, 'one')
    const two = await provider.createToken(alice, 'two')

    await provider.deleteToken(alice, one.identifier)
    assertEquals(await provider.verifyToken(one.value), null)
    assert(await provider.verifyToken(two.value), 'only the named token went')

    await provider.deleteAllTokens(alice)
    assertEquals(await provider.verifyToken(two.value), null)
})

Deno.test('token (drizzle) - a table name or an incomplete table is refused at construction', () => {
    const construct = (tokensTable: unknown) =>
        new DrizzleTokenProvider<Authenticatable>({
            // deno-lint-ignore no-explicit-any -- construction never touches db
            db: () => null as any,
            ...denying,
            tokensTable: tokensTable as DrizzleAccessTokensTable,
        })

    // The pre-#452 option was a table name, accepted and never read.
    assertThrows(
        () => construct('access_tokens'),
        TypeError,
        'Drizzle table object',
    )
    assertThrows(() => construct(undefined), TypeError, 'Drizzle table object')

    // A table whose hash column is still called `token`, with no last-use.
    const legacy = pgTable('access_tokens', {
        id: serial('id').primaryKey(),
        userId: integer('user_id').notNull(),
        name: text('name').notNull(),
        token: text('token').notNull().unique(),
        expiresAt: timestamp('expires_at'),
        createdAt: timestamp('created_at').defaultNow(),
    })
    assertThrows(
        () => construct(legacy),
        TypeError,
        'missing the column properties "hash", "lastUsedAt"',
    )
})

// -----------------------------------------------------------------------------
// Session kind (drizzle)
// -----------------------------------------------------------------------------

Deno.test('session (drizzle) - unknown user resolves to null', async () => {
    const provider = new DrizzleSessionProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any
        db: () => null as any,
        ...denying,
    })
    assertEquals(await provider.findById(999), null)
    assertEquals(
        await provider.findByCredentials('nobody@example.test', 'wrong'),
        null,
    )
})

Deno.test('session (drizzle) - verifyRememberToken is fail-closed', async () => {
    const provider = new DrizzleSessionProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any
        db: () => null as any,
        ...denying,
        enableRememberTokens: true,
    })
    assertEquals(await provider.verifyRememberToken('anything'), null)
})

// -----------------------------------------------------------------------------
// Session kind (kysely)
// -----------------------------------------------------------------------------

Deno.test('session (kysely) - unknown user resolves to null', async () => {
    const provider = new KyselySessionProvider<Authenticatable>({
        db: () => fakeKyselySelect(undefined),
        ...denying,
    })
    assertEquals(await provider.findById(999), null)
})

Deno.test('session (kysely) - default verifyPassword denies a mismatch', async () => {
    const provider = new KyselySessionProvider<Authenticatable>({
        db: () => fakeKyselySelect(undefined),
        ...denying,
    })
    assertEquals(await provider.verifyPassword('a', 'b'), false)
})

Deno.test('session (kysely) - remember token denied when the feature is disabled', async () => {
    const provider = new KyselySessionProvider<Authenticatable>({
        db: () => fakeKyselySelect(undefined),
        ...denying,
        enableRememberTokens: false,
    })
    assertEquals(await provider.verifyRememberToken('anything'), null)
})

Deno.test('session (kysely) - remember token denied when the row is absent (unknown or expired)', async () => {
    const provider = new KyselySessionProvider<Authenticatable>({
        // The query filters on `expires_at > now`, so an unknown OR expired
        // token both surface here as "no row" → undefined.
        db: () => fakeKyselySelect(undefined),
        findUserById: () => Promise.resolve(fakeUser({ id: 1 })),
        findUserByCredentials: () =>
            Promise.resolve<Authenticatable | null>(
                null,
            ),
        enableRememberTokens: true,
    })
    assertEquals(await provider.verifyRememberToken('unknown-or-expired'), null)
})

Deno.test('session (kysely) - remember token denied when the user is gone (orphaned token)', async () => {
    const orphanRow = {
        id: 'tok1',
        user_id: 1,
        expires_at: new Date(Date.now() + 3_600_000),
        created_at: new Date(),
    }
    const provider = new KyselySessionProvider<Authenticatable>({
        db: () => fakeKyselySelect(orphanRow), // a live token row exists…
        findUserById: () => Promise.resolve<Authenticatable | null>(null), // …but the user is gone
        findUserByCredentials: () =>
            Promise.resolve<Authenticatable | null>(
                null,
            ),
        enableRememberTokens: true,
    })
    assertEquals(await provider.verifyRememberToken('valid-looking'), null)
})
