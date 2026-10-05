/**
 * @fileoverview #446 — the MySQL reset against a LIVE server: `db:fresh` over
 * an FK chain and a view leaves `DATABASE()` holding the migrated tables only,
 * with one bookkeeping row per journal entry; the maintenance connection the
 * reset runs on is never a pool member — it is gone once closed, when the
 * reset succeeds and when it fails with `FOREIGN_KEY_CHECKS` off, and the
 * pool never lends it; the migrate runs on that same connection (#447); and
 * a system `DATABASE()` is refused before any statement runs.
 *
 * The pure tests in `reset.test.ts` pin the plan; only a real server proves
 * what a plan test cannot observe — that the qualified DROPs land in the
 * database the catalogue named, that the session setting dies with its
 * connection, and that the refusal holds for the names the server reports.
 * So this suite runs the real default MySQL driver factory, the maintenance
 * connection it opens, `resetDatabase` and the `db:fresh` command against a
 * server.
 *
 * **Skipped unless `LOCKNESS_MYSQL_INTEGRATION=1`.** The `live-mysql` CI job
 * sets it next to a MySQL service; locally, `deno task test:mysql` sets it.
 * `LOCKNESS_MYSQL_URL` names the server, and its host must be loopback — a
 * guard the gate tests without a server. The suite creates and drops only
 * the databases `lockness_fresh_mysql` and `lockness_fresh_mysql_other`, so
 * the url's user needs `CREATE` and `DROP` on them; the url's own database,
 * if it names one, is never touched.
 *
 * @module @lockness/drizzle/tests/fresh_mysql_live
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { join } from '@std/path'
import mysql from 'mysql2/promise'
import type { Cli } from '@lockness/cli'
import { sql } from 'drizzle-orm'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import {
    defaultDriverFactories,
    type DriverHandle,
    type MaintenanceConnection,
} from '../drivers.ts'
import { registerDrizzleCommands } from '../cli_commands.ts'
import { resetDatabase, type ResetScope } from '../reset.ts'
import { RefusedError } from '../refusal.ts'
import {
    assertMysqlLoopback,
    LIVE_MYSQL as LIVE,
    liveMysqlUrl,
} from './live_mysql.ts'

/** The database the reset empties — `DATABASE()` of the driver's url. */
const SCOPE = 'lockness_fresh_mysql'
/** A database outside the scope, which must come out of every reset intact. */
const OTHER = 'lockness_fresh_mysql_other'
/** The bookkeeping table (`migrations.table`). */
const TABLE = '__drizzle_migrations'

/** The reset scope: on MySQL only the dialect and the table matter. */
const SETTINGS: ResetScope = {
    dialect: 'mysql',
    table: TABLE,
    schema: undefined,
    schemaFilter: [],
    statements: [],
}

// -----------------------------------------------------------------------------
// The loopback guard — runs in the gate, no server needed
// -----------------------------------------------------------------------------

const ACCEPTED: readonly string[] = [
    'mysql://root@127.0.0.1:3306/',
    'mysql://root@localhost/app',
    'mysql://u@127.0.0.1:3306/app?connectTimeout=1000',
]

for (const url of ACCEPTED) {
    Deno.test(`#446 live guard: accepts ${url}`, () => {
        assertEquals(assertMysqlLoopback(url), url)
    })
}

/**
 * Each case: what it is, and the url. No url holds a real credential; the
 * one password-shaped value is assembled here, at run time.
 */
const REFUSED: ReadonlyArray<readonly [string, string]> = [
    ['a remote host', 'mysql://u@db.example/app'],
    ['a socket path in the query', 'mysql://u@127.0.0.1/app?socketPath=/s'],
    ['an unset url', ''],
    ['an unparsable url', `mysql://u:${['pw', 'sample'].join('-')}@[x/app`],
]

for (const [label, url] of REFUSED) {
    Deno.test(`#446 live guard: refuses ${label}, without quoting it`, () => {
        let message = ''
        try {
            assertMysqlLoopback(url)
        } catch (error) {
            assert(error instanceof Error, String(error))
            message = error.message
        }
        assert(message !== '', 'the url was accepted')
        if (url !== '') assertEquals(message.includes(url), false)
    })
}

