/**
 * @fileoverview Hermetic tests for the Drizzle CLI commands (#180).
 *
 * The `db:*` commands are exercised through the injectable seams of
 * {@link registerDrizzleCommands} — a command-runner, a connection port, a
 * seeder-loader, and for `db:migrate` and `db:fresh` a config loader and a
 * maintenance opener — so no test opens a real database, spawns a real
 * process, or hits the network. The four shell-out commands are validated by
 * asserting the **constructed `drizzle-kit` argv**, never by executing it.
 * `db:fresh` (#435), `db:migrate` (#442) and `db:status` (#439) spawn
 * nothing: their tests run with a runner that throws if called.
 *
 * @module @lockness/drizzle/tests/cli_commands
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertStringIncludes,
} from '@std/assert'
import { Cli } from '@lockness/cli'
import { CommandFailedError } from '@lockness/cli/command-failure'
import { container } from '@lockness/container'
import { Database } from '../mod.ts'
import {
    type CommandResult,
    type CommandRunner,
    type CommandSpec,
    type DbConnection,
    type DrizzleCommandDeps,
    registerDrizzleCommands,
    type SeederLoader,
} from '../cli_commands.ts'
import { defaultRunCommand, RETAINED_STDERR_BYTES } from '../command_runner.ts'
import type { MaintenanceConnection, MigrateOptions } from '../drivers.ts'
import type { MigrationSettings } from '../migration_settings.ts'
import { RefusedError } from '../refusal.ts'
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

/**
 * A command-runner that records every spec and returns canned results; a run
 * past the end of the list exits 0 with an empty stderr.
 */
function fakeRunner(results: CommandResult[] = []) {
    const calls: CommandSpec[] = []
    let i = 0
    const run: CommandRunner = (spec) => {
        calls.push(spec)
        return Promise.resolve(results[i++] ?? { code: 0, stderr: '' })
    }
    return { calls, run }
}

/** A canned runner result: an exit code and what the child wrote to stderr. */
function exited(code: number, stderr = ''): CommandResult {
    return { code, stderr }
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
        'db:validate',
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
    ['db:validate', 'check'],
]

// -----------------------------------------------------------------------------
// Exit contract (#428) — a failed drizzle-kit run is a thrown CommandFailedError
// -----------------------------------------------------------------------------

for (const [command, subcommand] of shellCommands) {
    Deno.test(`${command} - rejects with CommandFailedError when drizzle-kit ${subcommand} exits 1`, async () => {
        const restore = muteConsole()
        try {
            const cli = new FakeCli()
            const { run } = fakeRunner([exited(1)])
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
            const { run } = fakeRunner([exited(0)])
            registerDrizzleCommands(cli, { runCommand: run })

            await cli.run(command)
        } finally {
            restore()
        }
    })
}

Deno.test('#439 db:validate - only claims a valid migrations folder, never drift or pending migrations', async () => {
    const lines: string[] = []
    const { log } = console
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        const cli = new FakeCli()
        registerDrizzleCommands(cli, {
            runCommand: fakeRunner([exited(0)]).run,
        })
        await cli.run('db:validate')

        const failing = new FakeCli()
        registerDrizzleCommands(failing, {
            runCommand: fakeRunner([exited(2)]).run,
        })
        const error = await assertRejects(
            () => failing.run('db:validate'),
            CommandFailedError,
        )
        assertEquals(
            error.message,
            'Migration validation failed (drizzle-kit check exited 2)',
        )
    } finally {
        console.log = log
    }
    assertStringIncludes(
        lines.join('\n'),
        'The migrations folder is consistent',
    )
    assert(!/up to date|schema changes|pending|applied/i.test(lines.join('\n')))
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
            // The cause is printed once, rendered, after the message (#436).
            assertEquals(errors, [[
                '❌ Failed to apply migrations caused by: Error: migrate failed',
            ]])
        } finally {
            console.log = log
            console.error = error
        }
    })
})

/**
 * Dispatch `args` on a real `Cli` with `deps`, outside production, and return
 * the exit status with every `console.error` call; `console.log` is muted.
 */
async function dispatchReal(
    deps: Partial<DrizzleCommandDeps>,
    args: string[],
): Promise<{ readonly status: number; readonly errors: unknown[][] }> {
    const errors: unknown[][] = []
    const { log, error } = console
    console.log = () => {}
    console.error = (...line: unknown[]) => void errors.push(line)
    try {
        const cli = new Cli()
        registerDrizzleCommands(cli, deps)
        let status = -1
        await withAppEnv(undefined, async () => {
            status = await cli.dispatch(args)
        })
        return { status, errors }
    } finally {
        console.log = log
        console.error = error
    }
}

Deno.test('#440 wiring - a real Cli exits 1 on a failed db:seed, printing one error line', async () => {
    const { connect } = fakeConnection()
    const loadSeeder: SeederLoader = () => Promise.resolve({})

    const { status, errors } = await dispatchReal(
        { connect, loadSeeder },
        ['db:seed'],
    )

    assertEquals(status, 1)
    assertEquals(errors.length, 1, JSON.stringify(errors))
    assertEquals(errors[0].length, 1)
    const [line] = errors[0] as [string]
    assert(line.startsWith('❌ '), line)
    assertStringIncludes(line, 'DatabaseSeeder class not found')
})

