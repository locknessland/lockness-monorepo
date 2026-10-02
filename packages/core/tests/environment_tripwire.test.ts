/**
 * The boot-time `DENO_ENV` tripwire (#504).
 *
 * `APP_ENV` is the only environment signal since v0.5.0. A deployment that
 * still sets `DENO_ENV` to something else — including with `APP_ENV` unset —
 * is refused at boot, because reading `APP_ENV` alone would silently move it
 * from production to the fail-closed default. An equal `DENO_ENV` boots with
 * one warning; no `DENO_ENV` boots silently.
 *
 * @module @lockness/core/tests/environment_tripwire
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { Kernel } from '../kernel/kernel_decorators.ts'
import { createApp } from '../kernel/loader.ts'
import { environmentStep } from '../kernel/bootstrap/steps/environment.ts'
import { getDefaultSteps } from '../kernel/bootstrap/registry.ts'
import * as core from '../mod.ts'

/** Run `fn` with the given variables set (or deleted), then restore them. */
async function withEnv(
    vars: Record<string, string | undefined>,
    fn: () => Promise<void>,
): Promise<void> {
    const saved = new Map<string, string | undefined>()
    for (const [key, value] of Object.entries(vars)) {
        saved.set(key, Deno.env.get(key))
        if (value === undefined) Deno.env.delete(key)
        else Deno.env.set(key, value)
    }
    try {
        await fn()
    } finally {
        for (const [key, value] of saved) {
            if (value === undefined) Deno.env.delete(key)
            else Deno.env.set(key, value)
        }
    }
}

/** The warnings that mention `DENO_ENV`, captured while `fn` runs. */
async function denoEnvWarnings(fn: () => Promise<void>): Promise<string[]> {
    const warnings: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => {
        const line = args.map(String).join(' ')
        if (line.includes('DENO_ENV')) warnings.push(line)
    }
    try {
        await fn()
    } finally {
        console.warn = original
    }
    return warnings
}

Deno.test('createApp - DENO_ENV=production alone refuses to boot, naming APP_ENV', async () => {
    @Kernel()
    class TestKernel {}

    await withEnv({ DENO_ENV: 'production', APP_ENV: undefined }, async () => {
        const error = await assertRejects(() => createApp(TestKernel), Error)
        assertStringIncludes(error.message, 'DENO_ENV=production')
        assertStringIncludes(error.message, 'Set APP_ENV')
    })
})

Deno.test('createApp - a DENO_ENV disagreeing with APP_ENV refuses to boot', async () => {
    @Kernel()
    class TestKernel {}

    await withEnv(
        { DENO_ENV: 'production', APP_ENV: 'development' },
        async () => {
            const error = await assertRejects(
                () => createApp(TestKernel),
                Error,
            )
            assertStringIncludes(error.message, 'APP_ENV=development')
        },
    )
})

Deno.test('createApp - a DENO_ENV equal to APP_ENV boots and warns once', async () => {
    @Kernel()
    class TestKernel {}

    await withEnv(
        { DENO_ENV: 'development', APP_ENV: 'development' },
        async () => {
            const warnings = await denoEnvWarnings(async () => {
                assert(await createApp(TestKernel))
            })
            assertEquals(warnings.length, 1)
            assertStringIncludes(warnings[0], 'DENO_ENV is ignored')
        },
    )
})

Deno.test('createApp - neither variable set boots without a DENO_ENV warning', async () => {
    @Kernel()
    class TestKernel {}

    await withEnv({ DENO_ENV: undefined, APP_ENV: undefined }, async () => {
        const warnings = await denoEnvWarnings(async () => {
            assert(await createApp(TestKernel))
        })
        assertEquals(warnings, [])
    })
})

Deno.test('the environment step runs first, before any step that reads the environment', () => {
    const steps = getDefaultSteps()
    assertEquals(steps[0].id, environmentStep.id)
    assertEquals(environmentStep.order, 1)
    for (const step of steps.slice(1)) {
        assert(step.order > environmentStep.order, step.id)
    }
})

Deno.test('@lockness/core re-exports the environment predicates, and not the tripwire', () => {
    assertEquals(typeof core.resolveEnvName, 'function')
    assertEquals(typeof core.isProduction, 'function')
    assertEquals(typeof core.isDevelopment, 'function')
    assertEquals(typeof core.isExplicitlyDevelopment, 'function')
    assert(!('legacyEnvironmentSignal' in core))
})
