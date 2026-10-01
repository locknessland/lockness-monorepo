/**
 * @fileoverview #435 — the postgres reset against a LIVE server: the R7
 * census rolls back a `CASCADE` that escapes the scope, lets every in-scope
 * dependency go, and ignores objects another session creates meanwhile.
 *
 * The pure tests in `reset.test.ts` pin the SQL; only a real server proves
 * that `pg_depend` and `pg_identify_object` classify objects the way the
 * census assumes. So this suite runs the real default postgres driver
 * factory, its maintenance capability and `resetDatabase` against a server.
 *
 * **Skipped unless `LOCKNESS_POSTGRES_INTEGRATION=1`.** The `live-postgres`
 * CI job sets it next to a `postgres:16` service; locally,
 * `deno task test:postgres` sets it. `LOCKNESS_POSTGRES_URL` names the
 * server and must point at a loopback host. The suite creates and drops only
 * schemas named `lockness_fresh_*` and one event trigger,
 * `lockness_fresh_ddl`, and it needs a superuser for the event trigger.
 *
 * @module @lockness/drizzle/tests/fresh_postgres_live
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import postgres from 'postgres'
import {
    defaultDriverFactories,
    executeInTransaction,
    type PostgresTransactor,
    type SchemaMaintenance,
} from '../drivers.ts'
import { resetDatabase, type ResetScope } from '../reset.ts'

/**
 * Whether the live suite runs at all. The root `deno.jsonc` task
 * `test:postgres` and the `live-postgres` CI job set it; nothing else reads it.
 */
const LIVE = Deno.env.get('LOCKNESS_POSTGRES_INTEGRATION') === '1'

/** The schema the reset empties. */
const SCOPE = 'lockness_fresh_scope'
/** A schema outside the scope, which must come out of every reset intact. */
const OTHER = 'lockness_fresh_other'
/** The bookkeeping schema, outside the scope as drizzle's own `drizzle` is. */
const BOOKKEEPING = 'lockness_fresh_drizzle'
/** The one global object the suite creates. */
const EVENT_TRIGGER = 'lockness_fresh_ddl'

/** The reset scope every test uses. */
const SETTINGS: ResetScope = {
    dialect: 'postgres',
    table: '__drizzle_migrations',
    schema: BOOKKEEPING,
    schemaFilter: [SCOPE],
    statements: [],
}

/** Hosts a destructive suite may run against. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/**
 * The server url, refused unless it points at a loopback host. The error
 * never quotes the url, which may hold a password.
 *
 * @returns The url.
 * @throws {Error} When it is unset, unparsable or not loopback.
 */
function liveUrl(): string {
    const url = Deno.env.get('LOCKNESS_POSTGRES_URL') ?? ''
    let host: string
    try {
        host = new URL(url).hostname
    } catch {
        throw new Error('LOCKNESS_POSTGRES_URL is unset or not a url')
    }
    if (!LOOPBACK.has(host)) {
        throw new Error('LOCKNESS_POSTGRES_URL must point at a loopback host')
    }
    return url
}

/** A postgres.js client, as the suite uses it. */
type Client = ReturnType<typeof postgres>

/** Run statements one by one, each in its own implicit transaction. */
async function run(client: Client, statements: readonly string[]) {
    for (const statement of statements) await client.unsafe(statement)
}

/** Whether `name` resolves to a relation. */
async function exists(client: Client, name: string): Promise<boolean> {
    const [row] = await client.unsafe(
        `SELECT to_regclass('${name}') IS NOT NULL AS found`,
    )
    return row.found === true
}

/** The relations, types and routines left in the scope schema. */
async function leftInScope(client: Client): Promise<number> {
    const [row] = await client.unsafe(
        'SELECT ' +
            '(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ' +
            `ON n.oid = c.relnamespace WHERE n.nspname = '${SCOPE}') + ` +
            '(SELECT count(*) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ' +
            `ON n.oid = t.typnamespace WHERE n.nspname = '${SCOPE}') + ` +
            '(SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ' +
            `ON n.oid = p.pronamespace WHERE n.nspname = '${SCOPE}') AS n`,
    )
    return Number(row.n)
}

