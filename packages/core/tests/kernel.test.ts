/**
 * Tests for @Kernel decorator and createApp() function
 */

import { assertEquals, assertExists, assertThrows } from '@std/assert'
import {
    createApp,
    DeclareGlobalMiddleware,
    Kernel,
    KERNEL_CONFIG,
    KERNEL_GLOBAL_MIDDLEWARE,
    type KernelConfig,
    OnBoot,
} from '../mod.ts'
import type { App } from '../app.ts'

Deno.test('@Kernel - stores configuration metadata on class', () => {
    const config: KernelConfig = {
        staticDir: 'public',
        controllersDir: './app/controller',
    }

    @Kernel(config)
    class TestKernel { }

    const storedConfig = (TestKernel as any)[KERNEL_CONFIG]
    assertExists(storedConfig)
    assertEquals(storedConfig, config)
})

Deno.test('@Kernel - works with empty configuration', () => {
    @Kernel()
    class TestKernel { }

    const storedConfig = (TestKernel as any)[KERNEL_CONFIG]
    assertExists(storedConfig)
    assertEquals(storedConfig, {})
})

Deno.test('@Kernel - throws error if applied to non-class', () => {
    assertThrows(
        () => {
            const decoratorFn = Kernel()
            // Call the decorator with a mock context that simulates non-class usage
            decoratorFn(
                class { } as any,
                { kind: 'method', name: 'test' } as any,
            )
        },
        Error,
        '@Kernel can only decorate classes',
    )
})

Deno.test('@DeclareGlobalMiddleware - stores field name metadata', () => {
    @Kernel()
    class TestKernel {
        @DeclareGlobalMiddleware()
        globalMiddlewares = []
    }

    // Instantiate to trigger addInitializer
    new TestKernel()

    const fieldName = (TestKernel as any)[KERNEL_GLOBAL_MIDDLEWARE]
    assertEquals(fieldName, 'globalMiddlewares')
})

Deno.test('@DeclareGlobalMiddleware - supports custom field names', () => {
    @Kernel()
    class TestKernel {
        @DeclareGlobalMiddleware()
        customMiddlewares = []
    }

    // Instantiate to trigger addInitializer
    new TestKernel()

    const fieldName = (TestKernel as any)[KERNEL_GLOBAL_MIDDLEWARE]
    assertEquals(fieldName, 'customMiddlewares')
})

Deno.test('createApp - creates App instance with minimal config', async () => {
    @Kernel()
    class TestKernel { }

    const app = await createApp(TestKernel)

    assertExists(app)
    assertEquals(typeof app.listen, 'function')
    assertEquals(typeof app.getHono, 'function')
})

Deno.test('createApp - applies global middlewares', async () => {
    let middlewareCalled = false

    const testMiddleware = async (_c: any, next: any) => {
        middlewareCalled = true
        await next()
    }

    @Kernel({
        controllers: [], // Explicit empty list to skip discovery
    })
    class TestKernel {
        @DeclareGlobalMiddleware()
        globalMiddlewares = [testMiddleware]
    }

    const app = await createApp(TestKernel)

    // Make a test request to trigger middleware
    const req = new Request('http://localhost/')
    await app.fetch(req)

    assertEquals(middlewareCalled, true)
})

Deno.test('createApp - executes boot hooks in priority order', async () => {
    const executionOrder: string[] = []

    @Kernel({
        controllers: [],
    })
    class TestKernel {
        @OnBoot({ priority: 100 })
        firstHook(_app: App) {
            executionOrder.push('first')
        }

        @OnBoot({ priority: 50 })
        secondHook(_app: App) {
            executionOrder.push('second')
        }

        @OnBoot()
        thirdHook(_app: App) {
            executionOrder.push('third')
        }
    }

    await createApp(TestKernel)

    assertEquals(executionOrder, ['first', 'second', 'third'])
})

Deno.test('createApp - passes App instance to boot hooks', async () => {
    let receivedApp: App | null = null

    @Kernel({
        controllers: [],
    })
    class TestKernel {
        @OnBoot()
        captureApp(app: App) {
            receivedApp = app
        }
    }

    const app = await createApp(TestKernel)

    assertExists(receivedApp)
    assertEquals(receivedApp, app)
})

Deno.test('createApp - handles async boot hooks', async () => {
    let asyncCompleted = false

    @Kernel({
        controllers: [],
    })
    class TestKernel {
        @OnBoot()
        async asyncHook(_app: App) {
            await new Promise((resolve) => setTimeout(resolve, 10))
            asyncCompleted = true
        }
    }

    await createApp(TestKernel)

    assertEquals(asyncCompleted, true)
})

