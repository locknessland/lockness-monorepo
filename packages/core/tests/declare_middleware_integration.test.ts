/**
 * Integration tests for @DeclareMiddleware with App initialization
 */

// deno-lint-ignore-file no-unused-vars require-await

import { assertEquals } from '@std/assert'
import { App } from '../app.ts'
import {
    Controller,
    DeclareMiddleware,
    Get,
    type MiddlewareContract,
    type Next,
    UseMiddleware,
} from '../mod.ts'
import type { Context } from '../types.ts'
import { declaredMiddlewares } from '../routing/decorators.ts'

Deno.test('App integration - declared middlewares are automatically registered', async () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('integration-auth')
    class IntegrationAuthMiddleware implements MiddlewareContract {
        async handle(c: Context, next: Next) {
            c.set('authenticated', true)
            return next()
        }
    }

    @Controller('/test')
    class TestController {
        @Get('/protected')
        @UseMiddleware('integration-auth')
        protected(c: Context) {
            const authenticated = c.get('authenticated')
            return c.json({ authenticated })
        }
    }

    const app = new App()
    await app.init({
        controllers: [TestController],
    })

    const req = new Request('http://localhost/test/protected')
    const res = await app.fetch(req)
    const json = await res.json()

    assertEquals(res.status, 200)
    assertEquals(json.authenticated, true)
})

Deno.test('App integration - multiple declared middlewares work together', async () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('step1')
    class Step1Middleware implements MiddlewareContract {
        async handle(c: Context, next: Next) {
            const steps = c.get('steps') || []
            steps.push('step1')
            c.set('steps', steps)
            return next()
        }
    }

    @DeclareMiddleware('step2')
    class Step2Middleware implements MiddlewareContract {
        async handle(c: Context, next: Next) {
            const steps = c.get('steps') || []
            steps.push('step2')
            c.set('steps', steps)
            return next()
        }
    }

    @DeclareMiddleware('step3')
    class Step3Middleware implements MiddlewareContract {
        async handle(c: Context, next: Next) {
            const steps = c.get('steps') || []
            steps.push('step3')
            c.set('steps', steps)
            return next()
        }
    }

    @Controller('/test')
    class TestController {
        @Get('/pipeline')
        @UseMiddleware('step1')
        @UseMiddleware('step2')
        @UseMiddleware('step3')
        pipeline(c: Context) {
            const steps = c.get('steps') || []
            return c.json({ steps })
        }
    }

    const app = new App()
    await app.init({
        controllers: [TestController],
    })

    const req = new Request('http://localhost/test/pipeline')
    const res = await app.fetch(req)
    const json = await res.json()

    assertEquals(res.status, 200)
    assertEquals(json.steps, ['step1', 'step2', 'step3'])
})

Deno.test('App integration - declared middleware can block requests', async () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('block')
    class BlockMiddleware implements MiddlewareContract {
        async handle(_c: Context, _next: Next) {
            return new Response('Blocked', { status: 403 })
        }
    }

    @Controller('/test')
    class TestController {
        @Get('/blocked')
        @UseMiddleware('block')
        blocked(_c: Context) {
            // This should never be reached
            return new Response('Should not reach here')
        }
    }

    const app = new App()
    await app.init({
        controllers: [TestController],
    })

    const req = new Request('http://localhost/test/blocked')
    const res = await app.fetch(req)
    const text = await res.text()

    assertEquals(res.status, 403)
    assertEquals(text, 'Blocked')
})

Deno.test('App integration - backward compatibility with @Use decorator', async () => {
    declaredMiddlewares.clear()

    @DeclareMiddleware('compat')
    class CompatMiddleware implements MiddlewareContract {
        async handle(c: Context, next: Next) {
            c.set('compat', true)
            return next()
        }
    }

    // Using the old @Use decorator instead of @UseMiddleware
    const { Use } = await import('../routing/decorators.ts')

    @Controller('/test')
    class TestController {
        @Get('/compat')
        @Use('compat')
        compat(c: Context) {
            const compat = c.get('compat')
            return c.json({ compat })
        }
    }

    const app = new App()
    await app.init({
        controllers: [TestController],
    })

    const req = new Request('http://localhost/test/compat')
    const res = await app.fetch(req)
    const json = await res.json()

    assertEquals(res.status, 200)
    assertEquals(json.compat, true)
})
