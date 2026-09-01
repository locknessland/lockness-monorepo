/**
 * @fileoverview Logout invalidates the remember-me credential (#143, Security F4).
 *
 * The #143 revocation work makes a session logout revoke the session cookie. But
 * the remember-me credential bypasses the session `open()` path and can re-mint a
 * fresh session, so a session-based logout that leaves the remember-me token live
 * is a durable-logout hole. `logout()` therefore now invalidates the remember-me
 * token whenever one is present — NOT only when this request authenticated via
 * remember (the dropped `viaRemember` gate).
 *
 * @module @lockness/auth/tests/session_logout_revocation
 */

import { assertEquals } from '@std/assert'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { SessionGuard } from '../guards/session_guard.ts'
import { type Env, MockSessionProvider } from './mocks.ts'
import type { RememberMeToken } from '../types.ts'

function token(id: string): RememberMeToken {
    return {
        identifier: id,
        value: 'tok',
        hash: 'hash',
        userId: 1,
        expiresAt: new Date(Date.now() + 3_600_000),
        createdAt: new Date(),
    }
}

/** A session provider that records remember-me deletions. */
class RememberProvider extends MockSessionProvider {
    deleted: Array<string | number> = []

    createRememberToken(): Promise<RememberMeToken> {
        return Promise.resolve(token('id1'))
    }
    verifyRememberToken(): Promise<{ user: unknown; token: RememberMeToken }> {
        return Promise.resolve({
            user: {
                id: 1,
                email: 'alice@example.com',
                password: 'password123',
                name: 'Alice',
            },
            token: token('id1'),
        })
    }
    deleteRememberToken(
        _user: unknown,
        tokenId: string | number,
    ): Promise<void> {
        this.deleted.push(tokenId)
        return Promise.resolve()
    }
    recycleRememberToken(): Promise<RememberMeToken> {
        return Promise.resolve(token('id2'))
    }
}

Deno.test('session logout - invalidates the remember-me token even when not via remember (SC-011)', async () => {
    // A session store already holding the auth key: the user is logged in via
    // session, NOT via the remember cookie.
    const data = new Map<string, unknown>([['auth_web', 1]])
    const mockSession = {
        get: (k: string) => data.get(k),
        set: (k: string, v: unknown) => data.set(k, v),
        forget: (k: string) => data.delete(k),
        regenerate: () => Promise.resolve(),
        destroy: () => {
            data.clear()
            return Promise.resolve()
        },
    }

    // A context whose REQUEST carries a remember-me cookie, with the session set.
    const app = new Hono<Env>()
    let ctx!: Context
    app.all('*', (c) => {
        // deno-lint-ignore no-explicit-any
        c.set('session', mockSession as any)
        ctx = c
        return c.body(null)
    })
    await app.request('/', { headers: { cookie: 'remember_web=tokvalue' } })

    const provider = new RememberProvider()
    const guard = new SessionGuard(
        'web',
        ctx,
        // deno-lint-ignore no-explicit-any
        provider as any,
        { useRememberMeTokens: true },
    )

    await guard.authenticate() // via SESSION → viaRemember stays false
    assertEquals(
        guard.viaRemember,
        false,
        'authenticated via session, not remember',
    )

    await guard.logout()

    assertEquals(
        provider.deleted,
        ['id1'],
        'logout invalidated the remember-me token despite not authenticating via it',
    )
})

Deno.test('session logout - guard.logout() revokes the session so a replayed cookie is refused (SC-009)', async () => {
    const {
        CookieSessionDriver,
        SessionStore,
        generateAppKey,
    } = await import('@lockness/session')
    type SessionConfig = import('@lockness/session').SessionConfig

    const KEY = generateAppKey()
    const config: SessionConfig = {
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

    // A shared in-memory revocation store (structurally a RevocationStore).
    const revoked = new Set<string>()
    const store = {
        isRevoked: (jti: string) => Promise.resolve(revoked.has(jti)),
        revoke: (jti: string) => {
            revoked.add(jti)
            return Promise.resolve()
        },
        close: () => Promise.resolve(),
    }

    async function ctxWith(cookie?: string): Promise<Context> {
        const app = new Hono()
        let captured!: Context
        app.all('*', (c) => {
            captured = c
            return c.body(null)
        })
        await app.request(
            '/',
            cookie ? { headers: { cookie } } : undefined,
        )
        return captured
    }

    // Phase A — issue a session cookie via the real driver.
    const ctxA = await ctxWith()
    const driverA = new CookieSessionDriver(ctxA, config, store as never)
    const storeA = new SessionStore('sid', driverA, {}, config)
    storeA.set('auth_web', 1)
    await storeA.save()
    const captured = ctxA.res.headers.get('set-cookie')!.split(';')[0]

    // Phase B — log out THROUGH the guard over that session.
    const ctxB = await ctxWith(captured)
    const driverB = new CookieSessionDriver(ctxB, config, store as never)
    const dataB = await driverB.read('sid') // stashes the jti
    assertEquals(
        dataB?.auth_web,
        1,
        'the issued session read back before logout',
    )
    const storeB = new SessionStore('sid', driverB, dataB ?? {}, config)
    // deno-lint-ignore no-explicit-any
    ctxB.set('session', storeB as any)
    const guard = new SessionGuard(
        'web',
        ctxB,
        // deno-lint-ignore no-explicit-any
        new MockSessionProvider() as any,
    )
    await guard.logout() // must reach driver.destroy() → revoke (NOT forget)

    // Phase C — replay the captured pre-logout cookie: refused because revoked.
    const ctxC = await ctxWith(captured)
    const driverC = new CookieSessionDriver(ctxC, config, store as never)
    assertEquals(
        await driverC.read('sid'),
        null,
        'the replayed pre-logout cookie is refused — logout revoked it (destroy, not forget)',
    )
})
