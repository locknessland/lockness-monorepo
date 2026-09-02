/**
 * Tests for the environment-name resolution helper (moved here from
 * @lockness/core in #27/A2). Covers the DENO_ENV/APP_ENV resolution, the
 * NotCapable safety, and the fail-closed `isExplicitlyDevelopment`.
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

/** Snapshot both env names, run `fn` under a chosen combo, then restore. */
function withEnv(
    combo: { DENO_ENV?: string; APP_ENV?: string },
    fn: () => void,
): void {
    const prevDeno = Deno.env.get('DENO_ENV')
    const prevApp = Deno.env.get('APP_ENV')
    const set = (k: string, v?: string) =>
        v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v)
    set('DENO_ENV', combo.DENO_ENV)
    set('APP_ENV', combo.APP_ENV)
    try {
        fn()
    } finally {
        set('DENO_ENV', prevDeno)
        set('APP_ENV', prevApp)
    }
}

Deno.test('resolveEnvName - DENO_ENV first, then APP_ENV, default development', () => {
    withEnv(
        { DENO_ENV: 'production' },
        () => assertEquals(resolveEnvName(), 'production'),
    )
    withEnv(
        { APP_ENV: 'production' },
        () => assertEquals(resolveEnvName(), 'production'),
    )
    withEnv(
        { DENO_ENV: 'production', APP_ENV: 'development' },
        () => assertEquals(resolveEnvName(), 'production'),
    )
    withEnv({}, () => assertEquals(resolveEnvName(), 'development'))
})

Deno.test('isProduction / isDevelopment derive from resolveEnvName', () => {
    withEnv({ DENO_ENV: 'production' }, () => {
        assert(isProduction())
        assert(!isDevelopment())
    })
    withEnv({}, () => {
        // Absence is never production (error-detail gates fail closed).
        assert(!isProduction())
        assert(isDevelopment())
    })
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
        assert(!isExplicitlyDevelopment(), 'NotCapable is not explicit dev')
    } finally {
        envAny.get = original
    }
})

Deno.test('isExplicitlyDevelopment - true ONLY for an explicitly-set development', () => {
    withEnv(
        { DENO_ENV: 'development' },
        () => assert(isExplicitlyDevelopment()),
    )
    withEnv({ APP_ENV: 'development' }, () => assert(isExplicitlyDevelopment()))
    // Unset → false (this is the fail-closed difference from isDevelopment()).
    withEnv({}, () => {
        assert(!isExplicitlyDevelopment())
        assert(
            isDevelopment(),
            'isDevelopment defaults true; the two differ here',
        )
    })
    withEnv(
        { DENO_ENV: 'production' },
        () => assert(!isExplicitlyDevelopment()),
    )
    withEnv({ APP_ENV: 'staging' }, () => assert(!isExplicitlyDevelopment()))
})
