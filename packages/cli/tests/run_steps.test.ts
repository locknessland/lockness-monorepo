/**
 * @fileoverview `runSteps` — finish every step of a multi-step command, then
 * fail naming the steps that failed (#436, P1, FR-010).
 *
 * @module @lockness/cli/tests/run_steps
 */

import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert'
import {
    CommandFailedError,
    type CommandStep,
    runSteps,
} from '../command_failure.ts'

/** A step that records its label in `ran`, then throws `error` if given. */
function step(ran: string[], label: string, error?: unknown): CommandStep {
    return {
        label,
        run: async () => {
            await Promise.resolve()
            ran.push(label)
            if (error !== undefined) throw error
        },
    }
}

Deno.test('runSteps - resolves when every step passes, running each in order', async () => {
    const ran: string[] = []
    await runSteps([step(ran, 'model'), step(ran, 'factory')])
    assertEquals(ran, ['model', 'factory'])
})

Deno.test('runSteps - resolves for an empty list', async () => {
    await runSteps([])
})

Deno.test('runSteps - runs every step after a failure, then throws one failure naming the failed steps', async () => {
    const ran: string[] = []
    const first = new Error('repository write failed')
    const error = await assertRejects(
        () =>
            runSteps([
                step(ran, 'model'),
                step(ran, 'repository', first),
                step(ran, 'factory'),
                step(ran, 'seeder', new Error('seeder write failed')),
            ]),
        CommandFailedError,
    )
    assertEquals(ran, ['model', 'repository', 'factory', 'seeder'])
    assertEquals(error.message, '2 of 4 steps failed: repository, seeder')
    assertStrictEquals(error.cause, first)
    assertEquals(error.exitCode, 1)
})

Deno.test('runSteps - a synchronous throw is a failed step too', async () => {
    const ran: string[] = []
    const error = await assertRejects(
        () =>
            runSteps([
                {
                    label: 'binary',
                    run: () => {
                        throw new Error('copy failed')
                    },
                },
                step(ran, 'env'),
            ]),
        CommandFailedError,
    )
    assertEquals(ran, ['env'])
    assertEquals(error.message, '1 of 2 steps failed: binary')
    assertInstanceOf(error.cause, Error)
})

Deno.test('runSteps - the message never carries the cause text', async () => {
    const secret = ['fx', 'step', crypto.randomUUID().slice(0, 8)].join('')
    const error = await assertRejects(
        () => runSteps([step([], 'view', new Error(`token=${secret}`))]),
        CommandFailedError,
    )
    assert(!error.message.includes(secret), error.message)
})
