/**
 * @fileoverview Re-export contract test for @lockness/core (#181).
 *
 * `@lockness/core` is the one package a user application imports directly, so a
 * dropped/renamed/retyped export is a breaking change that must fail HERE, in
 * CI, not in a consumer app. The guard is a committed baseline
 * (`reexport_baseline.json`, name → runtime kind) diffed against the live
 * surface; a legitimate change updates the baseline in the same commit.
 *
 * @module @lockness/core/tests/reexport_contract
 */

import { assertEquals } from '@std/assert'
import * as live from '../mod.ts'
import baseline from './reexport_baseline.json' with { type: 'json' }

Deno.test('reexport contract - @lockness/core surface matches the baseline', () => {
    const current: Record<string, string> = {}
    for (const name of Object.keys(live).sort()) {
        current[name] = typeof (live as Record<string, unknown>)[name]
    }
    assertEquals(
        current,
        baseline as Record<string, string>,
        'The @lockness/core public export surface drifted from the committed baseline. ' +
            'If this change is intentional, regenerate reexport_baseline.json in the same commit; ' +
            'if not, a public export was dropped/renamed/retyped.',
    )
})

Deno.test('reexport contract - importAppFile is not on the @lockness/core surface', () => {
    assertEquals(
        'importAppFile' in live,
        false,
        'importAppFile imports any readable module with the process permissions; ' +
            'it is for Lockness packages, through @lockness/contract/app-file/internal, ' +
            'and must not reach apps through core re-exporting the contract root (#477).',
    )
})
