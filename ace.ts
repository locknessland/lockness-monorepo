import { Ace } from '@lockness/ace'
import { registerCoreCommands } from '@lockness/ace'
import { registerDrizzleCommands } from '@lockness/drizzle'
import { registerInitCommand } from '@lockness/init'
import { registerOpenAPICommands } from '@lockness/openapi'

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
