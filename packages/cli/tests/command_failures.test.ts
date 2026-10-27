/**
 * @fileoverview How cli's own non-`make:*` commands fail (#436, US1).
 *
 * Each command below used to print `❌` and exit 0, or call `Deno.exit(1)`
 * from inside its handler. Now each throws, so `Cli.dispatch()` prints the
 * failure once and returns a non-zero status.
 *
 * | Command           | Failure                         | Printed                                    |
 * | :---------------- | :------------------------------ | :----------------------------------------- |
 * | `package:*`       | no package name                 | `❌ Usage: …` with the example, one line    |
 * | `package:install` | the installer import fails      | the dispatcher's catch-all, no exit call    |
 * | `router:list`     | `app/controller` is unreadable  | `❌ Could not read …` + the cause, rendered |
 * | `queue:retry`     | unknown id                      | `❌ No failed job with id …`                |
 * | `nessy:install`   | no `cli.ts`, or the write fails | the reason, or the catch-all               |
 * | `nessy:install`   | `.gitignore` unreadable         | one `⚠️` warning, exit 0 (not a failure)    |
 * | `make:auth`       | one file fails to write         | `❌ 1 of 2 steps failed: …`, others written |
 *
 * @module @lockness/cli/tests/command_failures
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Cli } from '../mod.ts'
import { registerCoreCommands } from '../core_commands.ts'
import { captureConsole, inTempDir } from './helpers.ts'

/** A `Cli` with every core command registered. */
function coreCli(): Cli {
    const cli = new Cli()
    registerCoreCommands(cli)
    return cli
}

/** Dispatch `args` in a fresh temp dir, after `prepare` ran in it. */
function dispatchIn(
    args: string[],
    prepare: () => Promise<void> = () => Promise.resolve(),
) {
    return inTempDir(async () => {
        await prepare()
        return await captureConsole(() => coreCli().dispatch(args))
    })
}

/** The one line printed to stderr, asserting there is exactly one. */
function onlyErrorLine(error: unknown[][]): string {
    assertEquals(
        error.length,
        1,
        `expected one console.error, got ${error.length}`,
    )
    assertEquals(error[0].length, 1)
    return String(error[0][0])
}

Deno.test('package:* with no package name', async (t) => {
    for (
        const command of ['package:add', 'package:install', 'package:remove']
    ) {
        await t.step(
            `${command} exits 1 with the usage on one line`,
            async () => {
                const { result, error } = await dispatchIn([command])

                assertEquals(result, 1)
                const line = onlyErrorLine(error)
                assertStringIncludes(
                    line,
                    `Usage: cli ${command} <package-name>`,
                )
                assertStringIncludes(line, `cli ${command} openapi`)
                assert(!line.includes('\n'), line)
            },
        )
    }
})

Deno.test('package:install when the installer import fails exits 1, without Deno.exit', async () => {
    const { result, error } = await dispatchIn([
        'package:install',
        'definitely-not-a-lockness-package',
    ])

    assertEquals(result, 1)
    assert(
        onlyErrorLine(error).startsWith('❌ package:install failed:'),
        String(error[0][0]),
    )
})

Deno.test('router:list without app/controller exits 1, the cause rendered', async () => {
    const { result, error } = await dispatchIn(['router:list'])

    assertEquals(result, 1)
    const line = onlyErrorLine(error)
    assert(line.startsWith('❌ Could not read app/controller directory'), line)
    assertStringIncludes(line, ' caused by: ')
})

Deno.test('queue:retry with an unknown id exits 1', async () => {
    const { result, error } = await dispatchIn(['queue:retry', 'no-such-id'])

    assertEquals(result, 1)
    assertStringIncludes(
        onlyErrorLine(error),
        'No failed job with id no-such-id',
    )
})

Deno.test('nessy:install', async (t) => {
    await t.step('without cli.ts exits 1 naming the fix', async () => {
        const { result, error } = await dispatchIn(['nessy:install'])

        assertEquals(result, 1)
        const line = onlyErrorLine(error)
        assertStringIncludes(line, 'cli.ts not found in the current directory')
        assertStringIncludes(line, 'project root')
    })

    await t.step('a failed write exits 1, printed once', async () => {
        const { result, error } = await dispatchIn(
            ['nessy:install'],
            async () => {
                await Deno.writeTextFile('cli.ts', '')
                // A directory where the wrapper goes makes the write fail.
                const wrapper = Deno.build.os === 'windows'
                    ? 'nessy.cmd'
                    : 'nessy'
                await Deno.mkdir(wrapper)
            },
        )

        assertEquals(result, 1)
        assert(onlyErrorLine(error).startsWith('❌ '), String(error[0][0]))
    })

    await t.step('without .gitignore installs quietly', async () => {
        const { result, warn, error } = await dispatchIn(
            ['nessy:install'],
            () => Deno.writeTextFile('cli.ts', ''),
        )

        assertEquals(result, 0)
        assertEquals(warn.length, 0)
        assertEquals(error.length, 0)
    })

    await t.step('an unreadable .gitignore warns, still exits 0', async () => {
        const { result, warn, error } = await dispatchIn(
            ['nessy:install'],
            async () => {
                await Deno.writeTextFile('cli.ts', '')
                // A directory named .gitignore cannot be read as a file.
                await Deno.mkdir('.gitignore')
            },
        )

        assertEquals(result, 0)
        assertEquals(error.length, 0)
        assertEquals(warn.length, 1, `warnings: ${JSON.stringify(warn)}`)
        assertStringIncludes(String(warn[0][0]), '.gitignore')
    })
})

Deno.test('make:auth finishes, then fails', async (t) => {
    await t.step('a failed file leaves the others written', async () => {
        await inTempDir(async () => {
            // A directory where the provider goes makes that write fail.
            await Deno.mkdir('app/provider/user_provider.ts', {
                recursive: true,
            })

            const { result, error } = await captureConsole(() =>
                coreCli().dispatch(['make:auth'])
            )

            assertEquals(result, 1)
            assertStringIncludes(
                onlyErrorLine(error),
                '1 of 2 steps failed: UserProvider',
            )
            await Deno.stat('app/controller/auth_controller.tsx')
        })
    })

    await t.step('every file written exits 0', async () => {
        const { result, error } = await dispatchIn(['make:auth', '--social'])

        assertEquals(result, 0)
        assertEquals(error.length, 0)
    })
})
