/**
 * Tests for `readEnv`, the prompt-free read that keeps an unreadable variable
 * distinct from an unset one (#627).
 *
 * `Deno.permissions.querySync` and `Deno.env.get` are stubbed per test. The
 * query stub answers per `descriptor.variable`, which proves the query names
 * the variable: a bare `{ name: 'env' }` query would be refused under any
 * narrowed `--allow-env`.
 *
 * @module @lockness/contract/tests/environment_read_strict
 */

import { assertEquals, assertThrows } from '@std/assert'
import { readEnv } from '../environment_read_strict.ts'

/** The stand-ins for one test: a permission per variable, and a reader. */
interface Stubs {
    /** The permission state answered for each variable; `granted` if absent. */
    permissions?: Record<string, Deno.PermissionState>
    /** What `Deno.env.get` does; counts as one env read per call. */
    get?: (name: string) => string | undefined
}

/**
 * Run `fn` with the permission query and the env reader stubbed, both
 * restored afterwards.
 *
 * @returns How many times the environment itself was read.
 */
function withStubs(stubs: Stubs, fn: () => void): { envReads: number } {
    const permissions = Deno.permissions as { querySync: unknown }
    const env = Deno.env as { get: unknown }
    const original = { querySync: permissions.querySync, get: env.get }
    let envReads = 0
    permissions.querySync = (descriptor: Deno.EnvPermissionDescriptor) => ({
        state: stubs.permissions?.[descriptor.variable ?? ''] ?? 'granted',
        partial: false,
    })
    env.get = (name: string) => {
        envReads++
        return stubs.get ? stubs.get(name) : undefined
    }
    try {
        fn()
    } finally {
        permissions.querySync = original.querySync
        env.get = original.get
    }
    return { envReads }
}

Deno.test('readEnv - a set variable reads as set with its value', () => {
    withStubs({ get: (n) => (n === 'TOKEN' ? 's3cret' : undefined) }, () => {
        assertEquals(readEnv('TOKEN'), { state: 'set', value: 's3cret' })
    })
})

Deno.test('readEnv - a set but empty variable is set, not unset', () => {
    withStubs({ get: () => '' }, () => {
        assertEquals(readEnv('TOKEN'), { state: 'set', value: '' })
    })
})

Deno.test('readEnv - an absent variable reads as unset', () => {
    withStubs({}, () => {
        assertEquals(readEnv('TOKEN'), { state: 'unset' })
    })
})

for (const state of ['prompt', 'denied'] as const) {
    Deno.test(`readEnv - permission "${state}" is not-granted and never reads the environment`, () => {
        let read
        const { envReads } = withStubs(
            {
                permissions: { TOKEN: state },
                get: () => {
                    throw new Error(
                        'reached the env read: in a terminal this prompts',
                    )
                },
            },
            () => {
                read = readEnv('TOKEN')
            },
        )
        assertEquals(read, { state: 'not-granted' })
        assertEquals(envReads, 0)
    })
}

Deno.test('readEnv - the query names the variable it reads', () => {
    withStubs(
        { permissions: { OTHER: 'denied' }, get: () => 'value' },
        () => {
            assertEquals(readEnv('TOKEN'), { state: 'set', value: 'value' })
            assertEquals(readEnv('OTHER'), { state: 'not-granted' })
        },
    )
})

Deno.test('readEnv - NotCapable after a granted query is not-granted', () => {
    withStubs({
        get: () => {
            throw new Deno.errors.NotCapable('no env')
        },
    }, () => {
        assertEquals(readEnv('TOKEN'), { state: 'not-granted' })
    })
})

Deno.test('readEnv - a non-Unicode value is not-unicode and is not re-thrown', () => {
    withStubs({
        get: () => {
            throw new Deno.errors.InvalidData(
                'environment variable was not valid unicode: "s3cret\\xFF"',
            )
        },
    }, () => {
        assertEquals(readEnv('TOKEN'), { state: 'not-unicode' })
    })
})

Deno.test('readEnv - any other read failure propagates', () => {
    withStubs({
        get: () => {
            throw new TypeError('reader bug')
        },
    }, () => {
        assertThrows(() => readEnv('TOKEN'), TypeError, 'reader bug')
    })
})
