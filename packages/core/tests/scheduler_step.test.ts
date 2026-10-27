/**
 * The scheduler bootstrap step — the wiring, not the scheduler.
 *
 * `SchedulerReporter` is a port that `@lockness/scheduler` declares and cannot
 * fill: it may not import `@lockness/logger` without breaching its dependency
 * ceiling. Core is the composition root, so core fills it. Until #132 nothing
 * did, and every scheduled-task failure in every application went to raw
 * `console.error` instead of the application's own logging.
 */

import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { Scheduler, scheduler, setScheduler } from '@lockness/scheduler'
import { schedulerStep } from '../kernel/bootstrap/steps/scheduler.ts'
import type { BootstrapContext } from '../kernel/bootstrap/types.ts'
import type { ImportModule } from '../kernel/bootstrap/optional_packages.ts'
import type { KernelConfig } from '../kernel/kernel_decorators.ts'

/** A context carrying nothing the scheduler step does not read. */
function contextWith(
    config: Record<string, unknown>,
    importModule?: ImportModule,
): BootstrapContext {
    class TestKernel {}
    return {
        config,
        kernel: new TestKernel(),
        KernelClass: TestKernel,
        bootHooks: [],
        importModule,
    } as unknown as BootstrapContext
}

/** An importer that records every specifier and resolves none of them. */
function recordingImporter(): { importModule: ImportModule; calls: string[] } {
    const calls: string[] = []
    return {
        calls,
        importModule: (specifier) => {
            calls.push(specifier)
            return Promise.reject(
                new TypeError(`unexpected import ${specifier}`),
            )
        },
    }
}

/**
 * Run the step with an untyped `schedulerLock` — the shape a plain-JS caller,
 * or a config built from `any`, can hand the kernel past the type — and return
 * the boot's rejection.
 */
async function bootRejectingLock(
    schedulerLock: unknown,
): Promise<{ error: TypeError; calls: string[] }> {
    const { importModule, calls } = recordingImporter()
    setScheduler(new Scheduler())
    try {
        const error = await assertRejects(
            async () =>
                await schedulerStep.run(contextWith({
                    schedulerLock,
                    schedulesDir: './tmp/does-not-exist-schedules',
                }, importModule)),
            TypeError,
        )
        assertEquals(
            scheduler().hasLock,
            false,
            'a refused lock config installs nothing',
        )
        return { error, calls }
    } finally {
        scheduler().stop()
        setScheduler(undefined)
    }
}

/**
 * Run the step against a fresh shared scheduler, then put the process-wide
 * instance back. `config` defaults to `{ logger: true }` — the opt-in that
 * wires the logger in since #505. `schedulesDir` names a directory that does not exist, which
 * the step treats as "this application has no scheduled tasks".
 */
async function withBootedScheduler(
    install: Scheduler,
    run: () => Promise<void>,
    config: Record<string, unknown> = { logger: true },
): Promise<void> {
    setScheduler(install)
    try {
        await schedulerStep.run(
            contextWith({
                ...config,
                schedulesDir: './tmp/does-not-exist-schedules',
            }),
        )
        await run()
    } finally {
        scheduler().stop()
        setScheduler(undefined)
    }
}

Deno.test('schedulerStep - logger: true boots with a reporter installed, so failures never reach console.error', async () => {
    const errors: unknown[][] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => void errors.push(args)

    try {
        await withBootedScheduler(new Scheduler(), async () => {
            assertEquals(
                scheduler().hasReporter,
                true,
                'core must fill the port it declared — this is the whole of #132',
            )

            scheduler().register({
                expression: '0 3 * * *',
                body: () => {
                    throw new Error('nightly digest exploded')
                },
                options: { name: 'digest' },
            })
            await scheduler().runNow('digest')

            assertEquals(
                errors.filter((a) =>
                    String(a[0]).includes('Scheduled task failed')
                ),
                [],
                'the failure went to the injected reporter, not to console.error',
            )
            assertEquals(scheduler().getStats().tasks[0].failureCount, 1)
        })
    } finally {
        console.error = originalError
    }
})

