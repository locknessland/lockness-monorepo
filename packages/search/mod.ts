/**
 * @fileoverview Public surface of `@lockness/search` — a full-text search
 * abstraction over a pluggable engine (memory inverted-index driver default).
 *
 * @module @lockness/search
 *
 * @example
 * ```ts
 * import { configureSearch, search } from '@lockness/search'
 *
 * await search('posts').index('1', 'Deno framework release notes')
 * const hits = await search('posts').query('deno', { limit: 10 })
 * ```
 */

export {
    MAX_QUERY_LENGTH,
    MAX_TOKENS,
    type SearchDriver,
    type SearchHit,
    type SearchOptions,
    tokenize,
} from './driver.ts'
export { MemorySearchDriver } from './drivers/memory.ts'
export {
    configureSearch,
    indexSearchable,
    resetSearch,
    search,
    type Searchable,
    type SearchConfig,
    type SearchIndex,
} from './search.ts'
export {
    type Cli,
    handleMakeSearchable,
    isContained,
    registerSearchCommands,
    SEARCHABLE_DIR,
} from './cli_commands.ts'