// -----------------------------------------------------------------------------
// Harness
// -----------------------------------------------------------------------------

/** A mysql2 connection, as the suite's admin side uses it. */
type Admin = mysql.Connection

/** The server url with its path set to `database`. */
function at(url: string, database: string): string {
    const target = new URL(url)
    target.pathname = `/${database}`
    return target.toString()
}

/** Run statements one by one. */
async function run(admin: Admin, statements: readonly string[]) {
    for (const statement of statements) await admin.query(statement)
}

/** The tables and views of `database`, as `name:type`, sorted. */
async function objectsOf(admin: Admin, database: string): Promise<string[]> {
    const [rows] = await admin.query<mysql.RowDataPacket[]>(
        'SELECT TABLE_NAME AS name, TABLE_TYPE AS type ' +
            'FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
        [database],
    )
    return rows.map((row) => `${row.name}:${row.type}`).sort()
}

/** Remove everything the suite owns. */
const TEARDOWN = [
    `DROP DATABASE IF EXISTS \`${OTHER}\``,
    `DROP DATABASE IF EXISTS \`${SCOPE}\``,
]

/**
 * The starting point of every test: in scope, an FK chain with rows, a view
 * over it and a stale bookkeeping row; outside, a table with a row and a view
 * over an in-scope table, which the reset must leave as it is.
 */
const FIXTURE = [
    ...TEARDOWN,
    `CREATE DATABASE \`${SCOPE}\``,
    `CREATE DATABASE \`${OTHER}\``,
    `CREATE TABLE \`${SCOPE}\`.parent (id int PRIMARY KEY)`,
    `CREATE TABLE \`${SCOPE}\`.child (id int PRIMARY KEY, parent_id int, ` +
    `FOREIGN KEY (parent_id) REFERENCES \`${SCOPE}\`.parent (id))`,
    `CREATE TABLE \`${SCOPE}\`.grandchild (id int PRIMARY KEY, child_id int, ` +
    `FOREIGN KEY (child_id) REFERENCES \`${SCOPE}\`.child (id))`,
    `INSERT INTO \`${SCOPE}\`.parent VALUES (1)`,
    `INSERT INTO \`${SCOPE}\`.child VALUES (1, 1)`,
    `INSERT INTO \`${SCOPE}\`.grandchild VALUES (1, 1)`,
    `CREATE VIEW \`${SCOPE}\`.lineage AS SELECT c.id FROM ` +
    `\`${SCOPE}\`.child c JOIN \`${SCOPE}\`.parent p ON p.id = c.parent_id`,
    // drizzle-orm's MySQL bookkeeping shape, with a row no journal names:
    // a reset that kept it would make the migrator skip or repeat entries.
    `CREATE TABLE \`${SCOPE}\`.${TABLE} ` +
    '(id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)',
    `INSERT INTO \`${SCOPE}\`.${TABLE} (hash, created_at) VALUES ('stale', 1)`,
    `CREATE TABLE \`${OTHER}\`.keep (id int PRIMARY KEY)`,
    `INSERT INTO \`${OTHER}\`.keep VALUES (1)`,
    `CREATE TABLE \`${OTHER}\`.probe (id bigint)`,
    `CREATE VIEW \`${OTHER}\`.v AS SELECT id FROM \`${SCOPE}\`.parent`,
]

/** Everything outside the scope, as the fixture lays it. */
const OUTSIDE = ['keep:BASE TABLE', 'probe:BASE TABLE', 'v:VIEW']

/**
 * Open an admin connection, lay the fixture, run `body`, and always tear
 * down and close.
 */
async function live(
    body: (admin: Admin, url: string) => Promise<void>,
): Promise<void> {
    const url = liveMysqlUrl()
    const admin = await mysql.createConnection(url)
    try {
        await run(admin, FIXTURE)
        await body(admin, url)
    } finally {
        try {
            await run(admin, TEARDOWN)
        } finally {
            await admin.end()
        }
    }
}

