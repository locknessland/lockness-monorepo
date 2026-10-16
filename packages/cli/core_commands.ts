/**
 * @fileoverview Core CLI commands registration.
 *
 * Registers built-in commands for package management and delegates
 * to specialized command modules for make, auth, router, etc. The `queue:*`
 * commands live in `@lockness/queue` (#592).
 *
 * @module @lockness/cli/core-commands
 */

import type { Cli } from './mod.ts'
import { addPackage, removePackage } from './package_loader.ts'
import { CommandFailedError } from './command_failure.ts'
import type { PackageSetup, SetupContext } from '@lockness/contract/setup'
import { registerMakeCommands } from './commands/make_commands.ts'
import { registerAuthCommands } from './commands/auth_commands.ts'
import { registerNessyCommands } from './commands/nessy_commands.ts'
import { registerRouterCommands } from './commands/router_commands.ts'
import { registerTinkerCommand } from './commands/tinker_command.ts'
import { registerDebugCommands } from './commands/debug_commands.ts'

/** The two entries `package:install` looks for, in order. */
type InstallEntry = 'setup' | 'install'

/**
 * Import one entry of a package, or `undefined` when the package has no such
 * export.
 *
 * The one computed `import()` of `package:install`; `deno task
 * publish:check` inventories it (deps.policy.jsonc `runtimeImports`). Deno
 * words a missing subpath export two ways — `Unknown export './setup' for
 * '<pkg>'` for a package's `exports` map, `does not provide an export` for a
 * module — and both mean "this package has no such step". Anything else, a
 * package that does not resolve included, propagates to the dispatcher.
 *
 * @param packageName - The full package name, `@lockness/<name>`.
 * @param entry - The subpath to import.
 * @returns The module, or `undefined` when the export does not exist.
 * @throws {Error} Any other import failure, unchanged.
 */
async function importEntry(
    packageName: string,
    entry: InstallEntry,
): Promise<Record<string, unknown> | undefined> {
    try {
        // A package specifier the app's import map resolves, not an app file,
        // so importAppFile does not apply; publish:check inventories it.
        // deno-lint-ignore lockness/app-file-specifier
        return await import(`${packageName}/${entry}`)
    } catch (error) {
        if (
            error instanceof Error &&
            (error.message.includes('Unknown export') ||
                error.message.includes('does not provide an export'))
        ) {
            return undefined
        }
        throw error
    }
}

/**
 * The context `package:install` hands a package setup: the working
 * directory, and registration through {@link addPackage}.
 *
 * Registration refuses a directory with neither `deno.json` nor
 * `deno.jsonc`, and names the step when the manifest cannot be updated —
 * the checks `@lockness/deprecation-contracts`' installer made itself
 * before the setup port (#592).
 *
 * @returns The context.
 */
function setupContext(): SetupContext {
    return {
        root: Deno.cwd(),
        async registerPackage(name: string): Promise<void> {
            const found = await Promise.all(
                ['deno.json', 'deno.jsonc'].map((path) =>
                    Deno.stat(path).then(() => true, (error) => {
                        if (error instanceof Deno.errors.NotFound) return false
                        throw error
                    })
                ),
            )
            if (!found.includes(true)) {
                throw new CommandFailedError(
                    'No deno.json or deno.jsonc found. Are you in a Lockness project?',
                )
            }
            try {
                await addPackage(name)
            } catch (error) {
                throw new CommandFailedError(
                    `Could not add ${name} to lockness.packages`,
                    { cause: error },
                )
            }
        },
    }
}

/**
 * Install a package: run its `./setup` step (a named `setup` export, typed
 * `PackageSetup`) with a {@link SetupContext}; failing that, its
 * `./install` default export; failing both, register it alone.
 *
 * @param packageName - The name the user typed, with or without the scope.
 * @returns A promise that resolves once the package is installed.
 * @throws {CommandFailedError} When the setup refuses the directory or
 *   cannot register the package.
 * @throws {Error} When the package does not resolve, or its step fails.
 */
async function installPackage(packageName: string): Promise<void> {
    const fullPackageName = packageName.startsWith('@lockness/')
        ? packageName
        : `@lockness/${packageName}`

    for (const entry of ['setup', 'install'] as const) {
        const module = await importEntry(fullPackageName, entry)
        if (module === undefined) continue
        const step = entry === 'setup' ? module.setup : module.default
        if (typeof step !== 'function') continue
        if (entry === 'setup') {
            await (step as PackageSetup)(setupContext())
        } else {
            await (step as () => Promise<void>)()
        }
        return
    }

    await addPackage(packageName)
    console.log('\n✅ Package added to configuration')
    console.log('ℹ️  This package does not have an automated installer')
}

/**
 * Register all core CLI commands.
 *
 * Includes package management commands and delegates to specialized modules:
 * - make:* commands (controllers, services, etc.)
 * - auth commands (make:auth)
 * - router commands (router:list)
 * - nessy:install command
 * - tinker REPL command
 *
 * Every handler reports a failure by throwing — a `CommandFailedError` for
 * one it can explain — and `Cli.dispatch()` prints it once and returns a
 * non-zero status (#436). None calls `Deno.exit()`.
 *
 * @param cli - The CLI instance to register commands on
 *
 * @example
 * ```ts
 * const cli = new Cli()
 * registerCoreCommands(cli)
 * await cli.run(Deno.args)
 * ```
 */
export function registerCoreCommands(cli: Cli): void {
    // Package management commands
    cli.register(
        'package:add',
        async (args: string[]) => {
            const packageName = args[0]
            if (!packageName) {
                throw new CommandFailedError(
                    'Usage: cli package:add <package-name> (e.g., cli package:add openapi)',
                )
            }
            await addPackage(packageName)
        },
        'Add a Lockness package to your project configuration',
    )

    cli.register(
        'package:install',
        async (args: string[]) => {
            const packageName = args[0]
            if (!packageName) {
                throw new CommandFailedError(
                    'Usage: cli package:install <package-name> (e.g., cli package:install openapi)',
                )
            }
            await installPackage(packageName)
        },
        'Install and configure a Lockness package (runs setup automatically)',
    )

    cli.register(
        'package:remove',
        async (args: string[]) => {
            const packageName = args[0]
            if (!packageName) {
                throw new CommandFailedError(
                    'Usage: cli package:remove <package-name> (e.g., cli package:remove openapi)',
                )
            }
            await removePackage(packageName)
        },
        'Remove a Lockness package from your project configuration',
    )

    // Register all command modules
    registerMakeCommands(cli)
    registerAuthCommands(cli)
    registerNessyCommands(cli)
    registerRouterCommands(cli)
    registerDebugCommands(cli)
    registerTinkerCommand(cli)
}
