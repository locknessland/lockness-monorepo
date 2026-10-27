/**
 * Tests for the `debug:event-dispatcher` command (#90).
 *
 * `collectListeners` is exercised against a fixture `app/listener`-shaped dir
 * (nested subdir A2, symbol-method A6, throwing constructor A1); `filterRows`
 * and `formatGrouped` are pure units.
 *
 * @module @lockness/cli/tests/debug_commands
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { fromFileUrl } from '@std/path'
import {
    collectListeners,
    filterRows,
    formatGrouped,
    type ListenerRow,
    runDebugEventDispatcher,
} from '../commands/debug_commands.ts'

/**
 * Capture everything `console.log` and `console.warn` print while `fn` runs.
 *
 * One combined helper (rather than a `captureLog` plus a near-identical
 * `captureWarn`) so the two never drift — `collectListeners` warns on the
 * import-failure path and logs on the empty/events-absent paths, and a single
 * test may need to assert on both.
 */
async function capture(
    fn: () => Promise<void>,
): Promise<{ log: string; warn: string }> {
    const logs: string[] = []
    const warns: string[] = []
    const originalLog = console.log
    const originalWarn = console.warn
    console.log = (...a: unknown[]) => void logs.push(a.join(' '))
    console.warn = (...a: unknown[]) => void warns.push(a.join(' '))
    try {
        await fn()
    } finally {
        console.log = originalLog
        console.warn = originalWarn
    }
    return { log: logs.join('\n'), warn: warns.join('\n') }
}

const FIXTURES = fromFileUrl(
    new URL('./fixtures/listeners', import.meta.url),
)

/** A dir with one valid listener and one module that throws at import time. */
const BROKEN_IMPORT = fromFileUrl(
    new URL('./fixtures/broken-import', import.meta.url),
)

// --- collectListeners (integration over fixtures) -------------------------

Deno.test('collectListeners - finds top-level and nested listeners (A2)', async () => {
    const rows = await collectListeners(FIXTURES)
    const byClass = (c: string) => rows.filter((r) => r.listenerClass === c)

    // Top-level, with explicit priority.
    const alpha = byClass('AlphaListener')
    assertEquals(alpha.length, 1)
    assertEquals(alpha[0].eventName, 'AlphaEvent')
    assertEquals(alpha[0].methodName, 'onAlpha')
    assertEquals(alpha[0].priority, 10)

    // Nested subdirectory — only a recursive walk finds it.
    const beta = byClass('BetaListener')
    assertEquals(beta.length, 1, 'nested listener found (recursive walk)')
    assertEquals(beta[0].eventName, 'BetaEvent')
    assertEquals(beta[0].priority, 0, 'default priority')
})

Deno.test('collectListeners - symbol method name is coerced to string (A6)', async () => {
    const rows = await collectListeners(FIXTURES)
    const sym = rows.find((r) => r.listenerClass === 'SymbolListener')
    assert(sym, 'symbol-method listener found')
    assertEquals(typeof sym!.methodName, 'string')
    assertStringIncludes(sym!.methodName, 'symHandle')
})

Deno.test('collectListeners - a throwing constructor is NOT dropped (A1)', async () => {
    // BadListener's @Listener initializer runs during construction, before the
    // constructor body throws — so reading metadata OUTSIDE the try/catch still
    // captures it. The listing resolves and BadListener still appears.
    const rows = await collectListeners(FIXTURES)
    assert(rows.some((r) => r.listenerClass === 'AlphaListener'))
    assert(rows.some((r) => r.listenerClass === 'BetaListener'))
    assert(
        rows.some((r) =>
            r.listenerClass === 'BadListener' && r.eventName === 'AlphaEvent'
        ),
        'a listener whose constructor throws is still listed (A1)',
    )
})

Deno.test('collectListeners - is idempotent across repeated calls (dedup)', async () => {
    // Metadata accumulates on the cached class each construction; dedup keeps the
    // count stable no matter how many times the command runs in one process.
    await collectListeners(FIXTURES)
    const rows = await collectListeners(FIXTURES)
    assertEquals(
        rows.filter((r) => r.listenerClass === 'AlphaListener').length,
        1,
        'no duplicate rows on a second run',
    )
})

Deno.test('collectListeners - absent directory yields no rows, no throw', async () => {
    const rows = await collectListeners(`${FIXTURES}/does-not-exist`)
    assertEquals(rows, [])
})

