/**
 * `/health` + `/ready` bootstrap step (#218).
 *
 * The step registers two handlers on the root Hono layer; these tests capture
 * those handlers via a fake root and invoke them with a fake context, so the
 * aggregation, the 503-with-name-only body, the never-leak-detail rule, the
 * throw→down safety, and the short-TTL cache are all exercised without booting
 * a full application.
 *
 * @module @lockness/core/tests/health_routes
 */

import { assert, assertEquals } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { deregisterHealthCheck, registerHealthCheck } from '@lockness/contract'
import { collectHealthChecks } from '@lockness/contract/lifecycle/health/internal'
import { healthStep } from '../kernel/bootstrap/steps/health.ts'

/** Clear the process-wide registry so each test starts from zero. */
function resetRegistry(): void {
    for (const c of collectHealthChecks()) {
        deregisterHealthCheck({ _check: c })
    }
}

type Handler = (c: FakeCtx) => Response | Promise<Response>

interface FakeCtx {
    json(body: unknown, status?: number): Response
}

const ctx: FakeCtx = {
    json: (body, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        }),
}

/** Run the step against a fake root and return the captured route handlers. */
function mountHandlers(): Map<string, Handler> {
    const routes = new Map<string, Handler>()
    const fakeApp = {
        getRootHono: () => ({
            get: (path: string, handler: Handler) => routes.set(path, handler),
        }),
    }
    healthStep.run(
        { app: fakeApp, config: {} } as unknown as Parameters<
            typeof healthStep.run
        >[0],
    )
    return routes
}

Deno.test('/health is liveness-only — 200 and runs no check', async () => {
    resetRegistry()
    let ran = false
    registerHealthCheck({
        name: 'x',
        check: () => {
            ran = true
            return Promise.resolve({ ok: true })
        },
    })
    const res = await mountHandlers().get('/health')!(ctx)
    assertEquals(res.status, 200)
    assertEquals((await res.json()).status, 'ok')
    assertEquals(ran, false, '/health must not run any dependency check')
    resetRegistry()
})

Deno.test('/ready is 200 with up statuses when every check passes', async () => {
    resetRegistry()
    registerHealthCheck({
        name: 'db',
        check: () => Promise.resolve({ ok: true }),
    })
    registerHealthCheck({
        name: 'cache',
        check: () => Promise.resolve({ ok: true }),
    })
    const res = await mountHandlers().get('/ready')!(ctx)
    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.status, 'ready')
    assertEquals(
        body.checks.map((c: { name: string; status: string }) => c.status),
        ['up', 'up'],
    )
    resetRegistry()
})

Deno.test('/ready is 503 and reports the failing check NAME but never its detail', async () => {
    resetRegistry()
    const secret = 'ECONNREFUSED 10.0.3.5:6379 password=hunter2'
    registerHealthCheck({
        name: 'db',
        check: () => Promise.resolve({ ok: true }),
    })
    registerHealthCheck({
        name: 'redis',
        check: () => Promise.resolve({ ok: false, detail: secret }),
    })
    const res = await mountHandlers().get('/ready')!(ctx)
    assertEquals(res.status, 503)
    const raw = await res.text()
    assert(raw.includes('"name":"redis"'), 'names the failing check')
    assert(raw.includes('"status":"down"'))
    assert(
        !raw.includes('hunter2') && !raw.includes('10.0.3.5'),
        'the raw dependency detail must never reach the public body',
    )
    resetRegistry()
})

Deno.test('/ready treats a throwing check as down (never throws)', async () => {
    resetRegistry()
    registerHealthCheck({
        name: 'boom',
        check: () => Promise.reject(new Error('kaboom')),
    })
    const res = await mountHandlers().get('/ready')!(ctx)
    assertEquals(res.status, 503)
    assertEquals((await res.json()).checks[0].status, 'down')
    resetRegistry()
})

Deno.test('/ready coerces a hung check to down within the per-check timeout', async () => {
    const time = new FakeTime()
    const warn = console.warn
    console.warn = () => {}
    try {
        resetRegistry()
        // A check that never resolves — only the timeout can settle it.
        registerHealthCheck({
            name: 'hung',
            check: () => new Promise(() => {}),
        })
        const pending = mountHandlers().get('/ready')!(ctx)
        await time.tickAsync(3_000) // CHECK_TIMEOUT_MS
        const res = await pending
        assertEquals(res.status, 503)
        assertEquals((await res.json()).checks[0].status, 'down')
        resetRegistry()
    } finally {
        console.warn = warn
        time.restore()
    }
})

Deno.test('/ready re-evaluates after the cache TTL expires', async () => {
    const time = new FakeTime()
    try {
        resetRegistry()
        let runs = 0
        registerHealthCheck({
            name: 'counted',
            check: () => {
                runs++
                return Promise.resolve({ ok: true })
            },
        })
        const ready = mountHandlers().get('/ready')!
        await ready(ctx)
        await time.tickAsync(1_100) // past READY_CACHE_TTL_MS
        await ready(ctx)
        assertEquals(
            runs,
            2,
            'the aggregate is re-evaluated once the TTL lapses',
        )
        resetRegistry()
    } finally {
        time.restore()
    }
})

Deno.test('/ready caches the aggregate for a short TTL (one eval per burst)', async () => {
    resetRegistry()
    let runs = 0
    registerHealthCheck({
        name: 'counted',
        check: () => {
            runs++
            return Promise.resolve({ ok: true })
        },
    })
    const ready = mountHandlers().get('/ready')!
    await ready(ctx)
    await ready(ctx)
    assertEquals(runs, 1, 'two probes within the TTL share one evaluation')
    resetRegistry()
})
