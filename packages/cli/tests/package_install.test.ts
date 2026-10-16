/**
 * @fileoverview `package:install` runs a package's setup step (#592).
 *
 * The command tries `<package>/setup` first — a named `setup` export, typed
 * `PackageSetup`, called with a `SetupContext` the command builds — then
 * falls back to `<package>/install`'s default export, then to registering
 * the package alone. Each path runs through the real `Cli.dispatch` in a
 * fresh directory:
 *
 * | package                 | path taken                              |
 * | ----------------------- | --------------------------------------- |
 * | `deprecation-contracts` | `./setup` with a `SetupContext`         |
 * | `openapi`               | `./install` default export (fallback)   |
 * | `cache`                 | neither export: registered, exit 0      |
 *
 * @module @lockness/cli/tests/package_install
 */

import { test } from 'node:test'
import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Cli } from '../mod.ts'
import { registerCoreCommands } from '../core_commands.ts'
import { captureConsole, inTempDir } from './helpers.ts'

/** Dispatch `package:install <name>` in a fresh directory prepared by `prepare`. */
function install(
    name: string,
    prepare: () => Promise<void>,
) {
    return inTempDir(async () => {
        await prepare()
        const cli = new Cli()
        registerCoreCommands(cli)
        const captured = await captureConsole(() =>
            cli.dispatch(['package:install', name])
        )
        const config = await Deno.readTextFile('deno.json').catch(() => '')
        const env = await Deno.readTextFile('.env').catch(() => '')
        const docsController = await Deno.stat(
            'app/controller/api_docs_controller.ts',
        ).then(() => true, () => false)
        return { ...captured, config, env, docsController }
    })
}

/** The `lockness.packages` a `deno.json` text lists. */
function registered(config: string): string[] {
    return JSON.parse(config).lockness?.packages ?? []
}

test('package:install - runs the package setup with a SetupContext', async () => {
    const { result, error, config, env } = await install(
        'deprecation-contracts',
        async () => {
            await Deno.writeTextFile('deno.json', '{}\n')
            await Deno.writeTextFile('.env', 'APP_NAME=demo\n')
        },
    )

    assertEquals(error, [])
    assertEquals(result, 0)
    assertEquals(registered(config), ['deprecation-contracts'])
    assertStringIncludes(env, 'STRICT_DEPRECATIONS=false')
})

test('package:install - a setup outside a project exits 1 with one ❌ line', async () => {
    const { result, error, env } = await install(
        'deprecation-contracts',
        () => Deno.writeTextFile('.env', 'APP_NAME=demo\n'),
    )

    assertEquals(result, 1)
    assertEquals(error.length, 1)
    assertEquals(
        String(error[0][0]),
        '❌ No deno.json or deno.jsonc found. Are you in a Lockness project?',
    )
    assertEquals(env, 'APP_NAME=demo\n')
})

test('package:install - falls back to the /install default export', async () => {
    const { result, error, config, docsController } = await install(
        'openapi',
        async () => {
            await Deno.writeTextFile('deno.json', '{}\n')
            await Deno.mkdir('app/controller', { recursive: true })
        },
    )

    assertEquals(error, [])
    assertEquals(result, 0)
    assertEquals(registered(config), ['openapi'])
    assert(docsController, 'the openapi installer ran')
})

test('package:install - a package with neither entry is registered, exit 0', async () => {
    const { result, error, log, config } = await install(
        'cache',
        () => Deno.writeTextFile('deno.json', '{}\n'),
    )

    assertEquals(error, [])
    assertEquals(result, 0)
    assertEquals(registered(config), ['cache'])
    assertStringIncludes(
        log.map((line) => line.join(' ')).join('\n'),
        'does not have an automated installer',
    )
})
