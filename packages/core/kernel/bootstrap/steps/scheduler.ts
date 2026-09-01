/**
 * @fileoverview Scheduler bootstrap step.
 *
 * @module @lockness/core/kernel/bootstrap/steps/scheduler
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { tryImportOptionalPackage } from '../helpers.ts'
import { SHUTDOWN_PRIORITY } from '../../shutdown_registry.ts'

/**
 * Build the reporter the Scheduler sends failures to.
 *
 * `@lockness/scheduler` may not import `@lockness/logger` — that would breach
 * its dependency ceiling — so the wiring happens here, at the composition root,
 * where core is already allowed to know about both. Without this the port is
 * declared and unused, and every scheduled-task failure in every application
 * falls back to raw `console.error`.
 *
 * @returns A reporter backed by the application's logger, or `undefined` when
 * `@lockness/logger` is not installed — in which case the Scheduler's own
 * console fallback applies.
 */
async function buildReporter(): Promise<
    | {
        error(message: string, fields: Record<string, unknown>): void
        warn(message: string, fields: Record<string, unknown>): void
    }
    | undefined
> {
    const loggerModule = await tryImportOptionalPackage<{
        logger: () => {
            error: (m: string, f?: Record<string, unknown>) => Promise<void>
            warn: (m: string, f?: Record<string, unknown>) => Promise<void>
        }
    }>('@lockness/logger', 'scheduler logging')

    if (!loggerModule) return undefined

    const { logger } = loggerModule
    // The reporter contract is synchronous; the logger's methods are async.
    // Failures are reported, not awaited — a slow sink must never delay a task.
    return {
        error: (message, fields) => void logger().error(message, fields),
        warn: (message, fields) => void logger().warn(message, fields),
    }
}

/**
 * Scheduler discovery and start.
 *
 * **Order: 560 — after `app_initialization` (550), before `devtools_routes`
 * (600).** This placement is load-bearing, not incidental: a `runOnStart` task
 * armed earlier would execute against an app whose controllers, static files
 * and mount point do not exist yet, and before `KernelBooted` (500) has told
 * anyone the app is ready.
 *
 * Responsibilities:
 * - Skip entirely when `SCHEDULER_ENABLED` is set to a falsy value, so a
 *   multi-replica operator has a one-variable answer rather than a code change
 * - Wire the application's logger into the Scheduler's reporter port, so
 *   failures do not fall back to raw `console.error` (FR-020) — unless the
 *   application already installed a reporter of its own, which wins
 * - Discover from `schedulesDir`, and register the explicit `schedules` list
 * - Start the scheduler and log the **armed** count unconditionally
 * - **Re-throw** parse and registration failures. A schedule that cannot be
 *   armed is a configuration error, not an optional feature: the listeners step
 *   this mirrors logs and continues, under which a `0 0 30 2 *` task boots
 *   clean and silently never fires
 */
export const schedulerStep: BootstrapStep = {
    id: 'scheduler',
    order: 560,

    async run(context) {
        // An allowlist, trimmed, that refuses what it does not recognise.
        // A denylist fails OPEN: `"false "` with a trailing space, a CRLF line
        // ending from a .env file, or `"disabled"` would each have enabled every
        // replica — silently defeating the one mitigation this feature offers
        // against duplicate execution across instances. A kill switch that
        // ignores what you typed is worse than none, because you believe it
        // worked.
        const raw = Deno.env.get('SCHEDULER_ENABLED')?.trim().toLowerCase()
        if (raw !== undefined && raw !== '') {
            const OFF = ['0', 'false', 'off', 'no']
            const ON = ['1', 'true', 'on', 'yes']
            if (OFF.includes(raw)) {
                console.log('⏸  Scheduler disabled by SCHEDULER_ENABLED')
                return
            }
            if (!ON.includes(raw)) {
                throw new TypeError(
                    `SCHEDULER_ENABLED="${raw}" is not recognised. Use one of: ${
                        [...ON, ...OFF].join(', ')
                    }.`,
                )
            }
        }

        const { discoverSchedules, registerSchedules } = await import(
            '../../../scheduler/schedule_discovery.ts'
        )
        const { DEFAULT_SCHEDULES_DIR, scheduler } = await import(
            '@lockness/scheduler'
        )

        // Install the reporter BEFORE discovery, because discovery registers
        // into whichever instance `scheduler()` returns.
        //
        // In PLACE, not by swapping the shared instance. `setScheduler(new
        // Scheduler(reporter))` discarded two things it had no business
        // discarding: any task an application registered imperatively before
        // boot, and the application's own reporter — the one `docs/DOCS.md`
        // tells people to install with `setScheduler(new Scheduler({ … }))`,
        // which was silently overwritten whenever @lockness/logger happened to
        // be present. `hasReporter` is what makes the application's choice win.
        const reporter = await buildReporter()
        if (reporter && !scheduler().hasReporter) {
            scheduler().setReporter(reporter)
        }

        // The constant, not a restated literal. Restating it is the duplication
        // that already ships for listeners — steps/listeners.ts:33 hardcodes
        // './app/listener' while kernel_decorators.ts:211 repeats it as an
        // @default tag, and the two can drift apart silently.
        const schedulesDir = context.config.schedulesDir ??
            DEFAULT_SCHEDULES_DIR
        let registered = 0

        try {
            registered += await discoverSchedules(schedulesDir)
        } catch (error) {
            // A project with no scheduled tasks legitimately has no directory.
            // Everything else — a bad expression, a duplicate name, a path that
            // escapes the project — fails the boot.
            if (!(error instanceof Deno.errors.NotFound)) throw error
        }

        if (context.config.schedules && context.config.schedules.length > 0) {
            registered += registerSchedules(
                context.config.schedules as Parameters<
                    typeof registerSchedules
                >[0],
            )
        }

        const armed = scheduler().start()

        // Release the timers at shutdown. Until #129 this package's `stop()`
        // had exactly one caller in the whole repository, and it was a test —
        // so every application that armed a schedule leaked its timers on exit
        // and each author was told to wire `Deno.addSignalListener` by hand.
        //
        // SHUTDOWN_PRIORITY.SERVICES, never the step's `order` of 560. Those are
        // different axes that happen to look alike; reusing an `order` here is
        // the mistake the named band exists to prevent.
        context.app?.onShutdown(
            'scheduler',
            () => scheduler().stop(),
            SHUTDOWN_PRIORITY.SERVICES,
        )

        // Logged unconditionally, including zero. The listeners step guards its
        // equivalent on `count > 0`, which makes the message inert in exactly
        // the case it exists for.
        console.log(
            `✓ Scheduler started: ${armed} task(s) armed of ${registered} registered`,
        )
    },
}
