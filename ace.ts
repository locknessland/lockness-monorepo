import { Ace, autoRegisterCommands } from '@lockness/ace'

const ace = new Ace()

// Auto-register commands from all Lockness packages
await autoRegisterCommands(ace)

// Discover user-defined commands in src/command/
await ace.discoverCommands('./src/command')


if (import.meta.main) {
    await ace.run(Deno.args)
}
