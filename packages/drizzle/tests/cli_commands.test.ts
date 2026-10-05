/**
 * @fileoverview Hermetic tests for the Drizzle CLI commands (#180).
 *
 * The `db:*` commands are exercised through the injectable seams of
 * {@link registerDrizzleCommands} — a command-runner, a connection port, a
 * seeder-loader, and for `db:migrate` and `db:fresh` a config loader and a
 * maintenance opener — so no test opens a real database, spawns a real
 * process, or hits the network. The four shell-out commands are validated by
 * asserting the **constructed `drizzle-kit` argv**, never by executing it.
 * `db:fresh` (#435) and `db:migrate` (#442) spawn nothing: their tests run
 * with a runner that throws if called.
 *
 * @module @lockness/drizzle/tests/cli_commands
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { Cli } from '@lockness/cli'
import { CommandFailedError } from '@lockness/cli/command-failure'
import { container } from '@lockness/container'
import { Database } from '../mod.ts'
import {
    type CommandRunner,
    type CommandSpec,
    type DbConnection,
    type DrizzleCommandDeps,
    type MaintenanceSession,
    registerDrizzleCommands,
    type SeederLoader,
} from '../cli_commands.ts'
import type { MigrateOptions } from '../drivers.ts'
import type { MigrationSettings } from '../migration_settings.ts'
import { DRIZZLE_KIT_SPECIFIER } from '../generators/dialect_schema.ts'

// -----------------------------------------------------------------------------
// Test doubles
// -----------------------------------------------------------------------------

type Handler = (args: string[]) => void | Promise<void>

/** A CLI that records registrations and lets a test invoke one by name. */
class FakeCli {
    readonly commands = new Map<string, Handler>()

    register(name: string, handler: Handler): void {
        this.commands.set(name, handler)
    }

    run(name: string, ...args: string[]): Promise<void> {
        const handler = this.commands.get(name)
        if (!handler) throw new Error(`command not registered: ${name}`)
        return Promise.resolve(handler(args))
    }
}

/** A command-runner that records every spec and returns canned exit codes. */
function fakeRunner(codes: number[] = []) {
    const calls: CommandSpec[] = []
    let i = 0
    const run: CommandRunner = (spec) => {
        calls.push(spec)
        return Promise.resolve(codes[i++] ?? 0)
    }
    return { calls, run }
}

/** A connection port whose probe/close are observable. */
function fakeConnection(opts: { probeError?: Error } = {}) {
    const events: string[] = []
    const conn: DbConnection = {
        probe: () => {
            events.push('probe')
            return opts.probeError
                ? Promise.reject(opts.probeError)
                : Promise.resolve()
        },
        close: () => {
            events.push('close')
            return Promise.resolve()
        },
    }
    return { events, connect: () => Promise.resolve(conn) }
}

/** Silence the commands' console chatter for the duration of a test. */
function muteConsole(): () => void {
    const { log, error } = console
    console.log = () => {}
    console.error = () => {}
    return () => {
        console.log = log
        console.error = error
    }
}

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------

Deno.test('registerDrizzleCommands - registers the full db:* / make:* set', () => {
    const cli = new FakeCli()
    registerDrizzleCommands(cli) // defaults; no handler is invoked → no real I/O
    assertEquals([...cli.commands.keys()].sort(), [
        'db:check',
        'db:fresh',
        'db:generate',
        'db:migrate',
        'db:push',
        'db:seed',
        'db:status',
        'db:studio',
        'make:factory',
        'make:model',
        'make:seeder',
    ])
})

// -----------------------------------------------------------------------------
// Shell-out commands — assert the constructed drizzle-kit argv (never executed)
// -----------------------------------------------------------------------------

const shellCommands: ReadonlyArray<readonly [string, string]> = [
    ['db:generate', 'generate'],
    ['db:push', 'push'],
    ['db:studio', 'studio'],
    ['db:status', 'check'],
]

// -----------------------------------------------------------------------------
// Exit contract (#428) — a failed drizzle-kit run is a thrown CommandFailedError
// -----------------------------------------------------------------------------

for (const [command, subcommand] of shellCommands) {
    Deno.test(`${command} - rejects with CommandFailedError when drizzle-kit ${subcommand} exits 1`, async () => {
        const restore = muteConsole()
        try {
            const cli = new FakeCli()
            const { run } = fakeRunner([1])
            registerDrizzleCommands(cli, { runCommand: run })

            const error = await assertRejects(
                () => cli.run(command),
                CommandFailedError,
            )
            assertStringIncludes(
                error.message,
                `(drizzle-kit ${subcommand} exited 1)`,
            )
            assertEquals(error.exitCode, 1)
        } finally {
            restore()
        }
    })

    Deno.test(`${command} - resolves when drizzle-kit ${subcommand} exits 0`, async () => {
        const restore = muteConsole()
        try {
            const cli = new FakeCli()
            const { run } = fakeRunner([0])
            registerDrizzleCommands(cli, { runCommand: run })

            await cli.run(command)
        } finally {
            restore()
        }
    })
}

Deno.test('db:status - only claims migration-history consistency, never drift', async () => {
    const lines: string[] = []
    const { log } = console
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        const cli = new FakeCli()
        registerDrizzleCommands(cli, { runCommand: fakeRunner([0]).run })
        await cli.run('db:status')

        const failing = new FakeCli()
        registerDrizzleCommands(failing, { runCommand: fakeRunner([2]).run })
        const error = await assertRejects(
            () => failing.run('db:status'),
            CommandFailedError,
        )
        assertEquals(
            error.message,
            'Migration history check failed (drizzle-kit check exited 2)',
        )
    } finally {
        console.log = log
    }
    assertStringIncludes(lines.join('\n'), 'Migration history is consistent')
    assert(!/up to date|schema changes/i.test(lines.join('\n')))
})

Deno.test('wiring - a real Cli exits 1 on a failed db:migrate, printing one error line', async () => {
    await withMigrations(async (folder) => {
        const errors: unknown[][] = []
        const { log, error } = console
        console.log = () => {}
        console.error = (...args: unknown[]) => void errors.push(args)
        try {
            const cli = new Cli()
            registerDrizzleCommands(
                cli,
                migrateDeps({
                    dialect: 'sqlite',
                    out: folder,
                    dbCredentials: { url: 'file:./migrate-test.db' },
                }, { failMigrate: true }).deps,
            )

            const status = await cli.dispatch(['db:migrate'])

            assertEquals(status, 1)
            assertEquals(errors, [[
                '❌ Failed to apply migrations: migrate failed',
            ]])
        } finally {
            console.log = log
            console.error = error
        }
    })
})

for (const [command, subcommand] of shellCommands) {
    Deno.test(`${command} - constructs the drizzle-kit \`${subcommand}\` argv`, async () => {
        const restore = muteConsole()
        try {
            const cli = new FakeCli()
            const { calls, run } = fakeRunner()
            registerDrizzleCommands(cli, { runCommand: run })

            await cli.run(command)

            assertEquals(calls.length, 1)
            assertEquals(calls[0], {
                cmd: 'deno',
                args: ['run', '-A', 'npm:drizzle-kit@0.31.10', subcommand],
            })
        } finally {
            restore()
        }
    })
}

