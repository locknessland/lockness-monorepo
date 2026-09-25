/**
 * @fileoverview Unit tests for the gate runner in `scripts/gate.ts` (#388):
 * the step list, the `--leaks` variant, argument refusal, and stop-at-first-
 * failure.
 *
 * @module
 */

import { assertEquals, assertThrows } from '@std/assert'
import { type GateStep, gateSteps, parseGateArgs, runGate } from './gate.ts'

Deno.test('the gate runs the suite last, after every static check', () => {
    assertEquals(gateSteps().map((s) => s.label), [
        'fmt --check',
        'lint',
        'check',
        'deps:analyze',
        'agents:brief --check',
        'docs:coverage',
        'publish:check',
        'test',
    ])
})

Deno.test('--leaks swaps only the suite for test:leaks', () => {
    const plain = gateSteps()
    const leaks = gateSteps({ leaks: true })
    assertEquals(leaks.slice(0, -1), plain.slice(0, -1))
    assertEquals(leaks.at(-1), {
        label: 'test:leaks',
        args: ['task', 'test:leaks'],
    })
})

Deno.test('an unknown argument is refused, not ignored', () => {
    assertEquals(parseGateArgs([]), {})
    assertEquals(parseGateArgs(['--leaks']), { leaks: true })
    assertThrows(() => parseGateArgs(['--leak']), Error, '--leak')
})

Deno.test('the gate stops at the first failing step with its code', async () => {
    const ran: string[] = []
    const outcome = await runGate(gateSteps(), (step: GateStep) => {
        ran.push(step.label)
        return Promise.resolve(step.label === 'publish:check' ? 3 : 0)
    })
    assertEquals(outcome.code, 3)
    assertEquals(outcome.failed?.label, 'publish:check')
    assertEquals(ran.at(-1), 'publish:check')
    assertEquals(ran.includes('test'), false)
})

Deno.test('the gate passes only when every step exits 0', async () => {
    const outcome = await runGate(gateSteps(), () => Promise.resolve(0))
    assertEquals(outcome, { code: 0 })
})
