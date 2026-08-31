/**
 * The task runner: timeout, retries, and containment.
 *
 * Every retry delay is injected, so nothing here waits on real elapsed time.
 * The runner never throws — a task's failure is data — so each test asserts on
 * the returned outcome and on how many times the body actually ran.
 */

import { assertEquals } from '@std/assert'
import { runTask, TaskTimeoutError } from '../task_runner.ts'
import type { SchedulerReporter, TaskFailure } from '../types.ts'

/** A reporter that records instead of printing, so tests stay quiet. */
function recorder(): SchedulerReporter & { errors: string[]; warns: string[] } {
    const errors: string[] = []
    const warns: string[] = []
    return {
        errors,
        warns,
        error: (m) => errors.push(m),
        warn: (m) => warns.push(m),
    }
}

/** No real waiting between attempts. */
const noSleep = () => Promise.resolve()

Deno.test('runTask - a successful run reports one attempt and calls onSuccess', async () => {
    let ran = 0
    let succeeded = ''
    const outcome = await runTask(
        'ok',
        () => {
            ran++
        },
        {
            onSuccess: (n) => {
                succeeded = n
            },
        },
        recorder(),
        noSleep,
    )

    assertEquals(outcome, { ok: true, attempts: 1, error: null })
    assertEquals(ran, 1)
    assertEquals(succeeded, 'ok')
})

Deno.test('runTask - retries means n ADDITIONAL attempts', async () => {
    let ran = 0
    const outcome = await runTask(
        'flaky',
        () => {
            ran++
            throw new Error('nope')
        },
        { retries: 2 },
        recorder(),
        noSleep,
    )

    assertEquals(ran, 3, 'the first attempt plus two retries')
    assertEquals(outcome.ok, false)
    assertEquals(outcome.attempts, 3)
    assertEquals(outcome.error, { name: 'Error', message: 'nope' })
})

Deno.test('runTask - a retry that succeeds stops the chain', async () => {
    let ran = 0
    const outcome = await runTask(
        'recovers',
        () => {
            ran++
            if (ran < 2) throw new Error('first attempt fails')
        },
        { retries: 5 },
        recorder(),
        noSleep,
    )

    assertEquals(ran, 2)
    assertEquals(outcome.ok, true)
    assertEquals(outcome.attempts, 2)
})

Deno.test('runTask - onError fires once per failed attempt, with the attempt number', async () => {
    const seen: TaskFailure[] = []
    await runTask(
        'failing',
        () => {
            throw new Error('boom')
        },
        {
            retries: 2,
            onError: (f) => {
                seen.push(f)
            },
        },
        recorder(),
        noSleep,
    )

    assertEquals(seen.length, 3)
    assertEquals(seen.map((f) => f.attempt), [1, 2, 3])
    assertEquals(seen[0].task, 'failing')
    assertEquals(
        new Set(seen.map((f) => f.runId)).size,
        1,
        'one run id correlates every attempt of one run',
    )
})

Deno.test('runTask - an onError that itself throws is contained', async () => {
    const rep = recorder()
    let ran = 0
    const outcome = await runTask(
        'nested',
        () => {
            ran++
            throw new Error('task failed')
        },
        {
            retries: 1,
            onError: () => {
                throw new Error('the logger is down too')
            },
        },
        rep,
        noSleep,
    )

    // The throwing callback must not abort the retry chain, and must not
    // escape — invariant 7 depends on this.
    assertEquals(ran, 2, 'the retry still happened')
    assertEquals(outcome.ok, false)
    assertEquals(
        rep.errors.some((m) => m.includes('callback onError threw')),
        true,
        'the containment is reported, not swallowed',
    )
})

Deno.test('runTask - an onSuccess that throws is contained and the run still succeeds', async () => {
    const rep = recorder()
    const outcome = await runTask(
        'ok',
        () => {},
        {
            onSuccess: () => {
                throw new Error('sink down')
            },
        },
        rep,
        noSleep,
    )

    assertEquals(outcome.ok, true)
    assertEquals(
        rep.errors.some((m) => m.includes('callback onSuccess threw')),
        true,
    )
})

Deno.test('runTask - timeout aborts the signal and fails the attempt', async () => {
    let aborted = false
    const outcome = await runTask(
        'hangs',
        (signal) => {
            signal.addEventListener('abort', () => {
                aborted = true
            })
            return new Promise(() => {}) // never resolves
        },
        { timeout: 20 },
        recorder(),
        noSleep,
    )

    assertEquals(outcome.ok, false)
    assertEquals(outcome.error?.name, 'TaskTimeoutError')
    assertEquals(aborted, true, 'the body received the abort, so it can stop')
})

Deno.test('runTask - a task that honours its signal ends promptly', async () => {
    const outcome = await runTask(
        'wellbehaved',
        (signal) =>
            new Promise((_, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason))
            }),
        { timeout: 20 },
        recorder(),
        noSleep,
    )

    assertEquals(outcome.ok, false)
    assertEquals(outcome.error?.name, 'TaskTimeoutError')
})

Deno.test('runTask - the reported line carries no raw error object', async () => {
    const rep = recorder()
    await runTask(
        'leaky',
        () => {
            const e = new Error('SELECT * FROM users WHERE email = $1')
            e.stack = 'a stack that must not be logged'
            throw e
        },
        {},
        rep,
        noSleep,
    )

    assertEquals(rep.errors.length, 1)
    assertEquals(
        rep.errors[0].includes('stack'),
        false,
        'the message names the failure, not the stack',
    )
})

Deno.test('TaskTimeoutError - names the task and the elapsed budget', () => {
    const e = new TaskTimeoutError('digest', 30_000)
    assertEquals(e.name, 'TaskTimeoutError')
    assertEquals(e.message.includes('digest'), true)
    assertEquals(e.message.includes('30000'), true)
})