Deno.test('createApp - supports static directory configuration', async () => {
    @Kernel({
        staticDir: 'public',
        controllers: [],
    })
    class TestKernel { }

    const app = await createApp(TestKernel)

    assertExists(app)
})

Deno.test('createApp - supports controller directory configuration', async () => {
    @Kernel({
        controllersDir: './test-controllers',
        controllers: [],
    })
    class TestKernel { }

    const app = await createApp(TestKernel)

    assertExists(app)
})

Deno.test('createApp - supports explicit controllers list', async () => {
    @Kernel({
        controllers: [],
    })
    class TestKernel { }

    const app = await createApp(TestKernel)

    assertExists(app)
})

Deno.test('createApp - integrates with existing @OnBoot decorator', async () => {
    const bootHooks: string[] = []

    @Kernel({
        controllers: [],
    })
    class TestKernel {
        @OnBoot({ priority: 100 })
        setupDatabase(_app: App) {
            bootHooks.push('database')
        }

        @OnBoot({ priority: 50 })
        setupCache(_app: App) {
            bootHooks.push('cache')
        }
    }

    await createApp(TestKernel)

    assertEquals(bootHooks, ['database', 'cache'])
})

Deno.test('createApp - boot hooks have access to kernel instance state', async () => {
    @Kernel({
        controllers: [],
    })
    class TestKernel {
        connectionString = 'postgres://localhost:5432/test'

        @OnBoot()
        checkState(_app: App) {
            assertEquals(
                this.connectionString,
                'postgres://localhost:5432/test',
            )
        }
    }

    await createApp(TestKernel)
})

Deno.test('createApp - supports database configuration as boolean', async () => {
    @Kernel({
        database: true, // Enable with defaults
        controllers: [],
    })
    class TestKernel { }

    // Should not throw even if @lockness/drizzle is not installed
    // The loader will warn and skip database setup
    const app = await createApp(TestKernel)
    assertExists(app)
})

Deno.test({
    name: 'createApp - supports database configuration as object',
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async () => {
        @Kernel({
            database: {
                url: 'postgres://localhost:5432/test',
                autoConnect: true,
            },
            controllers: [],
        })
        class TestKernel { }

        // Should not throw even if @lockness/drizzle is not installed
        const app = await createApp(TestKernel)
        assertExists(app)
    }
});

Deno.test({
    name: 'createApp - supports session configuration as boolean',
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async () => {
        @Kernel({
            session: true,
            controllers: [],
        })
        class TestKernel { }

        // Should not throw even if @lockness/session is not installed
        const app = await createApp(TestKernel)
        assertExists(app)
    }
});

Deno.test({
    name: 'createApp - supports session configuration as object',
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async () => {
        @Kernel({
            session: {
                driver: 'memory',
                lifetime: 3600,
                secure: false,
            },
            controllers: [],
        })
        class TestKernel { }

        // Should not throw even if @lockness/session is not installed
        const app = await createApp(TestKernel)
        assertExists(app)
    }
})

Deno.test('createApp - handles missing optional dependencies gracefully', async () => {
    @Kernel({
        database: true,
        session: true,
        devtools: true,
        controllers: [],
    })
    class TestKernel { }

    // Should not throw - just logs warnings if packages not installed
    const app = await createApp(TestKernel)
    assertExists(app)
})

Deno.test('createApp - supports both declarative and imperative patterns', async () => {
    // Declarative pattern
    @Kernel({
        controllers: [],
    })
    class DeclarativeKernel {
        @DeclareGlobalMiddleware()
        globalMiddlewares = []
    }

    const declarativeApp = await createApp(DeclarativeKernel)
    assertExists(declarativeApp)

    // Imperative pattern (traditional bootstrap)
    const { App } = await import('../app.ts')
    const imperativeApp = new App()
    await imperativeApp.init({
        controllers: [],
    })
    assertExists(imperativeApp)
})

Deno.test('createApp - combines @Kernel with @OnBoot decorators', async () => {
    const steps: string[] = []

    @Kernel({
        session: { driver: 'memory' },
        controllers: [],
    })
    class TestKernel {
        @DeclareGlobalMiddleware()
        globalMiddlewares = []

        @OnBoot({ priority: 100 })
        step1(_app: App) {
            steps.push('step1')
        }

        @OnBoot({ priority: 50 })
        step2(_app: App) {
            steps.push('step2')
        }
    }

    await createApp(TestKernel)

    assertEquals(steps, ['step1', 'step2'])
})
