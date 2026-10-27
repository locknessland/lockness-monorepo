/**
 * Tests for the `@Throttle` decorator family.
 *
 * The window parser is exercised directly. Everything else goes through a real
 * `RouteRegistry` on a real Hono instance and issues real requests, because the
 * behaviour under test — which rule wins, and when a request is rejected — only
 * exists once the middleware chain has been assembled.
 */

import { assertEquals, assertThrows } from '@std/assert'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { parseTimeWindow } from '@lockness/contract'
import {
    Controller,
    Get,
    Throttle,
    ThrottleApi,
    ThrottleHeavy,
    ThrottleLogin,
    ThrottleSensitive,
} from '../routing/decorators.ts'
import { RouteRegistry } from '../routing/registry.ts'

const mockMiddlewareResolver = { resolve: () => null }

/** Mount a controller on a fresh Hono app. */
function mount(ControllerClass: new () => unknown): Hono {
    const hono = new Hono()
    const registry = new RouteRegistry(mockMiddlewareResolver)
    // deno-lint-ignore no-explicit-any
    registry.registerControllers(hono, [ControllerClass as any])
    return hono
}

/** Issue `count` requests from one simulated client and collect the statuses. */
async function hit(
    app: Hono,
    path: string,
    count: number,
    headers: Record<string, string> = { 'x-real-ip': '203.0.113.1' },
): Promise<number[]> {
    const statuses: number[] = []
    for (let i = 0; i < count; i++) {
        const res = await app.request(path, { headers })
        statuses.push(res.status)
    }
    return statuses
}

// ============================================================================
// parseTimeWindow
// ============================================================================

Deno.test('parseTimeWindow - converts every shorthand unit', () => {
    assertEquals(parseTimeWindow('30s'), 30_000)
    assertEquals(parseTimeWindow('15m'), 900_000)
    assertEquals(parseTimeWindow('2h'), 7_200_000)
    assertEquals(parseTimeWindow('1d'), 86_400_000)
})

Deno.test('parseTimeWindow - passes raw milliseconds through', () => {
    assertEquals(parseTimeWindow(500), 500)
    assertEquals(parseTimeWindow(60_000), 60_000)
})

Deno.test('parseTimeWindow - rejects malformed input rather than defaulting', () => {
    // A silently defaulted window would under-protect the route it guards, so
    // each of these must throw.
    for (const bad of ['1w', 'm', '', '10', 'abc', '-5s', '1 m']) {
        assertThrows(
            () => parseTimeWindow(bad as never),
            TypeError,
            undefined,
            `expected "${bad}" to be rejected`,
        )
    }
})

Deno.test('parseTimeWindow - rejects non-positive and non-finite numbers', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        assertThrows(() => parseTimeWindow(bad), TypeError)
    }
})

Deno.test('parseTimeWindow - accepts fractional quantities', () => {
    assertEquals(parseTimeWindow('0.5m' as never), 30_000)
})

// ============================================================================
// Decorator validation
// ============================================================================

Deno.test('Throttle - rejects a non-positive or fractional limit at decoration time', () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
        assertThrows(() => Throttle(bad, '1m'), TypeError)
    }
})

// ============================================================================
// Single route
// ============================================================================

Deno.test('Throttle - allows up to the limit then rejects with 429', async () => {
    @Controller('/api')
    class C {
        @Get('/ping')
        @Throttle(3, '1m')
        ping(c: Context) {
            return c.text('pong')
        }
    }

    const statuses = await hit(mount(C), '/api/ping', 5)
    assertEquals(statuses, [200, 200, 200, 429, 429])
})

Deno.test('Throttle - counts each client separately', async () => {
    @Controller('/api')
    class C {
        @Get('/ping')
        @Throttle(2, '1m')
        ping(c: Context) {
            return c.text('pong')
        }
    }
    const app = mount(C)

    const first = await hit(app, '/api/ping', 3, { 'x-real-ip': '203.0.113.1' })
    const second = await hit(app, '/api/ping', 3, {
        'x-real-ip': '203.0.113.2',
    })

    assertEquals(first, [200, 200, 429])
    assertEquals(second, [200, 200, 429], 'a second client gets its own budget')
})

Deno.test('Throttle - an undecorated route is not limited', async () => {
    @Controller('/api')
    class C {
        @Get('/limited')
        @Throttle(1, '1m')
        limited(c: Context) {
            return c.text('x')
        }

        @Get('/open')
        open(c: Context) {
            return c.text('y')
        }
    }
    const app = mount(C)

    assertEquals(await hit(app, '/api/limited', 2), [200, 429])
    assertEquals(await hit(app, '/api/open', 5), [200, 200, 200, 200, 200])
})

// ============================================================================
// Controller-wide, and method override
// ============================================================================

Deno.test('Throttle - a controller-wide rule covers every route', async () => {
    @Controller('/api')
    @Throttle(2, '1m')
    class C {
        @Get('/a')
        a(c: Context) {
            return c.text('a')
        }

        @Get('/b')
        b(c: Context) {
            return c.text('b')
        }
    }
    const app = mount(C)

    // Each route carries its own limiter instance, so each has its own budget.
    assertEquals(await hit(app, '/api/a', 3), [200, 200, 429])
    assertEquals(await hit(app, '/api/b', 3), [200, 200, 429])
})

Deno.test('Throttle - a method rule replaces the controller rule, and can loosen it', async () => {
    @Controller('/api')
    @Throttle(1, '1m')
    class C {
        @Get('/strict')
        strict(c: Context) {
            return c.text('strict')
        }

        @Get('/loose')
        @Throttle(4, '1m')
        loose(c: Context) {
            return c.text('loose')
        }
    }
    const app = mount(C)

    assertEquals(await hit(app, '/api/strict', 2), [200, 429])
    assertEquals(
        await hit(app, '/api/loose', 5),
        [200, 200, 200, 200, 429],
        'the method limit replaces the controller limit rather than stacking under it',
    )
})

