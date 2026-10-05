/**
 * @fileoverview The `@lockness/cli` exit contract (#428).
 *
 * A handler reports failure by throwing; {@link Cli.dispatch} prints it once
 * and maps it to an exit status, and {@link Cli.run} hands a non-zero status to
 * `Deno.exitCode`. These tests pin every row of that contract:
 *
 * | Case                              | Exit                       | Printed                    |
 * | :-------------------------------- | :------------------------- | :------------------------- |
 * | no command                        | 0                          | the command list           |
 * | unknown command                   | 1                          | `❌ Unknown command` + list |
 * | handler resolves                  | 0                          | —                          |
 * | failure-shaped throw              | its `exitCode` (1–255) / 1 | `❌ <message>`, no stack    |
 * | any other throw                   | 1                          | `❌ <name> failed: ` + `renderError(error, { frames: 10 })` + hint |
 * | any other throw, raw switch on    | 1                          | banner + `❌ <name> failed:` + the error object |
 *
 * The last two rows are #488: by default the error is rendered — name, vetted
 * code, redacted message per link, then frames — and raw only with
 * `LOCKNESS_CLI_RAW_ERRORS=1`. Every case prints exactly one `console.error`.
 * A switch value that cannot be read at all (#508) is the default row with a
 * notice in place of the hint: the command's own error is never lost.
 *
 * @module @lockness/cli/tests/cli_dispatch
 */

import {
    assert,
    assertEquals,
    assertStrictEquals,
    assertStringIncludes,
} from '@std/assert'
import {
    Cli,
    Command,
    type CommandContext,
    type CommandContract,
    CommandFailedError,
} from '../mod.ts'
import { isCommandFailure } from '../exit_status.ts'

// -----------------------------------------------------------------------------
// Console capture
// -----------------------------------------------------------------------------

/** Every `console.log` / `console.error` call made while `fn` ran. */
interface Captured {
    readonly log: unknown[][]
    readonly error: unknown[][]
}

/**
 * Run `fn` with `console.log` and `console.error` recorded instead of printed,
 * restoring both afterwards.
 */
async function capture<T>(
    fn: () => Promise<T>,
): Promise<{ result: T } & Captured> {
    const log: unknown[][] = []
    const error: unknown[][] = []
    const original = { log: console.log, error: console.error }
    console.log = (...args: unknown[]) => void log.push(args)
    console.error = (...args: unknown[]) => void error.push(args)
    try {
        const result = await fn()
        return { result, log, error }
    } finally {
        console.log = original.log
        console.error = original.error
    }
}

/** A `Cli` with one command, `task`, whose handler is `handler`. */
function cliWith(handler: () => Promise<void>): Cli {
    const cli = new Cli()
    cli.register('task', handler, 'A test command')
    return cli
}

/** An error from a package that cannot import `@lockness/cli`. */
class LocalFailure extends Error {
    constructor(message: string, readonly exitCode: number) {
        super(message)
        this.name = 'LocalFailure'
    }
}

// -----------------------------------------------------------------------------
// CommandFailedError
// -----------------------------------------------------------------------------

Deno.test('CommandFailedError - defaults exitCode to 1 and keeps the cause', () => {
    const cause = new Error('root')
    const error = new CommandFailedError('migration failed', { cause })
    assertEquals(error.exitCode, 1)
    assertEquals(error.message, 'migration failed')
    assertEquals(error.name, 'CommandFailedError')
    assertEquals(error.cause, cause)
    assert(error instanceof Error)
})

Deno.test('CommandFailedError - keeps an explicit exit code in range', () => {
    assertEquals(new CommandFailedError('x', { exitCode: 3 }).exitCode, 3)
})

