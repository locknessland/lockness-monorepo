/**
 * @fileoverview Per-user session eviction through the guard (#147).
 *
 * `logoutEverywhere()` evicts every session of a user (acting device included,
 * same wall-clock second included) and invalidates their remember-me tokens;
 * `logoutOthers()` does the same but the acting session rotates and survives.
 * Every behavioural assertion is negative-tested: against the pre-fix guard a
 * remember-me session carries no `sub` and no eviction API exists, so the
 * evicted cookie would authenticate.
 *
 * @module @lockness/auth/tests/user_revocation
 */

import { assertEquals, assertRejects } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { Hono } from 'hono'
import type { Context } from 'hono'
import {
    CookieSessionDriver,
    generateAppKey,
    SessionStore,
} from '@lockness/session'
import type { SessionConfig } from '@lockness/session'
import * as sessionSurface from '@lockness/session'
import { SessionGuard } from '../guards/session_guard.ts'
import { AuthenticationRequiredError } from '../errors.ts'
import { MockSessionProvider } from './mocks.ts'
import type { RememberMeToken } from '../types.ts'

const KEY = generateAppKey()

const CONFIG: SessionConfig = {
    driver: 'cookie',
    cookieName: 'sess',
    secret: KEY,
    lifetime: 7200,
    absoluteLifetime: 3600,
    revocation: true,
    path: '/',
    secure: false,
    httpOnly: true,
    sameSite: 'Lax',
}

const ALICE = { id: 1, email: 'alice@example.com', password: 'password123' }

/** A full in-memory {@link RevocationStore}: revoked `jti` set + subject epochs. */
function sharedStore() {
    const revokedJti = new Set<string>()
    const epochs = new Map<string, number>()
    return {
        isRevoked: (jti: string) => Promise.resolve(revokedJti.has(jti)),
        revoke: (jti: string) => {
            revokedJti.add(jti)
            return Promise.resolve()
        },
        revokeUser: (sub: string) => {
            epochs.set(sub, Math.floor(Date.now() / 1000))
            return Promise.resolve()
        },
        userRevokedSince: (sub: string) =>
            Promise.resolve(epochs.get(sub) ?? null),
        close: () => Promise.resolve(),
    }
}

/** A remember-me provider tracking live tokens and mass-deletions. */
class RememberProvider extends MockSessionProvider {
    liveTokens = new Set<string>()
    deletedAll: Array<string | number> = []
    #counter = 0

    #token(userId: string | number, value: string): RememberMeToken {
        return {
            identifier: value,
            value,
            hash: value,
            userId,
            expiresAt: new Date(Date.now() + 3_600_000),
            createdAt: new Date(),
            firstIssuedAt: new Date(),
        }
    }

    /** Seed a live token value (a device's remember-me cookie). */
    seed(value: string): void {
        this.liveTokens.add(value)
    }

    createRememberToken(userId: string | number): Promise<RememberMeToken> {
        const value = `tok-${++this.#counter}`
        this.liveTokens.add(value)
        return Promise.resolve(this.#token(userId, value))
    }
    verifyRememberToken(
        tokenValue: string,
    ): Promise<{ user: typeof ALICE; token: RememberMeToken } | null> {
        if (!this.liveTokens.has(tokenValue)) return Promise.resolve(null)
        return Promise.resolve({
            user: ALICE,
            token: this.#token(ALICE.id, tokenValue),
        })
    }
    deleteRememberToken(_user: unknown, tokenId: string | number) {
        this.liveTokens.delete(String(tokenId))
        return Promise.resolve()
    }
    recycleRememberToken(
        user: typeof ALICE,
        token: RememberMeToken,
    ): Promise<RememberMeToken> {
        this.liveTokens.delete(token.value)
        return this.createRememberToken(user.id)
    }
    deleteAllRememberTokens(user: typeof ALICE): Promise<void> {
        this.deletedAll.push(user.id)
        this.liveTokens.clear()
        return Promise.resolve()
    }
}

/** A real Hono context carrying an optional cookie header. */
async function ctxWith(cookie?: string): Promise<Context> {
    const app = new Hono()
    let captured!: Context
    app.all('*', (c) => {
        captured = c
        return c.body(null)
    })
    await app.request('/', cookie ? { headers: { cookie } } : undefined)
    return captured
}

// deno-lint-ignore no-explicit-any
type AnyStore = any

