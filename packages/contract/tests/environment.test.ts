/**
 * Tests for the environment-name resolution helpers (#27/A2, rewritten for
 * #504). `APP_ENV` is the only signal: every predicate derives from one
 * normalised read of it, so `DENO_ENV` changes nothing and the production and
 * explicit-development predicates can never both hold.
 *
 * @module @lockness/contract/tests/environment
 */

import { assert, assertEquals } from '@std/assert'
import {
    isDevelopment,
    isExplicitlyDevelopment,
    isProduction,
    resolveEnvName,
} from '../environment.ts'
import { withEnv } from './env_fixture.ts'

/** What every predicate must answer for one `APP_ENV` value. */
interface Expected {
    name: string
    production: boolean
    development: boolean
    explicitDevelopment: boolean
}

const UNSET: Expected = {
    name: 'development',
    production: false,
    development: true,
    explicitDevelopment: false,
}
const PRODUCTION: Expected = {
    name: 'production',
    production: true,
    development: false,
    explicitDevelopment: false,
}

/** The `APP_ENV` rows of the matrix, each with its one expected answer. */
const APP_ENV_ROWS: [string | undefined, Expected][] = [
    [undefined, UNSET],
    ['', UNSET],
    ['production', PRODUCTION],
    ['Production', PRODUCTION],
    [' production\r', PRODUCTION],
    ['development', {
        name: 'development',
        production: false,
        development: true,
        explicitDevelopment: true,
    }],
    ['staging', {
        name: 'staging',
        production: false,
        development: false,
        explicitDevelopment: false,
    }],
]

/** `DENO_ENV` is no longer read: none of these may change an answer. */
const DENO_ENV_COLUMNS: (string | undefined)[] = [
    undefined,
    'production',
    'development',
]

Deno.test('the predicates depend on APP_ENV alone, across every DENO_ENV', () => {
    for (const [appEnv, expected] of APP_ENV_ROWS) {
        for (const denoEnv of DENO_ENV_COLUMNS) {
            withEnv({ APP_ENV: appEnv, DENO_ENV: denoEnv }, () => {
                const row = `APP_ENV=${JSON.stringify(appEnv)} DENO_ENV=${
                    JSON.stringify(denoEnv)
                }`
                assertEquals(resolveEnvName(), expected.name, row)
                assertEquals(isProduction(), expected.production, row)
                assertEquals(isDevelopment(), expected.development, row)
                assertEquals(
                    isExplicitlyDevelopment(),
                    expected.explicitDevelopment,
                    row,
                )
            })
        }
    }
})

Deno.test('isProduction and isExplicitlyDevelopment are never both true', () => {
    for (const [appEnv] of APP_ENV_ROWS) {
        for (const denoEnv of DENO_ENV_COLUMNS) {
            withEnv({ APP_ENV: appEnv, DENO_ENV: denoEnv }, () => {
                assert(
                    !(isProduction() && isExplicitlyDevelopment()),
                    `both true under APP_ENV=${
                        JSON.stringify(appEnv)
                    } DENO_ENV=${JSON.stringify(denoEnv)}`,
                )
            })
        }
    }
})

Deno.test('resolveEnvName - NotCapable read resolves to development, never throws', () => {
    // deno-lint-ignore no-explicit-any
    const envAny = Deno.env as any
    const original = envAny.get
    try {
        envAny.get = () => {
            throw new Deno.errors.NotCapable('Requires env access')
        }
        assertEquals(resolveEnvName(), 'development')
        assert(!isProduction())
        assert(isDevelopment())
        assert(!isExplicitlyDevelopment(), 'NotCapable is not explicit dev')
    } finally {
        envAny.get = original
    }
})

Deno.test('a read failure other than NotCapable is not swallowed', () => {
    // deno-lint-ignore no-explicit-any
    const envAny = Deno.env as any
    const original = envAny.get
    try {
        envAny.get = () => {
            throw new TypeError('unexpected')
        }
        let thrown: unknown
        try {
            resolveEnvName()
        } catch (error) {
            thrown = error
        }
        assert(thrown instanceof TypeError, 'only NotCapable means unset')
    } finally {
        envAny.get = original
    }
})