Deno.test('schedulerStep - a logger whose transport rejects causes no unhandled rejection and writes one stderr line', async () => {
    // A `FileTransport` on a full disk, or a sink that is down, rejects. The
    // reporter used to `void` that promise, so the rejection went unhandled
    // and ended the process the first time a task failed.
    const unhandled: unknown[] = []
    const onUnhandled = (event: PromiseRejectionEvent) => {
        event.preventDefault()
        unhandled.push(event.reason)
    }
    const rejecting = () => Promise.reject(new Error('disk full'))
    const importModule: ImportModule = (specifier) =>
        specifier === '@lockness/logger'
            ? Promise.resolve({
                logger: () => ({ error: rejecting, warn: rejecting }),
            })
            : Promise.reject(new TypeError(`unexpected import ${specifier}`))
    const errors: string[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => void errors.push(args.join(' '))
    globalThis.addEventListener('unhandledrejection', onUnhandled)
    setScheduler(new Scheduler())
    try {
        await schedulerStep.run(contextWith({
            logger: true,
            schedulesDir: './tmp/does-not-exist-schedules',
        }, importModule))
        scheduler().register({
            expression: '0 3 * * *',
            body: () => {
                throw new Error('task exploded')
            },
            options: { name: 'rejecting-sink' },
        })
        await scheduler().runNow('rejecting-sink')
        // Let the rejected transport promise settle and the unhandled
        // rejection event, if any, fire.
        await new Promise((resolve) => setTimeout(resolve, 10))

        assertEquals(unhandled, [], 'the transport rejection went unhandled')
        const failures = errors.filter((line) => line.includes('logger failed'))
        assertEquals(failures.length, 1, errors.join('\n'))
        assertStringIncludes(failures[0], 'disk full')
    } finally {
        globalThis.removeEventListener('unhandledrejection', onUnhandled)
        console.error = originalError
        scheduler().stop()
        setScheduler(undefined)
    }
})

Deno.test("schedulerStep - an application's own reporter is not overwritten", async () => {
    // docs/DOCS.md tells people to install one with
    // `setScheduler(new Scheduler({ … }))`. The step used to replace the shared
    // instance outright, so that reporter — and every task registered before
    // boot — was silently discarded whenever @lockness/logger happened to be
    // installed.
    const mine: string[] = []
    const ours = new Scheduler({
        error: (message) => void mine.push(message),
        warn: () => {},
    })
    ours.register({
        expression: '0 3 * * *',
        body: () => {
            throw new Error('boom')
        },
        options: { name: 'registered-before-boot' },
    })

    await withBootedScheduler(ours, async () => {
        assertEquals(
            scheduler(),
            ours,
            'the instance is kept, not swapped',
        )
        assertEquals(
            scheduler().getStats().tasks.map((t) => t.name),
            ['registered-before-boot'],
            'a task registered before boot survives',
        )

        await scheduler().runNow('registered-before-boot')
        assertEquals(
            mine.some((m) => m.includes('Scheduled task failed')),
            true,
            "the application's reporter still receives failures",
        )
    })
})

Deno.test('schedulerStep - without logger: true no reporter is wired, and the logger is not imported', async () => {
    // #505: the logger used to be wired whenever @lockness/logger resolved —
    // present in the import map for any reason. Now only the kernel key turns
    // it on, and the scheduler keeps its own console fallback otherwise.
    await withBootedScheduler(new Scheduler(), () => {
        assertEquals(scheduler().hasReporter, false)
        return Promise.resolve()
    }, {})
})

Deno.test("KernelConfig.schedulerLock - driver 'redis' without a connection does not compile", () => {
    // #517: one object type with an optional `redis` let this compile, and at
    // boot it installed no lock — every replica ran each onOneServer task.
    // @ts-expect-error - the 'redis' member requires `redis`
    const missing: KernelConfig['schedulerLock'] = { driver: 'redis' }
    const stray: KernelConfig['schedulerLock'] = {
        driver: 'deno-kv',
        // @ts-expect-error - the 'deno-kv' member does not accept `redis`
        redis: { hostname: '127.0.0.1' },
    }
    const valid: KernelConfig['schedulerLock'][] = [
        { driver: 'redis', redis: { hostname: '127.0.0.1' }, ttlMs: 60_000 },
        { driver: 'deno-kv' },
        { driver: 'deno-kv', kvPath: './tmp/lock.kv', ttlMs: 60_000 },
    ]
    assertEquals([missing, stray, ...valid].length, 5)
})

Deno.test("schedulerStep - schedulerLock.driver 'redis' without a connection refuses the boot", async () => {
    // It used to match neither branch, install no lock and say nothing (#517).
    // The refusal comes before the package import, so it names the missing
    // connection whether or not @lockness/redis is installed.
    const { error, calls } = await bootRejectingLock({ driver: 'redis' })
    assertStringIncludes(error.message, 'schedulerLock.redis')
    assertEquals(calls, [], 'no package is imported for a refused config')
})

Deno.test("schedulerStep - schedulerLock.driver 'redis' with a non-object connection refuses the boot", async () => {
    const { error } = await bootRejectingLock({ driver: 'redis', redis: null })
    assertStringIncludes(error.message, 'schedulerLock.redis')
})

Deno.test('schedulerStep - an unknown schedulerLock.driver refuses the boot', async () => {
    const { error, calls } = await bootRejectingLock({ driver: 'memcached' })
    assertStringIncludes(error.message, 'schedulerLock.driver')
    assertStringIncludes(error.message, '"memcached"')
    assertEquals(calls, [])
})
