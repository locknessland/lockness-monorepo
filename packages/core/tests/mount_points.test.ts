/**
 * Tests for mount point routing strategy
 * Validates dual-layer routing architecture with mount point
 */

import { assertEquals, assertExists } from '@std/assert'
import { App } from '../app.ts'
import type { Context, Next } from '../types.ts'
import { Controller, Get, Post } from '../routing/decorators.ts'

// Test controller for mount point testing
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
        return c.json({ products: [], locale })
    }
}

Deno.test('App - mounts at root when no mountPoint defined', async () => {
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

Deno.test('App - mounts controllers under mount point pattern', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    // Should work under mount point
    const res = await app.fetch(new Request('http://localhost/fr/ca/users'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(Array.isArray(data.users), true)
})

Deno.test('App - routes accessible at root AND under mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    // Should work at root
    const rootRes = await app.fetch(new Request('http://localhost/users'))
    assertEquals(rootRes.status, 200)

    // Should also work under mount point
    const mountRes = await app.fetch(
        new Request('http://localhost/fr/ca/users'),
    )
    assertEquals(mountRes.status, 200)
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
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
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
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    })

    const res = await app.fetch(new Request('http://localhost/en/us/products'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(data.locale, 'en-us')
})

Deno.test('App - middleware does not run for root access', async () => {
    let middlewareCalled = false

    const i18nMiddleware = async (c: Context, next: Next) => {
        middlewareCalled = true
        c.set('locale', `${c.req.param('langId')}-${c.req.param('countryId')}`)
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [ProductController],
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    })

    // Access at root - middleware should NOT run
    const res = await app.fetch(new Request('http://localhost/products'))
    assertEquals(res.status, 200)
    assertEquals(middlewareCalled, false)

    const data = await res.json()
    assertEquals(data.locale, undefined)
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
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
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
    const i18nMiddleware = async (c: Context, next: Next) => {
        const langId = c.req.param('langId')
        if (!['en', 'fr'].includes(langId)) {
            return c.json({ error: 'Unsupported language' }, 400)
        }
        return await next()
    }

    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    })

    // Valid language
    const validRes = await app.fetch(
        new Request('http://localhost/en/us/users'),
    )
    assertEquals(validRes.status, 200)

    // Invalid language
    const invalidRes = await app.fetch(
        new Request('http://localhost/de/de/users'),
    )
    assertEquals(invalidRes.status, 400)
    const data = await invalidRes.json()
    assertEquals(data.error, 'Unsupported language')
})

Deno.test('App - 404 handler works with mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
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

Deno.test('App - path parameters work in controller routes with mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    const res = await app.fetch(new Request('http://localhost/fr/ca/users/456'))
    assertEquals(res.status, 200)

    const data = await res.json()
    assertEquals(data.id, '456')
})

Deno.test('App - POST requests work with mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    const res = await app.fetch(
        new Request('http://localhost/fr/ca/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'John' }),
        }),
    )
    assertEquals(res.status, 201)

    const data = await res.json()
    assertEquals(data.created, true)
})

Deno.test('App - mount point works with multiple controllers', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController, ProductController],
        mountPoint: { pattern: '/:langId/:countryId' },
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

Deno.test('App - getRoutes() still works with mount point', async () => {
    const app = new App()

    await app.init({
        controllers: [UserController],
        mountPoint: { pattern: '/:langId/:countryId' },
    })

    const routes = app.getRoutes()
    assertExists(routes)
    assertEquals(routes.length, 3) // GET /, GET /:id, POST /

    // Routes should show controller paths, not mount point
    const getUsersRoute = routes.find((r) => r.path === '/users')
    assertExists(getUsersRoute)
    assertEquals(getUsersRoute.method, 'GET')
})
