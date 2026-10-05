/**
 * @fileoverview #452 — on a freshly scaffolded and migrated api kit app, a
 * token from `POST /auth/token` authenticates `GET /auth/me`, against a REAL
 * Postgres, and is refused once expired or revoked.
 *
 * The unit suites prove the lifecycle policy through an in-memory binding;
 * only a server proves that `DrizzleTokenProvider`'s queries, the kit's
 * schema and its migration agree. So the app is scaffolded the way a user gets
 * it (`init` in a subprocess, repointed at this working tree), given a
 * throwaway database through `DATABASE_URL` in its `.env`, migrated with its
 * own `deno task db:migrate`, and then a probe test
 * (`scripts/fixtures/kit_token_flow_probe_test.ts.stub`) is copied into it and
 * run there — through the app's own import map, schema and
 * `createUserProvider`. The probe drives the README's requests with
 * `app.fetch`, and reads the table with SQL.
 *
 * **Skipped unless `LOCKNESS_POSTGRES_INTEGRATION=1`** — `deno task
 * test:postgres` and the `live-postgres` CI job set it. `LOCKNESS_POSTGRES_URL`
 * names a loopback server the suite may create and drop databases on; it
 * creates exactly one, `lockness_kit_tokens_<random>`, and drops it.
 *
 * @module
 */

import { assert } from '@std/assert'
import { fromFileUrl, join } from '@std/path'
import postgres from 'postgres'
import {
    LIVE_POSTGRES,
    liveUrl,
} from '../packages/drizzle/tests/live_postgres.ts'
import { inApp, releaseDatabase, withDatabase } from './kit_live.ts'
import { scaffoldKit } from './kit_smoke.ts'

/** The probe, in the repository. */
const PROBE = fromFileUrl(
    new URL('./fixtures/kit_token_flow_probe_test.ts.stub', import.meta.url),
)

/** Where the probe goes inside the app. */
const PROBE_IN_APP = 'tests/token_flow_probe_test.ts'

/** An SGR colour escape, built from its code so no control byte is in a literal. */
const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

Deno.test({
    name:
        '#452 live: a fresh api app issues a token that authenticates /auth/me, and expires and revokes it',
    ignore: !LIVE_POSTGRES,
    async fn() {
        const adminUrl = await liveUrl()
        const database = `lockness_kit_tokens_${
            crypto.randomUUID().replaceAll('-', '').slice(0, 12)
        }`
        const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
        const workdir = await Deno.makeTempDir({
            prefix: 'lockness-452-live-',
        })
        try {
            await admin.unsafe(`CREATE DATABASE "${database}"`)

            const scaffold = await scaffoldKit('api', workdir)
            assert(scaffold.ok, scaffold.output)
            await Deno.writeTextFile(
                join(scaffold.dir, '.env'),
                `\nDATABASE_URL=${withDatabase(adminUrl, database)}\n`,
                { append: true },
            )

            const migrate = await inApp(scaffold.dir, ['task', 'db:migrate'])
            assert(migrate.ok, migrate.output)

            await Deno.copyFile(PROBE, join(scaffold.dir, PROBE_IN_APP))
            const probe = await inApp(scaffold.dir, [
                'test',
                '-A',
                '--env',
                PROBE_IN_APP,
            ])
            assert(probe.ok, probe.output)
            // Not vacuously green: the probe and every one of its steps ran.
            assert(
                /ok \| 1 passed \(6 steps\) \| 0 failed/.test(
                    // deno colours its summary; strip the escapes to match.
                    probe.output.replaceAll(ANSI_COLOUR, ''),
                ),
                probe.output,
            )
        } finally {
            await releaseDatabase(admin, database, workdir)
        }
    },
})
