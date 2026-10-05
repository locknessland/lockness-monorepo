/**
 * @fileoverview The `./nessy` wrapper's own failures exit non-zero (#436,
 * FR-011).
 *
 * `./nessy install` and `./nessy bump` handle their arguments in the shell
 * wrapper, before `cli.ts` is reached, so the CLI exit contract does not cover
 * them. Run with no argument, each must print one `❌` line on stderr and exit
 * non-zero, as `docs/nessy.md` promises — a script running
 * `./nessy install && …` must stop.
 *
 * The POSIX wrapper is run for real. The Windows wrapper cannot run off
 * Windows, so its text is pinned: the empty-argument branch exits 1, and it
 * tests `%2`, because `%1` inside a parenthesised block is expanded before the
 * block's `SHIFT` runs.
 *
 * @module @lockness/cli/tests/nessy_stub
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { fromFileUrl, join } from '@std/path'
import { Stub } from '../stubs.ts'
import { inTempDir } from './helpers.ts'

/** The cli stubs directory, as `nessy:install` reads it. */
const STUBS_PATH = fromFileUrl(new URL('../stubs', import.meta.url))

/** Render a nessy stub exactly as `nessy:install` does. */
function renderNessy(stub: 'nessy' | 'nessy.cmd'): Promise<string> {
    return Stub.renderFrom(STUBS_PATH, 'nessy', stub, {})
}

/** Run the rendered POSIX wrapper with `args` in a temp dir. */
function runNessy(args: string[]) {
    return inTempDir(async (dir) => {
        const script = join(dir, 'nessy')
        await Deno.writeTextFile(script, await renderNessy('nessy'))
        const { code, stdout, stderr } = await new Deno.Command('sh', {
            args: [script, ...args],
            cwd: dir,
            stdout: 'piped',
            stderr: 'piped',
        }).output()
        const decoder = new TextDecoder()
        return {
            code,
            stdout: decoder.decode(stdout),
            stderr: decoder.decode(stderr),
        }
    })
}

for (const command of ['install', 'bump']) {
    Deno.test({
        name:
            `./nessy ${command} with no argument exits 1, one ❌ line on stderr`,
        ignore: Deno.build.os === 'windows',
        fn: async () => {
            const { code, stdout, stderr } = await runNessy([command])

            assertEquals(code, 1)
            assertEquals(stdout, '')
            const lines = stderr.trimEnd().split('\n')
            assertEquals(lines.length, 1, stderr)
            assert(lines[0].startsWith('❌ '), stderr)
            assertStringIncludes(lines[0], `./nessy ${command} `)
        },
    })
}

Deno.test('nessy.cmd install with no argument exits 1', async () => {
    const script = await renderNessy('nessy.cmd')
    const start = script.indexOf('IF "%COMMAND%"=="install" (')
    assert(start >= 0, 'the install branch exists')
    const branch = script.slice(start, script.indexOf('\n)', start))

    assertStringIncludes(branch, 'IF "%~2"=="" (')
    const empty = branch.slice(
        branch.indexOf('IF "%~2"=="" ('),
        branch.indexOf(') ELSE ('),
    )
    assertStringIncludes(empty, '❌ ')
    assertStringIncludes(empty, 'EXIT /B 1')
})
