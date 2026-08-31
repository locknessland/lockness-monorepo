/**
 * The bootstrap step that switches emitter debugging on.
 *
 * It exists so that `@lockness/events` needs no `--allow-env`. The parsing rule
 * is an allowlist, matching `SCHEDULER_ENABLED`: a denylist fails open, and a
 * switch that ignores what you typed is worse than none because you believe it
 * worked.
 */

import { assertEquals, assertThrows } from '@std/assert'
import { isDebugEnabled, setEventsDebug } from '@lockness/events'
import { eventsDebugStep } from '../kernel/bootstrap/steps/events_debug.ts'
import type { BootstrapContext } from '../kernel/bootstrap/types.ts'

/** The step reads only the environment; the context is unused. */
const context = {} as BootstrapContext

/** Run the step with one value of the variable, then put everything back. */
function withEnv(value: string | undefined, run: () => void): void {
    const previous = Deno.env.get('LOCKNESS_EVENTS_DEBUG')
    const previousFlag = isDebugEnabled()
    if (value === undefined) Deno.env.delete('LOCKNESS_EVENTS_DEBUG')
    else Deno.env.set('LOCKNESS_EVENTS_DEBUG', value)
    try {
        run()
    } finally {
        if (previous === undefined) Deno.env.delete('LOCKNESS_EVENTS_DEBUG')
        else Deno.env.set('LOCKNESS_EVENTS_DEBUG', previous)
        setEventsDebug(previousFlag)
    }
}

Deno.test('eventsDebugStep - unset leaves the switch alone', () => {
    withEnv(undefined, () => {
        setEventsDebug(false)
        eventsDebugStep.run(context)
        assertEquals(isDebugEnabled(), false)
    })
})

Deno.test('eventsDebugStep - every ON value enables it', () => {
    for (const value of ['1', 'true', 'on', 'yes', 'TRUE', '  on  ']) {
        withEnv(value, () => {
            setEventsDebug(false)
            eventsDebugStep.run(context)
            assertEquals(isDebugEnabled(), true, `"${value}" should enable`)
        })
    }
})

Deno.test('eventsDebugStep - every OFF value disables it', () => {
    for (const value of ['0', 'false', 'off', 'no', 'FALSE', ' off ']) {
        withEnv(value, () => {
            setEventsDebug(true)
            eventsDebugStep.run(context)
            assertEquals(isDebugEnabled(), false, `"${value}" should disable`)
        })
    }
})

Deno.test('eventsDebugStep - a trailing space or a CRLF still parses', () => {
    // The shape that motivates trimming: a value copied into a .env file on
    // Windows arrives as "true\r". A denylist would read that as "not off,
    // therefore on" — right by accident here, wrong for "false\r".
    withEnv('false\r\n', () => {
        setEventsDebug(true)
        eventsDebugStep.run(context)
        assertEquals(isDebugEnabled(), false, 'a CRLF must not defeat OFF')
    })
})

Deno.test('eventsDebugStep - an unrecognised value throws AT BOOT', () => {
    // Loud, and here rather than in the emitter. `isDebugEnabled()` is
    // consulted on every dispatch and lifecycle_middleware emits on every
    // request, so the same throw inside the library would turn one environment
    // typo into a 500 on every request instead of one failure at startup.
    withEnv('verbose', () => {
        assertThrows(
            () => eventsDebugStep.run(context),
            TypeError,
            'is not recognised',
        )
    })
})

Deno.test('eventsDebugStep - runs before anything can emit', () => {
    // The events step, which dispatches KernelBooted, is order 400. A switch
    // read after that would miss the boot it was turned on to diagnose.
    assertEquals(eventsDebugStep.order, 10)
    assertEquals(eventsDebugStep.id, 'events_debug')
})
