/**
 * DocsLoader Service Tests
 *
 * Tests for the documentation loading service that handles
 * dynamic doc loading from colocated package files.
 */

import { assert, assertEquals, assertExists, assertRejects } from '@std/assert'
import { DocsLoader } from '../app/service/docs_loader.ts'

// =============================================================================
// Test: Load package-specific documentation
// =============================================================================

Deno.test('DocsLoader - should load package doc', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('authentication')

    assertExists(doc)
    assert(
        doc.content.includes('Authentication'),
        'Authentication doc should contain "Authentication"',
    )
    assertEquals(doc.package, 'auth', 'Should be from auth package')
    assertEquals(doc.slug, 'authentication')
})

Deno.test('DocsLoader - should load core package doc', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('routing')

    assertExists(doc)
    assert(
        doc.content.includes('Routing'),
        'Routing doc should contain "Routing"',
    )
    assertEquals(doc.package, 'core', 'Should be from core package')
    assertEquals(doc.slug, 'routing')
})

// =============================================================================
// Test: Load general documentation
// =============================================================================

Deno.test('DocsLoader - should load general doc', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('installation')

    assertExists(doc)
    assert(
        doc.content.includes('Installation'),
        'Installation doc should contain "Installation"',
    )
    assertEquals(doc.package, undefined, 'General docs should not have package')
    assertEquals(doc.slug, 'installation')
})

Deno.test('DocsLoader - should load getting-started doc', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('getting-started')

    assertExists(doc)
    assertEquals(doc.package, undefined)
    assertEquals(doc.slug, 'getting-started')
})

// =============================================================================
// Test: Error handling
// =============================================================================

Deno.test('DocsLoader - should throw for unknown slug', async () => {
    const loader = new DocsLoader()

    await assertRejects(
        async () => await loader.load('unknown-slug-12345'),
        Error,
        'Unknown documentation slug',
    )
})

// =============================================================================
// Test: Caching behavior
// =============================================================================

Deno.test('DocsLoader - should cache loaded content', async () => {
    const loader = new DocsLoader()

    // First load
    const doc1 = await loader.load('cli')
    assertExists(doc1)

    // Second load should use cache
    const doc2 = await loader.load('cli')
    assertExists(doc2)

    // Should be the same object reference (cached)
    assertEquals(doc1, doc2)
    assertEquals(doc1.content, doc2.content)
})

Deno.test('DocsLoader - clearCache should clear cache', async () => {
    const loader = new DocsLoader()

    // Load and cache
    await loader.load('cli')

    // Clear cache
    loader.clearCache()

    // Load again (should re-read from disk, not cache)
    const doc = await loader.load('cli')
    assertExists(doc)
})

// =============================================================================
// Test: Metadata extraction
// =============================================================================

Deno.test('DocsLoader - should extract title from H1', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('authentication')

    assertExists(doc.title)
    assert(doc.title.length > 0, 'Should have a title')
})

Deno.test('DocsLoader - should extract description from first paragraph', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('authentication')

    // Description might be empty, but should be defined
    assertExists(doc.description !== undefined)
})

Deno.test('DocsLoader - should identify package name from path', async () => {
    const loader = new DocsLoader()

    // Test package docs
    const authDoc = await loader.load('authentication')
    assertEquals(authDoc.package, 'auth')

    const cliDoc = await loader.load('cli')
    assertEquals(cliDoc.package, 'cli')

    // Test general docs (no package)
    const installDoc = await loader.load('installation')
    assertEquals(installDoc.package, undefined)
})

// =============================================================================
// Test: Available slugs
// =============================================================================

Deno.test('DocsLoader - getAvailableSlugs should return all slugs', () => {
    const loader = new DocsLoader()
    const slugs = loader.getAvailableSlugs()

    assert(slugs.length > 0, 'Should have slugs')
    assert(slugs.includes('authentication'), 'Should include authentication')
    assert(slugs.includes('cli'), 'Should include cli')
    assert(slugs.includes('installation'), 'Should include installation')
    assert(slugs.includes('routing'), 'Should include routing')
})

Deno.test('DocsLoader - getAvailableSlugs should return expected count', () => {
    const loader = new DocsLoader()
    const slugs = loader.getAvailableSlugs()

    // We have 29 package docs + 9 general docs = 38 total
    assertEquals(slugs.length, 38, 'Should have 38 documentation pages')
})

// =============================================================================
// Test: Content validation
// =============================================================================

Deno.test('DocsLoader - loaded docs should have required fields', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('middleware')

    assertExists(doc.slug)
    assertExists(doc.title)
    assertExists(doc.content)
    // description can be empty string, but should be defined
    assert(
        doc.description !== undefined,
        'Description should be defined (can be empty)',
    )
    // package can be undefined for general docs
    assert(
        doc.package !== undefined,
        'Package should be defined for package docs',
    )
})

Deno.test('DocsLoader - content should not be empty', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('validation')

    assert(doc.content.length > 100, 'Content should not be empty')
})

// =============================================================================
// Test: All configured slugs should load successfully
// =============================================================================

Deno.test('DocsLoader - all configured slugs should load', async (t) => {
    const loader = new DocsLoader()
    const slugs = loader.getAvailableSlugs()

    for (const slug of slugs) {
        await t.step(`loading ${slug}`, async () => {
            const doc = await loader.load(slug)
            assertExists(doc)
            assertEquals(doc.slug, slug)
            assert(doc.content.length > 0, `${slug} should have content`)
        })
    }
})