// The constructor clamps on its own, not only when `Cli.dispatch` reads the
// code: a programmatic caller that inspects `exitCode` must never see `0` or a
// status the operating system would truncate (#440(d)).
for (const code of [0, 256, NaN, -1]) {
    Deno.test(`CommandFailedError - clamps exitCode ${code} to 1 in the constructor`, () => {
        assertEquals(
            new CommandFailedError('x', { exitCode: code }).exitCode,
            1,
        )
    })
}

Deno.test('isCommandFailure - recognises the shape, not the class', () => {
    assert(isCommandFailure(new CommandFailedError('x')))
    assert(isCommandFailure(new LocalFailure('x', 2)))
    assert(!isCommandFailure(new Error('x')))
    assert(!isCommandFailure({ message: 'x', exitCode: 1 }))
    assert(!isCommandFailure(Object.assign(new Error('x'), { exitCode: 1.5 })))
    assert(!isCommandFailure(Object.assign(new Error('x'), { exitCode: '1' })))
})

// -----------------------------------------------------------------------------
// Cli.dispatch — the exit table
// -----------------------------------------------------------------------------

Deno.test('dispatch - a handler that resolves exits 0 and prints no error', async () => {
    const cli = cliWith(() => Promise.resolve())
    const { result, error } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 0)
    assertEquals(error, [])
})

Deno.test('dispatch - a CommandFailedError exits 1 with one stderr line and no stack', async () => {
    const cli = cliWith(() =>
        Promise.reject(new CommandFailedError('Failed to apply migrations'))
    )
    const { result, error } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 1)
    assertEquals(error, [['❌ Failed to apply migrations']])
})

Deno.test('dispatch - an in-range exit code is kept', async () => {
    const cli = cliWith(() =>
        Promise.reject(new CommandFailedError('x', { exitCode: 3 }))
    )
    const { result } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 3)
})

for (const code of [0, 256, NaN, -1]) {
    Deno.test(`dispatch - CommandFailedError with exitCode ${code} exits 1`, async () => {
        const cli = cliWith(() =>
            Promise.reject(new CommandFailedError('x', { exitCode: code }))
        )
        const { result, error } = await capture(() => cli.dispatch(['task']))
        assertEquals(result, 1)
        assertEquals(error, [['❌ x']])
    })
}

Deno.test('dispatch - a local failure-shaped subclass keeps its exit code', async () => {
    const cli = cliWith(() => Promise.reject(new LocalFailure('mail down', 4)))
    const { result, error } = await capture(() => cli.dispatch(['task']))
    assertEquals(result, 4)
    assertEquals(error, [['❌ mail down']])
})

for (const code of [0, 256, -3]) {
    Deno.test(`dispatch - a failure-shaped error with exitCode ${code} is clamped to 1`, async () => {
        const cli = cliWith(() => Promise.reject(new LocalFailure('x', code)))
        const { result, error } = await capture(() => cli.dispatch(['task']))
        assertEquals(result, 1)
        assertEquals(error, [['❌ x']])
    })
}

Deno.test('dispatch - an unexpected Error exits 1, rendered once with its frames', async () => {
    const boom = new TypeError('cannot read foo of undefined')
    const cli = cliWith(() => Promise.reject(boom))
    const { result, error } = await withRawErrors(
        undefined,
        () => capture(() => cli.dispatch(['task'])),
    )
    assertEquals(result, 1)
    assertEquals(error.length, 1)
    assertEquals(error[0].length, 1)
    const [line] = error[0] as [string]
    assert(
        line.startsWith(
            '❌ task failed: TypeError: cannot read foo of undefined\n    at ',
        ),
        line,
    )
    assert(line.endsWith(`\n${OFF_HINT}`), line)
})

Deno.test('dispatch - a non-Error throw exits 1 as one rendered string (#440(f))', async () => {
    const cli = cliWith(() => Promise.reject('plain string'))
    const { result, error } = await withRawErrors(
        undefined,
        () => capture(() => cli.dispatch(['task'])),
    )
    assertEquals(result, 1)
    assertEquals(error, [[`❌ task failed: plain string\n${OFF_HINT}`]])
})

