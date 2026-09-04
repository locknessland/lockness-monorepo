/**
 * @fileoverview `@lockness/testing` — the shared test-support harness.
 *
 * **Test-only. Internal and unpublished.** Import it from `tests/` only; it is
 * never part of the runtime dependency graph and must never be imported by
 * application or framework runtime code. `actingAs` authenticates only on the
 * request context and mints no real credential, so it cannot bypass a real auth
 * stack even if misused.
 *
 * @module @lockness/testing
 *
 * @example
 * ```typescript
 * import { actingAs, fakeUser, testClient } from '@lockness/testing'
 *
 * app.use('*', actingAs(fakeUser({ id: 1 })))
 * const res = await testClient(app).get('/profile')
 * assertEquals(res.status, 200)
 * ```
 */

export * from './http_client.ts'
export * from './acting_as.ts'
export * from './db_assertions.ts'
