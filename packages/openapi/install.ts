#!/usr/bin/env -S deno run -A
/**
 * @fileoverview OpenAPI package installer: configures `@lockness/openapi` in
 * the current Lockness project.
 *
 * Its work is the default-exported {@link install}, which reports failure by
 * throwing and never touches process state; run as a script, `runEntry`
 * prints the failure once and sets a non-zero exit status (#436).
 *
 * Usage:
 *   deno run -A jsr:@lockness/openapi/install
 *   or
 *   deno task cli package:install openapi
 *
 * @module @lockness/openapi/install
 */

import { addPackage, Stub } from '@lockness/cli'
import { CommandFailedError, runSteps } from '@lockness/cli/command-failure'
import { runEntry } from '@lockness/cli/entry'
import { dirname, fromFileUrl, join } from '@std/path'

/**
 * Whether `path` exists. Only "not found" means no; any other error (a
 * permission denied, say) is a real failure and propagates.
 */
async function exists(path: string): Promise<boolean> {
    try {
        await Deno.stat(path)
        return true
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return false
        throw error
    }
}

/**
 * Write `app/controller/api_docs_controller.ts` unless it already exists.
 *
 * @returns Whether the controller was created.
 */
async function createDocsController(): Promise<boolean> {
    const controllerPath = './app/controller/api_docs_controller.ts'

    if (await exists(controllerPath)) {
        console.log('ℹ️  ApiDocsController already exists, skipping...')
        return false
    }

    // Handle both local file:// and remote https:// URLs
    const stubsDir = import.meta.url.startsWith('file://')
        ? join(dirname(fromFileUrl(import.meta.url)), 'stubs')
        : new URL('./stubs', import.meta.url).href

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
    console.log('✓ Created app/controller/api_docs_controller.ts')
    console.log('\n⚠️  Routes need to be regenerated:')
    console.log('   Run: deno task routes:generate')
    return true
}

/**
 * Refuse to run outside a Lockness project, before anything is written.
 *
 * @throws {CommandFailedError} When the project layout is missing.
 */
async function checkProjectStructure(): Promise<void> {
    const checks = [
        { path: './app/controller', name: 'app/controller directory' },
        { path: './deno.json', name: 'deno.json' },
    ]

    for (const check of checks) {
        if (!(await exists(check.path))) {
            throw new CommandFailedError(
                `${check.name} not found. Are you in a Lockness project?`,
            )
        }
    }
}

/**
 * Install `@lockness/openapi` into the project in the current directory:
 * register the package in `deno.json` and scaffold `ApiDocsController`.
 *
 * Both steps run even when the other fails (#436, FR-010); then one failure
 * names the steps that failed.
 *
 * @returns A promise that resolves once the package is installed.
 * @throws {CommandFailedError} When the current directory is not a Lockness
 * project, or when a step failed.
 *
 * @example
 * ```ts
 * import install from '@lockness/openapi/install'
 *
 * await install()
 * ```
 */
export default async function install(): Promise<void> {
    console.log('🌊 Installing @lockness/openapi...\n')

    await checkProjectStructure()

    let changesMade = false
    await runSteps([
        {
            label: 'add to deno.json',
            run: async () => {
                await addPackage('openapi')
                changesMade = true
            },
        },
        {
            label: 'ApiDocsController',
            run: async () => {
                if (await createDocsController()) changesMade = true
            },
        },
    ])

    if (!changesMade) {
        console.log('\n✓ @lockness/openapi is already configured\n')
        return
    }

    console.log('\n✅ @lockness/openapi installed successfully!\n')
    console.log('📖 Next steps:')
    console.log('   1. Start your dev server: deno task dev')
    console.log('   2. Visit: http://localhost:8888/api-docs')
    console.log('   3. Document your routes with @ApiDoc decorator\n')
    console.log('📝 Generate static OpenAPI spec:')
    console.log('   deno task cli docs:generate\n')
    console.log('📚 Documentation:')
    console.log(
        '   https://github.com/locknessland/lockness-monorepo/tree/main/packages/openapi\n',
    )
}

if (import.meta.main) await runEntry('openapi install', () => install())
