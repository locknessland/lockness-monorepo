/**
 * @fileoverview `make:flag` meets the `@lockness/cli` exit contract (#436).
 *
 * features may not import `@lockness/cli` at runtime, so a rejected name throws
 * the package's local failure class, recognised by shape (`exitCode`). The
 * conformance test drives the **real** `Cli.dispatch` — `@lockness/cli` is a
 * test-only dependency, invisible to the dependency scan — so a drifted local
 * class fails here rather than exiting 0 in a user's script.
 *
 * @module @lockness/features/tests/cli_commands
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { Cli } from '@lockness/cli'
import { handleMakeFlag, registerFeaturesCommands } from '../cli_commands.ts'

/** Run `fn` with `console.error` recorded instead of printed. */
async function captureErrors<T>(
    fn: () => Promise<T>,
): Promise<{ result: T; errors: unknown[][] }> {
    const errors: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => void errors.push(args)
    try {
        return { result: await fn(), errors }
    } finally {
        console.error = original
    }
}

/** Assert `error` is the features package's one-line failure with exit code 1. */
function assertCommandFailure(error: Error, fragment: string): void {
    assertEquals(error.name, 'FeaturesCommandError')
    assertEquals((error as Error & { exitCode?: unknown }).exitCode, 1)
    assert(!error.message.includes('\n'), 'a failure message is one line')
    assert(
        error.message.includes(fragment),
        `"${error.message}" should mention "${fragment}"`,
    )
}

Deno.test('make:flag with no name throws a failure with exitCode 1 and prints nothing', async () => {
    const { result: error, errors } = await captureErrors(() =>
        assertRejects(() => handleMakeFlag([]), Error)
    )
    assertCommandFailure(error, 'Invalid flag name')
    assertEquals(errors.length, 0, 'the dispatcher is the only printer')
})

Deno.test('make:flag with a traversal name throws a failure with exitCode 1', async () => {
    const error = await assertRejects(
        () => handleMakeFlag(['../../etc/x']),
        Error,
    )
    assertCommandFailure(error, '"../../etc/x"')
})

Deno.test('make:flag through the real Cli.dispatch exits 1 with exactly one ❌ line', async () => {
    const cli = new Cli()
    registerFeaturesCommands(cli)
    const { result: status, errors } = await captureErrors(() =>
        cli.dispatch(['make:flag'])
    )
    assertEquals(status, 1)
    assertEquals(errors.length, 1)
    const line = String(errors[0][0])
    assert(line.startsWith('❌ '), line)
    assertEquals(line.split('\n').length, 1)
    assert(line.includes('Invalid flag name'), line)
})
