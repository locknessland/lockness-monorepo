/**
 * @fileoverview #442 — `db:migrate` end to end on a real libsql `file:`
 * database, through the production opener: the container `Database`, the
 * default sqlite driver factory, its maintenance capability and drizzle-orm's
 * own migrator, wired by the real `db:migrate` handler. Only the
 * `drizzle.config.ts` import is replaced, by the loader seam.
 *
 * The first run applies every migration into the bookkeeping table the config
 * names; the second applies nothing and leaves the data alone. A file, not
 * `:memory:`, because each run opens and closes its own connection — which is
 * also what lets `test:leaks` check that both are closed.
 *
 * @module @lockness/drizzle/tests/migrate_libsql
 */

import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { container } from '@lockness/container'
import { Database } from '../mod.ts'
import { defaultDriverFactories } from '../drivers.ts'
import { registerDrizzleCommands } from '../cli_commands.ts'

/** The two migrations, as drizzle-kit writes them. */
const MIGRATIONS: ReadonlyArray<readonly [string, string]> = [
    [
        '0000_init',
        'CREATE TABLE `users` (`id` integer PRIMARY KEY, `name` text);',
    ],
    [
        '0001_posts',
        'CREATE TABLE `posts` (`id` integer PRIMARY KEY, ' +
        '`user_id` integer REFERENCES `users`(`id`));',
    ],
]

/** Write the migrations folder and its journal. */
async function writeMigrations(folder: string): Promise<void> {
    await Deno.mkdir(join(folder, 'meta'), { recursive: true })
    await Deno.writeTextFile(
        join(folder, 'meta', '_journal.json'),
        JSON.stringify({
            version: '7',
            dialect: 'sqlite',
            entries: MIGRATIONS.map(([tag], idx) => ({
                idx,
                version: '6',
                when: 1_700_000_000_000 + idx,
                tag,
                breakpoints: true,
            })),
        }),
    )
    for (const [tag, sql] of MIGRATIONS) {
        await Deno.writeTextFile(join(folder, `${tag}.sql`), sql)
    }
}

/**
 * Run `db:migrate` once, against a fresh container `Database`, and return the
 * console lines it printed. Throws what the command threw.
 */
async function migrate(config: Record<string, unknown>): Promise<string[]> {
    const commands = new Map<string, (a: string[]) => Promise<void> | void>()
    container.delete(Database)
    registerDrizzleCommands({
        register: (name, handler) => void commands.set(name, handler),
    }, {
        runCommand: () => {
            throw new Error('db:migrate spawned a process')
        },
        loadMigrationConfig: () => Promise.resolve(config),
    })
    const lines: string[] = []
    const { log } = console
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        await commands.get('db:migrate')!([])
        return lines
    } finally {
        console.log = log
        const db = container.get(Database)
        if (db.isConnected()) await db.close()
        container.delete(Database)
    }
}

Deno.test('#442 db:migrate on a real libsql file: database applies once, then nothing', async () => {
    const dir = await Deno.makeTempDir()
    const folder = join(dir, 'migrations')
    const url = `file:${join(dir, 'app.db')}`
    const config = {
        dialect: 'sqlite',
        out: folder,
        dbCredentials: { url },
        migrations: { table: 'history' },
    }
    try {
        await writeMigrations(folder)

        assertEquals(await migrate(config), [
            '🚀 Running migrations...',
            '✅ Migrations applied successfully',
        ])

        const handle = await defaultDriverFactories.sqlite(url)
        try {
            const maintenance = handle.maintenance
            if (!maintenance) {
                throw new Error('the sqlite factory has no maintenance')
            }
            const tables = async () =>
                (await maintenance.query(
                    "SELECT name FROM sqlite_master WHERE type = 'table' " +
                        "AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name",
                )).map((row) => row.name)
            const applied = async () =>
                (await maintenance.query(
                    'SELECT count(*) AS n FROM `history`',
                ))[0].n

            // The bookkeeping table is the one the config names.
            assertEquals(await tables(), ['history', 'posts', 'users'])
            assertEquals(await applied(), MIGRATIONS.length)
            await maintenance.execute([
                "INSERT INTO `users` VALUES (1, 'ada')",
            ])

            // A second run has nothing left to apply.
            assertEquals(await migrate(config), [
                '🚀 Running migrations...',
                '✅ Migrations applied successfully',
            ])
            assertEquals(await applied(), MIGRATIONS.length)
            assertEquals(await tables(), ['history', 'posts', 'users'])
            const [{ n: users }] = await maintenance.query(
                'SELECT count(*) AS n FROM `users`',
            )
            assertEquals(users, 1, 'the second run touched the data')
        } finally {
            await handle.close()
        }
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
