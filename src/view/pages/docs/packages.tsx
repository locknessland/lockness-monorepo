import { DocsLayout } from '@view/layouts/docs_layout.tsx'

export const PackagesPage = () => {
    return (
        <DocsLayout title="Package Management" currentPath="/docs/packages" llmPath="packages">
            <h1 class="text-4xl font-bold mb-6">Package Management</h1>

            <p class="text-lg text-gray-600 mb-8">
                Lockness provides a powerful package management system that
                automatically configures and integrates additional features into
                your application. Packages are registered in{' '}
                <code class="bg-gray-100 px-2 py-1 rounded">deno.json</code> and
                loaded dynamically at runtime.
            </p>

            <section class="mb-12">
                <h2 class="text-3xl font-bold mb-4">Overview</h2>
                <p class="mb-4">
                    The package system allows you to add functionality to your
                    Lockness application with zero configuration. Packages
                    automatically register their CLI commands, services, and
                    configurations when listed in your{' '}
                    <code class="bg-gray-100 px-2 py-1 rounded">deno.json</code>.
                </p>

                <div class="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                    <p class="font-semibold mb-2">🎯 Key Benefits</p>
                    <ul class="list-disc list-inside space-y-1">
                        <li>Zero configuration - just install and use</li>
                        <li>Automatic CLI command registration</li>
                        <li>Install scripts for automated setup</li>
                        <li>Declarative package configuration</li>
                        <li>Clean uninstallation</li>
                    </ul>
                </div>
            </section>

            <section class="mb-12">
                <h2 class="text-3xl font-bold mb-4">Configuration</h2>
                <p class="mb-4">
                    Packages are declared in the{' '}
                    <code class="bg-gray-100 px-2 py-1 rounded">lockness</code>{' '}
                    section of your{' '}
                    <code class="bg-gray-100 px-2 py-1 rounded">deno.json</code>:
                </p>

                <pre class="bg-gray-900 text-white p-4 rounded-lg mb-4 overflow-x-auto">
                    <code>{`{
  "lockness": {
    "packages": [
      "drizzle",
      "openapi",
      "cache",
      "socialite"
    ]
  }
}`}</code>
                </pre>

                <p class="mb-4">
                    When your application starts, Lockness automatically:
                </p>
                <ul class="list-disc list-inside space-y-2 mb-4">
                    <li>Loads each package from the list</li>
                    <li>Registers their CLI commands</li>
                    <li>Makes their services available via DI</li>
                </ul>
            </section>

            <section class="mb-12">
                <h2 class="text-3xl font-bold mb-4">Installing Packages</h2>

                <h3 class="text-2xl font-semibold mb-3">
                    Option 1: Automated Installation (Recommended)
                </h3>
                <p class="mb-4">
                    Use the{' '}
                    <code class="bg-gray-100 px-2 py-1 rounded">
                        package:install
                    </code>{' '}
                    command for fully automated setup:
                </p>

                <pre class="bg-gray-900 text-white p-4 rounded-lg mb-4">
                    <code>deno task cli package:install openapi</code>
                </pre>

                <p class="mb-4">This command will:</p>
                <ul class="list-disc list-inside space-y-2 mb-6">
                    <li>
                        Add the package to{' '}
                        <code class="bg-gray-100 px-2 py-1 rounded">
                            deno.json
                        </code>
                    </li>
                    <li>Run the package's install script (if available)</li>
                    <li>Create necessary files and configurations</li>
                    <li>Display next steps and documentation links</li>
                </ul>

                <div class="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                    <p class="font-semibold mb-2">
                        ✅ Example: Installing OpenAPI
                    </p>
                    <pre class="bg-gray-900 text-white p-3 rounded mt-2 text-sm overflow-x-auto">
                        <code>{`$ deno task cli package:install openapi

🌊 Installing @lockness/openapi...

✓ Added openapi to lockness.packages
✓ Created src/controller/docs_controller.ts

⚠️  Routes need to be regenerated:
   Run: deno task routes:generate

✅ @lockness/openapi installed successfully!

📖 Next steps:
   1. Start your dev server: deno task dev
   2. Visit: http://localhost:8888/docs
   3. Document your routes with @ApiDoc decorator`}</code>
                    </pre>
                </div>

                <h3 class="text-2xl font-semibold mb-3 mt-8">
                    Option 2: Manual Configuration
                </h3>
                <p class="mb-4">
                    Add the package manually and configure it yourself:
                </p>

                <pre class="bg-gray-900 text-white p-4 rounded-lg mb-4">
                    <code>deno task cli package:add openapi</code>
                </pre>

                <p class="mb-4">
                    This only adds the package to your configuration. You'll need
                    to follow the package's documentation for manual setup.
                </p>

                <h3 class="text-2xl font-semibold mb-3 mt-8">
                    Option 3: Direct Script Execution
                </h3>
                <p class="mb-4">
                    Run a package's install script directly from JSR:
                </p>

                <pre class="bg-gray-900 text-white p-4 rounded-lg mb-4">
                    <code>
                        deno run -A jsr:@lockness/openapi/install
                    </code>
                </pre>
            </section>

            <section class="mb-12">
                <h2 class="text-3xl font-bold mb-4">Removing Packages</h2>
                <p class="mb-4">Remove a package from your configuration:</p>

                <pre class="bg-gray-900 text-white p-4 rounded-lg mb-4">
                    <code>deno task cli package:remove openapi</code>
                </pre>

                <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6">
                    <p class="font-semibold mb-2">⚠️ Note</p>
                    <p>
                        This only removes the package from{' '}
                        <code class="bg-gray-100 px-2 py-1 rounded">
                            deno.json
                        </code>
                        . You'll need to manually delete any generated files
                        (controllers, configs, etc.) if desired.
                    </p>
                </div>
            </section>

            <section class="mb-12">
                <h2 class="text-3xl font-bold mb-4">Available Commands</h2>
                <div class="overflow-x-auto">
                    <table class="min-w-full bg-white border border-gray-300">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                                    Command
                                </th>
                                <th class="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                                    Description
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            <tr>
                                <td class="px-6 py-4">
                                    <code class="bg-gray-100 px-2 py-1 rounded">
                                        package:install {'<name>'}
                                    </code>
                                </td>
                                <td class="px-6 py-4">
                                    Install and configure a package with automated
                                    setup
                                </td>
                            </tr>
                            <tr>
                                <td class="px-6 py-4">
                                    <code class="bg-gray-100 px-2 py-1 rounded">
                                        package:add {'<name>'}
                                    </code>
                                </td>
                                <td class="px-6 py-4">
                                    Add package to configuration only (no setup)
                                </td>
                            </tr>
                            <tr>
                                <td class="px-6 py-4">
                                    <code class="bg-gray-100 px-2 py-1 rounded">
                                        package:remove {'<name>'}
                                    </code>
                                </td>
                                <td class="px-6 py-4">
                                    Remove package from configuration
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="mb-12">
                <h2 class="text-3xl font-bold mb-4">Official Packages</h2>
                <div class="grid md:grid-cols-2 gap-6">
                    <div class="border border-gray-200 rounded-lg p-6">
                        <h3 class="text-xl font-semibold mb-2">
                            @lockness/drizzle
                        </h3>
                        <p class="text-gray-600 mb-3">
                            Drizzle ORM integration with migrations, seeders, and
                            CLI commands
                        </p>
                        <code class="text-sm bg-gray-100 px-2 py-1 rounded">
                            package:install drizzle
                        </code>
                    </div>

                    <div class="border border-gray-200 rounded-lg p-6">
                        <h3 class="text-xl font-semibold mb-2">
                            @lockness/openapi
                        </h3>
                        <p class="text-gray-600 mb-3">
                            OpenAPI/Swagger documentation with automatic spec
                            generation
                        </p>
                        <code class="text-sm bg-gray-100 px-2 py-1 rounded">
                            package:install openapi
                        </code>
                    </div>

                    <div class="border border-gray-200 rounded-lg p-6">
                        <h3 class="text-xl font-semibold mb-2">
                            @lockness/cache
                        </h3>
                        <p class="text-gray-600 mb-3">
                            Multi-driver caching system (Memory, Deno KV, Redis)
                        </p>
                        <code class="text-sm bg-gray-100 px-2 py-1 rounded">
                            package:install cache
                        </code>
                    </div>

                    <div class="border border-gray-200 rounded-lg p-6">
                        <h3 class="text-xl font-semibold mb-2">
                            @lockness/socialite
                        </h3>
                        <p class="text-gray-600 mb-3">
                            OAuth2 authentication (Google, GitHub, Discord)
                        </p>
                        <code class="text-sm bg-gray-100 px-2 py-1 rounded">
                            package:install socialite
                        </code>
                    </div>
                </div>
            </section>

            <section class="mb-12">
                <h2 class="text-3xl font-bold mb-4">
                    How It Works
                </h2>
                <p class="mb-4">
                    When you start your application, the{' '}
                    <code class="bg-gray-100 px-2 py-1 rounded">cli.ts</code>{' '}
                    file loads packages automatically:
                </p>

                <pre class="bg-gray-900 text-white p-4 rounded-lg mb-4 overflow-x-auto">
                    <code>{`import { Cli, loadPackageCommands, registerCoreCommands } from '@lockness/cli'

const cli = new Cli()

// Register core commands
registerCoreCommands(cli)

// Load commands from packages in deno.json
await loadPackageCommands(cli)

// Discover user commands
await cli.discoverCommands('./src/command')`}</code>
                </pre>

                <p class="mb-4">
                    The <code class="bg-gray-100 px-2 py-1 rounded">loadPackageCommands()</code> function:
                </p>
                <ol class="list-decimal list-inside space-y-2 mb-4">
                    <li>Reads the <code class="bg-gray-100 px-2 py-1 rounded">lockness.packages</code> array from <code class="bg-gray-100 px-2 py-1 rounded">deno.json</code></li>
                    <li>Dynamically imports each package</li>
                    <li>Looks for a <code class="bg-gray-100 px-2 py-1 rounded">register*Commands</code> function</li>
                    <li>Calls the function to register CLI commands</li>
                </ol>

                <div class="bg-gray-50 border-l-4 border-gray-400 p-4">
                    <p class="font-semibold mb-2">💡 Convention</p>
                    <p>
                        Packages export a function named <code class="bg-gray-100 px-2 py-1 rounded">register[Name]Commands</code> or <code class="bg-gray-100 px-2 py-1 rounded">register[Name]Command</code> from their main entry point. This function receives the Cli instance and registers the package's commands.
                    </p>
                </div>
            </section>

            <section class="mb-12">
                <h2 class="text-3xl font-bold mb-4">Creating Your Own Package</h2>
                <p class="mb-4">
                    You can create custom Lockness packages that integrate
                    seamlessly with the package management system.
                </p>

                <h3 class="text-2xl font-semibold mb-3">1. Export Register Function</h3>
                <pre class="bg-gray-900 text-white p-4 rounded-lg mb-4 overflow-x-auto">
                    <code>{`// my-package/index.ts
import type { Cli } from '@lockness/cli'

export function registerMyPackageCommands(cli: Cli) {
    cli.register('my:command', async () => {
        console.log('Hello from my package!')
    }, 'My custom command')
}

export { myPackageFunction } from './lib.ts'`}</code>
                </pre>

                <h3 class="text-2xl font-semibold mb-3 mt-6">2. Create Install Script (Optional)</h3>
                <pre class="bg-gray-900 text-white p-4 rounded-lg mb-4 overflow-x-auto">
                    <code>{`// my-package/install.ts
import { addPackage } from '@lockness/cli'

async function main() {
    console.log('🌊 Installing my-package...\\n')
    
    // Add to deno.json
    await addPackage('my-package')
    
    // Create config file
    await Deno.writeTextFile(
        './config/my-package.ts',
        'export const config = { enabled: true }'
    )
    
    console.log('✅ Installation complete!')
}

if (import.meta.main) {
    await main()
}`}</code>
                </pre>

                <h3 class="text-2xl font-semibold mb-3 mt-6">3. Update Package Configuration</h3>
                <pre class="bg-gray-900 text-white p-4 rounded-lg mb-4 overflow-x-auto">
                    <code>{`// deno.json
{
  "name": "@myorg/my-package",
  "exports": {
    ".": "./index.ts",
    "./install": "./install.ts"
  }
}`}</code>
                </pre>

                <p class="mt-6">
                    See{' '}
                    <a
                        href="https://github.com/locknessland/lockness/tree/main/lockness/cli/INSTALL_SCRIPTS.md"
                        class="text-blue-600 hover:underline"
                    >
                        INSTALL_SCRIPTS.md
                    </a>{' '}
                    for complete documentation on creating install scripts.
                </p>
            </section>
        </DocsLayout>
    )
}
