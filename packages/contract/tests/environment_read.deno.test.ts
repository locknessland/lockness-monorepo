/**
 * @fileoverview `readEnvVar` asks for the env permission without prompting
 * before it reads (plan 274 §5 "Safe env read", absorbed from
 * `cli/raw_errors.ts` by #597).
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name.** What is under test
 * is Deno's permission model: the rows stub `Deno.permissions.querySync` and
 * `Deno.env.get`, which exist on no other runtime.
 *
 * @module @lockness/contract/tests/environment_read
 */

import { assertEquals } from '@std/assert'
import { readEnvVar } from '../environment_read.ts'

/**
 * Run `fn` with `Deno.permissions.querySync` answering `state` and
 * `Deno.env.get` answering `value` while counting its calls, both restored
 * afterwards.
 */
function withPermission<T>(
    state: Deno.PermissionState,
    value: string | undefined,
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
        return value
    }
    try {
        return { result: fn(), envReads, queried }
    } finally {
        permissions.querySync = original.querySync
        env.get = original.get
    }
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