/**
 * Open the real MySQL driver handle on `database` and the maintenance
 * connection it opens, run `body` with both, and always close them: the
 * connection (again, harmlessly, if `body` closed it), then the handle.
 */
async function withMaintenance(
    url: string,
    database: string,
    body: (
        maintenance: MaintenanceConnection,
        handle: DriverHandle,
    ) => Promise<void>,
): Promise<void> {
    const handle = await defaultDriverFactories.mysql(at(url, database))
    try {
        assert(handle.maintenance, 'the mysql handle has no maintenance')
        const connection = await handle.maintenance.open()
        let closed = false
        const once: MaintenanceConnection = {
            ...connection,
            close: async () => {
                closed = true
                await connection.close()
            },
        }
        try {
            await body(once, handle)
        } finally {
            if (!closed) await connection.close()
        }
    } finally {
        await handle.close()
    }
}

// -----------------------------------------------------------------------------
// db:fresh over an FK chain and a view
// -----------------------------------------------------------------------------

/** The journal: each entry's tag, its `when`, and its SQL. */
const JOURNAL: ReadonlyArray<readonly [string, number, string]> = [
    [
        '0000_first',
        1_700_000_000_000,
        'CREATE TABLE `migrated_a` (`id` int PRIMARY KEY);',
    ],
    [
        '0001_second',
        1_700_000_100_000,
        'CREATE TABLE `migrated_b` (`id` int PRIMARY KEY, `a_id` int,' +
        ' FOREIGN KEY (`a_id`) REFERENCES `migrated_a` (`id`));',
    ],
]

/** Write the journal as drizzle-kit lays a MySQL migrations folder out. */
async function writeMigrations(folder: string): Promise<void> {
    await Deno.mkdir(join(folder, 'meta'), { recursive: true })
    await Deno.writeTextFile(
        join(folder, 'meta', '_journal.json'),
        JSON.stringify({
            version: '7',
            dialect: 'mysql',
            entries: JOURNAL.map(([tag, when], idx) => ({
                idx,
                version: '5',
                when,
                tag,
                breakpoints: true,
            })),
        }),
    )
    for (const [tag, , sql] of JOURNAL) {
        await Deno.writeTextFile(join(folder, `${tag}.sql`), sql)
    }
}

/** drizzle-orm's bookkeeping hash of one migration file: its SHA-256. */
async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(text),
    )
    return Array.from(
        new Uint8Array(digest),
        (byte) => byte.toString(16).padStart(2, '0'),
    ).join('')
}

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
 * Run `db:fresh` twice on the scope database and return the console lines.
 * The second run resets a database the first one migrated, FK included.
 */
async function freshTwice(url: string): Promise<string> {
    const folder = await Deno.makeTempDir({ prefix: 'lockness_fresh_' })
    const lines: string[] = []
    const saved = { ...console }
    console.log = (...a: unknown[]) => void lines.push(a.join(' '))
    console.info = console.log
    console.warn = console.log
    console.error = console.log
    try {
        await writeMigrations(folder)
        const cli = new RecordingCli()
        registerDrizzleCommands(cli as unknown as Cli, {
            loadMigrationConfig: () =>
                Promise.resolve({
                    dialect: 'mysql',
                    out: folder,
                    dbCredentials: { url: at(url, SCOPE) },
                    migrations: { table: TABLE },
                }),
        })
        await cli.run('db:fresh')
        await cli.run('db:fresh')
    } finally {
        Object.assign(console, saved)
        await Deno.remove(folder, { recursive: true })
    }
    return lines.join('\n')
}

