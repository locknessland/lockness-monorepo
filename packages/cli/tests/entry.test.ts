/**
 * @fileoverview `runEntry` — a standalone tool's work runs under the CLI exit
 * contract (#436, plan §5 "How a standalone entry runs its work").
 *
 * In-process, on every runtime: the status, the one printed line and
 * `process.exitCode`. The subprocess rows — the real exit status, no fake
 * credential on stderr, no `error: Uncaught` — are in `entry.deno.test.ts`.
 *
 * @module @lockness/cli/tests/entry
 */

import process from 'node:process'
import { test } from 'node:test'
import { assert, assertEquals } from '@std/assert'
import { CommandFailedError } from '../command_failure.ts'
import { runEntry } from '../entry.ts'

/** `process.exitCode`, which a runtime may leave `undefined` until it is set. */
type ExitCode = typeof process.exitCode

/**
 * Run `fn` with `console.error` recorded and `process.exitCode` preset to
 * `preset`, returning what was printed and the exit code it left — always
 * restoring both, so a leaked non-zero code cannot fail the test process.
 */
async function observe<T>(
    preset: number,
    fn: () => Promise<T>,
): Promise<{ result: T; error: unknown[][]; exitCode: ExitCode }> {
    const error: unknown[][] = []
    const original = { error: console.error, exitCode: process.exitCode }
    console.error = (...args: unknown[]) => void error.push(args)
    process.exitCode = preset
    try {
        const result = await fn()
        return { result, error, exitCode: process.exitCode }
    } finally {
        console.error = original.error
        process.exitCode = original.exitCode
    }
}

test('runEntry - work that resolves returns 0 and leaves process.exitCode as it was', async () => {
    let ran = false
    const { result, error, exitCode } = await observe(
        7,
        () =>
            runEntry('tool', () => {
                ran = true
            }),
    )
    assert(ran)
    assertEquals(result, 0)
    assertEquals(error, [])
    assertEquals(exitCode, 7)
})

test('runEntry - a failure returns its status, sets process.exitCode and prints one ❌ line', async () => {
    const { result, error, exitCode } = await observe(
        0,
        () =>
            runEntry('tool', () =>
                Promise.reject(
                    new CommandFailedError('No kit named "x"', { exitCode: 2 }),
                )),
    )
    assertEquals(result, 2)
    assertEquals(exitCode, 2)
    assertEquals(error, [['❌ No kit named "x"']])
})

test('runEntry - a synchronous throw is caught too', async () => {
    const { result, error } = await observe(0, () =>
        runEntry('tool', () => {
            throw new CommandFailedError('A component name is required')
        }))
    assertEquals(result, 1)
    assertEquals(error, [['❌ A component name is required']])
})

test('runEntry - a TypeError takes the catch-all branch under the label', async () => {
    const original = process.env.LOCKNESS_CLI_RAW_ERRORS
    delete process.env.LOCKNESS_CLI_RAW_ERRORS
    try {
        const { result, error, exitCode } = await observe(
            0,
            () =>
                runEntry('tool', () => {
                    throw new TypeError('x is undefined')
                }),
        )
        assertEquals(result, 1)
        assertEquals(exitCode, 1)
        assertEquals(error.length, 1)
        const line = String(error[0][0])
        assert(
            line.startsWith(
                '❌ tool failed: TypeError: x is undefined\n    at ',
            ),
            line,
        )
    } finally {
        if (original !== undefined) {
            process.env.LOCKNESS_CLI_RAW_ERRORS = original
        }
    }
})

test('runEntry - a finally block in the work still runs on failure', async () => {
    let closed = false
    const { result } = await observe(0, () =>
        runEntry('tool', async () => {
            try {
                await Promise.reject(new CommandFailedError('write failed'))
            } finally {
                closed = true
            }
        }))
    assertEquals(result, 1)
    assert(closed)
})
