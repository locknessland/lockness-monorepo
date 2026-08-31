/**
 * @fileoverview Human-readable schedule presets.
 *
 * **This module is the single home of what a preset name means.** Each one is a
 * plain expression string, so a preset is never a second way of computing a
 * next run — it resolves to the same grammar `cron_parser.ts` already owns, and
 * the docs quote this map rather than restating an expression.
 *
 * @module @lockness/scheduler/presets
 */

/** Every minute — `* * * * *`. */
export const everyMinute = '* * * * *'
/** At 0, 5, 10 … minutes past the hour. */
export const everyFiveMinutes = '*/5 * * * *'
/** At 0, 10, 20 … minutes past the hour. */
export const everyTenMinutes = '*/10 * * * *'
/** At 0, 15, 30 and 45 minutes past the hour. */
export const everyFifteenMinutes = '*/15 * * * *'
/** On the hour and on the half hour. */
export const everyThirtyMinutes = '*/30 * * * *'
/** At the top of every hour. */
export const hourly = '0 * * * *'
/** At midnight UTC. */
export const daily = '0 0 * * *'
/** At midnight UTC on Sunday. */
export const weekly = '0 0 * * 0'
/** At midnight UTC on the 1st. */
export const monthly = '0 0 1 * *'
/** At midnight UTC on 1 January. */
export const yearly = '0 0 1 1 *'
/** At midnight UTC, Monday to Friday. */
export const weekdays = '0 0 * * 1-5'
/** At midnight UTC, Saturday and Sunday. */
export const weekends = '0 0 * * 6,0'

/**
 * Every preset, by name.
 *
 * @example
 * ```ts
 * import { PRESETS } from '@lockness/scheduler'
 * PRESETS.hourly // '0 * * * *'
 * ```
 */
export const PRESETS: Readonly<Record<string, string>> = Object.freeze({
    everyMinute,
    everyFiveMinutes,
    everyTenMinutes,
    everyFifteenMinutes,
    everyThirtyMinutes,
    hourly,
    daily,
    weekly,
    monthly,
    yearly,
    weekdays,
    weekends,
})
