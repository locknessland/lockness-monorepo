/**
 * Every shutdown symbol must be reachable from `@lockness/core`.
 *
 * Core re-exports a NAMED list, so a symbol absent from it is unreachable by an
 * application even though the module beside it exports it happily. Delete one
 * line from `mod.ts` and the feature is gone for every consumer with the whole
 * suite still green — the failure mode `events_reachability.test.ts` guards on
 * the events side.
 */

import { assertEquals } from '@std/assert'
import * as core from '../mod.ts'
import { getDefaultSteps } from '../kernel/bootstrap/registry.ts'

const REQUIRED = [
    // Public since #136 moved it into @lockness/contract beside safeForLog: the
    // disposables drain has to render a teardown failure, and contract cannot
    // import core. It was on the internal list until then, and this guard is
    // what noticed the surface had changed — which is the point of having it.
    'renderError',
    'OnShutdown',
    'getShutdownHooks',
    'KERNEL_SHUTDOWN_HOOKS',
    'SHUTDOWN_PRIORITY',
    'DEFAULT_SHUTDOWN_DEADLINE_MS',
] as const

/**
 * Deliberately NOT on core's surface.
 *
 * Exporting `installShutdownSignals` beside `ShutdownSequence` would let a
 * consumer install a second pair of handlers over a second teardown list — two
 * deciders for one question, which is what the decision table forbids.
 */
const DELIBERATELY_INTERNAL = [
    'ShutdownSequence',
    'ShutdownRegistry',
    'installShutdownSignals',
    'exitCodeFor',
    'resolveDeadlineMs',
] as const

Deno.test('shutdown - every runtime symbol is reachable from @lockness/core', () => {
    const missing = REQUIRED.filter((name) =>
        (core as Record<string, unknown>)[name] === undefined
    )

    assertEquals(
        missing,
        [],
        'these are exported by their module but not by core',
    )
})

Deno.test("shutdown - the internal machinery stays off core's surface", () => {
    const leaked = DELIBERATELY_INTERNAL.filter((name) =>
        (core as Record<string, unknown>)[name] !== undefined
    )

    assertEquals(
        leaked,
        [],
        'exporting these lets a consumer build a second teardown list and a ' +
            'second pair of signal handlers over it — two deciders for the one ' +
            'question the decision table gives a single home',
    )
})

Deno.test('shutdown - App carries the public lifecycle surface', () => {
    const app = new core.App()

    assertEquals(typeof app.onShutdown, 'function')
    assertEquals(typeof app.shutdown, 'function')
    assertEquals(app.isShuttingDown, false)
})

Deno.test('shutdown - the bootstrap step is actually wired into the registry', () => {
    // Asserting the step's own id and order says nothing about whether any
    // application runs it. Delete one line from registry.ts and the whole
    // feature is dead in every running app, suite fully green.
    const steps = getDefaultSteps()
    const step = steps.find((s) => s.id === 'shutdown_hooks')

    assertEquals(step !== undefined, true, 'the step is registered')
    assertEquals(step?.order, 320)
})
