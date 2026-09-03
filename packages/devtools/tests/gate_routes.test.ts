/**
 * Integration tests for the gated devtools routes (#161).
 *
 * With devtools active, drives the four collector-facing routes end to end
 * through `enableDevtools`, controlling the perceived peer via the conn-info env
 * `app.request(path, init, env)` injects and the credential via headers. Covers
 * US1 (loopback keeps zero-config access), US2 (remote denied), US4 (proxy /
 * DNS-rebinding denied), and US3 (token / authorize open access deliberately).
 *
 * @module @lockness/devtools/tests/gate_routes
 */

import { assert, assertEquals } from '@std/assert'
import { Hono } from '@lockness/hono'
import { collector } from '../collector.ts'
import { enableDevtools } from '../mod.ts'
import type { DevtoolsConfig } from '../types.ts'

const BASE = '/_devtools'
const LOOPBACK = {
    remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 12345 },
}
const REMOTE = {
    remoteAddr: { transport: 'tcp', hostname: '203.0.113.7', port: 5555 },
}

/** The four collector-facing routes and the method each is reached with. */
const ROUTES: ReadonlyArray<{ method: string; path: string }> = [
    { method: 'GET', path: BASE },
    { method: 'GET', path: `${BASE}/api/data` },
    { method: 'GET', path: `${BASE}/api/component-tree/Foo` },
    { method: 'POST', path: `${BASE}/clear` },
]

/** Run `fn` with devtools explicitly active, restoring env after. */
async function withActiveDevtools(fn: () => Promise<void>): Promise<void> {
    const keys = [
        'DENO_ENV',
        'APP_ENV',
        'LOCKNESS_DEVTOOLS',
        'LOCKNESS_DEVTOOLS_TOKEN',
    ]
    const prev = Object.fromEntries(keys.map((k) => [k, Deno.env.get(k)]))
    Deno.env.delete('DENO_ENV')
    Deno.env.delete('APP_ENV')
    Deno.env.delete('LOCKNESS_DEVTOOLS_TOKEN')
    Deno.env.set('LOCKNESS_DEVTOOLS', '1')
    try {
        await fn()
    } finally {
        for (const k of keys) {
            const v = prev[k]
            if (v === undefined) Deno.env.delete(k)
            else Deno.env.set(k, v)
        }
    }
}

/** Build an app with devtools enabled under `cfg`, seeding one collector log. */
function appWith(cfg: DevtoolsConfig = {}): Hono {
    const app = new Hono()
    enableDevtools(app, cfg)
    collector.clear()
    collector.addLog({ timestamp: 1, level: 'info', message: 'seed-marker' })
    return app
}

// --- US1: loopback keeps zero-config access (SC-002) -----------------------

Deno.test('US1 - loopback, no credential: dashboard + data succeed', async () => {
    await withActiveDevtools(async () => {
        const app = appWith()

        const dash = await app.request(BASE, {}, LOOPBACK)
        assertEquals(dash.status, 200, 'dashboard served to loopback')

        const data = await app.request(`${BASE}/api/data`, {}, LOOPBACK)
        assertEquals(data.status, 200, 'data served to loopback')
        const body = await data.json()
        assert(
            Array.isArray(body.logs) &&
                body.logs.some((l: { message?: string }) =>
                    l.message === 'seed-marker'
                ),
            'collector data returned to loopback',
        )

        // The gate lets a loopback caller through to EVERY route, not only the
        // two asserted above (a non-401 means the gate passed; the handler's own
        // status — e.g. 503 when the analyzer is not ready — is not the gate).
        for (const { method, path } of ROUTES) {
            const res = await app.request(path, { method }, LOOPBACK)
            assert(
                res.status !== 401,
                `${method} ${path} passes the gate for loopback (got ${res.status})`,
            )
        }
    })
})

// --- US2: remote unauthenticated caller is denied (SC-001) -----------------

Deno.test('US2 - remote, no credential: every route 401, no data, no wipe', async () => {
    await withActiveDevtools(async () => {
        const app = appWith()

        for (const { method, path } of ROUTES) {
            const res = await app.request(path, { method }, REMOTE)
            assertEquals(res.status, 401, `${method} ${path} denied`)
            const text = await res.text()
            assertEquals(text, '', `${method} ${path} returns an empty body`)
        }

        // The denied POST /clear must not have wiped the collector.
        assert(
            collector.getLogs().some((l) => l.message === 'seed-marker'),
            'a denied /clear did not mutate the collector',
        )
    })
})

// --- US4: proxied host / DNS-rebinding is denied (SC-004) -------------------

Deno.test('US4 - loopback + forwarding header, or foreign Host: 401', async () => {
    await withActiveDevtools(async () => {
        const app = appWith()

        const proxied = await app.request(
            `${BASE}/api/data`,
            { headers: { 'x-forwarded-for': '203.0.113.9' } },
            LOOPBACK,
        )
        assertEquals(proxied.status, 401, 'forwarding header revokes trust')

        const rebound = await app.request(
            `${BASE}/api/data`,
            { headers: { host: 'evil.example.com' } },
            LOOPBACK,
        )
        assertEquals(rebound.status, 401, 'foreign Host denied (DNS-rebinding)')
    })
})

// --- US3: operator opens remote access deliberately (SC-003/SC-005) ---------

Deno.test('US3 - token: correct Bearer from remote allows, wrong/absent denies', async () => {
    await withActiveDevtools(async () => {
        const app = appWith({ token: 'a-strong-token' })

        const ok = await app.request(
            `${BASE}/api/data`,
            { headers: { authorization: 'Bearer a-strong-token' } },
            REMOTE,
        )
        assertEquals(ok.status, 200, 'correct token allowed from remote')

        const wrong = await app.request(
            `${BASE}/api/data`,
            { headers: { authorization: 'Bearer nope' } },
            REMOTE,
        )
        assertEquals(wrong.status, 401, 'wrong token denied')

        const absent = await app.request(`${BASE}/api/data`, {}, REMOTE)
        assertEquals(absent.status, 401, 'absent token denied')
    })
})

Deno.test('US3 - authorize: true allows, false denies, throwing denies', async () => {
    await withActiveDevtools(async () => {
        const allow = appWith({ authorize: () => true })
        assertEquals(
            (await allow.request(`${BASE}/api/data`, {}, REMOTE)).status,
            200,
            'authorize=true allows from remote',
        )

        const deny = appWith({ authorize: () => false })
        assertEquals(
            (await deny.request(`${BASE}/api/data`, {}, LOOPBACK)).status,
            401,
            'authorize=false denies even loopback',
        )

        const boom = appWith({
            authorize: () => {
                throw new Error('nope')
            },
        })
        assertEquals(
            (await boom.request(`${BASE}/api/data`, {}, LOOPBACK)).status,
            401,
            'a throwing authorize denies (fail closed)',
        )
    })
})