Deno.test({
    name:
        '#446 live: db:fresh over an FK chain and a view leaves DATABASE() holding the migrated tables and one bookkeeping row per journal entry',
    ignore: !LIVE,
    fn: () =>
        live(async (admin, url) => {
            const output = await freshTwice(url)

            assertStringIncludes(output, 'Database refreshed successfully')
            assertEquals(await objectsOf(admin, SCOPE), [
                `${TABLE}:BASE TABLE`,
                'migrated_a:BASE TABLE',
                'migrated_b:BASE TABLE',
            ])
            const [rows] = await admin.query<mysql.RowDataPacket[]>(
                `SELECT hash, created_at FROM \`${SCOPE}\`.${TABLE} ORDER BY id`,
            )
            assertEquals(
                rows.map((row) => [row.hash, Number(row.created_at)]),
                await Promise.all(
                    JOURNAL.map(async ([, when, sql]) => [
                        await sha256(sql),
                        when,
                    ]),
                ),
            )
            // Nothing outside DATABASE() changed: the outside view on an
            // in-scope table is still there, and so is the outside row.
            assertEquals(await objectsOf(admin, OTHER), OUTSIDE)
            const [kept] = await admin.query<mysql.RowDataPacket[]>(
                `SELECT count(*) AS n FROM \`${OTHER}\`.keep`,
            )
            assertEquals(Number(kept[0].n), 1, 'the outside row is gone')
        }),
})

// -----------------------------------------------------------------------------
// The maintenance connection is never a pool member
// -----------------------------------------------------------------------------

/** Records the reset connection's id, in the outside database. */
const PROBE = `INSERT INTO \`${OTHER}\`.probe SELECT CONNECTION_ID()`

/**
 * The real maintenance connection, with the plan passed through `shape` and
 * prefixed by {@link PROBE}: the statements still run through the real
 * connection's `execute`, which is what is under test.
 */
function probed(
    maintenance: MaintenanceConnection,
    shape: (plan: readonly string[]) => readonly string[],
): MaintenanceConnection {
    return {
        ...maintenance,
        execute: (planner) =>
            maintenance.execute(async (read) => [
                PROBE,
                ...shape(await planner(read)),
            ]),
    }
}

/** The id of the connection the reset ran on, read back from the probe. */
async function resetConnectionId(admin: Admin): Promise<number> {
    const [rows] = await admin.query<mysql.RowDataPacket[]>(
        `SELECT id FROM \`${OTHER}\`.probe`,
    )
    assertEquals(rows.length, 1, 'the reset did not record its connection')
    return Number(rows[0].id)
}

/** How long the server may take to see a destroyed socket close. */
const DISCONNECT_DEADLINE_MS = 10_000

/**
 * The reset's connection is gone from the server once closed, and the
 * application pool's next query runs on another connection with FK checks
 * on.
 *
 * The server-side check decides: a connection released to a pool stays open
 * in its free list for as long as the pool lives, so it never leaves the
 * process list, whichever connection the pool lends next.
 */
