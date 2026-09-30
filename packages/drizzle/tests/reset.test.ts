/**
 * @fileoverview #435 — the `db:fresh` reset policy, at the SQL-plan level.
 *
 * The planners are pure, so every dialect's plan is asserted statement by
 * statement. postgres and MySQL are proven here only; sqlite also runs
 * end-to-end in `fresh_libsql.test.ts`. The refusals (R5, R6) are driven
 * through `resetDatabase` with a maintenance fake whose `execute` records —
 * a refusal must leave it uncalled.
 *
 * @module @lockness/drizzle/tests/reset
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import type { SchemaMaintenance } from '../drivers.ts'
import {
    describeResetScope,
    FreshRefusedError,
    planMysqlReset,
    planPostgresReset,
    planSqliteReset,
    type PostgresCatalogue,
    postgresCatalogueQueries,
    postgresCensusSql,
    resetDatabase,
    type ResetScope,
} from '../reset.ts'

/** A scope with the drizzle-kit defaults for `dialect`. */
function scope(
    dialect: ResetScope['dialect'],
    overrides: Partial<ResetScope> = {},
): ResetScope {
    return {
        dialect,
        table: '__drizzle_migrations',
        schema: dialect === 'postgres' ? 'drizzle' : undefined,
        schemaFilter: ['public'],
        statements: [],
        ...overrides,
    }
}

/**
 * A maintenance fake answering each catalogue query by the first `answers`
 * key its SQL contains, and recording every call in order.
 */
function fakeMaintenance(answers: Record<string, Record<string, unknown>[]>) {
    const calls: string[] = []
    const executed: string[][] = []
    const maintenance: SchemaMaintenance = {
        query: (sql) => {
            calls.push('query')
            const key = Object.keys(answers).find((k) => sql.includes(k))
            return Promise.resolve(key === undefined ? [] : answers[key])
        },
        execute: (statements) => {
            calls.push('execute')
            executed.push([...statements])
            return Promise.resolve()
        },
        migrate: () => {
            calls.push('migrate')
            return Promise.resolve()
        },
    }
    return { calls, executed, maintenance }
}

// -----------------------------------------------------------------------------
// sqlite / libsql — the whole main database, one write batch
// -----------------------------------------------------------------------------

Deno.test('#435 sqlite plan defers FKs, then drops views, then tables', () => {
    const plan = planSqliteReset([
        { type: 'table', name: 'users' },
        { type: 'view', name: 'active_users' },
        { type: 'table', name: 'posts' },
        { type: 'table', name: '__drizzle_migrations' },
        { type: 'table', name: 'sqlite_sequence' },
        { type: 'table', name: 'libsql_wasm_func_table' },
        { type: 'table', name: 'we"ird' },
    ])

    assertEquals(plan, [
        'PRAGMA defer_foreign_keys = ON',
        'DROP VIEW IF EXISTS "active_users"',
        'DROP TABLE IF EXISTS "users"',
        'DROP TABLE IF EXISTS "posts"',
        'DROP TABLE IF EXISTS "__drizzle_migrations"',
        'DROP TABLE IF EXISTS "we""ird"',
    ])
})

Deno.test('#435 sqlite reset reads the catalogue, then executes one plan', async () => {
    const { calls, executed, maintenance } = fakeMaintenance({
        sqlite_master: [{ type: 'table', name: 't' }],
    })

    await resetDatabase(maintenance, scope('sqlite'))

    assertEquals(calls, ['query', 'execute'])
    assertEquals(executed, [[
        'PRAGMA defer_foreign_keys = ON',
        'DROP TABLE IF EXISTS "t"',
    ]])
})

// -----------------------------------------------------------------------------
// mysql — DATABASE(), a dedicated session, checks off then on
// -----------------------------------------------------------------------------

Deno.test('#435 mysql plan turns FK checks off, drops views then tables, turns them on', () => {
    const plan = planMysqlReset([
        { name: 'users', type: 'BASE TABLE' },
        { name: 'recent', type: 'VIEW' },
        { name: '__drizzle_migrations', type: 'BASE TABLE' },
        { name: 'we`ird', type: 'BASE TABLE' },
    ])

    assertEquals(plan, [
        'SET FOREIGN_KEY_CHECKS = 0',
        'DROP VIEW IF EXISTS `recent`',
        'DROP TABLE IF EXISTS `users`',
        'DROP TABLE IF EXISTS `__drizzle_migrations`',
        'DROP TABLE IF EXISTS `we``ird`',
        'SET FOREIGN_KEY_CHECKS = 1',
    ])
})

Deno.test('#435 R5 mysql refuses when DATABASE() is NULL, before any drop', async () => {
    const { calls, maintenance } = fakeMaintenance({
        'DATABASE()': [{ name: null }],
    })

    const error = await assertRejects(
        () => resetDatabase(maintenance, scope('mysql')),
        FreshRefusedError,
    )

    assertStringIncludes(error.message, 'no database selected')
    assertEquals(calls.includes('execute'), false)
})

