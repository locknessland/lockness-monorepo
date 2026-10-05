/**
 * @fileoverview #439 — `db:status` against a LIVE postgres, beside the real
 * `db:migrate`, through the production opener: never migrated (the
 * bookkeeping schema absent), a clean status after migrating, a custom
 * bookkeeping schema and table with awkward names, the pending → migrate →
 * clean parity, and an out-of-order entry the migrator never applies.
 *
 * The pure tests in `migration_status.test.ts` pin the SQL and the rule; only
 * a real server proves what a fake cannot: postgres.js returns `int8` as a
 * string, the catalogue lists the bookkeeping table under the names the
 * migrator created it with, and status leaves no schema behind.
 *
 * **Skipped unless `LOCKNESS_POSTGRES_INTEGRATION=1`.** The `live-postgres`
 * CI job sets it; locally, `deno task test:postgres` sets it.
 * `LOCKNESS_POSTGRES_URL` names the server, and every host it names must be
 * loopback (`tests/live_postgres.ts`). The suite creates and drops only the
 * database `lockness_status`, so the url's role needs `CREATEDB`; the url's
 * own database is never touched.
 *
 * @module @lockness/drizzle/tests/status_postgres_live
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import postgres from 'postgres'
import { CommandFailedError } from '@lockness/cli/command-failure'
import { container } from '@lockness/container'
import { Database } from '../mod.ts'
import { registerDrizzleCommands } from '../cli_commands.ts'
import { LIVE_POSTGRES as LIVE, liveUrl } from './live_postgres.ts'

/** The one database the suite owns. */
const DATABASE = 'lockness_status'

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
            dialect: 'postgresql',
            entries: entries.map(([tag, when], idx) => ({
                idx,
                version: '7',
                when,
                tag,
                breakpoints: true,
            })),
        }),
    )
    for (const [tag] of entries) {
        await Deno.writeTextFile(
            join(folder, `${tag}.sql`),
            `CREATE TABLE "t_${tag}" ("id" integer);`,
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
    const saved = { ...console }
    const record = (...args: unknown[]) => void lines.push(args.join(' '))
    console.log = record
    console.info = record
    console.warn = record
    console.debug = record
    try {
        await commands.get(command)!([])
        return { lines, error: undefined }
    } catch (error) {
        return { lines, error }
    } finally {
        Object.assign(console, saved)
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

/** A postgres.js client, as the suite's admin side uses it. */
type Client = ReturnType<typeof postgres>

/**
 * Create the suite's database, hand `body` a client on it, its url and a
 * temporary migrations folder, and always drop and remove both.
 */
async function live(
    body: (client: Client, url: string, folder: string) => Promise<void>,
): Promise<void> {
    const server = await liveUrl()
    const admin = postgres(server, { max: 1, onnotice: () => {} })
    const folder = await Deno.makeTempDir({ prefix: 'lockness_status_' })
    try {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`)
        await admin.unsafe(`CREATE DATABASE "${DATABASE}"`)
        const url = at(server, DATABASE)
        const client = postgres(url, { max: 1, onnotice: () => {} })
        try {
            await body(client, url, folder)
        } finally {
            await client.end()
        }
    } finally {
        try {
            await admin.unsafe(
                `DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`,
            )
        } finally {
            await admin.end()
            await Deno.remove(folder, { recursive: true })
        }
    }
}

/** Whether a schema exists. */
async function hasSchema(client: Client, schema: string): Promise<boolean> {
    const rows = await client`
        SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = ${schema}`
    return rows.length > 0
}

/** The `t_*` tables of `public`, sorted. */
async function tables(client: Client): Promise<string[]> {
    const rows = await client`
        SELECT tablename FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 't\\_%'
        ORDER BY tablename`
    return rows.map((row) => String(row.tablename))
}

const FIRST: readonly Entry[] = [['0000_init', T], ['0001_users', T + 10]]

Deno.test({
    name:
        '#439 live postgres: never migrated, every migration pending, and no bookkeeping schema is created',
    ignore: !LIVE,
    fn: () =>
        live(async (client, url, folder) => {
            await writeJournal(folder, FIRST)
            const config = {
                dialect: 'postgresql',
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
            assertEquals(await hasSchema(client, 'drizzle'), false)
        }),
})

Deno.test({
    name:
        '#439 live postgres: after db:migrate, status reads the int8 created_at and exits 0',
    ignore: !LIVE,
    fn: () =>
        live(async (_client, url, folder) => {
            await writeJournal(folder, FIRST)
            const config = {
                dialect: 'postgresql',
                out: folder,
                dbCredentials: { url },
            }
            assertEquals((await run('db:migrate', config)).error, undefined)

            const status = await run('db:status', config)

            assertEquals(status.error, undefined)
            assertEquals(
                status.lines[0],
                '📊 Migration status (bookkeeping table "drizzle"."__drizzle_migrations")',
            )
            assertEquals(listed(status, 'applied'), ['0000_init', '0001_users'])
            assertEquals(status.lines.at(-1), '✅ All 2 migrations are applied')
        }),
})

Deno.test({
    name:
        '#439 live postgres: a custom bookkeeping schema and table with awkward names',
    ignore: !LIVE,
    fn: () =>
        live(async (client, url, folder) => {
            // drizzle-orm quotes identifiers without doubling `"`, so the
            // awkward characters are the ones its own migrator survives.
            const schema = "it's a \\ schema"
            const table = "Hist'ory \\ log"
            await writeJournal(folder, FIRST)
            const config = {
                dialect: 'postgresql',
                out: folder,
                dbCredentials: { url },
                migrations: { schema, table },
            }
            // The default table, in the default schema, is not the one asked.
            await client.unsafe(
                'CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations ' +
                    '(id serial, hash text NOT NULL, created_at bigint)',
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
                `📊 Migration status (bookkeeping table "it's a \\ schema"."Hist'ory \\ log")`,
            )
            assertEquals(listed(status, 'applied'), ['0000_init', '0001_users'])
        }),
})

Deno.test({
    name:
        '#439 live postgres parity: pending, then db:migrate, then clean; an out-of-order entry is never applied',
    ignore: !LIVE,
    fn: () =>
        live(async (client, url, folder) => {
            await writeJournal(folder, FIRST)
            const config = {
                dialect: 'postgresql',
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
            assertEquals(await tables(client), [
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
