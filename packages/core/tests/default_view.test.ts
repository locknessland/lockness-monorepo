/**
 * Tests for the default error pages (#470).
 *
 * The pages are built with Hono's `html` tagged template instead of JSX so
 * that `@lockness/core` publishes no `.tsx` — a published `.tsx` is transpiled
 * with the CONSUMING app's `jsxImportSource` under `"jsx": "precompile"`, which
 * made every no-JSX app fail at load. Moving off JSX must not cost the escaping
 * JSX gave for free: the dev 500 page interpolates the error message and stack,
 * which can carry attacker-influenced text.
 *
 * @module @lockness/core/tests/default_view
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Hono } from 'hono'
import { defaultErrorHandler } from '../exceptions/default_view.ts'
import { ErrorHandlerRegistry } from '../exceptions/handler.ts'

const PAYLOAD = '<script>alert("pwned")</script>'

/**
 * Render the default error page for an error thrown with `status`, under the
 * given `APP_ENV` (and no `DENO_ENV`), with console output silenced (the handler logs every
 * error through `formatErrorForConsole`). A `null` stack removes it.
 */
async function render(
    status: number | undefined,
    env: string,
    message = 'boom',
    stack?: string | null,
): Promise<{ status: number; type: string | null; body: string }> {
    const app = new Hono()
    app.get('/x', () => {
        const error = new Error(message) as Error & { status?: number }
        if (status !== undefined) error.status = status
        if (stack !== undefined) error.stack = stack ?? undefined
        throw error
    })
    app.onError((e, c) => defaultErrorHandler(e as Error, c))

    const prevDeno = Deno.env.get('DENO_ENV')
    const prevApp = Deno.env.get('APP_ENV')
    const origErr = console.error
    const origLog = console.log
    Deno.env.set('APP_ENV', env)
    Deno.env.delete('DENO_ENV')
    console.error = () => {}
    console.log = () => {}
    try {
        const res = await app.request('/x')
        return {
            status: res.status,
            type: res.headers.get('content-type'),
            body: await res.text(),
        }
    } finally {
        console.error = origErr
        console.log = origLog
        if (prevDeno === undefined) Deno.env.delete('DENO_ENV')
        else Deno.env.set('DENO_ENV', prevDeno)
        if (prevApp === undefined) Deno.env.delete('APP_ENV')
        else Deno.env.set('APP_ENV', prevApp)
    }
}

Deno.test('defaultErrorHandler - dev 500 escapes a <script> in the error message', async () => {
    const res = await render(undefined, 'development', PAYLOAD)
    assertEquals(res.status, 500)
    assert(
        !res.body.includes(PAYLOAD),
        'the raw <script> payload must never reach the page',
    )
    assertStringIncludes(
        res.body,
        '&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;',
    )
})

Deno.test('defaultErrorHandler - dev 500 escapes markup in the stack trace', async () => {
    const res = await render(
        undefined,
        'development',
        'boom',
        `Error: ${PAYLOAD}\n    at handler (app.ts:1:1)`,
    )
    assertEquals(res.status, 500)
    assert(!res.body.includes(PAYLOAD), 'the stack must be escaped too')
    assertStringIncludes(res.body, 'Error: &lt;script&gt;')
    assertStringIncludes(res.body, 'at handler (app.ts:1:1)')
})

Deno.test('defaultErrorHandler - dev 500 renders the message without a stack', async () => {
    const res = await render(undefined, 'development', 'no-stack-here', null)
    assertStringIncludes(res.body, '<pre>no-stack-here</pre>')
    assert(!res.body.includes('undefined'), 'a missing stack renders nothing')
})

const STATUS_PAGES: ReadonlyArray<[number, string, string]> = [
    [404, '404 - Not Found', 'Page Not Found'],
    [401, '401 - Unauthorized', 'Unauthorized'],
    [403, '403 - Forbidden', 'Access Forbidden'],
]

for (const [status, title, heading] of STATUS_PAGES) {
    Deno.test(`defaultErrorHandler - ${status} page renders with status ${status}`, async () => {
        const res = await render(status, 'production')
        assertEquals(res.status, status)
        assertStringIncludes(res.type ?? '', 'text/html')
        assertStringIncludes(res.body, `<title>${title}</title>`)
        assertStringIncludes(res.body, `<h1>${status}</h1>`)
        assertStringIncludes(res.body, `<h2>${heading}</h2>`)
        assert(
            !res.body.includes('error-details'),
            'a status page never carries error details',
        )
    })
}

Deno.test('defaultErrorHandler - an unknown status falls back to a 500 page', async () => {
    const res = await render(418, 'production')
    assertEquals(res.status, 500)
    assertStringIncludes(res.body, '<title>500 - Server Error</title>')
})

Deno.test('ErrorHandlerRegistry - falls back to the default handler', async () => {
    const registry = new ErrorHandlerRegistry()
    registry.setCustomHandlerPath('does/not/exist/error_handler.tsx')
    assertEquals(await registry.discover(), defaultErrorHandler)
})
