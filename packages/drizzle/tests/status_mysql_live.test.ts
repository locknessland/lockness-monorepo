/**
 * @fileoverview #439 — `db:status` against a LIVE MySQL, beside the real
 * `db:migrate`, through the production opener: never migrated, a clean status
 * after migrating, a custom bookkeeping table with awkward characters, the
 * pending → migrate → clean parity, and an out-of-order entry the migrator
 * never applies.
 *
 * The pure tests in `migration_status.test.ts` pin the SQL and the rule; only
 * a real server proves what a fake cannot: the type mysql2 returns for a
 * `BIGINT` `created_at`, and that `information_schema.tables` under
 * `DATABASE()` names the bookkeeping table the migrator created.
 *
 * **Skipped unless `LOCKNESS_MYSQL_INTEGRATION=1`.** The `live-mysql` CI job
 * sets it; locally, `deno task test:mysql` sets it. `LOCKNESS_MYSQL_URL`
 * names the server, and its host must be loopback (`tests/live_mysql.ts`).
 * The suite creates and drops only the database `lockness_status_mysql`, so
 * the url's user needs `CREATE` and `DROP` on it; the url's own database, if
 * it names one, is never touched.
 *
 * @module @lockness/drizzle/tests/status_mysql_live
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import mysql from 'mysql2/promise'
import { CommandFailedError } from '@lockness/cli/command-failure'
import { container } from '@lockness/container'
import { Database } from '../mod.ts'
import { registerDrizzleCommands } from '../cli_commands.ts'
import { LIVE_MYSQL as LIVE, liveMysqlUrl } from './live_mysql.ts'

/** The one database the suite owns. */
const DATABASE = 'lockness_status_mysql'

/** The base timestamp every journal entry is offset from. */
const T = 1_700_000_000_000

/** One journal entry: its tag and its `when`. */
type Entry = readonly [tag: string, when: number]

/** The server url with its path set to `database`. */
function at(url: string, database: string): string {
    const target = new URL(url)
    target.pathname = `/${database}`
    return target.toString()
}

/**
 * Write the journal for `entries`, and one file per entry: a table named
 * after its tag.
 */
async function writeJournal(
    folder: string,
    entries: readonly Entry[],
): Promise<void> {
    await Deno.mkdir(join(folder, 'meta'), { recursive: true })
    await Deno.writeTextFile(
        join(folder, 'meta', '_journal.json'),
        JSON.stringify({
            version: '7',
            dialect: 'mysql',
            entries: entries.map(([tag, when], idx) => ({
                idx,
                version: '5',
                when,
                tag,
                breakpoints: true,
            })),
        }),
    )
    for (const [tag] of entries) {
        await Deno.writeTextFile(
            join(folder, `${tag}.sql`),
            `CREATE TABLE \`t_${tag}\` (\`id\` int);`,
        )
    }
}

/** What one command printed, and what it threw. */
interface Run {
    readonly lines: string[]
    readonly error: unknown
}

/** Run one `db:*` command through the production opener; capture it. */
async function run(
    command: 'db:status' | 'db:migrate',
    config: Record<string, unknown>,
): Promise<Run> {
    const commands = new Map<string, (a: string[]) => Promise<void> | void>()
    container.delete(Database)
    registerDrizzleCommands({
        register: (name, handler) => void commands.set(name, handler),
    }, {
        runCommand: () => {
            throw new Error(`${command} spawned a process`)
        },
        loadMigrationConfig: () => Promise.resolve(config),
    })
    const lines: string[] = []
    const { log } = console
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        await commands.get(command)!([])
        return { lines, error: undefined }
    } catch (error) {
        return { lines, error }
    } finally {
        console.log = log
        const db = container.get(Database)
        if (db.isConnected()) await db.close()
        container.delete(Database)
    }
}

/** The failure message of a run, asserting it failed as a command does. */
function failure(result: Run): string {
    assert(result.error instanceof CommandFailedError, String(result.error))
    assertEquals(result.error.exitCode, 1)
    return result.error.message
}

/** The tags a status run listed in `state`, in order. */
function listed(result: Run, state: string): string[] {
    const prefix = `  ${state.padEnd(15)}`
    return result.lines
        .filter((line) => line.startsWith(prefix))
        .map((line) => line.slice(prefix.length).split(' ')[0])
}

/** A mysql2 connection, as the suite's admin side uses it. */
type Admin = mysql.Connection

/**
 * Create the suite's database, hand `body` an admin connection, the url of
 * the database and a temporary migrations folder, and always drop and remove
 * both.
 */