Deno.test('#437 every shell-out runs an exactly pinned drizzle-kit', async () => {
    const restore = muteConsole()
    try {
        for (const [command] of shellCommands) {
            const cli = new FakeCli()
            const { calls, run } = fakeRunner()
            registerDrizzleCommands(cli, { runCommand: run })
            await cli.run(command)

            const specifier = calls[0].args.find((a) =>
                a.startsWith('npm:drizzle-kit')
            )
            assert(
                specifier !== undefined &&
                    /^npm:drizzle-kit@\d+\.\d+\.\d+$/.test(specifier),
                `${command} runs an unpinned drizzle-kit: ${specifier}`,
            )
            assertEquals(specifier, DRIZZLE_KIT_SPECIFIER)
        }
    } finally {
        restore()
    }
})

// -----------------------------------------------------------------------------
// db:check — connection port only, always closes
// -----------------------------------------------------------------------------

Deno.test('db:check - probes through the connection port then closes', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        registerDrizzleCommands(cli, { connect })

        await cli.run('db:check')

        assertEquals(events, ['probe', 'close'])
    } finally {
        restore()
    }
})

Deno.test('db:check - a failed probe rejects with one message, and still closes', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection({
            probeError: new Error('unreachable'),
        })
        registerDrizzleCommands(cli, { connect })

        const error = await assertRejects(
            () => cli.run('db:check'),
            CommandFailedError,
        )

        assertEquals(
            error.message,
            'Database connection failed: unreachable\n' +
                '💡 Check your DATABASE_URL in .env',
        )
        assertEquals(events, ['probe', 'close'])
    } finally {
        restore()
    }
})

Deno.test('db:check - a connect() that rejects is a CommandFailedError', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        registerDrizzleCommands(cli, {
            connect: () => Promise.reject(new Error('no client')),
        })

        const error = await assertRejects(
            () => cli.run('db:check'),
            CommandFailedError,
        )
        assertStringIncludes(error.message, 'no client')
    } finally {
        restore()
    }
})

// -----------------------------------------------------------------------------
// db:check — through the real connection port (#427)
// -----------------------------------------------------------------------------

/**
 * Run `fn` against a fresh container `Database` singleton whose postgres
 * driver is `factory`, with `DATABASE_URL` set — the default connection port
 * (`initDatabase`) with only the client faked. Resets the singleton and the
 * variable before and after.
 */
async function withDefaultPort(
    factory: Parameters<Database['setDriverFactory']>[1],
    fn: () => Promise<void>,
): Promise<void> {
    const prevUrl = Deno.env.get('DATABASE_URL')
    Deno.env.set('DATABASE_URL', 'postgres://u:p@h:5432/app')
    container.delete(Database)
    try {
        container.get(Database).setDriverFactory('postgres', factory)
        await fn()
    } finally {
        // Only a configured client is closed: a mutant that strands the
        // instance in `configuring` would make `close()` wait forever.
        const db = container.get(Database)
        if (db.isConnected()) await db.close()
        container.delete(Database)
        if (prevUrl === undefined) Deno.env.delete('DATABASE_URL')
        else Deno.env.set('DATABASE_URL', prevUrl)
    }
}

Deno.test('#427 T11 db:check makes exactly one round trip and never claims "configured"', async () => {
    const counts = { built: 0, probes: 0, closes: 0 }
    await withDefaultPort(() => {
        counts.built++
        return Promise.resolve({
            db: {},
            probe: () => {
                counts.probes++
                return Promise.resolve()
            },
            close: () => {
                counts.closes++
                return Promise.resolve()
            },
        })
    }, async () => {
        const cli = new FakeCli()
        registerDrizzleCommands(cli, {})

        const { lines, error } = await capture(() => cli.run('db:check'))

        assertEquals(error, undefined)
        assertEquals(counts, { built: 1, probes: 1, closes: 1 })
        assertEquals(lines, [
            '🔍 Checking database connection...',
            '✅ Database connection successful',
        ])
    })
})

Deno.test('#427 T12 a real Cli prints a failed db:check once and exits 1', async () => {
    await withDefaultPort(() => {
        throw new Error('Cannot find module postgres')
    }, async () => {
        const errors: unknown[][] = []
        const { log, error } = console
        console.log = () => {}
        console.error = (...args: unknown[]) => void errors.push(args)
        try {
            const cli = new Cli()
            registerDrizzleCommands(cli, {})

            const status = await cli.dispatch(['db:check'])

            assertEquals(status, 1)
            assertEquals(errors, [[
                '❌ Database connection failed: Database not configured: ' +
                "The 'postgres' driver could not be configured (Error); its " +
                'message is withheld because it may contain the DSN\n' +
                '💡 Check your DATABASE_URL in .env',
            ]])
        } finally {
            console.log = log
            console.error = error
        }
    })
})

// -----------------------------------------------------------------------------
// db:seed — seeder-loader port only, no dynamic import
// -----------------------------------------------------------------------------

Deno.test('db:seed - loads and runs DatabaseSeeder through the loader port', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        const loaded: string[] = []
        const ran: string[] = []
        class DatabaseSeeder {
            run(): Promise<void> {
                ran.push('database')
                return Promise.resolve()
            }
        }
        const loadSeeder: SeederLoader = (path) => {
            loaded.push(path)
            return Promise.resolve({ DatabaseSeeder })
        }
        registerDrizzleCommands(cli, { connect, loadSeeder })

        await cli.run('db:seed')

        assertEquals(loaded, ['./database/seeders/database_seeder.ts'])
        assertEquals(ran, ['database'])
        assertEquals(events, ['close']) // connection opened and closed, never probed
    } finally {
        restore()
    }
})

Deno.test('db:seed <name> - loads the named seeder through the loader port', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { connect } = fakeConnection()
        const loaded: string[] = []
        const ran: string[] = []
        class UserSeeder {
            run(): Promise<void> {
                ran.push('user')
                return Promise.resolve()
            }
        }
        const loadSeeder: SeederLoader = (path) => {
            loaded.push(path)
            return Promise.resolve({ UserSeeder })
        }
        registerDrizzleCommands(cli, { connect, loadSeeder })

        await cli.run('db:seed', 'User')

        assertEquals(loaded, ['./database/seeders/user_seeder.ts'])
        assertEquals(ran, ['user'])
    } finally {
        restore()
    }
})

Deno.test('db:seed - rejects, and closes the connection, when the module has no seeder', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        // A module with no DatabaseSeeder export: nothing runs, the command
        // fails, and the connection opened by handleSeed is still closed.
        const loadSeeder: SeederLoader = () => Promise.resolve({})
        registerDrizzleCommands(cli, { connect, loadSeeder })

        const error = await assertRejects(
            () => cli.run('db:seed'),
            CommandFailedError,
        )

        assertStringIncludes(error.message, 'DatabaseSeeder class not found')
        assertEquals(events, ['close'])
    } finally {
        restore()
    }
})

