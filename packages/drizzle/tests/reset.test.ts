/**
 * @fileoverview #435 — the `db:fresh` reset policy, at the SQL-plan level.
 *
 * The planners are pure, so every dialect's plan is asserted statement by
 * statement. postgres and MySQL are proven here only; sqlite also runs
 * end-to-end in `fresh_libsql.test.ts`. The refusals (R5, R6) are driven
 * through `resetDatabase` with a fake that models ONE connection (#447): its
 * `execute` opens a unit, hands the planner a reader inside it, and records
 * `begin`, each `read`, each statement, then `commit` or `rollback` — a
 * refusal must leave reads followed by a rollback, and no statement.
 *
 * The rows of `tests/mutations/fresh_447.ts` name tests in this file.
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
import type { MaintenanceConnection } from '../drivers.ts'
import {
    describeResetScope,
    planMysqlReset,
    planPostgresReset,
    planSqliteReset,
    type PostgresCatalogue,
    postgresCatalogueQueries,
    resetDatabase,
    type ResetScope,
} from '../reset.ts'
import { RefusedError } from '../refusal.ts'

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
 * A one-connection fake answering each catalogue read by the first `answers`
 * key its SQL contains. `calls` records the unit in order — `begin`, each
 * `read`, then `commit` or `rollback` (and `query` for a read outside it);
 * `executed` holds the statements each unit ran.
 */