Deno.test('collectListeners - a file that fails to import warns and is skipped; the rest are still listed (#150, US1)', async () => {
    // Home of the rule (plan §5 row 1): the per-file try/catch in
    // collectListeners.walk. `throws_on_import.ts` rejects at import() → warn +
    // continue; `ok_listener.ts` must still come through.
    let rows: ListenerRow[] = []
    const { warn } = await capture(async () => {
        rows = await collectListeners(BROKEN_IMPORT)
    })
    // Substring only (never the full line) so the test is not a second home
    // for the warning string.
    assertStringIncludes(warn, 'Could not import')
    assertStringIncludes(warn, 'throws_on_import.ts')
    assert(
        rows.some((r) => r.listenerClass === 'OkListener'),
        'the valid listener is still listed despite a sibling import failure',
    )
})

Deno.test('collectListeners - @lockness/events absent → info line and no rows, no throw (#150, US2)', async () => {
    // Home of the rule (plan §5 row 2): the top-level try/catch in
    // collectListeners. The injected loadEvents rejects, standing in for the
    // package being unavailable — the only way to reach this branch, since the
    // import map keeps @lockness/events resolvable in the suite.
    let rows: ListenerRow[] = []
    const { log } = await capture(async () => {
        rows = await collectListeners(
            FIXTURES,
            () => Promise.reject(new Error('events package absent')),
        )
    })
    assertStringIncludes(log, '@lockness/events is not available')
    assertEquals(rows, [], 'no rows when the events package cannot be loaded')
})

// --- filterRows (unit) ----------------------------------------------------

const sample: ListenerRow[] = [
    {
        eventName: 'KernelBooted',
        listenerClass: 'AppListener',
        methodName: 'onBoot',
        priority: 100,
    },
    {
        eventName: 'RequestDone',
        listenerClass: 'MetricsListener',
        methodName: 'track',
        priority: 0,
    },
]

Deno.test('filterRows - substring match on event or class, case-insensitive', () => {
    assertEquals(filterRows(sample, 'kernel').length, 1)
    assertEquals(
        filterRows(sample, 'metrics')[0].listenerClass,
        'MetricsListener',
    )
    assertEquals(
        filterRows(sample, 'LISTENER').length,
        2,
        'matches both classes',
    )
    assertEquals(filterRows(sample, '').length, 2, 'empty term returns all')
    assertEquals(filterRows(sample, 'nope').length, 0)
})

// --- formatGrouped (unit) -------------------------------------------------

Deno.test('formatGrouped - groups by event with count, priority-sorted, singular/plural', () => {
    const rows: ListenerRow[] = [
        { eventName: 'E', listenerClass: 'A', methodName: 'a', priority: 0 },
        { eventName: 'E', listenerClass: 'B', methodName: 'b', priority: 50 },
        { eventName: 'F', listenerClass: 'C', methodName: 'c', priority: 0 },
    ]
    const out = formatGrouped(rows)
    assertStringIncludes(out, 'Event: E (2 listeners)')
    assertStringIncludes(out, 'Event: F (1 listener)')
    // Priority sort: B (50) before A (0) within E.
    assert(out.indexOf('B@b') < out.indexOf('A@a'), 'higher priority first')
    assertStringIncludes(out, '- B@b (priority: 50)')
})

// --- runDebugEventDispatcher (handler) ------------------------------------

Deno.test('handler - grouped output over a fixture dir (US1)', async () => {
    const { log: out } = await capture(() =>
        runDebugEventDispatcher([], FIXTURES)
    )
    assertStringIncludes(out, 'Event: AlphaEvent')
    assertStringIncludes(out, 'AlphaListener@onAlpha (priority: 10)')
    assertStringIncludes(out, 'Event: BetaEvent')
})

Deno.test('handler - no listeners → friendly message, no throw (SC-003)', async () => {
    const { log: out } = await capture(() =>
        runDebugEventDispatcher([], `${FIXTURES}/does-not-exist`)
    )
    assertStringIncludes(out, 'No event listeners found')
})

Deno.test('handler - no match → friendly message (US2)', async () => {
    const { log: out } = await capture(() =>
        runDebugEventDispatcher(['zzz-no-such-listener'], FIXTURES)
    )
    assertStringIncludes(out, 'No listeners match')
})

Deno.test('handler - --dispatcher flag is accepted and ignored for filtering (FR-004)', async () => {
    const { log: out } = await capture(() =>
        runDebugEventDispatcher(['--dispatcher=global'], FIXTURES)
    )
    // The flag is not treated as a filter term, so the full list still prints.
    assertStringIncludes(out, 'Event: AlphaEvent')
    assertStringIncludes(out, 'Event: BetaEvent')
})
