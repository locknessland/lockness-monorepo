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

/**
 * Error raised when a client-supplied cursor cannot be trusted: it is not a
 * decodable token, its decoded shape is unexpected, or its column does not
 * match the one the caller is paging.
 *
 * It carries `status = 400` so the framework's default error handler
 * (which reads an error's `status` property, defaulting to 500) renders a
 * **400 Bad Request** rather than leaking a 500 — a malformed cursor is client
 * input, not a server fault. This mirrors the `status`-bearing error
 * convention already used by `@lockness/auth` (401/403), and keeps
 * `@lockness/drizzle` inside its dependency boundary: no `@lockness/core` or
 * `@lockness/hono` import is needed to obtain the 400 mapping.
 *
 * @example
 * ```typescript
 * try {
 *   decodeCursor(untrustedToken, 'id')
 * } catch (error) {
 *   if (error instanceof MalformedCursorError) {
 *     return c.json(error.toJSON(), error.status) // 400
 *   }
 * }
 * ```
 */
export class MalformedCursorError extends Error {
    /** HTTP status — the default error handler renders this (400 Bad Request). */
    readonly status = 400
    /** Stable error code for client handling. */
    readonly code = 'E_MALFORMED_CURSOR'

    /**
     * @param message - Human-readable reason the cursor was rejected.
     * @param options - Standard error options (e.g. `cause`).
     */
    constructor(
        message = 'Invalid pagination cursor',
        options?: ErrorOptions,
    ) {
        super(message, options)
        this.name = 'MalformedCursorError'
    }

