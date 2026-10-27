/**
 * @fileoverview Tests for the @Authorize/@Can route-boundary middleware (#194).
 *
 * @module @lockness/auth/tests/authorize_decorator
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { AuthorizationError, authorizeMiddleware, gate } from '../mod.ts'
import type { Context } from 'hono'

interface FakeCtxOptions {
    user?: { id: number; email: string }
    params?: Record<string, string>
}

/** Minimal Context stand-in exposing only what the middleware reads. */
function fakeCtx(opts: FakeCtxOptions): Context {
    return {
        get: (
            key: string,
        ) => (key === 'auth' ? { user: opts.user } : undefined),
        req: { param: (name: string) => opts.params?.[name] },
    } as unknown as Context
}

const user = { id: 1, email: 'a@b.c' }

Deno.test('authorizeMiddleware - calls next when the gate allows', async () => {
    gate.reset()
    gate.define('read', () => true)
    let nexted = false
    await authorizeMiddleware('read')(
        fakeCtx({ user }),
        () => {
            nexted = true
            return Promise.resolve()
        },
    )
    assert(nexted)
    gate.reset()
})

Deno.test('authorizeMiddleware - throws 403 and skips next when denied', async () => {
    gate.reset()
    gate.define('read', () => false)
    let nexted = false
    const error = await assertRejects(
        () =>
            authorizeMiddleware('read')(fakeCtx({ user }), () => {
                nexted = true
                return Promise.resolve()
            }),
        AuthorizationError,
    )
    assertEquals(error.status, 403)
    assertEquals(nexted, false)
    gate.reset()
})

Deno.test('authorizeMiddleware - fails closed for an unauthenticated request', async () => {
    gate.reset()
    gate.define('read', () => true) // would allow — but there is no user
    await assertRejects(
        () => authorizeMiddleware('read')(fakeCtx({}), () => Promise.resolve()),
        AuthorizationError,
    )
    gate.reset()
})

Deno.test('authorizeMiddleware - forwards named route params to the ability', async () => {
    gate.reset()
    gate.define('view-team', (_user, teamId) => teamId === '42')
    // Matching param is allowed.
    let nexted = false
    await authorizeMiddleware('view-team', ['teamId'])(
        fakeCtx({ user, params: { teamId: '42' } }),
        () => {
            nexted = true
            return Promise.resolve()
        },
    )
    assert(nexted)
    // A different param value is denied.
    await assertRejects(
        () =>
            authorizeMiddleware('view-team', ['teamId'])(
                fakeCtx({ user, params: { teamId: '99' } }),
                () => Promise.resolve(),
            ),
        AuthorizationError,
    )
    gate.reset()
})
