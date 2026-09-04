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

import { assert, assertEquals } from '@std/assert'
import type { Authenticatable } from '@lockness/auth'
import { fakeUser } from '@lockness/testing'
import { DrizzleBasicAuthProvider } from '../drizzle/drizzle_basic_auth_provider.ts'
import { DrizzleTokenProvider } from '../drizzle/drizzle_token_provider.ts'
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
        db: null as any,
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
        db: null as any,
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
        db: null as any,
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
// Token kind (drizzle) — safe-by-default stub, never fails open
// -----------------------------------------------------------------------------

Deno.test('token (drizzle) - verifyToken is fail-closed for invalid/expired/revoked alike', async () => {
    const provider = new DrizzleTokenProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any
        db: null as any,
        ...denying,
    })
    // An unissued value never verifies.
    assertEquals(await provider.verifyToken('never-issued'), null)

    // Even a token this provider just minted does not verify: the base is a
    // safe stub a subclass must implement — it denies rather than fails open.
    const token = await provider.createToken(fakeUser({ id: 1 }), 'ci')
    assert(token.hash.length > 0, 'the SHA-256 hashing path ran')
    assert(
        (token.expiresAt?.getTime() ?? 0) > Date.now(),
        'a future expiry was set',
    )
    assertEquals(await provider.verifyToken(token.value), null)
})

Deno.test('token (drizzle) - revocation methods resolve without throwing', async () => {
    const provider = new DrizzleTokenProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any
        db: null as any,
        ...denying,
    })
    const user = fakeUser({ id: 1 })
    await provider.deleteToken(user, 't1')
    await provider.deleteAllTokens(user)
})

// -----------------------------------------------------------------------------
// Session kind (drizzle)
// -----------------------------------------------------------------------------

Deno.test('session (drizzle) - unknown user resolves to null', async () => {
    const provider = new DrizzleSessionProvider<Authenticatable>({
        // deno-lint-ignore no-explicit-any
        db: null as any,
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
        db: null as any,
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
        db: fakeKyselySelect(undefined),
        ...denying,
    })
    assertEquals(await provider.findById(999), null)
})

Deno.test('session (kysely) - default verifyPassword denies a mismatch', async () => {
    const provider = new KyselySessionProvider<Authenticatable>({
        db: fakeKyselySelect(undefined),
        ...denying,
    })
    assertEquals(await provider.verifyPassword('a', 'b'), false)
})

Deno.test('session (kysely) - remember token denied when the feature is disabled', async () => {
    const provider = new KyselySessionProvider<Authenticatable>({
        db: fakeKyselySelect(undefined),
        ...denying,
        enableRememberTokens: false,
    })
    assertEquals(await provider.verifyRememberToken('anything'), null)
})

Deno.test('session (kysely) - remember token denied when the row is absent (unknown or expired)', async () => {
    const provider = new KyselySessionProvider<Authenticatable>({
        // The query filters on `expires_at > now`, so an unknown OR expired
        // token both surface here as "no row" → undefined.
        db: fakeKyselySelect(undefined),
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
        db: fakeKyselySelect(orphanRow), // a live token row exists…
        findUserById: () => Promise.resolve<Authenticatable | null>(null), // …but the user is gone
        findUserByCredentials: () =>
            Promise.resolve<Authenticatable | null>(
                null,
            ),
        enableRememberTokens: true,
    })
    assertEquals(await provider.verifyRememberToken('valid-looking'), null)
})
