/**
 * Tests for the compose middleware helper
 */

// deno-lint-ignore-file require-await

import { assertEquals } from '@std/assert'
import { compose, composeMiddleware } from '../http/compose.ts'
import { DeclareMiddleware } from '../routing/decorators.ts'
import type { Context, IMiddleware, Next } from '../types.ts'

// Mock Context for testing
function createMockContext(): Context {
    const executionOrder: string[] = []
    return {
        get: (key: string) => {
            if (key === 'executionOrder') return executionOrder
            return undefined
        },
        set: (_key: string, _value: unknown) => {},
        json: (data: unknown) => new Response(JSON.stringify(data)),
        text: (data: string) => new Response(data),
        req: { method: 'GET', path: '/' },
        res: {},
        _executionOrder: executionOrder,
    } as unknown as Context & { _executionOrder: string[] }
}

Deno.test('compose - executes middlewares in order', async () => {
    const order: string[] = []

    const middleware1 = async (_c: Context, next: Next) => {
        order.push('m1-start')
        await next()
        order.push('m1-end')
    }

    const middleware2 = async (_c: Context, next: Next) => {
        order.push('m2-start')
        await next()
        order.push('m2-end')
    }

    const composed = compose([middleware1, middleware2])
    const c = createMockContext()

    await composed(c, async () => {
        order.push('handler')
    })

    assertEquals(order, [
        'm1-start',
        'm2-start',
        'handler',
        'm2-end',
        'm1-end',
    ])
})

Deno.test('compose - handles empty middleware array', async () => {
    const composed = compose([])
    const c = createMockContext()
    let handlerCalled = false

    await composed(c, async () => {
        handlerCalled = true
    })

    assertEquals(handlerCalled, true)
})

Deno.test('compose - handles single middleware', async () => {
    const order: string[] = []

    const middleware = async (_c: Context, next: Next) => {
        order.push('middleware')
        await next()
    }

    const composed = compose([middleware])
    const c = createMockContext()

    await composed(c, async () => {
        order.push('handler')
    })

    assertEquals(order, ['middleware', 'handler'])
})

Deno.test('compose - resolves class middlewares', async () => {
    const order: string[] = []

    class TestMiddleware implements IMiddleware {
        async handle(_c: Context, next: Next) {
            order.push('class-middleware')
            await next()
        }
    }

    const composed = compose([TestMiddleware])
    const c = createMockContext()

    await composed(c, async () => {
        order.push('handler')
    })

    assertEquals(order, ['class-middleware', 'handler'])
})

Deno.test('compose - resolves named middlewares from registry', async () => {
    const order: string[] = []

    @DeclareMiddleware('test-compose')
    class TestComposeMiddleware implements IMiddleware {
        async handle(_c: Context, next: Next) {
            order.push('named-middleware')
            await next()
        }
    }

    // Force TypeScript to not tree-shake the class
    void TestComposeMiddleware

    const composed = compose(['test-compose'])
    const c = createMockContext()

    await composed(c, async () => {
        order.push('handler')
    })

    assertEquals(order, ['named-middleware', 'handler'])
})

Deno.test('compose - mixes different middleware types', async () => {
    const order: string[] = []

    // Function middleware
    const functionMiddleware = async (_c: Context, next: Next) => {
        order.push('function')
        await next()
    }

    // Class middleware
    class ClassMiddleware implements IMiddleware {
        async handle(_c: Context, next: Next) {
            order.push('class')
            await next()
        }
    }

    const composed = compose([functionMiddleware, ClassMiddleware])
    const c = createMockContext()

    await composed(c, async () => {
        order.push('handler')
    })

    assertEquals(order, ['function', 'class', 'handler'])
})

Deno.test('compose - middleware can short-circuit by returning Response', async () => {
    const order: string[] = []

    const middleware1 = async (c: Context, _next: Next) => {
        order.push('m1')
        return c.json({ error: 'blocked' })
    }

    const middleware2 = async (_c: Context, next: Next) => {
        order.push('m2')
        await next()
    }

    const composed = compose([middleware1, middleware2])
    const c = createMockContext()

    const response = await composed(c, async () => {
        order.push('handler')
    })

    // Only m1 should have run
    assertEquals(order, ['m1'])
    assertEquals(response instanceof Response, true)
})

Deno.test('compose - skips unresolvable named middlewares with warning', async () => {
    const order: string[] = []
    const originalWarn = console.warn
    let warnCalled = false

    console.warn = (msg: string) => {
        if (msg.includes('non-existent')) {
            warnCalled = true
        }
    }

    const middleware = async (_c: Context, next: Next) => {
        order.push('middleware')
        await next()
    }

    const composed = compose([middleware, 'non-existent'])
    const c = createMockContext()

    await composed(c, async () => {
        order.push('handler')
    })

    console.warn = originalWarn

    assertEquals(order, ['middleware', 'handler'])
    assertEquals(warnCalled, true)
})

Deno.test('composeMiddleware - works with rest parameters', async () => {
    const order: string[] = []

    const m1 = async (_c: Context, next: Next) => {
        order.push('m1')
        await next()
    }

    const m2 = async (_c: Context, next: Next) => {
        order.push('m2')
        await next()
    }

    const composed = composeMiddleware(m1, m2)
    const c = createMockContext()

    await composed(c, async () => {
        order.push('handler')
    })

    assertEquals(order, ['m1', 'm2', 'handler'])
})

Deno.test('compose - nested compose works correctly', async () => {
    const order: string[] = []

    const m1 = async (_c: Context, next: Next) => {
        order.push('m1')
        await next()
    }

    const m2 = async (_c: Context, next: Next) => {
        order.push('m2')
        await next()
    }

    const m3 = async (_c: Context, next: Next) => {
        order.push('m3')
        await next()
    }

    // Compose m1 and m2, then compose with m3
    const innerComposed = compose([m1, m2])
    const outerComposed = compose([innerComposed, m3])

    const c = createMockContext()

    await outerComposed(c, async () => {
        order.push('handler')
    })

    assertEquals(order, ['m1', 'm2', 'm3', 'handler'])
})
