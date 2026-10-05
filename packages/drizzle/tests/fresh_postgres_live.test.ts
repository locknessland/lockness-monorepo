/**
 * @fileoverview #435 — the postgres reset against a LIVE server: the R7
 * census rolls back a `CASCADE` that escapes the scope, lets every in-scope
 * dependency go, and ignores objects another session creates meanwhile; R6
 * refuses a schema holding an extension before any drop; and the migrate
 * keeps its bookkeeping where `migrations.schema` / `migrations.table` say.
 * #454: `db:fresh` run twice prints no raw server notice, and a reporter
 * passed to `connect` receives the `already exists, skipping` notice.
 * #446: the kept schema comes out of a reset with its owner and ACL.
 *
 * The pure tests in `reset.test.ts` pin the SQL; only a real server proves
 * that `pg_depend` and `pg_identify_object` classify objects the way the
 * census assumes. So this suite runs the real default postgres driver
 * factory, its maintenance capability and `resetDatabase` against a server.
 *
 * **Skipped unless `LOCKNESS_POSTGRES_INTEGRATION=1`.** The `live-postgres`
 * CI job sets it next to a `postgres:16` service; locally,
 * `deno task test:postgres` sets it. `LOCKNESS_POSTGRES_URL` names the
 * server, and every host it names must be loopback — a guard the gate
 * tests without a server. The suite creates and drops only schemas named
 * `lockness_fresh_*` (and the `citext` extension inside one of them), one
 * event trigger, `lockness_fresh_ddl`, and one role, `lockness_fresh_owner`,
 * and it needs a superuser for the event trigger and the role.
 *
 * @module @lockness/drizzle/tests/fresh_postgres_live
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { join } from '@std/path'
import postgres from 'postgres'
import {
    defaultDriverFactories,
    executeInTransaction,
    type PostgresTransactor,
    type SchemaMaintenance,
} from '../drivers.ts'
import type { Cli } from '@lockness/cli'
import { Database } from '../mod.ts'
import {
    type MaintenanceOpener,
    registerDrizzleCommands,
} from '../cli_commands.ts'
import type { NoticeReporter } from '../notice.ts'
import { resetDatabase, type ResetScope } from '../reset.ts'
import { RefusedError } from '../refusal.ts'
import {
    assertLoopback,
    LIVE_POSTGRES as LIVE,
    liveUrl,
} from './live_postgres.ts'

/** The schema the reset empties. */
const SCOPE = 'lockness_fresh_scope'
/** A schema outside the scope, which must come out of every reset intact. */
const OTHER = 'lockness_fresh_other'
/** The bookkeeping schema, outside the scope as drizzle's own `drizzle` is. */
const BOOKKEEPING = 'lockness_fresh_drizzle'
/** The global objects the suite creates: an event trigger and a role. */
const EVENT_TRIGGER = 'lockness_fresh_ddl'
const OWNER = 'lockness_fresh_owner'

/** The reset scope every test uses. */
const SETTINGS: ResetScope = {
    dialect: 'postgres',
    table: '__drizzle_migrations',
    schema: BOOKKEEPING,
    schemaFilter: [SCOPE],
    statements: [],
}

// -----------------------------------------------------------------------------
// The loopback guard — runs in the gate, no server needed
// -----------------------------------------------------------------------------

const ACCEPTED: readonly string[] = [
    'postgres://postgres@127.0.0.1:5432/postgres',
    'postgres://postgres@localhost/postgres',
    'postgres://u@127.0.0.1,localhost/db',
]

for (const url of ACCEPTED) {
    Deno.test(`#435 live guard: accepts ${url}`, async () => {
        assertEquals(await assertLoopback(url), url)
    })
}

/** Each case: what it is, and the url. No url holds a real credential. */
const REFUSED: ReadonlyArray<readonly [string, string]> = [
    ['a remote host', 'postgres://u@db.example/db'],
    [
        'a host list whose first host is remote',
        'postgres://u@evil.example,x@127.0.0.1/db',
    ],
    [
        'a host list whose last host is remote',
        'postgres://u@127.0.0.1,evil.example/db',
    ],
    ['an unset url', ''],
    ['an unparsable url', 'postgres://u:pw-sample@[unclosed/db'],
]

