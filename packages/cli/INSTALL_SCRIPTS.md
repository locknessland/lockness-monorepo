# Package Installation Scripts

Lockness packages can provide installation scripts to automate setup and
configuration.

## For Package Authors

### Creating an Install Script

Create an `install.ts` file in your package root. Its work is the module's
**default export**, an async function named `install`:

```typescript
#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Installer for @lockness/my-package.
 *
 * @module @lockness/my-package/install
 */
import { addPackage } from '@lockness/cli'
import { CommandFailedError, runSteps } from '@lockness/cli/command-failure'
import { runEntry } from '@lockness/cli/entry'
import { exists } from '@std/fs'

const CONFIG_TEMPLATE = 'export const myPackageConfig = {}\n'

/**
 * Install @lockness/my-package into the project in the current directory.
 *
 * @throws {CommandFailedError} Outside a Lockness project, or when a step
 *   failed.
 */
export default async function install(): Promise<void> {
    console.log('🌊 Installing @lockness/my-package...\n')

    // 1. Refuse before anything is written.
    if (!(await exists('./deno.json'))) {
        throw new CommandFailedError(
            'deno.json not found. Are you in a Lockness project?',
        )
    }

    // 2. Every step runs, even after one fails; then one failure names
    //    the steps that failed.
    await runSteps([
        { label: 'add to deno.json', run: () => addPackage('my-package') },
        {
            label: 'config file',
            run: () =>
                Deno.writeTextFile('./config/my-package.ts', CONFIG_TEMPLATE),
        },
    ])

    // 3. Display instructions
    console.log('✅ Installation complete!\n')
    console.log('Next steps:')
    console.log('  1. Configure in config/my-package.ts')
    console.log('  2. Restart your dev server\n')
}

if (import.meta.main) await runEntry('my-package install', () => install())
```

The contract is the same as a command handler's:

- **`install()` reports failure by throwing.** It never prints `❌`, never calls
  `Deno.exit()` and never sets `Deno.exitCode`. Whoever runs it prints the
  failure once and sets a non-zero exit status: `package:install <name>` imports
  `@lockness/<name>/install` and calls the default export under
  `Cli.dispatch()`, and `deno run jsr:@lockness/<name>/install` hands it to
  `runEntry` from `@lockness/cli/entry`.
- **A failure message is one line you wrote.** Throw `CommandFailedError` for a
  failure you expected. When a caught error caused it, pass that error as
  `cause` rather than quoting it in the message: it is printed after the
  message, rendered with its credentials redacted. Any other error is printed
  with its stack frames, redacted too.
- **Independent setup steps go through `runSteps`.** Each step runs whatever the
  one before it did, so the user is never left guessing which files exist. If
  any failed, one `CommandFailedError` is thrown afterwards, naming them
  (`1 of 2 steps failed: config file`), with the first failure as its `cause`.
- **The `import.meta.main` block holds only `await runEntry(…)`.** No
  `try`/`catch` around it, and no `main()` started without being awaited:
  `runEntry` catches whatever `install()` throws, so Deno never prints an
  unredacted `error: Uncaught` with the whole cause chain.

See [docs/DOCS.md](docs/DOCS.md#exit-codes) for what the printer shows.

### Export the Install Script

Add to your package's `deno.json`:

```json
{
    "name": "@lockness/my-package",
    "exports": {
        ".": "./index.ts",
        "./install": "./install.ts"
    }
}
```

### Best Practices

✅ **Do:**

- Check if files already exist before creating them
- Use `addPackage()` to register in deno.json
- Display clear next steps
- Report a failure by throwing, with a one-line message
- Make the script idempotent (safe to run multiple times)

❌ **Don't:**

- Overwrite existing user files without confirmation
- Require external dependencies in the install script
- Make irreversible changes without warning
- Print the failure yourself, or call `Deno.exit()`: the caller prints it once
  and sets the exit status

## For Users

### Installing a Package

Three ways to install a Lockness package:

#### 1. Automated Installation (Recommended)

```bash
deno task cli package:install openapi
```

This will:

- Add the package to `deno.json` lockness.packages
- Run the package's install script (if available)
- Create necessary files and configuration

#### 2. Manual Installation Script

```bash
deno run -A jsr:@lockness/openapi/install
```

Or for local development:

```bash
deno run -A lockness/openapi/install.ts
```

#### 3. Manual Configuration

Add to `deno.json`:

```json
{
    "lockness": {
        "packages": ["openapi"]
    }
}
```

Then follow the package's README for manual setup.

## Example: OpenAPI Package

The OpenAPI package install script:

1. ✅ Adds "openapi" to `deno.json` lockness.packages
2. ✅ Creates `app/controller/api_docs_controller.ts`
3. ℹ️ Reminds you to run `deno task routes:generate`
4. 📖 Displays documentation links

```bash
$ deno task cli package:install openapi

🌊 Installing @lockness/openapi...

✓ Added openapi to lockness.packages
✓ Created app/controller/api_docs_controller.ts

⚠️  Routes need to be regenerated:
   Run: deno task routes:generate

✅ @lockness/openapi installed successfully!

📖 Next steps:
   1. Start your dev server: deno task dev
   2. Visit: http://localhost:8888/api-docs
   3. Document your routes with @ApiDoc decorator
```

Outside a Lockness project it writes nothing, prints one `❌` line on stderr and
exits `1`:

```text
❌ app/controller directory not found. Are you in a Lockness project?
```

## Advanced: Interactive Installers

For more complex packages, use interactive prompts:

```typescript
import { Confirm, Input } from '@cliffy/prompt'

const apiUrl = await Input.prompt({
    message: 'Enter your API URL',
    default: 'http://localhost:8888',
})

const enableAuth = await Confirm.prompt({
    message: 'Enable authentication?',
    default: true,
})

// Generate config based on user input
const config = generateConfig({ apiUrl, enableAuth })
await Deno.writeTextFile('./config.ts', config)
```

## Package Commands

- `package:add <name>` - Add package to config only
- `package:install <name>` - Install with automated setup
- `package:remove <name>` - Remove from config
- `package:list` - List installed packages (TODO)

## Hooks & Lifecycle

Future enhancements may include:

- `preinstall` - Run before installation
- `postinstall` - Run after installation
- `uninstall` - Cleanup when removing package
- `update` - Migrate configuration on version updates

## Testing Install Scripts

Test your install script in a clean project:

```bash
# Create test project
deno task cli init test-project
cd test-project

# Test your package install script
deno run -A ../my-package/install.ts

# Verify everything works
deno task dev
```
