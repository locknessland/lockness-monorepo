/**
 * @fileoverview The safe env read asks for the env permission without
 * prompting before it reads, and keeps an *unreadable* variable distinct from
 * an *unset* one (plan 274 §5 "Safe env read"; absorbed from
 * `cli/raw_errors.ts` by #597, `EnvRead` shape from #624).
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name.** What is under test
 * is Deno's permission model: the rows stub `Deno.permissions.querySync` and
 * `Deno.env.get`, which exist on no other runtime.
 *
 * @module @lockness/contract/tests/environment_read
 */

import { assertEquals, assertThrows } from '@std/assert'
import { readAppEnv, readEnv, readEnvVar } from '../environment_read.ts'

/** What the stubbed `Deno.env.get` does: answer a value, or throw. */
type Reader = string | undefined | (() => string | undefined)

/**
 * Run `fn` with `Deno.permissions.querySync` answering `state` and
 * `Deno.env.get` answering `reader` while counting its calls, both restored
 * afterwards.
 */
function withPermission<T>(
    state: Deno.PermissionState,
    reader: Reader,
    fn: () => T,
): { result: T; envReads: number; queried: unknown[] } {
    const permissions = Deno.permissions as { querySync: unknown }
    const env = Deno.env as { get: unknown }
    const original = { querySync: permissions.querySync, get: env.get }
    let envReads = 0
    const queried: unknown[] = []
    permissions.querySync = (descriptor: unknown) => {
        queried.push(descriptor)
        return { state, partial: false }
    }
    env.get = () => {
        envReads++
        return typeof reader === 'function' ? reader() : reader
    }
    try {
        return { result: fn(), envReads, queried }
    } finally {
        permissions.querySync = original.querySync
        env.get = original.get
    }
}

const notCapable = () => {
    throw new Deno.errors.NotCapable('Requires env access')
}

for (const state of ['prompt', 'denied'] as const) {
    Deno.test(`readEnvVar - permission "${state}" reads as unset without touching the environment`, () => {
        const { result, envReads } = withPermission(
            state,
            'set',
            () => readEnvVar('LOCKNESS_TEST_VAR'),
        )
        assertEquals(result, undefined)
        // In a terminal, reaching the read under "prompt" shows a prompt.
        assertEquals(envReads, 0)
    })

    Deno.test(`readEnv - permission "${state}" is unreadable, without touching the environment`, () => {
        const { result, envReads } = withPermission(
            state,
            'set',
            () => readEnv('LOCKNESS_TEST_VAR'),
        )
        assertEquals(result, { readable: false })
        assertEquals(envReads, 0)
    })
}

Deno.test('readEnvVar - permission "granted" reads the variable it asked about', () => {
    const { result, envReads, queried } = withPermission(
        'granted',
        'set',
        () => readEnvVar('LOCKNESS_TEST_VAR'),
    )
    assertEquals(result, 'set')
    assertEquals(envReads, 1)
    assertEquals(queried, [{ name: 'env', variable: 'LOCKNESS_TEST_VAR' }])
})

Deno.test('readEnv - granted and set is readable with its raw value', () => {
    const { result } = withPermission(
        'granted',
        ' Set\r',
        () => readEnv('LOCKNESS_TEST_VAR'),
    )
    assertEquals(result, { readable: true, value: ' Set\r' })
})

Deno.test('readEnv - granted and unset is readable, and unset', () => {
    const { result } = withPermission(
        'granted',
        undefined,
        () => readEnv('LOCKNESS_TEST_VAR'),
    )
    assertEquals(result, { readable: true, value: undefined })
})

Deno.test('readEnv - NotCapable after a granted query is unreadable, not unset', () => {
    const { result, envReads } = withPermission(
        'granted',
        notCapable,
        () => readEnv('LOCKNESS_TEST_VAR'),
    )
    assertEquals(result, { readable: false })
    assertEquals(envReads, 1)
})

Deno.test('readEnvVar - NotCapable after a granted query reads as unset', () => {
    const { result } = withPermission(
        'granted',
        notCapable,
        () => readEnvVar('LOCKNESS_TEST_VAR'),
    )
    assertEquals(result, undefined)
})

Deno.test('readEnv - InvalidData propagates: a non-Unicode value is not "unreadable"', () => {
    withPermission('granted', () => {
        throw new Deno.errors.InvalidData('not valid Unicode')
    }, () => {
        assertThrows(
            () => readEnv('LOCKNESS_TEST_VAR'),
            Deno.errors.InvalidData,
        )
    })
})

Deno.test('readAppEnv - normalises a readable value, and asks about APP_ENV', () => {
    const { result, queried } = withPermission(
        'granted',
        ' Production\r',
        () => readAppEnv(),
    )
    assertEquals(result, { readable: true, value: 'production' })
    assertEquals(queried, [{ name: 'env', variable: 'APP_ENV' }])
})

Deno.test('readAppEnv - a blank readable value is unset, not an environment named ""', () => {
    const { result } = withPermission('granted', '  ', () => readAppEnv())
    assertEquals(result, { readable: true, value: undefined })
})

for (const state of ['prompt', 'denied'] as const) {
    Deno.test(`readAppEnv - permission "${state}" stays unreadable`, () => {
        const { result } = withPermission(state, 'production', readAppEnv)
        assertEquals(result, { readable: false })
    })
}
