/**
 * @fileoverview The 5-field cron parser — the single home of the grammar, of
 * what an invalid expression says, of next-run computation, and of the decision
 * that time is UTC.
 *
 * Pure by construction: `nextRun` takes its reference instant as a parameter and
 * never reads the clock, which is what makes the whole schedule table testable
 * without waiting on real time.
 *
 * @module @lockness/scheduler/cron_parser
 */

import type { CronExpression } from './types.ts'

/** Field name, and the inclusive range it accepts. */
const FIELDS = [
    { name: 'minute', min: 0, max: 59 },
    { name: 'hour', min: 0, max: 23 },
    { name: 'day-of-month', min: 1, max: 31 },
    { name: 'month', min: 1, max: 12 },
    { name: 'day-of-week', min: 0, max: 6 },
] as const

/**
 * How far ahead `nextRun` will search before giving up.
 *
 * Four years crosses a full leap cycle, so any expression that can ever match
 * matches inside it. An expression that cannot — `0 0 30 2 *` — hits the bound
 * and throws instead of looping forever.
 */
const HORIZON_YEARS = 4

/** A bare integer token. Anything else — aliases, decimals, junk — is rejected. */
const INTEGER = /^\d+$/

/**
 * Expand one field into its sorted, deduplicated list of matching values.
 *
 * @param token - The field's raw text.
 * @param field - Its name and accepted range.
 * @returns Every value the field matches, ascending.
 * @throws {TypeError} Naming the field and the offending token.
 */
function expandField(
    token: string,
    field: {
        readonly name: string
        readonly min: number
        readonly max: number
    },
): number[] {
    const fail = (why: string): never => {
        throw new TypeError(
            `Invalid ${field.name} field "${token}" in cron expression: ${why}. ` +
                `Accepted: *, a value ${field.min}-${field.max}, a range a-b, a list a,b,c, or a step */n.`,
        )
    }

    const values = new Set<number>()

    for (const part of token.split(',')) {
        if (part === '') fail('empty list entry')

        // Split an optional step suffix: "<range>/<step>".
        const [rangeText, stepText, ...rest] = part.split('/')
        if (rest.length > 0) fail('more than one "/"')

        let step = 1
        if (stepText !== undefined) {
            if (!INTEGER.test(stepText)) {
                fail(`"${stepText}" is not a positive step`)
            }
            step = Number(stepText)
            if (step < 1) fail('a step must be 1 or greater')
        }

        let lo: number
        let hi: number
        if (rangeText === '*') {
            lo = field.min
            hi = field.max
        } else {
            const bounds = rangeText.split('-')
            if (bounds.length > 2) fail('more than one "-"')
            for (const b of bounds) {
                if (!INTEGER.test(b)) {
                    fail(`"${b}" is not a number in ${field.min}-${field.max}`)
                }
            }
            lo = Number(bounds[0])
            hi = bounds.length === 2 ? Number(bounds[1]) : lo
            if (hi < lo) fail(`range ${lo}-${hi} is inverted`)
        }

        if (lo < field.min || hi > field.max) {
            fail(`out of range ${field.min}-${field.max}`)
        }

        for (let v = lo; v <= hi; v += step) values.add(v)
    }

    return [...values].sort((a, b) => a - b)
}

/**
 * Parse a standard 5-field cron expression.
 *
 * Fields are minute, hour, day-of-month, month, day-of-week. Six-field syntax
 * (with seconds) and name aliases (`JAN`, `MON`) are deliberately unsupported
 * and rejected rather than silently mis-parsed.
 *
 * @param expression - The expression to parse.
 * @returns The expanded field lists.
 * @throws {TypeError} Naming the offending field and token.
 *
 * @example
 * ```ts
 * parse('0 3 * * *').hour // [3]
 * parse('*\/15 * * * *').minute // [0, 15, 30, 45]
 * ```
 */
