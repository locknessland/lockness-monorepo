import {
    Alert,
    AlertDescription,
    AlertTitle,
    Badge,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CodeBlock,
    Command,
    Link,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Title,
} from '@lockness/ui/components'
import { DocsLayout } from '@view/layouts/docs_layout.tsx'

export const PackagesPage = () => {
    return (
        <DocsLayout
            title='Package Management'
            currentPath='/docs/packages'
            llmPath='packages'
        >
            <div class='space-y-8'>
                {/* Introduction */}
                <p class='text-lg text-muted-foreground'>
                    Lockness provides a powerful package management system that
                    automatically configures and integrates additional features
                    into your application. Packages are registered in{' '}
                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                        deno.json
                    </code>{' '}
                    and loaded dynamically at runtime.
                </p>

                {/* Overview Section */}
                <section class='space-y-4'>
                    <Title level={2}>Overview</Title>
                    <p class='text-muted-foreground'>
                        The package system allows you to add functionality to
                        your Lockness application with zero configuration.
                        Packages automatically register their CLI commands,
                        services, and configurations when listed in your{' '}
                        <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                            deno.json
                        </code>.
                    </p>

                    <Alert>
                        <AlertTitle>🎯 Key Benefits</AlertTitle>
                        <AlertDescription>
                            <ul class='list-disc list-inside space-y-1 mt-2'>
                                <li>
                                    Zero configuration - just install and use
                                </li>
                                <li>Automatic CLI command registration</li>
                                <li>Install scripts for automated setup</li>
                                <li>Declarative package configuration</li>
                                <li>Clean uninstallation</li>
                            </ul>
                        </AlertDescription>
                    </Alert>
                </section>

                {/* Configuration Section */}
                <section class='space-y-4'>
                    <Title level={2}>Configuration</Title>
                    <p class='text-muted-foreground'>
                        Packages are declared in the{' '}
                        <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                            lockness
                        </code>{' '}
                        section of your{' '}
                        <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                            deno.json
                        </code>:
                    </p>

                    <CodeBlock lang='json'>
                        {`{
  "lockness": {
    "packages": [
      "drizzle",
      "openapi",
      "cache",
      "socialite"
    ]
  }
}`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        When your application starts, Lockness automatically:
                    </p>
                    <ul class='list-disc list-inside space-y-2 text-muted-foreground'>
                        <li>Loads each package from the list</li>
                        <li>Registers their CLI commands</li>
                        <li>Makes their services available via DI</li>
                    </ul>
                </section>

                {/* Installing Packages Section */}
                <section class='space-y-6'>
                    <Title level={2}>Installing Packages</Title>

                    <div class='space-y-4'>
                        <Title level={3}>
                            Option 1: Automated Installation (Recommended)
                        </Title>
                        <p class='text-muted-foreground'>
                            Use the{' '}
                            <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                package:install
                            </code>{' '}
                            command for fully automated setup:
                        </p>

                        <Command>deno task cli package:install openapi</Command>

                        <p class='text-muted-foreground'>
                            This command will:
                        </p>
                        <ul class='list-disc list-inside space-y-2 text-muted-foreground'>
                            <li>
                                Add the package to{' '}
                                <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                    deno.json
                                </code>
                            </li>
                            <li>
                                Run the package's install script (if available)
                            </li>
                            <li>Create necessary files and configurations</li>
                            <li>Display next steps and documentation links</li>
                        </ul>

                        <Alert>
                            <AlertTitle>
                                ✅ Example: Installing OpenAPI
                            </AlertTitle>
                            <AlertDescription>
                                <CodeBlock lang='bash'>
                                    {`$ deno task cli package:install openapi

🌊 Installing @lockness/openapi...

✓ Added openapi to lockness.packages
✓ Created app/controller/docs_controller.ts

⚠️  Routes need to be regenerated:
   Run: deno task routes:generate

✅ @lockness/openapi installed successfully!

📖 Next steps:
   1. Start your dev server: deno task dev
   2. Visit: http://localhost:8888/docs
   3. Document your routes with @ApiDoc decorator`}
                                </CodeBlock>
                            </AlertDescription>
                        </Alert>
                    </div>

                    <div class='space-y-4'>
                        <Title level={3}>Option 2: Manual Configuration</Title>
                        <p class='text-muted-foreground'>
                            Add the package manually and configure it yourself:
                        </p>
                        <Command>deno task cli package:add openapi</Command>
                        <p class='text-muted-foreground'>
                            This only adds the package to your configuration.
                            You'll need to follow the package's documentation
                            for manual setup.
                        </p>
                    </div>

                    <div class='space-y-4'>
                        <Title level={3}>
                            Option 3: Direct Script Execution
                        </Title>
                        <p class='text-muted-foreground'>
                            Run a package's install script directly from JSR:
                        </p>
                        <Command>
                            deno run -A jsr:@lockness/openapi/install
                        </Command>
                    </div>
                </section>

                {/* Removing Packages Section */}
                <section class='space-y-4'>
                    <Title level={2}>Removing Packages</Title>
                    <p class='text-muted-foreground'>
                        Remove a package from your configuration:
                    </p>
                    <Command>deno task cli package:remove openapi</Command>

                    <Alert variant='destructive'>
                        <AlertTitle>⚠️ Note</AlertTitle>
                        <AlertDescription>
                            This only removes the package from{' '}
                            <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                deno.json
                            </code>
                            . You'll need to manually delete any generated files
                            (controllers, configs, etc.) if desired.
                        </AlertDescription>
                    </Alert>
                </section>

                {/* Available Commands Section */}
                <section class='space-y-4'>
                    <Title level={2}>Available Commands</Title>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Command</TableHead>
                                <TableHead>Description</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell>
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        package:install {'<name>'}
                                    </code>
                                </TableCell>
                                <TableCell>
                                    Install and configure a package with
                                    automated setup
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        package:add {'<name>'}
                                    </code>
                                </TableCell>
                                <TableCell>
                                    Add package to configuration only (no setup)
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        package:remove {'<name>'}
                                    </code>
                                </TableCell>
                                <TableCell>
                                    Remove package from configuration
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </section>

                {/* Official Packages Section */}
                <section class='space-y-4'>
                    <Title level={2}>Official Packages</Title>
                    <div class='grid md:grid-cols-2 gap-4'>
                        <Card>
                            <CardHeader>
                                <CardTitle class='flex items-center gap-2'>
                                    @lockness/drizzle
                                    <Badge variant='secondary'>Database</Badge>
                                </CardTitle>
                                <CardDescription>
                                    Drizzle ORM integration with migrations,
                                    seeders, and CLI commands
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Command>package:install drizzle</Command>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle class='flex items-center gap-2'>
                                    @lockness/openapi
                                    <Badge variant='secondary'>API</Badge>
                                </CardTitle>
                                <CardDescription>
                                    OpenAPI/Swagger documentation with automatic
                                    spec generation
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Command>package:install openapi</Command>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle class='flex items-center gap-2'>
                                    @lockness/cache
                                    <Badge variant='secondary'>
                                        Performance
                                    </Badge>
                                </CardTitle>
                                <CardDescription>
                                    Multi-driver caching system (Memory, Deno
                                    KV, Redis)
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Command>package:install cache</Command>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle class='flex items-center gap-2'>
                                    @lockness/socialite
                                    <Badge variant='secondary'>Auth</Badge>
                                </CardTitle>
                                <CardDescription>
                                    OAuth2 authentication (Google, GitHub,
                                    Discord)
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Command>package:install socialite</Command>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* How It Works Section */}
                <section class='space-y-4'>
                    <Title level={2}>How It Works</Title>
                    <p class='text-muted-foreground'>
                        When you start your application, the{' '}
                        <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                            cli.ts
                        </code>{' '}
                        file loads packages automatically:
                    </p>

                    <CodeBlock lang='tsx'>
                        {`import { Cli, loadPackageCommands, registerCoreCommands } from '@lockness/cli'

const cli = new Cli()

// Register core commands
registerCoreCommands(cli)

// Load commands from packages in deno.json
await loadPackageCommands(cli)

// Discover user commands
await cli.discoverCommands('./app/command')`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        The{' '}
                        <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                            loadPackageCommands()
                        </code>{' '}
                        function:
                    </p>
                    <ol class='list-decimal list-inside space-y-2 text-muted-foreground'>
                        <li>
                            Reads the{' '}
                            <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                lockness.packages
                            </code>{' '}
                            array from{' '}
                            <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                deno.json
                            </code>
                        </li>
                        <li>Dynamically imports each package</li>
                        <li>
                            Looks for a{' '}
                            <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                register*Commands
                            </code>{' '}
                            function
                        </li>
                        <li>Calls the function to register CLI commands</li>
                    </ol>

                    <Alert variant='default'>
                        <AlertTitle>💡 Convention</AlertTitle>
                        <AlertDescription>
                            Packages export a function named{' '}
                            <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                register[Name]Commands
                            </code>{' '}
                            or{' '}
                            <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                register[Name]Command
                            </code>{' '}
                            from their main entry point. This function receives
                            the Cli instance and registers the package's
                            commands.
                        </AlertDescription>
                    </Alert>
                </section>

                {/* Creating Your Own Package Section */}
                <section class='space-y-6'>
                    <Title level={2}>Creating Your Own Package</Title>
                    <p class='text-muted-foreground'>
                        You can create custom Lockness packages that integrate
                        seamlessly with the package management system.
                    </p>

                    <div class='space-y-4'>
                        <Title level={3}>1. Export Register Function</Title>
                        <CodeBlock lang='tsx'>
                            {`// my-package/index.ts
import type { Cli } from '@lockness/cli'

export function registerMyPackageCommands(cli: Cli) {
    cli.register('my:command', async () => {
        console.log('Hello from my package!')
    }, 'My custom command')
}

export { myPackageFunction } from './lib.ts'`}
                        </CodeBlock>
                    </div>

                    <div class='space-y-4'>
                        <Title level={3}>
                            2. Create Install Script (Optional)
                        </Title>
                        <CodeBlock lang='tsx'>
                            {`// my-package/install.ts
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
}`}
                        </CodeBlock>
                    </div>

                    <div class='space-y-4'>
                        <Title level={3}>3. Update Package Configuration</Title>
                        <CodeBlock lang='json'>
                            {`// deno.json
{
  "name": "@myorg/my-package",
  "exports": {
    ".": "./index.ts",
    "./install": "./install.ts"
  }
}`}
                        </CodeBlock>
                    </div>

                    <div class='space-y-4'>
                        <Title level={3}>4. Development Standards</Title>
                        <p class='text-muted-foreground'>
                            To maintain consistency and ensure compatibility
                            across the Lockness ecosystem, all packages should
                            follow these standards:
                        </p>
                        <ul class='space-y-3'>
                            <li class='flex gap-2'>
                                <Badge>mod.ts</Badge>
                                <span class='text-muted-foreground'>
                                    Always use{' '}
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        mod.ts
                                    </code>{' '}
                                    as the main entry point for your package.
                                </span>
                            </li>
                            <li class='flex gap-2'>
                                <Badge>tests/</Badge>
                                <span class='text-muted-foreground'>
                                    Place all test files in a dedicated{' '}
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        tests/
                                    </code>{' '}
                                    directory and use the{' '}
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        *.test.ts
                                    </code>{' '}
                                    naming convention.
                                </span>
                            </li>
                            <li class='flex gap-2'>
                                <Badge>Imports</Badge>
                                <span class='text-muted-foreground'>
                                    Use named workspace imports (e.g.,{' '}
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        @lockness/core
                                    </code>
                                    ) for cross-package dependencies.
                                </span>
                            </li>
                            <li class='flex gap-2'>
                                <Badge>JSR</Badge>
                                <span class='text-muted-foreground'>
                                    Configure the{' '}
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        publish
                                    </code>{' '}
                                    field in your{' '}
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        deno.json
                                    </code>{' '}
                                    to include only source files.
                                </span>
                            </li>
                        </ul>
                    </div>

                    <p class='text-muted-foreground'>
                        See{' '}
                        <Link
                            href='https://github.com/locknessland/lockness/tree/main/lockness/cli/INSTALL_SCRIPTS.md'
                            target='_blank'
                        >
                            INSTALL_SCRIPTS.md
                        </Link>{' '}
                        for complete documentation on creating install scripts.
                    </p>
                </section>
            </div>
        </DocsLayout>
    )
}
