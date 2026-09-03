/**
 * Unit tests for the devtools authorization decider (#161).
 *
 * Exercises `authorizeDevtools` — the single decision point — across the
 * loopback default posture, the FR-011 hardening (forwarding-header revocation,
 * Host allowlist), the token mechanism (constant-time compare), the `authorize`
 * escape hatch, the precedence order (`authorize › token › default`), and the
 * fail-closed guarantees (undetectable peer, throwing/rejecting callback).
 *
 * @module @lockness/devtools/tests/gate
 */

import { assert, assertEquals } from '@std/assert'
import { Hono } from '@lockness/hono'
import { authorizeDevtools } from '../gate.ts'
import type { DevtoolsConfig } from '../types.ts'
import { collector } from '../collector.ts'

/** A Deno-conninfo-shaped env for a loopback peer. */
const LOOPBACK = {
    remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 12345 },
}
/** A Deno-conninfo-shaped env for a non-loopback (public) peer. */
const REMOTE = {
    remoteAddr: { transport: 'tcp', hostname: '203.0.113.7', port: 5555 },
}

/**
 * Synthesize a request, run the decider against its context, return the verdict.
 *
 * The third argument to `app.request` becomes `c.env`, which the Deno
 * `getConnInfo` reads — so `env` controls the perceived peer. Omitting it makes
 * the peer undetectable (getConnInfo throws), the fail-closed case.
 */
async function decide(
    cfg: DevtoolsConfig,
    opts: {
        path?: string
        headers?: Record<string, string>
        env?: unknown
    } = {},
): Promise<boolean> {
    const app = new Hono()
    let verdict = false
    app.all('*', async (c) => {
        verdict = await authorizeDevtools(c, cfg)
        return c.text('ok')
    })
    await app.request(
        opts.path ?? '/_devtools',
        { headers: opts.headers },
        opts.env,
    )
    return verdict
}

// --- Default posture (FR-002) ---------------------------------------------

Deno.test('gate - loopback peer, nothing configured -> allow', async () => {
    assert(await decide({}, { env: LOOPBACK }), 'loopback allowed by default')
})

Deno.test('gate - non-loopback peer, nothing configured -> deny', async () => {
    assertEquals(
        await decide({}, { env: REMOTE }),
        false,
        'remote denied by default',
    )
})

Deno.test('gate - undetectable peer -> deny AND logs at WARN (fail closed, FR-005/010)', async () => {
    collector.clear()
    assertEquals(
        await decide({}, {}),
        false,
        'no conn-info => cannot confirm loopback => deny',
    )
    assert(
        collector.getLogs().some((l) => l.level === 'warn'),
        'the fail-closed catch logs at WARN (no silent catch)',
    )
})

// --- FR-011 loopback hardening --------------------------------------------

Deno.test('gate - a forwarding header revokes loopback trust (FR-011a)', async () => {
    for (
        const h of [
            'x-forwarded-for',
            'forwarded',
            'x-real-ip',
            'cf-connecting-ip',
            'true-client-ip',
            'x-client-ip',
        ]
    ) {
        assertEquals(
            await decide({}, {
                env: LOOPBACK,
                headers: { [h]: '203.0.113.9' },
            }),
            false,
            `${h} present => loopback trust revoked`,
        )
    }
})

Deno.test('gate - Host outside the localhost allowlist -> deny (FR-011b)', async () => {
    assertEquals(
        await decide({}, {
            env: LOOPBACK,
            headers: { host: 'evil.example.com' },
        }),
        false,
        'foreign Host => DNS-rebinding guard denies',
    )
    assert(
        await decide({}, {
            env: LOOPBACK,
            headers: { host: 'localhost:8888' },
        }),
        'allowlisted Host with port still allowed',
    )
})

// --- Token mechanism (FR-003/FR-006) --------------------------------------

Deno.test('gate - token configured: correct Bearer allows from any host', async () => {
    const cfg: DevtoolsConfig = { token: 'sekret-token-value' }
    assert(
        await decide(cfg, {
            env: REMOTE,
            headers: { authorization: 'Bearer sekret-token-value' },
        }),
        'correct token allowed from a remote peer',
    )
})

Deno.test('gate - token configured: wrong / absent Bearer denies', async () => {
    const cfg: DevtoolsConfig = { token: 'sekret-token-value' }
    assertEquals(
        await decide(cfg, {
            env: LOOPBACK,
            headers: { authorization: 'Bearer wrong-token-value' },
        }),
        false,
        'wrong token denied even from loopback',
    )
    assertEquals(
        await decide(cfg, { env: LOOPBACK }),
        false,
        'absent token denied even from loopback',
    )
})

Deno.test('gate - token compare denies wrong tokens of shorter and longer length', async () => {
    const cfg: DevtoolsConfig = { token: 'sekret-token-value' }
    // A shorter and a longer wrong token both deny (constant-time compare must
    // not throw or short-circuit on differing lengths).
    assertEquals(
        await decide(cfg, {
            env: REMOTE,
            headers: { authorization: 'Bearer short' },
        }),
        false,
    )
    assertEquals(
        await decide(cfg, {
            env: REMOTE,
            headers: {
                authorization: 'Bearer sekret-token-value-and-then-some-more',
            },
        }),
        false,
    )
})

// --- authorize precedence + await (FR-004/FR-009/FR-010) -------------------

Deno.test('gate - authorize supersedes token and default (FR-009)', async () => {
    // authorize true wins even with a remote peer and no token.
    assert(
        await decide({ authorize: () => true }, { env: REMOTE }),
        'authorize=true grants from a remote peer',
    )
    // authorize false wins even with the correct token present.
    assertEquals(
        await decide({ authorize: () => false, token: 't' }, {
            env: LOOPBACK,
            headers: { authorization: 'Bearer t' },
        }),
        false,
        'authorize=false denies despite a correct token',
    )
})

Deno.test('gate - token supersedes the loopback default (FR-009)', async () => {
    // With a token configured, a loopback peer WITHOUT the token is denied.
    assertEquals(
        await decide({ token: 'req' }, { env: LOOPBACK }),
        false,
        'a configured token is not bypassed by loopback',
    )
})

Deno.test('gate - authorize is awaited: rejected Promise -> deny AND logs at WARN', async () => {
    collector.clear()
    assertEquals(
        await decide({ authorize: () => Promise.reject(new Error('boom')) }, {
            env: LOOPBACK,
        }),
        false,
        'a rejected Promise denies (fail closed), never grants',
    )
    assert(
        collector.getLogs().some((l) => l.level === 'warn'),
        'the fail-closed catch logs at WARN (no silent catch)',
    )
})

Deno.test('gate - authorize that throws -> deny AND logs at WARN (FR-010)', async () => {
    collector.clear()
    const verdict = await decide(
        {
            authorize: () => {
                throw new Error('callback exploded')
            },
        },
        { env: LOOPBACK },
    )
    assertEquals(verdict, false, 'a throwing callback denies')
    const warned = collector.getLogs().some((l) => l.level === 'warn')
    assert(warned, 'the fail-closed catch logs at WARN (no silent catch)')
})
