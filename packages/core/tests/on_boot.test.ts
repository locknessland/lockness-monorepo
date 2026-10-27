/**
 * Tests for @OnBoot decorator and boot hook execution
 */

import { assertEquals, assertExists } from '@std/assert'
import { getBootHooks, OnBoot, runBootHooks } from '../mod.ts'

// Mock App interface for testing
interface TestApp {
    isDevelopment: boolean
    initialized: boolean
}

Deno.test('@OnBoot - decorates a method with default priority', () => {
    class TestKernel {
        @OnBoot()
        async boot(_app: TestApp) {
            // Test method
        }
    }

    // Create instance to trigger addInitializer
    new TestKernel()
    const hooks = getBootHooks(TestKernel)

    assertEquals(hooks.length, 1)
    assertEquals(hooks[0].method, 'boot')
    assertEquals(hooks[0].priority, 0)
})

Deno.test('@OnBoot - decorates a method with custom priority', () => {
    class TestKernel {
        @OnBoot({ priority: 100 })
        async connectDatabase(_app: TestApp) {
            // Test method
        }
    }

    // Create instance to trigger addInitializer
    new TestKernel()
    const hooks = getBootHooks(TestKernel)

    assertEquals(hooks.length, 1)
    assertEquals(hooks[0].method, 'connectDatabase')
    assertEquals(hooks[0].priority, 100)
})

Deno.test('@OnBoot - supports multiple decorated methods', () => {
    class TestKernel {
        @OnBoot({ priority: 100 })
        async first(_app: TestApp) {}

        @OnBoot({ priority: 50 })
        async second(_app: TestApp) {}

        @OnBoot({ priority: 10 })
        async third(_app: TestApp) {}
    }

    // Create instance to trigger addInitializer
    new TestKernel()
    const hooks = getBootHooks(TestKernel)

    assertEquals(hooks.length, 3)
    assertEquals(hooks[0].method, 'first')
    assertEquals(hooks[0].priority, 100)
    assertEquals(hooks[1].method, 'second')
    assertEquals(hooks[1].priority, 50)
    assertEquals(hooks[2].method, 'third')
    assertEquals(hooks[2].priority, 10)
})

Deno.test('runBootHooks - executes hooks in priority order (highest first)', async () => {
    const executionOrder: string[] = []

    class TestKernel {
        @OnBoot({ priority: 10 })
        low(_app: TestApp) {
            executionOrder.push('low')
        }

        @OnBoot({ priority: 100 })
        high(_app: TestApp) {
            executionOrder.push('high')
        }

        @OnBoot({ priority: 50 })
        medium(_app: TestApp) {
            executionOrder.push('medium')
        }
    }

    const kernel = new TestKernel()
    const app: TestApp = { isDevelopment: false, initialized: false }

    await runBootHooks(kernel, app)

    assertEquals(executionOrder, ['high', 'medium', 'low'])
})

Deno.test('runBootHooks - passes app instance to each hook', async () => {
    const receivedApps: TestApp[] = []

    class TestKernel {
        @OnBoot({ priority: 100 })
        first(app: TestApp) {
            receivedApps.push(app)
        }

        @OnBoot({ priority: 50 })
        second(app: TestApp) {
            receivedApps.push(app)
        }
    }

    const kernel = new TestKernel()
    const app: TestApp = { isDevelopment: true, initialized: false }

    await runBootHooks(kernel, app)

    assertEquals(receivedApps.length, 2)
    assertEquals(receivedApps[0], app)
    assertEquals(receivedApps[1], app)
})

Deno.test('runBootHooks - awaits async hooks properly', async () => {
    let asyncCompleted = false

    class TestKernel {
        @OnBoot()
        async asyncTask(_app: TestApp) {
            await new Promise((resolve) => setTimeout(resolve, 10))
            asyncCompleted = true
        }
    }

    const kernel = new TestKernel()
    const app: TestApp = { isDevelopment: false, initialized: false }

    await runBootHooks(kernel, app)

    assertEquals(asyncCompleted, true)
})

Deno.test('runBootHooks - executes hooks sequentially', async () => {
    const events: string[] = []

    class TestKernel {
        @OnBoot({ priority: 100 })
        async first(_app: TestApp) {
            events.push('first-start')
            await new Promise((resolve) => setTimeout(resolve, 20))
            events.push('first-end')
        }

        @OnBoot({ priority: 50 })
        async second(_app: TestApp) {
            events.push('second-start')
            await new Promise((resolve) => setTimeout(resolve, 10))
            events.push('second-end')
        }
    }

    const kernel = new TestKernel()
    const app: TestApp = { isDevelopment: false, initialized: false }

    await runBootHooks(kernel, app)

    assertEquals(events, [
        'first-start',
        'first-end',
        'second-start',
        'second-end',
    ])
})

Deno.test('runBootHooks - handles kernel with no hooks', async () => {
    class EmptyKernel {
        // No @OnBoot methods
    }

    const kernel = new EmptyKernel()
    const app: TestApp = { isDevelopment: false, initialized: false }

    // Should not throw
    await runBootHooks(kernel, app)
})

