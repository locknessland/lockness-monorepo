/**
 * @fileoverview An unreadable `APP_ENV` at boot (#624): one warning, printed by
 * the order-1 `environment` step, and the cookie-session no-secret refusal
 * fails closed on it.
 *
 * A `deno compile` binary or a run with a narrowed `--allow-env` cannot read
 * `APP_ENV`. The conveniences read that as development; the warning is what
 * tells the operator, and the controls that protect production do not rely
 * on it.
 *
 * **Deno-only, so `Deno.test` and a `.deno.test.ts` name**: the rows stub
 * Deno's env permission.
 *
 * @module @lockness/core/tests/environment_unreadable
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import { SessionSecretError } from '@lockness/session'
import { Kernel } from '../kernel/kernel_decorators.ts'
import { createApp } from '../kernel/loader.ts'
import { environmentStep } from '../kernel/bootstrap/steps/environment.ts'
import { withEnv } from '../../contract/tests/env_fixture.ts'
import { withUnreadableEnv } from '../../contract/tests/env_permission_fixture.ts'

const MARKER = 'APP_ENV cannot be read'

/** The warnings naming an unreadable `APP_ENV`, captured while `fn` runs. */
async function unreadableWarnings(
    fn: () => unknown | Promise<unknown>,
): Promise<string[]> {
    const warnings: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => {
        const line = args.map(String).join(' ')
        if (line.includes(MARKER)) warnings.push(line)
    }
    try {
        await fn()
    } finally {
        console.warn = original
    }
    return warnings
}

Deno.test('environment step - an unreadable APP_ENV warns exactly once, naming the grant', async () => {
    await withEnv({ APP_ENV: undefined, DENO_ENV: undefined }, async () => {
        const warnings = await unreadableWarnings(() =>
            withUnreadableEnv(
                ['APP_ENV'],
                () => environmentStep.run({} as never),
            )
        )
        assertEquals(warnings.length, 1)
        assertStringIncludes(warnings[0], '--allow-env=APP_ENV')
    })
})

for (const appEnv of [undefined, 'production', 'development']) {
    Deno.test(`environment step - a readable APP_ENV (${appEnv ?? 'unset'}) prints no unreadable warning`, async () => {
        await withEnv({ APP_ENV: appEnv, DENO_ENV: undefined }, async () => {
            const warnings = await unreadableWarnings(() =>
                environmentStep.run({} as never)
            )
            assertEquals(warnings, [])
        })
    })
}

Deno.test('environment step - the warning is printed before a DENO_ENV conflict refuses', async () => {
    await withEnv({ APP_ENV: undefined, DENO_ENV: 'production' }, async () => {
        const warnings = await unreadableWarnings(() =>
            withUnreadableEnv(['APP_ENV'], () => {
                assertThrows(
                    () => environmentStep.run({} as never),
                    Error,
                    'DENO_ENV=production',
                )
            })
        )
        assertEquals(warnings.length, 1)
    })
})

Deno.test('createApp - an unreadable APP_ENV boots with one warning', async () => {
    @Kernel()
    class TestKernel {}

    await withEnv({ APP_ENV: undefined, DENO_ENV: undefined }, async () => {
        const warnings = await unreadableWarnings(() =>
            withUnreadableEnv(['APP_ENV'], async () => {
                assert(await createApp(TestKernel))
            })
        )
        assertEquals(warnings.length, 1)
    })
})

Deno.test('createApp - an unreadable APP_ENV with a cookie session and no APP_KEY refuses, warning once', async () => {
    @Kernel({ session: true })
    class TestKernel {}

    await withEnv({ APP_ENV: undefined, DENO_ENV: undefined }, async () => {
        const saved = Deno.env.get('APP_KEY')
        Deno.env.delete('APP_KEY')
        try {
            const warnings = await unreadableWarnings(() =>
                withUnreadableEnv(['APP_ENV'], async () => {
                    const error = await assertRejects(
                        () => createApp(TestKernel),
                        SessionSecretError,
                    )
                    assertEquals(error.reason, 'missing')
                })
            )
            assertEquals(warnings.length, 1)
        } finally {
            if (saved !== undefined) Deno.env.set('APP_KEY', saved)
        }
    })
})