/** Remove everything the suite owns. */
const TEARDOWN = [
    `DROP EVENT TRIGGER IF EXISTS ${EVENT_TRIGGER}`,
    `DROP SCHEMA IF EXISTS ${OTHER} CASCADE`,
    `DROP SCHEMA IF EXISTS ${SCOPE} CASCADE`,
    `DROP SCHEMA IF EXISTS ${BOOKKEEPING} CASCADE`,
]

/**
 * The starting point of every test: an in-scope table, an outside sentinel
 * table, and the bookkeeping table in drizzle's shape, in its own schema.
 */
const FIXTURE = [
    ...TEARDOWN,
    `CREATE SCHEMA ${SCOPE}`,
    `CREATE SCHEMA ${OTHER}`,
    `CREATE SCHEMA ${BOOKKEEPING}`,
    `CREATE TABLE ${SCOPE}.t (id integer PRIMARY KEY)`,
    `CREATE TABLE ${OTHER}.keep (id integer PRIMARY KEY)`,
    `CREATE TABLE ${BOOKKEEPING}.__drizzle_migrations ` +
    '(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)',
]

/**
 * Open an admin client and the real driver handle, lay the fixture, run
 * `body`, and always tear down and close.
 */
async function live(
    body: (
        admin: Client,
        maintenance: SchemaMaintenance,
        url: string,
    ) => Promise<void>,
): Promise<void> {
    const url = liveUrl()
    const admin = postgres(url, { max: 1, onnotice: () => {} })
    const handle = await defaultDriverFactories.postgres(url)
    try {
        await run(admin, FIXTURE)
        assert(handle.maintenance, 'the postgres handle has no maintenance')
        await body(admin, handle.maintenance, url)
    } finally {
        try {
            await run(admin, TEARDOWN)
        } finally {
            await handle.close()
            await admin.end()
        }
    }
}

/** Run a reset that must roll back, and return the error it raised. */
async function rejected(
    reset: () => Promise<void>,
): Promise<Error> {
    try {
        await reset()
    } catch (error) {
        assert(error instanceof Error, String(error))
        return error
    }
    throw new Error('the reset succeeded; it should have rolled back')
}

/** Nothing the rolled-back reset dropped is gone. */
async function assertUntouched(admin: Client): Promise<void> {
    assert(await exists(admin, `${SCOPE}.t`), 'the in-scope table is gone')
    assert(
        await exists(admin, `${BOOKKEEPING}.__drizzle_migrations`),
        'the bookkeeping table is gone',
    )
    assert(await exists(admin, `${OTHER}.keep`), 'the outside table is gone')
}

/** The scope is empty, the bookkeeping table is gone, the outside is kept. */
async function assertReset(admin: Client): Promise<void> {
    assertEquals(await leftInScope(admin), 0, 'objects left in scope')
    assertEquals(
        await exists(admin, `${BOOKKEEPING}.__drizzle_migrations`),
        false,
        'the bookkeeping table survived',
    )
    assert(await exists(admin, `${OTHER}.keep`), 'the outside table is gone')
}

// -----------------------------------------------------------------------------
// Escapes: caught, rolled back, scope untouched
// -----------------------------------------------------------------------------

/** Each case: what it plants, and a fragment of the label the RAISE names. */
const ESCAPES: ReadonlyArray<
    readonly [string, readonly string[], string]
