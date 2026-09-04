/**
 * @fileoverview The tracing middleware no-ops cleanly when OTEL is not enabled —
 * it calls `next` and adds no observable behaviour (SC-004).
 *
 * @module @lockness/telemetry/tests/middleware
 */

import { assert, assertEquals } from '@std/assert'
import { telemetryMiddleware } from '../mod.ts'
import type { Context, Next } from '@lockness/hono'

function fakeCtx(): Context {
    return {
        req: { routePath: '/health', path: '/health', method: 'GET' },
        res: { status: 200 },
    } as unknown as Context
}

Deno.test('SC-004: middleware calls next and does not throw when OTEL is off', async () => {
    // No OTEL_DENO in the test process → the API's no-op provider; the span ops
    // are inert and next runs normally.
    const mw = telemetryMiddleware()
    let called = false
    const next: Next = () => {
        called = true
        return Promise.resolve()
    }
    await mw(fakeCtx(), next)
    assert(called, 'next must be called')
})

Deno.test('middleware re-throws a handler error (span records it, then rethrows)', async () => {
    const mw = telemetryMiddleware()
    const boom = new Error('boom')
    const next: Next = () => Promise.reject(boom)
    let caught: unknown
    try {
        await mw(fakeCtx(), next)
    } catch (e) {
        caught = e
    }
    assertEquals(caught, boom)
})
