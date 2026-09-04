/**
 * @fileoverview The search facade — `configureSearch` + `search(index)`.
 *
 * Indexing is **explicit**: the app (its repository) calls `index()`/`delete()`
 * on save/delete — there is no ORM hook, so **keeping the index in sync is the
 * app's responsibility** (a `reindex` affordance rebuilds one). A `Searchable`
 * record can be indexed directly via `indexSearchable`.
 *
 * @module @lockness/search/search
 */

import type { SearchDriver, SearchHit, SearchOptions } from './driver.ts'
import { MemorySearchDriver } from './drivers/memory.ts'

/** App-supplied search configuration. */
export interface SearchConfig {
    /** The engine (defaults to the in-memory inverted index). */
    driver?: SearchDriver
}

/** A record that knows how to index itself. */
export interface Searchable {
    /** The document id. */
    searchableId(): string
    /** The index this record belongs to. */
    searchIndex(): string
    /** The record's searchable text. */
    toSearchDocument(): string
}

let driver: SearchDriver = new MemorySearchDriver()

/**
 * Configure search.
 *
 * @param config - The engine driver (optional).
 */
export function configureSearch(config: SearchConfig = {}): void {
    driver = config.driver ?? new MemorySearchDriver()
}

/** Reset — test-only. */
export function resetSearch(): void {
    driver = new MemorySearchDriver()
}

/** The per-index facade. */
export interface SearchIndex {
    /** Index (or replace) a document. */
    index(id: string, document: string): Promise<void>
    /** Query, ranked. */
    query(text: string, options?: SearchOptions): Promise<SearchHit[]>
    /** Remove a document. */
    delete(id: string): Promise<void>
    /** Rebuild the whole index from a record set (the app owns sync). */
    reindex(
        docs: ReadonlyArray<{ id: string; document: string }>,
    ): Promise<void>
}

/**
 * A facade bound to one index.
 *
 * @param index - The index name.
 * @returns The per-index facade.
 *
 * @example
 * ```ts
 * await search('posts').index(String(post.id), post.title + ' ' + post.body)
 * const hits = await search('posts').query('deno framework', { limit: 10 })
 * ```
 */
export function search(index: string): SearchIndex {
    return {
        index: (id, document) =>
            Promise.resolve(driver.index(index, id, document)),
        query: (text, options) =>
            Promise.resolve(driver.search(index, text, options)),
        delete: (id) => Promise.resolve(driver.delete(index, id)),
        reindex: async (docs) => {
            for (const { id, document } of docs) {
                await driver.index(index, id, document)
            }
        },
    }
}

/**
 * Index a {@link Searchable} record directly (reads its index + id + document).
 *
 * @param record - The searchable record.
 * @returns Resolves once indexed.
 */
export function indexSearchable(record: Searchable): Promise<void> {
    return Promise.resolve(
        driver.index(
            record.searchIndex(),
            record.searchableId(),
            record.toSearchDocument(),
        ),
    )
}
