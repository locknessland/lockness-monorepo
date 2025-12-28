#!/usr/bin/env -S deno run -A
/**
 * OpenAPI Package Installer
 *
 * Automatically configures the @lockness/openapi package in your project.
 *
 * Usage:
 *   deno run -A jsr:@lockness/openapi/install
 *   or
 *   deno task cli package:install openapi
 */

import { addPackage, Stub } from '@lockness/cli'
import { dirname, fromFileUrl, join } from '@std/path'

async function createDocsController() {
    const controllerPath = './src/controller/api_docs_controller.ts'

    try {
        await Deno.stat(controllerPath)
        console.log('ℹ️  ApiDocsController already exists, skipping...')
        return false
    } catch {
        // Handle both local file:// and remote https:// URLs
        let stubsDir: string
        if (import.meta.url.startsWith('file://')) {
            const currentDir = dirname(fromFileUrl(import.meta.url))
            stubsDir = join(currentDir, 'stubs')
        } else {
            stubsDir = new URL('./stubs', import.meta.url).href
        }

        const content = await Stub.renderFrom(
            stubsDir,
            '',
            'api_docs_controller',
            {
                title: 'Lockness API',
                version: '1.0.0',
                description: 'Full-stack Deno framework API documentation',
            },
        )

        await Deno.writeTextFile(controllerPath, content)
        console.log('✓ Created src/controller/api_docs_controller.ts')
        return true
    }
}

async function checkProjectStructure() {
    const checks = [
        { path: './src/controller', name: 'src/controller directory' },
        { path: './deno.json', name: 'deno.json' },
    ]

    for (const check of checks) {
        try {
            await Deno.stat(check.path)
        } catch {
            console.error(
                `❌ ${check.name} not found. Are you in a Lockness project?`,
            )
            return false
        }
    }
    return true
}

async function main() {
    console.log('🌊 Installing @lockness/openapi...\n')

    // Check if we're in a valid Lockness project
    if (!(await checkProjectStructure())) {
        Deno.exit(1)
    }

    let changesMade = false

    // 1. Add package to deno.json
    try {
        await addPackage('openapi')
        changesMade = true
    } catch (error) {
        console.error('❌ Failed to add package to deno.json:', error)
    }

    // 2. Create ApiDocsController
    const controllerCreated = await createDocsController()
    if (controllerCreated) {
        changesMade = true
    }

    // 3. Check if routes need to be regenerated
    if (controllerCreated) {
        console.log('\n⚠️  Routes need to be regenerated:')
        console.log('   Run: deno task routes:generate')
    }

    // 4. Display success message
    if (changesMade) {
        console.log('\n✅ @lockness/openapi installed successfully!\n')
        console.log('📖 Next steps:')
        console.log('   1. Start your dev server: deno task dev')
        console.log('   2. Visit: http://localhost:8888/api-docs')
        console.log('   3. Document your routes with @ApiDoc decorator\n')
        console.log('📝 Generate static OpenAPI spec:')
        console.log('   deno task cli docs:generate\n')
        console.log('📚 Documentation:')
        console.log(
            '   https://github.com/locknessland/lockness/tree/main/lockness/openapi\n',
        )
    } else {
        console.log('\n✓ @lockness/openapi is already configured\n')
    }
}

if (import.meta.main) {
    await main()
}