// -----------------------------------------------------------------------------
// Cli.dispatch — the non-failure branch prints through renderError (#488)
// -----------------------------------------------------------------------------

/** A fake secret, distinct per call; it must never reach stderr. */
function fakeSecret(tag: string): string {
    return ['fx', tag, crypto.randomUUID().slice(0, 8)].join('')
}

/** What the console prints for one call: strings as-is, the rest inspected. */
function printed(args: unknown[]): string {
    return args.map((x) => typeof x === 'string' ? x : Deno.inspect(x))
        .join(' ')
}

/** Assert that `secret` is nowhere in `out`. */
function assertAbsent(out: string, secret: string): void {
    assert(!out.includes(secret), `leaked ${JSON.stringify(secret)}:\n${out}`)
}

/** The raw switch's variable. */
const RAW = 'LOCKNESS_CLI_RAW_ERRORS'

/** The last line of a redacted print when the switch is off. */
const OFF_HINT =
    '(Credentials redacted. LOCKNESS_CLI_RAW_ERRORS=1 prints the raw error; never set it where the log is public.)'

/**
 * Run `fn` with the raw switch set to `value` (unset when `undefined`), always
 * restoring what the process had — so a developer's shell cannot flip a
 * default-state test, and a test cannot leak the switch into the next one.
 */
async function withRawErrors<T>(
    value: string | undefined,
    fn: () => Promise<T>,
): Promise<T> {
    const original = Deno.env.get(RAW)
    if (value === undefined) Deno.env.delete(RAW)
    else Deno.env.set(RAW, value)
    try {
        return await fn()
    } finally {
        if (original === undefined) Deno.env.delete(RAW)
        else Deno.env.set(RAW, original)
    }
}

/**
 * An error carrying a fake credential in its message, in a nested cause (with
 * a code that fails the spelling check), and in two of its stack frames.
 */
function credentialBearingError(): { boom: Error; secrets: string[] } {
    const [message, dsn, userinfo, query, code] = [
        'msg',
        'dsn',
        'frame',
        'query',
        'code',
    ].map(fakeSecret)
    const nested = Object.assign(
        new Error(`connect failed: postgres://app:${dsn}@db.test/app`),
        { code: `x-${code}` },
    )
    const wrapper = new Error('pool exhausted', { cause: nested })
    const head = `request failed: https://api.test/v1?api_key=${message}`
    const boom = new Error(head, { cause: wrapper })
    boom.stack = [
        `Error: ${head}`,
        `    at fetchUser (https://u:${userinfo}@cdn.test/mod.ts:1:2)`,
        `    at file:///app/x.ts?token=${query}:2:3`,
    ].join('\n')
    return { boom, secrets: [message, dsn, userinfo, query, code] }
}

Deno.test('dispatch - T1 by default no credential reaches stderr from message, cause, code or frame', async () => {
    const { boom, secrets } = credentialBearingError()
    const cli = cliWith(() => Promise.reject(boom))
    const { result, error } = await withRawErrors(
        undefined,
        () => capture(() => cli.dispatch(['task'])),
    )
    assertEquals(result, 1)
    assertEquals(error.length, 1)
    const out = printed(error[0])
    for (const secret of secrets) assertAbsent(out, secret)
    assertStringIncludes(out, '***')
    // Both cause links rendered, so redaction — not truncation — removed them.
    assertStringIncludes(out, 'caused by: Error: pool exhausted')
    assertStringIncludes(out, 'caused by: Error: connect failed: postgres://')
    assertStringIncludes(out, 'at fetchUser (https://***')
})

/** Throws from a named function, so its frame is recognisable on stderr. */
function explodeForT2(): never {
    throw new RangeError('t2 frame marker')
}

