/**
 * Tests for multi-mount routing strategy
 * Validates dual-layer routing architecture with mount points
 */

import { assertEquals, assertExists } from '@std/assert'
import { App } from '../app.ts'
import type { Context, Next } from '../types.ts'
import { Controller, Get, Post } from '../routing/decorators.ts'

// Test controller for mount points testing
@Controller('/users')
class UserController {
    @Get('/')
    list(c: Context) {
        return c.json({ users: [], context: c.get('testContext') })
    }

    @Get('/:id')
    show(c: Context) {
        const id = c.req.param('id')
        return c.json({ id, user: { id } })
    }

    @Post('/')
    create(c: Context) {
        return c.json({ created: true }, 201)
    }
}

@Controller('/products')
class ProductController {
    @Get('/')
    list(c: Context) {
        const locale = c.get('locale')
        const apiVersion = c.get('apiVersion')
        return c.json({ products: [], locale, apiVersion })
    }
}

Deno.test('App - mounts at root when no mountPoints defined', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
    })

    const res = await app.fetch(new Request('http://localhost/users'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(Array.isArray(data.users), true)
})

Deno.test('App - controllers accessible at root path parameter routes', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
    })

    const res = await app.fetch(new Request('http://localhost/users/123'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(data.id, '123')
})

Deno.test('App - mounts controllers under single mount point pattern', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [
            { pattern: '/:langId/:countryId' },
        ],
    })

    // Should work under mount point
    const res = await app.fetch(new Request('http://localhost/fr/ca/users'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(Array.isArray(data.users), true)
})

Deno.test('App - mounts controllers under multiple mount point patterns', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [
            { pattern: '/:langId/:countryId' },
            { pattern: '/api/:version' },
        ],
    })

    // Both mount points should work
    const i18nRes = await app.fetch(new Request('http://localhost/fr/ca/users'))
    assertEquals(i18nRes.status, 200)

    const apiRes = await app.fetch(new Request('http://localhost/api/v1/users'))
    assertEquals(apiRes.status, 200)
})

Deno.test('App - executes mount-specific middleware', async () => {
    let middlewareCalled = false
    let extractedLang: string | undefined
    let extractedCountry: string | undefined

    const i18nMiddleware = async (c: Context, next: Next) => {
        middlewareCalled = true
        extractedLang = c.req.param('langId')
        extractedCountry = c.req.param('countryId')
        c.set('langId', extractedLang)
        c.set('countryId', extractedCountry)
        c.set('testContext', 'from-middleware')
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [
            { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
        ],
    })

    const res = await app.fetch(new Request('http://localhost/fr/ca/users'))
    assertEquals(res.status, 200)

    // Verify middleware was called
    assertEquals(middlewareCalled, true)
    assertEquals(extractedLang, 'fr')
    assertEquals(extractedCountry, 'ca')

    // Verify context was set
    const data = await res.json()
    assertEquals(data.context, 'from-middleware')
})

