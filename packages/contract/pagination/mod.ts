/**
 * @fileoverview Public entry point for the `@lockness/contract` pagination
 * module — the DB-agnostic paginator and its envelope types.
 *
 * Re-exported by `@lockness/contract` (so `import { paginateOffset } from
 * '@lockness/core'` works through core's `export *`) and reachable directly via
 * the `@lockness/contract/pagination` subpath.
 *
 * @module @lockness/contract/pagination
 * @since 0.2.1
 */

export {
    clampPage,
    clampPerPage,
    DEFAULT_CURSOR_PARAM,
    DEFAULT_PAGE_PARAM,
    DEFAULT_PER_PAGE,
    MAX_PER_PAGE,
    paginateCursor,
    paginateOffset,
    type QuerySource,
    readPaginationParams,
    toPaginationProps,
} from './paginate.ts'
export type {
    CursorEnvelope,
    CursorLinks,
    CursorMeta,
    OffsetEnvelope,
    OffsetLinks,
    OffsetMeta,
    PaginationComponentProps,
    PaginationEnvelope,
    PaginationMeta,
    PaginationParams,
} from './types.ts'
