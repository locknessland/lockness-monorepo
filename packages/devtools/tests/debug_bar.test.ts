/**
 * Tests for the `DEBUG_BAR` switch (#630): read when devtools is enabled, never
 * at module load, and never prompting or throwing when it cannot be read.
 *
 * @module @lockness/devtools/tests/debug_bar
 */

import { assert, assertEquals } from '@std/assert'
import { fromFileUrl } from '@std/path'
import { debugBarDefault } from '../debug_bar.ts'

/** The stand-ins for one test: a permission per variable, and the values. */
interface Stubs {
    /** The permission state answered per variable; `granted` if absent. */
    permissions?: Record<string, Deno.PermissionState>
    /** The environment's values; a function value throws instead of returning. */
    values?: Record<string, string | (() => never)>
}

/**
 * Run `fn` with the permission query and the env reader stubbed, both
 * restored afterwards.
 *
 * @returns The variables `Deno.env.get` was called with, in order.
 */
function withStubs(stubs: Stubs, fn: () => void): string[] {
    const permissions = Deno.permissions as { querySync: unknown }
    const env = Deno.env as { get: unknown }
    const original = { querySync: permissions.querySync, get: env.get }
    const reads: string[] = []
    permissions.querySync = (descriptor: Deno.EnvPermissionDescriptor) => ({
        state: stubs.permissions?.[descriptor.variable ?? ''] ?? 'granted',
        partial: false,
    })
    env.get = (name: string) => {
        reads.push(name)
        const value = stubs.values?.[name]
        return typeof value === 'function' ? value() : value
    }
    try {
        fn()
    } finally {
        permissions.querySync = original.querySync
        env.get = original.get
    }
    return reads
}

Deno.test('debug bar - DEBUG_BAR=false hides it', () => {
    let shown = true
    withStubs({ values: { DEBUG_BAR: 'false' } }, () => {
        shown = debugBarDefault()
    })
    assertEquals(shown, false)
})

Deno.test('debug bar - unset, or any other value, shows it', () => {
    const cases: Record<string, string>[] = [
        {},
        { DEBUG_BAR: 'true' },
        { DEBUG_BAR: '0' },
    ]
    for (const values of cases) {
        let shown = false
        withStubs({ values }, () => {
            shown = debugBarDefault()
        })
        assert(shown, `shown for ${JSON.stringify(values)}`)
    }
})

for (const state of ['prompt', 'denied'] as const) {
    Deno.test(`debug bar - permission "${state}" keeps the default and never reads the environment`, () => {
        let shown = false
        const reads = withStubs({ permissions: { DEBUG_BAR: state } }, () => {
            shown = debugBarDefault()
        })
        assert(shown, 'an unreadable DEBUG_BAR keeps the default: shown')
        assertEquals(
            reads.includes('DEBUG_BAR'),
            false,
            'never read, so never prompts',
        )
    })
}

Deno.test('debug bar - a non-Unicode DEBUG_BAR keeps the default and does not throw', () => {
    let shown = false
    withStubs({
        values: {
            DEBUG_BAR: () => {
                throw new Deno.errors.InvalidData('not valid unicode')
            },
        },
    }, () => {
        shown = debugBarDefault()
    })
    assert(shown)
})

Deno.test('debug bar - importing @lockness/devtools without env permission neither throws nor prompts', async () => {
    const mod = fromFileUrl(new URL('../mod.ts', import.meta.url))
    const { code, stderr } = await new Deno.Command(Deno.execPath(), {
        args: ['run', '--no-prompt', '--allow-read', mod],
        stdout: 'null',
        stderr: 'piped',
    }).output()
    const message = new TextDecoder().decode(stderr)
    assertEquals(
        code,
        0,
        `the import failed without env permission:\n${message}`,
    )
})
