/**
 * @fileoverview Core's local failure class meets the `@lockness/cli` exit
 * contract (#436, T012).
 *
 * Core may not import `@lockness/cli` at runtime (`deps.policy.jsonc`), so its
 * commands report failure with a local class that matches the contract by
 * shape: an `Error` with an integer `exitCode`. Recognition is by shape, never
 * by class, so a test that only checks the shape could pass while the real
 * dispatcher reads it differently. This one goes through the real
 * `Cli.dispatch` — `@lockness/cli` is declared in core's `deno.json` for tests
 * only, and the dependency scan skips `tests/`.
 *
 * @module @lockness/core/tests/command_failure
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Cli } from '@lockness/cli'
import { CoreCommandFailure } from '../cli/command_failure.ts'

/**
 * Run `fn` with `console.error` recorded instead of printed, restoring it
 * afterwards.
 */
async function captureErrors<T>(
    fn: () => Promise<T>,
): Promise<{ result: T; error: unknown[][] }> {
    const error: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => void error.push(args)
    try {
        return { result: await fn(), error }
    } finally {
        console.error = original
    }
}

/** A `Cli` whose one command, `task`, throws `failure`. */
function cliThrowing(failure: Error): Cli {
    const cli = new Cli()
    cli.register('task', () => Promise.reject(failure), 'A test command')
    return cli
}

Deno.test('CoreCommandFailure - has the contract shape, its own name and Error options', () => {
    const cause = new Error('root')
    const failure = new CoreCommandFailure('compile failed', { cause })
    assert(failure instanceof Error)
    assertEquals(failure.exitCode, 1)
    assertEquals(failure.name, 'CoreCommandFailure')
    assertEquals(failure.message, 'compile failed')
    assertEquals(failure.cause, cause)
})

Deno.test('CoreCommandFailure - Cli.dispatch exits 1 with one ❌ line and no stack', async () => {
    const cli = cliThrowing(new CoreCommandFailure('No kernel found'))
    const { result, error } = await captureErrors(() => cli.dispatch(['task']))
    assertEquals(result, 1)
    assertEquals(error.length, 1)
    assertEquals(error[0], ['❌ No kernel found'])
})

Deno.test('CoreCommandFailure - Cli.dispatch prints the cause rendered, on the same line', async () => {
    const cli = cliThrowing(
        new CoreCommandFailure('Failed to generate routes', {
            cause: new Error('bad controller'),
        }),
    )
    const { result, error } = await captureErrors(() => cli.dispatch(['task']))
    assertEquals(result, 1)
    assertEquals(error.length, 1)
    const line = String(error[0][0])
    assert(line.startsWith('❌ Failed to generate routes caused by: '))
    assertStringIncludes(line, 'bad controller')
    assert(!line.includes('\n'), 'a failure prints one line')
})
