/**
 * @fileoverview `devtoolsActive()` reads its `LOCKNESS_DEVTOOLS` opt-in through
 * contract's prompt-free read (#624): an unreadable switch is off, and the
 * read never reaches `Deno.env.get`, which in a terminal would prompt.
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name**: the rows stub
 * Deno's env permission.
 *
 * @module @lockness/devtools/tests/gate_env
 */

import { assertEquals } from '@std/assert'
import { devtoolsActive } from '../gate.ts'
import { withEnv } from '../../contract/tests/env_fixture.ts'
import { withUnreadableEnv } from '../../contract/tests/env_permission_fixture.ts'

/** Run `fn` with `LOCKNESS_DEVTOOLS` set to `value`, then restore it. */
async function withSwitch<T>(value: string, fn: () => Promise<T>): Promise<T> {
    const saved = Deno.env.get('LOCKNESS_DEVTOOLS')
    Deno.env.set('LOCKNESS_DEVTOOLS', value)
    try {
        return await fn()
    } finally {
        if (saved === undefined) Deno.env.delete('LOCKNESS_DEVTOOLS')
        else Deno.env.set('LOCKNESS_DEVTOOLS', saved)
    }
}

Deno.test('devtoolsActive - an unreadable LOCKNESS_DEVTOOLS is off, without a Deno.env.get call', async () => {
    await withEnv({ APP_ENV: 'production' }, () =>
        withSwitch('1', async () => {
            const { result, unreadableReads } = await withUnreadableEnv(
                ['LOCKNESS_DEVTOOLS'],
                devtoolsActive,
            )
            assertEquals(result, false)
            assertEquals(unreadableReads, 0)
        }))
})

Deno.test('devtoolsActive - a readable LOCKNESS_DEVTOOLS=1 opts in', async () => {
    const active = await withEnv(
        { APP_ENV: 'production' },
        () => withSwitch('1', () => Promise.resolve(devtoolsActive())),
    )
    assertEquals(active, true)
})
