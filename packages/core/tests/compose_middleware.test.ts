/**
 * @fileoverview Tests for @ComposeMiddleware decorator
 *
 * Tests the inline middleware composition decorator that combines
 * compose() + @UseMiddleware into a single elegant decorator.
 */

import { assertEquals } from '@std/assert'
import {
    ComposeMiddleware,
    Controller,
    declaredMiddlewares,
    DeclareMiddleware,
    Get,
    type MiddlewareHandler,
} from '../mod.ts'
import type { Context, Next } from '../types.ts'

// =============================================================================
// Test Middlewares
// =============================================================================

/** Test middleware class for tracking execution */
class TestMiddleware {
    static executionLog: string[] = []

    async handle(_c: Context, next: Next) {
        TestMiddleware.executionLog.push('TestMiddleware:before')
        await next()
        TestMiddleware.executionLog.push('TestMiddleware:after')
    }
}

/** Hono-style function middleware for tracking */
const loggerMiddleware: MiddlewareHandler = async (_c, next) => {
    TestMiddleware.executionLog.push('logger:before')
    await next()
    TestMiddleware.executionLog.push('logger:after')
}

/** Named middleware registered via @DeclareMiddleware */
@DeclareMiddleware('test-named')
class _NamedTestMiddleware {
    async handle(_c: Context, next: Next) {
        TestMiddleware.executionLog.push('named:before')
        await next()
        TestMiddleware.executionLog.push('named:after')
    }
}

// =============================================================================
// Test: Basic decorator syntax
// =============================================================================

Deno.test('ComposeMiddleware - should register composed middlewares on method', () => {
    @Controller('/test')
    class TestController {
        @Get('/users')
        @ComposeMiddleware(loggerMiddleware, TestMiddleware)
        users(_c: Context) {
            return new Response('ok')
        }
    }

    // Instantiate to trigger TC39 decorator initialization
    new TestController()

    // Check that middlewares are registered
    const middlewares = (TestController as any)._middlewares?.['users']
    assertEquals(
        middlewares?.length,
        1,
        'Should have 1 composed middleware registered',
    )
})

Deno.test('ComposeMiddleware - should accept named middlewares', () => {
    // Ensure named middleware is registered
    assertEquals(
        declaredMiddlewares.has('test-named'),
        true,
        'Named middleware should be in registry',
    )

    @Controller('/test2')
    class TestController2 {
        @Get('/admin')
        @ComposeMiddleware(loggerMiddleware, 'test-named', TestMiddleware)
        admin(_c: Context) {
            return new Response('ok')
        }
    }

    new TestController2()

    const middlewares = (TestController2 as any)._middlewares?.['admin']
    assertEquals(
        middlewares?.length,
        1,
        'Should have 1 composed middleware registered',
    )
})

Deno.test('ComposeMiddleware - should support rest parameter syntax', () => {
    @Controller('/test3')
    class TestController3 {
        @Get('/complex')
        @ComposeMiddleware(
            loggerMiddleware,
            TestMiddleware,
            'test-named',
        )
        complex(_c: Context) {
            return new Response('ok')
        }
    }

    new TestController3()

    const middlewares = (TestController3 as any)._middlewares?.['complex']
    assertEquals(
        middlewares?.length,
        1,
        'Should have 1 composed middleware registered',
    )
})

// =============================================================================
// Test: Empty composition
// =============================================================================

Deno.test('ComposeMiddleware - should handle empty middleware list', () => {
    @Controller('/test4')
    class TestController4 {
        @Get('/empty')
        @ComposeMiddleware()
        empty(_c: Context) {
            return new Response('ok')
        }
    }

    new TestController4()

    const middlewares = (TestController4 as any)._middlewares?.['empty']
    assertEquals(
        middlewares?.length,
        1,
        'Should have 1 (empty) composed middleware registered',
    )
})
