/**
 * @fileoverview End-to-end tests for the authorization flow (#196).
 *
 * Exercises the whole path through a live Hono app: an authenticated request →
 * `authorizeMiddleware` (the primitive `@Authorize`/`@Can` wrap) → the singleton
 * `gate` → a policy or the RBAC fallback → an HTTP 200 (allowed) or 403
 * (denied). An `onError` handler maps {@link AuthorizationError} to its status,
 * mirroring what the framework's error-handler registry does in a real app.
 *
 * The `@Authorize` decorator itself (the thin `UseMiddleware` wrapper) is
 * unit-tested in `authorize_decorator.test.ts`; wiring it through controller
 * discovery belongs to `@lockness/core`, which must not be imported here (DAG).
 *
 * @module @lockness/auth/tests/authorization_e2e
 */

import { assertEquals } from '@std/assert'
import { Hono } from 'hono'
import {
    AuthorizationError,
    authorizeMiddleware,
    gate,
    StaticRoleRepository,
    useRbac,
} from '../mod.ts'
import type { Authenticatable } from '../mod.ts'

interface User extends Authenticatable {
    id: number
    email: string
}

/** Post id → owner user id (the ownership policy's source of truth). */
const POST_OWNER: Record<string, number> = { '42': 1 }

/**
 * Build a live app wiring the full authorization flow:
 * - a stub auth middleware that reads `x-user-id` to attach a user (or none),
 * - an ownership policy for `post.update`,
 * - an RBAC fallback granting `reports.*` to the `analyst` role (user 2),
 * - two protected routes, and an `onError` mapping AuthorizationError → status.
 */
function buildApp() {
    gate.reset()
    gate.policy('post', {
        update: (user, postId) => POST_OWNER[postId as string] === user.id,
    })
    useRbac(
        gate,
        new StaticRoleRepository(
            new Map([[2, [{ name: 'analyst', permissions: ['reports.*'] }]]]),
        ),
    )

    const app = new Hono<{ Variables: { auth: { user?: User } } }>()

    // Stub authentication: x-user-id attaches a user; absent → unauthenticated.
    app.use('*', async (c, next) => {
        const id = c.req.header('x-user-id')
        if (id) {
            c.set('auth', { user: { id: Number(id), email: `u${id}@x.io` } })
        }
        await next()
    })

    app.onError((err, c) => {
        if (err instanceof AuthorizationError) {
            return c.json({ error: err.message }, err.status)
        }
        return c.json({ error: 'server' }, 500)
    })

    // Policy-guarded: only the post's owner may update it.
    app.post(
        '/posts/:id/edit',
        authorizeMiddleware('post.update', ['id']),
        (c) => c.json({ ok: true }),
    )

    // RBAC-guarded: no explicit ability/policy — the role fallback decides.
    app.get(
        '/reports',
        authorizeMiddleware('reports.view'),
        (c) => c.json({ ok: true }),
    )

    return app
}

Deno.test('e2e - the owner is allowed through the policy (200)', async () => {
    const app = buildApp()
    const res = await app.request('/posts/42/edit', {
        method: 'POST',
        headers: { 'x-user-id': '1' },
    })
    assertEquals(res.status, 200)
    gate.reset()
})

Deno.test('e2e - a non-owner is denied by the policy (403)', async () => {
    const app = buildApp()
    const res = await app.request('/posts/42/edit', {
        method: 'POST',
        headers: { 'x-user-id': '2' },
    })
    assertEquals(res.status, 403)
    // The response carries the AuthorizationError message, not a generic 500.
    assertEquals(await res.json(), {
        error: 'Not authorized to perform "post.update".',
    })
    gate.reset()
})

Deno.test('e2e - an unauthenticated request is denied fail-closed (403)', async () => {
    const app = buildApp()
    const res = await app.request('/posts/42/edit', { method: 'POST' })
    assertEquals(res.status, 403)
    gate.reset()
})

Deno.test('e2e - an RBAC role grants an ability with no explicit rule (200)', async () => {
    const app = buildApp()
    const res = await app.request('/reports', {
        headers: { 'x-user-id': '2' }, // holds analyst → reports.*
    })
    assertEquals(res.status, 200)
    gate.reset()
})

Deno.test('e2e - a user without the role is denied the RBAC ability (403)', async () => {
    const app = buildApp()
    const res = await app.request('/reports', {
        headers: { 'x-user-id': '1' }, // no role → no reports.view
    })
    assertEquals(res.status, 403)
    gate.reset()
})
