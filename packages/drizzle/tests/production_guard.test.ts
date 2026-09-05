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

import { assertEquals, assertThrows } from '@std/assert'
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

Deno.test('assertNotProduction - throws under DENO_ENV=production without override', () => {
    withEnv({ DENO_ENV: 'production' }, () => {
        assertThrows(() => assertNotProduction('factory create()'), Error)
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
