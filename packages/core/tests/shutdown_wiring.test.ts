/**
 * The wiring the other test files leave unproven: the decorator actually
 * reaching execution, and the framework's own teardowns actually registering.
 *
 * Every test here was written because a review found the path had no test at
 * all — not a weak assertion, an absent one. Each could have been silently
 * broken with the whole suite green.
 */

import { assertEquals } from '@std/assert'
import type { App } from '../app.ts'
import { Kernel } from '../kernel/kernel_decorators.ts'
import { OnShutdown } from '../kernel/shutdown_decorators.ts'
import { createApp } from '../kernel/loader.ts'
import { shutdownHooksStep } from '../kernel/bootstrap/steps/shutdown_hooks.ts'
import { schedulerStep } from '../kernel/bootstrap/steps/scheduler.ts'
import { databaseTeardownStep } from '../kernel/bootstrap/steps/database.ts'
import { SHUTDOWN_PRIORITY } from '../kernel/shutdown_registry.ts'
import type { BootstrapContext } from '../kernel/bootstrap/types.ts'
import { Scheduler, setScheduler } from '@lockness/scheduler'

/**
 * Give the test its own Scheduler.
 *
 * `scheduler()` is a process-wide singleton and `stop()` is terminal, so once
 * one test here boots an app and shuts it down, every later `start()` throws.
 * These tests passed individually and failed together — the classic shape, and
 * the reason the isolation is explicit rather than assumed.
 */
function isolateScheduler(): void {
    setScheduler(new Scheduler())
}

/** Records what a step registers, without booting anything. */
function recordingApp() {
    const registered: Array<{ name: string; priority?: number }> = []
    return {
        registered,
        app: {
            onShutdown: (name: string, _fn: unknown, priority?: number) => {
                registered.push({ name, priority })
            },
            configureShutdown: () => {},
        } as unknown as App,
    }
}

Deno.test('FR-013 - an @OnShutdown method runs at app.shutdown(), end to end', async () => {
    // The whole point of the decorator, and it had no test: shutdown_hooks.ts
    // could have registered nothing — its `typeof method !== 'function'` skip,
    // its `.call(kernel)` binding and its priority pass-through were all
    // unexercised — and every test still passed.
    isolateScheduler()
    const order: string[] = []

    @Kernel({ controllers: [] })
    class AppKernel {
        @OnShutdown({ priority: 100 })
        closeDatabase() {
            order.push('database')
        }

        @OnShutdown({ priority: 0 })
        notify() {
            order.push('notify')
        }
    }

    const app = await createApp(AppKernel)
    const report = await app.shutdown()

    // Ran at all...
    assertEquals(order.length, 2, 'both decorated methods executed')
    // ...in ascending priority, through the real bootstrap path...
    assertEquals(order, ['notify', 'database'])
    // ...and the report saw them. `ran` is 3, not 2: the real bootstrap also
    // registers core's own scheduler teardown, which is the point of FR-019 and
    // is exactly what a fixture asserting `=== 2` would have hidden.
    assertEquals(report.ran >= 2, true)
    assertEquals(report.failed, [])
})

Deno.test('FR-013 - the hook is invoked with the kernel as `this`', async () => {
    // `.call(kernel)` in the step. Without it a hook touching `this.anything`
    // throws at the worst possible moment, and nothing would have noticed.
    isolateScheduler()
    let seenThis: unknown

    @Kernel({ controllers: [] })
    class AppKernel {
        readonly marker = 'the-kernel'

        @OnShutdown()
        capture() {
            seenThis = (this as AppKernel).marker
        }
    }

    const app = await createApp(AppKernel)
    await app.shutdown()

    assertEquals(seenThis, 'the-kernel')
})

Deno.test('FR-009 - @Kernel({ shutdown: { signals: false } }) reaches App through the real path', async () => {
    // The tests for the opt-out called `app.configureShutdown()`, which is
    // @internal. The surface FR-009 actually specifies is the decorator, and
    // the route from it — loader.ts, the context, the step — was untraversed.
    // A KernelConfig key spelled wrong would have passed.
    isolateScheduler()

    @Kernel({ controllers: [], shutdown: { signals: false, deadlineMs: 1234 } })
    class AppKernel {}

    const app = await createApp(AppKernel)

    // Observed through behaviour that only the config can produce.
    const sequence = (app as unknown as {
        shutdownSequence: { deadlineMs: number }
    }).shutdownSequence
    assertEquals(sequence.deadlineMs, 1234, 'deadlineMs reached the sequence')

    const enabled = (app as unknown as { shutdownSignalsEnabled: boolean })
        .shutdownSignalsEnabled
    assertEquals(enabled, false, 'signals:false reached App')
})

Deno.test('SC-007 - an invalid deadlineMs fails the BOOT, not the shutdown', async () => {
    // resolveDeadlineMs was well tested in isolation; nothing showed createApp
    // actually rejecting. A step that swallowed the TypeError would have passed.
    isolateScheduler()

    @Kernel({ controllers: [], shutdown: { deadlineMs: Infinity } })
    class AppKernel {}

    let thrown: unknown
    try {
        await createApp(AppKernel)
    } catch (error) {
        thrown = error
    }

    assertEquals(thrown instanceof TypeError, true, 'boot must fail loudly')
    assertEquals(
        String(thrown).includes('deadlineMs'),
        true,
        'and name the setting',
    )
})

Deno.test('FR-013 - the step throws rather than silently skipping when the App is absent', () => {
    // `?.` here is what let the database teardown vanish for a whole review
    // cycle. This step throws instead, and that is worth pinning.
    let thrown: unknown
    try {
        shutdownHooksStep.run({ config: {} } as BootstrapContext)
    } catch (error) {
        thrown = error
    }
    assertEquals(thrown instanceof Error, true)
})

Deno.test('FR-019 - the scheduler step registers its teardown at SERVICES', async () => {
    // The registration existed and no test executed it. A step passing
    // SHUTDOWN_PRIORITY.NOTIFY would have closed the scheduler first, and the
    // band test in shutdown_sequence.test.ts asserts a property of the
    // CONSTANTS, not of what these steps pass.
    isolateScheduler()
    const { registered, app } = recordingApp()

    await schedulerStep.run(
        {
            config: { schedulesDir: './does-not-exist' },
            app,
        } as unknown as BootstrapContext,
    )

    const entry = registered.find((r) => r.name === 'scheduler')
    assertEquals(entry !== undefined, true, 'the scheduler teardown registered')
    assertEquals(entry?.priority, SHUTDOWN_PRIORITY.SERVICES)
})

Deno.test('FR-019 - the database teardown step runs AFTER the app exists', async () => {
    // The defect this whole step was extracted for: at order 100 the app did
    // not exist yet and `context.app?.onShutdown(...)` registered nothing, in
    // silence. It throws now.
    let thrown: unknown
    try {
        await databaseTeardownStep.run(
            { config: { database: true } } as BootstrapContext,
        )
    } catch (error) {
        thrown = error
    }

    assertEquals(
        thrown instanceof Error,
        true,
        'a missing app is a wiring error, not something to skip quietly',
    )
})