Deno.test('#435 mysql reset lists only the current database', async () => {
    const { executed, maintenance } = fakeMaintenance({
        'information_schema.TABLES': [{ name: 't', type: 'BASE TABLE' }],
        'DATABASE() AS name': [{ name: 'app' }],
    })

    await resetDatabase(maintenance, scope('mysql'))

    assertEquals(executed.length, 1)
    assertEquals(executed[0].at(1), 'DROP TABLE IF EXISTS `t`')
})

// -----------------------------------------------------------------------------
// postgres — one transaction, census last
// -----------------------------------------------------------------------------

const EMPTY: PostgresCatalogue = {
    relations: [],
    types: [],
    routines: [],
    extensionSchemas: [],
}

Deno.test('#435 postgres plan: bookkeeping, census baseline, CASCADE per object, census check', () => {
    const plan = planPostgresReset({
        relations: [
            { schema: 'public', name: 'users', kind: 'r' },
            { schema: 'public', name: 'recent', kind: 'v' },
            { schema: 'public', name: 'stats', kind: 'm' },
            { schema: 'public', name: 'counter', kind: 'S' },
            { schema: 'public', name: 'events', kind: 'p' },
            { schema: 'public', name: 'remote', kind: 'f' },
        ],
        types: [
            { schema: 'public', name: 'mood_multirange', kind: 'm' },
            { schema: 'public', name: 'mood', kind: 'e' },
            { schema: 'public', name: 'email', kind: 'd' },
            { schema: 'public', name: 'pair', kind: 'c' },
            { schema: 'public', name: 'span', kind: 'r' },
        ],
        routines: [{ schema: 'public', name: 'touch', args: 'id integer' }],
        extensionSchemas: [],
    }, scope('postgres'))

    assertEquals(plan.slice(0, 1), [
        'DROP TABLE IF EXISTS "drizzle"."__drizzle_migrations"',
    ])
    assertStringIncludes(
        plan[1],
        'CREATE TEMPORARY TABLE lockness_fresh_census ON COMMIT DROP AS ',
    )
    assertEquals(plan.slice(2, -1), [
        'DROP VIEW IF EXISTS "public"."recent" CASCADE',
        'DROP MATERIALIZED VIEW IF EXISTS "public"."stats" CASCADE',
        'DROP TABLE IF EXISTS "public"."users" CASCADE',
        'DROP TABLE IF EXISTS "public"."events" CASCADE',
        'DROP FOREIGN TABLE IF EXISTS "public"."remote" CASCADE',
        'DROP SEQUENCE IF EXISTS "public"."counter" CASCADE',
        'DROP ROUTINE IF EXISTS "public"."touch"(id integer) CASCADE',
        'DROP TYPE IF EXISTS "public"."mood" CASCADE',
        'DROP DOMAIN IF EXISTS "public"."email" CASCADE',
        'DROP TYPE IF EXISTS "public"."pair" CASCADE',
        'DROP TYPE IF EXISTS "public"."span" CASCADE',
        'DROP TYPE IF EXISTS "public"."mood_multirange" CASCADE',
    ])
    const check = plan.at(-1)!
    assert(check.startsWith('DO $lockness_fresh$'), check)
    assertStringIncludes(check, 'FROM pg_temp.lockness_fresh_census')
    assertStringIncludes(check, 'RAISE EXCEPTION')
    assertStringIncludes(check, postgresCensusSql(['public']))
    assertEquals(plan.some((s) => /DROP SCHEMA/.test(s)), false)
})

Deno.test('#435 postgres plan keeps the schema and never drops public', () => {
    const plan = planPostgresReset(EMPTY, scope('postgres'))
    assertEquals(plan.some((s) => s.includes('SCHEMA')), false)
    assertEquals(plan.length, 3, 'bookkeeping, baseline, census check')
})

Deno.test('#435 postgres plan honours migrations.table and migrations.schema', () => {
    const plan = planPostgresReset(
        EMPTY,
        scope('postgres', { table: 'history', schema: 'meta' }),
    )
    assertEquals(plan[0], 'DROP TABLE IF EXISTS "meta"."history"')
})

Deno.test('#435 postgres plan skips the bookkeeping table when it lives in scope', () => {
    const plan = planPostgresReset({
        ...EMPTY,
        relations: [{ schema: 'public', name: 'history', kind: 'r' }],
    }, scope('postgres', { table: 'history', schema: 'public' }))

    assertEquals(plan[0], 'DROP TABLE IF EXISTS "public"."history"')
    assertEquals(
        plan.filter((s) => s.includes('"history"')).length,
        1,
        'dropped twice',
    )
})

Deno.test('#435 postgres drops a scope schema a migration creates, and the objects in it with it', () => {
    const plan = planPostgresReset(
        {
            ...EMPTY,
            relations: [
                { schema: 'auth', name: 'sessions', kind: 'r' },
                { schema: 'public', name: 'users', kind: 'r' },
            ],
        },
        scope('postgres', {
            schemaFilter: ['public', 'auth'],
            statements: ['CREATE SCHEMA "auth";\n', 'CREATE TABLE "x" ()'],
        }),
    )

    assertEquals(plan.slice(2, -1), [
        'DROP SCHEMA IF EXISTS "auth" CASCADE',
        'DROP TABLE IF EXISTS "public"."users" CASCADE',
    ])
})