Deno.test('App - middleware can set context values for controllers', async () => {
    const i18nMiddleware = async (c: Context, next: Next) => {
        const langId = c.req.param('langId')
        const countryId = c.req.param('countryId')
        c.set('locale', `${langId}-${countryId}`)
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [ProductController],
        mountPoints: [
            { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
        ],
    })

    const res = await app.fetch(new Request('http://localhost/en/us/products'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(data.locale, 'en-us')
})

Deno.test('App - different mount points can have different middleware', async () => {
    const i18nMiddleware = async (c: Context, next: Next) => {
        c.set('locale', `${c.req.param('langId')}-${c.req.param('countryId')}`)
        return await next()
    }

    const apiVersionMiddleware = async (c: Context, next: Next) => {
        c.set('apiVersion', c.req.param('version'))
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [ProductController],
        mountPoints: [
            // More specific pattern first to avoid overlap
            { pattern: '/api/:version', middleware: apiVersionMiddleware },
            { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
        ],
    })

    // Test i18n mount point
    const i18nRes = await app.fetch(
        new Request('http://localhost/fr/ca/products'),
    )
    assertEquals(i18nRes.status, 200)
    const i18nData = await i18nRes.json()
    assertEquals(i18nData.locale, 'fr-ca')
    assertEquals(i18nData.apiVersion, undefined)

    // Test API mount point
    const apiRes = await app.fetch(
        new Request('http://localhost/api/v2/products'),
    )
    assertEquals(apiRes.status, 200)
    const apiData = await apiRes.json()
    assertEquals(apiData.apiVersion, 'v2')
    assertEquals(apiData.locale, undefined)
})

Deno.test('App - middleware can reject invalid parameters', async () => {
    const i18nMiddleware = async (c: Context, next: Next) => {
        const langId = c.req.param('langId')
        if (!['fr', 'en'].includes(langId)) {
            return c.notFound()
        }
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [
            { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
        ],
    })

    // Valid language
    const validRes = await app.fetch(
        new Request('http://localhost/fr/ca/users'),
    )
    assertEquals(validRes.status, 200)

    // Invalid language
    const invalidRes = await app.fetch(
        new Request('http://localhost/de/de/users'),
    )
    assertEquals(invalidRes.status, 404)
})

Deno.test('App - middleware can return custom error responses', async () => {
    const apiVersionMiddleware = async (c: Context, next: Next) => {
        const version = c.req.param('version')
        if (!['v1', 'v2'].includes(version)) {
            return c.json({ error: 'Unsupported API version' }, 400)
        }
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [
            { pattern: '/api/:version', middleware: apiVersionMiddleware },
        ],
    })

    // Valid version
    const validRes = await app.fetch(
        new Request('http://localhost/api/v1/users'),
    )
    assertEquals(validRes.status, 200)

    // Invalid version
    const invalidRes = await app.fetch(
        new Request('http://localhost/api/v3/users'),
    )
    assertEquals(invalidRes.status, 400)
    const data = await invalidRes.json()
    assertEquals(data.error, 'Unsupported API version')
})

Deno.test('App - 404 handler works with mount points', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [
            { pattern: '/:langId/:countryId' },
        ],
    })

    // Valid mount point but invalid route
    const res1 = await app.fetch(
        new Request('http://localhost/fr/ca/nonexistent'),
    )
    assertEquals(res1.status, 404)

    // Invalid path altogether
    const res2 = await app.fetch(
        new Request('http://localhost/invalid/path/here'),
    )
    assertEquals(res2.status, 404)
})

Deno.test('App - path parameters work in controller routes with mount points', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [
            { pattern: '/:langId/:countryId' },
        ],
    })

    const res = await app.fetch(new Request('http://localhost/fr/ca/users/456'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(data.id, '456')
})

Deno.test('App - POST requests work with mount points', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [
            { pattern: '/api/:version' },
        ],
    })

    const res = await app.fetch(
        new Request('http://localhost/api/v1/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'John' }),
        }),
    )
    assertEquals(res.status, 201)

    const data = await res.json()
    assertEquals(data.created, true)
})

Deno.test('App - mount points work with multiple controllers', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController, ProductController],
        mountPoints: [
            { pattern: '/:langId/:countryId' },
        ],
    })

    // Test first controller
    const usersRes = await app.fetch(
        new Request('http://localhost/en/us/users'),
    )
    assertEquals(usersRes.status, 200)

    // Test second controller
    const productsRes = await app.fetch(
        new Request('http://localhost/fr/ca/products'),
    )
    assertEquals(productsRes.status, 200)
})

Deno.test('App - empty mountPoints array falls back to root', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [],
    })

    const res = await app.fetch(new Request('http://localhost/users'))
    assertEquals(res.status, 200)
})

Deno.test('App - getRoutes() still works with mount points', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoints: [
            { pattern: '/:langId/:countryId' },
        ],
    })

    const routes = app.getRoutes()
    assertExists(routes)
    assertEquals(routes.length, 3) // GET /, GET /:id, POST /

    // Routes should show controller paths, not mount points
    const getUsersRoute = routes.find((r) => r.path === '/users')
    assertExists(getUsersRoute)
    assertEquals(getUsersRoute.method, 'GET')
})