Deno.test('db:seed - the seeder’s own error passes through unwrapped, and the connection closes', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        const boom = new Error('boom')
        class DatabaseSeeder {
            run(): Promise<void> {
                return Promise.reject(boom)
            }
        }
        const loadSeeder: SeederLoader = () =>
            Promise.resolve({ DatabaseSeeder })
        registerDrizzleCommands(cli, { connect, loadSeeder })

        // User code failed: its own error (and stack) reaches the CLI, which
        // prints it as an unexpected failure.
        const error = await assertRejects(() => cli.run('db:seed'))

        assertEquals(error, boom)
        assertEquals(events, ['close'])
    } finally {
        restore()
    }
})

Deno.test('db:seed <name> - rejects when the module exports no seeder class', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        const loadSeeder: SeederLoader = () =>
            Promise.resolve({ notASeeder: 42 })
        registerDrizzleCommands(cli, { connect, loadSeeder })

        const error = await assertRejects(
            () => cli.run('db:seed', 'User'),
            CommandFailedError,
        )

        assertStringIncludes(
            error.message,
            'No valid seeder found in ./database/seeders/user_seeder.ts',
        )
        assertEquals(events, ['close'])
    } finally {
        restore()
    }
})

Deno.test('db:seed - a missing database_seeder.ts is a CommandFailedError with the fix', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { connect } = fakeConnection()
        const loadSeeder: SeederLoader = () =>
            Promise.reject(new Error('Module not found "file:///x"'))
        registerDrizzleCommands(cli, { connect, loadSeeder })

        const error = await assertRejects(
            () => cli.run('db:seed'),
            CommandFailedError,
        )

        assertStringIncludes(error.message, 'No database_seeder.ts found')
        assertStringIncludes(error.message, 'make:seeder Database')
    } finally {
        restore()
    }
})

Deno.test('#478 db:seed - a seeder load failure is rendered, never embedded raw', async () => {
    // A fake marker assembled at run time, so the secret scan never sees it.
    const head = 'FA' + 'KE'
    const tail = 'MA' + 'RK'
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { connect } = fakeConnection()
        const loadSeeder: SeederLoader = () =>
            Promise.reject(
                new Error(
                    `fetch https://api.example.com/?token=${head}${tail}`,
                ),
            )
        registerDrizzleCommands(cli, { connect, loadSeeder })

        const error = await assertRejects(
            () => cli.run('db:seed', 'User'),
            CommandFailedError,
        )

        assertStringIncludes(error.message, 'Failed to load seeder')
        assertStringIncludes(error.message, 'token=***')
        assert(!error.message.includes(head), error.message)
        assert(!error.message.includes(tail), error.message)
    } finally {
        restore()
    }
})

Deno.test('db:seed <name> - a module that fails to load is a CommandFailedError keeping the cause', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        const syntax = new SyntaxError('Unexpected token')
        const loadSeeder: SeederLoader = () => Promise.reject(syntax)
        registerDrizzleCommands(cli, { connect, loadSeeder })

        const error = await assertRejects(
            () => cli.run('db:seed', 'User'),
            CommandFailedError,
        )

        assertStringIncludes(error.message, 'Unexpected token')
        assertEquals(error.cause, syntax)
        assertEquals(events, ['close'])
    } finally {
        restore()
    }
})

// -----------------------------------------------------------------------------
// db:seed — production write-guard (#258)
// -----------------------------------------------------------------------------

/**
 * Run `fn` with `APP_ENV` forced to `value`, restoring the prior value (or
 * absence) afterwards so environment mutation never leaks between tests.
 */
async function withAppEnv(
    value: string | undefined,
    fn: () => Promise<void>,
): Promise<void> {
    const prev = Deno.env.get('APP_ENV')
    // Not a signal since #504, but a stray DENO_ENV trips the tripwire inside
    // assertNotProduction, so it is cleared for the duration.
    const prevDeno = Deno.env.get('DENO_ENV')
    Deno.env.delete('DENO_ENV')
    if (value === undefined) Deno.env.delete('APP_ENV')
    else Deno.env.set('APP_ENV', value)
    try {
        await fn()
    } finally {
        if (prev === undefined) Deno.env.delete('APP_ENV')
        else Deno.env.set('APP_ENV', prev)
        if (prevDeno === undefined) Deno.env.delete('DENO_ENV')
        else Deno.env.set('DENO_ENV', prevDeno)
    }
}

Deno.test('db:seed - refuses to run under APP_ENV=production without --allow-production', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        let loaded = false
        const loadSeeder: SeederLoader = () => {
            loaded = true
            return Promise.resolve({})
        }
        registerDrizzleCommands(cli, { connect, loadSeeder })

        await withAppEnv('production', async () => {
            await assertRejects(
                () => cli.run('db:seed'),
                CommandFailedError,
                'production',
            )
        })

        // The guard fires before any connection is opened or seeder loaded.
        assertEquals(events, [])
        assertEquals(loaded, false)
    } finally {
        restore()
    }
})

Deno.test('db:seed --allow-production - runs under production with the override flag', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        const ran: string[] = []
        class DatabaseSeeder {
            run(): Promise<void> {
                ran.push('database')
                return Promise.resolve()
            }
        }
        const loadSeeder: SeederLoader = () =>
            Promise.resolve({ DatabaseSeeder })
        registerDrizzleCommands(cli, { connect, loadSeeder })

        await withAppEnv('production', async () => {
            await cli.run('db:seed', '--allow-production')
        })

        // Override authorises the run: seeder executed, connection closed.
        assertEquals(ran, ['database'])
        assertEquals(events, ['close'])
    } finally {
        restore()
    }
})

// -----------------------------------------------------------------------------
// db:seed — the real connection port refuses a failed connect() (#420)
// -----------------------------------------------------------------------------

Deno.test('db:seed - stops before loading any seeder when connect() fails', async () => {
    // The default port (`initDatabase`) against the container's Database, with
    // a driver factory that cannot build its client. Since #420 `connect()`
    // makes no round trip, so a `success: false` is the only signal left that
    // the configuration is broken — ignoring it would run every seeder against
    // a client that was never built.
    const restore = muteConsole()
    const prevUrl = Deno.env.get('DATABASE_URL')
    Deno.env.set('DATABASE_URL', 'postgres://u:p@h:5432/app')
    container.delete(Database)
    try {
        container.get(Database).setDriverFactory('postgres', () => {
            throw new Error('Cannot find module postgres')
        })
        const cli = new FakeCli()
        let loaded = false
        const loadSeeder: SeederLoader = () => {
            loaded = true
            return Promise.resolve({})
        }
        registerDrizzleCommands(cli, { loadSeeder })

        await withAppEnv(undefined, async () => {
            await assertRejects(
                () => cli.run('db:seed'),
                CommandFailedError,
                'postgres',
            )
        })

        assertEquals(
            loaded,
            false,
            'a seeder was loaded after connect() failed',
        )
    } finally {
        container.delete(Database)
        if (prevUrl === undefined) Deno.env.delete('DATABASE_URL')
        else Deno.env.set('DATABASE_URL', prevUrl)
        restore()
    }
})

