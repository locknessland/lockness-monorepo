/**
 * @fileoverview The DB-agnostic paginator — pure functions that turn a page of
 * rows plus their counts into a `{ data, meta, links }` envelope, for both the
 * offset and cursor strategies.
 *
 * **Pure and storage-agnostic.** Nothing here touches a database, `Deno`, or the
 * network. `@lockness/drizzle` runs the SQL and calls these to shape the result;
 * a different driver could do the same. The clamps here are the **single home**
 * for the "how big may a page be, how deep may it go" rule (plan §5) — a driver
 * calls {@link clampPerPage} / {@link clampPage} rather than spelling its own.
 *
 * Navigation links are **relative** (`pathname` + query only): the request
 * `Host` is never reflected, mirroring the `@lockness/ui` `Pagination`
 * component's own `buildPageUrl`, so the envelope cannot become a
 * host-header-injection or cache-poisoning vector.
 *
 * @module @lockness/contract/pagination/paginate
 * @since 0.2.1
 */

import type {
    CursorEnvelope,
    OffsetEnvelope,
    OffsetMeta,
    PaginationComponentProps,
    PaginationParams,
} from './types.ts'

/** The default query-param name for the page number. */
export const DEFAULT_PAGE_PARAM = 'page'

/** The default query-param name for the cursor token. */
export const DEFAULT_CURSOR_PARAM = 'cursor'

/** The default rows-per-page when the request omits `perPage`. */
export const DEFAULT_PER_PAGE = 15

/** The maximum rows-per-page a request may ask for. The DoS ceiling. */
export const MAX_PER_PAGE = 100

/**
 * Bound a requested `perPage` to `[1, max]`, falling back to a default when it
 * is absent or not a positive number. **The single home** for the page-size cap
 * (plan §5) — a fetch path calls this instead of trusting a raw client value.
 *
 * @param requested - The client-supplied value, if any.
 * @param max - The ceiling (default {@link MAX_PER_PAGE}).
 * @param fallback - The value when `requested` is absent/invalid (default {@link DEFAULT_PER_PAGE}).
 * @returns An integer in `[1, max]`.
 *
 * @example
 * ```typescript
 * clampPerPage(1_000_000) // 100
 * clampPerPage(undefined)  // 15
 * clampPerPage(20)         // 20
 * ```
 */
export function clampPerPage(
    requested?: number,
    max: number = MAX_PER_PAGE,
    fallback: number = DEFAULT_PER_PAGE,
): number {
    if (requested === undefined || !Number.isFinite(requested)) return fallback
    const floored = Math.floor(requested)
    if (floored < 1) return 1
    if (floored > max) return max
    return floored
}

/**
 * Bound a requested `page` to `[1, lastPage]`. Floors to ≥ 1 always; caps to
 * `lastPage` when it is known, so an oversized `?page=` cannot produce a giant
 * SQL `OFFSET`. **The single home** for the page floor-and-ceiling (plan §5).
 *
 * @param requested - The client-supplied page, if any.
 * @param lastPage - The last valid page, when known (from the count). Omit before the count is run.
 * @returns An integer ≥ 1, capped to `lastPage` when supplied.
 *
 * @example
 * ```typescript
 * clampPage(0)             // 1
 * clampPage(9_999, 12)     // 12
 * clampPage(3, 12)         // 3
 * ```
 */
export function clampPage(requested?: number, lastPage?: number): number {
    let page = requested === undefined || !Number.isFinite(requested)
        ? 1
        : Math.floor(requested)
    if (page < 1) page = 1
    if (lastPage !== undefined && page > lastPage) page = Math.max(1, lastPage)
    return page
}

/**
 * A source of query parameters — either `URLSearchParams` or a plain record.
 */
export type QuerySource =
    | URLSearchParams
    | Record<string, string | undefined>

function readParam(source: QuerySource, key: string): string | undefined {
    if (source instanceof URLSearchParams) return source.get(key) ?? undefined
    return source[key]
}

/**
 * Read `page` / `perPage` / `cursor` off a request's query into a bounded
 * {@link PaginationParams}. **The single home** for that read (plan §5), so no
 * controller re-spells it. `page` is floored here; its ceiling is applied by the
 * driver once the count gives `lastPage`.
 *
 * @param source - `c.req.query()` (a record) or a `URLSearchParams`.
 * @param options - Optional param names and page-size bounds.
 * @returns The bounded parameters.
 *
 * @example
 * ```typescript
 * const params = readPaginationParams(c.req.query())
 * // { page: 1, perPage: 15 } for an empty query
 * ```
 */
export function readPaginationParams(
    source: QuerySource,
    options: {
        pageParam?: string
        perPageParam?: string
        cursorParam?: string
        maxPerPage?: number
        defaultPerPage?: number
    } = {},
): PaginationParams {
    const pageParam = options.pageParam ?? DEFAULT_PAGE_PARAM
    const perPageParam = options.perPageParam ?? 'perPage'
    const cursorParam = options.cursorParam ?? DEFAULT_CURSOR_PARAM

    const rawPage = readParam(source, pageParam)
    const rawPerPage = readParam(source, perPageParam)
    const cursor = readParam(source, cursorParam)

    return {
        page: clampPage(rawPage === undefined ? undefined : Number(rawPage)),
        perPage: clampPerPage(
            rawPerPage === undefined ? undefined : Number(rawPerPage),
            options.maxPerPage,
            options.defaultPerPage,
        ),
        cursor: cursor === undefined || cursor === '' ? undefined : cursor,
    }
}

