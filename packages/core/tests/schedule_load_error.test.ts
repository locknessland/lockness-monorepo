/**
 * The scheduler boot step against the fail-loud rule (#521), the schedules twin
 * of `listeners_step.test.ts` (#518).
 *
 * `discoverSchedules` imported each file bare, and the step tolerates
 * `Deno.errors.NotFound` from discovery as "this app has no schedules
 * directory". A schedule module that threw `NotFound` itself while it
 * evaluated — a top-level read of a missing config file — passed for an absent
 * directory: the boot carried on without a log line, minus that file's tasks
 * and those of every file scanned after it. Scheduled tasks are often security
 * housekeeping, so the silence is the defect.
 *
 * The only tolerated failure now is an absent directory. Every file that fails
 * to load refuses the boot with a `ScheduleLoadError` naming it.
 *
 * The broken schedule files are REAL files written under the working directory
 * and imported by the step: the failure shapes come from the runtime, so a
 * hand-built error would prove nothing.
 */

import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { join } from '@std/path'
import {
    Schedule,
    Scheduler,
    scheduler,
    setScheduler,
} from '@lockness/scheduler'
import { schedulerStep } from '../kernel/bootstrap/steps/scheduler.ts'
import {
    discoverSchedules,
    ScheduleLoadError,
} from '../scheduler/schedule_discovery.ts'
import { Kernel } from '../kernel/kernel_decorators.ts'
import { createApp } from '../kernel/loader.ts'
import type { BootstrapContext } from '../kernel/bootstrap/types.ts'
import type { KernelConfig } from '../kernel/kernel_decorators.ts'

/** A schedule file whose import names a package no import map resolves. */
const UNRESOLVABLE =
    `import 'lockness-521-no-such-package'\nexport class Unresolvable {}\n`

/** A schedule file whose module throws while it evaluates. */
const THROWING = `throw new Error('schedule exploded at load')\nexport {}\n`

/**
 * A schedule file that throws `Deno.errors.NotFound` while it evaluates — the
 * very class an absent directory throws.
 */
const READS_MISSING =
    `Deno.readTextFileSync('./lockness-521-no-such-file')\nexport {}\n`

/** A schedule file that loads cleanly and registers nothing. */
const HEALTHY = `export class Healthy {}\n`

/** A directory that does not exist under the working directory. */
const ABSENT = './tmp/schedules-521-absent'

/** The step's context, built from the fields it reads. */
function contextFor(config: KernelConfig): BootstrapContext {
    class TestKernel {}
    return {
        config,
        kernel: new TestKernel(),
        KernelClass: TestKernel,
        bootHooks: [],
    } as unknown as BootstrapContext
}

/**
 * Create `<cwd>/tmp/<unique>/` with `files` in it, hand its cwd-relative path
 * to `run`, and remove it afterwards. Under the working directory because
 * discovery refuses a schedules directory outside it.
 */
async function withDir(
    files: Record<string, string>,
    run: (rel: string) => Promise<void>,
): Promise<void> {
    const rel = `tmp/schedules-521-${crypto.randomUUID().slice(0, 8)}`
    const abs = join(Deno.cwd(), rel)
    await Deno.mkdir(abs, { recursive: true })
    try {
        for (const [name, source] of Object.entries(files)) {
            await Deno.mkdir(join(abs, name, '..'), { recursive: true })
            await Deno.writeTextFile(join(abs, name), source)
        }
        await run(rel)
    } finally {
        await Deno.remove(abs, { recursive: true })
    }
}

/**
 * Run `body` against a fresh shared Scheduler, then stop it and put the
 * process-wide instance back: `scheduler()` is a singleton and `stop()` is
 * terminal.
 */
async function withScheduler(body: () => Promise<void>): Promise<void> {
    setScheduler(new Scheduler())
    try {
        await body()
    } finally {
        scheduler().stop()
        setScheduler(undefined)
    }
}

/** Run the step with `config` and return the boot's refusal. */
function refusal(config: KernelConfig): Promise<ScheduleLoadError> {
    return assertRejects(
        () => Promise.resolve(schedulerStep.run(contextFor(config))),
        ScheduleLoadError,
    )
}

/** Run `body` and return what it wrote to `console.error` and `console.warn`. */
async function complaints(body: () => Promise<unknown>): Promise<string> {
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    }
    const lines: string[] = []
    console.log = () => {}
    console.warn = console.error = (...args: unknown[]) => {
        lines.push(args.map((arg) => String(arg)).join(' '))
    }
    try {
        await body()
    } finally {
        Object.assign(console, original)
    }
    return lines.join('\n')
}

