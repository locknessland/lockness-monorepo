/**
 * Tests for the 5-field cron parser.
 *
 * The parser is a pure function: it never reads the clock, so every case here
 * is a table of (expression, reference instant) -> expected next instant. All
 * times are UTC, which is the package's only supported interpretation.
 */

import { assertEquals } from '@std/assert'
import { nextRun, parse } from '../cron_parser.ts'

/** Shorthand for a UTC instant. */
function t(iso: string): Date {
    return new Date(iso)
}

Deno.test('parse - splits the five fields', () => {
    const e = parse('5 4 1 1 0')
    assertEquals(e.minute, [5])
    assertEquals(e.hour, [4])
    assertEquals(e.dayOfMonth, [1])
    assertEquals(e.month, [1])
    assertEquals(e.dayOfWeek, [0])
})

Deno.test('parse - a wildcard expands to the whole range', () => {
    const e = parse('* * * * *')
    assertEquals(e.minute.length, 60)
    assertEquals(e.hour.length, 24)
    assertEquals(e.dayOfMonth.length, 31)
    assertEquals(e.month.length, 12)
    assertEquals(e.dayOfWeek.length, 7)
})

Deno.test('parse - ranges, lists and steps', () => {
    assertEquals(parse('1-5 * * * *').minute, [1, 2, 3, 4, 5])
    assertEquals(parse('1,3,5 * * * *').minute, [1, 3, 5])
    assertEquals(parse('*/15 * * * *').minute, [0, 15, 30, 45])
    assertEquals(parse('10-20/5 * * * *').minute, [10, 15, 20])
    assertEquals(parse('5,1,3 * * * *').minute, [1, 3, 5], 'sorted and deduped')
    assertEquals(parse('1,1,2 * * * *').minute, [1, 2])
})

Deno.test('nextRun - every minute', () => {
    assertEquals(
        nextRun('* * * * *', t('2026-03-01T10:00:30Z')),
        t('2026-03-01T10:01:00Z'),
    )
})

Deno.test('nextRun - is strictly greater than the reference, even on an exact match', () => {
    // Invariant 4: a schedule can never re-select the instant it just fired.
    const ref = t('2026-03-01T10:00:00Z')
    assertEquals(nextRun('* * * * *', ref), t('2026-03-01T10:01:00Z'))
    assertEquals(nextRun('0 10 * * *', ref), t('2026-03-02T10:00:00Z'))
})

Deno.test('nextRun - daily at 03:00 UTC', () => {
    assertEquals(
        nextRun('0 3 * * *', t('2026-03-01T04:00:00Z')),
        t('2026-03-02T03:00:00Z'),
    )
    assertEquals(
        nextRun('0 3 * * *', t('2026-03-01T02:59:59Z')),
        t('2026-03-01T03:00:00Z'),
    )
})

Deno.test('nextRun - rolls over month and year boundaries', () => {
    assertEquals(
        nextRun('0 0 1 * *', t('2026-12-15T00:00:00Z')),
        t('2027-01-01T00:00:00Z'),
    )
    assertEquals(
        nextRun('59 23 31 12 *', t('2026-01-01T00:00:00Z')),
        t('2026-12-31T23:59:00Z'),
    )
})

Deno.test('nextRun - respects month length', () => {
    // 31 April does not exist; the next 31st is in May.
    assertEquals(
        nextRun('0 0 31 * *', t('2026-04-01T00:00:00Z')),
        t('2026-05-31T00:00:00Z'),
    )
})

Deno.test('nextRun - 29 February only lands on a leap year', () => {
    // 2027, 2028: 2028 is the leap year.
    assertEquals(
        nextRun('0 0 29 2 *', t('2026-03-01T00:00:00Z')),
        t('2028-02-29T00:00:00Z'),
    )
})

Deno.test('nextRun - day-of-week selects the right weekday', () => {
    // 2026-03-01 is a Sunday. The next Monday is the 2nd.
    assertEquals(
        nextRun('0 0 * * 1', t('2026-03-01T12:00:00Z')),
        t('2026-03-02T00:00:00Z'),
    )
})

