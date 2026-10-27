/**
 * @fileoverview The tracing middleware no-ops cleanly when OTEL is not enabled —
 * it calls `next` and adds no observable behaviour (SC-004).
 *
 * @module @lockness/telemetry/tests/middleware
 */

import { assert, assertEquals } from '@std/assert'
import { trace } from '@opentelemetry/api'
import type { Span, Tracer, TracerProvider } from '@opentelemetry/api'
import { telemetryMiddleware } from '../mod.ts'
import type { Context, Next } from '@lockness/hono'

function fakeCtx(): Context {
    return {
        req: { routePath: '/health', path: '/health', method: 'GET' },
        res: { status: 200 },
    } as unknown as Context
}

/**
 * A fake OTel tracer provider whose span captures every argument handed to
 * `recordException`, so a test can assert on exactly what the middleware
 * recorded. Registered globally with `trace.setGlobalTracerProvider` so that the
 * tracer `telemetryMiddleware` obtains via `trace.getTracer` is ours.
 */
function fakeProvider(): { provider: TracerProvider; recorded: unknown[] } {
    const recorded: unknown[] = []
    const span = {
        setAttribute: () => span,
        recordException: (exception: unknown) => {
            recorded.push(exception)
        },
        setStatus: () => span,
        end: () => {},
    }
    const tracer = {
        startActiveSpan: (_name: string, fn: (s: Span) => unknown): unknown =>
            fn(span as unknown as Span),
    }
    const provider = { getTracer: () => tracer as unknown as Tracer }
    return { provider: provider as unknown as TracerProvider, recorded }
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

Deno.test('S4 wiring: a thrown error is routed through redaction before recordException', async () => {
    // Inject a fake tracer whose span captures the recordException argument, so
    // this locks the WIRING: a future refactor that passed the raw error to
    // `span.recordException` (bypassing `toRecordedException`) would fail here.
    trace.disable() // reset any provider a prior test registered
    const { provider, recorded } = fakeProvider()
    assert(
        trace.setGlobalTracerProvider(provider),
        'the fake tracer provider must register',
    )
    try {
        const mw = telemetryMiddleware()
        const err = new Error('connection failed') as Error & {
            cause?: unknown
        }
        // Plant secrets where an unredacted path would leak them: the stack and
        // the cause.
        err.stack =
            'Error: connection failed\n  at postgres://admin:STACKSECRET@db/app'
        err.cause = 'postgres://admin:CAUSESECRET@db/app'
        const next: Next = () => Promise.reject(err)

        await mw(fakeCtx(), next).catch(() => {}) // middleware re-throws; ignore

        assertEquals(recorded.length, 1, 'recordException must be called once')
        const captured = recorded[0]
        const serialised = JSON.stringify(captured)
        assert(
            !serialised.includes('STACKSECRET'),
            'the stack secret must not reach the span',
        )
        assert(
            !serialised.includes('CAUSESECRET'),
            'the cause secret must not reach the span',
        )
        // A raw Error would carry a `stack`; its absence proves redaction ran.
        assert(
            typeof captured === 'object' && captured !== null &&
                !('stack' in captured),
            'the recorded exception must not carry a stack (redaction applied)',
        )
    } finally {
        trace.disable() // leave the global API back at its no-op default
    }
})
