#!/usr/bin/env -S deno run -A
/**
 * @lockness/ui - CLI for adding UI components to your project
 *
 * Inspired by shadcn/ui, this CLI copies component source code directly
 * into your project, giving you full ownership and customization capabilities.
 *
 * @example
 * ```bash
 * # Add a component
 * deno run -A jsr:@lockness/ui add button
 *
 * # Add multiple components
 * deno run -A jsr:@lockness/ui add button card
 *
 * # List available components
 * deno run -A jsr:@lockness/ui list
 *
 * # Force overwrite existing files
 * deno run -A jsr:@lockness/ui add button --force
 *
 * # Specify custom directory
 * deno run -A jsr:@lockness/ui add button --dir src/components
 * ```
 *
 * @module
 */

import { parseArgs } from '@std/cli/parse-args'
import { ensureDir } from '@std/fs/ensure-dir'
import { exists } from '@std/fs/exists'
import { dirname, fromFileUrl, join } from '@std/path'

// =============================================================================
// Types
// =============================================================================

interface ComponentFile {
    path: string
    target: string
}

interface ComponentEntry {
    name: string
    description: string
    files: ComponentFile[]
    dependencies?: Record<string, string>
    internalDependencies?: string[]
}

interface Registry {
    [key: string]: ComponentEntry
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TARGET_DIR = 'app/view'
const VERSION = '0.1.22'

// =============================================================================
// Registry
// =============================================================================

const REGISTRY: Registry = {
    utils: {
        name: 'utils',
        description: 'Class name utility (cn) for merging Tailwind classes',
        files: [{ path: 'lib/utils.ts', target: 'lib/utils.ts' }],
        dependencies: {
            clsx: 'npm:clsx@2.1.1',
            'tailwind-merge': 'npm:tailwind-merge@2.6.0',
        },
    },
    button: {
        name: 'button',
        description: 'Flexible button component with variants and sizes',
        files: [
            {
                path: 'components/Button.tsx',
                target: 'components/ui/Button.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    card: {
        name: 'card',
        description:
            'Card component system (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)',
        files: [
            { path: 'components/Card.tsx', target: 'components/ui/Card.tsx' },
        ],
        internalDependencies: ['utils'],
    },
    'root-layout': {
        name: 'root-layout',
        description: 'Base HTML layout with Unpoly CDN integration',
        files: [
            {
                path: 'components/RootLayout.tsx',
                target: 'components/ui/RootLayout.tsx',
            },
        ],
    },
}

// =============================================================================
// CLI
// =============================================================================

function printHelp(): void {
    console.log(`
@lockness/ui v${VERSION}

CLI for adding UI components to your Lockness project.
Components are copied to your project for full customization.

USAGE:
    deno run -A jsr:@lockness/ui <command> [options]

COMMANDS:
    add <component...>  Add component(s) to your project
    list                List all available components

OPTIONS:
    -d, --dir <path>    Target directory (default: ${DEFAULT_TARGET_DIR})
    -f, --force         Overwrite existing files
    -h, --help          Show this help message

EXAMPLES:
    deno run -A jsr:@lockness/ui add button
    deno run -A jsr:@lockness/ui add button card
    deno run -A jsr:@lockness/ui add button --force
    deno run -A jsr:@lockness/ui add button --dir src/components
    deno run -A jsr:@lockness/ui list
`)
}

function printList(): void {
    console.log('\n📦 Available components:\n')
    for (const [name, entry] of Object.entries(REGISTRY)) {
        const deps = entry.internalDependencies?.length
            ? ` (requires: ${entry.internalDependencies.join(', ')})`
            : ''
        console.log(`  • ${name}${deps}`)
        console.log(`    ${entry.description}\n`)
    }
}

function getPackageDir(): string {
    // Get the directory where this script is located
    const moduleUrl = import.meta.url
    if (moduleUrl.startsWith('file://')) {
        return dirname(fromFileUrl(moduleUrl))
    }
    // For remote execution, we need to fetch files from JSR
    throw new Error(
        'Remote execution not yet supported. Please install locally.',
    )
}

async function readSourceFile(
    packageDir: string,
    filePath: string,
): Promise<string> {
    const fullPath = join(packageDir, filePath)
    return await Deno.readTextFile(fullPath)
}

function rewriteImports(content: string, _targetDir: string): string {
    // Rewrite import paths from ../lib/utils.ts to correct relative path
    // Components are in components/ui/, utils is in lib/
    // So from components/ui/Button.tsx to lib/utils.ts is ../../lib/utils.ts
    return content.replace(
        /from ['"]\.\.\/lib\/utils\.ts['"]/g,
        `from '../../lib/utils.ts'`,
    )
}

async function addComponents(
    components: string[],
    targetDir: string,
    force: boolean,
): Promise<void> {
    if (components.length === 0) {
        console.error(
            '❌ No components specified. Use "list" to see available components.',
        )
        Deno.exit(1)
    }

    const packageDir = getPackageDir()
    const toInstall = new Set<string>()
    const allDependencies: Record<string, string> = {}

    // Resolve all components and their dependencies
    for (const name of components) {
        if (!REGISTRY[name]) {
            console.error(`❌ Unknown component: ${name}`)
            console.log('   Use "list" to see available components.')
            Deno.exit(1)
        }
        toInstall.add(name)

        // Add internal dependencies
        const entry = REGISTRY[name]
        if (entry.internalDependencies) {
            for (const dep of entry.internalDependencies) {
                toInstall.add(dep)
            }
        }
    }

    // Collect all npm dependencies
    for (const name of toInstall) {
        const entry = REGISTRY[name]
        if (entry.dependencies) {
            Object.assign(allDependencies, entry.dependencies)
        }
    }

    console.log(`\n📦 Installing ${toInstall.size} component(s)...\n`)

    // Install each component
    for (const name of toInstall) {
        const entry = REGISTRY[name]

        for (const file of entry.files) {
            const targetPath = join(targetDir, file.target)
            const targetDirPath = dirname(targetPath)

            // Check if file exists
            if (!force && (await exists(targetPath))) {
                console.log(
                    `⏭️  Skipping ${file.target} (already exists, use --force to overwrite)`,
                )
                continue
            }

            // Read source file
            let content = await readSourceFile(packageDir, file.path)

            // Rewrite imports if needed
            if (file.path.startsWith('components/')) {
                content = rewriteImports(content, targetDir)
            }

            // Ensure target directory exists
            await ensureDir(targetDirPath)

            // Write file
            await Deno.writeTextFile(targetPath, content)
            console.log(`✅ Added ${file.target}`)
        }
    }

    // Print dependency instructions
    if (Object.keys(allDependencies).length > 0) {
        console.log('\n📝 Add these dependencies to your deno.json imports:\n')
        console.log('    "imports": {')
        for (const [name, version] of Object.entries(allDependencies)) {
            console.log(`        "${name}": "${version}",`)
        }
        console.log('    }')
    }

    console.log('\n✨ Done!')
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
    const args = parseArgs(Deno.args, {
        string: ['dir'],
        boolean: ['help', 'force'],
        alias: { h: 'help', d: 'dir', f: 'force' },
        default: { dir: DEFAULT_TARGET_DIR },
    })

    const [command, ...components] = args._ as string[]

    if (args.help || !command) {
        printHelp()
        return
    }

    switch (command) {
        case 'add':
            await addComponents(components, args.dir, args.force)
            break
        case 'list':
            printList()
            break
        default:
            console.error(`❌ Unknown command: ${command}`)
            printHelp()
            Deno.exit(1)
    }
}

main()
