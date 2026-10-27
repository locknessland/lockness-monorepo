/**
 * Documentation Structure Validation Tests
 *
 * Ensures documentation files exist in their colocated locations
 * and follow the expected format (H1 title, etc.).
 */

import { assert, assertEquals } from '@std/assert'
import { exists } from '@std/fs'
import { join } from '@std/path'

/**
 * Package-specific documentation files
 */
const PACKAGE_DOCS = [
    { package: 'auth', file: 'DOCS.md' },
    { package: 'cli', file: 'DOCS.md' },
    { package: 'core', file: 'routing.md' },
    { package: 'core', file: 'middleware.md' },
    { package: 'core', file: 'components.md' },
    { package: 'core', file: 'error-handling.md' },
    { package: 'container', file: 'DOCS.md' },
    { package: 'deprecation-contracts', file: 'DOCS.md' },
    { package: 'devtools', file: 'DOCS.md' },
    { package: 'session', file: 'DOCS.md' },
    { package: 'validator', file: 'DOCS.md' },
    { package: 'ui', file: 'DOCS.md' },
]

/**
 * General documentation files (not package-specific)
 */
const GENERAL_DOCS = [
    'installation.md',
    'getting-started.md',
    'contribution.md',
    'deployment.md',
    'models.md',
    'nessy.md',
]

// =============================================================================
// Test: Documentation files should exist
// =============================================================================

Deno.test('Docs Structure - packages should have docs/', async (t) => {
    for (const { package: pkg, file } of PACKAGE_DOCS) {
        await t.step(`checking packages/${pkg}/docs/${file}`, async () => {
            const path = join('packages', pkg, 'docs', file)
            const hasFile = await exists(path)
            assert(hasFile, `Missing: ${path}`)
        })
    }
})

Deno.test('Docs Structure - general docs should exist', async (t) => {
    for (const file of GENERAL_DOCS) {
        await t.step(`checking docs/${file}`, async () => {
            const path = join('docs', file)
            const hasFile = await exists(path)
            assert(hasFile, `Missing: ${path}`)
        })
    }
})

// =============================================================================
// Test: Documentation files should have H1 title
// =============================================================================

Deno.test('Docs Structure - docs should have H1 title', async (t) => {
    for (const { package: pkg, file } of PACKAGE_DOCS) {
        await t.step(
            `checking title in packages/${pkg}/docs/${file}`,
            async () => {
                const path = join('packages', pkg, 'docs', file)
                const content = await Deno.readTextFile(path)
                assert(
                    content.match(/^#\s+.+$/m),
                    `${path} should have an H1 title (# Title)`,
                )
            },
        )
    }

    for (const file of GENERAL_DOCS) {
        await t.step(`checking title in docs/${file}`, async () => {
            const path = join('docs', file)
            const content = await Deno.readTextFile(path)
            assert(
                content.match(/^#\s+.+$/m),
                `${path} should have an H1 title (# Title)`,
            )
        })
    }
})

// =============================================================================
// Test: Documentation files should not be empty
// =============================================================================

Deno.test('Docs Structure - docs should not be empty', async (t) => {
    const minLength = 100 // Minimum chars for meaningful documentation

    for (const { package: pkg, file } of PACKAGE_DOCS) {
        await t.step(
            `checking content in packages/${pkg}/docs/${file}`,
            async () => {
                const path = join('packages', pkg, 'docs', file)
                const content = await Deno.readTextFile(path)
                assert(
                    content.trim().length >= minLength,
                    `${path} is too short (${content.trim().length} chars, min ${minLength})`,
                )
            },
        )
    }

    for (const file of GENERAL_DOCS) {
        await t.step(`checking content in docs/${file}`, async () => {
            const path = join('docs', file)
            const content = await Deno.readTextFile(path)
            assert(
                content.trim().length >= minLength,
                `${path} is too short (${content.trim().length} chars, min ${minLength})`,
            )
        })
    }
})

// =============================================================================
// Test: Summary report
// =============================================================================

Deno.test('Docs Structure - generate summary report', async () => {
    console.log('\n📚 Documentation Structure Summary:')
    console.log('─'.repeat(60))

    let packageDocsCount = 0
    let generalDocsCount = 0

    // Check package docs
    for (const { package: pkg, file } of PACKAGE_DOCS) {
        const path = join('packages', pkg, 'docs', file)
        if (await exists(path)) {
            packageDocsCount++
        }
    }

    // Check general docs
    for (const file of GENERAL_DOCS) {
        const path = join('docs', file)
        if (await exists(path)) {
            generalDocsCount++
        }
    }

    console.log(`  Package docs: ${packageDocsCount}/${PACKAGE_DOCS.length}`)
    console.log(`  General docs: ${generalDocsCount}/${GENERAL_DOCS.length}`)
    console.log(
        `  Total: ${packageDocsCount + generalDocsCount}/${
            PACKAGE_DOCS.length + GENERAL_DOCS.length
        }`,
    )
    console.log('─'.repeat(60))

    // Verify completeness
    assertEquals(
        packageDocsCount,
        PACKAGE_DOCS.length,
        'Some package docs are missing',
    )
    assertEquals(
        generalDocsCount,
        GENERAL_DOCS.length,
        'Some general docs are missing',
    )
})
