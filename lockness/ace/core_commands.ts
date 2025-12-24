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