Deno.test('getBootHooks - works with class constructor', () => {
    class TestKernel {
        @OnBoot({ priority: 100 })
        async boot(_app: TestApp) {}
    }

    // Create instance to trigger addInitializer, then test with constructor
    new TestKernel()
    const hooks = getBootHooks(TestKernel)

    assertEquals(hooks.length, 1)
    assertEquals(hooks[0].method, 'boot')
})

Deno.test('getBootHooks - works with instance', () => {
    class TestKernel {
        @OnBoot({ priority: 100 })
        async boot(_app: TestApp) {}
    }

    const kernel = new TestKernel()
    const hooks = getBootHooks(kernel)

    assertEquals(hooks.length, 1)
    assertEquals(hooks[0].method, 'boot')
})

Deno.test('getBootHooks - returns empty array for kernel with no hooks', () => {
    class EmptyKernel {}

    const hooks = getBootHooks(EmptyKernel)

    assertEquals(hooks.length, 0)
})

Deno.test('@OnBoot - can be used with method that modifies app state', async () => {
    class TestKernel {
        @OnBoot({ priority: 100 })
        initialize(app: TestApp) {
            app.initialized = true
        }
    }

    const kernel = new TestKernel()
    const app: TestApp = { isDevelopment: false, initialized: false }

    await runBootHooks(kernel, app)

    assertEquals(app.initialized, true)
})

Deno.test('@OnBoot - hooks with same priority maintain registration order', async () => {
    const executionOrder: string[] = []

    class TestKernel {
        @OnBoot({ priority: 50 })
        first(_app: TestApp) {
            executionOrder.push('first')
        }

        @OnBoot({ priority: 50 })
        second(_app: TestApp) {
            executionOrder.push('second')
        }

        @OnBoot({ priority: 50 })
        third(_app: TestApp) {
            executionOrder.push('third')
        }
    }

    const kernel = new TestKernel()
    const app: TestApp = { isDevelopment: false, initialized: false }

    await runBootHooks(kernel, app)

    // Should maintain registration order when priorities are equal
    assertEquals(executionOrder, ['first', 'second', 'third'])
})

Deno.test('runBootHooks - can be called with complex kernel class', async () => {
    const events: string[] = []

    class ComplexKernel {
        @OnBoot({ priority: 100 })
        connectDatabase(_app: TestApp) {
            events.push('database')
        }

        @OnBoot({ priority: 50 })
        seedData(_app: TestApp) {
            events.push('seed')
        }

        @OnBoot({ priority: 30 })
        warmCache(_app: TestApp) {
            events.push('cache')
        }

        @OnBoot({ priority: 10 })
        registerTasks(_app: TestApp) {
            events.push('tasks')
        }

        @OnBoot()
        logStartup(_app: TestApp) {
            events.push('log')
        }

        // Non-decorated methods should be ignored
        someOtherMethod() {
            events.push('other')
        }
    }

    const kernel = new ComplexKernel()
    const app: TestApp = { isDevelopment: false, initialized: false }

    await runBootHooks(kernel, app)

    assertEquals(events, ['database', 'seed', 'cache', 'tasks', 'log'])
})

Deno.test('@OnBoot - supports conditional execution based on app state', async () => {
    const events: string[] = []

    class ConditionalKernel {
        @OnBoot({ priority: 100 })
        conditionalTask(app: TestApp) {
            if (app.isDevelopment) {
                events.push('dev-only')
            }
        }

        @OnBoot({ priority: 50 })
        alwaysRun(_app: TestApp) {
            events.push('always')
        }
    }

    const kernel = new ConditionalKernel()

    // Test with isDevelopment = true
    const devApp: TestApp = { isDevelopment: true, initialized: false }
    await runBootHooks(kernel, devApp)
    assertEquals(events, ['dev-only', 'always'])

    // Reset and test with isDevelopment = false
    events.length = 0
    const prodApp: TestApp = { isDevelopment: false, initialized: false }
    await runBootHooks(kernel, prodApp)
    assertEquals(events, ['always'])
})

Deno.test('getBootHooks - returns hooks metadata that can be inspected', () => {
    class InspectableKernel {
        @OnBoot({ priority: 100 })
        async highPriority(_app: TestApp) {}

        @OnBoot({ priority: 50 })
        async mediumPriority(_app: TestApp) {}

        @OnBoot()
        async lowPriority(_app: TestApp) {}
    }

    // Create instance to trigger addInitializer
    new InspectableKernel()
    const hooks = getBootHooks(InspectableKernel)

    assertEquals(hooks.length, 3)

    // Verify all hooks have required properties
    hooks.forEach((hook) => {
        assertExists(hook.method)
        assertExists(hook.priority !== undefined)
        assertEquals(typeof hook.method, 'string')
        assertEquals(typeof hook.priority, 'number')
    })
})

Deno.test('@OnBoot - decorator throws error when applied to non-method', () => {
    let error: Error | undefined

    try {
        // @ts-expect-error - Testing invalid decorator usage
        @OnBoot()
        class _InvalidUsage {}
    } catch (e) {
        error = e as Error
    }

    // TC39 decorators may handle this differently, so we check if error exists
    // The important thing is that the decorator validates context.kind === 'method'
    assertExists(error)
})
