/**
 * The rejection reporter — the thing that replaced `catch { return null }`.
 *
 * It had no tests at all: the first-warn branch, the counting, the summary and
 * the clear could each have been deleted with the suite fully green. That is the
 * same shape as the silent catch it replaced — code that runs on every forged
 * cookie and that nothing watches.
 */

import { assertEquals } from '@std/assert'
import { generateAppKey } from '../secret.ts'
import {
    lastRejection,
    open,
    pendingRejections,
    resetRejectionReporter,
} from '../drivers/cookie.ts'

const KEY = generateAppKey()

/** Capture `console.warn` for the duration of `fn`. */
async function captureWarnings(fn: () => Promise<void>): Promise<string[]> {
    const lines: string[] = []
    const warn = console.warn
    console.warn = (...a: unknown[]) => void lines.push(a.join(' '))
    try {
        await fn()
    } finally {
        console.warn = warn
    }
    return lines
}

Deno.test('reporting - the first rejection warns immediately', async () => {
    resetRejectionReporter()

    const lines = await captureWarnings(async () => {
        await open(KEY, 'not-a-lockness-cookie')
    })

    assertEquals(lines.length, 1)
    assertEquals(lines[0].includes('bad-prefix'), true)
})

Deno.test('reporting - the rejected VALUE never reaches the log', async () => {
    // The single most likely place for somebody to attach the offending cookie
    // "for debuggability". It is attacker-controlled and Hono has already
    // URL-decoded it, so CR/LF arrives raw.
    resetRejectionReporter()
    const hostile = 'PWNED\r\nFAKE LOG LINE'

    const lines = await captureWarnings(async () => {
        await open(KEY, hostile)
    })

    assertEquals(lines.join('\n').includes('PWNED'), false)
    assertEquals(lines.join('\n').includes('FAKE LOG LINE'), false)
})

Deno.test('reporting - later rejections are counted, not logged one by one', async () => {
    // The flooding vector: a line per rejection is output an attacker controls.
    resetRejectionReporter()

    const lines = await captureWarnings(async () => {
        for (let i = 0; i < 50; i++) await open(KEY, `garbage-${i}`)
    })

    assertEquals(lines.length, 1, '50 rejections produced more than one line')
})

Deno.test('reporting - every rejection class is reported distinctly', async () => {
    const cases: Array<[string, string]> = [
        ['bad-prefix', 'no-marker-at-all'],
        ['too-long', 'v1.' + 'A'.repeat(5000)],
        ['bad-base64', 'v1.@@@'],
        ['too-short', 'v1.AAAA'],
    ]

    for (const [expected, value] of cases) {
        resetRejectionReporter()
        await open(KEY, value)
        assertEquals(lastRejection(), expected, `for ${expected}`)
    }
})

Deno.test('reporting - reset clears the class, so a stale read cannot pass for a fresh one', () => {
    resetRejectionReporter()

    assertEquals(lastRejection(), undefined)
})

Deno.test('reporting - the first rejection is warned, NOT also counted', async () => {
    // It was reported twice: once on its own line, and again inside the first
    // summary's total. A count that reports one event twice is worse than no
    // count, because somebody sizes an incident from it — and the defect was
    // invisible for 60 seconds, which is why the counts needed a test seam at
    // all.
    resetRejectionReporter()

    await captureWarnings(async () => {
        await open(KEY, 'first-one')
    })

    assertEquals(pendingRejections(), {})
})

Deno.test('reporting - subsequent rejections accumulate per class', async () => {
    resetRejectionReporter()

    await captureWarnings(async () => {
        await open(KEY, 'first-one') // warned, not counted
        await open(KEY, 'second')
        await open(KEY, 'third')
        await open(KEY, 'v1.@@@')
    })

    assertEquals(pendingRejections(), { 'bad-prefix': 2, 'bad-base64': 1 })
})
