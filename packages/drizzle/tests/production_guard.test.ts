/**
 * @fileoverview Tests for {@link assertNotProduction} — the centralised guard
 * that refuses destructive dev tooling (seeding, factory writes) against a
 * production database unless an explicit override is passed (#258).
 *
 * Each test saves and restores `APP_ENV`/`DENO_ENV` so environment mutation
 * never leaks into sibling tests.
 *
 * @module @lockness/drizzle/tests/production_guard
 */

import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { assertNotProduction } from '../production_guard.ts'

/**
 * Run `fn` with `APP_ENV`/`DENO_ENV` forced to the given values, restoring the
 * prior values (or absence) afterwards.
 */
function withEnv(
    env: { APP_ENV?: string; DENO_ENV?: string },
    fn: () => void,
): void {
    const prevApp = Deno.env.get('APP_ENV')
    const prevDeno = Deno.env.get('DENO_ENV')
    const set = (key: string, value: string | undefined) =>
        value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value)
    // Clear both first so a leftover value can't mask the intended combo.
    Deno.env.delete('APP_ENV')
    Deno.env.delete('DENO_ENV')
    set('APP_ENV', env.APP_ENV)
    set('DENO_ENV', env.DENO_ENV)
    try {
        fn()
    } finally {
        set('APP_ENV', prevApp)
        set('DENO_ENV', prevDeno)
    }
}

Deno.test('assertNotProduction - throws under APP_ENV=production without override', () => {
    withEnv({ APP_ENV: 'production' }, () => {
        const error = assertThrows(
            () => assertNotProduction('db:seed'),
            Error,
        )
        // The message must name the operation and how to override it.
        const message = error.message
        assertEquals(message.includes('db:seed'), true)
        assertEquals(message.includes('--allow-production'), true)
    })
})

Deno.test('assertNotProduction - a DENO_ENV conflicting with APP_ENV refuses, naming APP_ENV (#504)', () => {
    // DENO_ENV is no longer read, so DENO_ENV=production alone is not
    // production — but it was until v0.5.0, and a seed run against what the
    // operator still believes is production must not slip through on the
    // rename. The refusal is the tripwire's, and it holds even with the
    // override: the override authorises production, not an unknown environment.
    for (
        const env of [{ DENO_ENV: 'production' }, {
            DENO_ENV: 'production',
            APP_ENV: 'development',
        }]
    ) {
        withEnv(env, () => {
            for (const allow of [false, true]) {
                const error = assertThrows(
                    () => assertNotProduction('factory create()', allow),
                    Error,
                )
                assertStringIncludes(error.message, 'factory create()')
                assertStringIncludes(error.message, 'DENO_ENV=production')
                assertStringIncludes(error.message, 'Set APP_ENV')
            }
        })
    }
})

Deno.test('assertNotProduction - a DENO_ENV equal to APP_ENV changes nothing (#504)', () => {
    withEnv({ DENO_ENV: 'production', APP_ENV: 'production' }, () => {
        const error = assertThrows(() => assertNotProduction('db:seed'), Error)
        assertStringIncludes(error.message, 'APP_ENV is "production"')
        assertEquals(error.message.includes('DENO_ENV'), false)
        assertNotProduction('db:seed', true)
    })
    withEnv({ DENO_ENV: 'development', APP_ENV: 'development' }, () => {
        assertNotProduction('db:seed')
    })
})

Deno.test('assertNotProduction - passes under production when override is set', () => {
    withEnv({ APP_ENV: 'production' }, () => {
        // No throw expected — the explicit override authorises the write.
        assertNotProduction('db:seed', true)
    })
})

Deno.test('assertNotProduction - passes outside production without override', () => {
    withEnv({ APP_ENV: 'development' }, () => {
        assertNotProduction('db:seed')
    })
})

Deno.test('assertNotProduction - passes when environment is unset (absence is not production)', () => {
    withEnv({}, () => {
        assertNotProduction('db:seed')
    })
})
