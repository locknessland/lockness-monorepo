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

import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert'
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

/** A kysely `selectFrom(...).select([...]).where().executeTakeFirst()` chain
 * that resolves to `row` (use `undefined` for "not found"). */
function fakeKyselySelect(row: unknown) {
    const chain: Record<string, unknown> = {}
    Object.assign(chain, {
        select: () => chain,
        selectAll: () => chain,
        where: () => chain,
        executeTakeFirst: () => Promise.resolve(row),
    })
    return { selectFrom: () => chain }
}

/** A remember-me row for `token_hash`, live for an hour, with an origin. */
function liveRow(tokenHash: string) {
    const now = Date.now()
    return {
        id: 7,
        user_id: 1,
        token_hash: tokenHash,
        expires_at: new Date(now + 3_600_000),
        first_issued_at: new Date(now),
        created_at: new Date(now),
    }
}

/** SHA-256, lowercase hex — what a store keys a token by. */
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

/** A remember-me table for the Drizzle session provider. */
const rememberMeTokens = pgTable('remember_me_tokens', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    hash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    firstIssuedAt: timestamp('first_issued_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
})

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

Deno.test('session (drizzle) - remember-me off: verify denies, create throws naming rememberTokensTable', async () => {
    const provider = new DrizzleSessionProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any -- remember-me off never touches db
        db: () => null as any,
        ...denying,
    })
    assertEquals(await provider.verifyRememberToken(neverIssued()), null)
    await assertRejects(
        () => provider.createRememberToken(fakeUser({ id: 1 }), 3600),
        Error,
        'rememberTokensTable',
    )
})

Deno.test('session (drizzle) - an unknown remember token is denied (the store finds no row)', async () => {
    let lookups = 0
    const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => {
            lookups++
            return Promise.resolve([])
        },
    }
    const provider = new DrizzleSessionProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any -- a select-only fake
        db: () => ({ select: () => chain }) as any,
        findUserById: () => Promise.resolve(fakeUser({ id: 1 })),
        findUserByCredentials: denying.findUserByCredentials,
        rememberTokensTable: rememberMeTokens,
    })
    assertEquals(await provider.verifyRememberToken(neverIssued()), null)
    assertEquals(lookups, 1, 'the store was asked')
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

Deno.test('session (kysely) - remember token denied when remember-me is off', async () => {
    const value = neverIssued()
    const row = liveRow(await sha256(value))
    const provider = new KyselySessionProvider<Authenticatable>({
        db: () => fakeKyselySelect(row),
        findUserById: () => Promise.resolve(fakeUser({ id: 1 })),
        findUserByCredentials: denying.findUserByCredentials,
    })
    assertEquals(await provider.verifyRememberToken(value), null)
})

Deno.test('session (kysely) - an expired row is returned by the store and denied by the base', async () => {
    using _time = new FakeTime(new Date('2026-01-01T00:00:00Z'))
    const value = neverIssued()
    const row = liveRow(await sha256(value))
    const build = (expires_at: Date) =>
        new KyselySessionProvider<Authenticatable>({
            db: () => fakeKyselySelect({ ...row, expires_at }),
            findUserById: () => Promise.resolve(fakeUser({ id: 1 })),
            findUserByCredentials: denying.findUserByCredentials,
            rememberTokensTable: 'remember_me_tokens',
        })

    // Not vacuous: the same row, one millisecond younger, verifies.
    assert(await build(new Date(Date.now() + 1)).verifyRememberToken(value))
    assertEquals(
        await build(new Date(Date.now())).verifyRememberToken(value),
        null,
    )
    assertEquals(
        await build(new Date(Date.now() - 1000)).verifyRememberToken(value),
        null,
    )
})

Deno.test('session (kysely) - remember token denied when the user is gone (orphaned token)', async () => {
    const value = neverIssued()
    const row = liveRow(await sha256(value))
    const provider = new KyselySessionProvider<Authenticatable>({
        db: () => fakeKyselySelect(row), // a live row…
        findUserById: () => Promise.resolve<Authenticatable | null>(null), // …but the user is gone
        findUserByCredentials: denying.findUserByCredentials,
        rememberTokensTable: 'remember_me_tokens',
    })
    assertEquals(await provider.verifyRememberToken(value), null)
})
