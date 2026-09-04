/**
 * @fileoverview The pagination envelope shape — `{ data, meta, links }` — for
 * both offset and cursor strategies.
 *
 * These are the shared shapes every layer agrees on: the DB-agnostic paginator
 * ({@link file://./paginate.ts | paginate.ts}) produces them, `@lockness/drizzle`
 * fills them from a real query, and an API controller serialises them. They live
 * in `@lockness/contract` — the foundation package everything may import — so no
 * consumer needs a dependency on a database driver to name a page of results.
 *
 * Types only; no runtime. The computation lives beside this file.
 *
 * @module @lockness/contract/pagination/types
 * @since 0.2.1
 */

/**
 * What a paginated request asked for, once read off the request and bounded.
 *
 * `page`/`perPage` drive the **offset** strategy; `cursor` drives the **cursor**
 * strategy. A caller supplies one or the other — the driver decides which by
 * whether a cursor is present.
 */
export interface PaginationParams {
    /** 1-indexed page number. Floored to ≥ 1 by {@link readPaginationParams}. */
    readonly page: number
    /** Rows per page, already clamped to the configured maximum. */
    readonly perPage: number
    /** Opaque cursor token for the cursor strategy, or `undefined` for offset. */
    readonly cursor?: string
}

/**
 * Offset-strategy metadata — the counts and positions a page-numbered UI needs.
 */
export interface OffsetMeta {
    /** Discriminant. */
    readonly strategy: 'offset'
    /** Total rows across all pages (the `COUNT(*)`), matching the caller's filter. */
    readonly total: number
    /** Rows per page (clamped). */
    readonly perPage: number
    /** The current page, floored to ≥ 1 and capped to {@link OffsetMeta.lastPage}. */
    readonly currentPage: number
    /** The last page number; `max(1, ceil(total / perPage))`. */
    readonly lastPage: number
    /** 1-indexed position of the first row on this page, or `null` when empty. */
    readonly from: number | null
    /** 1-indexed position of the last row on this page, or `null` when empty. */
    readonly to: number | null
}

/**
 * Cursor-strategy metadata. Deliberately **no `total`** — the point of cursor
 * pagination is to skip the `COUNT(*)` on large tables.
 */
export interface CursorMeta {
    /** Discriminant. */
    readonly strategy: 'cursor'
    /** Rows per page (clamped). */
    readonly perPage: number
    /**
     * Opaque token to fetch the next page, or `null` when there is none. Never
     * the raw ordering-column value — the driver encodes it (see
     * `@lockness/drizzle` `encodeCursor`).
     */
    readonly nextCursor: string | null
    /** Opaque token to fetch the previous page, or `null` when there is none. */
    readonly prevCursor: string | null
    /** Whether a next page exists. */
    readonly hasMore: boolean
}

/** The metadata of a page, discriminated by {@link OffsetMeta.strategy}. */
export type PaginationMeta = OffsetMeta | CursorMeta

/**
 * Offset navigation links. **Relative** (`pathname` + query) — the paginator
 * never emits an absolute URL and never reflects a request `Host`.
 */
export interface OffsetLinks {
    /** URL of page 1. */
    readonly first: string
    /** URL of the last page. */
    readonly last: string
    /** URL of the previous page, or `null` on page 1. */
    readonly prev: string | null
    /** URL of the next page, or `null` on the last page. */
    readonly next: string | null
    /** URL of the current page. */
    readonly self: string
}

/** Cursor navigation links, relative like {@link OffsetLinks}. */
export interface CursorLinks {
    /** URL of the previous page, or `null` when there is none. */
    readonly prev: string | null
    /** URL of the next page, or `null` when there is none. */
    readonly next: string | null
    /** URL of the current page. */
    readonly self: string
}

/**
 * An offset-paginated result: the rows, the counts, and the page links.
 *
 * @typeParam T - The row type (already projected, if a Resource was applied).
 */
export interface OffsetEnvelope<T> {
    /** The rows on this page. */
    readonly data: readonly T[]
    /** The offset counts and positions. */
    readonly meta: OffsetMeta
    /** The relative navigation links. */
    readonly links: OffsetLinks
}

/**
 * A cursor-paginated result.
 *
 * @typeParam T - The row type.
 */
export interface CursorEnvelope<T> {
    /** The rows on this page. */
    readonly data: readonly T[]
    /** The cursor metadata. */
    readonly meta: CursorMeta
    /** The relative navigation links. */
    readonly links: CursorLinks
}

/**
 * The `{ data, meta, links }` envelope, discriminated by `meta.strategy`.
 *
 * @typeParam T - The row type.
 */
export type PaginationEnvelope<T> = OffsetEnvelope<T> | CursorEnvelope<T>

/**
 * The plain object the `@lockness/ui` `Pagination` component consumes. Returned
 * by {@link toPaginationProps} so a controller can spread it into the component
 * without either package importing the other — the props are structural.
 */
export interface PaginationComponentProps {
    /** 1-indexed current page. */
    readonly currentPage: number
    /** Total number of pages. */
    readonly totalPages: number
    /** Base URL the component appends the page number to. */
    readonly baseUrl: string
    /** Query-param name for the page number (mirrors the paginator's). */
    readonly pageParam: string
}