> = [
    ['an outside view on an in-scope table', [
        `CREATE VIEW ${OTHER}.v AS SELECT id FROM ${SCOPE}.t`,
    ], `${OTHER}.v`],
    ['an outside rule referencing an in-scope table', [
        `CREATE TABLE ${OTHER}.log (id integer)`,
        `CREATE RULE log_copy AS ON INSERT TO ${OTHER}.log ` +
        `DO ALSO INSERT INTO ${SCOPE}.t VALUES (NEW.id)`,
    ], `log_copy on ${OTHER}.log`],
    ['an outside operator over an in-scope function', [
        `CREATE FUNCTION ${SCOPE}.same(integer, integer) RETURNS boolean ` +
        'LANGUAGE sql IMMUTABLE AS $$SELECT $1 = $2$$',
        `CREATE OPERATOR ${OTHER}.=== (LEFTARG = integer, ` +
        `RIGHTARG = integer, FUNCTION = ${SCOPE}.same)`,
    ], `${OTHER}.===`],
    ['an event trigger on an in-scope function', [
        `CREATE FUNCTION ${SCOPE}.on_ddl() RETURNS event_trigger ` +
        'LANGUAGE plpgsql AS $$BEGIN END$$',
        `CREATE EVENT TRIGGER ${EVENT_TRIGGER} ON ddl_command_end ` +
        `EXECUTE FUNCTION ${SCOPE}.on_ddl()`,
    ], EVENT_TRIGGER],
    ['an outside column of an in-scope enum', [
        `CREATE TYPE ${SCOPE}.mood AS ENUM ('ok')`,
        `CREATE TABLE ${OTHER}.feelings (id integer, mood ${SCOPE}.mood)`,
    ], `${OTHER}.feelings.mood`],
    ['an outside foreign key to an in-scope table', [
        `CREATE TABLE ${OTHER}.child ` +
        `(t_id integer REFERENCES ${SCOPE}.t (id))`,
    ], `child_t_id_fkey on ${OTHER}.child`],
]

for (const [label, plant, named] of ESCAPES) {
    Deno.test({
        name: `#435 R7 live: ${label} rolls the reset back and is named`,
        ignore: !LIVE,
        fn: () =>
            live(async (admin, maintenance) => {
                await run(admin, plant)

                const error = await rejected(() =>
                    resetDatabase(maintenance, SETTINGS)
                )

                assertStringIncludes(error.message, 'rolled back')
                assertStringIncludes(error.message, named)
                await assertUntouched(admin)
            }),
    })
}

// -----------------------------------------------------------------------------
// In-scope dependencies: no rollback
// -----------------------------------------------------------------------------

/** A trigger function in scope, for the cases that need one. */
const TOUCH = `CREATE FUNCTION ${SCOPE}.touch() RETURNS trigger ` +
    'LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$'

const IN_SCOPE: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['an in-scope trigger', [
        TOUCH,
        `CREATE TRIGGER touch BEFORE INSERT ON ${SCOPE}.t ` +
        `FOR EACH ROW EXECUTE FUNCTION ${SCOPE}.touch()`,
    ]],
    ['an in-scope policy', [
        `ALTER TABLE ${SCOPE}.t ENABLE ROW LEVEL SECURITY`,
        `CREATE POLICY everyone ON ${SCOPE}.t USING (true)`,
    ]],
    ['an in-scope rule', [
        `CREATE TABLE ${SCOPE}.audit (id integer)`,
        `CREATE RULE copy AS ON INSERT TO ${SCOPE}.t ` +
        `DO ALSO INSERT INTO ${SCOPE}.audit VALUES (NEW.id)`,
    ]],
    ['a nextval default', [
        `CREATE SEQUENCE ${SCOPE}.ids`,
        `CREATE TABLE ${SCOPE}.items ` +
        `(id integer DEFAULT nextval('${SCOPE}.ids'))`,
    ]],
    ['a foreign key to an outside table', [
        `CREATE TABLE ${SCOPE}.child ` +
        `(keep_id integer REFERENCES ${OTHER}.keep (id))`,
    ]],
    ['a partitioned table with a cloned trigger', [
        TOUCH,
        `CREATE TABLE ${SCOPE}.events (at date NOT NULL) ` +
        'PARTITION BY RANGE (at)',
        `CREATE TABLE ${SCOPE}.events_2024 PARTITION OF ${SCOPE}.events ` +
        "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
        `CREATE TRIGGER touch AFTER INSERT ON ${SCOPE}.events ` +
        `FOR EACH ROW EXECUTE FUNCTION ${SCOPE}.touch()`,
    ]],
    ['a view', [
        `CREATE VIEW ${SCOPE}.ids_view AS SELECT id FROM ${SCOPE}.t`,
    ]],
    ['an index', [
        `CREATE INDEX t_id_desc ON ${SCOPE}.t (id DESC)`,
    ]],
    ['extended statistics', [
        `CREATE TABLE ${SCOPE}.pairs (a integer, b integer)`,
        `CREATE STATISTICS ${SCOPE}.pairs_ab ON a, b FROM ${SCOPE}.pairs`,
    ]],
    ['an owned sequence', [
        `CREATE TABLE ${SCOPE}.serials (id SERIAL PRIMARY KEY)`,
    ]],
    ['an enum and its array type', [
        `CREATE TYPE ${SCOPE}.mood AS ENUM ('ok')`,
        `CREATE TABLE ${SCOPE}.moods (now ${SCOPE}.mood, past ${SCOPE}.mood[])`,
    ]],
    // The fixture's bookkeeping table already sits in its own schema outside
    // the scope, with its SERIAL sequence: this case plants nothing more.
    ['the drizzle bookkeeping schema outside the scope', []],
]