// -----------------------------------------------------------------------------
// db:fresh (#435) — guard, settings, open, reset, migrate, close
// -----------------------------------------------------------------------------

/** A migrations folder with a one-entry journal, removed after `fn`. */
async function withMigrations(
    fn: (folder: string) => Promise<void>,
): Promise<void> {
    const folder = await Deno.makeTempDir()
    try {
        await Deno.mkdir(`${folder}/meta`)
        await Deno.writeTextFile(
            `${folder}/meta/_journal.json`,
            JSON.stringify({
                entries: [{ tag: '0000_init', when: 1, breakpoints: true }],
            }),
        )
        await Deno.writeTextFile(
            `${folder}/0000_init.sql`,
            'CREATE TABLE "users" ("id" integer);',
        )
        await fn(folder)
    } finally {
        await Deno.remove(folder, { recursive: true })
    }
}

/** Which step of a fake maintenance session fails. */
type FreshStep = 'query' | 'execute' | 'migrate'

/**
 * The `db:fresh` seams around a fake session that records every call — a
 * sqlite one unless `config` overrides `drizzle.config.ts`, and `rows`
 * answers every catalogue query. `runCommand` throws: `db:fresh` must spawn
 * nothing.
 */
function freshDeps(
    folder: string,
    failAt?: FreshStep,
    overrides: {
        readonly config?: Record<string, unknown>
        readonly rows?: Record<string, unknown>[]
    } = {},
) {
    const calls: string[] = []
    const opened: MigrationSettings[] = []
    const step = <T>(name: FreshStep, value: T): Promise<T> => {
        calls.push(name)
        return name === failAt
            ? Promise.reject(new Error(`${name} failed`))
            : Promise.resolve(value)
    }
    const session: MaintenanceSession = {
        query: () =>
            step('query', overrides.rows ?? [{ type: 'table', name: 'users' }]),
        execute: () => step('execute', undefined),
        migrate: (options) => {
            calls.push(
                `migrate:${options.folder}:${options.table}:${
                    options.schema ?? '-'
                }`,
            )
            return step('migrate', undefined)
        },
        close: () => {
            calls.push('close')
            return Promise.resolve()
        },
    }
    const runCommand: CommandRunner = () => {
        throw new Error('db:fresh spawned a process')
    }
    const deps = {
        runCommand,
        loadMigrationConfig: () =>
            Promise.resolve(
                overrides.config ?? {
                    dialect: 'sqlite',
                    out: folder,
                    dbCredentials: { url: 'file:./fresh-test.db' },
                },
            ),
        openMaintenance: (settings: MigrationSettings) => {
            calls.push('open')
            opened.push(settings)
            return Promise.resolve(session)
        },
    }
    return { calls, deps, opened }
}

/**
 * Run `fn` with `prompt`, `confirm` and `alert` replaced by throwing fakes:
 * `db:fresh` must never wait on a prompt, with or without a TTY.
 */
async function withoutPrompts(fn: () => Promise<void>): Promise<void> {
    const saved = {
        prompt: globalThis.prompt,
        confirm: globalThis.confirm,
        alert: globalThis.alert,
    }
    const refuse = () => {
        throw new Error('db:fresh called a prompt API')
    }
    globalThis.prompt = refuse
    globalThis.confirm = refuse
    globalThis.alert = refuse
    try {
        await fn()
    } finally {
        Object.assign(globalThis, saved)
    }
}

/** Capture every console line of `fn`, and what it rejected with. */
async function capture(fn: () => Promise<void>): Promise<{
    readonly lines: string[]
    readonly error: unknown
}> {
    const lines: string[] = []
    const { log, error: err } = console
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
    console.error = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        await fn()
        return { lines, error: undefined }
    } catch (error) {
        return { lines, error }
    } finally {
        console.log = log
        console.error = err
    }
}

Deno.test('db:fresh - resets then migrates on one session, spawning nothing and prompting nothing', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = freshDeps(folder)
        const cli = new FakeCli()
        registerDrizzleCommands(cli, deps)

        const { lines, error } = await capture(() =>
            withoutPrompts(() =>
                withAppEnv(undefined, () => cli.run('db:fresh'))
            )
        )

        assertEquals(error, undefined)
        assertEquals(calls, [
            'open',
            'query',
            'execute',
            `migrate:${folder}:__drizzle_migrations:-`,
            'migrate',
            'close',
        ])
        const out = lines.join('\n')
        assertStringIncludes(out, 'sqlite: every table and view')
        assertStringIncludes(out, 'Database refreshed successfully')
        assertEquals(
            out.includes('fresh-test.db'),
            false,
            'the DSN was printed',
        )
    })
})

Deno.test('db:fresh - hands migrations.table and migrations.schema to the postgres migrator', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = freshDeps(folder, undefined, {
            config: {
                dialect: 'postgresql',
                out: folder,
                dbCredentials: { url: 'postgres://app@localhost/app' },
                migrations: { table: 'history', schema: 'meta' },
            },
            rows: [],
        })
        const cli = new FakeCli()
        registerDrizzleCommands(cli, deps)

        const { error } = await capture(() =>
            withAppEnv(undefined, () => cli.run('db:fresh'))
        )

        assertEquals(error, undefined)
        assertEquals(
            calls.filter((c) => c.startsWith('migrate:')),
            [`migrate:${folder}:history:meta`],
        )
    })
})

Deno.test('db:fresh - opens the connection with the dialect and url of drizzle.config.ts', async () => {
    await withMigrations(async (folder) => {
        const { deps, opened } = freshDeps(folder)
        const cli = new FakeCli()
        registerDrizzleCommands(cli, deps)

        await capture(() => withAppEnv(undefined, () => cli.run('db:fresh')))

        assertEquals(opened.length, 1)
        assertEquals(opened[0].dialect, 'sqlite')
        assertEquals(opened[0].url, 'file:./fresh-test.db')
        assertEquals(opened[0].migrations, 1)
    })
})

for (const failAt of ['query', 'execute', 'migrate'] as const) {
    Deno.test(`db:fresh - a failed ${failAt} is a CommandFailedError, prints no "refreshed" line, and closes`, async () => {
        await withMigrations(async (folder) => {
            const { calls, deps } = freshDeps(folder, failAt)
            const cli = new FakeCli()
            registerDrizzleCommands(cli, deps)

            const { lines, error } = await capture(() =>
                withAppEnv(undefined, () => cli.run('db:fresh'))
            )

            assert(error instanceof CommandFailedError, String(error))
            assertStringIncludes(error.message, `${failAt} failed`)
            assertEquals(lines.join('\n').includes('refreshed'), false)
            assertEquals(calls.at(-1), 'close', 'the session was not closed')
        })
    })
}

Deno.test('db:fresh - a failed reset never runs migrate', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = freshDeps(folder, 'execute')
        const cli = new FakeCli()
        registerDrizzleCommands(cli, deps)

        const { error } = await capture(() =>
            withAppEnv(undefined, () => cli.run('db:fresh'))
        )

        assert(error instanceof CommandFailedError)
        assertStringIncludes(error.message, 'migrations were not run')
        assertEquals(calls.some((c) => c.startsWith('migrate')), false)
    })
})

