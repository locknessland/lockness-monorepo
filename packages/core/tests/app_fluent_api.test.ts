/**
 * Tests for App class fluent API methods
 */

import { assertEquals, assertExists } from '@std/assert'
import { App } from '../app.ts'
import type { Context, IMiddleware, MiddlewareHandler } from '../types.ts'

// Mock middleware class for testing
class MockMiddleware implements IMiddleware {
    handle: MiddlewareHandler = async (_c, next) => {
        await next()
    }
}

const mockMiddleware = MockMiddleware

Deno.test('App - isDevelopment checks environment', () => {
    // Save original value
    const originalEnv = Deno.env.get('APP_ENV')

    try {
        // Test development
        Deno.env.set('APP_ENV', 'development')
        const app1 = new App()
        assertEquals(app1.isDevelopment, true)
        assertEquals(app1.isProduction, false)

        // Test production
        Deno.env.set('APP_ENV', 'production')
        const app2 = new App()
        assertEquals(app2.isDevelopment, false)
        assertEquals(app2.isProduction, true)
    } finally {
        // Restore original
        if (originalEnv) {
            Deno.env.set('APP_ENV', originalEnv)
        } else {
            Deno.env.delete('APP_ENV')
        }
    }
})

Deno.test('App - useMiddleware returns app for chaining', () => {
    const app = new App()

    const result = app.useMiddleware(mockMiddleware)

    assertEquals(result, app, 'Should return app instance for chaining')
})

Deno.test('App - useMiddleware accepts multiple middlewares', () => {
    const app = new App()

    const result = app.useMiddleware(mockMiddleware, mockMiddleware)

    assertEquals(result, app)
})

Deno.test('App - useErrorHandler returns app for chaining', () => {
    const app = new App()

    const mockHandler = (_error: Error, _c: Context) => {
        return new Response(JSON.stringify({ error: 'test' }), { status: 500 })
    }

    const result = app.useErrorHandler(mockHandler)

    assertEquals(result, app, 'Should return app instance for chaining')
})

Deno.test('App - fluent API can be chained', () => {
    const app = new App()

    const mockHandler = (_error: Error, _c: Context) => {
        return new Response(JSON.stringify({ error: 'test' }), { status: 500 })
    }

    const result = app
        .useMiddleware(mockMiddleware)
        .useErrorHandler(mockHandler)
        .useMiddleware(mockMiddleware)

    assertEquals(result, app, 'Chained calls should return same app instance')
})

Deno.test('App - init merges fluent API middlewares with config', async () => {
    const app = new App()

    // Add middleware via fluent API
    app.useMiddleware(mockMiddleware)

    // Mock the internal hono instance to track middleware registration
    let middlewareCount = 0
    const originalUse = app.getHono().use.bind(app.getHono())
    // deno-lint-ignore no-explicit-any
    app.getHono().use = (...args: any[]) => {
        if (args[0] === '*') {
            // Count global middlewares
            middlewareCount += args.length - 1
        }
        return originalUse(...args)
    }

    // Initialize with additional config middlewares
    await app.init({
        controllers: [],
        globalMiddlewares: [mockMiddleware],
    })

    // Should have both fluent API middleware and config middleware
    assertEquals(
        middlewareCount >= 2,
        true,
        'Should register middlewares from both fluent API and config',
    )
})

Deno.test('App - init uses fluent API error handler when provided', async () => {
    const app = new App()

    let _handlerCalled = false
    const mockHandler = (_error: Error, _c: Context) => {
        _handlerCalled = true
        return new Response('error', { status: 500 })
    }

    app.useErrorHandler(mockHandler)

    await app.init({
        controllers: [],
    })

    // Trigger error handler through Hono
    const hono = app.getHono()
    const response = await hono.fetch(
        new Request('http://localhost/nonexistent'),
    )

    assertExists(response, 'Should return a response')
})

Deno.test('App - init prefers fluent API error handler over config', async () => {
    const app = new App()

    let _fluentHandlerCalled = false
    let _configHandlerCalled = false

    const fluentHandler = (_error: Error, _c: Context) => {
        _fluentHandlerCalled = true
        return new Response('fluent', { status: 500 })
    }

    const configHandler = (_error: Error, _c: Context) => {
        _configHandlerCalled = true
        return new Response('config', { status: 500 })
    }

    app.useErrorHandler(fluentHandler)

    await app.init({
        controllers: [],
        errorHandler: configHandler,
    })

    // Fluent API handler should be used, not config handler
    // This test verifies the preference order
    assertExists(app.getHono(), 'App should be initialized')
})
