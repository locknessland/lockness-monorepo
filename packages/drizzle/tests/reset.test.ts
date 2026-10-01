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
    assertThrows,
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

for (
    const database of [
        'mysql',
        'sys',
        'performance_schema',
        'information_schema',
        'MySQL',
        'SYS',
        'Performance_Schema',
        'INFORMATION_SCHEMA',
    ]
) {
    Deno.test(`#435 mysql refuses the system database ${database}, before any drop`, async () => {
        const { calls, maintenance } = fakeMaintenance({
            'information_schema.TABLES': [{ name: 'user', type: 'BASE TABLE' }],
            'DATABASE() AS name': [{ name: database }],
        })

        const error = await assertRejects(
            () => resetDatabase(maintenance, scope('mysql')),
            FreshRefusedError,
        )

        assertStringIncludes(error.message, 'system database')
        assertEquals(calls, ['query'], 'it read the catalogue or dropped')
    })
}

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
        'CREATE TEMPORARY TABLE lockness_fresh_census',
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
    assertStringIncludes(plan.at(-1) ?? '', 'DO $lockness_fresh$')
    assertEquals(plan.some((s) => /DROP SCHEMA/.test(s)), false)
})

/** The R7 baseline and check of a plan over `schemaFilter`, nothing dropped. */
function census(
    schemaFilter: readonly string[] = ['public'],
): { readonly baseline: string; readonly check: string } {
    const plan = planPostgresReset(EMPTY, scope('postgres', { schemaFilter }))
    return { baseline: plan[1], check: plan.at(-1) ?? '' }
}

for (
    const schemaFilter of [['public'], ['public', 'auth']] as const
) {
    Deno.test(
        `#435 R7 postgres plan: the census baseline is taken before the first CASCADE and checked last, over ${
            schemaFilter.join(', ')
        }`,
        () => {
            const plan = planPostgresReset({
                ...EMPTY,
                relations: [{ schema: 'public', name: 'users', kind: 'r' }],
            }, scope('postgres', { schemaFilter }))

            assertEquals(plan.length, 4)
            assertEquals(
                plan[0],
                'DROP TABLE IF EXISTS "drizzle"."__drizzle_migrations"',
            )
            assert(
                plan[1].startsWith(
                    'CREATE TEMPORARY TABLE lockness_fresh_census ON COMMIT DROP AS\n',
                ),
                plan[1],
            )
            assertEquals(
                plan[2],
                'DROP TABLE IF EXISTS "public"."users" CASCADE',
            )
            assert(plan[3].startsWith('DO $lockness_fresh$\n'), plan[3])
        },
    )
}

Deno.test('#435 R7 the baseline is every user object pg_depend records as a dependent', () => {
    const { baseline } = census()

    assertStringIncludes(
        baseline,
        'SELECT DISTINCT d.classid, d.objid, d.objsubid, o.type, o.identity\n' +
            'FROM pg_catalog.pg_depend d\n',
    )
    assertStringIncludes(
        baseline,
        'WHERE d.classid <> 0 AND d.objid >= 16384\n',
    )
})

Deno.test('#435 R7 the baseline names objects through pg_identify_object, the object and its owner', () => {
    const { baseline } = census()

    assertStringIncludes(
        baseline,
        'CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.classid, d.objid, d.objsubid) o\n',
    )
    assertStringIncludes(
        baseline,
        'CROSS JOIN LATERAL pg_catalog.pg_identify_object(w.refclassid, w.refobjid, w.refobjsubid) r\n',
    )
    assertStringIncludes(
        baseline,
        'WHERE (w.classid, w.objid, w.objsubid) = (d.classid, d.objid, d.objsubid)\n',
    )
})

Deno.test("#435 R7 an object without a schema is classified by its owner, through deptypes exactly ('a', 'i', 'P', 'S')", () => {
    const { baseline } = census()

    assertEquals(baseline.match(/deptype IN \([^)]*\)/g), [
        "deptype IN ('a', 'i', 'P', 'S')",
    ])
    assertStringIncludes(baseline, "AND w.deptype IN ('a', 'i', 'P', 'S') AND ")
    assertStringIncludes(baseline, 'WHEN o.schema IS NOT NULL THEN ')
})

