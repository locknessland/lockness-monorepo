/**
 * @fileoverview `make:mail` meets the `@lockness/cli` exit contract (#436).
 *
 * mail may not import `@lockness/cli` at runtime, so a rejected name throws
 * the package's local failure class, recognised by shape (`exitCode`). The
 * conformance test drives the **real** `Cli.dispatch` — `@lockness/cli` is a
 * test-only dependency, invisible to the dependency scan — so a drifted local
 * class fails here rather than exiting 0 in a user's script.
 *
 * @module @lockness/mail/tests/cli_commands
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { Cli } from '@lockness/cli'
import { handleMakeMail, registerMailCommands } from '../cli_commands.ts'

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

/** Assert `error` is mail's one-line failure with exit code 1. */
function assertMailFailure(error: Error, fragment: string): void {
    assertEquals(error.name, 'MailCommandError')
    assertEquals((error as Error & { exitCode?: unknown }).exitCode, 1)
    assert(!error.message.includes('\n'), 'a failure message is one line')
    assert(
        error.message.includes(fragment),
        `"${error.message}" should mention "${fragment}"`,
    )
}

Deno.test('make:mail with no name throws a failure with exitCode 1 and prints nothing', async () => {
    const { result: error, errors } = await captureErrors(() =>
        assertRejects(() => handleMakeMail([]), Error)
    )
    assertMailFailure(error, 'Invalid mailable name')
    assertEquals(errors.length, 0, 'the dispatcher is the only printer')
})

Deno.test('make:mail with a traversal name throws a failure with exitCode 1', async () => {
    const error = await assertRejects(
        () => handleMakeMail(['../../etc/x']),
        Error,
    )
    assertMailFailure(error, '"../../etc/x"')
})

Deno.test('make:mail through the real Cli.dispatch exits 1 with exactly one ❌ line', async () => {
    const cli = new Cli()
    registerMailCommands(cli)
    const { result: status, errors } = await captureErrors(() =>
        cli.dispatch(['make:mail'])
    )
    assertEquals(status, 1)
    assertEquals(errors.length, 1)
    const line = String(errors[0][0])
    assert(line.startsWith('❌ '), line)
    assertEquals(line.split('\n').length, 1)
    assert(line.includes('Invalid mailable name'), line)
})
