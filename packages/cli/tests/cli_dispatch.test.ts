/**
 * @fileoverview The `@lockness/cli` exit contract (#428).
 *
 * A handler reports failure by throwing; {@link Cli.dispatch} prints it once
 * and maps it to an exit status, and {@link Cli.run} hands a non-zero status to
 * `Deno.exitCode`. These tests pin every row of that contract:
 *
 * | Case                              | Exit                       | Printed                    |
 * | :-------------------------------- | :------------------------- | :------------------------- |
 * | no command                        | 0                          | the command list           |
 * | handler resolves                  | 0                          | —                          |
 * | failure-shaped throw              | its `exitCode` (1–255) / 1 | `❌ <message>`, no stack    |
 * | any other throw                   | 1                          | `❌ <name> failed:` + error |
 *
 * @module @lockness/cli/tests/cli_dispatch
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import {
    Cli,
    Command,
    type CommandContext,
    type CommandContract,
    CommandFailedError,
} from '../mod.ts'
import { isCommandFailure } from '../command_failure.ts'

// -----------------------------------------------------------------------------
// Console capture
// -----------------------------------------------------------------------------

/** Every `console.log` / `console.error` call made while `fn` ran. */
interface Captured {
    readonly log: unknown[][]
    readonly error: unknown[][]
}

/**
 * Run `fn` with `console.log` and `console.error` recorded instead of printed,
 * restoring both afterwards.
 */
async function capture<T>(
    fn: () => Promise<T>,
): Promise<{ result: T } & Captured> {
    const log: unknown[][] = []
    const error: unknown[][] = []
    const original = { log: console.log, error: console.error }
    console.log = (...args: unknown[]) => void log.push(args)
    console.error = (...args: unknown[]) => void error.push(args)
    try {
        const result = await fn()
        return { result, log, error }
    } finally {
        console.log = original.log
        console.error = original.error
    }
}

/** A `Cli` with one command, `task`, whose handler is `handler`. */
function cliWith(handler: () => Promise<void>): Cli {
    const cli = new Cli()
    cli.register('task', handler, 'A test command')
    return cli
}

/** An error from a package that cannot import `@lockness/cli`. */
class LocalFailure extends Error {
    constructor(message: string, readonly exitCode: number) {
        super(message)
        this.name = 'LocalFailure'
    }
}

// -----------------------------------------------------------------------------
// CommandFailedError
// -----------------------------------------------------------------------------

Deno.test('CommandFailedError - defaults exitCode to 1 and keeps the cause', () => {
    const cause = new Error('root')
    const error = new CommandFailedError('migration failed', { cause })
    assertEquals(error.exitCode, 1)
    assertEquals(error.message, 'migration failed')
    assertEquals(error.name, 'CommandFailedError')
    assertEquals(error.cause, cause)
    assert(error instanceof Error)
})

Deno.test('CommandFailedError - keeps an explicit exit code in range', () => {
    assertEquals(new CommandFailedError('x', { exitCode: 3 }).exitCode, 3)
})

Deno.test('isCommandFailure - recognises the shape, not the class', () => {
    assert(isCommandFailure(new CommandFailedError('x')))
    assert(isCommandFailure(new LocalFailure('x', 2)))
    assert(!isCommandFailure(new Error('x')))
    assert(!isCommandFailure({ message: 'x', exitCode: 1 }))
    assert(!isCommandFailure(Object.assign(new Error('x'), { exitCode: 1.5 })))
    assert(!isCommandFailure(Object.assign(new Error('x'), { exitCode: '1' })))
})

// -----------------------------------------------------------------------------
// Cli.dispatch — the exit table
// -----------------------------------------------------------------------------

Deno.test('dispatch - a handler that resolves exits 0 and prints no error', async () => {
    const cli = cliWith(() => Promise.resolve())
    const { result, error } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 0)
    assertEquals(error, [])
})

Deno.test('dispatch - a CommandFailedError exits 1 with one stderr line and no stack', async () => {
    const cli = cliWith(() =>
        Promise.reject(new CommandFailedError('Failed to apply migrations'))
    )
    const { result, error } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 1)
    assertEquals(error, [['❌ Failed to apply migrations']])
})

Deno.test('dispatch - an in-range exit code is kept', async () => {
    const cli = cliWith(() =>
        Promise.reject(new CommandFailedError('x', { exitCode: 3 }))
    )
    const { result } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 3)
})

