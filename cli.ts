import { Cli, loadPackageCommands, registerCoreCommands } from '@lockness/cli'

const cli = new Cli()

// Register core commands (make, auth, queue, etc.)
registerCoreCommands(cli)

// Load commands from packages listed in deno.json "lockness.packages"
await loadPackageCommands(cli)

// Discover user-defined commands in src/command/
await cli.discoverCommands('./src/command')


if (import.meta.main) {
    await cli.run(Deno.args)
}