Deno.test('#435 R6 refuses a migration that creates a schema outside the scope', () => {
    const error = (() => {
        try {
            planPostgresReset(
                EMPTY,
                scope('postgres', { statements: ['CREATE SCHEMA "audit";'] }),
            )
        } catch (e) {
            return e
        }
    })()
    assert(error instanceof FreshRefusedError, String(error))
    assertStringIncludes(error.message, '"audit"')
})

Deno.test('#435 R6 ignores CREATE SCHEMA IF NOT EXISTS, which re-runs cleanly', () => {
    const plan = planPostgresReset(
        EMPTY,
        scope('postgres', {
            statements: ['CREATE SCHEMA IF NOT EXISTS "audit";'],
        }),
    )
    assertEquals(plan.some((s) => s.includes('audit')), false)
})

Deno.test('#435 R6 refuses to drop a schema that holds extension members', () => {
    const error = (() => {
        try {
            planPostgresReset(
                { ...EMPTY, extensionSchemas: ['auth'] },
                scope('postgres', {
                    schemaFilter: ['public', 'auth'],
                    statements: ['CREATE SCHEMA "auth";'],
                }),
            )
        } catch (e) {
            return e
        }
    })()
    assert(error instanceof FreshRefusedError, String(error))
    assertStringIncludes(error.message, 'extension')
})

Deno.test('#435 the census excludes the scope, pg_catalog, information_schema, pg_toast* and pg_temp*', () => {
    const census = postgresCensusSql(['public', "o'brien"])

    for (
        const catalogue of [
            'pg_class',
            'pg_attribute',
            'pg_attrdef',
            'pg_type',
            'pg_proc',
            'pg_constraint',
            'pg_trigger',
            'pg_policy',
        ]
    ) {
        assertStringIncludes(census, `pg_catalog.${catalogue} `)
    }
    assertStringIncludes(census, "NOT IN ('public', 'o''brien')")
    assertStringIncludes(census, "NOT IN ('pg_catalog', 'information_schema')")
    assertStringIncludes(census, "NOT LIKE 'pg\\_toast%'")
    assertStringIncludes(census, "NOT LIKE 'pg\\_temp%'")
    assertStringIncludes(census, 'NOT g.tgisinternal')
})

Deno.test('#435 the catalogue reads exclude extension members and owned sequences', () => {
    const queries = postgresCatalogueQueries(['public'])

    for (const key of ['relations', 'types'] as const) {
        assertStringIncludes(queries[key], "deptype = 'e'")
    }
    for (const key of ['relations', 'types', 'routines'] as const) {
        assertStringIncludes(queries[key], "IN ('public')")
    }
    assertStringIncludes(queries.relations, "c.relkind = 'S'")
    assertStringIncludes(queries.relations, "deptype IN ('a', 'i')")
    assertStringIncludes(queries.relations, "('r', 'p', 'v', 'm', 'S', 'f')")
    assertStringIncludes(queries.types, "('e', 'd', 'r', 'm')")
    assertStringIncludes(queries.types, "relkind = 'c'")
    assertStringIncludes(queries.routines, "deptype IN ('e', 'i')")
})

Deno.test('#435 postgres reset reads the whole catalogue before executing', async () => {
    const { calls, executed, maintenance } = fakeMaintenance({
        'pg_catalog.pg_extension': [],
        'relkind IN': [{ schema: 'public', name: 'users', kind: 'r' }],
    })

    await resetDatabase(maintenance, scope('postgres'))

    assertEquals(calls, ['query', 'query', 'query', 'query', 'execute'])
    assertEquals(executed.length, 1)
    assertEquals(
        executed[0].includes('DROP TABLE IF EXISTS "public"."users" CASCADE'),
        true,
    )
})

Deno.test('#435 a catalogue row of the wrong shape is refused before any drop', async () => {
    const { calls, maintenance } = fakeMaintenance({
        sqlite_master: [{ type: 'table', name: 42 }],
    })
    await assertRejects(
        () => resetDatabase(maintenance, scope('sqlite')),
        FreshRefusedError,
    )
    assertEquals(calls.includes('execute'), false)
})

// -----------------------------------------------------------------------------
// The one line db:fresh prints
// -----------------------------------------------------------------------------

Deno.test('#435 the scope line names the dialect and the scope, never the DSN', () => {
    const withUrl = {
        ...scope('postgres', { schemaFilter: ['public', 'auth'] }),
        url: 'postgres://app:s3cret@db:5432/app',
    }
    const line = describeResetScope(withUrl)
    assertStringIncludes(line, 'postgres')
    assertStringIncludes(line, '"public", "auth"')
    assertStringIncludes(line, '"drizzle"."__drizzle_migrations"')
    assertEquals(line.includes('s3cret'), false)
    assertEquals(line.includes('db:5432'), false)

    assertStringIncludes(describeResetScope(scope('sqlite')), 'sqlite')
    assertStringIncludes(describeResetScope(scope('mysql')), 'mysql')
})
