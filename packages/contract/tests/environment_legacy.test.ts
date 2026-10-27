/**
 * Tests for the `DENO_ENV` tripwire (#504). `DENO_ENV` is no longer read as an
 * environment signal; the only thing the framework still does with it is notice
 * it, so a deployment that relied on it is refused rather than silently
 * downgraded.
 *
 * @module @lockness/contract/tests/environment_legacy
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { legacyEnvironmentSignal } from '../environment_legacy.ts'
import { safeForLog } from '../logging/sanitize.ts'
import { type EnvCombo, withEnv } from './env_fixture.ts'

Deno.test('no DENO_ENV, or an empty one, raises no signal', () => {
    const rows: EnvCombo[] = [
        {},
        { APP_ENV: 'production' },
        { APP_ENV: 'development' },
        { DENO_ENV: '' },
        { DENO_ENV: '  ', APP_ENV: 'production' },
    ]
    for (const combo of rows) {
        withEnv(combo, () => {
            assertEquals(
                legacyEnvironmentSignal(),
                undefined,
                JSON.stringify(combo),
            )
        })
    }
})

Deno.test('a DENO_ENV equal to APP_ENV is redundant, and the message says to remove it', () => {
    const rows: EnvCombo[] = [
        { DENO_ENV: 'production', APP_ENV: 'production' },
        { DENO_ENV: 'Production', APP_ENV: ' production\r' },
        { DENO_ENV: 'development', APP_ENV: 'development' },
    ]
    for (const combo of rows) {
        withEnv(combo, () => {
            const signal = legacyEnvironmentSignal()
            assertEquals(signal?.kind, 'redundant', JSON.stringify(combo))
            assertStringIncludes(signal?.message ?? '', 'DENO_ENV is ignored')
            assertStringIncludes(signal?.message ?? '', 'remove it')
        })
    }
})

Deno.test('a DENO_ENV that disagrees with APP_ENV is a conflict naming APP_ENV and the fix', () => {
    const rows: EnvCombo[] = [
        { DENO_ENV: 'production' },
        { DENO_ENV: 'production', APP_ENV: '' },
        { DENO_ENV: 'production', APP_ENV: 'development' },
        { DENO_ENV: 'development', APP_ENV: 'production' },
        { DENO_ENV: 'development' },
    ]
    for (const combo of rows) {
        withEnv(combo, () => {
            const signal = legacyEnvironmentSignal()
            assertEquals(signal?.kind, 'conflict', JSON.stringify(combo))
            const message = signal?.message ?? ''
            assertStringIncludes(message, `DENO_ENV=${combo.DENO_ENV}`)
            assertStringIncludes(message, 'APP_ENV')
            assertStringIncludes(message, 'Set APP_ENV')
            assertStringIncludes(message, 'remove DENO_ENV')
        })
    }
})

Deno.test('a conflict message encodes a DENO_ENV value carrying terminal controls', () => {
    const esc = String.fromCharCode(0x1b)
    const hostile = `production${esc}[2J${esc}[31m`
    withEnv({ DENO_ENV: hostile }, () => {
        const signal = legacyEnvironmentSignal()
        assertEquals(signal?.kind, 'conflict')
        const message = signal?.message ?? ''
        assert(!message.includes(esc), 'a raw ESC reached the message')
        assertStringIncludes(message, safeForLog(hostile))
    })
})

Deno.test('a NotCapable read raises no signal and does not throw', () => {
    // deno-lint-ignore no-explicit-any
    const envAny = Deno.env as any
    const original = envAny.get
    try {
        envAny.get = () => {
            throw new Deno.errors.NotCapable('Requires env access')
        }
        assertEquals(legacyEnvironmentSignal(), undefined)
    } finally {
        envAny.get = original
    }
})
