/**
 * @fileoverview #439 — `db:status` end to end on a real libsql `file:`
 * database, through the production opener, beside the real `db:migrate`:
 * the container `Database`, the default sqlite driver factory, its
 * maintenance capability and drizzle-orm's own migrator. Only the
 * `drizzle.config.ts` import is replaced, by the loader seam.
 *
 * The parity test is the one that catches a drizzle-orm upgrade changing its
 * bookkeeping rule: `db:migrate` must apply exactly the entries `db:status`
 * called pending, and never the one it called out of order.
 *
 * @module @lockness/drizzle/tests/status_libsql
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { CommandFailedError } from '@lockness/cli/command-failure'
import { container } from '@lockness/container'
import { Database } from '../mod.ts'
import { defaultDriverFactories } from '../drivers.ts'
import { registerDrizzleCommands } from '../cli_commands.ts'

/** The base timestamp every entry is offset from. */
const T = 1_700_000_000_000

/** One journal entry: its tag and its `when`. */
type Entry = readonly [tag: string, when: number]

/** The migration a tag stands for: one table named after it. */
function migrationSql(tag: string): string {
    return `CREATE TABLE \`t_${tag}\` (\`id\` integer);`
}

/** Write the journal for `entries`, and a file for each one not yet there. */
async function writeJournal(
    folder: string,
    entries: readonly Entry[],
): Promise<void> {
    await Deno.mkdir(join(folder, 'meta'), { recursive: true })
    await Deno.writeTextFile(
        join(folder, 'meta', '_journal.json'),
        JSON.stringify({
            version: '7',
            dialect: 'sqlite',
            entries: entries.map(([tag, when], idx) => ({
                idx,
                version: '6',
                when,
                tag,
                breakpoints: true,
            })),
        }),
    )
    for (const [tag] of entries) {
        const file = join(folder, `${tag}.sql`)
        try {
            await Deno.lstat(file)
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error
            await Deno.writeTextFile(file, migrationSql(tag))
        }
    }
}

/** What one command printed, and what it threw. */
interface Run {
    readonly lines: string[]
    readonly error: unknown
}

/**
 * Run one `db:*` command against a fresh container `Database`, through the
 * production opener; capture what it printed and threw.
 */
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
    assert(
        result.error instanceof CommandFailedError,
        String(result.error),
    )
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

/** Read the database directly: its `t_*` tables and its bookkeeping rows. */
async function inspect(url: string): Promise<{
    readonly tables: string[]
    readonly recorded: number[]
}> {
    const handle = await defaultDriverFactories.sqlite(url)
    try {
        const maintenance = handle.maintenance
        if (!maintenance) {
            throw new Error('the sqlite factory has no maintenance')
        }
        const tables = (await maintenance.query(
            "SELECT name FROM sqlite_master WHERE type = 'table' " +
                "AND name LIKE 't\\_%' ESCAPE '\\' ORDER BY name",
        )).map((row) => String(row.name))
        const hasHistory = (await maintenance.query(
            "SELECT name FROM sqlite_master WHERE name = 'history'",
        )).length > 0
        const recorded = hasHistory
            ? (await maintenance.query(
                'SELECT created_at FROM `history` ORDER BY created_at',
            )).map((row) => Number(row.created_at))
            : []
        return { tables, recorded }
    } finally {
        await handle.close()
    }
}