Deno.test('dispatch - T2 the top-level frames are kept, and the message is printed once (#440)', async () => {
    const cli = cliWith(async () => {
        await Promise.resolve()
        explodeForT2()
    })
    const { error } = await withRawErrors(
        undefined,
        () => capture(() => cli.dispatch(['task'])),
    )
    const out = printed(error[0])
    assertStringIncludes(out, 'at explodeForT2')
    assertStringIncludes(out, 'cli_dispatch.test.ts')
    assertEquals(out.split('t2 frame marker').length - 1, 1, out)
})

Deno.test('dispatch - T3 with the switch unset, no Error object reaches the console', async () => {
    const boom = new Error('unset switch')
    const cli = cliWith(() => Promise.reject(boom))
    const { result, error } = await withRawErrors(
        undefined,
        () => capture(() => cli.dispatch(['task'])),
    )
    assertEquals(result, 1)
    assertEquals(error.length, 1)
    for (const arg of error[0]) assertEquals(typeof arg, 'string')
    assertStringIncludes(printed(error[0]), OFF_HINT)
})

Deno.test('dispatch - T4 with the switch on, a banner precedes the same error object', async () => {
    const boom = new Error('raw on purpose')
    const cli = cliWith(() => Promise.reject(boom))
    const { result, error } = await withRawErrors(
        '1',
        () => capture(() => cli.dispatch(['task'])),
    )
    assertEquals(result, 1)
    assertEquals(error.length, 1)
    assertEquals(
        error[0][0],
        '⚠️ LOCKNESS_CLI_RAW_ERRORS is on: the error below is unredacted.\n❌ task failed:',
    )
    assertStrictEquals(error[0][1], boom)
})

Deno.test('dispatch - T5 an unrecognised switch value prints redacted output and a notice', async () => {
    const { boom, secrets } = credentialBearingError()
    const cli = cliWith(() => Promise.reject(boom))
    const { result, error } = await withRawErrors(
        'maybe',
        () => capture(() => cli.dispatch(['task'])),
    )
    assertEquals(result, 1)
    assertEquals(error.length, 1)
    for (const arg of error[0]) assertEquals(typeof arg, 'string')
    const out = printed(error[0])
    for (const secret of secrets) assertAbsent(out, secret)
    assertStringIncludes(out, `${RAW}="maybe" is not recognised`)
    assert(!out.includes(OFF_HINT), out)
})

Deno.test({
    name:
        'dispatch - T6 a switch value that is not valid Unicode still prints the real error once, exit 1',
    // A POSIX shell builds the bytes; `Deno.Command` takes only strings.
    ignore: Deno.build.os === 'windows',
    async fn() {
        const message = ['fx', 'real', crypto.randomUUID().slice(0, 8)].join(
            '',
        )
        const fixture = new URL(
            './fixtures/raw-errors/dispatch.ts',
            import.meta.url,
        )
        const { code, stdout, stderr } = await new Deno.Command('sh', {
            args: [
                '-c',
                `${RAW}="$(printf '\\377\\376')" exec "$0" run --allow-env "$1" "$2"`,
                Deno.execPath(),
                fixture.pathname,
                message,
            ],
            cwd: new URL('..', import.meta.url).pathname,
            stdout: 'piped',
            stderr: 'piped',
        }).output()
        const out = new TextDecoder().decode(stdout) +
            new TextDecoder().decode(stderr)
        assertEquals(code, 1, out)
        assertEquals(
            out.split(`❌ task failed: Error: ${message}`).length - 1,
            1,
            out,
        )
        assertStringIncludes(
            out,
            `${RAW}=<not valid Unicode> could not be read`,
        )
        assert(!out.includes('InvalidData'), out)
    },
})

