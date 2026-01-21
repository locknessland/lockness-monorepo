/**
 * LlmLoader Tests
 *
 * Tests for the dynamic LLM documentation loader.
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { LlmLoader } from '../llm_loader.ts'

Deno.test('LlmLoader - should load package llms.txt', async () => {
    const loader = new LlmLoader()
    const content = await loader.load('cli')

    assert(content.length > 0, 'Content should not be empty')
    assert(
        content.includes('CLI') || content.includes('command'),
        'Content should be about CLI',
    )
})

Deno.test('LlmLoader - should load general llms.txt', async () => {
    const loader = new LlmLoader()
    const content = await loader.load('lockness')

    assert(content.length > 0, 'Content should not be empty')
    assert(
        content.includes('Lockness') || content.includes('framework'),
        'Content should be about Lockness',
    )
})

Deno.test('LlmLoader - should load core sub-files', async () => {
    const loader = new LlmLoader()

    const routing = await loader.load('routing')
    assert(routing.length > 0, 'Routing content should not be empty')

    const middleware = await loader.load('middleware')
    assert(middleware.length > 0, 'Middleware content should not be empty')
})

Deno.test('LlmLoader - should throw for unknown doc', async () => {
    const loader = new LlmLoader()

    await assertRejects(
        async () => await loader.load('unknown-doc'),
        Error,
        'Unknown LLM document',
    )
})

Deno.test('LlmLoader - should cache loaded content', async () => {
    const loader = new LlmLoader()

    // First load (from file)
    const content1 = await loader.load('cli')

    // Second load (from cache)
    const content2 = await loader.load('cli')

    assertEquals(content1, content2, 'Cached content should match')
})

Deno.test('LlmLoader - clearCache should clear the cache', async () => {
    const loader = new LlmLoader()

    // Load and cache
    await loader.load('cli')

    // Clear cache
    loader.clearCache()

    // Should load again from file (not cache)
    const content = await loader.load('cli')
    assert(content.length > 0, 'Should still load after cache clear')
})

Deno.test('LlmLoader - getAvailableDocuments should return all doc names', () => {
    const loader = new LlmLoader()
    const docs = loader.getAvailableDocuments()

    assert(docs.length > 0, 'Should have documents')
    assert(docs.includes('lockness'), 'Should include lockness')
    assert(docs.includes('authentication'), 'Should include authentication')
    assert(docs.includes('routing'), 'Should include routing')
    assert(docs.includes('cli'), 'Should include cli')
})

Deno.test('LlmLoader - getAllDocuments should return docs with metadata', () => {
    const loader = new LlmLoader()
    const docs = loader.getAllDocuments()

    assert(docs.length > 0, 'Should have documents')
    assert(docs[0].name, 'Document should have name')
    assert(docs[0].path, 'Document should have path')
})

Deno.test('LlmLoader - has should check if document exists', () => {
    const loader = new LlmLoader()

    assert(loader.has('lockness'), 'Should have lockness')
    assert(loader.has('authentication'), 'Should have authentication')
    assert(!loader.has('nonexistent'), 'Should not have nonexistent')
})

Deno.test('LlmLoader - should load authentication from packages/auth/llms.txt', async () => {
    const loader = new LlmLoader()
    const content = await loader.load('authentication')

    assert(content.length > 0, 'Authentication content should not be empty')
})

Deno.test('LlmLoader - should load validation from packages/validator/llms.txt', async () => {
    const loader = new LlmLoader()
    const content = await loader.load('validation')

    assert(content.length > 0, 'Validation content should not be empty')
})

Deno.test('LlmLoader - should load sessions from packages/session/llms.txt', async () => {
    const loader = new LlmLoader()
    const content = await loader.load('sessions')

    assert(content.length > 0, 'Sessions content should not be empty')
})

Deno.test('LlmLoader - should load ui from packages/ui/llms.txt', async () => {
    const loader = new LlmLoader()
    const content = await loader.load('ui')

    assert(content.length > 0, 'UI content should not be empty')
})

Deno.test('LlmLoader - should load inertia from packages/inertia/llms.txt', async () => {
    const loader = new LlmLoader()
    const content = await loader.load('inertia')

    assert(content.length > 0, 'Inertia content should not be empty')
})
