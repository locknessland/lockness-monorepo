/**
 * @fileoverview `productionRisk()` — an unreadable `APP_ENV` is a production
 * risk; an unset one is not (#624, plan 274 §5 "Production-guard reading of
 * APP_ENV").
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name**: the unreadable
 * rows stub Deno's env permission.
 *
 * @module @lockness/contract/tests/environment_guard
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { productionRisk, UNREADABLE_APP_ENV } from '../environment_guard.ts'
import {
    isExplicitlyDevelopment,
    isProduction,
    resolveEnvName,
} from '../environment.ts'
import { withEnv } from './env_fixture.ts'
import { withUnreadableEnv } from './env_permission_fixture.ts'

const READABLE_ROWS: [string | undefined, ReturnType<typeof productionRisk>][] =
    [
        [undefined, undefined],
        ['', undefined],
        ['production', 'production'],
        [' Production\r', 'production'],
        ['staging', undefined],
        ['development', undefined],
    ]

Deno.test('productionRisk - a readable APP_ENV is a risk only when it names production', () => {
    for (const [appEnv, expected] of READABLE_ROWS) {
        withEnv({ APP_ENV: appEnv }, () => {
            assertEquals(
                productionRisk(),
                expected,
                `APP_ENV=${JSON.stringify(appEnv)}`,
            )
        })
    }
})

Deno.test('productionRisk - an unreadable APP_ENV is a risk, whatever it holds', async () => {
    for (const appEnv of [undefined, 'development', 'production']) {
        await withEnv({ APP_ENV: appEnv }, async () => {
            const { result, unreadableReads } = await withUnreadableEnv(
                ['APP_ENV'],
                productionRisk,
            )
            assertEquals(result, 'unreadable', `APP_ENV=${appEnv}`)
            assertEquals(unreadableReads, 0, 'the read must never prompt')
        })
    }
})

Deno.test('productionRisk - unreadable leaves the public predicates reading it as absent', async () => {
    await withEnv({ APP_ENV: 'production' }, async () => {
        const { result } = await withUnreadableEnv(['APP_ENV'], () => ({
            production: isProduction(),
            explicitDevelopment: isExplicitlyDevelopment(),
            name: resolveEnvName(),
        }))
        assertEquals(result, {
            production: false,
            explicitDevelopment: false,
            name: 'development',
        })
    })
})

Deno.test('UNREADABLE_APP_ENV names the grant that fixes it', () => {
    assertStringIncludes(UNREADABLE_APP_ENV, '--allow-env=APP_ENV')
    assertStringIncludes(UNREADABLE_APP_ENV, 'possibly production')
})