function fakeMaintenance(answers: Record<string, Record<string, unknown>[]>) {
    const calls: string[] = []
    const executed: string[][] = []
    const answer = (sql: string) => {
        const key = Object.keys(answers).find((k) => sql.includes(k))
        return Promise.resolve(key === undefined ? [] : answers[key])
    }
    const maintenance: MaintenanceConnection = {
        query: (sql) => {
            calls.push('query')
            return answer(sql)
        },
        execute: async (planner) => {
            calls.push('begin')
            try {
                const plan = await planner((sql) => {
                    calls.push('read')
                    return answer(sql)
                })
                executed.push([...plan])
                calls.push('commit')
            } catch (error) {
                calls.push('rollback')
                throw error
            }
        },
        migrate: () => {
            calls.push('migrate')
            return Promise.resolve()
        },
        close: () => {
            calls.push('close')
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

Deno.test('#435 #447 sqlite reset reads the catalogue inside the unit, then runs one plan in it', async () => {
    const { calls, executed, maintenance } = fakeMaintenance({
        sqlite_master: [{ type: 'table', name: 't' }],
    })

    await resetDatabase(maintenance, scope('sqlite'))

    assertEquals(calls, ['begin', 'read', 'commit'])
    assertEquals(executed, [[
        'PRAGMA defer_foreign_keys = ON',
        'DROP TABLE IF EXISTS "t"',
    ]])
})

// -----------------------------------------------------------------------------
// mysql — one read, a dedicated session, every DROP names the database
// -----------------------------------------------------------------------------

/** The rows the one MySQL catalogue read returns for `database`. */
function mysqlRows(
    database: string | null,
    objects: ReadonlyArray<readonly [string, string]>,
): Record<string, unknown>[] {
    return objects.length === 0
        ? [{ db: database, name: null, type: null }]
        : objects.map(([name, type]) => ({ db: database, name, type }))
}

/** A qualified MySQL DROP: `` DROP TABLE|VIEW IF EXISTS `db`.` ``… */
const QUALIFIED_DROP = /^DROP (TABLE|VIEW) IF EXISTS `(?:[^`]|``)+`\.`/

Deno.test('#435 mysql plan drops the bookkeeping table first, then views, then tables, each qualified by the database', () => {
    const plan = planMysqlReset(
        mysqlRows('we`ird', [
            ['__drizzle_migrations', 'BASE TABLE'],
            ['recent', 'VIEW'],
            ['users', 'BASE TABLE'],
            ['odd`name', 'BASE TABLE'],
        ]),
        '__drizzle_migrations',
    )

    assertEquals(plan, [
        'SET FOREIGN_KEY_CHECKS = 0',
        'DROP TABLE IF EXISTS `we``ird`.`__drizzle_migrations`',
        'DROP VIEW IF EXISTS `we``ird`.`recent`',
        'DROP TABLE IF EXISTS `we``ird`.`users`',
        'DROP TABLE IF EXISTS `we``ird`.`odd``name`',
        'SET FOREIGN_KEY_CHECKS = 1',
    ])
})

Deno.test('#435 mysql plan honours migrations.table', () => {
    const plan = planMysqlReset(
        mysqlRows('app', [['history', 'BASE TABLE'], ['t', 'BASE TABLE']]),
        'history',
    )

    assertEquals(plan, [
        'SET FOREIGN_KEY_CHECKS = 0',
        'DROP TABLE IF EXISTS `app`.`history`',
        'DROP TABLE IF EXISTS `app`.`t`',
        'SET FOREIGN_KEY_CHECKS = 1',
    ])
})

Deno.test('#435 mysql plan of an empty database: only the SETs and the bookkeeping drop', () => {
    assertEquals(
        planMysqlReset(mysqlRows('app', []), '__drizzle_migrations'),
        [
            'SET FOREIGN_KEY_CHECKS = 0',
            'DROP TABLE IF EXISTS `app`.`__drizzle_migrations`',
            'SET FOREIGN_KEY_CHECKS = 1',
        ],
    )
})

Deno.test('#435 every mysql DROP names the database', () => {
    for (
        const rows of [
            mysqlRows('app', [['v', 'VIEW'], ['t', 'BASE TABLE']]),
            mysqlRows('we`ird', [['v`1', 'VIEW'], ['t`1', 'BASE TABLE']]),
            mysqlRows('app', []),
        ]
    ) {
        const drops = planMysqlReset(rows, '__drizzle_migrations')
            .filter((s) => s.startsWith('DROP'))
        assert(drops.length > 0)
        for (const drop of drops) {
            assert(QUALIFIED_DROP.test(drop), drop)
        }
    }
})

Deno.test('#435 R5 mysql plan refuses a NULL DATABASE()', () => {
    assertThrows(
        () => planMysqlReset(mysqlRows(null, []), '__drizzle_migrations'),
        RefusedError,
        'no database selected',
    )
})

Deno.test('#435 mysql plan refuses rows naming more than one database', () => {
    assertThrows(
        () =>
            planMysqlReset([
                { db: 'app', name: 'a', type: 'BASE TABLE' },
                { db: 'other', name: 'b', type: 'BASE TABLE' },
            ], '__drizzle_migrations'),
        RefusedError,
        'more than one database',
    )
})

Deno.test('#435 mysql plan refuses a catalogue that returned no row', () => {
    const error = assertThrows(
        () => planMysqlReset([], '__drizzle_migrations'),
        RefusedError,
    )

    // The reason, not the type: every MySQL refusal is a RefusedError.
    assertEquals(
        error.reason,
        'the catalogue returned no row, not even the database name',
    )
})

Deno.test('#435 R5 mysql refuses when DATABASE() is NULL, before any drop', async () => {
    const { calls, executed, maintenance } = fakeMaintenance({
        'information_schema.TABLES': mysqlRows(null, []),
    })

    const error = await assertRejects(
        () => resetDatabase(maintenance, scope('mysql')),
        RefusedError,
    )

    assertStringIncludes(error.reason, 'no database selected')
    assertEquals(calls, ['begin', 'read', 'rollback'])
    assertEquals(executed, [], 'a statement ran')
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
        const { calls, executed, maintenance } = fakeMaintenance({
            'information_schema.TABLES': mysqlRows(database, [
                ['user', 'BASE TABLE'],
            ]),
        })

        const error = await assertRejects(
            () => resetDatabase(maintenance, scope('mysql')),
            RefusedError,
        )

        assertStringIncludes(error.reason, 'system database')
        assertEquals(calls, ['begin', 'read', 'rollback'])
        assertEquals(executed, [], 'it dropped')
    })
}

