# @lockness/cli

Command-line interface system for Lockness framework with extensible commands
and package management.

## Features

- 🎯 **Command Registry**: Register and execute CLI commands
- 📦 **Package Management**: Install and configure Lockness packages
- 🏗️ **Scaffolding**: Generate routes, controllers, and models
- 🔌 **Extensible**: Packages can provide custom commands
- 🎨 **Stub System**: Template-based file generation
- 🔧 **Install Scripts**: Automated package installation workflow

## Installation

Already included in Lockness framework:

```typescript
import { Cli, registerCoreCommands } from '@lockness/cli'
```

## Quick Start

### Create a CLI Application

```typescript
import { Cli, registerCoreCommands } from '@lockness/cli'

const cli = new Cli()
registerCoreCommands(cli)

// Load package-specific commands
await loadPackageCommands(cli)

// Run the CLI
await cli.run(Deno.args)
```

## Core Commands

The CLI provides several built-in commands:

- **`make:controller <name>`** - Generate a controller class
- **`make:model <name>`** - Generate a model with repository
- **`make:middleware <name>`** - Generate a middleware
- **`make:error-pages`** - Generate custom error pages (404, 401, 403, 500)
- **`route:list`** - Display all registered routes
- **`package:install <name>`** - Install and configure a Lockness package

## Usage

### Register Custom Commands

```typescript
import { type Cli } from '@lockness/cli'

export function registerMyCommands(cli: Cli) {
    cli.register('greet', async (args: string[]) => {
        const name = args[0] || 'World'
        console.log(`Hello, ${name}!`)
    }, 'Greet someone')
}
```

### Stub System

Generate files from templates:

```typescript
import { Stub } from '@lockness/cli'

const stub = new Stub('controller.stub')
stub.replace('{{name}}', 'UserController')
stub.replace('{{route}}', '/users')

await stub.save('./app/controller/user_controller.ts')
```

### Package Installation

Packages can provide install scripts:

```typescript
// my-package/install.ts
import { addPackage } from '@lockness/cli'

await addPackage('my-package')
await Deno.writeTextFile('./config/my-package.ts', CONFIG)
```

## Package Commands

Packages can register their own commands:

```typescript
// In your package
export function registerDrizzleCommands(cli: Cli) {
    cli.register('db:migrate', async () => {
        // Migration logic
    }, 'Run database migrations')
}
```

## Route Generation

Automatically generate route definitions from controllers:

```typescript
import { generateRoutes } from '@lockness/cli'

await generateRoutes('./app/controller', './app/routes.ts')
```

This scans controller files and generates a routes file with proper imports.

## Configuration

The CLI reads from your project's `deno.json`:

```json
{
    "tasks": {
        "cli": "deno run -A cli.ts"
    },
    "lockness": {
        "packages": ["auth", "drizzle", "openapi"]
    }
}
```

## Command Context

Commands receive a context object:

```typescript
cli.register('deploy', async (args, ctx) => {
    const environment = ctx.arg(0) // First argument
    const force = ctx.hasFlag('force') // Check for --force
    const region = ctx.getFlag('region') // Get --region=value

    console.log(`Deploying to ${environment}...`)
})
```

## Architecture

The CLI system consists of:

- **Cli**: Main command registry and executor
- **Stub**: Template system for file generation
- **PackageLoader**: Dynamic command loading from packages
- **CoreCommands**: Built-in framework commands

## See Also

- [INSTALL_SCRIPTS.md](./INSTALL_SCRIPTS.md) - Guide for creating package
  installation scripts
