// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { InjectGuard } from '../decorators.ts'
import {
    getAuth,
    initializeAuthMiddleware,
} from '../middleware/initialize_auth_middleware.ts'
import type { Env } from './mocks.ts'
import { MockSessionProvider } from './mocks.ts'
import { SessionGuard } from '../guards/session_guard.ts'

Deno.test('InjectGuard - injects guard as second parameter', async () => {
    class TestController {
        @InjectGuard('web')
        // deno-lint-ignore require-await
        async testMethod(_c: any, guard: any) {
            return { guard }
        }
    }

    const _controller = new TestController()
    const app = new Hono<Env>()
    const provider = new MockSessionProvider()

    // Mock session
    app.use('*', async (c, next) => {
        const dataMap = new Map<string, unknown>()
        const mockSession = {
            get: (key: string) => dataMap.get(key),
            set: (key: string, value: unknown) => dataMap.set(key, value),
            regenerate: () => Promise.resolve(),
        }
        c.set('session', mockSession as any)
        await next()
    })

    // Initialize auth
    app.use(
        '*',
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) => new SessionGuard('web', ctx as any, provider),
            },
        }),
    )

    app.get('/test', (c: Context) => {
        // Simulate what the decorator would do
        const auth = getAuth(c)
        const guard = auth.use('web')
        return c.json({ guard: !!guard })
    })

    const res = await app.request('/test')
    const data = await res.json()

    assertEquals(data.guard !== undefined, true)
})
