#!/usr/bin/env -S deno run -A
/**
 * @fileoverview CLI for adding UI components to your project.
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
 * @module @lockness/ui
 */

import { parseArgs } from '@std/cli/parse-args'
import { ensureDir } from '@std/fs/ensure-dir'
import { exists } from '@std/fs/exists'
import { dirname, fromFileUrl, join } from '@std/path'
import { parse as parseJsonc } from '@std/jsonc'
import config from './deno.json' with { type: 'json' }

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
const VERSION = config.version
const JSR_PACKAGE_NAME = '@lockness/ui'
const JSR_BASE_URL = 'https://jsr.io'

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
    icons: {
        name: 'icons',
        description:
            'SVG icon components (CheckCircleIcon, XCircleIcon, ArrowRightIcon, etc.)',
        files: [{ path: 'icons.tsx', target: 'lib/icons.tsx' }],
    },
    button: {
        name: 'button',
        description: 'Flexible button component with variants and sizes',
        files: [
            {
                path: 'components/Button/mod.tsx',
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
            {
                path: 'components/Card/mod.tsx',
                target: 'components/ui/Card.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'root-layout': {
        name: 'root-layout',
        description: 'Base HTML layout with Unpoly CDN integration',
        files: [
            {
                path: 'components/RootLayout/mod.tsx',
                target: 'components/ui/RootLayout.tsx',
            },
        ],
    },
    label: {
        name: 'label',
        description: 'Form label component with consistent styling',
        files: [
            {
                path: 'components/Label/mod.tsx',
                target: 'components/ui/Label.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    input: {
        name: 'input',
        description: 'Text input component with variants',
        files: [
            {
                path: 'components/Input/mod.tsx',
                target: 'components/ui/Input.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    textarea: {
        name: 'textarea',
        description: 'Multi-line text input component',
        files: [
            {
                path: 'components/Textarea/mod.tsx',
                target: 'components/ui/Textarea.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    badge: {
        name: 'badge',
        description: 'Badge/label component for tags and status',
        files: [
            {
                path: 'components/Badge/mod.tsx',
                target: 'components/ui/Badge.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    separator: {
        name: 'separator',
        description: 'Visual divider line component',
        files: [
            {
                path: 'components/Separator/mod.tsx',
                target: 'components/ui/Separator.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    skeleton: {
        name: 'skeleton',
        description: 'Loading placeholder with animated pulse',
        files: [
            {
                path: 'components/Skeleton/mod.tsx',
                target: 'components/ui/Skeleton.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    alert: {
        name: 'alert',
        description:
            'Alert message component (Alert, AlertTitle, AlertDescription)',
        files: [
            {
                path: 'components/Alert/mod.tsx',
                target: 'components/ui/Alert.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    kbd: {
        name: 'kbd',
        description: 'Keyboard shortcut display component',
        files: [
            {
                path: 'components/Kbd/mod.tsx',
                target: 'components/ui/Kbd.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    checkbox: {
        name: 'checkbox',
        description: 'Checkbox input with custom styling',
        files: [
            {
                path: 'components/Checkbox/mod.tsx',
                target: 'components/ui/Checkbox.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    switch: {
        name: 'switch',
        description: 'Toggle switch component',
        files: [
            {
                path: 'components/Switch/mod.tsx',
                target: 'components/ui/Switch.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    breadcrumb: {
        name: 'breadcrumb',
        description:
            'Breadcrumb navigation (Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage)',
        files: [
            {
                path: 'components/Breadcrumb/mod.tsx',
                target: 'components/ui/Breadcrumb.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    tabs: {
        name: 'tabs',
        description:
            'Tabbed interface (Tabs, TabsList, TabsTrigger, TabsContent)',
        files: [
            {
                path: 'components/Tabs/mod.tsx',
                target: 'components/ui/Tabs.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    accordion: {
        name: 'accordion',
        description:
            'Collapsible sections (Accordion, AccordionItem, AccordionTrigger, AccordionContent)',
        files: [
            {
                path: 'components/Accordion/mod.tsx',
                target: 'components/ui/Accordion.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    title: {
        name: 'title',
        description:
            'Typography heading component with CSS variable sizing (h1-h6)',
        files: [
            {
                path: 'components/Title/mod.tsx',
                target: 'components/ui/Title.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    pricing: {
        name: 'pricing',
        description:
            'Pricing components (PricingCard, PricingCardHeader, PricingCardPrice, PricingCardFeatures, PricingToggle, PricingComparison)',
        files: [
            {
                path: 'components/Pricing/mod.tsx',
                target: 'components/ui/Pricing.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons', 'button', 'card', 'badge'],
    },
    'theme-switch': {
        name: 'theme-switch',
        description:
            'Dual-button theme switcher optimized for Preline UI dark mode system',
        files: [
            {
                path: 'components/ThemeSwitch/mod.tsx',
                target: 'components/ui/ThemeSwitch.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'search-bar': {
        name: 'search-bar',
        description:
            'Customizable search bar with variants, sizes, and Unpoly integration',
        files: [
            {
                path: 'components/SearchBar/mod.tsx',
                target: 'components/ui/SearchBar.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
    },
    progress: {
        name: 'progress',
        description: 'Progress bar component',
        files: [
            {
                path: 'components/Progress/mod.tsx',
                target: 'components/ui/Progress.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'circular-progress': {
        name: 'circular-progress',
        description: 'Circular progress indicator',
        files: [
            {
                path: 'components/CircularProgress/mod.tsx',
                target: 'components/ui/CircularProgress.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'stepped-progress': {
        name: 'stepped-progress',
        description: 'Step-by-step progress tracker',
        files: [
            {
                path: 'components/SteppedProgress/mod.tsx',
                target: 'components/ui/SteppedProgress.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
    },
    'gauge-progress': {
        name: 'gauge-progress',
        description: 'Gauge/meter style progress',
        files: [
            {
                path: 'components/GaugeProgress/mod.tsx',
                target: 'components/ui/GaugeProgress.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'code-block': {
        name: 'code-block',
        description: 'Syntax highlighting code block',
        files: [
            {
                path: 'components/CodeBlock/mod.tsx',
                target: 'components/ui/CodeBlock/mod.tsx',
            },
            {
                path: 'components/CodeBlock/styles.tsx',
                target: 'components/ui/CodeBlock/styles.tsx',
            },
            {
                path: 'components/CodeBlock/themes.ts',
                target: 'components/ui/CodeBlock/themes.ts',
            },
        ],
        dependencies: {
            'highlight.js': 'npm:highlight.js@^11.9.0',
        },
        internalDependencies: ['utils', 'icons'],
    },
    'copy-button': {
        name: 'copy-button',
        description: 'Copy to clipboard button',
        files: [
            {
                path: 'components/CopyButton/mod.tsx',
                target: 'components/ui/CopyButton.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    chart: {
        name: 'chart',
        description: 'Chart components using Chart.js',
        files: [
            {
                path: 'components/Chart/mod.tsx',
                target: 'components/ui/Chart.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'chart-extras': {
        name: 'chart-extras',
        description: 'Extra chart components (Pie, Bubble, etc.)',
        files: [
            {
                path: 'components/ChartExtras/mod.tsx',
                target: 'components/ui/ChartExtras.tsx',
            },
        ],
        internalDependencies: ['utils', 'chart'],
    },
    'feature-card': {
        name: 'feature-card',
        description: 'Card for displaying features',
        files: [
            {
                path: 'components/FeatureCard/mod.tsx',
                target: 'components/ui/FeatureCard.tsx',
            },
        ],
        internalDependencies: ['utils', 'card', 'icons'],
    },
    footer: {
        name: 'footer',
        description: 'Footer component sections',
        files: [
            {
                path: 'components/Footer/mod.tsx',
                target: 'components/ui/Footer.tsx',
            },
        ],
        internalDependencies: ['utils', 'section', 'link'],
    },
    gallery: {
        name: 'gallery',
        description: 'Image gallery with lightbox and layouts',
        files: [
            {
                path: 'components/Gallery/mod.tsx',
                target: 'components/ui/Gallery.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
    },
    hero: {
        name: 'hero',
        description: 'Hero sections for landing pages',
        files: [
            {
                path: 'components/Hero/mod.tsx',
                target: 'components/ui/Hero.tsx',
            },
        ],
        internalDependencies: ['utils', 'button', 'badge', 'link'],
    },
    link: {
        name: 'link',
        description: 'Enhanced link component',
        files: [
            {
                path: 'components/Link/mod.tsx',
                target: 'components/ui/Link.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    modal: {
        name: 'modal',
        description: 'Dialog/Modal component',
        files: [
            {
                path: 'components/Modal/mod.tsx',
                target: 'components/ui/Modal.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons', 'button'],
    },
    navbar: {
        name: 'navbar',
        description: 'Navigation bar component',
        files: [
            {
                path: 'components/Navbar/mod.tsx',
                target: 'components/ui/Navbar.tsx',
            },
        ],
        internalDependencies: ['utils', 'button', 'link'],
    },
    newsletter: {
        name: 'newsletter',
        description: 'Newsletter subscription form section',
        files: [
            {
                path: 'components/Newsletter/mod.tsx',
                target: 'components/ui/Newsletter.tsx',
            },
        ],
        internalDependencies: ['utils', 'button', 'input', 'section'],
    },
    pagination: {
        name: 'pagination',
        description: 'Pagination controls',
        files: [
            {
                path: 'components/Pagination/mod.tsx',
                target: 'components/ui/Pagination.tsx',
            },
        ],
        internalDependencies: ['utils', 'button', 'icons'],
    },
    section: {
        name: 'section',
        description: 'Page section layout component',
        files: [
            {
                path: 'components/Section/mod.tsx',
                target: 'components/ui/Section.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    sidebar: {
        name: 'sidebar',
        description: 'Sidebar navigation component',
        files: [
            {
                path: 'components/Sidebar/mod.tsx',
                target: 'components/ui/Sidebar.tsx',
            },
        ],
        internalDependencies: [
            'utils',
            'button',
            'separator',
            'skeleton',
            'input',
            'icons',
        ],
    },
    spinner: {
        name: 'spinner',
        description: 'Loading spinner component',
        files: [
            {
                path: 'components/Spinner/mod.tsx',
                target: 'components/ui/Spinner.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    table: {
        name: 'table',
        description: 'Data table component',
        files: [
            {
                path: 'components/Table/mod.tsx',
                target: 'components/ui/Table.tsx',
            },
        ],
        internalDependencies: ['utils'],
    },
    'tree-view': {
        name: 'tree-view',
        description: 'Hierarchical tree view component',
        files: [
            {
                path: 'components/TreeView/mod.tsx',
                target: 'components/ui/TreeView.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
    },
    'upload-zone': {
        name: 'upload-zone',
        description: 'File upload area with drag and drop',
        files: [
            {
                path: 'components/UploadZone/mod.tsx',
                target: 'components/ui/UploadZone.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons', 'button'],
    },
    video: {
        name: 'video',
        description: 'Video player component',
        files: [
            {
                path: 'components/Video/mod.tsx',
                target: 'components/ui/Video.tsx',
            },
        ],
        internalDependencies: ['utils', 'icons'],
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

/**
 * Get the package directory for reading component source files.
 *
 * - For local execution (file:// URL): Returns the directory where mod.ts is located
 * - For remote execution (JSR): Creates and returns a cache directory at
 *   ~/.lockness/ui-cache/<version>/ for faster subsequent runs
 *
 * Performance note: The cache directory is created asynchronously on first remote
 * execution. Subsequent executions reuse the same cache directory for the version.
 *
 * @returns The absolute path to the package directory or cache directory
 */
async function getPackageDir(): Promise<string> {
    // Get the directory where this script is located
    const moduleUrl = import.meta.url
    if (moduleUrl.startsWith('file://')) {
        return dirname(fromFileUrl(moduleUrl))
    }

    // For remote execution (JSR), create a cache directory
    const cacheDir = join(
        Deno.env.get('HOME') || Deno.env.get('USERPROFILE') || '/tmp',
        '.lockness',
        'ui-cache',
        VERSION,
    )
    await ensureDir(cacheDir)
    return cacheDir
}

async function readSourceFile(
    packageDir: string,
    filePath: string,
): Promise<string> {
    const moduleUrl = import.meta.url

    // Local execution: read from filesystem
    if (moduleUrl.startsWith('file://')) {
        const fullPath = join(packageDir, filePath)
        return await Deno.readTextFile(fullPath)
    }

    // Remote execution: check cache first, then fetch from JSR
    const cachedPath = join(packageDir, filePath)

    // Check if cached file exists
    if (await exists(cachedPath)) {
        return await Deno.readTextFile(cachedPath)
    }

    // Fetch from JSR
    const jsrUrl = `${JSR_BASE_URL}/${JSR_PACKAGE_NAME}/${VERSION}/${filePath}`

    try {
        const response = await fetch(jsrUrl)
        if (!response.ok) {
            throw new Error(
                `Failed to fetch ${filePath}: ${response.status} ${response.statusText}`,
            )
        }
        const content = await response.text()

        // Cache the file
        const cachedFilePath = join(packageDir, filePath)
        await ensureDir(dirname(cachedFilePath))
        await Deno.writeTextFile(cachedFilePath, content)

        return content
    } catch (error) {
        throw new Error(
            `Failed to fetch component file from JSR (${jsrUrl}): ${
                error instanceof Error ? error.message : String(error)
            }`,
        )
    }
}

function rewriteImports(content: string, _targetDir: string): string {
    return content
        // Rewrite import paths from ../lib/utils.ts to correct relative path
        // From components/ui/Button.tsx to lib/utils.ts is ../../lib/utils.ts
        .replace(
            /from ['"]\.\.\/lib\/utils\.ts['"]/g,
            `from '../../lib/utils.ts'`,
        )
        // Rewrite imports from ../icons.tsx to ../../lib/icons.tsx
        // From components/ui/Pricing.tsx to lib/icons.tsx
        .replace(
            /from ['"]\.\.\/icons\.tsx['"]/g,
            `from '../../lib/icons.tsx'`,
        )
        // Rewrite relative component imports to stay in same directory
        // ./Button.tsx, ./Card.tsx, ./Badge.tsx stay as-is (same components/ui/ folder)
        // No change needed for these as they remain relative within components/ui/
        // Normalize npm imports to use import map aliases
        // npm:clsx@2.1.1 -> clsx
        .replace(/from ['"]npm:clsx(@[^'"]+)?['"]/g, "from 'clsx'")
        .replace(
            /from ['"]npm:tailwind-merge(@[^'"]+)?['"]/g,
            "from 'tailwind-merge'",
        )
}

async function updateDenoConfig(
    dependencies: Record<string, string>,
): Promise<void> {
    // Find deno.json or deno.jsonc
    const configFiles = ['deno.jsonc', 'deno.json']
    let configPath: string | null = null
    let configContent = ''

    for (const file of configFiles) {
        if (await exists(file)) {
            configPath = file
            configContent = await Deno.readTextFile(file)
            break
        }
    }

    if (!configPath) {
        console.log(
            '\n⚠️  No deno.json or deno.jsonc found. Please add dependencies manually:',
        )
        console.log('\n    "imports": {')
        for (const [name, version] of Object.entries(dependencies)) {
            console.log(`        "${name}": "${version}",`)
        }
        console.log('    }')
        return
    }

    try {
        const config = parseJsonc(configContent) as Record<string, any>

        // Ensure imports object exists
        if (!config.imports) {
            config.imports = {}
        }

        // Add new dependencies
        let added = false
        for (const [name, version] of Object.entries(dependencies)) {
            if (!config.imports[name]) {
                config.imports[name] = version
                added = true
                console.log(`📦 Added ${name} to ${configPath}`)
            }
        }

        if (added) {
            // Write back to file preserving JSONC format
            const newContent = JSON.stringify(config, null, 4)
            await Deno.writeTextFile(configPath, newContent + '\n')
        } else {
            console.log('\n✓ All dependencies already present in imports')
        }
    } catch (error) {
        console.error(
            `\n⚠️  Failed to update ${configPath}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        )
        console.log('\n   Please add dependencies manually:')
        console.log('\n    "imports": {')
        for (const [name, version] of Object.entries(dependencies)) {
            console.log(`        "${name}": "${version}",`)
        }
        console.log('    }')
    }
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

    const packageDir = await getPackageDir()
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

    console.log(`\n📦 Processing ${toInstall.size} component(s)...\n`)

    // Install each component
    let addedCount = 0
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

            // Rewrite imports to normalize dependencies and fix paths
            content = rewriteImports(content, targetDir)

            // Ensure target directory exists
            await ensureDir(targetDirPath)

            // Write file
            await Deno.writeTextFile(targetPath, content)
            console.log(`✅ Added ${file.target}`)
            addedCount++
        }
    }

    // Summary
    if (addedCount === 0) {
        console.log('\n✓ No files were added (all already exist)')
    } else if (addedCount === 1) {
        console.log('\n✓ Successfully added 1 file')
    } else {
        console.log(`\n✓ Successfully added ${addedCount} files`)
    }

    // Update deno.json/deno.jsonc automatically
    if (Object.keys(allDependencies).length > 0) {
        await updateDenoConfig(allDependencies)
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

// Run the CLI with proper error handling
if (import.meta.main) {
    main().catch((error) => {
        console.error('❌ Error:', error.message)
        Deno.exit(1)
    })
}
