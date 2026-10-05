/**
 * @fileoverview The `@lockness/deprecation-contracts/install` installer
 * (#436): its work is the default-exported `install()`, which throws and never
 * touches process state, run through `runEntry` when executed directly.
 *
 * In-process cases change the working directory for the duration of one
 * case and restore it; the subprocess case observes the real exit status and
 * stderr.
 *
 * @module @lockness/deprecation-contracts/tests/install
 */

import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { join } from '@std/path'
import { CommandFailedError } from '@lockness/cli/command-failure'
import install from '../install.ts'

/**
 * Run `fn` inside a fresh temporary directory with `console.log` silenced,
 * restoring the working directory, `console.log` and `Deno.exitCode` after —
 * and returning the exit code `fn` left, so a case can assert it was not
 * touched.
 */
async function inProject(
    fn: (dir: string) => Promise<void>,
): Promise<number> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_dc_install_' })
    const original = {
        cwd: Deno.cwd(),
        log: console.log,
        exitCode: Deno.exitCode,
    }
    console.log = () => {}
    Deno.exitCode = 0
    Deno.chdir(dir)
    try {
        await fn(dir)
        return Deno.exitCode
    } finally {
        Deno.chdir(original.cwd)
        console.log = original.log
        Deno.exitCode = original.exitCode
        await Deno.remove(dir, { recursive: true })
    }
}

Deno.test('install - outside a project it throws a one-line failure and leaves the exit code alone', async () => {
    const exitCode = await inProject(async () => {
        const failure = await assertRejects(
            () => install(),
            CommandFailedError,
            'deno.json not found. Are you in a Lockness project?',
        )
        assertEquals(failure.exitCode, 1)
    })
    assertEquals(exitCode, 0)
})

Deno.test('install - a deno.json it cannot update fails with the parse error as cause', async () => {
    await inProject(async (dir) => {
        await Deno.writeTextFile(
            join(dir, 'deno.json'),
            '{\n    // a comment JSON.parse rejects\n}\n',
        )

        const failure = await assertRejects(() => install(), CommandFailedError)
        assertEquals(
            failure.message,
            'Could not add deprecation-contracts to lockness.packages in deno.json',
        )
        assertInstanceOf(failure.cause, SyntaxError)
    })
})

Deno.test('install - an unreadable .env is not skipped silently', async () => {
    await inProject(async (dir) => {
        await Deno.writeTextFile(join(dir, 'deno.json'), '{}\n')
        await Deno.mkdir(join(dir, '.env'))

        const thrown = await assertRejects(() => install())
        assert(!(thrown instanceof Deno.errors.NotFound), String(thrown))
    })
})

Deno.test('install - registers the package and adds the env configuration', async () => {
    await inProject(async (dir) => {
        await Deno.writeTextFile(join(dir, 'deno.json'), '{}\n')
        await Deno.writeTextFile(join(dir, '.env'), 'APP_NAME=demo\n')

        await install()

        const config = JSON.parse(
            await Deno.readTextFile(join(dir, 'deno.json')),
        )
        assertEquals(config.lockness.packages, ['deprecation-contracts'])
        assertStringIncludes(
            await Deno.readTextFile(join(dir, '.env')),
            'STRICT_DEPRECATIONS=false',
        )
    })
})

Deno.test('install - run as a subprocess outside a project, it exits non-zero with one ❌ line', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_dc_install_' })
    try {
        const entry = new URL('../install.ts', import.meta.url)
        const { code, stdout, stderr } = await new Deno.Command(
            Deno.execPath(),
            {
                args: ['run', '-A', entry.href],
                cwd: dir,
                env: { NO_COLOR: '1' },
                stdout: 'piped',
                stderr: 'piped',
            },
        ).output()
        const out = new TextDecoder().decode(stdout) +
            new TextDecoder().decode(stderr)

        assert(code !== 0, out)
        assertEquals(out.split('❌').length - 1, 1, out)
        assert(!out.includes('error: Uncaught'), out)
        assertStringIncludes(
            out,
            '❌ deno.json not found. Are you in a Lockness project?',
        )
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
