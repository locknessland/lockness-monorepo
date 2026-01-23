#!/usr/bin/env -S deno run -A
/**
 * Script to reorganize UI components into folder structure
 * Each component gets its own folder with index.tsx and DOCS.md
 */

import { ensureDir } from '@std/fs'
import { join } from '@std/path'

const COMPONENTS_DIR = './packages/ui/components'

const COMPONENTS = [
    'Accordion',
    'Alert',
    'Badge',
    'Breadcrumb',
    'Button',
    'Card',
    'Chart',
    'ChartExtras',
    'Checkbox',
    'CircularProgress',
    'CodeBlock',
    'CopyButton',
    'FeatureCard',
    'Footer',
    'Gallery',
    'GaugeProgress',
    'Hero',
    'Input',
    'Kbd',
    'Label',
    'Link',
    'Modal',
    'Navbar',
    'Newsletter',
    'Pagination',
    'Pricing',
    'Progress',
    'RootLayout',
    'SearchBar',
    'Section',
    'Separator',
    'Sidebar',
    'Skeleton',
    'Spinner',
    'SteppedProgress',
    'Switch',
    'Table',
    'Tabs',
    'Textarea',
    'ThemeSwitch',
    'Title',
    'TreeView',
    'UploadZone',
]

async function reorganizeComponents() {
    console.log('🔄 Reorganizing UI components into folder structure...\n')

    for (const component of COMPONENTS) {
        const componentFile = join(COMPONENTS_DIR, `${component}.tsx`)
        const componentFolder = join(COMPONENTS_DIR, component)
        const indexFile = join(componentFolder, 'index.tsx')
        const docsFile = join(componentFolder, 'DOCS.md')

        try {
            // Check if component file exists
            const stat = await Deno.stat(componentFile)
            if (!stat.isFile) {
                console.log(`⚠️  ${component}.tsx is not a file, skipping...`)
                continue
            }

            // Create component folder
            await ensureDir(componentFolder)

            // Move component file to index.tsx
            await Deno.rename(componentFile, indexFile)
            console.log(`✅ Moved ${component}.tsx → ${component}/index.tsx`)

            // Create placeholder DOCS.md
            const docsContent = `# ${component}

Documentation for the ${component} component.

## Installation

\`\`\`bash
deno run -A jsr:@lockness/ui add ${component.toLowerCase()}
\`\`\`

## Usage

\`\`\`tsx
import { ${component} } from '@lockness/ui/components'

// Example usage here
\`\`\`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| TBD  | TBD  | TBD     | TBD         |

## Examples

### Basic Example

\`\`\`tsx
// Add example here
\`\`\`
`

            await Deno.writeTextFile(docsFile, docsContent)
            console.log(`📝 Created ${component}/DOCS.md\n`)
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                console.log(`⚠️  ${component}.tsx not found, skipping...\n`)
            } else {
                console.error(`❌ Error processing ${component}:`, error)
            }
        }
    }

    console.log('✨ Reorganization complete!')
}

if (import.meta.main) {
    await reorganizeComponents()
}
