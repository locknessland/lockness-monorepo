/**
 * @fileoverview Remember-me credential absolute lifetime cap (#146).
 *
 * #143 bounded the session cookie; the remember-me token that can re-mint a
 * session stayed a rolling 30-day window with no ceiling — refresh it forever.
 * This suite pins the cap: a first-issuance instant preserved across renewals
 * (US1), a capped-out credential torn down not merely rejected (US2), a legacy
 * token frozen at `createdAt` on first recycle (US3), and off-by-default that is
 * fail-closed on `0` (US4).
 *
 * Each behavioural test is NEGATIVE-tested: it fails against the pre-#146 guard,
 * which has no cap, no freeze, and no `0`-rejection.
 *
 * @module @lockness/auth/tests/remember_absolute_lifetime
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { SessionGuard } from '../guards/session_guard.ts'
import { type Env, MockSessionProvider } from './mocks.ts'
import type { RememberMeToken } from '../types.ts'

const ALICE = {
    id: 1,
    email: 'alice@example.com',
    password: 'password123',
    name: 'Alice',
}

/**
 * A remember-me provider whose `verifyRememberToken` returns a mutable "current"
 * token and whose `recycleRememberToken` bare-copies `firstIssuedAt` forward —
 * the contract the guard relies on (#146).
 */
class CapProvider extends MockSessionProvider {
    deleted: Array<string | number> = []
    recycles = 0
    current: RememberMeToken

    constructor(initial: RememberMeToken) {
        super()
        this.current = initial
    }

    createRememberToken(): Promise<RememberMeToken> {
        const now = new Date()
        return Promise.resolve({
            identifier: 'created',
            value: 'v',
            hash: 'h',
            userId: 1,
            expiresAt: new Date(now.getTime() + 3_600_000),
            createdAt: now,
            firstIssuedAt: now,
        })
    }

    verifyRememberToken(): Promise<
        { user: unknown; token: RememberMeToken } | null
    > {
        return Promise.resolve({ user: ALICE, token: this.current })
    }

    deleteRememberToken(
        _user: unknown,
        tokenId: string | number,
    ): Promise<void> {
        this.deleted.push(tokenId)
        return Promise.resolve()
    }

    // New (#146) signature: the whole verified token. Bare-copy the origin — no
    // fallback here, that policy is the guard's.
    recycleRememberToken(
        _user: unknown,
        token: RememberMeToken,
    ): Promise<RememberMeToken> {
        this.recycles++
        const now = new Date()
        const next: RememberMeToken = {
            identifier: `recycled-${this.recycles}`,
            value: 'v',
            hash: 'h',
            userId: 1,
            expiresAt: new Date(now.getTime() + 3_600_000),
            createdAt: now,
            firstIssuedAt: token.firstIssuedAt,
        }
        this.current = next
        return Promise.resolve(next)
    }
}

/** A ctx carrying a remember-me cookie and a session with no auth key set. */
async function makeCtx(): Promise<
    { ctx: Context; data: Map<string, unknown> }
> {
    const data = new Map<string, unknown>()
    const session = {
        get: (k: string) => data.get(k),
        set: (k: string, v: unknown) => data.set(k, v),
        forget: (k: string) => data.delete(k),
        regenerate: () => Promise.resolve(),
        destroy: () => {
            data.clear()
            return Promise.resolve()
        },
    }
    const app = new Hono<Env>()
    let ctx!: Context
    app.all('*', (c) => {
        // deno-lint-ignore no-explicit-any
        c.set('session', session as any)
        ctx = c
        return c.body(null)
    })
    await app.request('/', { headers: { cookie: 'remember_web=tokvalue' } })
    return { ctx, data }
}

function guardWith(ctx: Context, provider: CapProvider, cap?: number) {
    return new SessionGuard(
        'web',
        ctx,
        // deno-lint-ignore no-explicit-any
        provider as any,
        { useRememberMeTokens: true, rememberMeAbsoluteLifetime: cap },
    )
}

Deno.test('remember cap - a token renewed across time still ages out at the ceiling (US1)', async () => {
    using time = new FakeTime()
    const A = 100 // seconds
    const t0 = new Date()
    const provider = new CapProvider({
        identifier: 'orig',
        value: 'v',
        hash: 'h',
        userId: 1,
        expiresAt: new Date(t0.getTime() + 3_600_000),
        createdAt: t0,
        firstIssuedAt: t0,
    })

    // Young: authenticates and renews — the origin is preserved at t0.
    const g1 = guardWith((await makeCtx()).ctx, provider, A)
    assertEquals((await g1.authenticate()).id, 1)
    assertEquals(
        provider.current.firstIssuedAt?.getTime(),
        t0.getTime(),
        'renewal preserved the origin, not re-minted it',
    )

    // Two more renewals, each still under the ceiling.
    time.tick(40_000)
    assertEquals(
        (await guardWith((await makeCtx()).ctx, provider, A).authenticate()).id,
        1,
    )
    time.tick(40_000) // 80s < 100
    assertEquals(
        (await guardWith((await makeCtx()).ctx, provider, A).authenticate()).id,
        1,
    )

    // Cross the ceiling: now - t0 = 120s > 100, despite THREE renewals.
    time.tick(40_000)
    assertEquals(
        await guardWith((await makeCtx()).ctx, provider, A).check(),
        false,
        'the cap fires even though every renewal kept the credential young',
    )
})