Deno.test('#440 wiring - a real Cli exits 1 on a failed db:fresh, printing one error line', async () => {
    await withMigrations(async (folder) => {
        const { deps } = freshDeps(folder, 'migrate')

        const { status, errors } = await dispatchReal(deps, ['db:fresh'])

        assertEquals(status, 1)
        assertEquals(errors.length, 1, JSON.stringify(errors))
        assertEquals(errors[0].length, 1)
        const [line] = errors[0] as [string]
        assert(line.startsWith('❌ '), line)
        assertStringIncludes(line, 'migrate failed')
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
                args: [
                    'run',
                    '-q',
                    '-A',
                    'npm:drizzle-kit@0.31.10',
                    subcommand,
                ],
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
// The kit verdict (#445) — generate and push pass only on exit 0 with a clean
// stderr: drizzle-kit swallows their errors and exits 0
// -----------------------------------------------------------------------------

/** drizzle-kit 0.31.10's refusal when a prompt finds no TTY, as measured. */
const TTY_REFUSAL = 'Error: Interactive prompts require a TTY terminal ' +
    '(process.stdin.isTTY or process.stdout.isTTY is false). This can happen ' +
    'when running in CI, piped input, or non-interactive shells.\n' +
    '    at render10 (file:///app/node_modules/drizzle-kit/bin.cjs:1450:31)\n'

/** A swallowed SQL error, as `pgPush`'s catch-all prints it. */
const SQL_ERROR = 'error: invalid input syntax for type integer: "x"\n' +
    '    at ErrorResponse (file:///app/node_modules/postgres/src/connection.js:815:30)\n'

/** What a refusal says before the way forward, for either command. */
const NEEDED_A_TERMINAL = 'drizzle-kit needed an answer only a terminal can ' +
    'give (a rename, or a data-loss confirmation) and this run had none'

/**
 * Run one command against one canned result; capture what it printed and the
 * failure it threw, if any.
 */
async function judge(
    command: string,
    result: CommandResult,
): Promise<{ printed: string; failure?: CommandFailedError }> {
    const lines: string[] = []
    const { log, error } = console
    console.log = (...args: unknown[]) => void lines.push(args.join(' '))
    console.error = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
        const cli = new FakeCli()
        registerDrizzleCommands(cli, { runCommand: fakeRunner([result]).run })
        try {
            await cli.run(command)
            return { printed: lines.join('\n') }
        } catch (thrown) {
            if (!(thrown instanceof CommandFailedError)) throw thrown
            return { printed: lines.join('\n'), failure: thrown }
        }
    } finally {
        console.log = log
        console.error = error
    }
}

const VERDICTS: ReadonlyArray<{
    readonly command: string
    readonly result: CommandResult
    readonly failure: string | undefined
}> = [
    { command: 'db:generate', result: exited(0), failure: undefined },
    { command: 'db:push', result: exited(0), failure: undefined },
    // A stderr of whitespace only is blank, not a report.
    { command: 'db:generate', result: exited(0, '\n  \n'), failure: undefined },
    { command: 'db:push', result: exited(0, '\n'), failure: undefined },
    {
        command: 'db:generate',
        result: exited(0, TTY_REFUSAL),
        failure: `Failed to generate migrations: ${NEEDED_A_TERMINAL}, so no ` +
            'migration was written. Run db:generate in a terminal and commit ' +
            'the migration; generate has no non-interactive option for renames.',
    },
    {
        command: 'db:push',
        result: exited(0, TTY_REFUSAL),
        failure:
            `Failed to push schema: ${NEEDED_A_TERMINAL}, so nothing was ` +
            'applied. Run db:push in a terminal, or for CI run db:generate ' +
            'locally and db:migrate in CI.',
    },
    {
        command: 'db:push',
        result: exited(0, SQL_ERROR),
        failure: 'Failed to push schema (drizzle-kit push exited 0 after ' +
            'reporting an error; see above). The schema may be partly pushed: ' +
            'drizzle-kit runs its statements one at a time, outside a ' +
            'transaction.',
    },
    {
        command: 'db:generate',
        result: exited(0, 'Error: Cannot find module "./app/model/x.ts"\n'),
        failure: 'Failed to generate migrations (drizzle-kit generate exited ' +
            '0 after reporting an error; see above)',
    },
    // A non-zero exit keeps its message, whatever stderr holds.
    {
        command: 'db:generate',
        result: exited(2),
        failure:
            'Failed to generate migrations (drizzle-kit generate exited 2)',
    },
    {
        command: 'db:push',
        result: exited(2, TTY_REFUSAL),
        failure: 'Failed to push schema (drizzle-kit push exited 2)',
    },
    // check and studio keep the exit-code rule: their stderr is shown, not
    // judged, until someone measures them.
    {
        command: 'db:validate',
        result: exited(0, 'noise\n'),
        failure: undefined,
    },
    { command: 'db:studio', result: exited(0, 'noise\n'), failure: undefined },
]

for (const { command, result, failure } of VERDICTS) {
    const stderr = JSON.stringify(result.stderr.slice(0, 24))
    const verdict = failure === undefined ? 'passes' : 'fails'
    Deno.test(`#445 ${command} - (${result.code}, ${stderr}) ${verdict}`, async () => {
        const judged = await judge(command, result)
        assertEquals(judged.failure?.message, failure)
        if (judged.failure) assertEquals(judged.failure.exitCode, 1)
    })
}

for (const command of ['db:generate', 'db:push']) {
    Deno.test(`#445 ${command} - prints no closing ✅ line: Lockness cannot observe the outcome`, async () => {
        const { printed, failure } = await judge(command, exited(0))
        assertEquals(failure, undefined)
        assert(!printed.includes('✅'), printed)
        assert(!/successfully/i.test(printed), printed)
    })
}

// -----------------------------------------------------------------------------
// The production runner (#445) — a real child process
// -----------------------------------------------------------------------------

/** A stderr sink that keeps every byte the runner forwards to it. */
function recordingSink() {
    const decoder = new TextDecoder()
    let bytes = 0
    let text = ''
    return {
        bytes: () => bytes,
        text: () => text,
        write(chunk: Uint8Array): Promise<number> {
            bytes += chunk.length
            text += decoder.decode(chunk, { stream: true })
            return Promise.resolve(chunk.length)
        },
    }
}

Deno.test('#445 defaultRunCommand - returns the exit code and what the child wrote to stderr', async () => {
    const sink = recordingSink()
    const result = await defaultRunCommand({
        cmd: Deno.execPath(),
        args: ['eval', "console.error('x')"],
    }, sink)
    assertEquals(result, { code: 0, stderr: 'x\n' })
    assertEquals(sink.text(), 'x\n')
})

Deno.test('#445 defaultRunCommand - reports a non-zero exit with an empty stderr', async () => {
    const result = await defaultRunCommand({
        cmd: Deno.execPath(),
        args: ['eval', 'Deno.exit(3)'],
    }, recordingSink())
    assertEquals(result, { code: 3, stderr: '' })
})

Deno.test('#445 defaultRunCommand - forwards all of stderr but retains a bounded copy', async () => {
    const total = RETAINED_STDERR_BYTES + 40_000
    const sink = recordingSink()
    const result = await defaultRunCommand({
        cmd: Deno.execPath(),
        args: [
            'eval',
            `const b = new Uint8Array(${total}).fill(97); let n = 0; ` +
            'while (n < b.length) n += Deno.stderr.writeSync(b.subarray(n))',
        ],
    }, sink)
    assertEquals(result.code, 0)
    assertEquals(sink.bytes(), total)
    assertEquals(result.stderr, 'a'.repeat(RETAINED_STDERR_BYTES))
})

Deno.test('#445 defaultRunCommand - a failed forward kills and reaps the child, then surfaces the error', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-445-sink-' })
    const marker = `${dir}/finished`
    try {
        // The child reports on stderr, then finishes its work a second
        // later: a push that would complete unwatched if it were not killed.
        const script = "console.error('x'); await new Promise((r) => " +
            `setTimeout(r, 1000)); Deno.writeTextFileSync(${
                JSON.stringify(marker)
            }, 'done')`
        const broken = new Error('stderr closed')
        const error = await assertRejects(() =>
            defaultRunCommand({
                cmd: Deno.execPath(),
                args: ['eval', script],
            }, { write: () => Promise.reject(broken) })
        )
        assertEquals(error, broken)
        await new Promise((r) => setTimeout(r, 1500))
        const finished = await Deno.stat(marker).then(() => true, (e) => {
            if (e instanceof Deno.errors.NotFound) return false
            throw e
        })
        assertEquals(finished, false, 'the child ran on after the failure')
    } finally {
        await Deno.remove(dir, { recursive: true })
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

        // One line, and the probe's own error travels as the cause (#436).
        assertEquals(
            error.message,
            'Database connection failed. Check your DATABASE_URL in .env',
        )
        assertEquals((error.cause as Error).message, 'unreachable')
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
        assertEquals(
            error.message,
            'Database connection failed. Check your DATABASE_URL in .env',
        )
        assertEquals((error.cause as Error).message, 'no client')
    } finally {
        restore()
    }
})

// -----------------------------------------------------------------------------
// db:check — through the real connection port (#427)
// -----------------------------------------------------------------------------

/**
 * Run `fn` against a fresh container `Database` singleton whose postgres
 * driver is `factory`, with `DATABASE_URL` set as `env` gives it (deleted when
 * `undefined`) — the default connection port (`initDatabase`) with only the
 * client faked. Resets the singleton and the variable before and after.
 *
 * An object, not a bare `url = …` parameter: a default parameter would
 * swallow an explicit `undefined`, the very value the unset case passes.
 */
async function withDefaultPort(
    factory: Parameters<Database['setDriverFactory']>[1],
    fn: () => Promise<void>,
    env: { readonly DATABASE_URL: string | undefined } = {
        DATABASE_URL: 'postgres://u:p@h:5432/app',
    },
): Promise<void> {
    const prevUrl = Deno.env.get('DATABASE_URL')
    const url = env.DATABASE_URL
    if (url === undefined) Deno.env.delete('DATABASE_URL')
    else Deno.env.set('DATABASE_URL', url)
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
            // One line; the reason is printed once, as the cause (#436).
            assertEquals(errors, [[
                '❌ Database connection failed. Check your DATABASE_URL in ' +
                '.env caused by: Error: Database not configured: ' +
                "The 'postgres' driver could not be configured (Error); its " +
                'message is withheld because it may contain the DSN',
            ]])
        } finally {
            console.log = log
            console.error = error
        }
    })
})

