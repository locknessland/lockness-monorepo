/**
 * @fileoverview #435 — `db:fresh` end to end on a real libsql `:memory:`
 * database: the default sqlite driver factory, its maintenance capability,
 * the sqlite reset plan and drizzle-orm's own migrator, wired by the real
 * `db:fresh` handler.
 *
 * The database holds what a fresh must remove: rows, a foreign-key chain
 * (dropping the parent first fails with FKs on), a view, a trigger, and a
 * stray table no migration created. Afterwards only what the migrations create
 * is left, the bookkeeping table holds one row per journal entry, and the
 * migrations folder is byte- and mtime-identical.
 *
 * A `:memory:` database lives as long as its connection, so the test opens
 * the handle itself and passes its maintenance connection through the
 * `openMaintenance` seam; the handle is closed at the end, which `test:leaks`
 * checks. The connection is a view over the handle's client (#447): the
 * reads and the reset run in one write transaction, the migrate on the same
 * database.
 *
 * @module @lockness/drizzle/tests/fresh_libsql
 */

import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { defaultDriverFactories } from '../drivers.ts'
import { registerDrizzleCommands } from '../cli_commands.ts'

/** The two migrations, as drizzle-kit writes them. */
const MIGRATIONS: ReadonlyArray<readonly [string, string]> = [
    [
        '0000_init',
        [
            'CREATE TABLE `users` (`id` integer PRIMARY KEY, `name` text);',
            'CREATE TABLE `posts` (`id` integer PRIMARY KEY AUTOINCREMENT, ' +
            '`user_id` integer REFERENCES `users`(`id`));',
        ].join('\n--> statement-breakpoint\n'),
    ],
    [
        '0001_comments',
        [
            'CREATE TABLE `comments` (`id` integer PRIMARY KEY, ' +
            '`post_id` integer REFERENCES `posts`(`id`));',
            'CREATE VIEW `user_posts` AS SELECT u.name, p.id FROM `users` u ' +
            'JOIN `posts` p ON p.user_id = u.id;',
            'CREATE TRIGGER `users_touch` AFTER INSERT ON `users` BEGIN ' +
            "UPDATE `users` SET `name` = `name` || '' WHERE `id` = NEW.`id`; END;",
        ].join('\n--> statement-breakpoint\n'),
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

/** Every file under `dir` with its size, mtime and content, sorted. */
async function fingerprint(dir: string): Promise<string> {
    const parts: string[] = []
    for await (const entry of Deno.readDir(dir)) {
        const path = join(dir, entry.name)
        if (entry.isDirectory) {
            parts.push(await fingerprint(path))
            continue
        }
        const stat = await Deno.stat(path)
        parts.push(
            `${path}:${stat.size}:${stat.mtime?.getTime()}:${await Deno
                .readTextFile(path)}`,
        )
    }
    return parts.sort().join('|')
}

Deno.test('#435 db:fresh on a real libsql :memory: database', async () => {
    const folder = await Deno.makeTempDir()
    const handle = await defaultDriverFactories.sqlite(':memory:')
    const { log } = console
    try {
        await writeMigrations(folder)
        if (!handle.maintenance) {
            throw new Error('the sqlite factory has no maintenance')
        }
        const maintenance = await handle.maintenance.open()

        // A database a fresh must empty: migrated, filled, and drifted.
        await maintenance.migrate({ folder, table: '__drizzle_migrations' })
        await maintenance.execute(() =>
            Promise.resolve([
                "INSERT INTO `users` VALUES (1, 'ada')",
                'INSERT INTO `posts` (`user_id`) VALUES (1)',
                'INSERT INTO `comments` VALUES (1, 1)',
                'CREATE TABLE `stray` (`user_id` integer REFERENCES `users`(`id`))',
                'INSERT INTO `stray` VALUES (1)',
            ])
        )
        const [{ fk }] = await maintenance.query(
            'SELECT foreign_keys AS fk FROM pragma_foreign_keys',
        )
        assertEquals(fk, 1, 'FKs are off, so the chain proves nothing')
        const before = await fingerprint(folder)

        let closes = 0
        const cli = {
            commands: new Map<string, (a: string[]) => Promise<void> | void>(),
            register(name: string, h: (a: string[]) => Promise<void> | void) {
                this.commands.set(name, h)
            },
        }
        registerDrizzleCommands(cli, {
            runCommand: () => {
                throw new Error('db:fresh spawned a process')
            },
            loadMigrationConfig: () =>
                Promise.resolve({
                    dialect: 'sqlite',
                    out: folder,
                    dbCredentials: { url: ':memory:' },
                }),
            openMaintenance: () =>
                Promise.resolve({
                    ...maintenance,
                    close: () => {
                        closes++
                        return Promise.resolve()
                    },
                }),
        })
        console.log = () => {}
        await cli.commands.get('db:fresh')!([])
        console.log = log

        const objects = await maintenance.query(
            "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY type, name",
        )
        // `stray` is gone; everything else was dropped and re-created.
        assertEquals(objects, [
            { type: 'table', name: '__drizzle_migrations' },
            { type: 'table', name: 'comments' },
            { type: 'table', name: 'posts' },
            { type: 'table', name: 'users' },
            { type: 'trigger', name: 'users_touch' },
            { type: 'view', name: 'user_posts' },
        ])
        const [{ n: users }] = await maintenance.query(
            'SELECT count(*) AS n FROM `users`',
        )
        assertEquals(users, 0, 'the rows survived')
        const [{ n: applied }] = await maintenance.query(
            'SELECT count(*) AS n FROM `__drizzle_migrations`',
        )
        assertEquals(applied, MIGRATIONS.length)
        assertEquals(await fingerprint(folder), before, 'the folder changed')
        assertEquals(closes, 1)
    } finally {
        console.log = log
        await handle.close()
        await Deno.remove(folder, { recursive: true })
    }
})
