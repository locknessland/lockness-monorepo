/**
 * Tests for bootstrap step helpers and infrastructure
 */

import { assertEquals, assertExists } from '@std/assert'
import {
    getDatabaseUrl,
    normalizeCacheConfig,
    normalizeSessionConfig,
    tryImportOptionalPackage,
} from '../kernel/bootstrap/helpers.ts'
import {
    getDefaultSteps,
    runBootstrapSteps,
} from '../kernel/bootstrap/registry.ts'
import type {
    BootstrapContext,
    BootstrapStep,
} from '../kernel/bootstrap/types.ts'

// ============================================================================
// Helper Function Tests
// ============================================================================

Deno.test('tryImportOptionalPackage - successfully imports existing package', async () => {
    // Import a package that definitely exists
    const result = await tryImportOptionalPackage<{ assert: unknown }>(
        '@std/assert',
        'assert',
    )

    assertExists(result)
    assertExists(result.assert)
})

Deno.test('tryImportOptionalPackage - returns null for non-existent package', async () => {
    const result = await tryImportOptionalPackage(
        '@lockness/non-existent-package',
        'test',
    )

    assertEquals(result, null)
})

Deno.test('normalizeSessionConfig - handles boolean shorthand', () => {
    // APP_KEY is set explicitly rather than read back through the expression
    // under test. `assertEquals(config.secret, Deno.env.get('APP_KEY'))` is
    // undefined === undefined on any machine with APP_KEY unset — which is every
    // CI runner — so it passed whatever the resolver did.
    const saved = Deno.env.get('APP_KEY')
    Deno.env.set('APP_KEY', 'base64:AAAA')
    const config = normalizeSessionConfig(true)
    if (saved === undefined) Deno.env.delete('APP_KEY')
    else Deno.env.set('APP_KEY', saved)

    assertEquals(config.driver, 'cookie')
    assertEquals(config.lifetime, 7200)
    // NOT `assertExists`. There is deliberately no default any more: the literal
    // that used to sit here was committed to this repository, so every
    // deployment that forgot APP_KEY shared one publicly known key. Absence is
    // the answer, and `steps/session.ts` decides what it means — a refusal to
    // boot in production, a per-process random key outside it.
    assertEquals(config.secret, 'base64:AAAA')
})

Deno.test('normalizeSessionConfig - merges object config with defaults', () => {
    const saved = Deno.env.get('APP_KEY')
    Deno.env.set('APP_KEY', 'base64:AAAA')
    const config = normalizeSessionConfig({
        driver: 'memory',
        lifetime: 3600,
    })
    if (saved === undefined) Deno.env.delete('APP_KEY')
    else Deno.env.set('APP_KEY', saved)

    assertEquals(config.driver, 'memory')
    assertEquals(config.lifetime, 3600)
    assertEquals(config.secret, 'base64:AAAA')
})

Deno.test('normalizeSessionConfig - respects secure flag from environment', () => {
    // Save original env
    const originalEnv = Deno.env.get('APP_ENV')

    try {
        // Test production environment
        Deno.env.set('APP_ENV', 'production')
        const config1 = normalizeSessionConfig(true)
        assertEquals(config1.secure, true)

        // Test development environment
        Deno.env.set('APP_ENV', 'development')
        const config2 = normalizeSessionConfig(true)
        assertEquals(config2.secure, false)
    } finally {
        // Restore original env
        if (originalEnv !== undefined) {
            Deno.env.set('APP_ENV', originalEnv)
        } else {
            Deno.env.delete('APP_ENV')
        }
    }
})

Deno.test('normalizeCacheConfig - handles boolean shorthand', () => {
    const config = normalizeCacheConfig(true)

    assertEquals(config.driver, 'memory')
    assertEquals(config.ttl, 3600)
    assertEquals(config.prefix, 'lockness')
})

Deno.test('normalizeCacheConfig - merges object config with defaults', () => {
    const config = normalizeCacheConfig({
        driver: 'deno-kv',
        ttl: 7200,
        kvPath: './data/kv',
    })

    assertEquals(config.driver, 'deno-kv')
    assertEquals(config.ttl, 7200)
    assertEquals(config.prefix, 'lockness')
    assertEquals(config.kvPath, './data/kv')
})

