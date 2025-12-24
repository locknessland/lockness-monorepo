import { Ace } from '@lockness/ace'
import { registerCoreCommands } from './lockness/ace/core_commands.ts'
import { registerDrizzleCommands } from './lockness/drizzle/ace_commands.ts'
import { registerInitCommand } from './lockness/init/init.ts'
import { registerOpenAPICommands } from './lockness/openapi/ace_commands.ts'

const ace = new Ace()

// Register all available commands
registerCoreCommands(ace)
registerDrizzleCommands(ace)
registerInitCommand(ace)
registerOpenAPICommands(ace)

// Discover user-defined commands in src/command/
await ace.discoverCommands('./src/command')


if (import.meta.main) {
    await ace.run(Deno.args)
}