Deno.test('#435 mysql reset reads the database and its catalogue in exactly one query', async () => {
    const sqls: string[] = []
    const { calls, executed, maintenance } = fakeMaintenance({
        'information_schema.TABLES': mysqlRows('app', [['t', 'BASE TABLE']]),
    })
    const recording: MaintenanceConnection = {
        ...maintenance,
        execute: (planner) =>
            maintenance.execute((read) =>
                planner((sql) => {
                    sqls.push(sql)
                    return read(sql)
                })
            ),
    }

    await resetDatabase(recording, scope('mysql'))

    assertEquals(calls, ['begin', 'read', 'commit'])
    assertEquals(sqls.length, 1)
    assertStringIncludes(sqls[0], 'SELECT DATABASE() AS db')
    assertStringIncludes(sqls[0], 'LEFT JOIN information_schema.TABLES')
    assertEquals(executed, [[
        'SET FOREIGN_KEY_CHECKS = 0',
        'DROP TABLE IF EXISTS `app`.`__drizzle_migrations`',
        'DROP TABLE IF EXISTS `app`.`t`',
        'SET FOREIGN_KEY_CHECKS = 1',
    ]])
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

/** Every binary comparison or assignment in a SQL text, as written. */
const COMPARISON = /[^\s(]+\s*(?::=|<>|!=|<=|>=|=|<|>)\s*[^\s);]+/g

/** The three key columns a baseline row and its `pg_depend` row share. */
const ESCAPED_JOIN = [
    'd.classid = c.classid',
    'd.objid = c.objid',
    'd.objsubid = c.objsubid',
]

Deno.test('#435 R7 no count comparison remains', () => {
    const { baseline, check } = census()

    // The baseline records objects, never a total to compare against.
    assertEquals(/\b(count|sum)\s*\(/i.test(baseline), false, baseline)
    assertEquals(baseline.includes('tgisinternal'), false)

    // The check counts one thing: the baseline rows pg_depend lost.
    assertEquals(check.match(/\bcount\s*\(/gi)?.length, 1, check)
    assertStringIncludes(
        check,
        'SELECT count(*) INTO escaped FROM pg_temp.lockness_fresh_census c\n' +
            'WHERE NOT EXISTS (',
    )
    // No variable can hold a second count: only these two are declared.
    assertStringIncludes(
        check,
        'DECLARE\n    escaped bigint;\n    labels text;\nBEGIN\n',
    )
    // And the only comparisons are the join keys and `escaped > 0`, whatever
    // operator or spelling a reintroduced count comparison would use.
    assertEquals(check.match(COMPARISON), [
        ...ESCAPED_JOIN,
        'escaped > 0',
        ...ESCAPED_JOIN,
    ])
    assertEquals(/\bDISTINCT\s+FROM\b/i.test(check), false, check)
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

Deno.test('#448 an unset migrations.schema means the default bookkeeping schema, everywhere', () => {
    // The settings always fill it in for postgres; the fallback must still
    // name the table drizzle-orm writes to, not a second default.
    const unset = scope('postgres', { schema: undefined })

    assertEquals(
        planPostgresReset(EMPTY, unset)[0],
        'DROP TABLE IF EXISTS "drizzle"."__drizzle_migrations"',
    )
    assertStringIncludes(
        describeResetScope(unset),
        'plus the bookkeeping table "drizzle"."__drizzle_migrations"',
    )
    const plan = planPostgresReset({
        ...EMPTY,
        relations: [{
            schema: 'public',
            name: '__drizzle_migrations',
            kind: 'r',
        }],
    }, { ...unset, schemaFilter: ['public'] })
    assertEquals(
        plan.filter((s) => s.includes('"public"."__drizzle_migrations"'))
            .length,
        1,
        'a public table of the same name is application data, dropped once',
    )
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
    assert(error instanceof RefusedError, String(error))
    assertStringIncludes(error.reason, '"audit"')
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
    assert(error instanceof RefusedError, String(error))
    assertStringIncludes(error.reason, 'extension')
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
    Deno.test(`#435 #447 postgres refuses a system schema (${label}), before the unit opens`, async () => {
        const { calls, maintenance } = fakeMaintenance({})

        const error = await assertRejects(
            () => resetDatabase(maintenance, scope('postgres', overrides)),
            RefusedError,
        )

        assertStringIncludes(error.reason, 'system schema')
        assertEquals(calls, [], 'it opened the unit, read or dropped')
    })

    Deno.test(`#435 planPostgresReset refuses a system schema (${label})`, () => {
        assertThrows(
            () => planPostgresReset(EMPTY, scope('postgres', overrides)),
            RefusedError,
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

Deno.test('#435 R6 reads every extension and extension member in scope, and nothing else', () => {
    // Written out by hand, not derived: the R6 refusal is only as good as
    // this read. Each branch is scoped to the schemas (one quoted), and a
    // member is a `pg_depend` row of deptype 'e' — not 'a', 'i' or 'n'.
    const scoped = "WHERE n.nspname IN ('public', 'o''brien')"
    const member = (catalogue: string, alias: string, namespace: string) =>
        `SELECT n.nspname AS schema FROM pg_catalog.${catalogue} ${alias} ` +
        `JOIN pg_catalog.pg_namespace n ON n.oid = ${alias}.${namespace} ` +
        'JOIN pg_catalog.pg_depend d ' +
        `ON d.classid = 'pg_catalog.${catalogue}'::regclass ` +
        `AND d.objid = ${alias}.oid AND d.deptype = 'e' ${scoped}`

    assertEquals(
        postgresCatalogueQueries(['public', "o'brien"]).extensions,
        [
            'SELECT n.nspname AS schema FROM pg_catalog.pg_extension e ' +
            'JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace ' +
            scoped,
            member('pg_class', 'c', 'relnamespace'),
            member('pg_type', 't', 'typnamespace'),
            member('pg_proc', 'p', 'pronamespace'),
        ].join(' UNION '),
    )
})

Deno.test('#435 #447 postgres reset reads the whole catalogue inside the transaction, before any statement', async () => {
    const { calls, executed, maintenance } = fakeMaintenance({
        'pg_catalog.pg_extension': [],
        'relkind IN': [{ schema: 'public', name: 'users', kind: 'r' }],
    })

    await resetDatabase(maintenance, scope('postgres'))

    assertEquals(calls, ['begin', 'read', 'read', 'read', 'read', 'commit'])
    assertEquals(executed.length, 1)
    assertEquals(
        executed[0].includes('DROP TABLE IF EXISTS "public"."users" CASCADE'),
        true,
    )
})

Deno.test('#435 a catalogue row of the wrong shape is refused before any drop', async () => {
    const { calls, executed, maintenance } = fakeMaintenance({
        sqlite_master: [{ type: 'table', name: 42 }],
    })
    await assertRejects(
        () => resetDatabase(maintenance, scope('sqlite')),
        RefusedError,
    )
    assertEquals(calls, ['begin', 'read', 'rollback'])
    assertEquals(executed, [], 'a statement ran')
})

// -----------------------------------------------------------------------------
// #447 — a refusal reaches the caller as itself
// -----------------------------------------------------------------------------

Deno.test('#447 a refusal survives a connection whose execute re-wraps every failure', async () => {
    const { maintenance } = fakeMaintenance({
        'information_schema.TABLES': mysqlRows(null, []),
    })
    // A custom connection (or a redacting wrapper) that turns every
    // rejection into a generic error of its own.
    const rewrapping: MaintenanceConnection = {
        ...maintenance,
        execute: async (planner) => {
            try {
                await maintenance.execute(planner)
            } catch (error) {
                throw new Error('the connection failed', { cause: error })
            }
        },
    }

    const error = await assertRejects(
        () => resetDatabase(rewrapping, scope('mysql')),
        RefusedError,
    )
    assertStringIncludes(error.reason, 'no database selected')
})

Deno.test("#447 a statement failure is the connection's error, not mistaken for a refusal", async () => {
    const { maintenance } = fakeMaintenance({
        sqlite_master: [{ type: 'table', name: 't' }],
    })
    const failing: MaintenanceConnection = {
        ...maintenance,
        execute: async (planner) => {
            await planner(() => Promise.resolve([]))
            throw new Error('DROP failed')
        },
    }

    const error = await assertRejects(
        () => resetDatabase(failing, scope('sqlite')),
        Error,
        'DROP failed',
    )
    assert(!(error instanceof RefusedError))
})

/** Capture every `console.warn` line `fn` writes, and what it rejected with. */
async function warned(fn: () => Promise<void>): Promise<{
    readonly lines: string[]
    readonly error: unknown
}> {
    const lines: string[] = []
    const { warn } = console
    console.warn = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        await fn()
        return { lines, error: undefined }
    } catch (error) {
        return { lines, error }
    } finally {
        console.warn = warn
    }
}

Deno.test('#447 a connection that retries never sees a stale refusal rethrown after its statements ran', async () => {
    // The first planner call reads a malformed row and refuses; the retry
    // reads a sound one, and its plan runs and commits.
    let calls = 0
    const ran: string[] = []
    const retrying: MaintenanceConnection = {
        query: () => Promise.resolve([]),
        execute: async (planner) => {
            const attempt = () =>
                planner(() =>
                    Promise.resolve(
                        ++calls === 1
                            ? [{ type: 'table', name: 42 }]
                            : [{ type: 'table', name: 't' }],
                    )
                )
            let plan: readonly string[]
            try {
                plan = await attempt()
            } catch {
                plan = await attempt()
            }
            ran.push(...plan)
        },
        migrate: () => Promise.resolve(),
        close: () => Promise.resolve(),
    }

    await resetDatabase(retrying, scope('sqlite'))

    assertEquals(calls, 2)
    assertEquals(ran, [
        'PRAGMA defer_foreign_keys = ON',
        'DROP TABLE IF EXISTS "t"',
    ])
})

Deno.test('#447 a refusal a connection swallows is raised anyway', async () => {
    const swallowing: MaintenanceConnection = {
        query: () => Promise.resolve([]),
        execute: async (planner) => {
            try {
                await planner(() =>
                    Promise.resolve([{ db: null, name: null, type: null }])
                )
            } catch {
                // The fault under test: this connection drops the refusal.
            }
        },
        migrate: () => Promise.resolve(),
        close: () => Promise.resolve(),
    }

    const error = await assertRejects(
        () => resetDatabase(swallowing, scope('mysql')),
        RefusedError,
    )
    assertStringIncludes(error.reason, 'no database selected')
})

Deno.test('#447 a rollback that fails after a refusal keeps the refusal and logs the rollback failure', async () => {
    const failingRollback: MaintenanceConnection = {
        query: () => Promise.resolve([]),
        execute: async (planner) => {
            try {
                await planner(() =>
                    Promise.resolve([{ db: null, name: null, type: null }])
                )
            } catch {
                throw new Error('ROLLBACK failed: connection lost')
            }
        },
        migrate: () => Promise.resolve(),
        close: () => Promise.resolve(),
    }

    const { lines, error } = await warned(() =>
        resetDatabase(failingRollback, scope('mysql'))
    )

    assert(error instanceof RefusedError, String(error))
    assertEquals(lines.length, 1, JSON.stringify(lines))
    assertStringIncludes(lines[0], 'ROLLBACK failed: connection lost')
})

Deno.test('#447 an execute error that carries the refusal as its cause is not logged twice', async () => {
    const { maintenance } = fakeMaintenance({
        'information_schema.TABLES': mysqlRows(null, []),
    })
    const wrapping: MaintenanceConnection = {
        ...maintenance,
        execute: async (planner) => {
            try {
                await maintenance.execute(planner)
            } catch (error) {
                throw new Error('wrapped', { cause: error })
            }
        },
    }

    const { lines, error } = await warned(() =>
        resetDatabase(wrapping, scope('mysql'))
    )

    assert(error instanceof RefusedError, String(error))
    assertEquals(lines, [])
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
