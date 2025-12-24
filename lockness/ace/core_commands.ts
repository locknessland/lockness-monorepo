import type { Ace } from './ace.ts'
import { addPackage, removePackage } from './package_loader.ts'
import { registerMakeCommands } from './commands/make_commands.ts'
import { registerAuthCommands } from './commands/auth_commands.ts'
import { registerNessyCommands } from './commands/nessy_commands.ts'
import { registerRouterCommands } from './commands/router_commands.ts'
import { registerQueueCommands } from './commands/queue_commands.ts'
import { registerTinkerCommand } from './commands/tinker_command.ts'

export function registerCoreCommands(ace: Ace) {
    // Package management commands
    ace.register(
        'package:add',
        async (args: string[]) => {
            const packageName = args[0]
            if (!packageName) {
                console.error('❌ Usage: ace package:add <package-name>')
                console.log('Example: ace package:add openapi')
                return
            }
            await addPackage(packageName)
        },
        'Add a Lockness package to your project configuration'
    )

    ace.register(
        'package:install',
        async (args: string[]) => {
            const packageName = args[0]
            if (!packageName) {
                console.error('❌ Usage: ace package:install <package-name>')
                console.log('Example: ace package:install openapi')
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
                    console.log('⚠️  This package does not have an automated installer')
                    console.log('   Please refer to the package documentation for setup instructions')
                }
            } catch (error) {
                if (error instanceof Error && error.message.includes('does not provide an export')) {
                    // No install script, just add to config
                    await addPackage(packageName)
                    console.log('\n✅ Package added to configuration')
                    console.log('ℹ️  This package does not have an automated installer')
                } else {
                    console.error('❌ Installation failed:', error)
                    Deno.exit(1)
                }
            }
        },
        'Install and configure a Lockness package (runs setup automatically)'
    )

    ace.register(
        'package:remove',
        async (args: string[]) => {
            const packageName = args[0]
            if (!packageName) {
                console.error('❌ Usage: ace package:remove <package-name>')
                return
            }
            await removePackage(packageName)
        },
        'Remove a Lockness package from your project configuration'
    )

    // Register all command modules
    registerMakeCommands(ace)
    registerAuthCommands(ace)
    registerNessyCommands(ace)
    registerRouterCommands(ace)
    registerQueueCommands(ace)
    registerTinkerCommand(ace)
}
