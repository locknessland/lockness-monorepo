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
import { type EntryImporter, installPackage } from './package_install.ts'
import { registerMakeCommands } from './commands/make_commands.ts'
import { registerAuthCommands } from './commands/auth_commands.ts'
import { registerNessyCommands } from './commands/nessy_commands.ts'
import { registerRouterCommands } from './commands/router_commands.ts'
import { registerTinkerCommand } from './commands/tinker_command.ts'
import { registerDebugCommands } from './commands/debug_commands.ts'

/**
 * The one computed `import()` of `package:install`: a package entry the app's
 * import map resolves. `deno task publish:check` inventories it
 * (`deps.policy.jsonc` `runtimeImports`); what is done with the module is
 * `package_install.ts`'s.
 *
 * @param specifier - e.g. `@lockness/openapi/setup`.
 * @returns The module namespace.
 */
const importInstallEntry: EntryImporter = (specifier) => import(specifier)

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
            await installPackage(packageName, importInstallEntry)
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
