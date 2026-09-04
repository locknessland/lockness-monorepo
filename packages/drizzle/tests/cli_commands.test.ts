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

import { assertEquals } from '@std/assert'
import { FakeTime } from '@std/testing/time'
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

Deno.test('db:check - closes even when the probe fails', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection({
            probeError: new Error('unreachable'),
        })
        registerDrizzleCommands(cli, { connect })

        await cli.run('db:check')

        assertEquals(events, ['probe', 'close'])
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

Deno.test('db:seed - closes the connection when the module has no seeder', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        // A module with no DatabaseSeeder export: nothing runs, but the
        // connection opened by handleSeed must still be closed.
        const loadSeeder: SeederLoader = () => Promise.resolve({})
        registerDrizzleCommands(cli, { connect, loadSeeder })

        await cli.run('db:seed')

        assertEquals(events, ['close'])
    } finally {
        restore()
    }
})

Deno.test('db:seed - closes the connection when the seeder throws', async () => {
    const restore = muteConsole()
    try {
        const cli = new FakeCli()
        const { events, connect } = fakeConnection()
        class DatabaseSeeder {
            run(): Promise<void> {
                return Promise.reject(new Error('boom'))
            }
        }
        const loadSeeder: SeederLoader = () =>
            Promise.resolve({ DatabaseSeeder })
        registerDrizzleCommands(cli, { connect, loadSeeder })

        // The failure is swallowed and logged; the connection is still closed.
        await cli.run('db:seed')

        assertEquals(events, ['close'])
    } finally {
        restore()
    }
})
