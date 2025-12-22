import { Ace } from '@lockness/ace'
import { registerCoreCommands } from './lockness/ace/core_commands.ts'
import { registerKyselyCommands } from './lockness/kysely/ace_commands.ts'
import { registerInitCommand } from './lockness/init/init.ts'

const ace = new Ace()

// Register all available commands
registerCoreCommands(ace)
registerKyselyCommands(ace)
registerInitCommand(ace)

if (import.meta.main) {
    await ace.run(Deno.args)
}
