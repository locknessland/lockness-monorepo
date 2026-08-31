/**
 * @fileoverview The `@Schedule` decorator and its metadata store.
 *
 * **This module is the single home of decoration-time validation.** The
 * expression is parsed in the factory body, before the decorator function is
 * returned — so a malformed schedule fails where it was written, at class
 * definition, rather than at first fire in production.
 *
 * It derives **no** task name and contains **no** `try`/`catch`. Identity
 * belongs to `Scheduler.register`, which is the one gate both the decorator and
 * the public `register()` cross; failure handling belongs to `task_runner.ts`.
 *
 * @module @lockness/scheduler/decorators
 */

import { parse } from './cron_parser.ts'
import { validateScheduleOptions } from './scheduler.ts'
import type { ScheduleOptions } from './types.ts'

/**
 * Where a class's schedule metadata is stored.
 * @internal
 */
export const SCHEDULE_METADATA: unique symbol = Symbol(
    'lockness:schedule:metadata',
)

/** One decorated method, as recorded at instantiation. */
export interface ScheduleMetadata {
    /** The validated cron expression. */
    readonly expression: string
    /** The decorated method's name. */
    readonly methodName: string
    /** The schedule's options. */
    readonly options: ScheduleOptions
}

/** A class that may carry schedule metadata. */
interface MetadataCarrier {
    [SCHEDULE_METADATA]?: ScheduleMetadata[]
}

/**
 * Record one schedule against a class constructor.
 *
 * @param target - The class constructor.
 * @param metadata - What to record.
 * @internal
 */
export function addScheduleMetadata(
    target: object,
    metadata: ScheduleMetadata,
): void {
    const carrier = target as MetadataCarrier
    ;(carrier[SCHEDULE_METADATA] ??= []).push(metadata)
}

/**
 * Every schedule recorded against a class.
 *
 * **Metadata does not exist until the class is instantiated** — TC39
 * `addInitializer` runs at construction, not at definition — so a caller must
 * construct the class (through the DI container) before reading this.
 *
 * @param target - The class constructor.
 * @returns The recorded schedules, or an empty array.
 *
 * @example
 * ```ts
 * const instance = container.get(ReportService)
 * getScheduleMetadata(ReportService) // [{ expression: '0 3 * * *', … }]
 * ```
 */
export function getScheduleMetadata(
    target: object,
): readonly ScheduleMetadata[] {
    return (target as MetadataCarrier)[SCHEDULE_METADATA] ?? []
}

/**
 * Run a method on a schedule.
 *
 * The decorated method is returned **unchanged**. A TC39 method decorator whose
 * replacement has a different type is TS1270, and wrapping the method here to
 * add the timeout would force every scheduled method to be `async` — the exact
 * constraint `@Cached` had to accept. The timeout belongs to the runner, which
 * receives the method as a value rather than replacing it.
 *
 * The method may take an `AbortSignal`, which `timeout` aborts.
 *
 * @param expression - A 5-field cron expression, or a preset.
 * @param options - The schedule's options.
 * @returns A method decorator.
 * @throws {TypeError} At **decoration time** if the expression or any option is
 * malformed — not at first fire.
 *
 * @example
 * ```ts
 * import { daily, Schedule } from '@lockness/core'
 *
 * export class ReportService {
 *     @Schedule('0 3 * * *')
 *     async nightlyDigest() {
 *         await sendDigest()
 *     }
 *
 *     @Schedule(daily, { name: 'cleanup', timeout: 30_000, retries: 2 })
 *     async cleanup(signal: AbortSignal) {
 *         await purge({ signal })
 *     }
 * }
 * ```
 */
export function Schedule(
    expression: string,
    options: ScheduleOptions = {},
): <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Return
    >,
) => (this: This, ...args: Args) => Return {
    // Validate NOW, in the factory body: this runs when the decorator
    // expression is evaluated, at class definition. Deferring it to first fire
    // would leave a broken schedule to surface in production.
    parse(expression)
    validateScheduleOptions(options)

    return function <This, Args extends unknown[], Return>(
        target: (this: This, ...args: Args) => Return,
        context: ClassMethodDecoratorContext<
            This,
            (this: This, ...args: Args) => Return
        >,
    ): (this: This, ...args: Args) => Return {
        if (context.kind !== 'method') {
            throw new TypeError(
                `@Schedule can only decorate methods, received: ${context.kind}.`,
            )
        }

        context.addInitializer(function (this: This) {
            addScheduleMetadata((this as object).constructor, {
                expression,
                methodName: String(context.name),
                options,
            })
        })

        // Returned unchanged — see the note above on TS1270.
        return target
    }
}