Deno.test('db:fresh - a connection that cannot be opened is a CommandFailedError', async () => {
    await withMigrations(async (folder) => {
        const { deps } = freshDeps(folder)
        const cli = new FakeCli()
        registerDrizzleCommands(cli, {
            ...deps,
            openMaintenance: () =>
                Promise.reject(new Error('Database not configured')),
        })

        const { lines, error } = await capture(() =>
            withAppEnv(undefined, () => cli.run('db:fresh'))
        )

        assert(error instanceof CommandFailedError, String(error))
        assertStringIncludes(error.message, 'Database not configured')
        assertEquals(lines.join('\n').includes('refreshed'), false)
    })
})

Deno.test('db:fresh - R2 and R3 refuse before the connection is opened', async () => {
    await withMigrations(async (folder) => {
        const cases: Array<[string, () => Promise<unknown>]> = [
            ['R2 import', () => Promise.reject(new Error('no such file'))],
            ['R2 dbCredentials', () =>
                Promise.resolve({
                    dialect: 'sqlite',
                    out: folder,
                    dbCredentials: { url: 'file:x', authToken: 't' },
                })],
            // #449 — every dbCredentials fault refuses before any connection.
            ...([
                ['R2 dbCredentials missing', undefined],
                ['R2 dbCredentials not an object', 'file:x'],
                ['R2 url missing', {}],
                ['R2 url not a string', { url: 42 }],
                ['R2 url empty', { url: '' }],
                ['R2 url blank', { url: ' \t' }],
                // #456 — a url that names no database.
                ['R2 url names no database', {
                    url: 'postgres://localhost:5432/',
                }],
            ] as const).map(([label, dbCredentials]) =>
                [label, () =>
                    Promise.resolve({
                        dialect: 'postgresql',
                        out: folder,
                        dbCredentials,
                    })] as [string, () => Promise<unknown>]
            ),
            ['R3 journal', () =>
                Promise.resolve({
                    dialect: 'sqlite',
                    out: `${folder}/absent`,
                    dbCredentials: { url: 'file:x' },
                })],
        ]
        for (const [label, loadMigrationConfig] of cases) {
            const { calls, deps } = freshDeps(folder)
            const cli = new FakeCli()
            registerDrizzleCommands(cli, { ...deps, loadMigrationConfig })

            const { lines, error } = await capture(() =>
                withAppEnv(undefined, () => cli.run('db:fresh'))
            )

            assert(error instanceof CommandFailedError, label)
            assert(error.message.startsWith('db:fresh refused: '), label)
            assert(error.message.endsWith('. Nothing was dropped.'), label)
            assertEquals(error.message.includes('drizzle-kit'), false, label)
            assertEquals(calls, [], `${label}: the connection was opened`)
            assertEquals(lines.join('\n').includes('refreshed'), false, label)
        }
    })
})

Deno.test('db:fresh - an empty dbCredentials.url never reaches a driver (#449)', async () => {
    await withMigrations(async (folder) => {
        container.delete(Database)
        try {
            const factoryCalls: string[] = []
            for (const dialect of ['postgres', 'mysql', 'sqlite'] as const) {
                container.get(Database).setDriverFactory(dialect, () => {
                    factoryCalls.push(dialect)
                    return Promise.reject(new Error('a driver was created'))
                })
            }
            for (
                const [kitDialect, url] of [
                    ['postgresql', ''],
                    ['mysql', '  '],
                    ['sqlite', '\n'],
                ]
            ) {
                const { deps } = freshDeps(folder)
                const cli = new FakeCli()
                registerDrizzleCommands(cli, {
                    runCommand: deps.runCommand,
                    loadMigrationConfig: () =>
                        Promise.resolve({
                            dialect: kitDialect,
                            out: folder,
                            dbCredentials: { url },
                        }),
                })

                const { lines, error } = await capture(() =>
                    withAppEnv(undefined, () => cli.run('db:fresh'))
                )

                assert(error instanceof CommandFailedError, String(error))
                assertStringIncludes(
                    error.message,
                    '`dbCredentials.url` is empty',
                )
                assertStringIncludes(error.message, 'Nothing was dropped.')
                assertEquals(lines.join('\n').includes('refreshed'), false)
            }
            assertEquals(factoryCalls, [], 'a driver connection was attempted')
            assertEquals(container.get(Database).isConnected(), false)
        } finally {
            container.delete(Database)
        }
    })
})

Deno.test('db:fresh - a dbCredentials.url that names no database never reaches a driver (#456)', async () => {
    // Assembled at runtime, so no scanner reads a credential into the source.
    const host = ['secret-host', 'db.example'].join('.')
    await withMigrations(async (folder) => {
        container.delete(Database)
        try {
            const factoryCalls: string[] = []
            for (const dialect of ['postgres', 'mysql', 'sqlite'] as const) {
                container.get(Database).setDriverFactory(dialect, () => {
                    factoryCalls.push(dialect)
                    return Promise.reject(new Error('a driver was created'))
                })
            }
            for (
                const [kitDialect, url] of [
                    ['postgresql', 'postgres://'],
                    ['postgresql', 'postgres:///'],
                    ['postgresql', `postgres://app:pw@${host}:5432/`],
                    ['postgresql', `postgresql://${host}/?sslmode=require`],
                    ['mysql', `mysql://app:pw@${host}:3306/`],
                    ['sqlite', 'file:'],
                    ['turso', 'file://'],
                ]
            ) {
                const { deps } = freshDeps(folder)
                const cli = new FakeCli()
                registerDrizzleCommands(cli, {
                    runCommand: deps.runCommand,
                    loadMigrationConfig: () =>
                        Promise.resolve({
                            dialect: kitDialect,
                            out: folder,
                            dbCredentials: { url },
                        }),
                })

                const { lines, error } = await capture(() =>
                    withAppEnv(undefined, () => cli.run('db:fresh'))
                )

                assert(error instanceof CommandFailedError, url)
                assertStringIncludes(
                    error.message,
                    '`dbCredentials.url` names no database',
                    url,
                )
                assertStringIncludes(error.message, 'Nothing was dropped.', url)
                const output = `${lines.join('\n')}\n${error.message}`
                assertEquals(output.includes('secret-host'), false, url)
                assertEquals(output.includes('pw@'), false, url)
                assertEquals(output.includes('refreshed'), false, url)
            }
            assertEquals(factoryCalls, [], 'a driver connection was attempted')
            assertEquals(container.get(Database).isConnected(), false)
        } finally {
            container.delete(Database)
        }
    })
})

