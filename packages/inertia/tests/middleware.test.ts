import { assertEquals } from '@std/assert'
import { Hono } from 'hono'
import { inertiaMiddleware } from '../middleware.ts'
import type { InertiaContextVariables } from '../types.ts'

Deno.test('inertiaMiddleware - injects Inertia instance into context', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()
    let hasInertia = false

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        hasInertia = c.get('inertia') !== undefined
        return c.text('ok')
    })

    await app.fetch(new Request('http://localhost/test'))
    assertEquals(hasInertia, true)
})

Deno.test('inertiaMiddleware - returns 409 on version mismatch', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '2.0' }))
    app.get('/test', (c) => c.text('ok'))

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    assertEquals(res.status, 409)
    assertEquals(res.headers.get('X-Inertia-Location'), 'http://localhost/test')
})

Deno.test('inertiaMiddleware - passes through when versions match', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => c.text('ok'))

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    assertEquals(res.status, 200)
})

Deno.test('inertiaMiddleware - converts 302 to 303 for PUT', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.put('/test', (c) => c.redirect('/other', 302))

    const res = await app.fetch(
        new Request('http://localhost/test', {
            method: 'PUT',
            headers: { 'X-Inertia': 'true' },
        }),
    )

    assertEquals(res.status, 303)
})

Deno.test('inertiaMiddleware - resolves version from function', async () => {
    const app = new Hono()
    let versionCalled = false

    app.use(
        inertiaMiddleware({
            version: () => {
                versionCalled = true
                return 'dynamic-1.0'
            },
        }),
    )
    app.get('/test', (c) => c.text('ok'))

    await app.fetch(new Request('http://localhost/test'))
    assertEquals(versionCalled, true)
})