/**
 * Build a relative URL by setting one query param on a base path. Host is never
 * retained — a dummy origin lets a relative or query-bearing `baseUrl` parse,
 * and only `pathname + search` is returned (the `@lockness/ui` convention).
 */
function buildUrl(baseUrl: string, param: string, value: string): string {
    const url = new URL(baseUrl, 'http://localhost')
    url.searchParams.set(param, value)
    return url.pathname + url.search
}

/**
 * Shape an offset page into an {@link OffsetEnvelope}. Pure — the caller has
 * already run the count and the windowed query. Re-applies {@link clampPerPage}
 * and {@link clampPage} (the same single-home clamps) so the meta is coherent
 * regardless of what the caller passed.
 *
 * @typeParam T - The row type.
 * @param data - The rows on this page.
 * @param opts - `total` (the count), `page`, `perPage`, `baseUrl`, and the optional `pageParam`.
 * @returns The `{ data, meta, links }` envelope.
 *
 * @example
 * ```typescript
 * paginateOffset(rows, { total: 57, page: 2, perPage: 15, baseUrl: '/users' })
 * // meta: { currentPage: 2, lastPage: 4, from: 16, to: 30, total: 57, perPage: 15 }
 * ```
 */
export function paginateOffset<T>(
    data: readonly T[],
    opts: {
        total: number
        page: number
        perPage: number
        baseUrl: string
        pageParam?: string
    },
): OffsetEnvelope<T> {
    const pageParam = opts.pageParam ?? DEFAULT_PAGE_PARAM
    const perPage = clampPerPage(opts.perPage)
    const total = Math.max(0, Math.floor(opts.total))
    const lastPage = total === 0 ? 1 : Math.ceil(total / perPage)
    const currentPage = clampPage(opts.page, lastPage)

    const from = total === 0 ? null : (currentPage - 1) * perPage + 1
    const to = total === 0 ? null : Math.min(currentPage * perPage, total)

    const meta: OffsetMeta = {
        strategy: 'offset',
        total,
        perPage,
        currentPage,
        lastPage,
        from,
        to,
    }

    return {
        data,
        meta,
        links: {
            first: buildUrl(opts.baseUrl, pageParam, '1'),
            last: buildUrl(opts.baseUrl, pageParam, String(lastPage)),
            prev: currentPage > 1
                ? buildUrl(opts.baseUrl, pageParam, String(currentPage - 1))
                : null,
            next: currentPage < lastPage
                ? buildUrl(opts.baseUrl, pageParam, String(currentPage + 1))
                : null,
            self: buildUrl(opts.baseUrl, pageParam, String(currentPage)),
        },
    }
}

/**
 * Shape a cursor page into a {@link CursorEnvelope}. Pure — the driver has
 * already fetched, determined `hasMore`, and **encoded** the opaque cursor
 * tokens (the codec is the driver's, since only it knows the column type). This
 * function assembles the meta and the relative links from those tokens; it never
 * sees a raw ordering-column value.
 *
 * @typeParam T - The row type.
 * @param data - The rows on this page (already trimmed to `perPage`).
 * @param opts - `perPage`, `hasMore`, the encoded `nextCursor`/`prevCursor`, `baseUrl`, and optional param names.
 * @returns The `{ data, meta, links }` envelope.
 *
 * @example
 * ```typescript
 * paginateCursor(rows, {
 *     perPage: 15,
 *     hasMore: true,
 *     nextCursor: 'eyJjIjoiaWQiLCJ2IjozMH0',
 *     prevCursor: null,
 *     baseUrl: '/feed',
 * })
 * ```
 */
export function paginateCursor<T>(
    data: readonly T[],
    opts: {
        perPage: number
        hasMore: boolean
        nextCursor: string | null
        prevCursor: string | null
        baseUrl: string
        cursorParam?: string
    },
): CursorEnvelope<T> {
    const cursorParam = opts.cursorParam ?? DEFAULT_CURSOR_PARAM
    const perPage = clampPerPage(opts.perPage)
    const selfUrl = new URL(opts.baseUrl, 'http://localhost')

    return {
        data,
        meta: {
            strategy: 'cursor',
            perPage,
            nextCursor: opts.hasMore ? opts.nextCursor : null,
            prevCursor: opts.prevCursor,
            hasMore: opts.hasMore,
        },
        links: {
            prev: opts.prevCursor
                ? buildUrl(opts.baseUrl, cursorParam, opts.prevCursor)
                : null,
            next: opts.hasMore && opts.nextCursor
                ? buildUrl(opts.baseUrl, cursorParam, opts.nextCursor)
                : null,
            self: selfUrl.pathname + selfUrl.search,
        },
    }
}

/**
 * Map offset metadata onto the plain object the `@lockness/ui` `Pagination`
 * component consumes. **Forwards `pageParam`** so the component's links and the
 * envelope links cannot diverge — the single page-param convention travels with
 * the mapping (plan §5). Neither `@lockness/ui` nor `@lockness/contract` imports
 * the other; the returned shape is structural.
 *
 * @param meta - The offset metadata (cursor pagination has no total page count).
 * @param baseUrl - The base URL the component appends the page number to.
 * @param pageParam - The page query-param name (default {@link DEFAULT_PAGE_PARAM}).
 * @returns The props to spread into `<Pagination />`.
 *
 * @example
 * ```tsx
 * <Pagination {...toPaginationProps(envelope.meta, '/users')} />
 * ```
 */
export function toPaginationProps(
    meta: OffsetMeta,
    baseUrl: string,
    pageParam: string = DEFAULT_PAGE_PARAM,
): PaginationComponentProps {
    return {
        currentPage: meta.currentPage,
        totalPages: meta.lastPage,
        baseUrl,
        pageParam,
    }
}
