/**
 * @fileoverview {@link assertNotProduction} fails closed on an unreadable
 * `APP_ENV` (#624): a `deno compile` binary or a run with a narrowed
 * `--allow-env` cannot tell a production database from a dev one, so a
 * destructive command refuses unless the operator overrides it explicitly.
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name**: the unreadable
 * rows stub Deno's env permission.
 *
 * @module @lockness/drizzle/tests/production_guard_unreadable
 */

import { assertStringIncludes, assertThrows } from '@std/assert'
import { assertNotProduction } from '../production_guard.ts'
import { withEnv } from '../../contract/tests/env_fixture.ts'
import { withUnreadableEnv } from '../../contract/tests/env_permission_fixture.ts'

Deno.test('assertNotProduction - an unreadable APP_ENV refuses, naming the grant and the override', async () => {
    await withEnv({ APP_ENV: undefined }, async () => {
        await withUnreadableEnv(['APP_ENV'], () => {
            const error = assertThrows(
                () => assertNotProduction('db:seed'),
                Error,
            )
            assertStringIncludes(error.message, 'db:seed')
            assertStringIncludes(error.message, '--allow-env=APP_ENV')
            assertStringIncludes(error.message, '--allow-production')
            assertStringIncludes(error.message, '{ allowProduction: true }')
        })
    })
})

Deno.test('assertNotProduction - an unreadable APP_ENV passes with the explicit override', async () => {
    await withEnv({ APP_ENV: undefined }, async () => {
        await withUnreadableEnv(['APP_ENV'], () => {
            assertNotProduction('db:seed', true)
        })
    })
})

Deno.test('assertNotProduction - a readable, unset APP_ENV still passes', () => {
    withEnv({ APP_ENV: undefined }, () => assertNotProduction('db:seed'))
})

Deno.test('assertNotProduction - a readable APP_ENV=production keeps its own message', () => {
    withEnv({ APP_ENV: 'production' }, () => {
        const error = assertThrows(
            () => assertNotProduction('db:seed'),
            Error,
        )
        assertStringIncludes(error.message, '(APP_ENV is "production")')
    })
})

Deno.test('assertNotProduction - the DENO_ENV tripwire still runs first under an unreadable APP_ENV', async () => {
    await withEnv({ APP_ENV: undefined, DENO_ENV: 'production' }, async () => {
        await withUnreadableEnv(['APP_ENV'], () => {
            // The override does not reach the tripwire, so this is its refusal.
            const error = assertThrows(
                () => assertNotProduction('db:seed', true),
                Error,
            )
            assertStringIncludes(error.message, 'DENO_ENV=production')
        })
    })
})