/**
 * A fake postgres DSN with a user and password distinct per call, assembled at
 * run time so no secret scanner reads a credential into the source.
 */
function fakeDsn(): {
    readonly dsn: string
    readonly user: string
    readonly password: string
} {
    const tag = crypto.randomUUID().slice(0, 8)
    const user = ['fx', 'user', tag].join('-')
    const password = ['fx', 'pass', tag].join('-')
    const dsn = ['postgres://', user, ':', password, '@db.example:5432/app']
        .join('')
    return { dsn, user, password }
}

/**
 * Assert that neither credential appears in `error`, anywhere down its `cause`
 * chain (a non-`Error` cause is read with `String`), or in `lines`.
 */
function assertNoCredential(
    error: unknown,
    lines: readonly string[],
    credentials: { readonly user: string; readonly password: string },
): void {
    const texts: string[] = [...lines]
    for (
        let e: unknown = error;
        e !== undefined;
        e = e instanceof Error ? e.cause : undefined
    ) {
        texts.push(e instanceof Error ? e.message : String(e))
    }
    for (const text of texts) {
        assertEquals(text.includes(credentials.password), false, text)
        assertEquals(text.includes(credentials.user), false, text)
    }
}

// The driver's own error quotes the full DSN, credentials included. Neither
// db:check nor db:seed may carry it into the thrown error, its `cause` chain,
// or the console (#440(b)).
for (const command of ['db:check', 'db:seed']) {
    Deno.test(`#440 ${command} - a driver error quoting the DSN reaches neither the error chain nor the console`, async () => {
        const { dsn, user, password } = fakeDsn()
        let loaded = false
        await withDefaultPort(() => {
            throw new Error(`connect to ${dsn} failed: password rejected`)
        }, async () => {
            const cli = new FakeCli()
            registerDrizzleCommands(cli, {
                loadSeeder: () => {
                    loaded = true
                    return Promise.resolve({})
                },
            })

            const { lines, error } = await capture(() =>
                withAppEnv(undefined, () => cli.run(command))
            )

            assert(error instanceof CommandFailedError, String(error))
            assertNoCredential(error, lines, { user, password })
            assertEquals(loaded, false, 'a seeder was loaded')
        }, { DATABASE_URL: dsn })
    })
}