/** Build a live session + guard over a cookie, reading it in (stashes jti/sub). */
async function device(
    cookie: string | undefined,
    store: AnyStore,
    provider: MockSessionProvider,
): Promise<{
    ctx: Context
    driver: CookieSessionDriver
    session: SessionStore
    // deno-lint-ignore no-explicit-any
    guard: SessionGuard<any, any>
}> {
    const ctx = await ctxWith(cookie)
    const driver = new CookieSessionDriver(ctx, CONFIG, store)
    const data = cookie ? (await driver.read('sid')) ?? {} : {}
    const session = new SessionStore('sid', driver, data, CONFIG)
    // deno-lint-ignore no-explicit-any
    ctx.set('session', session as any)
    const guard = new SessionGuard(
        'web',
        ctx,
        // deno-lint-ignore no-explicit-any
        provider as any,
        { useRememberMeTokens: true },
    )
    return { ctx, driver, session, guard }
}

/** The session cookie a write() set on a context (not the remember cookie). */
function issuedCookie(ctx: Context): string | undefined {
    const all = ctx.res.headers.getSetCookie()
    const sess = all.find((c) => c.startsWith(`${CONFIG.cookieName}=`))
    return sess?.split(';')[0]
}

/** Read a cookie back through a fresh driver: the session data, or null. */
async function replay(
    cookie: string,
    store: AnyStore,
): Promise<Record<string, unknown> | null> {
    const ctx = await ctxWith(cookie)
    const driver = new CookieSessionDriver(ctx, CONFIG, store)
    return await driver.read('sid') as Record<string, unknown> | null
}

Deno.test('user revocation (guard) - logoutEverywhere evicts a remember-me session and drops the tokens (SC-006)', async () => {
    using time = new FakeTime(1_700_000_000_000)
    const store = sharedStore()
    const provider = new RememberProvider()
    provider.seed('remember-v1')

    // Device A authenticates VIA the remember-me cookie → a session with a `sub`.
    const a = await device('remember_web=remember-v1', store, provider)
    await a.guard.authenticate() // via remember → sets sub after regenerate
    await a.session.save() // seal the session cookie (carries sub)
    const cookie = issuedCookie(a.ctx)!
    assertEquals(
        typeof cookie === 'string',
        true,
        'a session cookie was issued',
    )

    // Two seconds later, log out everywhere.
    time.tick(2000)
    await a.guard.logoutEverywhere()

    assertEquals(provider.deletedAll, [1], 'the user’s remember tokens dropped')

    // The pre-eviction session cookie is now refused (iat < epoch).
    const after = await replay(cookie, store)
    assertEquals(after, null, 'the remember-me session is evicted')
})

Deno.test('user revocation (guard) - logoutEverywhere kills the acting session in the SAME second (SC-003)', async () => {
    using _time = new FakeTime(1_700_000_000_000)
    const store = sharedStore()
    const provider = new RememberProvider()

    // Issue an acting session.
    const a = await device(undefined, store, provider)
    await a.guard.loginById(1)
    await a.session.save()
    const cookie = issuedCookie(a.ctx)!

    // Re-open it (stash jti) and log out everywhere in the SAME second.
    const acting = await device(cookie, store, provider)
    await acting.guard.authenticate()
    await acting.guard.logoutEverywhere()

    // iat == epoch (same second) would survive the strict-< epoch check — but the
    // acting jti was revoked by destroy(), so the replayed cookie is refused.
    const after = await replay(cookie, store)
    assertEquals(after, null, 'the acting session dies even in the same second')
})

Deno.test('user revocation (guard) - a captured remember-me cookie cannot re-mint after eviction (SC-006)', async () => {
    using _time = new FakeTime(1_700_000_000_000)
    const store = sharedStore()
    const provider = new RememberProvider()
    provider.seed('captured-v1') // device B’s live remember cookie

    // Device A (session) logs out everywhere.
    const a = await device(undefined, store, provider)
    await a.guard.loginById(1)
    await a.session.save()
    const actingCookie = issuedCookie(a.ctx)!
    const acting = await device(actingCookie, store, provider)
    await acting.guard.authenticate()
    await acting.guard.logoutEverywhere()

    // Device B now presents its captured remember cookie: the token was dropped,
    // so authentication (which would re-mint a session) fails.
    const b = await device('remember_web=captured-v1', store, provider)
    await assertRejects(
        () => b.guard.authenticate(),
        Error,
        undefined,
        'a captured remember-me cookie cannot re-mint after eviction',
    )
})

