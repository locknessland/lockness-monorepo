/**
 * Tests for UiDocLoader service
 */

import { assertEquals, assertRejects, assertStrictEquals } from '@std/assert'
import { UiDocLoader } from '../doc_loader.ts'

Deno.test('UiDocLoader - load() returns parsed documentation', async () => {
    const loader = new UiDocLoader()

    const doc = await loader.load('buttons')

    assertEquals(doc.slug, 'buttons')
    assertEquals(doc.name, 'Button')
    assertEquals(typeof doc.title, 'string')
    assertEquals(typeof doc.content, 'string')
    assertEquals(doc.content.includes('# '), true) // Has markdown heading
})

Deno.test('UiDocLoader - load() throws on unknown slug', async () => {
    const loader = new UiDocLoader()

    await assertRejects(
        () => loader.load('unknown-component'),
        Error,
        'Unknown component slug',
    )
})

Deno.test('UiDocLoader - load() caches results', async () => {
    const loader = new UiDocLoader()

    const doc1 = await loader.load('buttons')
    const doc2 = await loader.load('buttons')

    // STRICT: a cache that re-parsed and returned an equal object would pass
    // structural equality while caching nothing.
    assertStrictEquals(doc1, doc2)
})

Deno.test('UiDocLoader - clearCache() removes cached docs', async () => {
    const loader = new UiDocLoader()

    await loader.load('buttons')
    loader.clearCache()

    // Should not throw, will reload from file
    const doc = await loader.load('buttons')
    assertEquals(doc.slug, 'buttons')
})

Deno.test('UiDocLoader - getAvailableSlugs() returns slug list', () => {
    const loader = new UiDocLoader()

    const slugs = loader.getAvailableSlugs()

    assertEquals(Array.isArray(slugs), true)
    assertEquals(slugs.includes('buttons'), true)
    assertEquals(slugs.includes('cards'), true)
    assertEquals(slugs.includes('alerts'), true)
})

Deno.test('UiDocLoader - hasSlug() validates slugs', () => {
    const loader = new UiDocLoader()

    assertEquals(loader.hasSlug('buttons'), true)
    assertEquals(loader.hasSlug('cards'), true)
    assertEquals(loader.hasSlug('unknown'), false)
})

Deno.test('UiDocLoader - getSlugMapping() returns mapping', () => {
    const loader = new UiDocLoader()

    const mapping = loader.getSlugMapping()

    assertEquals(typeof mapping, 'object')
    assertEquals(mapping['buttons'], 'Button')
    assertEquals(mapping['cards'], 'Card')
})

Deno.test('UiDocLoader - parseDoc extracts title from H1', async () => {
    const loader = new UiDocLoader()

    const doc = await loader.load('buttons')

    // The placeholder DOCS.md starts with "# Button"
    assertEquals(doc.title, 'Button')
})

Deno.test('UiDocLoader - multiple components can be loaded', async () => {
    const loader = new UiDocLoader()

    const button = await loader.load('buttons')
    const card = await loader.load('cards')
    const alert = await loader.load('alerts')

    assertEquals(button.name, 'Button')
    assertEquals(card.name, 'Card')
    assertEquals(alert.name, 'Alert')
})