// The usual wrong-password case: the client builds, and the probe's round trip
// rejects quoting the DSN. Only db:check probes; db:seed makes no round trip
// of its own before the seeder runs (#420), so it has no probe path to pin.
Deno.test('#440 db:check - a probe error quoting the DSN reaches neither the error chain nor the console', async () => {
    const { dsn, user, password } = fakeDsn()
    let probed = false
    await withDefaultPort(() =>
        Promise.resolve({
            db: {},
            probe: () => {
                probed = true
                return Promise.reject(
                    new Error(`password authentication failed for ${dsn}`),
                )
            },
            close: () => Promise.resolve(),
        }), async () => {
        const cli = new FakeCli()
        registerDrizzleCommands(cli, {})

        const { lines, error } = await capture(() =>
            withAppEnv(undefined, () => cli.run('db:check'))
        )

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(probed, true, 'the probe never ran')
        assertNoCredential(error, lines, { user, password })
    }, { DATABASE_URL: dsn })
})

/** The refusal `initDatabase` throws when `DATABASE_URL` names nothing. */
const NO_TARGET = (state: string) =>
    `Database not configured: DATABASE_URL is ${state}, so no database is ` +
    'named; the db:* commands never fall back to a default database'

const UNNAMED_TARGETS: ReadonlyArray<
    readonly [label: string, url: string | undefined, state: string]
> = [
    ['unset', undefined, 'not set'],
    ["''", '', 'empty'],
    ["'   '", '   ', 'empty'],
]

