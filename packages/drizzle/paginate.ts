/**
 * @fileoverview `paginate()` — run an offset or cursor page against a Drizzle
 * query and shape it into the `@lockness/contract` `{ data, meta, links }`
 * envelope.
 *
 * **Safe by construction (plan §5, security S1).** The helper accepts the
 * caller's filter *conditions* — never a pre-built builder — and AND-composes
 * the pagination predicate with them (`and(existing, cmp(col, cursor))`). The
 * offset `count` query is built from the **same** conditions. Because there is
 * no second `.where()` on a builder the caller already filtered (which, in
 * drizzle-orm 0.36.3, would *overwrite* the filter), a dropped tenancy/ownership
 * filter is not expressible through this API.
 *
 * **The cursor codec lives here**, not in `@lockness/contract`: only the driver
 * knows the ordering column's type. The token is `base64url` of
 * `{ c: column, v: value }` — an opaque, *non-secret* ordering position, so the
 * raw internal id is not surfaced on the wire (security S4).
 *
 * @module @lockness/drizzle/paginate
 * @since 0.2.1
 */

import { and, asc, desc, type SQL, sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import {
    clampPage,
    clampPerPage,
    type CursorEnvelope,
    type OffsetEnvelope,
    paginateCursor,
    paginateOffset,
} from '@lockness/contract'
import type { DatabaseSchema } from './mod.ts'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/**
 * A decoded cursor: the column it orders by and the position value.
 */
export interface DecodedCursor {
    /** The ordering column name the cursor was minted against. */
    readonly column: string
    /** The ordering position — a string or number, bound as a SQL parameter. */
    readonly value: string | number
}

function b64urlEncode(input: string): string {
    return btoa(input).replaceAll('+', '-').replaceAll('/', '_').replaceAll(
        '=',
        '',
    )
}

function b64urlDecode(input: string): string {
    const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
    return atob(input.replaceAll('-', '+').replaceAll('_', '/') + pad)
}

/**
 * Encode an opaque cursor token from a column name and an ordering value.
 *
 * @param column - The ordering column name.
 * @param value - The position value (a string or number).
 * @returns A `base64url` token — a non-secret ordering position.
 *
 * @example
 * ```typescript
 * encodeCursor('id', 42) // "eyJjIjoiaWQiLCJ2Ijo0Mn0"
 * ```
 */
export function encodeCursor(column: string, value: string | number): string {
    return b64urlEncode(JSON.stringify({ c: column, v: value }))
}

/**
 * Decode and validate an opaque cursor token.
 *
 * @param token - The token from {@link encodeCursor}.
 * @returns The decoded `{ column, value }`.
 * @throws {Error} When the token is malformed or carries a value of the wrong shape.
 *
 * @example
 * ```typescript
 * decodeCursor('eyJjIjoiaWQiLCJ2Ijo0Mn0') // { column: 'id', value: 42 }
 * ```
 */
export function decodeCursor(token: string): DecodedCursor {
    let parsed: unknown
    try {
        parsed = JSON.parse(b64urlDecode(token))
    } catch {
        throw new Error('Invalid pagination cursor: not a decodable token')
    }
    if (
        typeof parsed !== 'object' || parsed === null ||
        typeof (parsed as { c?: unknown }).c !== 'string' ||
        !['string', 'number'].includes(
            typeof (parsed as { v?: unknown }).v,
        )
    ) {
        throw new Error('Invalid pagination cursor: unexpected shape')
    }
    const obj = parsed as { c: string; v: string | number }
    return { column: obj.c, value: obj.v }
}

/** Options for offset pagination. */
export interface OffsetPaginateOptions {
    /** Discriminant; defaults to offset. */
    readonly strategy?: 'offset'
    /** 1-indexed page (floored + capped to `lastPage` by the paginator). */
    readonly page: number
    /** Requested rows per page (clamped to the configured maximum). */
    readonly perPage: number
    /** Base URL for the relative navigation links. */
    readonly baseUrl: string
    /** Page query-param name (default `page`). */
    readonly pageParam?: string
    /**
     * The caller's filter conditions. Composed via `and(...)` and reused by the
     * count query — omitting them lists the whole table, which is the caller's
     * choice, but they can never be *dropped* by pagination.
     */
    readonly where?: SQL
    /** Order-by expressions (recommended for stable paging). */
    readonly orderBy?: readonly SQL[]
}

/** Options for cursor pagination. */
export interface CursorPaginateOptions<TRow> {
    /** Discriminant. */
    readonly strategy: 'cursor'
    /** Requested rows per page (clamped). */
    readonly perPage: number
    /** Base URL for the relative navigation links. */
    readonly baseUrl: string
    /** Cursor query-param name (default `cursor`). */
    readonly cursorParam?: string
    /** The caller's filter conditions — AND-composed, never dropped. */
    readonly where?: SQL
    /** The column the cursor orders by (used for the predicate and the order). */
    readonly cursorColumn: PgColumn
    /** Reads the ordering position from a row, to mint the next cursor. */
    readonly cursorOf: (row: TRow) => string | number
    /** Sort direction (default `asc`). */
    readonly direction?: 'asc' | 'desc'
    /** The opaque cursor token to start after, or omit for the first page. */
    readonly cursor?: string
}

/**
 * Paginate a table with the offset strategy.
 *
 * @typeParam TRow - The row type.
 * @param db - The Drizzle database.
 * @param table - The table to page over.
 * @param opts - Offset options, including the caller's `where` conditions.
 * @returns An offset envelope.
 */
export function paginate<TRow extends Record<string, unknown>>(
    db: PostgresJsDatabase<DatabaseSchema>,
    table: PgTable,
    opts: OffsetPaginateOptions,
): Promise<OffsetEnvelope<TRow>>
/**
 * Paginate a table with the cursor strategy.
 *
 * @typeParam TRow - The row type.
 * @param db - The Drizzle database.
 * @param table - The table to page over.
 * @param opts - Cursor options, including the caller's `where` conditions.
 * @returns A cursor envelope.
 */
export function paginate<TRow extends Record<string, unknown>>(
    db: PostgresJsDatabase<DatabaseSchema>,
    table: PgTable,
    opts: CursorPaginateOptions<TRow>,
): Promise<CursorEnvelope<TRow>>
export async function paginate<TRow extends Record<string, unknown>>(
    db: PostgresJsDatabase<DatabaseSchema>,
    table: PgTable,
    opts: OffsetPaginateOptions | CursorPaginateOptions<TRow>,
): Promise<OffsetEnvelope<TRow> | CursorEnvelope<TRow>> {
    if (opts.strategy === 'cursor') {
        return await paginateCursorQuery(db, table, opts)
    }
    return await paginateOffsetQuery(db, table, opts)
}

async function paginateOffsetQuery<TRow extends Record<string, unknown>>(
    db: PostgresJsDatabase<DatabaseSchema>,
    table: PgTable,
    opts: OffsetPaginateOptions,
): Promise<OffsetEnvelope<TRow>> {
    const perPage = clampPerPage(opts.perPage)
    const where = opts.where

    // Count reuses the SAME conditions — a filtered listing's total counts only
    // the caller's rows, never the whole table (security S1 / SC-005).
    const countRows = await db
        .select({ total: sql<number>`count(*)` })
        .from(table)
        .where(where) as Array<{ total: number }>
    const total = Number(countRows[0]?.total ?? 0)
    const lastPage = total === 0 ? 1 : Math.ceil(total / perPage)
    const page = clampPage(opts.page, lastPage)

    const rows = await db
        .select()
        .from(table)
        .where(where)
        .orderBy(...(opts.orderBy ?? []))
        .limit(perPage)
        .offset((page - 1) * perPage) as TRow[]

    return paginateOffset<TRow>(rows, {
        total,
        page,
        perPage,
        baseUrl: opts.baseUrl,
        pageParam: opts.pageParam,
    })
}

async function paginateCursorQuery<TRow extends Record<string, unknown>>(
    db: PostgresJsDatabase<DatabaseSchema>,
    table: PgTable,
    opts: CursorPaginateOptions<TRow>,
): Promise<CursorEnvelope<TRow>> {
    const perPage = clampPerPage(opts.perPage)
    const direction = opts.direction ?? 'asc'
    const decoded = opts.cursor ? decodeCursor(opts.cursor) : undefined

    // AND-compose the cursor predicate with the caller's conditions — the
    // caller's filter is preserved, never overwritten (security S1).
    const cursorPredicate = decoded
        ? (direction === 'desc'
            ? sql`${opts.cursorColumn} < ${decoded.value}`
            : sql`${opts.cursorColumn} > ${decoded.value}`)
        : undefined
    const conditions = [opts.where, cursorPredicate].filter((
        c,
    ): c is SQL => c !== undefined)
    const where = conditions.length === 0
        ? undefined
        : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

    // Fetch one extra row to know whether a next page exists.
    const fetched = await db
        .select()
        .from(table)
        .where(where)
        .orderBy(
            direction === 'desc'
                ? desc(opts.cursorColumn)
                : asc(opts.cursorColumn),
        )
        .limit(perPage + 1) as TRow[]

    const hasMore = fetched.length > perPage
    const data = hasMore ? fetched.slice(0, perPage) : fetched
    const lastRow = data[data.length - 1]
    const nextCursor = hasMore && lastRow !== undefined
        ? encodeCursor(opts.cursorColumn.name, opts.cursorOf(lastRow))
        : null

    return paginateCursor<TRow>(data, {
        perPage,
        hasMore,
        nextCursor,
        prevCursor: opts.cursor ?? null,
        baseUrl: opts.baseUrl,
        cursorParam: opts.cursorParam,
    })
}