Deno.test('dispatch - T8 a pg-shaped error shows its SQLSTATE and neither detail nor hint', async () => {
    const detail = fakeSecret('detail')
    const hint = fakeSecret('hint')
    const pg = Object.assign(
        new Error(
            'duplicate key value violates unique constraint "users_email_key"',
        ),
        {
            name: 'PostgresError',
            code: '23505',
            detail: `Key (email)=(${detail}) already exists.`,
            hint: `Try ${hint}`,
        },
    )
    const cli = cliWith(() => Promise.reject(pg))
    const { result, error } = await withRawErrors(
        undefined,
        () => capture(() => cli.dispatch(['task'])),
    )
    assertEquals(result, 1)
    assertEquals(error.length, 1)
    const out = printed(error[0])
    assertStringIncludes(
        out,
        '❌ task failed: PostgresError [23505]: duplicate key value violates',
    )
    assertAbsent(out, detail)
    assertAbsent(out, hint)
})

Deno.test('dispatch - an unknown command exits 1 and lists the commands', async () => {
    const cli = cliWith(() => Promise.resolve())
    const { result, error, log } = await capture(() => cli.dispatch(['nope']))
    assertEquals(result, 1)
    assertEquals(error, [['❌ Unknown command: nope']])
    assertStringIncludes(log.flat().join('\n'), 'Available commands:')
})

Deno.test('dispatch - no command exits 0 and lists the commands', async () => {
    const cli = cliWith(() => Promise.resolve())
    const { result, error, log } = await capture(() => cli.dispatch([]))
    assertEquals(result, 0)
    assertEquals(error, [])
    assertStringIncludes(log.flat().join('\n'), 'task')
})

Deno.test('dispatch - passes the remaining arguments to the handler', async () => {
    const cli = new Cli()
    let received: string[] = []
    cli.register('task', (args) => {
        received = args
        return Promise.resolve()
    })
    await cli.dispatch(['task', 'a', '--b'])
    assertEquals(received, ['a', '--b'])
})

Deno.test('dispatch - a class-based handle() that throws exits 1', async () => {
    @Command('explode', 'Throws from handle()')
    class ExplodeCommand implements CommandContract {
        handle(_ctx: CommandContext): Promise<void> {
            return Promise.reject(new CommandFailedError('exploded'))
        }
    }
    const cli = new Cli()
    cli.registerCommand(ExplodeCommand)
    const { result, error } = await capture(() => cli.dispatch(['explode']))
    assertEquals(result, 1)
    assertEquals(error, [['❌ exploded']])
})

// -----------------------------------------------------------------------------
// Cli.run — writes a non-zero status to Deno.exitCode, and only that
// -----------------------------------------------------------------------------

/**
 * Run `fn` with `Deno.exitCode` preset to `preset`, returning the value it
 * held afterwards and always restoring the original — a leaked non-zero value
 * would fail the whole test process.
 */
async function withExitCode(
    preset: number,
    fn: () => Promise<unknown>,
): Promise<number> {
    const original = Deno.exitCode
    Deno.exitCode = preset
    try {
        await fn()
        return Deno.exitCode
    } finally {
        Deno.exitCode = original
    }
}

Deno.test('run - a failure sets Deno.exitCode and returns the status', async () => {
    const cli = cliWith(() =>
        Promise.reject(new CommandFailedError('x', { exitCode: 2 }))
    )
    let returned = -1
    const after = await withExitCode(0, async () => {
        const { result } = await capture(() => cli.run(['task']))
        returned = result
    })
    assertEquals(after, 2)
    assertEquals(returned, 2)
})

Deno.test('run - an unknown command sets Deno.exitCode to 1', async () => {
    const cli = cliWith(() => Promise.resolve())
    const after = await withExitCode(0, () => capture(() => cli.run(['nope'])))
    assertEquals(after, 1)
})

Deno.test('run - a success leaves Deno.exitCode untouched', async () => {
    const cli = cliWith(() => Promise.resolve())
    // Preset to a non-zero value so an unconditional `Deno.exitCode = 0`
    // (overwriting another part of the process's status) is visible.
    const after = await withExitCode(7, () => capture(() => cli.run(['task'])))
    assertEquals(after, 7)
})
