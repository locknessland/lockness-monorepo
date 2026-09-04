/**
 * @fileoverview The search-engine seam + the shared tokeniser.
 *
 * A `SearchDriver` indexes and queries documents. The **query is tokenised as
 * data and is NEVER compiled into or used as a regular expression** (no ReDoS,
 * security S7); the tokeniser is **one shared linear function** used by both the
 * index and query sides so a query can never mismatch its own index.
 *
 * @module @lockness/search/driver
 */

/** Max tokens kept from a single document or query (a bound, security S7). */
export const MAX_TOKENS = 10_000
/** Max query string length before truncation (security S7). */
export const MAX_QUERY_LENGTH = 1_000

/**
 * Tokenise text into lowercased alphanumeric tokens — the one shared function
 * for indexing and querying. Linear-time (a split, never a regex over input).
 *
 * @param text - The text to tokenise.
 * @returns The bounded token list.
 */
export function tokenize(text: string): string[] {
    const clipped = text.length > MAX_QUERY_LENGTH * 64
        ? text.slice(0, MAX_QUERY_LENGTH * 64)
        : text
    const tokens: string[] = []
    for (const raw of clipped.toLowerCase().split(/[^a-z0-9]+/)) {
        if (raw) tokens.push(raw)
        if (tokens.length >= MAX_TOKENS) break
    }
    return tokens
}

/** A ranked search hit. */
export interface SearchHit {
    /** The document id. */
    id: string
    /** The relevance score (higher = better). */
    score: number
}

/** Options for a query. */
export interface SearchOptions {
    /** Max hits to return. */
    limit?: number
}

/** A pluggable search engine. */
export interface SearchDriver {
    /**
     * Index (or replace) a document under an index.
     *
     * @param index - The index name.
     * @param id - The document id.
     * @param document - The document text.
     */
    index(index: string, id: string, document: string): void | Promise<void>
    /**
     * Query an index.
     *
     * @param index - The index name.
     * @param query - The query text (tokenised as data — never a regex).
     * @param options - Query options (e.g. `limit`).
     * @returns Ranked hits.
     */
    search(
        index: string,
        query: string,
        options?: SearchOptions,
    ): SearchHit[] | Promise<SearchHit[]>
    /**
     * Remove a document from an index.
     *
     * @param index - The index name.
     * @param id - The document id.
     */
    delete(index: string, id: string): void | Promise<void>
}
