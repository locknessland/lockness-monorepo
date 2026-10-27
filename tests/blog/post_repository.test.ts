/**
 * PostRepository tests (T007).
 *
 * Mocked-Database unit tests (Q15) that assert each query's filter and ordering
 * by serialising the captured Drizzle conditions with `PgDialect`. The key
 * safety assertion (S1): `findPublishedBySlug` pins `draft = false` at the DB.
 */

import { assert, assertEquals } from '@std/assert'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Database } from '@lockness/drizzle'
import { PostRepository } from '../../app/repository/post_repository.ts'
import type { Post } from '../../app/model/post.ts'

/** Records the WHERE / ORDER BY conditions a repository method builds. */
interface CapturedQuery {
    whereCalled: boolean
    where?: SQL
    orderBy?: SQL
}

/** Minimal chainable stand-in for the Drizzle query builder. */
interface FakeBuilder {
    select(): FakeBuilder
    from(table: unknown): FakeBuilder
    where(condition: SQL): FakeBuilder
    orderBy(order: SQL): FakeBuilder
    then(resolve: (rows: Post[]) => void): void
}

/**
 * Build a fake `Database` that records the query it is asked to run and
 * resolves to `rows` when awaited.
 */
function mockDatabase(
    rows: Post[],
): { database: Database; captured: CapturedQuery } {
    const captured: CapturedQuery = { whereCalled: false }
    const builder: FakeBuilder = {
        select: () => builder,
        from: () => builder,
        where: (condition: SQL) => {
            captured.whereCalled = true
            captured.where = condition
            return builder
        },
        orderBy: (order: SQL) => {
            captured.orderBy = order
            return builder
        },
        then: (resolve: (rows: Post[]) => void) => resolve(rows),
    }
    return { database: { db: builder } as unknown as Database, captured }
}

const dialect = new PgDialect()
const sqlOf = (sql: SQL) => dialect.sqlToQuery(sql)

function makeRepo(rows: Post[]) {
    const { database, captured } = mockDatabase(rows)
    const repo = new PostRepository()
    repo.database = database
    return { repo, captured }
}

Deno.test('findAllPublished - filters draft=false and orders date DESC', async () => {
    const { repo, captured } = makeRepo([])
    await repo.findAllPublished()

    assert(captured.whereCalled, 'a WHERE clause must be applied')
    const where = sqlOf(captured.where!)
    assertEquals(where.sql, '"posts"."draft" = $1')
    assertEquals(where.params, [false])
    assertEquals(sqlOf(captured.orderBy!).sql, '"posts"."date" desc')
})

Deno.test('findAllIncludingDrafts - no WHERE, orders date DESC (A6)', async () => {
    const { repo, captured } = makeRepo([])
    await repo.findAllIncludingDrafts()

    assertEquals(captured.whereCalled, false)
    assertEquals(sqlOf(captured.orderBy!).sql, '"posts"."date" desc')
})

Deno.test('findPublishedBySlug - binds slug AND draft=false at the DB (S1)', async () => {
    const { repo, captured } = makeRepo([])
    await repo.findPublishedBySlug('hello-world')

    const where = sqlOf(captured.where!)
    assertEquals(
        where.sql,
        '("posts"."slug" = $1 and "posts"."draft" = $2)',
    )
    assertEquals(where.params, ['hello-world', false])
    assertEquals(sqlOf(captured.orderBy!).sql, '"posts"."date" desc')
})

Deno.test('findBySlug - binds slug only, unfiltered by draft', async () => {
    const { repo, captured } = makeRepo([])
    await repo.findBySlug('hello-world')

    const where = sqlOf(captured.where!)
    assertEquals(where.sql, '"posts"."slug" = $1')
    assertEquals(where.params, ['hello-world'])
})

Deno.test('findPublishedBySlug - returns null when no row matches', async () => {
    const { repo } = makeRepo([])
    assertEquals(await repo.findPublishedBySlug('nope'), null)
})
