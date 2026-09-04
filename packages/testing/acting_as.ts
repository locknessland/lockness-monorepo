/**
 * @fileoverview `actingAs` — authenticate a test request as a given user, and
 * small fakes for building test identities.
 *
 * **Test-only, and safe by construction:** `actingAs` sets the user **only on
 * the request context** (`c.set('auth', { user })`) — exactly what a stub auth
 * middleware would do. It never mints a session or a token the production auth
 * stack would accept, and never writes to a real store. Mounted in a real app
 * by mistake it is inert, because the real auth middleware overwrites the
 * context on every request.
 *
 * @module @lockness/testing/acting_as
 */

import type { MiddlewareHandler } from 'hono'
import type { Authenticatable } from '@lockness/auth'

/**
 * A middleware that authenticates every request as `user` by setting it on the
 * request context. Mount it before the routes under test.
 *
 * @param user - The user to act as.
 * @returns A middleware setting `c.get('auth').user` to `user`.
 *
 * @example
 * ```typescript
 * app.use('*', actingAs(fakeUser({ id: 7 })))
 * const res = await testClient(app).get('/profile')
 * ```
 */
export function actingAs(user: Authenticatable): MiddlewareHandler {
    return async (c, next) => {
        c.set('auth', { user })
        await next()
    }
}

/**
 * Build a synthetic {@link Authenticatable} for tests. Never use real
 * credentials — the `password` here is a placeholder, not a real secret.
 *
 * @param overrides - Fields to override on the default fake.
 * @returns A synthetic user.
 *
 * @example
 * ```typescript
 * const admin = fakeUser({ id: 1, email: 'admin@example.test', isAdmin: true })
 * ```
 */
export function fakeUser(
    overrides: Partial<Authenticatable> & Record<string, unknown> = {},
): Authenticatable {
    return {
        id: 1,
        email: 'user@example.test',
        ...overrides,
    }
}
