/**
 * The health-check registry (#218) — the contract-side registration surface
 * mirrored on `registerDisposable`.
 *
 * @module @lockness/contract/tests/health
 */

import { assertEquals } from '@std/assert'
import {
    collectHealthChecks,
    deregisterHealthCheck,
    type HealthCheck,
    healthCheckCount,
    registerHealthCheck,
} from '../lifecycle/health.ts'

function drainAll(): void {
    // collectHealthChecks does not clear; a test isolates itself by
    // deregistering what it registered. This helper clears any leak.
    for (const c of collectHealthChecks()) {
        deregisterHealthCheck({ _check: c })
    }
}

const up: HealthCheck = {
    name: 'up',
    check: () => Promise.resolve({ ok: true }),
}

Deno.test('registry - starts empty and counts registrations', () => {
    drainAll()
    assertEquals(healthCheckCount(), 0)
    registerHealthCheck(up)
    assertEquals(healthCheckCount(), 1)
    drainAll()
})

Deno.test('registry - the same check object registers once (identity)', () => {
    drainAll()
    registerHealthCheck(up)
    registerHealthCheck(up)
    assertEquals(healthCheckCount(), 1)
    drainAll()
})

Deno.test('registry - deregister takes the handle, not the name', () => {
    drainAll()
    const a: HealthCheck = {
        name: 'dup',
        check: () => Promise.resolve({ ok: true }),
    }
    const b: HealthCheck = {
        name: 'dup',
        check: () => Promise.resolve({ ok: false }),
    }
    const ha = registerHealthCheck(a)
    registerHealthCheck(b)
    assertEquals(healthCheckCount(), 2, 'same name, two checks')
    deregisterHealthCheck(ha)
    // Only a's registration went; b (the colliding name) survives.
    assertEquals(collectHealthChecks(), [b])
    drainAll()
})

Deno.test('registry - collect returns a snapshot, does NOT clear (checks re-run)', () => {
    drainAll()
    registerHealthCheck(up)
    assertEquals(collectHealthChecks().length, 1)
    assertEquals(collectHealthChecks().length, 1, 'still there after a collect')
    drainAll()
})
