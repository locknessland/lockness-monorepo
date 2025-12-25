# Package Installation Scripts

Lockness packages can provide installation scripts to automate setup and
configuration.

## For Package Authors

### Creating an Install Script

Create an `install.ts` file in your package root:

```typescript
#!/usr/bin/env -S deno run -A
import { addPackage } from '@lockness/cli'

async function main() {
    console.log('🌊 Installing @lockness/my-package...\n')

    // 1. Add to deno.json configuration
    await addPackage('my-package')

    // 2. Create files (controllers, config, etc.)
    await Deno.writeTextFile('./src/config/my-package.ts', CONFIG_TEMPLATE)

    // 3. Display instructions
    console.log('✅ Installation complete!\n')
    console.log('Next steps:')
    console.log('  1. Configure in src/config/my-package.ts')
    console.log('  2. Restart your dev server\n')
}

if (import.meta.main) {
    await main()
}
```

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
- Handle errors gracefully
- Make the script idempotent (safe to run multiple times)

❌ **Don't:**

- Overwrite existing user files without confirmation
- Require external dependencies in the install script
- Make irreversible changes without warning

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
2. ✅ Creates `src/controller/docs_controller.ts`
3. ℹ️ Reminds you to run `deno task routes:generate`
4. 📖 Displays documentation links

```bash
$ deno task cli package:install openapi

🌊 Installing @lockness/openapi...

✓ Added openapi to lockness.packages
✓ Created src/controller/docs_controller.ts

⚠️  Routes need to be regenerated:
   Run: deno task routes:generate

✅ @lockness/openapi installed successfully!

📖 Next steps:
   1. Start your dev server: deno task dev
   2. Visit: http://localhost:8888/docs
   3. Document your routes with @ApiDoc decorator
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
