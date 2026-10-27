/**
 * @fileoverview Every package's `make:*` fails when it is given no name
 * (#436, FR-007, A3).
 *
 * The generators live in nine packages, and six of them may not import
 * `@lockness/cli`: they meet the exit contract by shape, through a local
 * failure class. This one table proves the contract holds across all of them
 * through the real `Cli.dispatch()`: a non-zero status and exactly one
 * `console.error`, the command's own `❌ <reason>` rather than the
 * dispatcher's catch-all.
 *
 * The commands are discovered by their `make:` prefix from what each
 * package registers, so a `make:*` added later is covered without touching
 * this file. The feature packages are imported for this test only: the
 * dependency policy does not see `tests/`, and the imports are declared in
 * cli's `deno.json` beside the ones `mail` and friends declared for theirs.
 *
 * @module @lockness/cli/tests/make_conformance
 */

import { assert, assertEquals } from '@std/assert'
import { Cli } from '../mod.ts'
import { registerCoreCommands } from '../core_commands.ts'
import { registerCoreCommands as registerFrameworkCommands } from '@lockness/core'
import { registerDrizzleCommands } from '@lockness/drizzle/commands'
import { registerOpenAPICommands } from '@lockness/openapi'
import { registerMailCommands } from '@lockness/mail'
import { registerFeaturesCommands } from '@lockness/features'
import { registerSearchCommands } from '@lockness/search'
import { registerNotificationCommands } from '@lockness/notification'
import { registerI18nCommands } from '@lockness/i18n'
import { captureConsole, inTempDir } from './helpers.ts'

/** Every package's command registrar, by package. */
const REGISTRARS: ReadonlyArray<
    readonly [string, (cli: Cli) => void | Promise<void>]
> = [
    ['cli', registerCoreCommands],
    ['core', registerFrameworkCommands],
    ['drizzle', (cli) => registerDrizzleCommands(cli)],
    ['openapi', registerOpenAPICommands],
    ['mail', registerMailCommands],
    ['features', registerFeaturesCommands],
    ['search', registerSearchCommands],
    ['notification', registerNotificationCommands],
    ['i18n', registerI18nCommands],
]

/**
 * The `make:*` commands that take no name: run bare, they scaffold their
 * fixed files and succeed, so they are not part of this table.
 */
const TAKES_NO_NAME: ReadonlySet<string> = new Set([
    'make:auth',
    'make:error-pages',
])

/** A `Cli` with every package's commands, and each package's command names. */
async function everyPackage(): Promise<{
    cli: Cli
    byPackage: Map<string, string[]>
}> {
    const cli = new Cli()
    const byPackage = new Map<string, string[]>()
    let current: string[] = []
    // Record each name on its way in; `registerCommand` goes through
    // `register` too, so class commands are seen as well.
    const register = cli.register.bind(cli)
    cli.register = (name, handler, description) => {
        current.push(name)
        register(name, handler, description)
    }
    for (const [pkg, registrar] of REGISTRARS) {
        current = []
        await registrar(cli)
        byPackage.set(pkg, current)
    }
    return { cli, byPackage }
}

Deno.test('every package registers its commands', async () => {
    const { byPackage } = await everyPackage()
    for (const [pkg, names] of byPackage) {
        assert(names.length > 0, `${pkg} registered no command`)
    }
    const all = [...byPackage.values()].flat()
    for (const name of TAKES_NO_NAME) {
        assert(all.includes(name), `${name} is exempt but not registered`)
    }
})

Deno.test('every make:* with no name exits non-zero, printed once', async (t) => {
    const { cli, byPackage } = await everyPackage()
    const makes = [...byPackage.values()].flat()
        .filter((name) => name.startsWith('make:'))
        .filter((name) => !TAKES_NO_NAME.has(name))
        .sort()
    // Discovery that finds too little would pass the missing rows
    // vacuously; 22 is how many take a name today.
    assert(
        makes.length >= 22,
        `only ${makes.length} make:* commands were discovered`,
    )

    for (const name of makes) {
        await t.step(name, async () => {
            const { result, error } = await inTempDir(() =>
                captureConsole(() => cli.dispatch([name]))
            )

            assert(result !== 0, `${name} exited 0`)
            assertEquals(
                error.length,
                1,
                `${name}: expected one console.error, got ${
                    JSON.stringify(error)
                }`,
            )
            // The command's own failure, not the dispatcher's catch-all
            // (`❌ <name> failed: <error>`), which means it threw something
            // other than a failure.
            const line = String(error[0][0])
            assert(line.startsWith('❌ '), `${name}: ${line}`)
            assert(!line.includes(' failed: '), `${name}: ${line}`)
        })
    }
})