Deno.test('user revocation (guard) - logoutOthers spares the acting session, refuses older ones (SC-002)', async () => {
    using time = new FakeTime(1_700_000_000_000)
    const store = sharedStore()
    const provider = new RememberProvider()

    // Device A and device B both issue sessions at T0.
    const a = await device(undefined, store, provider)
    await a.guard.loginById(1)
    await a.session.save()
    const cookieA = issuedCookie(a.ctx)!

    const b = await device(undefined, store, provider)
    await b.guard.loginById(1)
    await b.session.save()
    const cookieB = issuedCookie(b.ctx)!

    // Two seconds later, device A logs out others.
    time.tick(2000)
    const actingA = await device(cookieA, store, provider)
    await actingA.guard.authenticate()
    await actingA.guard.logoutOthers()
    await actingA.session.save() // re-seal the rotated survivor
    const cookieARotated = issuedCookie(actingA.ctx)!

    // Device B (older iat) is refused; the rotated acting session authenticates.
    assertEquals(await replay(cookieB, store), null, 'device B is evicted')
    const survivor = await replay(cookieARotated, store)
    assertEquals(survivor?.auth_web, 1, 'the acting session survives')

    // A later eviction from ANOTHER device advances the user's epoch past the
    // rotated survivor's fresh iat. Replaying the rotated cookie through a fresh
    // driver — its `jti` untouched by device C — the per-user epoch check is the
    // SOLE possible refusal (device C never revoked this cookie's nonce). A
    // sub-less rotated cookie (setSubject removed after the rotation) would skip
    // the per-user check and authenticate, so this pins the re-assertion.
    time.tick(2000)
    const c = await device(undefined, store, provider)
    await c.guard.loginById(1)
    await c.guard.logoutOthers() // advances user 1's eviction epoch
    assertEquals(
        await replay(cookieARotated, store),
        null,
        'the rotated survivor is caught by the per-user epoch alone — sub was re-asserted after regenerate',
    )
})

Deno.test('user revocation (guard) - recovery on device A evicts device B end-to-end (SC-006, ASVS 7.4.2)', async () => {
    using time = new FakeTime(1_700_000_000_000)
    const store = sharedStore()
    const provider = new RememberProvider()
    provider.seed('device-b-remember')

    // Device B authenticates via remember-me.
    const b = await device('remember_web=device-b-remember', store, provider)
    await b.guard.authenticate()
    await b.session.save()
    const bSession = issuedCookie(b.ctx)!

    // Device A completes a recovery flow → logoutEverywhere (US1 semantics).
    time.tick(2000)
    const a = await device(undefined, store, provider)
    await a.guard.loginById(1)
    await a.session.save()
    const aCookie = issuedCookie(a.ctx)!
    const actingA = await device(aCookie, store, provider)
    await actingA.guard.authenticate()
    await actingA.guard.logoutEverywhere()

    // Device B’s session is refused and its remember token cannot re-mint.
    assertEquals(await replay(bSession, store), null, 'device B evicted')
    assertEquals(provider.liveTokens.size, 0, 'device B remember token dropped')
})

Deno.test('user revocation (guard) - eviction throws when unauthenticated (security S3 / R7)', async () => {
    const store = sharedStore()
    const provider = new MockSessionProvider()
    const { guard } = await device(undefined, store, provider)

    await assertRejects(
        () => guard.logoutEverywhere(),
        AuthenticationRequiredError,
        undefined,
        'logoutEverywhere refuses to evict an undefined subject',
    )
    await assertRejects(
        () => guard.logoutOthers(),
        AuthenticationRequiredError,
        undefined,
        'logoutOthers refuses to evict an undefined subject',
    )
})

Deno.test('user revocation - the public session surface exposes no raw subject-taking revoke (R7)', () => {
    const names = Object.keys(sessionSurface)
    assertEquals(
        names.includes('revokeUser'),
        false,
        'revokeUser is not a public session export',
    )
    assertEquals(
        names.includes('userRevokedSince'),
        false,
        'userRevokedSince is not a public session export',
    )
})

Deno.test('user revocation (guard) - login() sets an evictable sub (arch A5)', async () => {
    using time = new FakeTime(1_700_000_000_000)
    const store = sharedStore()
    const provider = new RememberProvider()

    // Authenticate via the public credential login() establisher.
    const a = await device(undefined, store, provider)
    await a.guard.login('alice@example.com', 'password123')
    await a.session.save()
    const cookie = issuedCookie(a.ctx)!

    // Another device evicts the user. The login()-established session is refused
    // by the per-user epoch alone (its jti is untouched by device B), proving
    // login() set a sub after regenerate (sub === d[sessionKeyName]).
    time.tick(2000)
    const b = await device(undefined, store, provider)
    await b.guard.loginById(1)
    await b.guard.logoutOthers() // advances user 1's epoch, leaves A's jti intact
    assertEquals(
        await replay(cookie, store),
        null,
        'the login()-established session is evicted — login() set a sub',
    )
})