Deno.test('nextRun - dom and dow are a UNION when both are restricted', () => {
    // Standard cron semantics: with both fields restricted, a day matches if
    // EITHER matches. 2026-03-01 is a Sunday; the 2nd is a Monday.
    // "the 15th, or any Monday"
    assertEquals(
        nextRun('0 0 15 * 1', t('2026-03-01T12:00:00Z')),
        t('2026-03-02T00:00:00Z'),
        'Monday the 2nd comes before the 15th',
    )
    assertEquals(
        nextRun('0 0 15 * 1', t('2026-03-09T12:00:00Z')),
        t('2026-03-15T00:00:00Z'),
        'the 15th is a Sunday, matched by the dom half',
    )
})

Deno.test('nextRun - field boundaries', () => {
    assertEquals(
        nextRun('0 0 * * *', t('2026-06-10T23:59:59Z')),
        t('2026-06-11T00:00:00Z'),
    )
    assertEquals(
        nextRun('59 23 * * *', t('2026-06-10T23:58:00Z')),
        t('2026-06-10T23:59:00Z'),
    )
})

Deno.test('nextRun - reads UTC, not host-local time', () => {
    // If the parser used getHours() this assertion would depend on TZ.
    assertEquals(
        nextRun('0 0 * * *', t('2026-06-10T12:00:00Z')),
        t('2026-06-11T00:00:00Z'),
    )
})

Deno.test('nextRun - never returns a non-zero seconds or milliseconds value', () => {
    const r = nextRun('* * * * *', t('2026-06-10T12:34:56.789Z'))
    assertEquals(r.getUTCSeconds(), 0)
    assertEquals(r.getUTCMilliseconds(), 0)
})

// ============================================================================
// Steps on a bare single value — #130
// ============================================================================

Deno.test('parse - a step on a bare single value runs to the top of the field', () => {
    // Before #130 the step was parsed and then discarded, so this expanded to
    // [5]: one run an hour where four were asked for, and nothing said so.
    assertEquals(parse('5/15 * * * *').minute, [5, 20, 35, 50])
})

Deno.test('parse - the same rule applies to every field, not just the minute', () => {
    assertEquals(parse('* 5/6 * * *').hour, [5, 11, 17, 23])
    assertEquals(parse('0 0 10/7 * *').dayOfMonth, [10, 17, 24, 31])
    assertEquals(parse('0 0 1 3/4 *').month, [3, 7, 11])
    assertEquals(parse('0 0 * * 2/2').dayOfWeek, [2, 4, 6])
})

Deno.test('parse - a step on a single value is exactly its explicit range form', () => {
    assertEquals(parse('5/15 * * * *').minute, parse('5-59/15 * * * *').minute)
    assertEquals(parse('* 5/6 * * *').hour, parse('* 5-23/6 * * *').hour)
})

Deno.test('parse - a step still applies inside a list, per entry', () => {
    // The entry with a step extends; the bare one does not.
    assertEquals(parse('5/20,40 * * * *').minute, [5, 25, 40, 45])
})

Deno.test('parse - a value without a step is still exactly that value', () => {
    // The regression guard for the fix: extending must require a '/'.
    assertEquals(parse('5 * * * *').minute, [5])
    assertEquals(parse('5,7 * * * *').minute, [5, 7])
    assertEquals(parse('*/15 * * * *').minute, [0, 15, 30, 45])
    assertEquals(parse('10-20/5 * * * *').minute, [10, 15, 20])
})

Deno.test('parse - a step whose stride overshoots the field yields the value alone', () => {
    assertEquals(parse('50/30 * * * *').minute, [50])
})

// ============================================================================
// The search horizon and the non-leap century — #130
// ============================================================================

Deno.test('nextRun - 29 February resolves across a non-leap century', () => {
    // 2100 is divisible by 100 and not by 400, so it is a common year: the next
    // 29 February after 2096 is in 2104. A four-year horizon threw RangeError
    // here, for an expression that is perfectly satisfiable.
    assertEquals(
        nextRun('0 0 29 2 *', t('2096-03-01T00:00:00Z')),
        t('2104-02-29T00:00:00Z'),
    )
})

Deno.test('nextRun - the ordinary leap case is unaffected', () => {
    assertEquals(
        nextRun('0 0 29 2 *', t('2026-03-01T00:00:00Z')),
        t('2028-02-29T00:00:00Z'),
    )
})