for (const [label, url] of REFUSED) {
    Deno.test(
        `#435 live guard: refuses ${label}, without quoting it`,
        async () => {
            const error = await assertRejects(() => assertLoopback(url), Error)
            if (url !== '') assertEquals(error.message.includes(url), false)
        },
    )
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
    // Last: the role can go only once the schema it owns is gone.
    `DROP ROLE IF EXISTS ${OWNER}`,
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
    const url = await liveUrl()
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
// #446: the kept schema keeps its owner and its ACL
// -----------------------------------------------------------------------------

/** The scope schema's identity, owner and ACL, as text. */
async function keptSchema(
    client: Client,
): Promise<{ oid: string; owner: string; acl: string }> {
    const [row] = await client.unsafe(
        'SELECT oid::text AS oid, nspowner::regrole::text AS owner, ' +
            'nspacl::text AS acl FROM pg_catalog.pg_namespace ' +
            `WHERE nspname = '${SCOPE}'`,
    )
    assert(row, 'the kept schema is gone')
    return { oid: row.oid, owner: row.owner, acl: row.acl }
}

Deno.test({
    name:
        '#446 live: the kept schema comes out of a reset with its owner and its ACL',
    ignore: !LIVE,
    fn: () =>
        live(async (admin, maintenance) => {
            // A non-default owner and grant: a schema dropped and re-created
            // by the resetting superuser would come back with neither.
            await run(admin, [
                `CREATE ROLE ${OWNER} NOLOGIN`,
                `ALTER SCHEMA ${SCOPE} OWNER TO ${OWNER}`,
                `GRANT USAGE ON SCHEMA ${SCOPE} TO PUBLIC`,
            ])
            const before = await keptSchema(admin)
            assertEquals(before.owner, OWNER)
            assertStringIncludes(before.acl, `=U/${OWNER}`)

            await resetDatabase(maintenance, SETTINGS)

            await assertReset(admin)
            assertEquals(await keptSchema(admin), before)
        }),
})

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

// -----------------------------------------------------------------------------
// The bookkeeping location reaches drizzle-orm's migrator
// -----------------------------------------------------------------------------

/** The bookkeeping table the migrate is pointed at, instead of the default. */
const HISTORY = 'history'

/** The journal `when` of the one migration, which becomes `created_at`. */
const WHEN = 1_700_000_000_000

/** Write a one-migration folder, as drizzle-kit lays it out. */
async function writeMigration(folder: string): Promise<void> {
    await Deno.mkdir(join(folder, 'meta'), { recursive: true })
    await Deno.writeTextFile(
        join(folder, 'meta', '_journal.json'),
        JSON.stringify({
            version: '7',
            dialect: 'postgresql',
            entries: [{
                idx: 0,
                version: '7',
                when: WHEN,
                tag: '0000_migrated',
                breakpoints: true,
            }],
        }),
    )
    await Deno.writeTextFile(
        join(folder, '0000_migrated.sql'),
        `CREATE TABLE "${SCOPE}"."migrated" ("id" integer);`,
    )
}

Deno.test({
    name:
        '#435 live: migrate keeps its bookkeeping in migrations.schema and migrations.table',
    ignore: !LIVE,
    fn: () =>
        live(async (admin, maintenance) => {
            const folder = await Deno.makeTempDir({ prefix: 'lockness_fresh_' })
            try {
                await writeMigration(folder)

                await maintenance.migrate({
                    folder,
                    table: HISTORY,
                    schema: BOOKKEEPING,
                })

                // Read back from that exact table: a dropped `schema` sends
                // the rows to `drizzle`, a dropped `table` to the default one.
                const rows = await admin.unsafe(
                    `SELECT created_at FROM ${BOOKKEEPING}.${HISTORY}`,
                )
                assertEquals(rows.map((row) => Number(row.created_at)), [WHEN])
                const [defaults] = await admin.unsafe(
                    'SELECT count(*) AS n ' +
                        `FROM ${BOOKKEEPING}.__drizzle_migrations`,
                )
                assertEquals(
                    Number(defaults.n),
                    0,
                    'the default bookkeeping table was written',
                )
                assert(
                    await exists(admin, `${SCOPE}.migrated`),
                    'the migration did not run',
                )
            } finally {
                await Deno.remove(folder, { recursive: true })
            }
        }),
})

// -----------------------------------------------------------------------------
// R6: a schema the reset would drop holds an extension
// -----------------------------------------------------------------------------

Deno.test({
    name:
        '#435 R6 live: a scope schema holding an extension, which a migration re-creates, is refused before any drop',
    ignore: !LIVE,
    fn: () =>
        live(async (admin, maintenance) => {
            // citext ships with postgres:16 and is a trusted extension. It
            // lives in the scope schema, so the teardown's DROP SCHEMA takes
            // it along; nothing outside `lockness_fresh_*` is touched.
            await run(admin, [`CREATE EXTENSION citext SCHEMA ${SCOPE}`])

            const error = await rejected(() =>
                resetDatabase(maintenance, {
                    ...SETTINGS,
                    statements: [`CREATE SCHEMA "${SCOPE}";`],
                })
            )

            // R6, not R7: without the refusal the CASCADE would drop the
            // extension and the census would roll it back — a different
            // error, raised after the drops had run.
            assert(error instanceof RefusedError, String(error))
            assertStringIncludes(error.message, 'extension')
            await assertUntouched(admin)
            const [row] = await admin.unsafe(
                'SELECT count(*) AS n FROM pg_catalog.pg_extension e ' +
                    'JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace ' +
                    `WHERE e.extname = 'citext' AND n.nspname = '${SCOPE}'`,
            )
            assertEquals(Number(row.n), 1, 'the extension is gone')
        }),
})

// -----------------------------------------------------------------------------
// #454: db:fresh prints no raw server notice
// -----------------------------------------------------------------------------

/** A CLI that records registrations and lets a test invoke one by name. */
class RecordingCli {
    readonly commands = new Map<string, (args: string[]) => unknown>()

    register(name: string, handler: (args: string[]) => unknown): void {
        this.commands.set(name, handler)
    }

    async run(name: string): Promise<void> {
        const handler = this.commands.get(name)
        assert(handler, `command not registered: ${name}`)
        await handler([])
    }
}

/**
 * Run `db:fresh` twice against the suite's scope and return every console
 * line it wrote, objects rendered the way the console renders them. The
 * second run is the one an already-migrated database sees.
 */
async function freshTwice(
    url: string,
    openMaintenance?: MaintenanceOpener,
): Promise<string[]> {
    const folder = await Deno.makeTempDir({ prefix: 'lockness_fresh_' })
    const lines: string[] = []
    const render = (args: unknown[]) =>
        void lines.push(
            args.map((a) => typeof a === 'string' ? a : Deno.inspect(a))
                .join(' '),
        )
    const saved = { ...console }
    console.log = (...a: unknown[]) => render(a)
    console.info = (...a: unknown[]) => render(a)
    console.warn = (...a: unknown[]) => render(a)
    console.error = (...a: unknown[]) => render(a)
    console.debug = (...a: unknown[]) => render(a)
    try {
        await writeMigration(folder)
        const cli = new RecordingCli()
        registerDrizzleCommands(cli as unknown as Cli, {
            loadMigrationConfig: () =>
                Promise.resolve({
                    dialect: 'postgresql',
                    out: folder,
                    dbCredentials: { url },
                    schemaFilter: [SCOPE],
                    migrations: {
                        table: '__drizzle_migrations',
                        schema: BOOKKEEPING,
                    },
                }),
            ...(openMaintenance ? { openMaintenance } : {}),
        })
        await cli.run('db:fresh')
        await cli.run('db:fresh')
    } finally {
        Object.assign(console, saved)
        await Deno.remove(folder, { recursive: true })
    }
    return lines
}

Deno.test({
    name:
        '#454 live: db:fresh twice prints no raw notice object and no "already exists, skipping"',
    ignore: !LIVE,
    fn: () =>
        live(async (_admin, _maintenance, url) => {
            const output = (await freshTwice(url)).join('\n')

            assertStringIncludes(output, 'Database refreshed successfully')
            assertEquals(output.includes('severity'), false, output)
            assertEquals(
                output.includes('already exists, skipping'),
                false,
                output,
            )
        }),
})

Deno.test({
    name:
        '#454 live: a reporter passed to connect receives the "already exists, skipping" notice at debug',
    ignore: !LIVE,
    fn: () =>
        live(async (_admin, _maintenance, url) => {
            const debug: string[] = []
            const notices: NoticeReporter = {
                warn: () => {},
                debug: (message) => void debug.push(message),
            }
            const open: MaintenanceOpener = async (settings) => {
                const db = new Database()
                const result = await db.connect(settings.url, {
                    driver: settings.dialect,
                    silent: true,
                    notices,
                })
                assert(result.success, result.error)
                const maintenance = db.maintenance
                assert(maintenance, 'the postgres handle has no maintenance')
                return { ...maintenance, close: () => db.close() }
            }

            await freshTwice(url, open)

            assert(
                debug.some((m) => m.includes('already exists, skipping')),
                `no "already exists, skipping" notice reached debug: ${
                    JSON.stringify(debug)
                }`,
            )
        }),
})
