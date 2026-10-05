/**
 * @fileoverview #444 — a freshly scaffolded web or api app migrates a REAL
 * Postgres with the commands its README gives it.
 *
 * `kit_migrations_test.ts` proves the shipped folder is drizzle-kit's output
 * and that drizzle-orm can read it; only a server proves the rest of the
 * promise. For each kit that ships migrations, an app is scaffolded the way a
 * user gets it (`init` in a subprocess, repointed at this working tree), given
 * a throwaway database through `DATABASE_URL` in its `.env`, and then:
 *
 * 1. `deno task db:migrate` creates every table the shipped snapshot names,
 *    and every foreign key with its `ON DELETE` action;
 * 2. a second `db:migrate` applies nothing, and prints no raw server notice:
 *    since #442 it migrates in-process, so the `schema "drizzle" already
 *    exists, skipping` notice goes through the #454 reporter;
 * 3. `deno task cli db:fresh` accepts the folder, empties the database and
 *    re-applies it.
 *
 * **Skipped unless `LOCKNESS_POSTGRES_INTEGRATION=1`** — `deno task
 * test:postgres` and the `live-postgres` CI job set it. `LOCKNESS_POSTGRES_URL`
 * names a loopback server the suite may create and drop databases on; each
 * test creates exactly one, `lockness_kit_<kit>_<random>`, and drops it.
 *
 * @module
 */

import { assert, assertEquals } from '@std/assert'
import { join } from '@std/path'
import postgres from 'postgres'
import {
    LIVE_POSTGRES,
    liveUrl,
} from '../packages/drizzle/tests/live_postgres.ts'
import { inApp, releaseDatabase, withDatabase } from './kit_live.ts'
import { migratingKits, shippedKitMigrations } from './kit_migrations.ts'
import { scaffoldKit } from './kit_smoke.ts'

/** drizzle-kit's `onDelete` spelling → `pg_constraint.confdeltype`. */
const DELETE_ACTION: Readonly<Record<string, string>> = {
    'no action': 'a',
    restrict: 'r',
    cascade: 'c',
    'set null': 'n',
    'set default': 'd',
}

/** The shape of a snapshot this suite reads. */
interface Snapshot {
    tables: Record<string, {
        name: string
        schema: string
        foreignKeys: Record<string, { name: string; onDelete?: string }>
    }>
}

for (const kit of migratingKits()) {
    Deno.test({
        name:
            `#444 live: a fresh ${kit} app migrates, re-migrates as a no-op, and db:fresh re-applies`,
        ignore: !LIVE_POSTGRES,
        async fn() {
            const adminUrl = await liveUrl()
            const database = `lockness_kit_${kit}_${
                crypto.randomUUID().replaceAll('-', '').slice(0, 12)
            }`
            const snapshot = JSON.parse(
                (await shippedKitMigrations(kit)).get(
                    'meta/0000_snapshot.json',
                ) ?? '{}',
            ) as Snapshot
            const tables = Object.values(snapshot.tables)
            assert(tables.length > 0, `${kit} ships no table`)

            const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
            const workdir = await Deno.makeTempDir({
                prefix: 'lockness-444-live-',
            })
            try {
                await admin.unsafe(`CREATE DATABASE "${database}"`)
                const appUrl = withDatabase(adminUrl, database)

                const scaffold = await scaffoldKit(kit, workdir)
                assert(scaffold.ok, scaffold.output)
                await Deno.writeTextFile(
                    join(scaffold.dir, '.env'),
                    `\nDATABASE_URL=${appUrl}\n`,
                    { append: true },
                )

                const db = postgres(appUrl, { max: 1, onnotice: () => {} })
                try {
                    const applied = async (): Promise<number> => {
                        const [row] = await db<{ count: number }[]>`
                            SELECT count(*)::int AS count
                            FROM drizzle.__drizzle_migrations`
                        return row.count
                    }
                    const existing = async (): Promise<string[]> => {
                        const rows = await db<{ name: string }[]>`
                            SELECT table_name AS name
                            FROM information_schema.tables
                            WHERE table_schema = 'public'
                            ORDER BY table_name`
                        return rows.map((r) => r.name)
                    }
                    const expected = tables.map((t) => t.name).sort()

                    // 1. The README's command, on an empty database.
                    const first = await inApp(scaffold.dir, [
                        'task',
                        'db:migrate',
                    ])
                    assert(first.ok, first.output)
                    assertEquals(await existing(), expected)
                    assertEquals(await applied(), 1)
                    for (const table of tables) {
                        for (const fk of Object.values(table.foreignKeys)) {
                            const [row] = await db<{ action: string }[]>`
                                SELECT confdeltype AS action
                                FROM pg_constraint
                                WHERE conname = ${fk.name} AND contype = 'f'`
                            assertEquals(
                                row?.action,
                                DELETE_ACTION[fk.onDelete ?? 'no action'],
                                `${fk.name} ON DELETE`,
                            )
                        }
                    }

                    // 2. Nothing left to apply.
                    const again = await inApp(scaffold.dir, [
                        'task',
                        'db:migrate',
                    ])
                    assert(again.ok, again.output)
                    assertEquals(await applied(), 1)
                    // A raw postgres.js notice prints as an object holding
                    // these fields; the #454 reporter prints none of them.
                    for (const field of ['severity_local', 'routine']) {
                        assertEquals(
                            again.output.includes(field),
                            false,
                            `a raw notice object was printed:\n${again.output}`,
                        )
                    }

                    // 3. db:fresh accepts the folder, empties, re-applies.
                    await db`INSERT INTO users (email, password)
                             VALUES ('fresh@example.test', 'not-a-hash')`
                    const fresh = await inApp(scaffold.dir, [
                        'task',
                        'cli',
                        'db:fresh',
                    ])
                    assert(fresh.ok, fresh.output)
                    assertEquals(await existing(), expected)
                    assertEquals(await applied(), 1)
                    const [{ count }] = await db<{ count: number }[]>`
                        SELECT count(*)::int AS count FROM users`
                    assertEquals(count, 0, 'db:fresh kept a row')
                } finally {
                    await db.end()
                }
            } finally {
                await releaseDatabase(admin, database, workdir)
            }
        },
    })
}
