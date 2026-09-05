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
import {
    decodeCursor,
    encodeCursor,
    MalformedCursorError,
    paginate,
} from '../paginate.ts'

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

Deno.test('decodeCursor surfaces a typed 400 error, not an uncaught throw', () => {
    // A client-supplied garbage cursor is a 400, not a 500: the thrown error
    // is the framework-mapped MalformedCursorError carrying `status = 400`,
    // which the default error handler renders as a Bad Request.
    const notDecodable = assertThrows(
        () => decodeCursor('!!!not-base64!!!'),
        MalformedCursorError,
    ) as MalformedCursorError
    assertEquals(notDecodable.status, 400)

    const wrongShape = assertThrows(
        () => decodeCursor(encodeCursor('id', 1).slice(0, 4)),
        MalformedCursorError,
    ) as MalformedCursorError
    assertEquals(wrongShape.status, 400)
})

Deno.test('decodeCursor rejects a token minted for a different column', () => {
    // A token forged/minted against another column must not be honoured when
    // the caller pages a different column (AC-1).
    const foreign = encodeCursor('email', 'a@b.co')
    const err = assertThrows(
        () => decodeCursor(foreign, 'id'),
        MalformedCursorError,
    ) as MalformedCursorError
    assertEquals(err.status, 400)
})

