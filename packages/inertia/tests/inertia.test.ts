import { assertEquals, assertStringIncludes } from '@std/assert'
import { Hono } from 'hono'
import { inertiaMiddleware } from '../middleware.ts'
import type { Inertia } from '../inertia.ts'
import type { InertiaContextVariables } from '../types.ts'

Deno.test('Inertia.render - returns JSON for Inertia requests', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('TestComponent', { message: 'Hello' })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    assertEquals(res.status, 200)
    assertEquals(res.headers.get('X-Inertia'), 'true')
    assertEquals(res.headers.get('Vary'), 'X-Inertia')

    const json = await res.json()
    assertEquals(json.component, 'TestComponent')
    assertEquals(json.props.message, 'Hello')
    assertEquals(json.version, '1.0')
})

Deno.test('Inertia.render - returns HTML for initial page loads', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('HomePage', { title: 'Welcome' })
    })

    const res = await app.fetch(new Request('http://localhost/test'))

    assertEquals(res.status, 200)
    assertEquals(res.headers.get('Content-Type')?.includes('text/html'), true)

    const html = await res.text()
    assertStringIncludes(html, '<!DOCTYPE html>')
    assertStringIncludes(html, 'data-page=')
    assertStringIncludes(html, 'HomePage')
})

Deno.test('Inertia.share - merges shared props into render', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.use((c, next) => {
        const inertia = c.get('inertia') as Inertia
        inertia.share({ appName: 'My App', userId: 123 })
        return next()
    })
    app.get('/test', (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('Dashboard', { stats: 42 })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.appName, 'My App')
    assertEquals(json.props.userId, 123)
    assertEquals(json.props.stats, 42)
})

Deno.test('Inertia.render - resolves lazy props', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('Users', {
            users: () => ['Alice', 'Bob'],
            count: () => Promise.resolve(2),
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.users, ['Alice', 'Bob'])
    assertEquals(json.props.count, 2)
})

Deno.test('Inertia.render - includes errors object', async () => {
    const app = new Hono<{ Variables: InertiaContextVariables }>()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('Form', {})
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(typeof json.props.errors, 'object')
})
