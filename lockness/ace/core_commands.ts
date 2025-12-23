import type { Ace } from './cli.ts'
import { registerMakeCommands } from './commands/make_commands.ts'
import { registerAuthCommands } from './commands/auth_commands.ts'
import { registerNessyCommands } from './commands/nessy_commands.ts'
import { registerRouterCommands } from './commands/router_commands.ts'
import { registerQueueCommands } from './commands/queue_commands.ts'
import { registerTinkerCommand } from './commands/tinker_command.ts'

export function registerCoreCommands(ace: Ace) {
    // Register all command modules
    registerMakeCommands(ace)
    registerAuthCommands(ace)
    registerNessyCommands(ace)
    registerRouterCommands(ace)
    registerQueueCommands(ace)
    registerTinkerCommand(ace)
}
