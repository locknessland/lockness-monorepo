import { Cli, loadPackageCommands, registerCoreCommands } from '@lockness/cli'

const cli = new Cli()

// Register framework core commands (make:controller, make:middleware, etc.)
registerCoreCommands(cli)

// Load commands from installed packages (drizzle, openapi, etc.)
// verified in deno.json under "lockness.packages"
await loadPackageCommands(cli)

// Discover user-defined commands in src/command/
await cli.discoverCommands('./src/command')

if (import.meta.main) {
    await cli.run(Deno.args)
}
