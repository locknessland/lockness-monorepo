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
import { registerMakeCommands } from './commands/make_commands.ts'
import { registerAuthCommands } from './commands/auth_commands.ts'
import { registerNessyCommands } from './commands/nessy_commands.ts'
import { registerRouterCommands } from './commands/router_commands.ts'
import { registerQueueCommands } from './commands/queue_commands.ts'
import { registerTinkerCommand } from './commands/tinker_command.ts'

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
 * @param cli - The CLI instance to register commands on
 *
 * @example
 * ```ts
 * const cli = new Cli()
 * registerCoreCommands(cli)
 * await cli.run(Deno.args)
 * ```
 */
export async function registerCoreCommands(cli: Cli): Promise<void> {
    // Package management commands
    cli.register(
        'package:add',
        async (args: string[]) => {
            const packageName = args[0]
            if (!packageName) {
                console.error('❌ Usage: cli package:add <package-name>')
                console.log('Example: cli package:add openapi')
                return
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
                console.error('❌ Usage: cli package:install <package-name>')
                console.log('Example: cli package:install openapi')
                return
            }

            // Normalize package name
            const fullPackageName = packageName.startsWith('@lockness/')
                ? packageName
                : `@lockness/${packageName}`

            try {
                // Try to import and run the install script
                const module = await import(`${fullPackageName}/install`)
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
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes('does not provide an export')
                ) {
                    // No install script, just add to config
                    await addPackage(packageName)
                    console.log('\n✅ Package added to configuration')
                    console.log(
                        'ℹ️  This package does not have an automated installer',
                    )
                } else {
                    console.error('❌ Installation failed:', error)
                    Deno.exit(1)
                }
            }
        },
        'Install and configure a Lockness package (runs setup automatically)',
    )

    cli.register(
        'package:remove',
        async (args: string[]) => {
            const packageName = args[0]
            if (!packageName) {
                console.error('❌ Usage: cli package:remove <package-name>')
                return
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
    registerTinkerCommand(cli)

    // Binary compilation orchestration
    const { CompileCommand } = await import('./commands/compile_command.ts')
    cli.registerCommand(CompileCommand)
}