for (const [label, plant] of IN_SCOPE) {
    Deno.test({
        name: `#435 R7 live: ${label} resets without a rollback`,
        ignore: !LIVE,
        fn: () =>
            live(async (admin, maintenance) => {
                await run(admin, plant)

                await resetDatabase(maintenance, SETTINGS)

                await assertReset(admin)
                assertEquals(
                    await exists(
                        admin,
                        `${BOOKKEEPING}.__drizzle_migrations_id_seq`,
                    ),
                    false,
                    'the bookkeeping sequence survived',
                )
            }),
    })
}

// -----------------------------------------------------------------------------
// Concurrency: a second session commits between baseline and check
// -----------------------------------------------------------------------------

/**
 * A maintenance capability that runs the plan statement by statement through
 * the real `executeInTransaction`, and has a second connection commit
 * `CREATE TABLE <other>.x` right after the census baseline is taken.
 */
function interleaved(
    client: Client,
    admin: Client,
): SchemaMaintenance {
    const transactor: PostgresTransactor = {
        begin: (body) =>
            (client as unknown as PostgresTransactor).begin((tx) =>
                body({
                    unsafe: async (sql) => {
                        const result = await tx.unsafe(sql)
                        if (sql.startsWith('CREATE TEMPORARY TABLE')) {
                            await admin.unsafe(
                                `CREATE TABLE ${OTHER}.x (id integer)`,
                            )
                        }
                        return result
                    },
                })
            ),
    }
    return {
        query: async (sql) => [...await client.unsafe(sql)],
        execute: (statements) => executeInTransaction(transactor, statements),
        migrate: () => Promise.reject(new Error('not used')),
    }
}

Deno.test({
    name:
        '#435 R7 live: an object committed by another session mid-reset does not fail it',
    ignore: !LIVE,
    fn: () =>
        live(async (admin, _maintenance, url) => {
            const client = postgres(url, { max: 1, onnotice: () => {} })
            try {
                await resetDatabase(interleaved(client, admin), SETTINGS)
            } finally {
                await client.end()
            }

            await assertReset(admin)
            assert(await exists(admin, `${OTHER}.x`), 'the concurrent table')
        }),
})

Deno.test({
    name:
        '#435 R7 live: an object committed by another session mid-reset does not mask an escape',
    ignore: !LIVE,
    fn: () =>
        live(async (admin, _maintenance, url) => {
            await run(admin, [
                `CREATE VIEW ${OTHER}.v AS SELECT id FROM ${SCOPE}.t`,
            ])
            const client = postgres(url, { max: 1, onnotice: () => {} })
            let error: Error
            try {
                error = await rejected(() =>
                    resetDatabase(interleaved(client, admin), SETTINGS)
                )
            } finally {
                await client.end()
            }

            assertStringIncludes(error.message, 'rolled back')
            assertStringIncludes(error.message, `${OTHER}.v`)
            await assertUntouched(admin)
            assert(await exists(admin, `${OTHER}.x`), 'the concurrent table')
        }),
})