Deno.test('getDatabaseUrl - extracts URL from object config', () => {
    const url = getDatabaseUrl({ url: 'postgres://localhost/test' })
    assertEquals(url, 'postgres://localhost/test')
})

Deno.test('getDatabaseUrl - reads from environment for boolean config', () => {
    const originalUrl = Deno.env.get('DATABASE_URL')

    try {
        Deno.env.set('DATABASE_URL', 'postgres://localhost/envtest')
        const url = getDatabaseUrl(true)
        assertEquals(url, 'postgres://localhost/envtest')
    } finally {
        if (originalUrl !== undefined) {
            Deno.env.set('DATABASE_URL', originalUrl)
        } else {
            Deno.env.delete('DATABASE_URL')
        }
    }
})

Deno.test('getDatabaseUrl - returns undefined if not configured', () => {
    const originalUrl = Deno.env.get('DATABASE_URL')

    try {
        Deno.env.delete('DATABASE_URL')
        const url = getDatabaseUrl(true)
        assertEquals(url, undefined)
    } finally {
        if (originalUrl !== undefined) {
            Deno.env.set('DATABASE_URL', originalUrl)
        }
    }
})

// ============================================================================
// Registry Tests
// ============================================================================

Deno.test('getDefaultSteps - returns array of bootstrap steps', () => {
    const steps = getDefaultSteps()

    assertExists(steps)
    assertEquals(steps.length > 0, true)

    // Verify all steps have required properties
    for (const step of steps) {
        assertExists(step.id)
        assertExists(step.order)
        assertEquals(typeof step.run, 'function')
    }
})

Deno.test('getDefaultSteps - steps are in correct order', () => {
    const steps = getDefaultSteps()

    // Verify steps are sorted by order
    for (let i = 1; i < steps.length; i++) {
        assertEquals(
            steps[i - 1].order <= steps[i].order,
            true,
            `Step ${steps[i - 1].id} (${
                steps[i - 1].order
            }) should come before ${steps[i].id} (${steps[i].order})`,
        )
    }
})

Deno.test('getDefaultSteps - includes expected core steps', () => {
    const steps = getDefaultSteps()
    const stepIds = steps.map((s) => s.id)

    // Verify core steps are present
    const expectedSteps = [
        'database',
        'session',
        'cache',
        'app_init',
        'devtools',
        'middleware',
        'boot_hooks',
        'middlewares_discovery',
        'listeners',
        'events',
        'app_initialization',
        'devtools_routes',
    ]

    for (const expectedId of expectedSteps) {
        assertEquals(
            stepIds.includes(expectedId),
            true,
            `Expected step ${expectedId} to be in default steps`,
        )
    }
})

Deno.test('runBootstrapSteps - executes steps sequentially', async () => {
    const executionOrder: string[] = []

    const mockSteps: BootstrapStep[] = [
        {
            id: 'step1',
            order: 100,
            run: () => {
                executionOrder.push('step1')
            },
        },
        {
            id: 'step2',
            order: 200,
            run: () => {
                executionOrder.push('step2')
            },
        },
        {
            id: 'step3',
            order: 150,
            run: () => {
                executionOrder.push('step3')
            },
        },
    ]

    const mockContext: BootstrapContext = {
        config: {},
        kernel: {},
        KernelClass: class {},
        bootHooks: [],
    }

    await runBootstrapSteps(mockContext, mockSteps)

    // Steps should execute in order (sorted by order property)
    assertEquals(executionOrder, ['step1', 'step3', 'step2'])
})

Deno.test('runBootstrapSteps - handles async steps', async () => {
    let asyncCompleted = false

    const mockSteps: BootstrapStep[] = [
        {
            id: 'async_step',
            order: 100,
            async run() {
                await new Promise((resolve) => setTimeout(resolve, 10))
                asyncCompleted = true
            },
        },
    ]

    const mockContext: BootstrapContext = {
        config: {},
        kernel: {},
        KernelClass: class {},
        bootHooks: [],
    }

    await runBootstrapSteps(mockContext, mockSteps)

    assertEquals(asyncCompleted, true)
})

