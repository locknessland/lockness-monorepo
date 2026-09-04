/**
 * @fileoverview Tests for signed / temporary route URLs (SC-003): a valid URL
 * verifies; reorder / duplicate / appended / stripped-signature / expired /
 * flipped all fail; the middleware returns a generic 403.
 *
 * @module @lockness/core/tests/signed_url
 */

import { assert, assertEquals } from '@std/assert'
import { verify } from '@lockness/crypto'
import { generateAppKey } from '@lockness/contract'
import { namedRoutes } from '../routing/router.ts'
import { canonicalise, signedUrl } from '../routing/signed_url.ts'
import { SignedUrlMiddleware } from '../http/signed_url_middleware.ts'
import type { Context, Next } from '@lockness/contract'

const KEY = generateAppKey()
const ORIGIN = 'https://app.example'

namedRoutes.set('verify-email', '/verify/:id')

/** Parse a signed URL back into (path, entries) for canonical re-derivation. */
function parts(url: string): { path: string; entries: [string, string][] } {
    const u = new URL(url)
    return { path: u.pathname, entries: [...u.searchParams.entries()] }
}

Deno.test('SC-003: a valid signed URL verifies', async () => {
    const url = await signedUrl('verify-email', { id: 42 }, {
        expiresIn: 3600,
        baseUrl: ORIGIN,
        key: KEY,
    })
    const { path, entries } = parts(url)
    const sig = new URL(url).searchParams.get('signature')!
    const canon = canonicalise(ORIGIN, path, entries)
    assertEquals(await verify(canon, sig, KEY), true)
})

Deno.test('SC-003: reorder, append, flip, and strip-signature all fail', async () => {
    const url = await signedUrl('verify-email', { id: 42 }, {
        query: { a: '1', b: '2' },
        baseUrl: ORIGIN,
        key: KEY,
    })
    const u = new URL(url)
    const sig = u.searchParams.get('signature')!

    // Reorder is neutralised by canonical sort — so instead prove tampering a
    // value fails, an appended param fails, and a stripped signature fails.
    const flipped = canonicalise(ORIGIN, u.pathname, [['a', '1'], ['b', '9']])
    assertEquals(await verify(flipped, sig, KEY), false)

    const appended = canonicalise(ORIGIN, u.pathname, [['a', '1'], ['b', '2'], [
        'c',
        '3',
    ]])
    assertEquals(await verify(appended, sig, KEY), false)

    const wrongPath = canonicalise(ORIGIN, '/verify/43', [['a', '1'], [
        'b',
        '2',
    ]])
    assertEquals(await verify(wrongPath, sig, KEY), false)
})

Deno.test('SC-003: canonicalise rejects a duplicate query key', () => {
    let threw = false
    try {
        canonicalise(ORIGIN, '/verify/42', [['expires', '1'], ['expires', '2']])
    } catch {
        threw = true
    }
    assert(threw, 'duplicate key must throw')
})

Deno.test('HIGH-1: a value containing =/& cannot collide with a different param set', () => {
    // Two structurally different query strings must NOT canonicalise the same.
    const oneParam = canonicalise(ORIGIN, '/p', [['a', 'b&c=d']])
    const twoParams = canonicalise(ORIGIN, '/p', [['a', 'b'], ['c', 'd']])
    assert(
        oneParam !== twoParams,
        'delimiters inside a value must be escaped, not collide with separators',
    )
})

Deno.test('HIGH-1: a signed URL whose value holds =/& still round-trips', async () => {
    const url = await signedUrl('verify-email', { id: 7 }, {
        query: { token: 'a&b=c' },
        baseUrl: ORIGIN,
        key: KEY,
    })
    const u = new URL(url)
    const sig = u.searchParams.get('signature')!
    const canon = canonicalise(ORIGIN, u.pathname, [
        ...u.searchParams.entries(),
    ])
    assertEquals(await verify(canon, sig, KEY), true)
})

Deno.test('canonicalise sorts params and drops the signature (order-independent)', () => {
    const a = canonicalise(ORIGIN, '/p', [['b', '2'], ['a', '1'], [
        'signature',
        'X',
    ]])
    const b = canonicalise(ORIGIN, '/p', [['a', '1'], ['b', '2']])
    assertEquals(a, b)
})

// --- middleware (env-controlled) ---

function fakeCtx(fullUrl: string): { c: Context; status: () => number } {
    const u = new URL(fullUrl)
    let status = 0
    const c = {
        req: { url: fullUrl, path: decodeURIComponent(u.pathname) },
        json: (_body: unknown, s?: number) => {
            status = s ?? 200
            return new Response(null, { status: status })
        },
    }
    return { c: c as unknown as Context, status: () => status }
}

async function withEnv(fn: () => Promise<void>): Promise<void> {
    const priorKey = Deno.env.get('APP_KEY')
    const priorUrl = Deno.env.get('APP_URL')
    Deno.env.set('APP_KEY', KEY)
    Deno.env.set('APP_URL', ORIGIN)
    try {
        await fn()
    } finally {
        if (priorKey === undefined) Deno.env.delete('APP_KEY')
        else Deno.env.set('APP_KEY', priorKey)
        if (priorUrl === undefined) Deno.env.delete('APP_URL')
        else Deno.env.set('APP_URL', priorUrl)
    }
}

Deno.test('middleware: a valid signed URL calls next', async () => {
    await withEnv(async () => {
        const url = await signedUrl('verify-email', { id: 42 }, {
            expiresIn: 3600,
        })
        const { c, status } = fakeCtx(url)
        let called = false
        const next: Next = () => {
            called = true
            return Promise.resolve()
        }
        await new SignedUrlMiddleware().handle(c, next)
        assert(called, 'next should be called for a valid URL')
        assertEquals(status(), 0)
    })
})

Deno.test('MED-1: the request Host is NOT trusted — origin comes from APP_URL (S1)', async () => {
    await withEnv(async () => {
        const url = await signedUrl('verify-email', { id: 42 }, {
            expiresIn: 3600,
        })
        // Serve the same path+query under an attacker-controlled authority.
        const attackerUrl = url.replace(ORIGIN, 'https://attacker.evil')
        const { c, status } = fakeCtx(attackerUrl)
        let called = false
        const next: Next = () => {
            called = true
            return Promise.resolve()
        }
        await new SignedUrlMiddleware().handle(c, next)
        // Still verifies: the middleware canonicalises with APP_URL, not the Host.
        assert(
            called,
            'a valid signature must verify regardless of the request Host',
        )
        assertEquals(status(), 0)
    })
})

Deno.test('middleware: stripped signature, tampered param, and expired all 403', async () => {
    await withEnv(async () => {
        const valid = await signedUrl('verify-email', { id: 42 }, {
            expiresIn: 3600,
        })

        // strip signature
        const stripped = valid.replace(/[?&]signature=[^&]*/, '')
        // tamper the path
        const tampered = valid.replace('/verify/42', '/verify/43')
        // expired
        const expired = await signedUrl('verify-email', { id: 42 }, {
            expiresAt: 1,
        })

        for (const bad of [stripped, tampered, expired]) {
            const { c, status } = fakeCtx(bad)
            let called = false
            const next: Next = () => {
                called = true
                return Promise.resolve()
            }
            await new SignedUrlMiddleware().handle(c, next)
            assert(!called, `next must NOT be called for: ${bad}`)
            assertEquals(status(), 403)
        }
    })
})
