/**
 * @fileoverview `@lockness/scheduler` — declarative cron-based task scheduling.
 *
 * Put `@Schedule` above a method and it runs on a schedule. Times are UTC,
 * state is in-process, and the package holds no HTTP surface.
 *
 * Applications import these symbols from `@lockness/core`, which re-exports
 * them; this module is the package's own entry point.
 *
 * @module @lockness/scheduler
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
 * }
 * ```
 */

export { nextRun, parse } from './cron_parser.ts'
export {
    addScheduleMetadata,
    getScheduleMetadata,
    Schedule,
    SCHEDULE_METADATA,
} from './decorators.ts'
export type { ScheduleMetadata } from './decorators.ts'
export {
    MAX_RETRIES,
    NAME_PATTERN,
    resolveTaskName,
    Scheduler,
    scheduler,
    setScheduler,
    validateScheduleOptions,
} from './scheduler.ts'
export type { TaskRegistration } from './scheduler.ts'
export { MemorySchedulerLock } from './memory_lock.ts'
export type { MemorySchedulerLockOptions } from './memory_lock.ts'
export { runTask, TaskTimeoutError } from './task_runner.ts'
export type { RunOutcome, TaskBody } from './task_runner.ts'
export { MAX_DELAY_MS, MIN_DELAY_MS, TimerRegistry } from './timer_registry.ts'
export {
    daily,
    everyFifteenMinutes,
    everyFiveMinutes,
    everyMinute,
    everyTenMinutes,
    everyThirtyMinutes,
    hourly,
    monthly,
    PRESETS,
    weekdays,
    weekends,
    weekly,
    yearly,
} from './presets.ts'
export { DEFAULT_SCHEDULES_DIR } from './types.ts'
export type {
    CronExpression,
    OverlapPolicy,
    ScheduleOptions,
    SchedulerLock,
    SchedulerReporter,
    SchedulerStats,
    TaskFailure,
    TaskStats,
} from './types.ts'