Deno.test('db:fresh - an import error quoting the DSN reaches neither the output nor the error chain', async () => {
    // Assembled at runtime, so no scanner reads a credential into the source.
    const dsn = ['postgres://app', 'not-a-real-secret@db.example/app'].join(':')
    await withMigrations(async (folder) => {
        const { calls, deps } = freshDeps(folder)
        const cli = new FakeCli()
        registerDrizzleCommands(cli, {
            ...deps,
            loadMigrationConfig: () =>
                Promise.reject(new Error(`connect to ${dsn} refused`)),
        })

        const { lines, error } = await capture(() =>
            withAppEnv(undefined, () => cli.run('db:fresh'))
        )

        assert(error instanceof CommandFailedError, String(error))
        assertStringIncludes(error.message, 'withheld')
        const chain: string[] = [...lines]
        for (let e: unknown = error; e instanceof Error; e = e.cause) {
            chain.push(e.message, e.stack ?? '')
        }
        assertEquals(
            chain.some((text) => text.includes('not-a-real-secret')),
            false,
            'the DSN was exposed',
        )
        assertEquals(calls, [], 'the connection was opened')
    })
})

Deno.test('db:fresh - a catalogue refusal happens before any drop, and closes', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = freshDeps(folder)
        const cli = new FakeCli()
        registerDrizzleCommands(cli, {
            ...deps,
            openMaintenance: async (settings) => {
                const session = await deps.openMaintenance(settings)
                return {
                    ...session,
                    query: () => Promise.resolve([{ type: 'table', name: 1 }]),
                }
            },
        })

        const { error } = await capture(() =>
            withAppEnv(undefined, () => cli.run('db:fresh'))
        )

        assert(error instanceof CommandFailedError, String(error))
        assertStringIncludes(error.message, 'Nothing was dropped')
        assertEquals(calls, ['open', 'close'])
    })
})

Deno.test('db:fresh - R4 refuses a driver without the maintenance capability', async () => {
    await withMigrations(async (folder) => {
        container.delete(Database)
        try {
            container.get(Database).setDriverFactory(
                'sqlite',
                () =>
                    Promise.resolve({
                        db: {},
                        close: () => Promise.resolve(),
                        probe: () => Promise.resolve(),
                    }),
            )
            const { deps } = freshDeps(folder)
            const cli = new FakeCli()
            registerDrizzleCommands(cli, {
                runCommand: deps.runCommand,
                loadMigrationConfig: deps.loadMigrationConfig,
            })

            const { error } = await capture(() =>
                withAppEnv(undefined, () => cli.run('db:fresh'))
            )

            assert(error instanceof CommandFailedError, String(error))
            assertStringIncludes(error.message, 'schema maintenance')
            assertStringIncludes(error.message, 'Nothing was dropped')
            assertEquals(error.message.includes('drizzle-kit'), false)
            assertEquals(container.get(Database).isConnected(), false)
        } finally {
            container.delete(Database)
        }
    })
})

Deno.test('db:fresh and db:seed share one production guard, with the same message shape', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = freshDeps(folder)
        const { events, connect } = fakeConnection()
        let loaded = false
        const cli = new FakeCli()
        registerDrizzleCommands(cli, {
            ...deps,
            loadMigrationConfig: () => {
                loaded = true
                return deps.loadMigrationConfig()
            },
            connect,
        })

        const messages: string[] = []
        await withAppEnv('production', async () => {
            for (const command of ['db:seed', 'db:fresh']) {
                const { error } = await capture(() => cli.run(command))
                assert(error instanceof CommandFailedError, command)
                messages.push(error.message.replaceAll(command, '<command>'))
            }
        })

        assertEquals(messages[0], messages[1])
        assertStringIncludes(messages[1], '--allow-production')
        assertEquals(loaded, false, 'db:fresh read its config in production')
        assertEquals(calls, [], 'db:fresh opened a connection in production')
        assertEquals(events, [])
    })
})

Deno.test('db:fresh --allow-production - runs under production with the override flag', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = freshDeps(folder)
        const cli = new FakeCli()
        registerDrizzleCommands(cli, deps)

        const { error } = await capture(() =>
            withAppEnv(
                'production',
                () => cli.run('db:fresh', '--allow-production'),
            )
        )

        assertEquals(error, undefined)
        assertEquals(calls.at(-1), 'close')
        assertEquals(calls.includes('migrate'), true)
    })
})

// -----------------------------------------------------------------------------
// db:migrate (#442) — in-process, through the db:fresh settings and opener
// -----------------------------------------------------------------------------

/** The drizzle-kit fallback clause a kit-only `db:migrate` refusal carries. */
const KIT_CLAUSE = '; drizzle-kit can still apply this configuration: ' +
    `deno run -A ${DRIZZLE_KIT_SPECIFIER} migrate`

/**
 * A value no output may quote, assembled at runtime so no scanner reads a
 * credential into the source.
 */
const SENTINEL = ['sentinel', 'not-a-real-secret'].join('-')

/**
 * The `db:migrate` seams around a fake session that records every call and
 * every set of migrate options. `runCommand` counts and throws: `db:migrate`
 * must spawn nothing.
 */
function migrateDeps(
    config: unknown,
    options: {
        readonly failMigrate?: boolean
        readonly openError?: unknown
    } = {},
) {
    const calls: string[] = []
    const opened: MigrationSettings[] = []
    const migrated: MigrateOptions[] = []
    const spawned: CommandSpec[] = []
    const session: MaintenanceSession = {
        query: () => {
            calls.push('query')
            return Promise.resolve([])
        },
        execute: () => {
            calls.push('execute')
            return Promise.resolve()
        },
        migrate: (migrate) => {
            calls.push('migrate')
            migrated.push(migrate)
            return options.failMigrate
                ? Promise.reject(new Error('migrate failed'))
                : Promise.resolve()
        },
        close: () => {
            calls.push('close')
            return Promise.resolve()
        },
    }
    const deps: Partial<DrizzleCommandDeps> = {
        runCommand: (spec) => {
            spawned.push(spec)
            throw new Error('db:migrate spawned a process')
        },
        loadMigrationConfig: () => Promise.resolve(config),
        openMaintenance: (settings) => {
            calls.push('open')
            opened.push(settings)
            return options.openError === undefined
                ? Promise.resolve(session)
                : Promise.reject(options.openError)
        },
    }
    return { calls, opened, migrated, spawned, deps }
}

/** Run one command on a fresh FakeCli, outside production; capture it. */
async function invoke(
    command: string,
    deps: Partial<DrizzleCommandDeps>,
    ...args: string[]
): Promise<{ readonly lines: string[]; readonly error: unknown }> {
    const cli = new FakeCli()
    registerDrizzleCommands(cli, deps)
    return await capture(() =>
        withAppEnv(undefined, () => cli.run(command, ...args))
    )
}

