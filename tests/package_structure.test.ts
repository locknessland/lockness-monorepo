/**
 * Package Structure Validation Tests
 *
 * Ensures all packages in the Lockness monorepo follow the standard structure:
 * - README.md: Package documentation
 * - mod.ts: Package entry point
 *
 * Note: llms.txt is no longer a required static file - packages now use
 * dynamic LLM generation from docs/DOCS.md files served via DocsLoader.
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
    'README.md': {
        description: 'Package documentation',
        minLength: 50,
    },
    'mod.ts': {
        description: 'Package entry point',
        minLength: 10,
    },
    'AGENTS.md': {
        description:
            'Agent-facing brief: role, public surface, dependency edges, pitfalls',
        minLength: 400,
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
    'contract',
    'core',
    'deprecation-contracts',
    'devtools',
    'drizzle',
    'events',
    'features',
    'hono',
    'inertia',
    'init',
    'logger',
    'i18n',
    'mail',
    'markdown',
    'notification',
    'openapi',
    'realtime',
    'search',
    'queue',
    'redis',
    'crypto',
    'telemetry',
    'scheduler',
    'session',
    'socialite',
    'sse',
    'storage',
    'testing',
    'ui',
    'upgrade',
    'validator',
    'vite',
]

/**
 * Packages exempted from certain file requirements
 * Key: package name, Value: array of files to exempt
 *
 * Note: llms.txt is no longer a required static file - packages now use
 * dynamic LLM generation from docs/DOCS.md files served via DocsLoader.
 */
const EXEMPTIONS: Record<string, RequiredFile[]> = {
    // ui package mod.ts is a CLI entry point, not a module with exports
    ui: ['mod.ts'],
}

// =============================================================================
// Test: All packages should have required files
// =============================================================================

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
            // Check for either mod.ts or mod.tsx (JSX packages)
            const tsPath = join('packages', pkg, 'mod.ts')
            const tsxPath = join('packages', pkg, 'mod.tsx')
            const hasFile = await exists(tsPath) || await exists(tsxPath)

            if (!hasFile) missing.push(pkg)

            assert(hasFile, `Package "${pkg}" is missing mod.ts or mod.tsx`)
        })
    }

    assertEquals(missing.length, 0, `Missing mod.ts: ${missing.join(', ')}`)
})

Deno.test('Package Structure - all packages should have AGENTS.md', async (t) => {
    const missing: string[] = []

    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('AGENTS.md')) continue

        await t.step(`checking ${pkg}/AGENTS.md`, async () => {
            const filePath = join('packages', pkg, 'AGENTS.md')
            const hasFile = await exists(filePath)

            if (!hasFile) missing.push(pkg)

            assert(hasFile, `Package "${pkg}" is missing AGENTS.md`)
        })
    }

    assertEquals(missing.length, 0, `Missing AGENTS.md: ${missing.join(', ')}`)
})

// =============================================================================
// Test: Files should not be empty
// =============================================================================

// Note: llms.txt tests removed - packages now use dynamic LLM generation
// from docs/DOCS.md files served via DocsLoader at /llms/{slug}.txt

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

Deno.test('Package Structure - AGENTS.md files should be substantive', async (t) => {
    for (const pkg of PACKAGES) {
        if (EXEMPTIONS[pkg]?.includes('AGENTS.md')) continue

        await t.step(`checking ${pkg}/AGENTS.md content`, async () => {
            const filePath = join('packages', pkg, 'AGENTS.md')

            if (await exists(filePath)) {
                const content = await Deno.readTextFile(filePath)
                const minLength = REQUIRED_FILES['AGENTS.md'].minLength

                assert(
                    content.trim().length >= minLength,
                    `Package "${pkg}" AGENTS.md is too short (${content.trim().length} chars, min ${minLength})`,
                )

                // A brief without these is a stub, not a brief.
                for (
                    const heading of [
                        '## Invariants',
                        '## Dependency contract',
                        '## Public surface',
                        '## Where to work',
                        '## Pitfalls',
                        '## Tests',
                        '## Before you call it done',
                    ]
                ) {
                    assert(
                        content.includes(heading),
                        `Package "${pkg}" AGENTS.md is missing the "${heading}" section`,
                    )
                }

                // The generated blocks must be present and closed. A brief
                // whose markers were hand-edited away stops being refreshed by
                // `deno task agents:brief` and starts drifting silently — the
                // exact failure the generator exists to prevent.
                for (const marker of ['deps', 'surface', 'tests', 'gate']) {
                    assert(
                        content.includes(`<!-- generated:${marker} -->`) &&
                            content.includes(`<!-- /generated:${marker} -->`),
                        `Package "${pkg}" AGENTS.md is missing the "${marker}" generated block`,
                    )
                }
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
        { readme: boolean; mod: boolean }
    > = {}

    for (const pkg of PACKAGES) {
        const hasModTs = await exists(join('packages', pkg, 'mod.ts'))
        const hasModTsx = await exists(join('packages', pkg, 'mod.tsx'))
        report[pkg] = {
            readme: await exists(join('packages', pkg, 'README.md')),
            mod: hasModTs || hasModTsx,
        }
    }

    // Log summary
    console.log('\n📦 Package Structure Summary:')
    console.log('─'.repeat(50))

    const complete: string[] = []
    const incomplete: string[] = []

    for (const [pkg, status] of Object.entries(report)) {
        const isComplete = status.readme && status.mod
        const icons = [
            status.readme ? '✓' : '✗',
            status.mod ? '✓' : '✗',
        ]

        if (isComplete) {
            complete.push(pkg)
        } else {
            incomplete.push(pkg)
            console.log(`  ${pkg}: readme=${icons[0]} mod=${icons[1]}`)
        }
    }

    console.log('─'.repeat(50))
    console.log(`Complete: ${complete.length}/${PACKAGES.length}`)

    if (incomplete.length > 0) {
        console.log(`Incomplete: ${incomplete.join(', ')}`)
    }
})
