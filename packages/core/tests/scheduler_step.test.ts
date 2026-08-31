/**
 * The scheduler bootstrap step — the wiring, not the scheduler.
 *
 * `SchedulerReporter` is a port that `@lockness/scheduler` declares and cannot
 * fill: it may not import `@lockness/logger` without breaching its dependency
 * ceiling. Core is the composition root, so core fills it. Until #132 nothing
 * did, and every scheduled-task failure in every application went to raw
 * `console.error` instead of the application's own logging.
 */

import { assertEquals } from '@std/assert'
import { Scheduler, scheduler, setScheduler } from '@lockness/scheduler'
import { schedulerStep } from '../kernel/bootstrap/steps/scheduler.ts'
import type { BootstrapContext } from '../kernel/bootstrap/types.ts'

/** A context carrying nothing the scheduler step does not read. */
function contextWith(config: Record<string, unknown>): BootstrapContext {
    class TestKernel {}
    return {
        config,
        kernel: new TestKernel(),
        KernelClass: TestKernel,
        bootHooks: [],
    } as unknown as BootstrapContext
}

/**
 * Run the step against a fresh shared scheduler, then put the process-wide
 * instance back. `schedulesDir` names a directory that does not exist, which
 * the step treats as "this application has no scheduled tasks".
 */
async function withBootedScheduler(
    install: Scheduler,
    run: () => Promise<void>,
): Promise<void> {
    setScheduler(install)
    try {
        await schedulerStep.run(
            contextWith({ schedulesDir: './tmp/does-not-exist-schedules' }),
        )
        await run()
    } finally {
        scheduler().stop()
        setScheduler(undefined)
    }
}

Deno.test('schedulerStep - boots with a reporter installed, so failures never reach console.error', async () => {
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
