/**
 * Integration tests for refactored App class
 * Ensures backward compatibility and that all components work together correctly
 */

import { assertEquals, assertExists } from '@std/assert'
import { App, Controller, Get } from '../mod.ts'
import type { Context } from '../types.ts'

// Test controller for integration testing
@Controller('/test')
class TestController {
    @Get('/')
    index(c: Context) {
        return c.json({ message: 'Hello from TestController' })
    }

    @Get('/echo/:id')
    echo(c: Context) {
        return c.json({ id: c.req.param('id') })
    }
}

Deno.test('App refactoring - basic controller registration works', async () => {
    const app = new App()

    await app.init({
        controllers: [TestController],
    })

    const routes = app.getRoutes()
    assertEquals(routes.length, 2, 'Should register 2 routes')
    assertEquals(routes[0].method, 'GET')
    assertEquals(routes[0].path, '/test/')
    assertEquals(routes[1].path, '/test/echo/:id')
})

Deno.test('App refactoring - fluent API still works', async () => {
    const app = new App()

    const mockHandler = (_error: Error, _c: Context) => {
        return new Response('error', { status: 500 })
    }

    // Test chaining
    const result = app
        .useErrorHandler(mockHandler)

    assertEquals(result, app, 'Should support method chaining')

    await app.init({
        controllers: [TestController],
    })

    assertExists(app.getHono(), 'Should have Hono instance')
})

Deno.test('App refactoring - route registration maintains order', async () => {
    @Controller('/order')
    class OrderTestController {
        @Get('/specific')
        specific(c: Context) {
            return c.json({ route: 'specific' })
        }

        @Get('/:id')
        dynamic(c: Context) {
            return c.json({ route: 'dynamic' })
        }
    }

    const app = new App()

    await app.init({
        controllers: [OrderTestController],
    })

    const routes = app.getRoutes()

    // Specific routes should come before dynamic ones
    const specificIndex = routes.findIndex((r) => r.path === '/order/specific')
    const dynamicIndex = routes.findIndex((r) => r.path === '/order/:id')

    assertEquals(
        specificIndex < dynamicIndex,
        true,
        'Specific routes should be registered before dynamic routes',
    )
})

Deno.test('App refactoring - getRoutes() returns route info', async () => {
    const app = new App()

    await app.init({
        controllers: [TestController],
    })

    const routes = app.getRoutes()

    assertExists(routes, 'Routes should exist')
    assertEquals(Array.isArray(routes), true, 'Routes should be an array')
    assertEquals(routes.length > 0, true, 'Routes array should not be empty')

    const route = routes[0]
    assertExists(route.method, 'Route should have method')
    assertExists(route.path, 'Route should have path')
    assertExists(route.controller, 'Route should have controller name')
    assertExists(route.action, 'Route should have action name')
    assertExists(route.middlewares, 'Route should have middlewares array')
})

Deno.test('App refactoring - environment checks still work', () => {
    const originalEnv = Deno.env.get('APP_ENV')

    try {
        Deno.env.set('APP_ENV', 'development')
        const app1 = new App()
        assertEquals(app1.isDevelopment, true)
        assertEquals(app1.isProduction, false)

        Deno.env.set('APP_ENV', 'production')
        const app2 = new App()
        assertEquals(app2.isDevelopment, false)
        assertEquals(app2.isProduction, true)
    } finally {
        if (originalEnv) {
            Deno.env.set('APP_ENV', originalEnv)
        } else {
            Deno.env.delete('APP_ENV')
        }
    }
})