/** A temporary folder and database, the config naming them, removed after. */
async function withProject(
    fn: (
        folder: string,
        url: string,
        config: Record<string, unknown>,
    ) => Promise<void>,
): Promise<void> {
    const dir = await Deno.makeTempDir()
    const folder = join(dir, 'migrations')
    const url = `file:${join(dir, 'app.db')}`
    try {
        await fn(folder, url, {
            dialect: 'sqlite',
            out: folder,
            dbCredentials: { url },
            migrations: { table: 'history' },
        })
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

const FIRST: readonly Entry[] = [['0000_init', T], ['0001_users', T + 10]]

Deno.test('#439 libsql: never migrated, every migration pending, and status creates nothing', async () => {
    await withProject(async (folder, url, config) => {
        await writeJournal(folder, FIRST)

        const status = await run('db:status', config)

        assertEquals(
            failure(status),
            '2 of 2 migrations are not applied: 2 pending',
        )
        assertEquals(listed(status, 'pending'), ['0000_init', '0001_users'])
        assertStringIncludes(status.lines.join('\n'), 'has never been migrated')
        // Read-only: the bookkeeping table is not created by asking.
        assertEquals(await inspect(url), { tables: [], recorded: [] })
    })
})

Deno.test('#439 libsql: after db:migrate, status exits 0', async () => {
    await withProject(async (folder, _url, config) => {
        await writeJournal(folder, FIRST)
        assertEquals((await run('db:migrate', config)).error, undefined)

        const status = await run('db:status', config)

        assertEquals(status.error, undefined)
        assertEquals(listed(status, 'applied'), ['0000_init', '0001_users'])
        assertEquals(status.lines.at(-1), '✅ All 2 migrations are applied')
    })
})

Deno.test('#439 libsql: an appended newer entry is pending; an appended older one is out of order', async () => {
    await withProject(async (folder, _url, config) => {
        await writeJournal(folder, FIRST)
        await run('db:migrate', config)

        await writeJournal(folder, [...FIRST, ['0002_posts', T + 20]])
        const newer = await run('db:status', config)
        assertEquals(
            failure(newer),
            '1 of 3 migrations is not applied: 1 pending',
        )
        assertEquals(listed(newer, 'pending'), ['0002_posts'])

        await writeJournal(folder, [...FIRST, ['0002_tags', T + 5]])
        const older = await run('db:status', config)
        assertEquals(
            failure(older),
            '1 of 3 migrations is not applied: 1 out of order',
        )
        assertEquals(listed(older, 'out of order'), ['0002_tags'])
    })
})

Deno.test('#439 libsql: an applied file edited afterwards warns, and exits 0', async () => {
    await withProject(async (folder, _url, config) => {
        await writeJournal(folder, FIRST)
        await run('db:migrate', config)
        await Deno.writeTextFile(
            join(folder, '0000_init.sql'),
            migrationSql('0000_init') + '\n-- edited',
        )

        const status = await run('db:status', config)

        assertEquals(status.error, undefined)
        assertStringIncludes(
            status.lines.find((line) => line.includes('0000_init')) ?? '',
            '⚠️ edited after it was applied',
        )
    })
})

Deno.test('#439 libsql parity: db:migrate applies exactly what db:status called pending, never the out-of-order entry', async () => {
    await withProject(async (folder, url, config) => {
        await writeJournal(folder, FIRST)
        await run('db:migrate', config)
        const journal: readonly Entry[] = [
            ...FIRST,
            ['0002_posts', T + 20],
            ['0003_tags', T + 5],
            ['0004_likes', T + 30],
        ]
        await writeJournal(folder, journal)

        const before = await run('db:status', config)
        assertEquals(
            failure(before),
            '3 of 5 migrations are not applied: 2 pending, 1 out of order',
        )
        const pending = listed(before, 'pending')
        assertEquals(pending, ['0002_posts', '0004_likes'])
        assertEquals(listed(before, 'out of order'), ['0003_tags'])
        const applied = await inspect(url)

        assertEquals((await run('db:migrate', config)).error, undefined)

        // What the real migrator did is exactly what status predicted.
        const after = await inspect(url)
        const when = new Map(journal)
        assertEquals(
            after.recorded.filter((t) => !applied.recorded.includes(t)),
            pending.map((tag) => when.get(tag)),
        )
        assertEquals(
            after.tables.filter((t) => !applied.tables.includes(t)),
            pending.map((tag) => `t_${tag}`),
        )
        assertEquals(after.tables.includes('t_0003_tags'), false)

        const again = await run('db:status', config)
        assertEquals(listed(again, 'pending'), [])
        assertEquals(listed(again, 'out of order'), ['0003_tags'])
        assertEquals(
            failure(again),
            '1 of 5 migrations is not applied: 1 out of order',
        )
    })
})
