import { ace } from '@lockness/ace'
import { registerCoreCommands } from '@lockness/ace/commands'
import { registerDrizzleCommands } from '@lockness/drizzle/commands'

// Register all available commands
registerCoreCommands(ace)
registerDrizzleCommands(ace)

if (import.meta.main) {
    await ace.run(Deno.args)
}
