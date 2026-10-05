/**
 * @fileoverview The mutation battery for #447 — `db:fresh`, `db:migrate` and
 * `db:status` on one maintenance connection.
 *
 * Runs under the shared contract in `tests/mutations/harness.ts`, which
 * refuses to start unless the suites are already green and the target files
 * are clean, and requires every row to name the test that must catch it — so a
 * KILLED row proves the mutated line executed under the named test, not merely
 * that something went red.
 *
 * The rows aim at what #447 made true:
 *
 * - **The plan is read where it runs.** The postgres planner reads inside the
 *   transaction (F1), no statement runs before the planner has resolved (F2),
 *   and the transaction is `REPEATABLE READ` (F3).
 * - **The migrate acts on the database the reset emptied.** The MySQL
 *   migrator wraps the dedicated connection, never the pool (F4), and a
 *   connection drizzle cannot wrap is closed, not leaked (F8).
 * - **A refusal reaches the command as itself.** A stale refusal is never
 *   rethrown after a retried plan committed (F5), a swallowed one is raised
 *   (F6), and the connection's own failure beside it is logged, not dropped
 *   (F7).
 *
 * ```bash
 * deno run -A packages/drizzle/tests/mutations/fresh_447.ts
 * ```
 *
 * @module @lockness/drizzle/tests/mutations/fresh_447
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const CONNECTION = new URL('../../maintenance_connection.ts', import.meta.url)
const DRIVERS = new URL('../../drivers.ts', import.meta.url)
const PASSTHROUGH = new URL('../../planner_passthrough.ts', import.meta.url)
const SUITES = [
    new URL('../maintenance.test.ts', import.meta.url).pathname,
    new URL('../reset.test.ts', import.meta.url).pathname,
]

/** The postgres `execute`: the planner reads through the transaction. */
const POSTGRES_EXECUTE = `        execute: (planner) =>
            client.begin(REPEATABLE_READ, async (tx) => {
                await runPlan(planner, (sql) => tx.unsafe(sql))
            }),`

const MUTATIONS: Mutation[] = [
    // ---- The plan is read where it runs -------------------------------------
    {
        label:
            'F1 postgres reads moved before begin — the plan is built from another snapshot',
        file: CONNECTION,
        edits: [[
            POSTGRES_EXECUTE,
            `        execute: async (planner) => {
            const statements = await planner((sql) => client.unsafe(sql))
            await client.begin(REPEATABLE_READ, async (tx) => {
                for (const statement of statements) await tx.unsafe(statement)
            })
        },`,
        ]],
        killedBy: '#447 postgres execute reads inside BEGIN',
    },
    {
        label:
            'F2 a statement runs before the planner resolves — a refusal comes after a drop',
        file: CONNECTION,
        edits: [[
            '    const statements = await planner(read)\n',
            '    await run(\'DROP TABLE IF EXISTS "early"\')\n' +
            '    const statements = await planner(read)\n',
        ]],
        killedBy: '#447 mysql: a planner that refuses runs no statement',
    },
    {
        label:
            'F3 isolation weakened to READ COMMITTED — four reads, four snapshots',
        file: CONNECTION,
        edits: [[
            "export const REPEATABLE_READ = 'isolation level repeatable read'",
            "export const REPEATABLE_READ = 'isolation level read committed'",
        ]],
        killedBy: '#447 postgres execute reads inside BEGIN',
    },

    // ---- The migrate acts on the database the reset emptied ---------------
    {
        label:
            'F4 the MySQL migrator wraps the pool — the migrate may land on another database',
        file: DRIVERS,
        edits: [['db = drizzle(connection)', 'db = drizzle(pool)']],
        killedBy: '#447 mysql: reads, statements and the migrator all run',
    },

    // ---- A refusal reaches the command as itself ---------------------------
    {
        label:
            'F5 the recorded refusal is not cleared per planner call — a retried, committed plan reports "Nothing was dropped"',
        file: PASSTHROUGH,
        edits: [['            planned = undefined\n', '']],
        killedBy: '#447 a connection that retries never sees a stale refusal',
    },
    {
        label:
            'F6 a refusal the connection swallows is not raised — the command reports success',
        file: PASSTHROUGH,
        edits: [[
            '    if (planned !== undefined) throw planned.error\n',
            '',
        ]],
        killedBy: '#447 a refusal a connection swallows is raised anyway',
    },
    {
        label:
            "F7 the connection's own failure beside a refusal is dropped, not logged",
        file: PASSTHROUGH,
        edits: [[
            '        if (!carries(error, planned.error)) {',
            '        if (false) {',
        ]],
        killedBy:
            '#447 a rollback that fails after a refusal keeps the refusal',
    },
    {
        label:
            'F8 a MySQL connection drizzle cannot wrap is leaked, not closed',
        file: DRIVERS,
        edits: [[
            `                        return rejectAfter(error, [{
                            what: 'close the maintenance connection',
                            run: () => connection.end(),
                        }])`,
            '                        throw error',
        ]],
        killedBy: '#447 mysql: a connection drizzle cannot wrap is closed',
    },
]

Deno.exit(
    await runBattery(
        '#447 mutation battery — one maintenance connection, planner passthrough',
        SUITES,
        MUTATIONS,
    ),
)
