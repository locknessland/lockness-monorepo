/**
 * Environment port tests (T005).
 *
 * Proves the A1 testability contract: the environment signal can be faked so a
 * consuming service's production/development branches are both reachable in a
 * unit test, and the real port sources its value from `config/app.ts`.
 */

import { assertEquals } from '@std/assert'
import { Environment } from '../../app/service/environment.ts'

Deno.test('Environment - real port exposes a boolean isProduction', () => {
    const env = new Environment()
    assertEquals(typeof env.isProduction, 'boolean')
})

Deno.test('Environment - real port is not production under the test env', () => {
    // APP_ENV is unset in the test runner -> config defaults to development.
    const env = new Environment()
    assertEquals(env.isProduction, false)
})

// The A1 fake-injection contract — that a faked Environment actually switches a
// consumer's production/development branch — is witnessed where it matters, in
// post_service_list.test.ts and post_service_get.test.ts, which inject a fake
// Environment into the real PostService and assert the branch taken. Asserting
// object literals here would exercise no unit, so that check lives there.