for (const command of ['db:seed', 'db:check']) {
    for (const [label, url, state] of UNNAMED_TARGETS) {
        Deno.test(`#443 T1 ${command} refuses before connecting when DATABASE_URL is ${label}`, async () => {
            let built = 0
            let loaded = false
            await withDefaultPort(() => {
                built++
                return Promise.resolve({
                    db: {},
                    probe: () => Promise.resolve(),
                    close: () => Promise.resolve(),
                })
            }, async () => {
                const cli = new FakeCli()
                registerDrizzleCommands(cli, {
                    loadSeeder: () => {
                        loaded = true
                        return Promise.resolve({})
                    },
                })

                const { error } = await capture(() =>
                    withAppEnv(undefined, () => cli.run(command))
                )

                assert(
                    error instanceof CommandFailedError,
                    `${command} did not refuse: ${error}`,
                )
                // db:seed fails with the refusal as its message; db:check
                // names its own step and carries the refusal as the cause.
                assertStringIncludes(
                    command === 'db:check'
                        ? (error.cause as Error).message
                        : error.message,
                    NO_TARGET(state),
                )
                assertEquals(built, 0, 'a client was built')
                assertEquals(loaded, false, 'a seeder was loaded')
            }, { DATABASE_URL: url })
        })
    }
}

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

        // Identity, not deep equality: a wrapped or cloned error would carry
        // the same message and lose the stack (#440(a)).
        assertStrictEquals(error, boom)
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

        // The load failure travels as the cause, rendered by the printer;
        // the message never carries its text (#436).
        assertEquals(
            error.message,
            'Failed to load seeder ./database/seeders/user_seeder.ts',
        )
        assert(!error.message.includes(head), error.message)
        assert(!error.message.includes(tail), error.message)
        assert(error.cause instanceof Error)
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

        assertEquals(
            error.message,
            'Failed to load seeder ./database/seeders/user_seeder.ts',
        )
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

/**
 * Which step of a fake maintenance connection fails: a catalogue read the
 * planner makes, a statement of the plan, or the migrate.
 */
type FreshStep = 'read' | 'execute' | 'migrate'

/**
 * The `db:fresh` seams around a fake connection that records every call — a
 * sqlite one unless `config` overrides `drizzle.config.ts`, and `rows`
 * answers every catalogue read. `execute` models one unit (#447): it hands
 * the planner a reader, records `read` per read and `execute` once the plan
 * runs, and nothing when the planner rejects. `runCommand` throws:
 * `db:fresh` must spawn nothing.
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
    const connection: MaintenanceConnection = {
        query: () => Promise.reject(new Error('db:fresh read outside execute')),
        execute: async (planner) => {
            await planner(() =>
                step(
                    'read',
                    overrides.rows ?? [{ type: 'table', name: 'users' }],
                )
            )
            await step('execute', undefined)
        },
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
            return Promise.resolve(connection)
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

/**
 * Capture every `console.log` / `console.warn` / `console.error` line of `fn`,
 * and what it rejected with.
 */
async function capture(fn: () => Promise<void>): Promise<{
    readonly lines: string[]
    readonly error: unknown
}> {
    const lines: string[] = []
    const { log, warn, error: err } = console
    const record = (...args: unknown[]) => void lines.push(args.join(' '))
    console.log = record
    console.warn = record
    console.error = record
    try {
        await fn()
        return { lines, error: undefined }
    } catch (error) {
        return { lines, error }
    } finally {
        console.log = log
        console.warn = warn
        console.error = err
    }
}