Deno.test('decodeCursor accepts a token whose column matches the caller', () => {
    assertEquals(decodeCursor(encodeCursor('id', 42), 'id'), {
        column: 'id',
        value: 42,
    })
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

Deno.test('cursor paginate — first page has no incoming cursor, so no prev query and prevCursor is null (#252)', async () => {
    // The first page is reached without a cursor: there is no page before it,
    // and the driver must NOT waste a reverse-order query establishing that.
    const fetched = [{ id: 1, owner: 'me', name: 'a' }, {
        id: 2,
        owner: 'me',
        name: 'b',
    }, { id: 3, owner: 'me', name: 'c' }]
    const { db, records } = fakeDb([fetched])

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

    assertEquals(env.meta.prevCursor, null)
    assertEquals(env.links.prev, null)
    // Exactly ONE query: the forward page. No reverse prev-query on page 1.
    assertEquals(records.length, 1)
})

Deno.test('cursor paginate (asc) — prevCursor is a GENUINE previous page from a reverse query, not the incoming token (#252)', async () => {
    // Page 3 of an ascending feed, reached with the cursor minted on page 2.
    const cursor = encodeCursor('id', 20)
    // Forward page (perPage + 1 → hasMore): ids 21,22,(23).
    const forward = [{ id: 21 }, { id: 22 }, { id: 23 }]
    // Reverse-order query bounded by the current page's first row (id 21):
    // `id < 21` DESC, perPage + 1 rows → 20,19,(18). The (perPage+1)-th row,
    // id 18, is the boundary: a FORWARD `id > 18` returns exactly {19,20} =
    // the genuine previous page.
    const reverse = [{ id: 20 }, { id: 19 }, { id: 18 }]
    const { db, records } = fakeDb([forward, reverse])

    const env = await paginate<{ id: number }>(db, users, {
        strategy: 'cursor',
        perPage: 2,
        baseUrl: '/feed',
        cursorColumn: users.id,
        cursorOf: (r) => r.id,
        cursor,
    })

    assertEquals(env.meta.nextCursor, encodeCursor('id', 22))
    // The prev cursor is the reverse-query boundary, NOT the incoming token
    // (the old defect re-emitted `opts.cursor`, which re-fetches page 3), and
    // NOT the current page's first row.
    assertEquals(env.meta.prevCursor, encodeCursor('id', 18))
    assert(
        env.meta.prevCursor !== cursor,
        'prevCursor must not be the incoming (current page) token',
    )
    assert(
        env.meta.prevCursor !== encodeCursor('id', 21),
        'prevCursor must not be the current page first row',
    )
    // Two queries: the forward page, then the reverse-order prev query.
    assertEquals(records.length, 2)
    assertEquals(records[1].limit, 3) // perPage + 1
})

Deno.test('cursor paginate — navigating backward from page N returns page N-1 rows in the correct (caller) order (#252)', async () => {
    // Page 3 first, to obtain its prevCursor.
    const page3Forward = [{ id: 21 }, { id: 22 }, { id: 23 }]
    const page3Reverse = [{ id: 20 }, { id: 19 }, { id: 18 }]
    const { db: db3 } = fakeDb([page3Forward, page3Reverse])
    const page3 = await paginate<{ id: number }>(db3, users, {
        strategy: 'cursor',
        perPage: 2,
        baseUrl: '/feed',
        cursorColumn: users.id,
        cursorOf: (r) => r.id,
        cursor: encodeCursor('id', 20),
    })
    const prev = page3.meta.prevCursor
    assertEquals(prev, encodeCursor('id', 18))

    // Follow the prev cursor through the SAME forward mechanism: `id > 18`
    // ASC → the genuine previous page (page 2) in ascending order.
    const page2Forward = [{ id: 19 }, { id: 20 }, { id: 21 }]
    const page2Reverse = [{ id: 18 }, { id: 17 }, { id: 16 }]
    const { db: db2 } = fakeDb([page2Forward, page2Reverse])
    const page2 = await paginate<{ id: number }>(db2, users, {
        strategy: 'cursor',
        perPage: 2,
        baseUrl: '/feed',
        cursorColumn: users.id,
        cursorOf: (r) => r.id,
        cursor: prev ?? undefined,
    })

    // Page N-1's rows, in the caller's ascending order — not reversed.
    assertEquals(page2.data, [{ id: 19 }, { id: 20 }])
})

Deno.test('cursor paginate (desc) — reverse-order prev query mints a genuine descending previous page (#252)', async () => {
    // Descending feed, page reached with cursor id 80.
    const cursor = encodeCursor('id', 80)
    // Forward DESC page (`id < 80`): 79,78,(77) → data 79,78.
    const forward = [{ id: 79 }, { id: 78 }, { id: 77 }]
    // Reverse of DESC is ASC, bounded by first row id 79: `id > 79` ASC,
    // perPage + 1 → 80,81,(82). Boundary id 82: a forward DESC `id < 82`
    // returns {81,80} = the genuine previous page.
    const reverse = [{ id: 80 }, { id: 81 }, { id: 82 }]
    const { db, records } = fakeDb([forward, reverse])

    const env = await paginate<{ id: number }>(db, users, {
        strategy: 'cursor',
        perPage: 2,
        baseUrl: '/feed',
        cursorColumn: users.id,
        cursorOf: (r) => r.id,
        direction: 'desc',
        cursor,
    })

    assertEquals(env.data, [{ id: 79 }, { id: 78 }])
    assertEquals(env.meta.nextCursor, encodeCursor('id', 78))
    assertEquals(env.meta.prevCursor, encodeCursor('id', 82))
    assert(
        env.meta.prevCursor !== cursor,
        'prevCursor must not be the incoming token',
    )
    assertEquals(records.length, 2)
})

Deno.test('cursor paginate — start edge: a short reverse page yields prevCursor null (#252)', async () => {
    // Page 2 with cursor id 10. The reverse query bounded by first row id 11
    // (`id < 11` DESC, perPage + 1) returns FEWER than perPage + 1 rows — the
    // previous page reaches the very start — so there is no boundary token and
    // prevCursor is null.
    const forward = [{ id: 11 }, { id: 12 }, { id: 13 }]
    const reverse = [{ id: 10 }, { id: 9 }]
    const { db, records } = fakeDb([forward, reverse])

    const env = await paginate<{ id: number }>(db, users, {
        strategy: 'cursor',
        perPage: 2,
        baseUrl: '/feed',
        cursorColumn: users.id,
        cursorOf: (r) => r.id,
        cursor: encodeCursor('id', 10),
    })

    assertEquals(env.meta.prevCursor, null)
    assertEquals(env.links.prev, null)
    // The reverse query WAS issued (to establish there is no full prev page).
    assertEquals(records.length, 2)
})
