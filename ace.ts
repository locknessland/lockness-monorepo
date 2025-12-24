import { Ace, loadPackageCommands, registerCoreCommands } from '@lockness/ace'

const ace = new Ace()

// Register core commands (make, auth, queue, etc.)
registerCoreCommands(ace)

// Load commands from packages listed in deno.json "lockness.packages"
await loadPackageCommands(ace)

// Discover user-defined commands in src/command/
await ace.discoverCommands('./src/command')


if (import.meta.main) {
    await ace.run(Deno.args)
}
