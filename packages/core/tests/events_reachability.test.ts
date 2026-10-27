/**
 * The new surface is reachable from `@lockness/core`.
 *
 * SC-005, and it is a test rather than a note because `packages/core/mod.ts`
 * re-exports a NAMED list, not `export *`. Every symbol absent from that list
 * is invisible to an application no matter what `@lockness/events` exports —
 * which is exactly how the feature would have shipped unreachable.
 */

import { assertEquals } from '@std/assert'
import * as core from '../mod.ts'

Deno.test('core re-exports everything #135 added', () => {
    const missing = [
        'EventEmitter',
        'eventStream',
        'waitForEvent',
        'createEventQueue',
        'DEFAULT_BUFFER_SIZE',
        'MAX_BUFFER_SIZE',
        'DEFAULT_OVERFLOW',
        'OVERFLOW_POLICIES',
        'setEventsDebug',
        'isDebugEnabled',
        'debugLog',
    ].filter((name) => !(name in core))

    assertEquals(missing, [], 'unreachable from @lockness/core')
})

Deno.test('core re-exports anyEvent through the emitter and the dispatcher', () => {
    const emitter = new core.EventEmitter()
    assertEquals(typeof emitter.anyEvent, 'function')
    assertEquals(typeof core.dispatcher().anyEvent, 'function')
})
