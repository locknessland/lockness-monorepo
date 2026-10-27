/**
 * Presets are expression strings and nothing else.
 *
 * The point of asserting the exact string is that a preset must never grow its
 * own timing logic — if `hourly` ever stops being something `parse()` accepts,
 * there are two ways to compute a schedule and only one of them is tested.
 */

import { assertEquals } from '@std/assert'
import { nextRun, parse } from '../cron_parser.ts'
import {
    daily,
    everyFifteenMinutes,
    everyFiveMinutes,
    hourly,
    monthly,
    PRESETS,
    weekdays,
    weekends,
    weekly,
    yearly,
} from '../presets.ts'

Deno.test('presets - every one is a parseable 5-field expression', () => {
    for (const [name, expression] of Object.entries(PRESETS)) {
        parse(expression) // throws if not
        assertEquals(
            expression.trim().split(/\s+/).length,
            5,
            `${name} must be a 5-field expression`,
        )
    }
})

Deno.test('presets - the map is complete and frozen', () => {
    assertEquals(Object.keys(PRESETS).length, 12)
    assertEquals(Object.isFrozen(PRESETS), true)
})

Deno.test('presets - each resolves to the expression a reviewer would write', () => {
    assertEquals(everyFiveMinutes, '*/5 * * * *')
    assertEquals(everyFifteenMinutes, '*/15 * * * *')
    assertEquals(hourly, '0 * * * *')
    assertEquals(daily, '0 0 * * *')
    assertEquals(weekly, '0 0 * * 0')
    assertEquals(monthly, '0 0 1 * *')
    assertEquals(yearly, '0 0 1 1 *')
    assertEquals(weekdays, '0 0 * * 1-5')
    assertEquals(weekends, '0 0 * * 6,0')
})

Deno.test('presets - each produces the occurrence its name claims', () => {
    const ref = new Date('2026-03-04T10:07:00Z') // a Wednesday

    assertEquals(nextRun(hourly, ref), new Date('2026-03-04T11:00:00Z'))
    assertEquals(nextRun(daily, ref), new Date('2026-03-05T00:00:00Z'))
    assertEquals(
        nextRun(everyFiveMinutes, ref),
        new Date('2026-03-04T10:10:00Z'),
    )
    assertEquals(
        nextRun(weekly, ref),
        new Date('2026-03-08T00:00:00Z'),
        'next Sunday',
    )
    assertEquals(nextRun(monthly, ref), new Date('2026-04-01T00:00:00Z'))
    assertEquals(nextRun(yearly, ref), new Date('2027-01-01T00:00:00Z'))
    assertEquals(
        nextRun(weekdays, ref),
        new Date('2026-03-05T00:00:00Z'),
        'Thursday',
    )
    assertEquals(
        nextRun(weekends, ref),
        new Date('2026-03-07T00:00:00Z'),
        'Saturday',
    )
})
