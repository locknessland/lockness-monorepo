/**
 * @fileoverview openapi's commands report failure under the CLI exit contract
 * (#436, FR-001, FR-005, FR-010): `docs:generate` throws a failure through
 * `Cli.dispatch`, and the installer's default-exported `install()` throws,
 * never exits, finishes its steps before failing, and run as
 * `jsr:@lockness/openapi/install` exits non-zero with one `❌` line.
 *
 * @module @lockness/openapi/tests/cli_failure
 */

import { assert, assertEquals, assertMatch, assertRejects } from '@std/assert'
import { fromFileUrl, join } from '@std/path'
import { Cli } from '@lockness/cli'
import { CommandFailedError } from '@lockness/cli/command-failure'
import { registerOpenAPICommands } from '../cli_commands.ts'
import install from '../install.ts'

const INSTALLER = fromFileUrl(new URL('../install.ts', import.meta.url))

/**
 * Run `fn` inside a fresh temporary directory — prepared by `prepare` — with
 * console output recorded, then restore the cwd and the console and remove the
 * directory.
 */
async function inTempDir<T>(
    prepare: (dir: string) => Promise<void>,
    fn: (dir: string) => Promise<T>,
): Promise<{ result: T; errors: unknown[][]; logs: string[] }> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-openapi-fail-' })
    await prepare(dir)
    const errors: unknown[][] = []
    const logs: string[] = []
    const original = {
        log: console.log,
        error: console.error,
        cwd: Deno.cwd(),
    }
    console.log = (...a: unknown[]) => void logs.push(a.join(' '))
    console.error = (...a: unknown[]) => void errors.push(a)
    Deno.chdir(dir)
    try {
        const result = await fn(dir)
        return { result, errors, logs }
    } finally {
        Deno.chdir(original.cwd)
        console.log = original.log
        console.error = original.error
        await Deno.remove(dir, { recursive: true })
    }
}

/** No preparation: an empty directory, which is not a Lockness project. */
const empty = (): Promise<void> => Promise.resolve()

/** The lines of `text` that carry the failure glyph. */
function failureLines(text: string): string[] {
    return text.split('\n').filter((line) => line.includes('❌'))
}

Deno.test('docs:generate - a controller scan that throws fails through Cli.dispatch with one line and its cause', async () => {
    const { result: status, errors } = await inTempDir(empty, () => {
        const cli = new Cli()
        registerOpenAPICommands(cli)
        return cli.dispatch(['docs:generate'])
    })
    assertEquals(status, 1)
    assertEquals(errors.length, 1)
    assertMatch(
        String(errors[0][0]),
        /^❌ Could not scan the controllers caused by: NotFound/,
    )
})

Deno.test('install - outside a Lockness project throws a one-line failure without exiting', async () => {
    const { result: error, errors } = await inTempDir(
        empty,
        () => assertRejects(() => install(), CommandFailedError),
    )
    assertEquals(
        error.message,
        'app/controller directory not found. Are you in a Lockness project?',
    )
    assertEquals(error.cause, undefined)
    // Reported once, by the throw: nothing printed on the side.
    assertEquals(errors, [])
})

Deno.test('install - a failed step does not stop the next, then fails naming it', async () => {
    const { result: error, errors, logs } = await inTempDir(
        async (dir) => {
            await Deno.mkdir(join(dir, 'app', 'controller'), {
                recursive: true,
            })
            // Unparseable, so adding the package to it fails.
            await Deno.writeTextFile(join(dir, 'deno.json'), '{ not json')
        },
        async (dir) => {
            const error = await assertRejects(
                () => install(),
                CommandFailedError,
            )
            // The controller step still ran.
            const controller = join(
                dir,
                'app',
                'controller',
                'api_docs_controller.ts',
            )
            assert((await Deno.stat(controller)).isFile)
            return error
        },
    )
    assertEquals(error.message, '1 of 2 steps failed: add to deno.json')
    assert(error.cause instanceof Error)
    assertEquals(errors, [])
    assert(!logs.some((line) => line.includes('installed successfully')))
})

Deno.test('install entry (subprocess) - outside a Lockness project exits non-zero with one ❌ line and no uncaught error', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-openapi-entry-' })
    try {
        const { code, stdout, stderr } = await new Deno.Command(
            Deno.execPath(),
            {
                args: ['run', '-A', INSTALLER],
                cwd: dir,
                stdout: 'piped',
                stderr: 'piped',
            },
        ).output()
        const decoder = new TextDecoder()
        const out = decoder.decode(stdout)
        const err = decoder.decode(stderr)
        assertEquals(code, 1)
        assertEquals(failureLines(out + err), [
            '❌ app/controller directory not found. Are you in a Lockness project?',
        ])
        assert(!err.includes('error: Uncaught'), err)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