async function live(
    body: (admin: Admin, url: string, folder: string) => Promise<void>,
): Promise<void> {
    const server = liveMysqlUrl()
    const admin = await mysql.createConnection(server)
    const folder = await Deno.makeTempDir({ prefix: 'lockness_status_' })
    try {
        await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``)
        await admin.query(`CREATE DATABASE \`${DATABASE}\``)
        await body(admin, at(server, DATABASE), folder)
    } finally {
        try {
            await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``)
        } finally {
            await admin.end()
            await Deno.remove(folder, { recursive: true })
        }
    }
}

/** The tables of the suite's database, sorted. */
async function tables(admin: Admin): Promise<string[]> {
    const [rows] = await admin.query<mysql.RowDataPacket[]>(
        'SELECT TABLE_NAME AS name FROM information_schema.TABLES ' +
            'WHERE TABLE_SCHEMA = ?',
        [DATABASE],
    )
    return rows.map((row) => String(row.name)).sort()
}

const FIRST: readonly Entry[] = [['0000_init', T], ['0001_users', T + 10]]

Deno.test({
    name:
        '#439 live mysql: never migrated, every migration pending, and no bookkeeping table is created',
    ignore: !LIVE,
    fn: () =>
        live(async (admin, url, folder) => {
            await writeJournal(folder, FIRST)
            const config = {
                dialect: 'mysql',
                out: folder,
                dbCredentials: { url },
            }

            const status = await run('db:status', config)

            assertEquals(
                failure(status),
                '2 of 2 migrations are not applied: 2 pending',
            )
            assertStringIncludes(
                status.lines.join('\n'),
                'has never been migrated',
            )
            assertEquals(await tables(admin), [])
        }),
})

Deno.test({
    name:
        '#439 live mysql: after db:migrate, status reads the BIGINT created_at and exits 0',
    ignore: !LIVE,
    fn: () =>
        live(async (_admin, url, folder) => {
            await writeJournal(folder, FIRST)
            const config = {
                dialect: 'mysql',
                out: folder,
                dbCredentials: { url },
            }
            assertEquals((await run('db:migrate', config)).error, undefined)

            const status = await run('db:status', config)

            assertEquals(status.error, undefined)
            assertEquals(
                status.lines[0],
                '📊 Migration status (bookkeeping table `__drizzle_migrations`)',
            )
            assertEquals(listed(status, 'applied'), ['0000_init', '0001_users'])
            assertEquals(status.lines.at(-1), '✅ All 2 migrations are applied')
        }),
})

Deno.test({
    name: '#439 live mysql: a custom bookkeeping table with awkward characters',
    ignore: !LIVE,
    fn: () =>
        live(async (admin, url, folder) => {
            // drizzle-orm quotes identifiers without doubling the backtick,
            // so the awkward characters are the ones its migrator survives.
            const table = "hist'ory \\ log"
            await writeJournal(folder, FIRST)
            const config = {
                dialect: 'mysql',
                out: folder,
                dbCredentials: { url },
                migrations: { table },
            }
            // The default table is not the one asked about.
            await admin.query(
                `CREATE TABLE \`${DATABASE}\`.__drizzle_migrations ` +
                    '(id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)',
            )

            const never = await run('db:status', config)
            assertEquals(
                failure(never),
                '2 of 2 migrations are not applied: 2 pending',
            )

            assertEquals((await run('db:migrate', config)).error, undefined)
            const status = await run('db:status', config)

            assertEquals(status.error, undefined)
            assertEquals(
                status.lines[0],
                "📊 Migration status (bookkeeping table `hist'ory \\ log`)",
            )
            assertEquals(listed(status, 'applied'), ['0000_init', '0001_users'])
        }),
})

Deno.test({
    name:
        '#439 live mysql parity: pending, then db:migrate, then clean; an out-of-order entry is never applied',
    ignore: !LIVE,
    fn: () =>
        live(async (admin, url, folder) => {
            await writeJournal(folder, FIRST)
            const config = {
                dialect: 'mysql',
                out: folder,
                dbCredentials: { url },
            }
            await run('db:migrate', config)
            await writeJournal(folder, [
                ...FIRST,
                ['0002_posts', T + 20],
                ['0003_tags', T + 5],
            ])

            const before = await run('db:status', config)
            assertEquals(
                failure(before),
                '2 of 4 migrations are not applied: 1 pending, 1 out of order',
            )
            assertEquals(listed(before, 'pending'), ['0002_posts'])
            assertEquals(listed(before, 'out of order'), ['0003_tags'])

            assertEquals((await run('db:migrate', config)).error, undefined)
            assertEquals(await tables(admin), [
                '__drizzle_migrations',
                't_0000_init',
                't_0001_users',
                't_0002_posts',
            ])

            const after = await run('db:status', config)
            assertEquals(listed(after, 'pending'), [])
            assertEquals(listed(after, 'out of order'), ['0003_tags'])
            assertEquals(
                failure(after),
                '1 of 4 migrations is not applied: 1 out of order',
            )
        }),
})
