/**
 * Tests for the devtools gate's environment reads (#627).
 *
 * An unreadable `LOCKNESS_DEVTOOLS_TOKEN` must deny, never fall back to
 * loopback trust, and the read must never prompt. `Deno.permissions.querySync`
 * and `Deno.env.get` are stubbed per test, answering per variable.
 *
 * @module @lockness/devtools/tests/gate_token_read
 */

import { assert, assertEquals } from '@std/assert'
import { Hono } from '@lockness/hono'
import { authorizeDevtools, devtoolsActive } from '../gate.ts'
import type { DevtoolsConfig } from '../types.ts'
import { collector } from '../collector.ts'

const TOKEN_VAR = 'LOCKNESS_DEVTOOLS_TOKEN'

/** A Deno-conninfo-shaped env for a loopback peer. */
const LOOPBACK = {
    remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 12345 },
}

/** The stand-ins for one test. */
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
async function withStubs(
    stubs: Stubs,
    fn: () => Promise<void> | void,
): Promise<string[]> {
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
        await fn()
    } finally {
        permissions.querySync = original.querySync
        env.get = original.get
    }
    return reads
}

/** Run the decider against a synthesized request and return its verdict. */
async function decide(
    cfg: DevtoolsConfig,
    headers: Record<string, string> = {},
): Promise<boolean> {
    const app = new Hono()
    let verdict = false
    app.all('*', async (c) => {
        verdict = await authorizeDevtools(c, cfg)
        return c.text('ok')
    })
    await app.request('/_devtools', { headers }, LOOPBACK)
    return verdict
}

/** Every collector log message and context, flattened to one string. */
function loggedText(): string {
    return JSON.stringify(collector.getLogs())
}

Deno.test('gate - token env not granted: a loopback peer is denied, the WARN names the flag, no read', async () => {
    collector.clear()
    let verdict = true
    const reads = await withStubs(
        { permissions: { [TOKEN_VAR]: 'prompt' } },
        async () => {
            verdict = await decide({})
        },
    )
    assertEquals(
        verdict,
        false,
        'an unreadable token never falls back to loopback trust',
    )
    assertEquals(
        reads.includes(TOKEN_VAR),
        false,
        'the token variable is never read, so never prompts',
    )
    const warns = collector.getLogs().filter((l) => l.level === 'warn')
    assert(warns.length > 0, 'the refusal is logged at WARN')
    assert(
        loggedText().includes('--allow-env=LOCKNESS_DEVTOOLS_TOKEN'),
        'the WARN names the flag that clears it',
    )
})

Deno.test('gate - token env denied outright: denied too', async () => {
    let verdict = true
    await withStubs({ permissions: { [TOKEN_VAR]: 'denied' } }, async () => {
        verdict = await decide({})
    })
    assertEquals(verdict, false)
})

Deno.test('gate - token not valid Unicode: denied, and no log carries the value', async () => {
    collector.clear()
    let verdict = true
    await withStubs({
        values: {
            [TOKEN_VAR]: () => {
                throw new Deno.errors.InvalidData(
                    'environment variable was not valid unicode: "leaked-secret\\xFF"',
                )
            },
        },
    }, async () => {
        verdict = await decide({})
    })
    assertEquals(
        verdict,
        false,
        'an unreadable token never falls back to loopback trust',
    )
    assert(
        collector.getLogs().some((l) => l.level === 'warn'),
        'the refusal is logged at WARN',
    )
    assertEquals(
        loggedText().includes('leaked-secret'),
        false,
        'the value never reaches the log',
    )
})

Deno.test('gate - token read from the env: a wrong Bearer is denied, the right one allowed', async () => {
    await withStubs(
        { values: { [TOKEN_VAR]: 'env-token-value' } },
        async () => {
            assertEquals(
                await decide({}, { authorization: 'Bearer wrong-token-value' }),
                false,
                'a wrong token is denied even from loopback',
            )
            assertEquals(
                await decide({}),
                false,
                'no Bearer is denied even from loopback',
            )
            assert(
                await decide({}, { authorization: 'Bearer env-token-value' }),
                'the token read from the env is the one required',
            )
        },
    )
})

Deno.test('gate - token env readable and unset: loopback trust is unchanged', async () => {
    let verdict = false
    await withStubs({}, async () => {
        verdict = await decide({})
    })
    assert(
        verdict,
        'no token configured and a readable env keeps the loopback default',
    )
})

Deno.test('gate - config.token or authorize set: the token variable is never read', async () => {
    const tokenReads = await withStubs({
        permissions: { [TOKEN_VAR]: 'denied' },
    }, async () => {
        assert(
            await decide({ token: 'cfg-token' }, {
                authorization: 'Bearer cfg-token',
            }),
        )
    })
    assertEquals(tokenReads.includes(TOKEN_VAR), false)
    const authorizeReads = await withStubs({
        permissions: { [TOKEN_VAR]: 'denied' },
    }, async () => {
        assert(await decide({ authorize: () => true }))
    })
    assertEquals(authorizeReads.includes(TOKEN_VAR), false)
})

Deno.test('devtoolsActive - an unreadable LOCKNESS_DEVTOOLS reads as off and is never read', async () => {
    let active = true
    const reads = await withStubs({
        permissions: { LOCKNESS_DEVTOOLS: 'prompt' },
    }, () => {
        active = devtoolsActive()
    })
    assertEquals(active, false)
    assertEquals(reads.includes('LOCKNESS_DEVTOOLS'), false)
})

Deno.test('devtoolsActive - a readable LOCKNESS_DEVTOOLS=1 opts in', async () => {
    let active = false
    await withStubs({ values: { LOCKNESS_DEVTOOLS: '1' } }, () => {
        active = devtoolsActive()
    })
    assert(active)
})