Deno.test('Throttle - a method rule can also tighten the controller rule', async () => {
    @Controller('/api')
    @Throttle(10, '1m')
    class C {
        @Get('/tight')
        @Throttle(1, '1m')
        tight(c: Context) {
            return c.text('tight')
        }
    }

    assertEquals(await hit(mount(C), '/api/tight', 2), [200, 429])
})

// ============================================================================
// Options
// ============================================================================

Deno.test('Throttle - skip bypasses the limit without consuming budget', async () => {
    @Controller('/api')
    class C {
        @Get('/ping')
        @Throttle(1, '1m', {
            skip: (c) => c.req.header('x-internal') === 'yes',
        })
        ping(c: Context) {
            return c.text('pong')
        }
    }
    const app = mount(C)

    const skipped = await hit(app, '/api/ping', 5, {
        'x-real-ip': '203.0.113.9',
        'x-internal': 'yes',
    })
    assertEquals(skipped, [200, 200, 200, 200, 200])

    // The skipped calls must not have eaten the budget of the same client.
    const counted = await hit(app, '/api/ping', 2, {
        'x-real-ip': '203.0.113.9',
    })
    assertEquals(counted, [200, 429])
})

Deno.test('Throttle - by header gives each key its own budget', async () => {
    @Controller('/api')
    class C {
        @Get('/ping')
        @Throttle(1, '1m', { by: 'header:X-Api-Key' })
        ping(c: Context) {
            return c.text('pong')
        }
    }
    const app = mount(C)

    // Same address, different keys — both allowed once.
    assertEquals(
        await hit(app, '/api/ping', 2, {
            'x-real-ip': '203.0.113.5',
            'X-Api-Key': 'alpha',
        }),
        [200, 429],
    )
    assertEquals(
        await hit(app, '/api/ping', 1, {
            'x-real-ip': '203.0.113.5',
            'X-Api-Key': 'beta',
        }),
        [200],
    )
})

Deno.test('Throttle - a custom key generator is honoured', async () => {
    @Controller('/api')
    class C {
        @Get('/ping')
        @Throttle(1, '1m', { by: (c) => c.req.header('x-tenant') ?? 'none' })
        ping(c: Context) {
            return c.text('pong')
        }
    }
    const app = mount(C)

    assertEquals(await hit(app, '/api/ping', 2, { 'x-tenant': 'acme' }), [
        200,
        429,
    ])
    assertEquals(await hit(app, '/api/ping', 1, { 'x-tenant': 'globex' }), [
        200,
    ])
})

Deno.test('Throttle - custom message and status code shape the rejection', async () => {
    @Controller('/api')
    class C {
        @Get('/ping')
        @Throttle(1, '1m', { message: 'slow down', statusCode: 503 })
        ping(c: Context) {
            return c.text('pong')
        }
    }
    const app = mount(C)
    const headers = { 'x-real-ip': '203.0.113.7' }

    await app.request('/api/ping', { headers })
    const res = await app.request('/api/ping', { headers })

    assertEquals(res.status, 503)
    assertEquals(await res.text(), 'slow down')
})

Deno.test('Throttle - headers:false suppresses the RateLimit headers', async () => {
    @Controller('/api')
    class Loud {
        @Get('/ping')
        @Throttle(5, '1m')
        ping(c: Context) {
            return c.text('pong')
        }
    }

    @Controller('/api')
    class Quiet {
        @Get('/ping')
        @Throttle(5, '1m', { headers: false })
        ping(c: Context) {
            return c.text('pong')
        }
    }

    const loud = await mount(Loud).request('/api/ping', {
        headers: { 'x-real-ip': '203.0.113.11' },
    })
    const quiet = await mount(Quiet).request('/api/ping', {
        headers: { 'x-real-ip': '203.0.113.11' },
    })

    assertEquals(loud.headers.has('ratelimit'), true)
    assertEquals(quiet.headers.has('ratelimit'), false)
})

// ============================================================================
// Presets
// ============================================================================

Deno.test('Throttle presets - each applies its documented limit', async () => {
    @Controller('/p')
    class C {
        @Get('/login')
        @ThrottleLogin()
        login(c: Context) {
            return c.text('l')
        }

        @Get('/sensitive')
        @ThrottleSensitive()
        sensitive(c: Context) {
            return c.text('s')
        }

        @Get('/heavy')
        @ThrottleHeavy()
        heavy(c: Context) {
            return c.text('h')
        }
    }
    const app = mount(C)

    // 5 per minute
    assertEquals(
        (await hit(app, '/p/login', 6)).filter((s) => s === 200).length,
        5,
    )
    // 3 per hour
    assertEquals(
        (await hit(app, '/p/sensitive', 4)).filter((s) => s === 200).length,
        3,
    )
    // 10 per minute
    assertEquals(
        (await hit(app, '/p/heavy', 11)).filter((s) => s === 200).length,
        10,
    )
})

Deno.test('ThrottleApi - allows 100 requests per minute at controller level', async () => {
    @Controller('/api')
    @ThrottleApi()
    class C {
        @Get('/ping')
        ping(c: Context) {
            return c.text('pong')
        }
    }

    const statuses = await hit(mount(C), '/api/ping', 101)
    assertEquals(statuses.filter((s) => s === 200).length, 100)
    assertEquals(statuses[100], 429)
})
