import { Ace } from '@lockness/ace'
import { registerCoreCommands } from './lockness/ace/core_commands.ts'
import { registerDrizzleCommands } from './lockness/drizzle/ace_commands.ts'
import { registerInitCommand } from './lockness/init/init.ts'

const ace = new Ace()

// Register all available commands
registerCoreCommands(ace)
registerDrizzleCommands(ace)
registerInitCommand(ace)

if (import.meta.main) {
    await ace.run(Deno.args)
}