Deno.test('#521 a schedule file importing an unresolvable specifier refuses the boot, naming the file', async () => {
    await withScheduler(() =>
        withDir(
            { 'healthy.ts': HEALTHY, 'unresolvable_schedule.ts': UNRESOLVABLE },
            async (rel) => {
                const error = await refusal({ schedulesDir: rel })
                assertEquals(error.file, `${rel}/unresolvable_schedule.ts`)
                assertStringIncludes(
                    error.message,
                    `"${rel}/unresolvable_schedule.ts"`,
                )
                assertStringIncludes(
                    error.message,
                    'lockness-521-no-such-package',
                )
            },
        )
    )
})

Deno.test('#521 a schedule file in a nested subdirectory that throws while it loads refuses the boot', async () => {
    await withScheduler(() =>
        withDir({ 'nested/throwing_schedule.ts': THROWING }, async (rel) => {
            const error = await refusal({ schedulesDir: rel })
            assertEquals(error.file, `${rel}/nested/throwing_schedule.ts`)
            assertStringIncludes(error.message, 'schedule exploded at load')
        })
    )
})

Deno.test('#521 a schedule module that throws NotFound is a broken file, not an absent directory', async () => {
    await withScheduler(() =>
        withDir({ 'reads_missing.ts': READS_MISSING }, async (rel) => {
            const error = await refusal({ schedulesDir: rel })
            assertEquals(error.file, `${rel}/reads_missing.ts`)
            assertStringIncludes(error.message, 'NotFound')
        })
    )
})

Deno.test('#521 createApp() rejects with ScheduleLoadError when a schedule module throws NotFound', async () => {
    await withScheduler(() =>
        withDir({ 'reads_missing.ts': READS_MISSING }, async (rel) => {
            @Kernel({
                controllers: [],
                schedulesDir: rel,
                shutdown: { signals: false },
            })
            class AppKernel {}

            const error = await assertRejects(
                () => createApp(AppKernel),
                ScheduleLoadError,
            )
            assertEquals(error.file, `${rel}/reads_missing.ts`)
        })
    )
})

Deno.test('#521 the error carries no cause, so an uncaught refusal prints only the rendered line', async () => {
    await withDir({ 'throwing.ts': THROWING }, async (rel) => {
        const error = await assertRejects(
            () => discoverSchedules(rel, new Scheduler()),
            ScheduleLoadError,
        )
        assertEquals(error.cause, undefined)
    })
})

Deno.test('#521 a refused boot names the file on one line, outside a stack trace', async () => {
    await withDir({ 'broken.ts': UNRESOLVABLE }, async (rel) => {
        const error = await assertRejects(
            () => discoverSchedules(rel, new Scheduler()),
            ScheduleLoadError,
        )
        assertInstanceOf(error, Error)
        assertEquals(error.name, 'ScheduleLoadError')
        // The runtime's own message spans several lines and quotes absolute
        // paths; renderError escapes the breaks.
        assert(!error.message.includes('\n'), error.message)
    })
})

Deno.test('#521 a duplicate task name is still reported as itself, not as a load failure', async () => {
    // The wrap covers the import only. The duplicate-name refusal raised while
    // registering must keep its own message, which names both files.
    const source = (cls: string) =>
        `import { Schedule } from '@lockness/scheduler'\n` +
        `export class ${cls} { @Schedule('0 3 * * *', { name: 'purge' }) run() {} }\n`
    await withDir({ 'a.ts': source('A'), 'b.ts': source('B') }, async (rel) => {
        const error = await assertRejects(
            () => discoverSchedules(rel, new Scheduler()),
            Error,
        )
        assert(!(error instanceof ScheduleLoadError), error.message)
        assertStringIncludes(error.message, 'both resolve to the name "purge"')
    })
})

Deno.test('#521 discoverSchedules still reports an absent directory as NotFound', async () => {
    await assertRejects(
        () => discoverSchedules(ABSENT, new Scheduler()),
        Deno.errors.NotFound,
    )
})

/** A schedule a kernel names in `config.schedules`, not in a directory. */
class ExplicitSchedule {
    @Schedule('0 4 * * *')
    purge(): void {}
}

Deno.test('#521 an absent schedules directory boots silently and the explicit schedules register', async () => {
    await withScheduler(async () => {
        const output = await complaints(() =>
            Promise.resolve(
                schedulerStep.run(contextFor({
                    schedulesDir: ABSENT,
                    schedules: [ExplicitSchedule],
                })),
            )
        )
        assertEquals(output, '')
        assertEquals(
            scheduler().getStats().tasks.map((task) => task.name),
            ['ExplicitSchedule.purge'],
        )
    })
})