async function assertDiscarded(
    admin: Admin,
    handle: DriverHandle,
    id: number,
): Promise<void> {
    const deadline = Date.now() + DISCONNECT_DEADLINE_MS
    for (;;) {
        const [rows] = await admin.query<mysql.RowDataPacket[]>(
            'SELECT count(*) AS n FROM information_schema.PROCESSLIST ' +
                'WHERE ID = ?',
            [id],
        )
        if (Number(rows[0].n) === 0) break
        assert(
            Date.now() < deadline,
            `connection ${id} is still open: it went back to the pool`,
        )
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const [rows] = await (handle.db as MySql2Database).execute(
        sql`SELECT CONNECTION_ID() AS id, @@SESSION.foreign_key_checks AS fk`,
    ) as unknown as [Array<{ id: unknown; fk: unknown }>]
    const [next] = rows
    assert(Number(next.id) !== id, 'the pool lent the reset connection again')
    assertEquals(Number(next.fk), 1, 'the pool lent FOREIGN_KEY_CHECKS = 0')
}

Deno.test({
    name:
        '#446 #447 live: the maintenance connection is gone once closed after a reset that succeeds',
    ignore: !LIVE,
    fn: () =>
        live((admin, url) =>
            withMaintenance(url, SCOPE, async (maintenance, handle) => {
                await resetDatabase(
                    probed(maintenance, (plan) => plan),
                    SETTINGS,
                )
                await maintenance.close()

                assertEquals(await objectsOf(admin, SCOPE), [])
                await assertDiscarded(
                    admin,
                    handle,
                    await resetConnectionId(admin),
                )
            })
        ),
})

Deno.test({
    name:
        '#446 #447 live: the maintenance connection is gone once closed after a reset that fails with FK checks off',
    ignore: !LIVE,
    fn: () =>
        live((admin, url) =>
            withMaintenance(url, SCOPE, async (maintenance, handle) => {
                // The plan's first statement turns FK checks off; the next
                // one fails, so the plan never turns them back on.
                const failing = probed(maintenance, (plan) => [
                    plan[0],
                    `SELECT * FROM \`${SCOPE}\`.no_such_table`,
                ])

                const error = await assertRejects(
                    () => resetDatabase(failing, SETTINGS),
                    Error,
                )

                assertStringIncludes(error.message, 'no_such_table')
                await maintenance.close()
                assertEquals(
                    (await objectsOf(admin, SCOPE)).length,
                    5,
                    'a statement after the failure ran',
                )
                await assertDiscarded(
                    admin,
                    handle,
                    await resetConnectionId(admin),
                )
            })
        ),
})

// -----------------------------------------------------------------------------
// A system DATABASE() is refused before any statement runs
// -----------------------------------------------------------------------------

for (
    const system of ['mysql', 'sys', 'performance_schema', 'information_schema']
) {
    Deno.test({
        name:
            `#446 live: a DATABASE() of \`${system}\` is refused before any statement runs`,
        ignore: !LIVE,
        fn: () =>
            live((admin, url) =>
                withMaintenance(url, system, async (maintenance) => {
                    const before = await objectsOf(admin, system)
                    // Never delegated: a regression must fail this test, not
                    // empty a system database of the server it runs on.
                    let executed = false
                    const spied: MaintenanceConnection = {
                        ...maintenance,
                        execute: async (planner) => {
                            await planner((sql) => maintenance.query(sql))
                            executed = true
                            throw new Error('the plan reached execute')
                        },
                    }

                    const error = await assertRejects(
                        () => resetDatabase(spied, SETTINGS),
                        RefusedError,
                    )

                    assertStringIncludes(error.message, 'system database')
                    assertEquals(executed, false, 'a statement ran')
                    assertEquals(await objectsOf(admin, system), before)
                })
            ),
    })
}

// -----------------------------------------------------------------------------
// #447: the migrate runs on the connection the reset ran on
// -----------------------------------------------------------------------------

Deno.test({
    name:
        '#447 live: CONNECTION_ID() read by the planner is the one the migrate leaves behind',
    ignore: !LIVE,
    fn: () =>
        live((admin, url) =>
            withMaintenance(url, SCOPE, async (maintenance) => {
                const folder = await Deno.makeTempDir({
                    prefix: 'lockness_fresh_',
                })
                try {
                    await writeMigrations(folder)
                    let inside: unknown
                    await resetDatabase({
                        execute: (planner) =>
                            maintenance.execute(async (read) => {
                                const [row] = await read(
                                    'SELECT CONNECTION_ID() AS id',
                                )
                                inside = row.id
                                return planner(read)
                            }),
                    }, SETTINGS)
                    await maintenance.migrate({ folder, table: TABLE })
                    const [after] = await maintenance.query(
                        'SELECT CONNECTION_ID() AS id, DATABASE() AS db',
                    )

                    assertEquals(
                        Number(after.id),
                        Number(inside),
                        'the migrate ran on another connection than the reset',
                    )
                    assertEquals(after.db, SCOPE)
                    assertEquals(await objectsOf(admin, SCOPE), [
                        `${TABLE}:BASE TABLE`,
                        'migrated_a:BASE TABLE',
                        'migrated_b:BASE TABLE',
                    ])
                } finally {
                    await Deno.remove(folder, { recursive: true })
                }
            })
        ),
})
