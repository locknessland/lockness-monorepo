/**
 * @fileoverview Query-shape tests for `paginate()` — offset + cursor, cursor
 * codec round-trip, and the mandatory cross-tenant guard (SC-005): the caller's
 * filter must reach both the count and the windowed query, never be dropped.
 *
 * No live PostgreSQL — a fake Drizzle builder records the calls.
 *
 * @module @lockness/drizzle/tests/paginate
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import { eq, type SQL } from 'drizzle-orm'
import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { DatabaseSchema } from '../mod.ts'
import { decodeCursor, encodeCursor, paginate } from '../paginate.ts'

const users = pgTable('users', {
    id: integer('id').primaryKey(),
    owner: text('owner'),
    name: text('name'),
})

interface QueryRecord {
    where: SQL | undefined
    orderByCount: number
    limit?: number
    offset?: number
}

interface FakeBuilder {
    from(t: unknown): FakeBuilder
    where(w: SQL | undefined): FakeBuilder
    orderBy(...o: unknown[]): FakeBuilder
    limit(n: number): FakeBuilder
    offset(n: number): FakeBuilder
    then<R>(onf: (v: unknown[]) => R): Promise<R>
}

/** A fake db whose `select()` returns queued row sets and records each query. */
function fakeDb(resultSets: unknown[][]): {
    db: PostgresJsDatabase<DatabaseSchema>
    records: QueryRecord[]
} {
    const records: QueryRecord[] = []
    let call = 0

    const build = (rec: QueryRecord, rows: unknown[]): FakeBuilder => {
        const b: FakeBuilder = {
            from: () => b,
            where: (w) => {
                rec.where = w
                return b
            },
            orderBy: (...o) => {
                rec.orderByCount = o.length
                return b
            },
            limit: (n) => {
                rec.limit = n
                return b
            },
            offset: (n) => {
                rec.offset = n
                return b
            },
            then: (onf) => Promise.resolve(rows).then(onf),
        }
        return b
    }

    const db = {
        select: (_fields?: unknown): FakeBuilder => {
            const rec: QueryRecord = { where: undefined, orderByCount: 0 }
            records.push(rec)
            return build(rec, resultSets[call++] ?? [])
        },
    }
    return { db: db as unknown as PostgresJsDatabase<DatabaseSchema>, records }
}

/** True when `target` appears anywhere in a drizzle SQL's nested queryChunks. */
function whereContains(node: unknown, target: unknown): boolean {
    if (node === target) return true
    const chunks = (node as { queryChunks?: readonly unknown[] })?.queryChunks
    if (!Array.isArray(chunks)) return false
    return chunks.some((c) => whereContains(c, target))
}

Deno.test('encodeCursor/decodeCursor round-trip', () => {
    assertEquals(decodeCursor(encodeCursor('id', 42)), {
        column: 'id',
        value: 42,
    })
    assertEquals(decodeCursor(encodeCursor('created_at', '2026-01-01')), {
        column: 'created_at',
        value: '2026-01-01',
    })
})

Deno.test('decodeCursor rejects a malformed token', () => {
    assertThrows(() => decodeCursor('!!!not-base64!!!'))
    assertThrows(() => decodeCursor(btoa(JSON.stringify({ nope: 1 }))))
})

Deno.test('offset paginate issues count + windowed query and shapes the envelope', async () => {
    const rows = [{ id: 16, owner: 'me', name: 'a' }, {
        id: 17,
        owner: 'me',
        name: 'b',
    }]
    const { db, records } = fakeDb([[{ total: 57 }], rows])

    const env = await paginate<{ id: number; owner: string; name: string }>(
        db,
        users,
        { page: 2, perPage: 15, baseUrl: '/users' },
    )

    assertEquals(env.meta.strategy, 'offset')
    assertEquals(env.meta.total, 57)
    assertEquals(env.meta.currentPage, 2)
    assertEquals(env.meta.lastPage, 4)
    assertEquals(env.data, rows)
    // Two queries: count, then the window with limit/offset.
    assertEquals(records.length, 2)
    assertEquals(records[1].limit, 15)
    assertEquals(records[1].offset, 15)
})

Deno.test('SC-005 offset — the caller filter reaches BOTH count and window', async () => {
    const filter = eq(users.owner, 'me')
    const { db, records } = fakeDb([[{ total: 3 }], []])

    await paginate(db, users, {
        page: 1,
        perPage: 10,
        baseUrl: '/users',
        where: filter,
    })

    // If pagination replaced or dropped the filter, one of these would be
    // undefined or a different SQL — this is the cross-tenant guard.
    assertEquals(records[0].where, filter, 'count must use the caller filter')
    assertEquals(records[1].where, filter, 'window must use the caller filter')
})

Deno.test('SC-005 cursor — cursor predicate is AND-composed with the caller filter, never replacing it', async () => {
    const filter = eq(users.owner, 'me')
    const cursor = encodeCursor('id', 30)
    const { db, records } = fakeDb([[]])

    await paginate<{ id: number; owner: string; name: string }>(db, users, {
        strategy: 'cursor',
        perPage: 10,
        baseUrl: '/feed',
        where: filter,
        cursorColumn: users.id,
        cursorOf: (r) => r.id,
        cursor,
    })

    // Mutation-meaningful (review HIGH): the composed WHERE must CONTAIN the
    // caller's filter object, wherever `and()` nests it. If paginate dropped the
    // tenancy filter and applied only the bare cursor predicate, `filter` would
    // be absent from the clause and this fails — the exact cross-tenant
    // regression this test is named to guard.
    const where = records[0].where
    assert(where !== undefined, 'a WHERE clause must be present')
    assert(
        whereContains(where, filter),
        'composed WHERE must contain the caller filter (AND-composition), not a bare cursor predicate',
    )
    // And it must genuinely be a composition, not the filter alone (cursor kept).
    assert(
        where !== filter,
        'the cursor predicate must be composed in, not dropped',
    )
    assertEquals(records[0].limit, 11) // perPage + 1 to detect hasMore
})

Deno.test('cursor paginate — hasMore, opaque nextCursor, trimmed data', async () => {
    // 3 rows for perPage 2 → hasMore, trimmed to 2, nextCursor from row 2.
    const fetched = [{ id: 1, owner: 'me', name: 'a' }, {
        id: 2,
        owner: 'me',
        name: 'b',
    }, { id: 3, owner: 'me', name: 'c' }]
    const { db } = fakeDb([fetched])

    const env = await paginate<{ id: number; owner: string; name: string }>(
        db,
        users,
        {
            strategy: 'cursor',
            perPage: 2,
            baseUrl: '/feed',
            cursorColumn: users.id,
            cursorOf: (r) => r.id,
        },
    )

    assertEquals(env.meta.strategy, 'cursor')
    assertEquals(env.meta.hasMore, true)
    assertEquals(env.data.length, 2)
    assertEquals(env.meta.nextCursor, encodeCursor('id', 2))
    // The cursor is opaque — not the raw id on the wire.
    assertEquals(env.meta.nextCursor !== '2', true)
})