Deno.test('runBootstrapSteps - passes context to all steps', async () => {
    const contexts: BootstrapContext[] = []

    const mockSteps: BootstrapStep[] = [
        {
            id: 'step1',
            order: 100,
            run(ctx) {
                contexts.push(ctx)
            },
        },
        {
            id: 'step2',
            order: 200,
            run(ctx) {
                contexts.push(ctx)
            },
        },
    ]

    const mockContext: BootstrapContext = {
        config: { devtools: true },
        kernel: {},
        KernelClass: class {},
        bootHooks: [],
    }

    await runBootstrapSteps(mockContext, mockSteps)

    // All steps should receive the same context
    assertEquals(contexts.length, 2)
    assertEquals(contexts[0], mockContext)
    assertEquals(contexts[1], mockContext)
})

// ============================================================================
// Step Interface Tests
// ============================================================================

Deno.test('BootstrapStep - validates step structure', () => {
    const validStep: BootstrapStep = {
        id: 'test',
        order: 100,
        run: (_context: BootstrapContext) => {
            // Step implementation
        },
    }

    assertExists(validStep.id)
    assertExists(validStep.order)
    assertExists(validStep.run)
    assertEquals(typeof validStep.run, 'function')
})

// ============================================================================
// Integration-like Tests (without full kernel)
// ============================================================================

Deno.test('Bootstrap pipeline - creates app instance', async () => {
    // Import app creation step
    const { appInitStep } = await import(
        '../kernel/bootstrap/steps/app_init.ts'
    )

    const mockContext: BootstrapContext = {
        config: {},
        kernel: {},
        KernelClass: class {},
        bootHooks: [],
    }

    // Run app init step
    await appInitStep.run(mockContext)

    // App should be created
    assertExists(mockContext.app)
    assertEquals(typeof mockContext.app.getHono, 'function')
})

Deno.test('Bootstrap pipeline - middleware step reads from context', async () => {
    const { middlewareStep } = await import(
        '../kernel/bootstrap/steps/middleware.ts'
    )
    const { App } = await import('../app.ts')

    let middlewareCalled = false
    const testMiddleware = async (_c: any, next: any) => {
        middlewareCalled = true
        await next()
    }

    const kernel = {
        globalMiddlewares: [testMiddleware],
    }

    const mockContext: BootstrapContext = {
        config: {},
        kernel,
        KernelClass: class {},
        globalMiddlewareProp: 'globalMiddlewares',
        bootHooks: [],
        app: new App(),
    }

    // Run middleware step
    middlewareStep.run(mockContext)

    if (!mockContext.app) {
        throw new Error('App instance not created')
    }

    // Init app to apply global middlewares and mount routes
    await mockContext.app.init({ controllers: [] })

    // Make a test request to trigger middleware
    const req = new Request('http://localhost/')
    await mockContext.app.fetch(req)

    assertEquals(middlewareCalled, true)
})

Deno.test('Bootstrap pipeline - boot hooks step executes hooks in priority order', async () => {
    const { bootHooksStep } = await import(
        '../kernel/bootstrap/steps/boot_hooks.ts'
    )
    const { App } = await import('../app.ts')

    const executionOrder: string[] = []

    const kernel = {
        highPriorityHook: () => {
            executionOrder.push('high')
        },
        lowPriorityHook: () => {
            executionOrder.push('low')
        },
    }

    const mockContext: BootstrapContext = {
        config: {},
        kernel,
        KernelClass: class {},
        bootHooks: [
            { method: 'lowPriorityHook', priority: 50 },
            { method: 'highPriorityHook', priority: 100 },
        ],
        app: new App(),
    }

    await bootHooksStep.run(mockContext)

    // Hooks should execute in priority order (highest first)
    assertEquals(executionOrder, ['high', 'low'])
})
