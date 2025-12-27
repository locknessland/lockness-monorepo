import { assertEquals, assertExists } from '@std/assert'
import { Authenticator, SessionGuard } from '../mod.ts'
import { createMockContext, MockSessionProvider } from './mocks.ts'

Deno.test('Authenticator - can be instantiated', async () => {
    const ctx = await createMockContext()
    const provider = new MockSessionProvider()
    const config = {
        default: 'web' as const,
        guards: {
            web: () => new SessionGuard('web', ctx, provider),
        },
    }
    const auth = new Authenticator(ctx, config)
    assertExists(auth)
    assertEquals(auth.defaultGuard, 'web')
})

Deno.test('Authenticator - throws when accessing user before authentication', async () => {
    const ctx = await createMockContext()
    const provider = new MockSessionProvider()
    const auth = new Authenticator(ctx, {
        default: 'web' as const,
        guards: {
            web: () => new SessionGuard('web', ctx, provider),
        },
    })

    assertEquals(auth.isAuthenticated, false)
    assertEquals(auth.user, undefined)
})

Deno.test('Authenticator - use specific guard', async () => {
    const ctx = await createMockContext()
    const provider = new MockSessionProvider()

    const sessionGuardFactory = (c: any) => new SessionGuard('web', c, provider)

    const auth = new Authenticator(ctx, {
        default: 'web',
        guards: { web: sessionGuardFactory as any },
    })

    const guard = auth.use('web')
    assertExists(guard)
    assertEquals(guard.driverName, 'session')
})
