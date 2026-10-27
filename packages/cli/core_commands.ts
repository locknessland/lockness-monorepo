/**
 * @fileoverview Core CLI commands registration.
 *
 * Registers built-in commands for package management and delegates
 * to specialized command modules for make, auth, router, queue, etc.
 *
 * @module @lockness/cli/core-commands
 */

import type { Cli } from './mod.ts'
import { addPackage, removePackage } from './package_loader.ts'
import { CommandFailedError } from './command_failure.ts'
import { registerMakeCommands } from './commands/make_commands.ts'
import { registerAuthCommands } from './commands/auth_commands.ts'
import { registerNessyCommands } from './commands/nessy_commands.ts'
import { registerRouterCommands } from './commands/router_commands.ts'
import { registerQueueCommands } from './commands/queue_commands.ts'
import { registerTinkerCommand } from './commands/tinker_command.ts'
import { registerDebugCommands } from './commands/debug_commands.ts'

/**
 * Register all core CLI commands.
 *
 * Includes package management commands and delegates to specialized modules:
 * - make:* commands (controllers, services, etc.)
 * - auth commands (make:auth)
 * - router commands (router:list)
 * - queue commands (queue:work, queue:clear)
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

            // Normalize package name
            const fullPackageName = packageName.startsWith('@lockness/')
                ? packageName
                : `@lockness/${packageName}`

            let module: { default?: unknown }
            try {
                // A package specifier the app's import map resolves, not an
                // app file, so importAppFile does not apply; publish:check
                // inventories it.
                // deno-lint-ignore lockness/app-file-specifier
                module = await import(`${fullPackageName}/install`)
            } catch (error) {
                // Only a package without an install script is expected;
                // anything else reaches the dispatcher's catch-all.
                if (
                    !(error instanceof Error &&
                        error.message.includes('does not provide an export'))
                ) {
                    throw error
                }
                await addPackage(packageName)
                console.log('\n✅ Package added to configuration')
                console.log(
                    'ℹ️  This package does not have an automated installer',
                )
                return
            }

            if (typeof module.default === 'function') {
                await module.default()
            } else {
                // Fallback: just add to config
                await addPackage(packageName)
                console.log('\n✅ Package added to configuration')
                console.log(
                    '⚠️  This package does not have an automated installer',
                )
                console.log(
                    '   Please refer to the package documentation for setup instructions',
                )
            }
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
    registerQueueCommands(cli)
    registerDebugCommands(cli)
    registerTinkerCommand(cli)
}