Deno.test('remember cap - a capped-out credential is deleted and its cookie cleared, no session minted (US2)', async () => {
    using time = new FakeTime()
    const A = 10
    const t0 = new Date()
    const provider = new CapProvider({
        identifier: 'stale',
        value: 'v',
        hash: 'h',
        userId: 1,
        expiresAt: new Date(t0.getTime() + 3_600_000),
        createdAt: t0,
        firstIssuedAt: t0,
    })
    time.tick((A + 5) * 1000)

    const { ctx, data } = await makeCtx()
    const guard = guardWith(ctx, provider, A)

    assertEquals(await guard.check(), false)
    assertEquals(
        provider.deleted,
        ['stale'],
        'the stale credential was deleted server-side',
    )
    assertEquals(provider.recycles, 0, 'a capped token is never recycled')
    assertEquals(
        data.has('auth_web'),
        false,
        'no session was minted on the refused request',
    )

    const setCookie = ctx.res.headers.get('set-cookie') ?? ''
    assert(
        setCookie.includes('remember_web=') && /max-age=0/i.test(setCookie),
        `the remember cookie was cleared (got: ${setCookie})`,
    )
})

Deno.test('remember cap - a legacy token (no firstIssuedAt) is frozen at createdAt and ages out (US3)', async () => {
    using time = new FakeTime()
    const A = 100
    const t0 = new Date()
    // Legacy: firstIssuedAt ABSENT; only createdAt at t0.
    const provider = new CapProvider({
        identifier: 'legacy',
        value: 'v',
        hash: 'h',
        userId: 1,
        expiresAt: new Date(t0.getTime() + 3_600_000),
        createdAt: t0,
    })

    // Young: the first recycle freezes the origin at createdAt(t0).
    assertEquals(
        (await guardWith((await makeCtx()).ctx, provider, A).authenticate()).id,
        1,
    )
    assertEquals(
        provider.current.firstIssuedAt?.getTime(),
        t0.getTime(),
        'first recycle froze the origin at createdAt',
    )

    // Past the ceiling: the frozen origin ages out despite the renewal.
    time.tick((A + 1) * 1000)
    assertEquals(
        await guardWith((await makeCtx()).ctx, provider, A).check(),
        false,
        'the legacy credential ages out from its frozen origin, not a rolling one',
    )
})

Deno.test('remember cap - the ceiling is exclusive: age == cap passes, one tick past refuses (US1 boundary)', async () => {
    using time = new FakeTime()
    const A = 100
    const t0 = new Date()
    const mkProvider = () =>
        new CapProvider({
            identifier: 'edge',
            value: 'v',
            hash: 'h',
            userId: 1,
            expiresAt: new Date(t0.getTime() + 3_600_000),
            createdAt: t0,
            firstIssuedAt: t0,
        })

    // Exactly at the ceiling: now - origin == A*1000, and the guard uses `>`, so
    // the credential is still accepted.
    time.tick(A * 1000)
    assertEquals(
        (await guardWith((await makeCtx()).ctx, mkProvider(), A).authenticate())
            .id,
        1,
        'age exactly equal to the cap is still within the ceiling',
    )

    // One millisecond past: refused.
    time.tick(1)
    assertEquals(
        await guardWith((await makeCtx()).ctx, mkProvider(), A).check(),
        false,
        'one tick past the ceiling is refused',
    )
})

Deno.test('remember cap - unset means no cap; zero is rejected, not silently off (US4)', async () => {
    using time = new FakeTime()
    const t0 = new Date()
    const provider = new CapProvider({
        identifier: 'old',
        value: 'v',
        hash: 'h',
        userId: 1,
        expiresAt: new Date(t0.getTime() + 3_600_000),
        createdAt: t0,
        firstIssuedAt: t0,
    })

    // A year later, with no cap configured, an ancient token still authenticates.
    time.tick(365 * 24 * 3_600 * 1000)
    const guard = guardWith((await makeCtx()).ctx, provider, undefined)
    assertEquals(
        (await guard.authenticate()).id,
        1,
        'with no cap, an ancient token still authenticates (no regression)',
    )

    // Zero must be REJECTED at construction — never silently treated as "off".
    const { ctx: ctxZero } = await makeCtx()
    assertThrows(() => guardWith(ctxZero, provider, 0), RangeError)
})
