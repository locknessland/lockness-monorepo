/**
 * @fileoverview The mutation battery for #427 — the `Database` lifecycle, the
 * `silent` option, and the `db:check` round trip.
 *
 * Runs under the shared contract in `tests/mutations/harness.ts`, which
 * refuses to start unless the suites are already green and the target files
 * are clean, and requires every row to name the test that must catch it — so a
 * KILLED row proves the mutated line executed under the named test, not merely
 * that something went red.
 *
 * The rows aim at the three things #427 made true:
 *
 * - **One client at a time.** The state guard, where it sits in `connect()`,
 *   the `configuring` reservation and its release, and `close()` waiting for a
 *   configure in flight (M1–M9, M13).
 * - **No client, no access.** `db` and the operations throw once the client is
 *   gone, and an operation keeps what is held with the handle it captured —
 *   M12 is the security row: read back after the await, a racing `close()`
 *   leaves a probe failure rendering with nothing held and the bare password
 *   shown (M10–M12).
 * - **`silent` silences everything, and the CLI uses it** (M14–M19).
 * - **No default target (#443).** `initDatabase` refuses an unset or blank
 *   `DATABASE_URL` before any client is built (M20).
 *
 * The rows that strand the instance in `configuring` (M7, M8) would make a
 * `close()` after a failed `connect()` wait forever; the suites close only a
 * configured client for that reason.
 *
 * ```bash
 * deno run -A packages/drizzle/tests/mutations/lifecycle_427.ts
 * ```
 *
 * @module @lockness/drizzle/tests/mutations/lifecycle_427
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const MOD = new URL('../../mod.ts', import.meta.url)
const CLI = new URL('../../cli_commands.ts', import.meta.url)
const SUITES = [
    new URL('../lifecycle.test.ts', import.meta.url).pathname,
    new URL('../cli_commands.test.ts', import.meta.url).pathname,
    new URL('../database.test.ts', import.meta.url).pathname,
]

/** The state guard, the first statement of `connect()`. */
const GUARD =
    "if (this.#state.kind !== 'idle') throw new Error(ALREADY_CONFIGURED)"

/** The `configuring` reservation, with the settler it hands out. */
const RESERVATION = `let settle!: () => void
        this.#state = {
            kind: 'configuring',
            settled: new Promise<void>((resolve) => {
                settle = resolve
            }),
        }
`

/** `initDatabase`'s refusal of an unset or blank `DATABASE_URL` (#443). */
const REFUSAL = `    if (url === undefined || url.trim() === '') {
        const state = url === undefined ? 'not set' : 'empty'
        throw new Error(
            \`Database not configured: DATABASE_URL is \${state}, so no \` +
                'database is named; the db:* commands never fall back to a ' +
                'default database',
        )
    }
`

/** The assignment that makes a built client the configured one. */
const CONFIGURED =
    "this.#state = { kind: 'configured', client: { handle, held } }"

