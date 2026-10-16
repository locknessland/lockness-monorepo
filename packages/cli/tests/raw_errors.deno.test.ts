/**
 * @fileoverview The `LOCKNESS_CLI_RAW_ERRORS` switch against Deno itself
 * (#488, #508, #597): its real error classes and its permission model.
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name.** `raw_errors.ts`
 * classifies a reader's failure by the error's `name`, so it needs no `Deno`
 * global; these rows pin that the names it matches are the ones Deno's own
 * classes carry, and that the default reader asks the permission without
 * prompting. Neither exists on another runtime.
 *
 * @module @lockness/cli/tests/raw_errors_deno
 */

import { assertEquals } from '@std/assert'
import { readRawErrorsSwitch } from '../raw_errors.ts'

Deno.test('raw errors - a real Deno.errors.NotCapable from the reader reads as off', () => {
    const denied = () => {
        throw new Deno.errors.NotCapable('Requires env access')
    }
    assertEquals(readRawErrorsSwitch(denied), { state: 'off' })
})

Deno.test('raw errors - a real Deno.errors.InvalidData from the reader is <not valid Unicode>', () => {
    const invalid = () => {
        throw new Deno.errors.InvalidData(
            'environment variable was not valid unicode',
        )
    }
    assertEquals(readRawErrorsSwitch(invalid), {
        state: 'unreadable',
        placeholder: '<not valid Unicode>',
    })
})

/**
 * Run `fn` with `Deno.permissions.querySync` answering `state` for every
 * descriptor and `Deno.env.get` counting its calls, both restored afterwards.
 * `Deno.env.get` throws, standing in for the prompt a real read would raise in
 * a terminal: a test that reaches it has already lost.
 */
function withPermission(
    state: Deno.PermissionState,
    fn: () => void,
): { envReads: number } {
    const permissions = Deno.permissions as { querySync: unknown }
    const env = Deno.env as { get: unknown }
    const original = { querySync: permissions.querySync, get: env.get }
    let envReads = 0
    permissions.querySync = () => ({ state, partial: false })
    env.get = () => {
        envReads++
        throw new Error('the env read was reached: in a terminal this prompts')
    }
    try {
        fn()
    } finally {
        permissions.querySync = original.querySync
        env.get = original.get
    }
    return { envReads }
}

for (const state of ['prompt', 'denied'] as const) {
    Deno.test(`raw errors - env permission "${state}" reads as off without touching the environment`, () => {
        let read: ReturnType<typeof readRawErrorsSwitch> | undefined
        const { envReads } = withPermission(state, () => {
            read = readRawErrorsSwitch()
        })
        assertEquals(read, { state: 'off' })
        assertEquals(envReads, 0)
    })
}
