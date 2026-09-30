/**
 * @fileoverview Hermetic tests for the Drizzle CLI commands (#180).
 *
 * The `db:*` commands are exercised through the three injectable seams of
 * {@link registerDrizzleCommands} — a command-runner, a connection port, and a
 * seeder-loader — so no test opens a real database, spawns a real process, or
 * hits the network. The six shell-out commands are validated by asserting the
 * **constructed `drizzle-kit` argv**, never by executing it.
 *
 * @module @lockness/drizzle/tests/cli_commands
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { Cli } from '@lockness/cli'
import { CommandFailedError } from '@lockness/cli/command-failure'
import { container } from '@lockness/container'
import { Database } from '../mod.ts'
import {
    type CommandRunner,
    type CommandSpec,
    type DbConnection,
    registerDrizzleCommands,
    type SeederLoader,
} from '../cli_commands.ts'

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
    ['db:migrate', 'migrate'],
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

/**
 * Run `db:fresh` with the runner returning `codes`, skipping the 3 s safety
 * countdown, and settle it. The rejection assertion is attached before the
 * clock moves so the failure is never an unhandled rejection.
 */
async function runFresh(codes: number[]): Promise<{
    readonly calls: CommandSpec[]
    readonly error: CommandFailedError | undefined
}> {
    using time = new FakeTime()
    const cli = new FakeCli()
    const { calls, run } = fakeRunner(codes)
    registerDrizzleCommands(cli, { runCommand: run })

    const settled = cli.run('db:fresh').then(
        () => undefined,
        (e: unknown) => e,
    )
    await time.tickAsync(3000)
    const outcome = await settled
    if (outcome !== undefined && !(outcome instanceof CommandFailedError)) {
        throw outcome
    }
    return { calls, error: outcome }
}

Deno.test('db:fresh - a failed drop rejects and never runs migrate', async () => {
    const restore = muteConsole()
    try {
        const { calls, error } = await runFresh([1])
        assert(error instanceof CommandFailedError, 'db:fresh resolved')
        assertStringIncludes(error.message, '(drizzle-kit drop exited 1)')
        assertStringIncludes(error.message, 'migrations were not run')
        assertEquals(calls.map((c) => c.args.at(-1)), ['drop'])
    } finally {
        restore()
    }
})

Deno.test('db:fresh - a failed migrate after a good drop rejects', async () => {
    const restore = muteConsole()
    try {
        const { calls, error } = await runFresh([0, 1])
        assert(error instanceof CommandFailedError, 'db:fresh resolved')
        assertStringIncludes(error.message, '(drizzle-kit migrate exited 1)')
        assertEquals(calls.map((c) => c.args.at(-1)), ['drop', 'migrate'])
    } finally {
        restore()
    }
})

Deno.test('db:fresh - resolves when drop and migrate both exit 0', async () => {
    const restore = muteConsole()
    try {
        const { calls, error } = await runFresh([0, 0])
        assertEquals(error, undefined)
        assertEquals(calls.length, 2)
    } finally {
        restore()
    }
})

Deno.test('wiring - a real Cli exits 1 on a failed db:migrate, printing one error line', async () => {
    const errors: unknown[][] = []
    const { log, error } = console
    console.log = () => {}
    console.error = (...args: unknown[]) => void errors.push(args)
    try {
        const cli = new Cli()
        registerDrizzleCommands(cli, { runCommand: fakeRunner([1]).run })

        const status = await cli.dispatch(['db:migrate'])

        assertEquals(status, 1)
        assertEquals(errors, [[
            '❌ Failed to apply migrations (drizzle-kit migrate exited 1)',
        ]])
    } finally {
        console.log = log
        console.error = error
    }
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
                args: ['run', '-A', 'npm:drizzle-kit', subcommand],
            })
        } finally {
            restore()
        }
    })
}

Deno.test('db:fresh - drops then migrates, in order, via the runner', async () => {
    const restore = muteConsole()
    using time = new FakeTime()
    try {
        const cli = new FakeCli()
        const { calls, run } = fakeRunner()
        registerDrizzleCommands(cli, { runCommand: run })

        const pending = cli.run('db:fresh')
        await time.tickAsync(3000) // skip the safety countdown
        await pending

        assertEquals(calls.map((c) => c.args.at(-1)), ['drop', 'migrate'])
        assertEquals(calls[0].args, ['run', '-A', 'npm:drizzle-kit', 'drop'])
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