const MUTATIONS: Mutation[] = [
    // ---- One client at a time ---------------------------------------------
    {
        label:
            'M1 the state guard removed — a second connect() orphans the first',
        file: MOD,
        edits: [[GUARD, '']],
        killedBy: '#427 T1',
    },
    {
        label: 'M2 the guard returns success: false instead of throwing',
        file: MOD,
        edits: [[
            GUARD,
            "if (this.#state.kind !== 'idle') return failed(ALREADY_CONFIGURED, options.silent)",
        ]],
        killedBy: '#427 T1',
    },
    {
        label: 'M3 the guard closes the first client and reconfigures',
        file: MOD,
        edits: [[GUARD, "if (this.#state.kind !== 'idle') await this.close()"]],
        killedBy: '#427 T1',
    },
    {
        label: 'M4 the guard runs after the factory — a second client is built',
        file: MOD,
        edits: [
            [GUARD, "const wasIdle = this.#state.kind === 'idle'"],
            [
                'if (!options.silent) {\n            console.log(',
                'if (!wasIdle) throw new Error(ALREADY_CONFIGURED)\n        if (!options.silent) {\n            console.log(',
            ],
        ],
        killedBy: '#427 T1',
    },
    {
        label:
            'M5 the guard runs after the DSN check — a refused second DSN is logged',
        file: MOD,
        edits: [
            [GUARD, ''],
            [
                'const held: Held = { dsn: url, secrets: inspection.secrets }',
                `${GUARD}\n        const held: Held = { dsn: url, secrets: inspection.secrets }`,
            ],
        ],
        killedBy: '#427 T2',
    },
    {
        label:
            'M6 no configuring reservation — two racing connects build two clients',
        file: MOD,
        edits: [[
            RESERVATION,
            'let settle!: () => void\n        void new Promise<void>((resolve) => {\n            settle = resolve\n        })\n',
        ]],
        killedBy: '#427 T3',
    },
    {
        label:
            'M7 the reservation is not released on a factory failure — no retry',
        file: MOD,
        edits: [[
            'this.#state = IDLE\n            return failed(',
            'return failed(',
        ]],
        killedBy: '#427 T4',
    },
    {
        label:
            'M8 the reservation taken before the DSN check — a refusal strands it',
        file: MOD,
        edits: [
            [RESERVATION, ''],
            [
                'const inspection = inspectDsn(url)',
                `${RESERVATION}        const inspection = inspectDsn(url)`,
            ],
        ],
        killedBy: '#427 T5',
    },
    {
        label: 'M9 close() does not reset the state — no reconnect after close',
        file: MOD,
        edits: [[
            'this.#state = IDLE\n        await state.client.handle.close()',
            'await state.client.handle.close()',
        ]],
        killedBy: '#427 T6',
    },
    {
        label: 'M13 close() returns at once while a configure is in flight',
        file: MOD,
        edits: [[
            "while (this.#state.kind === 'configuring') {\n            await this.#state.settled\n        }\n",
            '',
        ]],
        killedBy: '#427 T9',
    },
    // ---- No client, no access ---------------------------------------------
    {
        label:
            'M10 db is a stale field — undefined before connect, old after close',
        file: MOD,
        edits: [
            [
                '#state: Lifecycle = IDLE\n',
                '#state: Lifecycle = IDLE\n    #stale: unknown\n',
            ],
            [CONFIGURED, `${CONFIGURED}; this.#stale = handle.db`],
            [
                'return this.#client().handle.db as DialectDatabase<D>',
                'return this.#stale as DialectDatabase<D>',
            ],
        ],
        killedBy: '#427 T7',
    },
    {
        label: 'M11 the last client stays reachable after close()',
        file: MOD,
        edits: [
            [
                '#state: Lifecycle = IDLE\n',
                '#state: Lifecycle = IDLE\n    #last: Configured | undefined\n',
            ],
            [CONFIGURED, `${CONFIGURED}; this.#last = { handle, held }`],
            [
                "if (state.kind !== 'configured') throw new Error(NOT_CONNECTED)",
                "if (state.kind !== 'configured') {\n            if (this.#last) return this.#last\n            throw new Error(NOT_CONNECTED)\n        }",
            ],
        ],
        killedBy: '#427 T7',
    },
    {
        label:
            'M12 SECURITY — probe reads held from this after the await; close() empties it',
        file: MOD,
        edits: [[
            'throw new Error(renderFailure(error, held, probeWithheld))',
            "throw new Error(renderFailure(error, this.#state.kind === 'configured' ? this.#state.client.held : { dsn: '', secrets: [] }, probeWithheld))",
        ]],
        killedBy: '#427 T8',
    },
    // ---- silent, and the CLI ----------------------------------------------
    {
        label: 'M14 failed() ignores silent — the failure line always prints',
        file: MOD,
        edits: [[
            "if (!silent) console.error('❌ Database connection failed:', message)",
            "console.error('❌ Database connection failed:', message)",
        ]],
        killedBy: '#427 T10',
    },
    {
        label: 'M15 the success line ignores silent',
        file: MOD,
        edits: [[
            'if (!options.silent) {\n            console.log(',
            'if (true) {\n            console.log(',
        ]],
        killedBy: '#427 T10',
    },
    {
        label: 'M16 failed() inverts silent',
        file: MOD,
        edits: [[
            "if (!silent) console.error('❌ Database connection failed:', message)",
            "if (silent) console.error('❌ Database connection failed:', message)",
        ]],
        killedBy: '#427 T10',
    },
    {
        label:
            'M17 initDatabase is not silent — "Database configured" is claimed',
        file: CLI,
        edits: [[
            'await db.connect(url, { silent: true })',
            'await db.connect(url, {})',
        ]],
        killedBy: '#427 T11',
    },
    {
        label: 'M18 initDatabase probes — db:check makes two round trips',
        file: CLI,
        edits: [['    return db\n}', '    await db.probe()\n    return db\n}']],
        killedBy: '#427 T11',
    },
    {
        label:
            'M19 db:check logs its failure itself, then the Cli prints it again',
        file: CLI,
        // Re-anchored when #436 made the db:check message one line, with the
        // reason in the cause: the mutant still prints the reason itself
        // before throwing.
        edits: [[
            "} catch (error) {\n                throw new CommandFailedError(\n                    'Database connection failed.",
            "} catch (error) {\n                console.error(getErrorMessage(error))\n                throw new CommandFailedError(\n                    'Database connection failed.",
        ]],
        killedBy: '#427 T12',
    },

    // ---- No default target (#443) -----------------------------------------
    {
        label:
            'M20 initDatabase refusal deleted — db:seed and db:check reach a database nobody named',
        file: CLI,
        // `?? ''` keeps the mutant type-checking, so it dies in T1, not tsc.
        edits: [
            [REFUSAL, ''],
            [
                'await db.connect(url, { silent: true })',
                "await db.connect(url ?? '', { silent: true })",
            ],
        ],
        killedBy: '#443 T1',
    },
]

Deno.exit(
    await runBattery(
        '#427 mutation battery — the Database lifecycle, silent, and db:check',
        SUITES,
        MUTATIONS,
    ),
)