export function parse(expression: string): CronExpression {
    if (typeof expression !== 'string') {
        throw new TypeError(
            `A cron expression must be a string, received ${typeof expression}.`,
        )
    }

    const tokens = expression.trim().split(/\s+/).filter((t) => t !== '')
    if (tokens.length !== FIELDS.length) {
        throw new TypeError(
            `A cron expression needs exactly 5 fields (minute hour day-of-month month day-of-week), ` +
                `received ${tokens.length} in "${expression}".`,
        )
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = tokens.map((
        token,
        i,
    ) => expandField(token, FIELDS[i]))

    return {
        minute,
        hour,
        dayOfMonth,
        month,
        dayOfWeek,
        dayOfMonthWildcard: tokens[2] === '*',
        dayOfWeekWildcard: tokens[4] === '*',
    }
}

/**
 * Does this date's day match, under standard cron day semantics?
 *
 * When both day fields are restricted, cron treats them as a **union** — the
 * day matches if either does. When only one is restricted, only that one counts.
 *
 * @param e - The parsed expression.
 * @param date - The instant to test, read in UTC.
 * @returns Whether the day matches.
 */
function dayMatches(e: CronExpression, date: Date): boolean {
    const domHit = e.dayOfMonth.includes(date.getUTCDate())
    const dowHit = e.dayOfWeek.includes(date.getUTCDay())

    if (e.dayOfMonthWildcard && e.dayOfWeekWildcard) return true
    if (e.dayOfMonthWildcard) return dowHit
    if (e.dayOfWeekWildcard) return domHit
    return domHit || dowHit
}

/**
 * The next instant at or after `from` that the expression matches, exclusive of
 * `from` itself.
 *
 * The result is **strictly greater** than `from` — invariant 4 — which is what
 * makes it impossible for a task to re-select the occurrence it just fired and
 * spin.
 *
 * @param expression - A cron expression, or an already-parsed one.
 * @param from - The reference instant. Never read from the clock here.
 * @returns The next matching instant, with seconds and milliseconds zeroed.
 * @throws {TypeError} If the expression is malformed.
 * @throws {RangeError} If nothing matches within the 4-year search horizon —
 * `0 0 30 2 *` is the canonical case.
 *
 * @example
 * ```ts
 * nextRun('0 3 * * *', new Date('2026-03-01T04:00:00Z'))
 * // 2026-03-02T03:00:00Z
 * ```
 */
export function nextRun(
    expression: string | CronExpression,
    from: Date,
): Date {
    const e = typeof expression === 'string' ? parse(expression) : expression

    // Start at the next whole minute: the result must be strictly after `from`,
    // and cron has no sub-minute resolution.
    const cursor = new Date(from.getTime())
    cursor.setUTCSeconds(0, 0)
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)

    const limit = new Date(cursor.getTime())
    limit.setUTCFullYear(limit.getUTCFullYear() + HORIZON_YEARS)

    while (cursor.getTime() <= limit.getTime()) {
        // Month: skip to the first day of the next month when it does not match.
        if (!e.month.includes(cursor.getUTCMonth() + 1)) {
            cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1)
            cursor.setUTCHours(0, 0, 0, 0)
            continue
        }
        // Day: skip to midnight of the next day.
        if (!dayMatches(e, cursor)) {
            cursor.setUTCDate(cursor.getUTCDate() + 1)
            cursor.setUTCHours(0, 0, 0, 0)
            continue
        }
        // Hour: skip to the top of the next hour.
        if (!e.hour.includes(cursor.getUTCHours())) {
            cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0)
            continue
        }
        // Minute: advance one minute at a time; at most 60 iterations.
        if (!e.minute.includes(cursor.getUTCMinutes())) {
            cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0)
            continue
        }
        return cursor
    }

    throw new RangeError(
        `The cron expression ${
            typeof expression === 'string' ? `"${expression}"` : 'supplied'
        } has no occurrence within ${HORIZON_YEARS} years of ${from.toISOString()}. ` +
            `It likely describes a date that does not exist, such as 30 February.`,
    )
}