Deno.test('db:fresh - resets then migrates on one connection, spawning nothing and prompting nothing', async () => {
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
            'read',
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

for (const failAt of ['read', 'execute', 'migrate'] as const) {
    Deno.test(`db:fresh - a failed ${failAt} is a CommandFailedError, prints no "refreshed" line, and closes`, async () => {
        await withMigrations(async (folder) => {
            const { calls, deps } = freshDeps(folder, failAt)
            const cli = new FakeCli()
            registerDrizzleCommands(cli, deps)

            const { lines, error } = await capture(() =>
                withAppEnv(undefined, () => cli.run('db:fresh'))
            )

            assert(error instanceof CommandFailedError, String(error))
            // The step's own error travels as the cause, never in the
            // message (#436).
            assert(!error.message.includes(`${failAt} failed`), error.message)
            assertStringIncludes(String(error.cause), `${failAt} failed`)
            assertEquals(lines.join('\n').includes('refreshed'), false)
            assertEquals(calls.at(-1), 'close', 'the connection was not closed')
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
        assertEquals(error.message, 'Could not open the database')
        assertEquals(
            (error.cause as Error).message,
            'Database not configured',
        )
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
                const connection = await deps.openMaintenance(settings)
                return {
                    ...connection,
                    execute: (planner) =>
                        connection.execute(() =>
                            planner(() =>
                                Promise.resolve([{ type: 'table', name: 1 }])
                            )
                        ),
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

// -----------------------------------------------------------------------------
// #447 — the default opener: one connection, released in order, first error kept
// -----------------------------------------------------------------------------

/** Which release step of the default opener's fake handle fails. */
interface ReleaseFaults {
    readonly open?: boolean
    readonly closeConnection?: boolean
    readonly closeDatabase?: boolean
    readonly noMaintenance?: boolean
}

/**
 * Run `db:fresh` through the DEFAULT opener, over a container `Database`
 * whose sqlite factory records `open`, the connection's calls,
 * `close:connection` and `close:database`, and fails where `faults` says.
 */
async function freshThroughDefaultOpener(
    folder: string,
    faults: ReleaseFaults = {},
): Promise<{
    readonly events: string[]
    readonly lines: string[]
    readonly error: unknown
    readonly stillConnected: boolean
}> {
    const events: string[] = []
    const fail = (fault: boolean | undefined, label: string) => {
        events.push(label)
        return fault
            ? Promise.reject(new Error(`${label} failed`))
            : Promise.resolve()
    }
    const connection: MaintenanceConnection = {
        query: () => Promise.resolve([]),
        execute: async (planner) => {
            events.push('execute')
            await planner(() => Promise.resolve([]))
        },
        migrate: () => fail(false, 'migrate'),
        close: () => fail(faults.closeConnection, 'close:connection'),
    }
    container.delete(Database)
    try {
        container.get(Database).setDriverFactory(
            'sqlite',
            () =>
                Promise.resolve({
                    db: {},
                    close: () => fail(faults.closeDatabase, 'close:database'),
                    probe: () => Promise.resolve(),
                    ...(faults.noMaintenance ? {} : {
                        maintenance: {
                            open: async () => {
                                await fail(faults.open, 'open')
                                return connection
                            },
                        },
                    }),
                }),
        )
        const { deps } = freshDeps(folder)
        const cli = new FakeCli()
        registerDrizzleCommands(cli, {
            runCommand: deps.runCommand,
            loadMigrationConfig: deps.loadMigrationConfig,
        })
        const { lines, error } = await capture(() =>
            withAppEnv(undefined, () => cli.run('db:fresh'))
        )
        return {
            events,
            lines,
            error,
            stillConnected: container.get(Database).isConnected(),
        }
    } finally {
        container.delete(Database)
    }
}

Deno.test('#447 db:fresh through the default opener resets and migrates on one connection, then closes it, then the Database', async () => {
    await withMigrations(async (folder) => {
        const { events, error, stillConnected } =
            await freshThroughDefaultOpener(folder)

        assertEquals(error, undefined)
        assertEquals(events, [
            'open',
            'execute',
            'migrate',
            'close:connection',
            'close:database',
        ])
        assertEquals(stillConnected, false)
    })
})

Deno.test('#447 the default opener keeps the R4 refusal when closing the Database fails too, and logs that failure', async () => {
    await withMigrations(async (folder) => {
        const { events, lines, error } = await freshThroughDefaultOpener(
            folder,
            { noMaintenance: true, closeDatabase: true },
        )

        assert(error instanceof CommandFailedError, String(error))
        assertStringIncludes(error.message, 'schema maintenance')
        assertStringIncludes(error.message, 'Nothing was dropped')
        assertEquals(events, ['close:database'])
        assert(
            lines.some((line) =>
                line.includes('Could not close the database either') &&
                line.includes('close:database failed')
            ),
            `the close failure was dropped: ${JSON.stringify(lines)}`,
        )
    })
})

Deno.test('#447 the default opener closes the Database when the connection cannot be opened, keeping the open failure', async () => {
    await withMigrations(async (folder) => {
        const { events, lines, error, stillConnected } =
            await freshThroughDefaultOpener(folder, {
                open: true,
                closeDatabase: true,
            })

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(error.message, 'Could not open the database')
        assertStringIncludes(String(error.cause), 'open failed')
        assertEquals(events, ['open', 'close:database'])
        assertEquals(stillConnected, false)
        assert(
            lines.some((line) => line.includes('close:database failed')),
            `the close failure was dropped: ${JSON.stringify(lines)}`,
        )
    })
})

Deno.test('#447 the composed close still closes the Database after the connection fails to close, and keeps that first failure', async () => {
    await withMigrations(async (folder) => {
        const { events, lines, error, stillConnected } =
            await freshThroughDefaultOpener(folder, {
                closeConnection: true,
                closeDatabase: true,
            })

        assert(error instanceof Error, String(error))
        assertStringIncludes(error.message, 'close:connection failed')
        assertEquals(events.slice(-2), ['close:connection', 'close:database'])
        assertEquals(stillConnected, false)
        assert(
            lines.some((line) =>
                line.includes('Could not close the database either') &&
                line.includes('close:database failed')
            ),
            `the second close failure was dropped: ${JSON.stringify(lines)}`,
        )
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
    const connection: MaintenanceConnection = {
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
                ? Promise.resolve(connection)
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
        assertEquals(error.message, 'Failed to apply migrations')
        assertEquals((error.cause as Error).message, 'migrate failed')
        assertEquals(error.exitCode, 1)
        assertEquals(lines.join('\n').includes('applied successfully'), false)
        assertEquals(calls.at(-1), 'close', 'the connection was not closed')
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
        assertEquals(error.message, 'Could not open the database')
        assertEquals(
            (error.cause as Error).message,
            'Database not configured: no client',
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

// -----------------------------------------------------------------------------
// db:status (#439) — the journal against the bookkeeping table, in-process
// -----------------------------------------------------------------------------

/** The one migration `withMigrations` writes, and its drizzle-orm hash. */
const INIT_SQL = 'CREATE TABLE "users" ("id" integer);'

/** The lowercase hex SHA-256 of `text`, the hash drizzle-orm records. */
async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(text),
    )
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
}

/** A postgresql config over `folder`, the bookkeeping location defaulted. */
const statusConfig = (folder: string): Record<string, unknown> => ({
    dialect: 'postgresql',
    out: folder,
    dbCredentials: { url: 'postgres://app@localhost/app' },
})

/** The catalogue row naming the default postgres bookkeeping table. */
const BOOKKEEPING_ROW = { schema: 'drizzle', name: '__drizzle_migrations' }

/**
 * The `db:status` seams around a fake session whose `query` answers the
 * catalogue with `catalogue` and the bookkeeping read with `rows`, and
 * records every call. `runCommand` records and throws: `db:status` must spawn
 * nothing. `failQuery` makes the n-th query (1-based) reject.
 */
function statusDeps(
    config: unknown,
    options: {
        readonly catalogue?: Record<string, unknown>[]
        readonly rows?: Record<string, unknown>[]
        readonly failQuery?: number
        readonly openError?: unknown
    } = {},
) {
    const calls: string[] = []
    const queries: string[] = []
    const spawned: CommandSpec[] = []
    const connection: MaintenanceConnection = {
        query: (sql) => {
            calls.push('query')
            queries.push(sql)
            if (queries.length === options.failQuery) {
                return Promise.reject(new Error('relation read failed'))
            }
            return Promise.resolve(
                queries.length === 1
                    ? options.catalogue ?? [BOOKKEEPING_ROW]
                    : options.rows ?? [],
            )
        },
        execute: () => {
            calls.push('execute')
            return Promise.resolve()
        },
        migrate: () => {
            calls.push('migrate')
            return Promise.resolve()
        },
        close: () => {
            calls.push('close')
            return Promise.resolve()
        },
    }
    const deps: Partial<DrizzleCommandDeps> = {
        runCommand: (spec) => {
            spawned.push(spec)
            throw new Error('db:status spawned a process')
        },
        loadMigrationConfig: () => Promise.resolve(config),
        openMaintenance: () => {
            calls.push('open')
            return options.openError === undefined
                ? Promise.resolve(connection)
                : Promise.reject(options.openError)
        },
    }
    return { calls, queries, spawned, deps }
}

Deno.test('#439 db:status - all applied: lists them, ends on one ✅ line, exits 0, spawns nothing', async () => {
    await withMigrations(async (folder) => {
        const { calls, queries, spawned, deps } = statusDeps(
            statusConfig(folder),
            { rows: [{ hash: await sha256(INIT_SQL), created_at: '1' }] },
        )

        const { lines, error } = await invoke('db:status', deps)

        assertEquals(error, undefined)
        assertEquals(lines, [
            '📊 Migration status (bookkeeping table "drizzle"."__drizzle_migrations")',
            '  applied        0000_init',
            '✅ The one migration is applied',
        ])
        assertEquals(calls, ['open', 'query', 'query', 'close'])
        assertEquals(queries, [
            'SELECT schemaname AS schema, tablename AS name FROM pg_catalog.pg_tables',
            'SELECT hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at',
        ])
        assertEquals(spawned, [], 'db:status spawned drizzle-kit')
    })
})

Deno.test('#439 db:status - a pending migration exits 1 with the count as its message', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = statusDeps(statusConfig(folder), { rows: [] })

        const { lines, error } = await invoke('db:status', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(error.exitCode, 1)
        assertEquals(
            error.message,
            '1 of 1 migration is not applied: 1 pending',
        )
        assertEquals(lines.at(-1), '  pending        0000_init')
        assertEquals(calls.at(-1), 'close')
    })
})

Deno.test('#439 db:status - never migrated: every migration pending, and no row query runs', async () => {
    await withMigrations(async (folder) => {
        const { queries, deps } = statusDeps(statusConfig(folder), {
            catalogue: [{ schema: 'public', name: 'users' }],
        })

        const { lines, error } = await invoke('db:status', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(
            error.message,
            '1 of 1 migration is not applied: 1 pending',
        )
        assertStringIncludes(lines.join('\n'), 'has never been migrated')
        assertEquals(queries.length, 1)
    })
})

Deno.test('#439 db:status - an edited applied migration warns and still exits 0', async () => {
    await withMigrations(async (folder) => {
        const { deps } = statusDeps(statusConfig(folder), {
            rows: [{ hash: 'an-older-hash', created_at: 1 }],
        })

        const { lines, error } = await invoke('db:status', deps)

        assertEquals(error, undefined)
        assertStringIncludes(lines.join('\n'), '⚠️ edited after it was applied')
        assertEquals(lines.at(-1), '✅ The one migration is applied')
    })
})

Deno.test('#439 db:status - a refusal is framed for db:status, before any connection', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = statusDeps({
            ...statusConfig(folder),
            dbCredentials: { url: '' },
        })

        const { error } = await invoke('db:status', deps)

        assert(error instanceof CommandFailedError, String(error))
        assert(
            error.message.startsWith('db:status refused: drizzle.config.ts: '),
            error.message,
        )
        assert(
            error.message.endsWith('. No migration status was read.'),
            error.message,
        )
        assertEquals(calls, [], 'the connection was opened after a refusal')
    })
})

Deno.test('#439 db:status - a kit-only refusal names no drizzle-kit fallback: it has no status command', async () => {
    await withMigrations(async (folder) => {
        const { deps } = statusDeps({
            ...statusConfig(folder),
            dbCredentials: {
                url: 'postgres://app@localhost/app',
                ssl: { ca: 'certificate' },
            },
        })

        const { error } = await invoke('db:status', deps)

        assert(error instanceof CommandFailedError, String(error))
        assert(error.message.startsWith('db:status refused: '), error.message)
        assert(
            error.message.endsWith('. No migration status was read.'),
            error.message,
        )
        assertEquals(error.message.includes('drizzle-kit'), false)
    })
})

Deno.test('#439 db:status - a missing journal is refused before connecting', async () => {
    const folder = await Deno.makeTempDir()
    try {
        const { calls, deps } = statusDeps(statusConfig(folder))

        const { error } = await invoke('db:status', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertStringIncludes(
            error.message,
            'db:status refused: the migrations',
        )
        assertEquals(calls, [])
    } finally {
        await Deno.remove(folder, { recursive: true })
    }
})

Deno.test('#439 db:status - a connection that cannot be opened exits 1', async () => {
    await withMigrations(async (folder) => {
        const { deps } = statusDeps(statusConfig(folder), {
            openError: new Error('Database not configured: no client'),
        })

        const { lines, error } = await invoke('db:status', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(error.message, 'Could not open the database')
        assertEquals(
            (error.cause as Error).message,
            'Database not configured: no client',
        )
        assertEquals(lines, [])
    })
})

Deno.test('#439 db:status - an R4 refusal from the opener is framed, with no drizzle-kit clause', async () => {
    await withMigrations(async (folder) => {
        const { deps } = statusDeps(statusConfig(folder), {
            openError: new RefusedError('the driver offers no maintenance', {
                kitOnly: true,
            }),
        })

        const { error } = await invoke('db:status', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(
            error.message,
            'db:status refused: the driver offers no maintenance. ' +
                'No migration status was read.',
        )
    })
})

for (
    const [label, failQuery] of [['catalogue', 1], ['bookkeeping', 2]] as const
) {
    Deno.test(`#439 db:status - a failed ${label} query exits 1 and closes the session`, async () => {
        await withMigrations(async (folder) => {
            const { calls, deps } = statusDeps(statusConfig(folder), {
                failQuery,
            })

            const { lines, error } = await invoke('db:status', deps)

            assert(error instanceof CommandFailedError, String(error))
            assertEquals(error.message, 'Could not read the migration status')
            assertEquals(
                (error.cause as Error).message,
                'relation read failed',
            )
            assertEquals(calls.at(-1), 'close', 'the connection was not closed')
            assertEquals(lines, [])
        })
    })
}

Deno.test('#439 db:status - a malformed bookkeeping row exits 1 and closes the session', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = statusDeps(statusConfig(folder), {
            rows: [{ hash: 'h', created_at: null }],
        })

        const { error } = await invoke('db:status', deps)

        assert(error instanceof CommandFailedError, String(error))
        assertEquals(error.message, 'Could not read the migration status')
        assertEquals(
            (error.cause as Error).message,
            'the bookkeeping table "drizzle"."__drizzle_migrations" holds a ' +
                'row whose created_at is not an integer',
        )
        assertEquals(calls.at(-1), 'close')
    })
})

Deno.test('#439 db:status - reads, never writes: no execute, no migrate', async () => {
    await withMigrations(async (folder) => {
        const { calls, deps } = statusDeps(statusConfig(folder), { rows: [] })

        await invoke('db:status', deps)

        assertEquals(calls.includes('execute'), false)
        assertEquals(calls.includes('migrate'), false)
    })
})

Deno.test('#439 db:status runs in production without --allow-production: it is the deploy gate', async () => {
    await withMigrations(async (folder) => {
        const { deps } = statusDeps(statusConfig(folder), {
            rows: [{ hash: await sha256(INIT_SQL), created_at: '1' }],
        })
        const cli = new FakeCli()
        registerDrizzleCommands(cli, deps)

        const { error } = await capture(() =>
            withAppEnv('production', () => cli.run('db:status'))
        )

        assertEquals(error, undefined)
    })
})

Deno.test('#439 wiring - a real Cli exits 1 on a pending db:status, the count its last line', async () => {
    await withMigrations(async (folder) => {
        const { deps } = statusDeps(statusConfig(folder), { rows: [] })

        const { status, errors } = await dispatchReal(deps, ['db:status'])

        assertEquals(status, 1)
        assertEquals(errors, [[
            '❌ 1 of 1 migration is not applied: 1 pending',
        ]])
    })
})
