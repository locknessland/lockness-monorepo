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
import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { Cli } from '../mod.ts'
import { CommandFailedError } from '../command_failure.ts'
import { registerCoreCommands } from '../core_commands.ts'
import {
    type EntryImporter,
    installPackage,
    isMissingEntry,
    setupContext,
} from '../package_install.ts'
import { captureConsole, inTempDir } from './helpers.ts'
import { calls } from './fixtures/package_install/calls.ts'

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

// ---------------------------------------------------------------------------
// Manifest handling through the setup path (#580 coverage, moved here when
// deprecation-contracts' installer became a setup step, #592)
// ---------------------------------------------------------------------------

/** A config with a comment and a trailing comma: valid JSONC, invalid JSON. */
const COMMENTED_CONFIG = '{\n    // the app\'s own note\n    "tasks": {},\n}\n'

test('package:install - registers into a commented deno.jsonc when there is no deno.json (#580)', async () => {
    const outcome = await inTempDir(async () => {
        await Deno.writeTextFile('deno.jsonc', COMMENTED_CONFIG)
        const cli = new Cli()
        registerCoreCommands(cli)
        const { result, error } = await captureConsole(() =>
            cli.dispatch(['package:install', 'deprecation-contracts'])
        )
        const jsonc = JSON.parse(await Deno.readTextFile('deno.jsonc'))
        const json = await Deno.stat('deno.json').then(() => true, () => false)
        return { result, error, jsonc, json }
    })

    assertEquals(outcome.error, [])
    assertEquals(outcome.result, 0)
    assertEquals(outcome.jsonc.tasks, {})
    assertEquals(outcome.jsonc.lockness.packages, ['deprecation-contracts'])
    assertEquals(outcome.json, false, 'no deno.json is created')
})

test('package:install - an unparseable manifest exits 1 naming the step (#580)', async () => {
    const { result, error } = await install(
        'deprecation-contracts',
        () => Deno.writeTextFile('deno.json', '{ "tasks": }\n'),
    )

    assertEquals(result, 1)
    assertEquals(error.length, 1)
    const line = String(error[0][0])
    assert(
        line.startsWith(
            '❌ Could not add deprecation-contracts to lockness.packages',
        ),
        line,
    )
    assertStringIncludes(line, ' caused by: ')
})

test('setupContext - the manifest failure keeps the original error as cause', async () => {
    await inTempDir(async () => {
        await Deno.writeTextFile('deno.json', '{ "tasks": }\n')

        const failure = await assertRejects(
            () => setupContext().registerPackage('deprecation-contracts'),
            CommandFailedError,
            'Could not add deprecation-contracts to lockness.packages',
        )
        assertEquals(
            failure.message,
            'Could not add deprecation-contracts to lockness.packages',
        )
        assertInstanceOf(failure.cause, Error)
    })
})

// ---------------------------------------------------------------------------
// Which entry runs, and what counts as a missing one (fixtures)
// ---------------------------------------------------------------------------

const FIXTURES = new URL('./fixtures/package_install/', import.meta.url)

/**
 * Run `fn` in a fresh project (an empty `deno.json`), console captured, so a
 * fall-through to registration writes there and never into this repository.
 */
function inProject<T>(fn: () => Promise<T>): Promise<T> {
    return inTempDir(async () => {
        await Deno.writeTextFile('deno.json', '{}\n')
        return (await captureConsole(fn)).result
    })
}

/**
 * An importer serving `@lockness/<name>/<entry>` from fixture files, and
 * rejecting any other specifier the way Deno does for an absent subpath.
 */
function fixtureImporter(files: Record<string, string>): EntryImporter {
    return (specifier) => {
        const file = files[specifier]
        if (file === undefined) {
            const cut = specifier.lastIndexOf('/')
            return Promise.reject(
                new TypeError(
                    `Unknown export './${specifier.slice(cut + 1)}' for ` +
                        `'${specifier.slice(0, cut)}'.`,
                ),
            )
        }
        return import(new URL(file, FIXTURES).href)
    }
}

test('installPackage - a setup module with a broken import of its own propagates', async () => {
    const importer = fixtureImporter({
        '@lockness/fixture/setup': 'broken_setup.ts',
    })

    const error = await assertRejects(() =>
        inProject(() => installPackage('fixture', importer))
    )
    assert(!(error instanceof CommandFailedError), String(error))
    assertStringIncludes(String(error), 'missing')
})

test('installPackage - a setup entry without a named setup function is a failure', async () => {
    const importer = fixtureImporter({
        '@lockness/fixture/setup': 'default_only_setup.ts',
    })

    const failure = await assertRejects(
        () => inProject(() => installPackage('fixture', importer)),
        CommandFailedError,
    )
    assertStringIncludes(failure.message, '@lockness/fixture/setup')
    assertStringIncludes(failure.message, 'named `setup` export')
    assertStringIncludes(failure.message, 'PackageSetup')
})

test('installPackage - an install entry without a callable default is a failure', async () => {
    const importer = fixtureImporter({
        '@lockness/fixture/install': 'no_default_install.ts',
    })

    const failure = await assertRejects(
        () => inProject(() => installPackage('fixture', importer)),
        CommandFailedError,
    )
    assertStringIncludes(failure.message, '@lockness/fixture/install')
    assertStringIncludes(
        failure.message,
        'refer to the package documentation',
    )
})

test('installPackage - with both entries, only the setup runs', async () => {
    calls.length = 0
    const importer = fixtureImporter({
        '@lockness/fixture/setup': 'both_setup.ts',
        '@lockness/fixture/install': 'both_install.ts',
    })

    await inProject(() => installPackage('fixture', importer))

    assertEquals(calls, ['setup'])
})

test('isMissingEntry - only a message naming this package and this subpath', () => {
    const unknown = new TypeError(
        "Unknown export './setup' for '@lockness/cache'.",
    )
    assertEquals(isMissingEntry(unknown, '@lockness/cache', 'setup'), true)
    assertEquals(isMissingEntry(unknown, '@lockness/cache', 'install'), false)
    assertEquals(isMissingEntry(unknown, '@lockness/queue', 'setup'), false)
    const linked = new SyntaxError(
        "The requested module './empty.ts' does not provide an export named 'missing'",
    )
    assertEquals(isMissingEntry(linked, '@lockness/cache', 'setup'), false)
    assertEquals(
        isMissingEntry('Unknown export', '@lockness/cache', 'setup'),
        false,
    )
})
