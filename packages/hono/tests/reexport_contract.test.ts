/**
 * @fileoverview Re-export contract test for @lockness/hono (#181).
 *
 * `@lockness/hono` is the pinned Hono re-export layer hard rule #1 depends on.
 * A Hono bump that drops, renames, or changes the kind of an export must fail
 * HERE, in CI — not later in a downstream consumer. The guard is a committed
 * baseline (`reexport_baseline.json`, name → runtime kind) diffed against the
 * live surface. A **legitimate** export change updates the baseline in the same
 * commit; that is the point — the test makes the change visible, it does not
 * freeze the surface.
 *
 * @module @lockness/hono/tests/reexport_contract
 */

import { assertEquals } from '@std/assert'
import * as live from '../mod.ts'
import baseline from './reexport_baseline.json' with { type: 'json' }

Deno.test('reexport contract - @lockness/hono surface matches the baseline', () => {
    const current: Record<string, string> = {}
    for (const name of Object.keys(live).sort()) {
        current[name] = typeof (live as Record<string, unknown>)[name]
    }
    assertEquals(
        current,
        baseline as Record<string, string>,
        'The @lockness/hono export surface drifted from the committed baseline. ' +
            'If this change is intentional, regenerate reexport_baseline.json in the same commit; ' +
            'if not, a re-export was dropped/renamed/retyped (hard rule #1).',
    )
})
