/**
 * The parser rejects rather than defaults.
 *
 * A silently defaulted expression leaves a task running on a cadence its author
 * did not write, and nothing says so — which is strictly worse than a boot that
 * fails loudly.
 */

import { assertThrows } from '@std/assert'
import { nextRun, parse } from '../cron_parser.ts'

Deno.test('parse - rejects the wrong number of fields', () => {
    for (const bad of ['', '*', '* *', '* * *', '* * * *', '* * * * * *']) {
        assertThrows(
            () => parse(bad),
            TypeError,
            undefined,
            `expected ${JSON.stringify(bad)} to be rejected`,
        )
    }
})

Deno.test('parse - names the offending field and token', () => {
    const err = assertThrows(() => parse('* 99 * * *')) as Error
    if (!err.message.includes('hour')) {
        throw new Error(`message must name the field, got: ${err.message}`)
    }
    if (!err.message.includes('99')) {
        throw new Error(`message must name the token, got: ${err.message}`)
    }
})

Deno.test('parse - rejects out-of-range values in every field', () => {
    for (
        const bad of [
            '60 * * * *',
            '* 24 * * *',
            '* * 0 * *',
            '* * 32 * *',
            '* * * 0 *',
            '* * * 13 *',
            '* * * * 7',
        ]
    ) {
        assertThrows(
            () => parse(bad),
            TypeError,
            undefined,
            `expected ${bad} rejected`,
        )
    }
})

Deno.test('parse - rejects a zero or negative step', () => {
    assertThrows(() => parse('*/0 * * * *'), TypeError)
    assertThrows(() => parse('*/-1 * * * *'), TypeError)
})

Deno.test('parse - rejects an inverted range', () => {
    assertThrows(() => parse('5-1 * * * *'), TypeError)
})

Deno.test('parse - rejects month and day aliases, which are out of scope', () => {
    // Explicitly rejected rather than silently mis-parsed as 0.
    assertThrows(() => parse('0 0 * JAN *'), TypeError)
    assertThrows(() => parse('0 0 * * MON'), TypeError)
})

Deno.test('parse - rejects junk tokens', () => {
    for (const bad of ['a * * * *', '* * * * ?', '1..5 * * * *', '- * * * *']) {
        assertThrows(
            () => parse(bad),
            TypeError,
            undefined,
            `expected ${bad} rejected`,
        )
    }
})

Deno.test('nextRun - an expression that never matches throws instead of looping', () => {
    // 30 February. The search must terminate against its bounded horizon.
    assertThrows(
        () => nextRun('0 0 30 2 *', new Date('2026-01-01T00:00:00Z')),
        RangeError,
    )
})