for (const code of [0, 256, NaN, -1]) {
    Deno.test(`dispatch - CommandFailedError with exitCode ${code} exits 1`, async () => {
        const cli = cliWith(() =>
            Promise.reject(new CommandFailedError('x', { exitCode: code }))
        )
        const { result, error } = await capture(() => cli.dispatch(['task']))
        assertEquals(result, 1)
        assertEquals(error, [['❌ x']])
    })
}

Deno.test('dispatch - a local failure-shaped subclass keeps its exit code', async () => {
    const cli = cliWith(() => Promise.reject(new LocalFailure('mail down', 4)))
    const { result, error } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 4)
    assertEquals(error, [['❌ mail down']])
})

for (const code of [0, 256, -3]) {
    Deno.test(`dispatch - a failure-shaped error with exitCode ${code} is clamped to 1`, async () => {
        const cli = cliWith(() => Promise.reject(new LocalFailure('x', code)))
        const { result, error } = await capture(() => cli.dispatch(['task']))
        assertEquals(result, 1)
        assertEquals(error, [['❌ x']])
    })
}

Deno.test('dispatch - an unexpected Error exits 1, printed once with its stack', async () => {
    const boom = new TypeError('cannot read foo of undefined')
    const cli = cliWith(() => Promise.reject(boom))
    const { result, error } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 1)
    assertEquals(error.length, 1)
    assertEquals(error[0][0], '❌ task failed:')
    // The Error object itself is handed to console.error, which prints its
    // stack — the one case where a stack helps the reader.
    assertEquals(error[0][1], boom)
    assert(boom.stack !== undefined)
})

Deno.test('dispatch - a non-Error throw exits 1', async () => {
    const cli = cliWith(() => Promise.reject('plain string'))
    const { result, error } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 1)
    assertEquals(error, [['❌ task failed:', 'plain string']])
})

Deno.test('dispatch - no command exits 0 and lists the commands', async () => {
    const cli = cliWith(() => Promise.resolve())
    const { result, error, log } = await capture(() => cli.dispatch([]))
    assertEquals(result, 0)
    assertEquals(error, [])
    assertStringIncludes(log.flat().join('\n'), 'task')
})

Deno.test('dispatch - passes the remaining arguments to the handler', async () => {
    const cli = new Cli()
    let received: string[] = []
    cli.register('task', (args) => {
        received = args
        return Promise.resolve()
    })
    await cli.dispatch(['task', 'a', '--b'])
    assertEquals(received, ['a', '--b'])
})

Deno.test('dispatch - a class-based handle() that throws exits 1', async () => {
    @Command('explode', 'Throws from handle()')
    class ExplodeCommand implements CommandContract {
        handle(_ctx: CommandContext): Promise<void> {
            return Promise.reject(new CommandFailedError('exploded'))
        }
    }
    const cli = new Cli()
    cli.registerCommand(ExplodeCommand)
    const { result, error } = await capture(() => cli.dispatch(['explode']))
    assertEquals(result, 1)
    assertEquals(error, [['❌ exploded']])
})

// -----------------------------------------------------------------------------
// Cli.run — writes a non-zero status to Deno.exitCode, and only that
// -----------------------------------------------------------------------------

/**
 * Run `fn` with `Deno.exitCode` preset to `preset`, returning the value it
 * held afterwards and always restoring the original — a leaked non-zero value
 * would fail the whole test process.
 */
async function withExitCode(
    preset: number,
    fn: () => Promise<unknown>,
): Promise<number> {
    const original = Deno.exitCode
    Deno.exitCode = preset
    try {
        await fn()
        return Deno.exitCode
    } finally {
        Deno.exitCode = original
    }
}

Deno.test('run - a failure sets Deno.exitCode and returns the status', async () => {
    const cli = cliWith(() =>
        Promise.reject(new CommandFailedError('x', { exitCode: 2 }))
    )
    let returned = -1
    const after = await withExitCode(0, async () => {
        const { result } = await capture(() => cli.run(['task']))
        returned = result
    })
    assertEquals(after, 2)
    assertEquals(returned, 2)
})

Deno.test('run - a success leaves Deno.exitCode untouched', async () => {
    const cli = cliWith(() => Promise.resolve())
    // Preset to a non-zero value so an unconditional `Deno.exitCode = 0`
    // (overwriting another part of the process's status) is visible.
    const after = await withExitCode(7, () => capture(() => cli.run(['task'])))
    assertEquals(after, 7)
})
