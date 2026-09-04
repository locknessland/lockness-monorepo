/**
 * @fileoverview The in-memory search driver — a tokenised inverted index.
 *
 * The reference engine: per index, a `token → set of ids` inverted index plus a
 * `id → tokens` map so re-indexing replaces cleanly. Ranking is by query-token
 * match count. All tokenisation goes through the one shared {@link tokenize}.
 *
 * @module @lockness/search/drivers/memory
 */

import {
    type SearchDriver,
    type SearchHit,
    type SearchOptions,
    tokenize,
} from '../driver.ts'

interface Index {
    /** token → ids containing it. */
    inverted: Map<string, Set<string>>
    /** id → its token set (for clean replace/delete). */
    docs: Map<string, Set<string>>
}

/**
 * A single-process inverted-index search driver.
 *
 * @example
 * ```ts
 * configureSearch({ driver: new MemorySearchDriver() })
 * ```
 */
export class MemorySearchDriver implements SearchDriver {
    private readonly indexes = new Map<string, Index>()

    private indexFor(name: string): Index {
        let idx = this.indexes.get(name)
        if (!idx) {
            this.indexes.set(
                name,
                idx = { inverted: new Map(), docs: new Map() },
            )
        }
        return idx
    }

    /**
     * Index (replacing any existing doc for `id`).
     *
     * @param index - The index name.
     * @param id - The document id.
     * @param document - The document text.
     */
    index(index: string, id: string, document: string): void {
        this.delete(index, id) // replace, never duplicate
        const idx = this.indexFor(index)
        const tokens = new Set(tokenize(document))
        idx.docs.set(id, tokens)
        for (const token of tokens) {
            let ids = idx.inverted.get(token)
            if (!ids) idx.inverted.set(token, ids = new Set())
            ids.add(id)
        }
    }

    /**
     * Query, ranking by the number of distinct query tokens a doc contains.
     *
     * @param index - The index name.
     * @param query - The query text (tokenised as data).
     * @param options - Query options.
     * @returns Ranked hits.
     */
    search(index: string, query: string, options?: SearchOptions): SearchHit[] {
        const idx = this.indexes.get(index)
        if (!idx) return []
        const scores = new Map<string, number>()
        for (const token of new Set(tokenize(query))) {
            const ids = idx.inverted.get(token)
            if (!ids) continue
            for (const id of ids) scores.set(id, (scores.get(id) ?? 0) + 1)
        }
        const hits = [...scores.entries()]
            .map(([id, score]) => ({ id, score }))
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        return options?.limit ? hits.slice(0, options.limit) : hits
    }

    /**
     * Remove a document.
     *
     * @param index - The index name.
     * @param id - The document id.
     */
    delete(index: string, id: string): void {
        const idx = this.indexes.get(index)
        const tokens = idx?.docs.get(id)
        if (!idx || !tokens) return
        for (const token of tokens) {
            const ids = idx.inverted.get(token)
            if (ids) {
                ids.delete(id)
                if (ids.size === 0) idx.inverted.delete(token)
            }
        }
        idx.docs.delete(id)
    }
}