Deno.test('#442 db:migrate hands out, migrations.table and migrations.schema to the migrator', async () => {
    await withMigrations(async (folder) => {
        const cases: Array<[string, Record<string, unknown>, MigrateOptions]> =
            [
                ['postgres custom', {
                    dialect: 'postgresql',
                    out: folder,
                    dbCredentials: { url: 'postgres://app@localhost/app' },
                    migrations: { table: 'history', schema: 'meta' },
                }, { folder, table: 'history', schema: 'meta' }],
                ['postgres defaults', {
                    dialect: 'postgresql',
                    out: folder,
                    dbCredentials: { url: 'postgres://app@localhost/app' },
                }, {
                    folder,
                    table: '__drizzle_migrations',
                    schema: 'drizzle',
                }],
                ['mysql', {
                    dialect: 'mysql',
                    out: folder,
                    dbCredentials: { url: 'mysql://app@localhost/app' },
                    migrations: { table: 'history', schema: 'ignored' },
                }, { folder, table: 'history', schema: undefined }],
            ]
        for (const [label, config, expected] of cases) {
            const { calls, migrated, deps } = migrateDeps(config)

            const { lines, error } = await invoke('db:migrate', deps)

            assertEquals(error, undefined, label)
            assertEquals(migrated, [expected], label)
            assertEquals(calls, ['open', 'migrate', 'close'], label)
            assertEquals(lines, [
                '🚀 Running migrations...',
                '✅ Migrations applied successfully',
            ], label)
        }
    })
})

Deno.test('#442 db:migrate and db:fresh hand the migrator identical options', async () => {
    await withMigrations(async (folder) => {
        const { migrated, deps } = migrateDeps({
            dialect: 'postgresql',
            out: folder,
            dbCredentials: { url: 'postgres://app@localhost/app' },
            migrations: { table: 'history', schema: 'meta' },
        })

        assertEquals((await invoke('db:migrate', deps)).error, undefined)
        assertEquals((await invoke('db:fresh', deps)).error, undefined)

        assertEquals(migrated.length, 2)
        assertEquals(migrated[0], migrated[1])
    })
})

Deno.test('#442 db:migrate spawns nothing', async () => {
    await withMigrations(async (folder) => {
        const { spawned, deps } = migrateDeps({
            dialect: 'sqlite',
            out: folder,
            dbCredentials: { url: 'file:./migrate-test.db' },
        })

        const { error } = await invoke('db:migrate', deps)

        assertEquals(error, undefined)
        assertEquals(spawned, [])
    })
})

Deno.test('#442 db:migrate runs in production without --allow-production', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = migrateDeps({
            dialect: 'sqlite',
            out: folder,
            dbCredentials: { url: 'file:./migrate-test.db' },
        })
        const cli = new FakeCli()
        registerDrizzleCommands(cli, deps)

        const { error } = await capture(() =>
            withAppEnv('production', () => cli.run('db:migrate'))
        )

        assertEquals(error, undefined)
        assertEquals(calls, ['open', 'migrate', 'close'])
    })
})

/** One refused configuration, as `db:migrate` must report it. */
interface MigrateRefusal {
    readonly label: string
    readonly config: (folder: string) => Record<string, unknown>
    readonly holds: readonly string[]
    readonly kitOnly: boolean
}

/** A config for `dialect` with `dbCredentials` replaced. */
const credentials =
    (dialect: string, dbCredentials: unknown) =>
    (folder: string): Record<string, unknown> => ({
        dialect,
        out: folder,
        dbCredentials,
    })

/** A postgresql config with `extra` merged in. */
const postgresWith =
    (extra: Record<string, unknown>) =>
    (folder: string): Record<string, unknown> => ({
        dialect: 'postgresql',
        out: folder,
        dbCredentials: { url: 'postgres://app@localhost/app' },
        ...extra,
    })

/** Every row of the #442 table, and every #456 form. */
const MIGRATE_REFUSALS: readonly MigrateRefusal[] = [
    {
        label: 'postgresql host fields',
        config: credentials('postgresql', { host: 'h', password: 'p' }),
        holds: [
            'host fields (`host`, `password`)',
            '`postgresql://<user>:<password>@<host>:<port>/<database>`',
        ],
        kitOnly: false,
    },
    {
        label: 'mysql host fields',
        config: credentials('mysql', { host: 'h', database: 'd' }),
        holds: [
            'host fields (`host`, `database`)',
            '`mysql://<user>:<password>@<host>:<port>/<database>`',
        ],
        kitOnly: false,
    },
    {
        label: 'ssl mode',
        config: credentials('postgresql', {
            url: 'postgres://app@localhost/app',
            ssl: 'require',
        }),
        holds: ['`dbCredentials.ssl` is set', '`?sslmode=verify-full`'],
        kitOnly: false,
    },
    {
        label: 'ssl certificate',
        config: credentials('postgresql', {
            url: 'postgres://app@localhost/app',
            ssl: { ca: 'x' },
        }),
        holds: ['an `ssl` certificate cannot be written in a url'],
        kitOnly: true,
    },
    {
        label: 'turso authToken',
        config: credentials('turso', {
            url: 'libsql://app.example',
            authToken: 't',
        }),
        holds: [
            '`dbCredentials.authToken` is set',
            '`?authToken=<token>`',
        ],
        kitOnly: false,
    },
    {
        label: 'url and host fields',
        config: credentials('postgresql', {
            url: 'postgres://app@localhost/app',
            port: 5432,
        }),
        holds: ['sets both `url` and host fields (`port`)', 'remove the host'],
        kitOnly: false,
    },
    {
        label: 'an unknown key',
        config: credentials('postgresql', {
            url: 'postgres://app@localhost/app',
            secretArn: 'x',
        }),
        holds: ['holds keys Lockness does not read', 'remove them'],
        kitOnly: false,
    },
    ...['aws-data-api', 'pglite', 'd1-http', 'expo', 'durable-sqlite'].map(
        (driver): MigrateRefusal => ({
            label: `driver ${driver}`,
            config: postgresWith({ driver }),
            holds: [
                `\`driver\` is '${driver}', a client Lockness does not run`,
            ],
            kitOnly: true,
        }),
    ),
    {
        label: 'another driver',
        config: postgresWith({ driver: 'turso' }),
        holds: ['`driver` is set', 'remove `driver`'],
        kitOnly: false,
    },
    ...['singlestore', 'gel'].map((dialect): MigrateRefusal => ({
        label: `dialect ${dialect}`,
        config: postgresWith({ dialect }),
        holds: [`\`dialect\` is '${dialect}', which Lockness does not run`],
        kitOnly: true,
    })),
    {
        label: 'out not set',
        config: postgresWith({ out: undefined }),
        holds: [
            '`out` (the migrations folder) is not set',
            'set `out` to your migrations folder',
        ],
        kitOnly: false,
    },
    ...([
        ['postgresql', 'postgres://localhost:5432/'],
        ['postgresql', 'postgres://localhost/app?database=other'],
        ['postgresql', 'postgres://app@x%2Ch:5432/app'],
        ['mysql', 'mysql://localhost:3306/'],
        ['sqlite', 'file:'],
        ['turso', 'file://'],
    ] as const).map(([dialect, url]): MigrateRefusal => ({
        label: `#456 ${dialect} ${url}`,
        config: credentials(dialect, { url }),
        holds: ['`dbCredentials.url` names no database', 'put it in the path'],
        kitOnly: false,
    })),
]

