/**
 * @fileoverview #445 — `db:push` against a REAL Postgres fails whenever
 * drizzle-kit swallowed what went wrong.
 *
 * drizzle-kit 0.31.10's `pgPush` catches its errors, prints them with
 * `console.error` and exits 0. Lockness therefore reads stderr as well as the
 * exit code. The hermetic tests pin that verdict on canned results; only a
 * server shows that `pgPush` still reports through stderr. A future pin that
 * switches it to `console.log`, as `mysqlPush` already does, would bring the
 * false success back without any other test noticing.
 *
 * The web kit is scaffolded the way a user gets it (`init` in a subprocess,
 * repointed at this working tree) and given a throwaway database through
 * `DATABASE_URL` in its `.env`. Then, with no TTY:
 *
 * 1. a clean `db:push` creates the tables, exits 0 and writes nothing to
 *    stderr;
 * 2. a renamed column makes drizzle-kit ask a question nobody can answer: the
 *    push exits non-zero with the TTY wording, and the table is unchanged;
 * 3. a column turned from `text` to `integer` while a row holds `'x'` makes
 *    the `ALTER` fail on the server: the push exits non-zero and says the
 *    schema may be partly pushed, and the column keeps its type.
 *
 * **Skipped unless `LOCKNESS_POSTGRES_INTEGRATION=1`** — `deno task
 * test:postgres` and the `live-postgres` CI job set it. `LOCKNESS_POSTGRES_URL`
 * names a loopback server the suite may create and drop databases on; it
 * creates exactly one, `lockness_kit_push_<random>`, and drops it.
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import postgres from 'postgres'
import {
    LIVE_POSTGRES,
    liveUrl,
} from '../packages/drizzle/tests/live_postgres.ts'
import { NEEDED_A_TERMINAL } from '../packages/drizzle/kit_outcome.ts'
import { inApp, releaseDatabase, withDatabase } from './kit_live.ts'
import { scaffoldKit } from './kit_smoke.ts'

/** The schema file the steps edit, relative to the app. */
const SCHEMA = 'app/model/user.ts'

/**
 * `db:push` the way a user runs it, minus `deno task`'s own `Task …` line and
 * Deno's download notices, which go to stderr: what is left there is
 * drizzle-kit's, forwarded by Lockness, plus Lockness's own failure line.
 */
const PUSH = ['run', '-q', '-A', '--env', 'cli.ts', 'db:push']

Deno.test({
    name:
        '#445 live: db:push passes clean, and fails a refused rename and a swallowed SQL error',
    ignore: !LIVE_POSTGRES,
    async fn() {
        const adminUrl = await liveUrl()
        const database = `lockness_kit_push_${
            crypto.randomUUID().replaceAll('-', '').slice(0, 12)
        }`
        const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
        const workdir = await Deno.makeTempDir({ prefix: 'lockness-445-live-' })
        const appUrl = withDatabase(adminUrl, database)
        // postgres.js connects on the first query, so the client can exist
        // before its database does — and be closed by the cleanup.
        const db = postgres(appUrl, { max: 1, onnotice: () => {} })
        try {
            await admin.unsafe(`CREATE DATABASE "${database}"`)

            const scaffold = await scaffoldKit('web', workdir)
            assert(scaffold.ok, scaffold.output)
            await Deno.writeTextFile(
                join(scaffold.dir, '.env'),
                `\nDATABASE_URL=${appUrl}\n`,
                { append: true },
            )
            const schema = join(scaffold.dir, SCHEMA)
            const original = await Deno.readTextFile(schema)
            assertStringIncludes(original, "text('name')")

            const columns = async (): Promise<string[]> => {
                const rows = await db<{ name: string; type: string }[]>`
                    SELECT column_name AS name, data_type AS type
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'users'
                    ORDER BY ordinal_position`
                return rows.map((r) => `${r.name} ${r.type}`)
            }

            // 1. A clean push: exit 0, nothing on stderr.
            const clean = await inApp(scaffold.dir, PUSH)
            assert(clean.ok, clean.output)
            assertEquals(clean.stderr, '', clean.output)
            const pushed = await columns()
            assert(pushed.includes('name text'), pushed.join(', '))

            // 2. A rename drizzle-kit can only ask about on a terminal.
            await Deno.writeTextFile(
                schema,
                original.replace("text('name')", "text('display_name')"),
            )
            const renamed = await inApp(scaffold.dir, PUSH)
            assertEquals(renamed.ok, false, renamed.output)
            assertStringIncludes(renamed.output, NEEDED_A_TERMINAL)
            assertStringIncludes(renamed.output, 'Run db:push in a terminal')
            assertEquals(await columns(), pushed, 'the refused push changed')

            // 3. An ALTER the server rejects: pgPush swallows it.
            await db`INSERT INTO users (email, password, name)
                     VALUES ('push@example.test', 'not-a-hash', 'x')`
            const retyped = original
                .replace(
                    'import { pgTable, serial, text, timestamp }',
                    'import { integer, pgTable, serial, text, timestamp }',
                )
                .replace("name: text('name')", "name: integer('name')")
            // Both edits must land, or the push has nothing to fail on.
            assertStringIncludes(retyped, 'import { integer,')
            assertStringIncludes(retyped, "name: integer('name')")
            await Deno.writeTextFile(schema, retyped)
            const failed = await inApp(scaffold.dir, PUSH)
            assertEquals(failed.ok, false, failed.output)
            assertStringIncludes(
                failed.output,
                'drizzle-kit push exited 0 after reporting an error',
            )
            assertStringIncludes(failed.output, 'may be partly pushed')
            assertEquals(await columns(), pushed, 'the failed ALTER changed')
        } finally {
            await releaseDatabase(admin, database, {
                workdir,
                connections: [db],
            })
        }
    },
})
