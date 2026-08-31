/**
 * @fileoverview Turns the emitter's debug logging on, from the environment.
 *
 * **The environment is read here, not in `@lockness/events`.** That package
 * makes no `Deno.*` call at all, and core imports it on the boot path — so an
 * `env` read inside it would add `--allow-env` to every application that loads
 * the framework, for a feature that is off by default. This mirrors the
 * scheduler exactly: `@lockness/scheduler` reads no environment either, and
 * `steps/scheduler.ts` does it on its behalf.
 *
 * @module @lockness/core/kernel/bootstrap/steps/events_debug
 */

import type { BootstrapStep } from '../types.ts'
import { setEventsDebug } from '@lockness/events'

/** Values that turn debugging on. */
const ON = ['1', 'true', 'on', 'yes']
/** Values that turn it off. */
const OFF = ['0', 'false', 'off', 'no']

/**
 * Emitter debug logging.
 *
 * **Order: 10 — before anything can emit.** `events` (400) dispatches
 * `KernelBooted`, and a switch read after that would miss the boot it was
 * turned on to diagnose.
 *
 * An **allowlist**, trimmed and lowercased, that refuses what it does not
 * recognise — the same shape `SCHEDULER_ENABLED` uses, and for the same reason:
 * a denylist fails open, so `"true "` with a trailing space or a CRLF from a
 * `.env` file would read as "not off, therefore on" or as "not on, therefore
 * off" depending on which way it was written. A switch that ignores what you
 * typed is worse than none, because you believe it worked.
 *
 * The refusal is a **throw at boot**, which is where a configuration error
 * belongs. It is deliberately not raised from the emitter: `isDebugEnabled()`
 * is consulted on every dispatch, and `lifecycle_middleware.ts` emits on every
 * request, so the same throw there would turn one environment typo into a 500
 * on every request instead of one loud failure at startup.
 */
export const eventsDebugStep: BootstrapStep = {
    id: 'events_debug',
    order: 10,

    run() {
        const raw = Deno.env.get('LOCKNESS_EVENTS_DEBUG')?.trim().toLowerCase()
        if (raw === undefined || raw === '') return

        if (OFF.includes(raw)) {
            setEventsDebug(false)
            return
        }
        if (ON.includes(raw)) {
            setEventsDebug(true)
            console.log('🔎 Event emitter debug logging enabled')
            return
        }

        throw new TypeError(
            `LOCKNESS_EVENTS_DEBUG="${raw}" is not recognised. Use one of: ${
                [...ON, ...OFF].join(', ')
            }.`,
        )
    },
}