    /**
     * Serialize to a plain object for a JSON response body.
     *
     * @returns The error code, message and status.
     */
    toJSON(): { code: string; message: string; status: number } {
        return { code: this.code, message: this.message, status: this.status }
    }
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
 * When `expectedColumn` is given, the decoded column is checked against it: a
 * token minted for another column is rejected, so a cursor cannot be replayed
 * against a different ordering than the one it was issued for. The value is
 * always bound as a SQL parameter, so this check tightens correctness rather
 * than closing an injection hole.
 *
 * Every rejection path throws {@link MalformedCursorError} (`status = 400`),
 * turning untrusted client input into a mapped **400 Bad Request** instead of
 * an uncaught error surfacing as a 500.
 *
 * @param token - The token from {@link encodeCursor}.
 * @param expectedColumn - The column the caller is paging; when provided, the
 * decoded column must equal it.
 * @returns The decoded `{ column, value }`.
 * @throws {MalformedCursorError} When the token is not decodable, has an
 * unexpected shape, or (when `expectedColumn` is given) was minted for a
 * different column.
 *
 * @example
 * ```typescript
 * decodeCursor('eyJjIjoiaWQiLCJ2Ijo0Mn0', 'id') // { column: 'id', value: 42 }
 * ```
 */
export function decodeCursor(
    token: string,
    expectedColumn?: string,
): DecodedCursor {
    let parsed: unknown
    try {
        parsed = JSON.parse(b64urlDecode(token))
    } catch (cause) {
        throw new MalformedCursorError(
            'Invalid pagination cursor: not a decodable token',
            { cause },
        )
    }
    if (
        typeof parsed !== 'object' || parsed === null ||
        typeof (parsed as { c?: unknown }).c !== 'string' ||
        !['string', 'number'].includes(
            typeof (parsed as { v?: unknown }).v,
        )
    ) {
        throw new MalformedCursorError(
            'Invalid pagination cursor: unexpected shape',
        )
    }
    const obj = parsed as { c: string; v: string | number }
    if (expectedColumn !== undefined && obj.c !== expectedColumn) {
        throw new MalformedCursorError(
            `Invalid pagination cursor: column "${obj.c}" does not match the ` +
                `paged column "${expectedColumn}"`,
        )
    }
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
    const decoded = opts.cursor
        ? decodeCursor(opts.cursor, opts.cursorColumn.name)
        : undefined

    // AND-compose the cursor predicate with the caller's conditions — the
    // caller's filter is preserved, never overwritten (security S1). The
    // forward predicate steps *past* the incoming cursor in the requested
    // direction (`>` for asc, `<` for desc), strictly, so the boundary row is
    // neither dropped nor duplicated across pages.
    const cursorPredicate = decoded
        ? (direction === 'desc'
            ? sql`${opts.cursorColumn} < ${decoded.value}`
            : sql`${opts.cursorColumn} > ${decoded.value}`)
        : undefined
    const where = composeWhere(opts.where, cursorPredicate)

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

    const prevCursor = await derivePrevCursor(db, table, opts, {
        perPage,
        direction,
        onCursor: decoded !== undefined,
        firstRow: data[0],
    })

    return paginateCursor<TRow>(data, {
        perPage,
        hasMore,
        nextCursor,
        prevCursor,
        baseUrl: opts.baseUrl,
        cursorParam: opts.cursorParam,
    })
}

/**
 * AND-compose a base filter with an optional pagination predicate. Returns the
 * lone clause when only one is present and `undefined` when neither is, so the
 * caller's tenancy/ownership filter is preserved rather than overwritten
 * (security S1).
 */
function composeWhere(
    base: SQL | undefined,
    predicate: SQL | undefined,
): SQL | undefined {
    const conditions = [base, predicate].filter((c): c is SQL =>
        c !== undefined
    )
    if (conditions.length === 0) return undefined
    if (conditions.length === 1) return conditions[0]
    return and(...conditions)
}

/**
 * Mint a *genuine* previous-page cursor via a reverse-order query.
 *
 * The forward page steps past the incoming cursor; its own first row is the
 * upper bound of the page before it. To find where that previous page begins,
 * this runs the query in the **reverse** direction (asc ⇄ desc) bounded by that
 * first row, fetching `perPage + 1` rows. The `(perPage + 1)`-th row — one step
 * beyond a full previous page — is the boundary: encoded as a cursor, a normal
 * *forward* fetch from it re-materialises the previous page in the caller's
 * order, so navigation stays on the single forward mechanism (issue #252).
 *
 * Returns `null` when there is no previous page to point at: the first page
 * (no incoming cursor), an empty current page, or a short reverse page (the
 * previous page reaches the very start, with no boundary beyond it).
 */
async function derivePrevCursor<TRow extends Record<string, unknown>>(
    db: PostgresJsDatabase<DatabaseSchema>,
    table: PgTable,
    opts: CursorPaginateOptions<TRow>,
    ctx: {
        perPage: number
        direction: 'asc' | 'desc'
        onCursor: boolean
        firstRow: TRow | undefined
    },
): Promise<string | null> {
    // The first page (no incoming cursor) and an empty page have no predecessor.
    if (!ctx.onCursor || ctx.firstRow === undefined) return null

    const boundary = opts.cursorOf(ctx.firstRow)
    // Reverse of the forward predicate: rows on the *near* side of the current
    // page's first row, strictly, mirroring the forward `>`/`<` so the boundary
    // is neither dropped nor duplicated.
    const reversePredicate = ctx.direction === 'desc'
        ? sql`${opts.cursorColumn} > ${boundary}`
        : sql`${opts.cursorColumn} < ${boundary}`
    const where = composeWhere(opts.where, reversePredicate)

    const reverseRows = await db
        .select()
        .from(table)
        .where(where)
        .orderBy(
            ctx.direction === 'desc'
                ? asc(opts.cursorColumn)
                : desc(opts.cursorColumn),
        )
        .limit(ctx.perPage + 1) as TRow[]

    // Fewer than perPage + 1 rows → the previous page reaches the start; the
    // caller returns there by clearing the cursor, so emit null rather than a
    // token that would drop the first row(s).
    const boundaryRow = reverseRows.length > ctx.perPage
        ? reverseRows[ctx.perPage]
        : undefined
    return boundaryRow !== undefined
        ? encodeCursor(opts.cursorColumn.name, opts.cursorOf(boundaryRow))
        : null
}
