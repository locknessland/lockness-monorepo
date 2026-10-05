/**
 * @fileoverview `make:searchable` meets the `@lockness/cli` exit contract (#436).
 *
 * search may not import `@lockness/cli` at runtime, so a rejected name throws
 * the package's local failure class, recognised by shape (`exitCode`). The
 * conformance test drives the **real** `Cli.dispatch` — `@lockness/cli` is a
 * test-only dependency, invisible to the dependency scan — so a drifted local
 * class fails here rather than exiting 0 in a user's script.
 *
 * @module @lockness/search/tests/cli_commands
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { Cli } from '@lockness/cli'
import {
    handleMakeSearchable,
    registerSearchCommands,
} from '../cli_commands.ts'

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

/** Where {@link inSandbox} puts the working directory, below its root. */
const SANDBOX_CWD = ['a', 'b', 'c']

/**
 * Run `fn` with the working directory three levels inside a fresh temp root,
 * then report every path left under that root besides the directories it
 * made. A regression that writes — even through `../../` — writes into the
 * root and shows up here, never in the checkout.
 *
 * `Deno.chdir` is process-global, so this relies on `deno test` running a
 * file's cases one after another (the default).
 */
async function inSandbox<T>(
    fn: () => Promise<T>,
): Promise<{ result: T; written: string[] }> {
    const root = await Deno.makeTempDir()
    const cwd = join(root, ...SANDBOX_CWD)
    await Deno.mkdir(cwd, { recursive: true })
    const previous = Deno.cwd()
    Deno.chdir(cwd)
    try {
        const result = await fn()
        const made = SANDBOX_CWD.map((_, i) =>
            join('', ...SANDBOX_CWD.slice(0, i + 1))
        )
        const written = (await listTree(root)).filter((p) => !made.includes(p))
        return { result, written }
    } finally {
        Deno.chdir(previous)
        await Deno.remove(root, { recursive: true })
    }
}

/** Every path under `dir`, relative to it, depth first. */
async function listTree(dir: string, prefix = ''): Promise<string[]> {
    const paths: string[] = []
    for await (const entry of Deno.readDir(join(dir, prefix))) {
        const path = prefix === '' ? entry.name : join(prefix, entry.name)
        paths.push(path)
        if (entry.isDirectory) paths.push(...await listTree(dir, path))
    }
    return paths
}

/** Assert `error` is the search package's one-line failure with exit code 1. */
function assertCommandFailure(error: Error, fragment: string): void {
    assertEquals(error.name, 'SearchCommandError')
    assertEquals((error as Error & { exitCode?: unknown }).exitCode, 1)
    assert(!error.message.includes('\n'), 'a failure message is one line')
    assert(
        error.message.includes(fragment),
        `"${error.message}" should mention "${fragment}"`,
    )
}

Deno.test('make:searchable with no name throws a failure with exitCode 1 and prints nothing', async () => {
    const { result: error, errors } = await captureErrors(() =>
        assertRejects(() => handleMakeSearchable([]), Error)
    )
    assertCommandFailure(error, 'Invalid model name')
    assertEquals(errors.length, 0, 'the dispatcher is the only printer')
})

Deno.test('make:searchable with a traversal name throws a failure with exitCode 1 and writes nothing', async () => {
    const { result: error, written } = await inSandbox(() =>
        assertRejects(() => handleMakeSearchable(['../../x']), Error)
    )
    assertCommandFailure(error, '"../../x"')
    assertEquals(written, [], 'nothing written, inside the sandbox or above it')
})

Deno.test('make:searchable through the real Cli.dispatch exits 1 with exactly one ❌ line', async () => {
    const cli = new Cli()
    registerSearchCommands(cli)
    const { result: { result: status, errors }, written } = await inSandbox(
        () => captureErrors(() => cli.dispatch(['make:searchable'])),
    )
    assertEquals(written, [])
    assertEquals(status, 1)
    assertEquals(errors.length, 1)
    const line = String(errors[0][0])
    assert(line.startsWith('❌ '), line)
    assertEquals(line.split('\n').length, 1)
    assert(line.includes('Invalid model name'), line)
})
