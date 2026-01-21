/**
 * Package Structure Validation Tests
 *
 * Ensures all packages in the Lockness monorepo follow the standard structure:
 * - llms.txt: LLM documentation (llmstxt.org convention)
 * - README.md: Package documentation
 * - mod.ts: Package entry point
 *
 * These tests run in CI to catch missing files when new packages are added
 * or when package structure changes.
 */

import { assert, assertEquals } from '@std/assert'
import { exists } from '@std/fs'
import { join } from '@std/path'

/**
 * Required files for each package
 */
const REQUIRED_FILES = {
    'llms.txt': {
        description: 'LLM documentation file (llmstxt.org convention)',
        minLength: 100,
    },
    'README.md': {
        description: 'Package documentation',
        minLength: 50,
    },
    'mod.ts': {
        description: 'Package entry point',
        minLength: 10,
    },
} as const

type RequiredFile = keyof typeof REQUIRED_FILES

/**
 * All packages in the monorepo that should have standard structure
 */
const PACKAGES: string[] = [
    'auth',
    'auth-provider',
    'cache',
    'cli',
    'container',
    'core',
    'deprecation-contracts',
    'devtools',
    'drizzle',
    'events',
    'hono',
    'inertia',
    'init',
    'logger',
    'mail',
    'openapi',
    'queue',
    'session',
    'socialite',
    'sse',
    'storage',
    'ui',
    'upgrade',
    'validator',
]

/**
 * Packages exempted from certain file requirements
 * Key: package name, Value: array of files to exempt
 */
const EXEMPTIONS: Record<string, RequiredFile[]> = {
    // No exemptions - all packages including hono should have llms.txt
    // hono is an internal infrastructure package that bridges Hono dependency management
}

// =============================================================================
// Test: All packages should have required files
// =============================================================================

Deno.test('Package Structure - all packages should have llms.txt', async (t) => {
    const missing: string[] = []

    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('llms.txt')) continue

        await t.step(`checking ${pkg}/llms.txt`, async () => {
            const filePath = join('packages', pkg, 'llms.txt')
            const hasFile = await exists(filePath)

            if (!hasFile) missing.push(pkg)

            assert(hasFile, `Package "${pkg}" is missing llms.txt`)
        })
    }

    assertEquals(missing.length, 0, `Missing llms.txt: ${missing.join(', ')}`)
})

Deno.test('Package Structure - all packages should have README.md', async (t) => {
    const missing: string[] = []

    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('README.md')) continue

        await t.step(`checking ${pkg}/README.md`, async () => {
            const filePath = join('packages', pkg, 'README.md')
            const hasFile = await exists(filePath)

            if (!hasFile) missing.push(pkg)

            assert(hasFile, `Package "${pkg}" is missing README.md`)
        })
    }

    assertEquals(missing.length, 0, `Missing README.md: ${missing.join(', ')}`)
})

Deno.test('Package Structure - all packages should have mod.ts', async (t) => {
    const missing: string[] = []

    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('mod.ts')) continue

        await t.step(`checking ${pkg}/mod.ts`, async () => {
            const filePath = join('packages', pkg, 'mod.ts')
            const hasFile = await exists(filePath)

            if (!hasFile) missing.push(pkg)

            assert(hasFile, `Package "${pkg}" is missing mod.ts`)
        })
    }

    assertEquals(missing.length, 0, `Missing mod.ts: ${missing.join(', ')}`)
})

// =============================================================================
// Test: Files should not be empty
// =============================================================================

Deno.test('Package Structure - llms.txt files should not be empty', async (t) => {
    const tooShort: string[] = []

    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('llms.txt')) continue

        await t.step(`checking ${pkg}/llms.txt content`, async () => {
            const filePath = join('packages', pkg, 'llms.txt')

            if (await exists(filePath)) {
                const content = await Deno.readTextFile(filePath)
                const minLength = REQUIRED_FILES['llms.txt'].minLength

                if (content.trim().length < minLength) {
                    tooShort.push(pkg)
                }

                assert(
                    content.trim().length >= minLength,
                    `Package "${pkg}" llms.txt is too short (${content.trim().length} chars, min ${minLength})`,
                )
            }
        })
    }
})

Deno.test('Package Structure - README.md files should not be empty', async (t) => {
    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('README.md')) continue

        await t.step(`checking ${pkg}/README.md content`, async () => {
            const filePath = join('packages', pkg, 'README.md')

            if (await exists(filePath)) {
                const content = await Deno.readTextFile(filePath)
                const minLength = REQUIRED_FILES['README.md'].minLength

                assert(
                    content.trim().length >= minLength,
                    `Package "${pkg}" README.md is too short (${content.trim().length} chars, min ${minLength})`,
                )
            }
        })
    }
})

Deno.test('Package Structure - mod.ts should export something', async (t) => {
    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('mod.ts')) continue

        await t.step(`checking ${pkg}/mod.ts exports`, async () => {
            const filePath = join('packages', pkg, 'mod.ts')

            if (await exists(filePath)) {
                const content = await Deno.readTextFile(filePath)

                assert(
                    content.includes('export'),
                    `Package "${pkg}" mod.ts should contain exports`,
                )
            }
        })
    }
})

// =============================================================================
// Test: Detect new packages not in the list
// =============================================================================

Deno.test('Package Structure - detect unconfigured packages', async () => {
    const knownPackages = new Set(PACKAGES)
    const unconfigured: string[] = []

    for await (const entry of Deno.readDir('packages')) {
        if (entry.isDirectory && !entry.name.startsWith('.')) {
            const denoJsonPath = join('packages', entry.name, 'deno.json')
            const isPackage = await exists(denoJsonPath)

            if (isPackage && !knownPackages.has(entry.name)) {
                unconfigured.push(entry.name)
            }
        }
    }

    assertEquals(
        unconfigured.length,
        0,
        `New packages not in PACKAGES list: ${unconfigured.join(', ')}. ` +
            `Add them to tests/package_structure.test.ts`,
    )
})

// =============================================================================
// Test: Summary report
// =============================================================================

Deno.test('Package Structure - generate summary report', async () => {
    const report: Record<
        string,
        { llm: boolean; readme: boolean; mod: boolean }
    > = {}

    for (const pkg of PACKAGES) {
        report[pkg] = {
            llm: await exists(join('packages', pkg, 'llms.txt')),
            readme: await exists(join('packages', pkg, 'README.md')),
            mod: await exists(join('packages', pkg, 'mod.ts')),
        }
    }

    // Log summary
    console.log('\n📦 Package Structure Summary:')
    console.log('─'.repeat(50))

    const complete: string[] = []
    const incomplete: string[] = []

    for (const [pkg, status] of Object.entries(report)) {
        const isComplete = status.llm && status.readme && status.mod
        const icons = [
            status.llm ? '✓' : '✗',
            status.readme ? '✓' : '✗',
            status.mod ? '✓' : '✗',
        ]

        if (isComplete) {
            complete.push(pkg)
        } else {
            incomplete.push(pkg)
            console.log(
                `  ${pkg}: llm=${icons[0]} readme=${icons[1]} mod=${icons[2]}`,
            )
        }
    }

    console.log('─'.repeat(50))
    console.log(`Complete: ${complete.length}/${PACKAGES.length}`)

    if (incomplete.length > 0) {
        console.log(`Incomplete: ${incomplete.join(', ')}`)
    }
})