for (const refusal of MIGRATE_REFUSALS) {
    Deno.test(`#442 db:migrate refuses before connecting: ${refusal.label}`, async () => {
        await withMigrations(async (folder) => {
            const { opened, spawned, deps } = migrateDeps(
                refusal.config(folder),
            )

            const { lines, error } = await invoke('db:migrate', deps)

            assert(error instanceof CommandFailedError, String(error))
            assertEquals(error.exitCode, 1)
            const message = error.message
            assert(
                message.startsWith('db:migrate refused: drizzle.config.ts: '),
                message,
            )
            assert(message.endsWith('. No migration was applied.'), message)
            for (const fragment of refusal.holds) {
                assertStringIncludes(message, fragment)
            }
            assertEquals(message.includes(KIT_CLAUSE), refusal.kitOnly, message)
            if (refusal.kitOnly) {
                assert(
                    message.endsWith(
                        `${KIT_CLAUSE}. No migration was applied.`,
                    ),
                    message,
                )
            }
            assertEquals(opened.length, 0, 'the connection was opened')
            assertEquals(spawned, [])
            assertEquals(
                lines.join('\n').includes('applied successfully'),
                false,
            )
        })
    })
}

Deno.test('#442 no db:migrate refusal quotes a credential', async () => {
    await withMigrations(async (folder) => {
        const configs: Record<string, unknown>[] = [
            credentials('postgresql', {
                host: 'h',
                user: 'app',
                password: SENTINEL,
            })(folder),
            credentials('turso', {
                url: 'libsql://app.example',
                authToken: SENTINEL,
            })(folder),
            credentials('postgresql', {
                url: `postgres://app:${SENTINEL}@h/app`,
                host: 'h',
            })(folder),
            credentials('postgresql', {
                url: `postgres://app:${SENTINEL}@h/`,
            })(folder),
            credentials('postgresql', {
                url: 'postgres://app@h/app',
                [SENTINEL]: SENTINEL,
            })(folder),
            postgresWith({ driver: SENTINEL })(folder),
            postgresWith({ dialect: SENTINEL })(folder),
        ]
        for (const config of configs) {
            const { deps } = migrateDeps(config)

            const { lines, error } = await invoke('db:migrate', deps)

            assert(error instanceof CommandFailedError, String(error))
            const output = [...lines, error.message, error.stack ?? ''].join(
                '\n',
            )
            assertEquals(output.includes(SENTINEL), false, output)
        }
    })
})

Deno.test('#442 a malformed schemaFilter blocks db:fresh, not db:migrate', async () => {
    await withMigrations(async (folder) => {
        for (const schemaFilter of [[], 42]) {
            const config = postgresWith({ schemaFilter })(folder)

            const migrate = migrateDeps(config)
            const migrated = await invoke('db:migrate', migrate.deps)
            assertEquals(migrated.error, undefined, String(migrated.error))
            assertEquals(migrate.migrated.length, 1)

            const fresh = migrateDeps(config)
            const { error } = await invoke('db:fresh', fresh.deps)
            assert(error instanceof CommandFailedError, String(error))
            assertStringIncludes(error.message, '`schemaFilter`')
            assertEquals(fresh.opened.length, 0)
        }
    })
})

Deno.test('#442 db:migrate accepts the documented url alternatives verbatim', async () => {
    await withMigrations(async (folder) => {
        for (
            const [dialect, url] of [
                ['turso', 'libsql://app.example?authToken=<token>'],
                [
                    'postgresql',
                    'postgresql://app@h:5432/app?sslmode=verify-full&sslrootcert=system',
                ],
                [
                    'mysql',
                    'mysql://app@h:3306/app?ssl=%7B%22rejectUnauthorized%22%3Atrue%7D',
                ],
            ]
        ) {
            const { opened, deps } = migrateDeps(
                credentials(dialect, { url })(folder),
            )

            const { error } = await invoke('db:migrate', deps)

            assertEquals(error, undefined, url)
            assertEquals(opened.map((s) => s.url), [url])
        }
    })
})

Deno.test('#442 db:migrate refuses a missing journal before connecting', async () => {
    await withMigrations(async (folder) => {
        const { opened, deps } = migrateDeps({
            dialect: 'sqlite',
            out: `${folder}/absent`,
            dbCredentials: { url: 'file:./migrate-test.db' },
        })

        const { error } = await invoke('db:migrate', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertStringIncludes(
            error.message,
            'db:migrate refused: the migrations',
        )
        assertStringIncludes(error.message, 'No migration was applied.')
        assertEquals(opened.length, 0)
    })
})

Deno.test('#442 db:migrate frames R4 with the drizzle-kit clause, and closes the client', async () => {
    await withMigrations(async (folder) => {
        container.delete(Database)
        try {
            container.get(Database).setDriverFactory(
                'sqlite',
                () =>
                    Promise.resolve({
                        db: {},
                        close: () => Promise.resolve(),
                        probe: () => Promise.resolve(),
                    }),
            )
            const { deps } = migrateDeps({
                dialect: 'sqlite',
                out: folder,
                dbCredentials: { url: 'file:./migrate-test.db' },
            })

            const { error } = await invoke('db:migrate', {
                runCommand: deps.runCommand,
                loadMigrationConfig: deps.loadMigrationConfig,
            })

            assert(error instanceof CommandFailedError, String(error))
            assertEquals(
                error.message,
                "db:migrate refused: the 'sqlite' driver offers no schema " +
                    'maintenance (a custom driver factory?): give the ' +
                    `factory a \`maintenance\` capability${KIT_CLAUSE}. ` +
                    'No migration was applied.',
            )
            assertEquals(container.get(Database).isConnected(), false)
        } finally {
            container.delete(Database)
        }
    })
})

Deno.test('#442 a failed db:migrate exits 1, prints no success line, and closes', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = migrateDeps({
            dialect: 'sqlite',
            out: folder,
            dbCredentials: { url: 'file:./migrate-test.db' },
        }, { failMigrate: true })

        const { lines, error } = await invoke('db:migrate', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(
            error.message,
            'Failed to apply migrations: migrate failed',
        )
        assertEquals(error.exitCode, 1)
        assertEquals(lines.join('\n').includes('applied successfully'), false)
        assertEquals(calls.at(-1), 'close', 'the session was not closed')
    })
})

Deno.test('#442 db:migrate on a client that cannot be configured exits 1', async () => {
    await withMigrations(async (folder) => {
        const { deps } = migrateDeps({
            dialect: 'sqlite',
            out: folder,
            dbCredentials: { url: 'file:./migrate-test.db' },
        }, { openError: new Error('Database not configured: no client') })

        const { lines, error } = await invoke('db:migrate', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(
            error.message,
            'Could not open the database: Database not configured: no client',
        )
        assertEquals(lines.join('\n').includes('applied successfully'), false)
    })
})

Deno.test('#442 db:fresh frames a kit-only refusal as before, with no drizzle-kit clause', async () => {
    await withMigrations(async (folder) => {
        const { deps } = migrateDeps(postgresWith({ driver: 'pglite' })(folder))

        const { error } = await invoke('db:fresh', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(
            error.message,
            "db:fresh refused: drizzle.config.ts: `driver` is 'pglite', a " +
                'client Lockness does not run; it connects through ' +
                'postgres.js, mysql2 and libsql only. Nothing was dropped.',
        )
        assertEquals(error.message.includes('drizzle-kit'), false)
    })
})