Deno.test("#435 R7 the four exclusions apply to the object's own schema and to its owner's", () => {
    const { baseline } = census(['public', "o'brien"])

    for (const column of ['o.schema', 'r.schema']) {
        assertStringIncludes(
            baseline,
            `(${column} IN ('public', 'o''brien') ` +
                `OR ${column} IN ('pg_catalog', 'information_schema') ` +
                `OR ${column} LIKE 'pg\\_toast%' ` +
                `OR ${column} LIKE 'pg\\_temp%')`,
        )
    }
    assertStringIncludes(baseline, 'AND NOT CASE\n')
})

Deno.test('#435 R7 the check probes pg_depend as it is now, never the census query again', () => {
    const { check } = census()

    assertStringIncludes(check, 'FROM pg_temp.lockness_fresh_census c\n')
    assertStringIncludes(
        check,
        'WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d ' +
            'WHERE d.classid = c.classid AND d.objid = c.objid ' +
            'AND d.objsubid = c.objsubid)',
    )
    assertEquals(check.includes('pg_identify_object'), false)
    assertEquals(check.includes('pg_catalog.pg_class'), false)
})

Deno.test('#435 R7 no count comparison remains', () => {
    const { baseline, check } = census()

    assertEquals(baseline.includes('count('), false)
    assertEquals(/\b(baseline|remaining)\b/.test(check), false)
    assertEquals(/<>\s*\w+;/.test(check), false)
    assertEquals(baseline.includes('tgisinternal'), false)
})

Deno.test('#435 R7 the RAISE names the count, the first ten escaped objects and the rollback', () => {
    const { check } = census()

    assertStringIncludes(check, "concat_ws(' ', c.type, c.identity)")
    assertStringIncludes(check, 'LIMIT 10')
    assertStringIncludes(check, 'IF escaped > 0 THEN')
    assert(
        /RAISE EXCEPTION '[^']*%[^']*%[^']*rolled back', escaped, labels;/.test(
            check,
        ),
        check,
    )
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

const SYSTEM_SCHEMA_SCOPES: ReadonlyArray<
    readonly [string, Partial<ResetScope>]
> = [
    ['schemaFilter pg_catalog', { schemaFilter: ['public', 'pg_catalog'] }],
    ['schemaFilter information_schema', {
        schemaFilter: ['information_schema'],
    }],
    ['schemaFilter pg_toast', { schemaFilter: ['pg_toast'] }],
    ['schemaFilter any pg_*', { schemaFilter: ['pg_temp_3'] }],
    ['schemaFilter, in another case', { schemaFilter: ['PG_Catalog'] }],
    ['migrations.schema pg_catalog', { schema: 'pg_catalog' }],
    ['migrations.schema information_schema', {
        schema: 'Information_Schema',
    }],
]

for (const [label, overrides] of SYSTEM_SCHEMA_SCOPES) {
    Deno.test(`#435 postgres refuses a system schema (${label}), before any read or drop`, async () => {
        const { calls, maintenance } = fakeMaintenance({})

        const error = await assertRejects(
            () => resetDatabase(maintenance, scope('postgres', overrides)),
            FreshRefusedError,
        )

        assertStringIncludes(error.message, 'system schema')
        assertEquals(calls, [], 'it read the catalogue or dropped')
    })

    Deno.test(`#435 planPostgresReset refuses a system schema (${label})`, () => {
        assertThrows(
            () => planPostgresReset(EMPTY, scope('postgres', overrides)),
            FreshRefusedError,
            'system schema',
        )
    })
}

Deno.test('#435 postgres accepts a schema that merely contains pg_ or information_schema', () => {
    const plan = planPostgresReset(
        EMPTY,
        scope('postgres', {
            schemaFilter: ['app_pg_data', 'my_information_schema'],
            schema: 'meta_pg',
        }),
    )
    assertEquals(
        plan[0],
        'DROP TABLE IF EXISTS "meta_pg"."__drizzle_migrations"',
    )
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
