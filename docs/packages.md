# Package Management

Lockness provides a powerful package management system that automatically
configures and integrates additional features into your application. Packages
are registered in `deno.json` and loaded dynamically at runtime.

## Overview

The package system allows you to add functionality to your Lockness application
with zero configuration. Packages automatically register their CLI commands,
services, and configurations when listed in your `deno.json`.

**Key Benefits:**

- Zero configuration - just install and use
- Automatic CLI command registration
- Install scripts for automated setup
- Declarative package configuration
- Clean uninstallation

## Configuration

Packages are declared in the `lockness` section of your `deno.json`:

```json
{
    "lockness": {
        "packages": [
            "drizzle",
            "openapi",
            "cache",
            "socialite"
        ]
    }
}
```

When your application starts, Lockness automatically:

- Loads each package from the list
- Registers their CLI commands
- Makes their services available via DI

## Installing Packages

### Option 1: Automated Installation (Recommended)

Use the `package:install` command for fully automated setup:

```bash
deno task cli package:install openapi
```

This command will:

- Add the package to `deno.json`
- Run the package's install script (if available)
- Create necessary files and configurations
- Display next steps and documentation links

**Example output:**

```
$ deno task cli package:install openapi

🌊 Installing @lockness/openapi...

✓ Added openapi to lockness.packages
✓ Created app/controller/docs_controller.ts

⚠️  Routes need to be regenerated:
   Run: deno task routes:generate

✅ @lockness/openapi installed successfully!

📖 Next steps:
   1. Start your dev server: deno task dev
   2. Visit: http://localhost:8888/docs
   3. Document your routes with @ApiDoc decorator
```

### Option 2: Manual Configuration

Add the package manually and configure it yourself:

```bash
deno task cli package:add openapi
```

This only adds the package to your configuration. You'll need to follow the
package's documentation for manual setup.

### Option 3: Direct Script Execution

Run a package's install script directly from JSR:

```bash
deno run -A jsr:@lockness/openapi/install
```

## Removing Packages

Remove a package from your configuration:

```bash
deno task cli package:remove openapi
```

> **Note:** This only removes the package from `deno.json`. You'll need to
> manually delete any generated files (controllers, configs, etc.) if desired.

## Available Commands

| Command                  | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `package:install <name>` | Install and configure a package with automated setup |
| `package:add <name>`     | Add package to configuration only (no setup)         |
| `package:remove <name>`  | Remove package from configuration                    |

## Official Packages

### @lockness/drizzle

**Category:** Database

Drizzle ORM integration with migrations, seeders, and CLI commands.

```bash
deno task cli package:install drizzle
```

### @lockness/openapi

**Category:** API

OpenAPI/Swagger documentation with automatic spec generation.

```bash
deno task cli package:install openapi
```

### @lockness/cache

**Category:** Performance

Multi-driver caching system (Memory, Deno KV, Redis).

```bash
deno task cli package:install cache
```

### @lockness/socialite

**Category:** Auth

OAuth2 authentication (Google, GitHub, Discord).

```bash
deno task cli package:install socialite
```

## How It Works

When you start your application, the `cli.ts` file loads packages automatically:

```typescript
import { Cli, loadPackageCommands, registerCoreCommands } from '@lockness/cli'

const cli = new Cli()

// Register core commands
registerCoreCommands(cli)

// Load commands from packages in deno.json
await loadPackageCommands(cli)

// Discover user commands
await cli.discoverCommands('./app/command')
```

The `loadPackageCommands()` function:

1. Reads the `lockness.packages` array from `deno.json`
2. Dynamically imports each package
3. Looks for a `register*Commands` function
4. Calls the function to register CLI commands

> **Convention:** Packages export a function named `register[Name]Commands` or
> `register[Name]Command` from their main entry point. This function receives
> the Cli instance and registers the package's commands.

## Creating Your Own Package

You can create custom Lockness packages that integrate seamlessly with the
package management system.

### 1. Export Register Function

```typescript
// my-package/index.ts
import type { Cli } from '@lockness/cli'

export function registerMyPackageCommands(cli: Cli) {
    cli.register('my:command', async () => {
        console.log('Hello from my package!')
    }, 'My custom command')
}

export { myPackageFunction } from './lib.ts'
```

### 2. Create Install Script (Optional)

```typescript
// my-package/install.ts
import { addPackage } from '@lockness/cli'

async function main() {
    console.log('🌊 Installing my-package...\n')

    // Add to deno.json
    await addPackage('my-package')

    // Create config file
    await Deno.writeTextFile(
        './config/my-package.ts',
        'export const config = { enabled: true }',
    )

    console.log('✅ Installation complete!')
}

if (import.meta.main) {
    await main()
}
```

### 3. Update Package Configuration

```json
// deno.json
{
    "name": "@myorg/my-package",
    "exports": {
        ".": "./index.ts",
        "./install": "./install.ts"
    }
}
```

### 4. Development Standards

To maintain consistency and ensure compatibility across the Lockness ecosystem,
all packages should follow these standards:

- **mod.ts**: Always use `mod.ts` as the main entry point for your package.
- **tests/**: Place all test files in a dedicated `tests/` directory and use the
  `*.test.ts` naming convention.
- **Imports**: Use named workspace imports (e.g., `@lockness/core`) for
  cross-package dependencies.
- **JSR**: Configure the `publish` field in your `deno.json` to include only
  source files.

See [CLI documentation](/docs/cli) for complete documentation on creating
install scripts.
