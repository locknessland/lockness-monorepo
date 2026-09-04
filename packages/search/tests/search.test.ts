/**
 * @fileoverview Tests for full-text search — SC-003/003a + make:searchable (SC-007).
 *
 * @module @lockness/search/tests/search
 */

import { assert, assertEquals } from '@std/assert'
import {
    configureSearch,
    indexSearchable,
    resetSearch,
    search,
} from '../search.ts'
import {
    MAX_QUERY_LENGTH,
    MAX_TOKENS,
    type SearchDriver,
    type SearchHit,
    tokenize,
} from '../driver.ts'
import { handleMakeSearchable } from '../cli_commands.ts'

Deno.test('SC-003: index + query returns matching ids ranked', async () => {
    resetSearch()
    const posts = search('posts')
    await posts.index('1', 'Deno framework release notes')
    await posts.index('2', 'framework comparison guide')
    await posts.index('3', 'unrelated cooking recipe')

    const hits = await posts.query('deno framework')
    assertEquals(hits[0].id, '1') // matches both tokens → top
    assert(hits.some((h) => h.id === '2')) // matches 'framework'
    assert(!hits.some((h) => h.id === '3'))
    resetSearch()
})

Deno.test('SC-003: re-indexing an id replaces it (no duplicate); delete removes it', async () => {
    resetSearch()
    const idx = search('docs')
    await idx.index('1', 'alpha beta')
    await idx.index('1', 'gamma') // replace
    assertEquals((await idx.query('alpha')).length, 0) // old tokens gone
    assertEquals((await idx.query('gamma')).map((h) => h.id), ['1'])

    await idx.delete('1')
    assertEquals((await idx.query('gamma')).length, 0)
    resetSearch()
})

Deno.test('SC-003: a no-match query returns empty', async () => {
    resetSearch()
    await search('x').index('1', 'hello world')
    assertEquals(await search('x').query('absent'), [])
    resetSearch()
})

Deno.test('SC-003a: a regex-metachar query is matched as literal tokens (no regex/ReDoS)', async () => {
    resetSearch()
    await search('x').index('1', 'plus c99 and more')
    // '.*+' etc. are tokenised, not compiled — they match nothing, never hang.
    assertEquals(await search('x').query('.*+([a-z]+)*'), [])
    assertEquals((await search('x').query('c99')).map((h) => h.id), ['1'])
    resetSearch()
})

Deno.test('SC-003a: tokeniser is bounded (query length + token count)', () => {
    const huge = 'word '.repeat(MAX_TOKENS + 5000)
    assert(tokenize(huge).length <= MAX_TOKENS)
    assert(MAX_QUERY_LENGTH > 0)
})

Deno.test('indexSearchable indexes a record via its own projection', async () => {
    resetSearch()
    await indexSearchable({
        searchableId: () => '7',
        searchIndex: () => 'items',
        toSearchDocument: () => 'widget gadget',
    })
    assertEquals((await search('items').query('gadget')).map((h) => h.id), [
        '7',
    ])
    resetSearch()
})

Deno.test('configureSearch injects a pluggable driver that query() routes to', async () => {
    resetSearch()
    const calls: string[] = []
    const stub: SearchDriver = {
        index: () => {},
        delete: () => {},
        search: (index, query): SearchHit[] => {
            calls.push(`${index}:${query}`)
            return [{ id: 'stub', score: 1 }]
        },
    }
    configureSearch({ driver: stub })
    const hits = await search('posts').query('hello')
    assertEquals(hits, [{ id: 'stub', score: 1 }])
    assertEquals(calls, ['posts:hello']) // routed to the injected driver
    resetSearch()
})

Deno.test('reindex() rebuilds an index from a record set', async () => {
    resetSearch()
    await search('docs').reindex([
        { id: '1', document: 'alpha beta' },
        { id: '2', document: 'beta gamma' },
    ])
    assertEquals((await search('docs').query('beta')).length, 2)
    assertEquals((await search('docs').query('alpha')).map((h) => h.id), ['1'])
    resetSearch()
})

Deno.test('SC-007: make:searchable scaffolds + rejects a traversal name', async () => {
    const dir = await Deno.makeTempDir()
    const prev = Deno.cwd()
    Deno.chdir(dir)
    try {
        const path = await handleMakeSearchable(['Post'])
        assertEquals(path, 'app/search/post_searchable.ts')
        assert(await Deno.readTextFile(`${dir}/app/search/post_searchable.ts`))
        assertEquals(await handleMakeSearchable(['../../x']), undefined)
        assertEquals(await handleMakeSearchable(['bad-name']), undefined)
    } finally {
        Deno.chdir(prev)
        await Deno.remove(dir, { recursive: true })
    }
})
