/**
 * @fileoverview The one printer behind `Cli.dispatch`, `Cli.run` and
 * `runEntry` (#436, plan §5 rows 1 and 7).
 *
 * A failure prints `❌ <message>` rendered with `renderMessage`, then
 * ` caused by: <cause>` rendered with `renderError`, without frames, in one
 * `console.error` call; the printer never throws, whatever the error's getters
 * do. Every fake credential is assembled at run time, so no source line
 * carries a value a secret scanner would flag.
 *
 * @module @lockness/cli/tests/report
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { Cli, CommandFailedError } from '../mod.ts'
import { reportThrown } from '../report.ts'

/** Every `console.error` call made while `fn` ran; `console.log` is muted. */
async function captureErrors<T>(
    fn: () => T | Promise<T>,
): Promise<{ result: T; error: unknown[][] }> {
    const error: unknown[][] = []
    const original = { log: console.log, error: console.error }
    console.log = () => {}
    console.error = (...args: unknown[]) => void error.push(args)
    try {
        const result = await fn()
        return { result, error }
    } finally {
        console.log = original.log
        console.error = original.error
    }
}

/** A `Cli` with one command, `task`, that rejects with `thrown`. */
function cliThrowing(thrown: unknown): Cli {
    const cli = new Cli()
    cli.register('task', () => Promise.reject(thrown), 'A test command')
    return cli
}

/** A fake secret, distinct per call; it must never reach stderr. */
function fakeSecret(tag: string): string {
    return ['fx', tag, crypto.randomUUID().slice(0, 8)].join('')
}

/** The one line a single `console.error` call printed. */
function onlyLine(error: unknown[][]): string {
    assertEquals(
        error.length,
        1,
        `expected one console.error: ${Deno.inspect(error)}`,
    )
    assertEquals(
        error[0].length,
        1,
        `expected one argument: ${Deno.inspect(error[0])}`,
    )
    assertEquals(typeof error[0][0], 'string')
    return error[0][0] as string
}

/** A failure whose `property` getter throws when read. */
function withThrowingGetter(
    property: 'message' | 'cause' | 'exitCode',
): CommandFailedError {
    const failure = new CommandFailedError('getter failure', {
        cause: new Error('root'),
    })
    Object.defineProperty(failure, property, {
        get() {
            throw new Error(`${property} getter exploded`)
        },
    })
    return failure
}

Deno.test('report - a credential in a failure message and in its cause never reaches stderr', async () => {
    const [inMessage, inCause] = ['msg', 'cause'].map(fakeSecret)
    const failure = new CommandFailedError(
        `Cannot reach postgres://app:${inMessage}@db.test/app`,
        { cause: new Error(`fetch https://api.test/v1?api_key=${inCause}`) },
    )
    const { result, error } = await captureErrors(() =>
        cliThrowing(failure).dispatch(['task'])
    )
    assertEquals(result, 1)
    const line = onlyLine(error)
    assert(!line.includes(inMessage), line)
    assert(!line.includes(inCause), line)
    assertEquals(
        line,
        '❌ Cannot reach postgres://***:***@db.test/app caused by: ' +
            'Error: fetch https://api.test/v1?api_key=***',
    )
})

Deno.test('report - a failure prints its message and rendered cause on one line, with no frames', async () => {
    const failure = new CommandFailedError('Route generation failed', {
        cause: new TypeError('x is undefined'),
        exitCode: 3,
    })
    const { result, error } = await captureErrors(() =>
        cliThrowing(failure).dispatch(['task'])
    )
    assertEquals(result, 3)
    const line = onlyLine(error)
    assertEquals(
        line,
        '❌ Route generation failed caused by: TypeError: x is undefined',
    )
    assert(!line.includes('\n'), line)
})

Deno.test('report - an escape character or a newline in a failure message is encoded', async () => {
    const failure = new CommandFailedError(
        'bad name \x1b[2J\n❌ forged line',
    )
    const { error } = await captureErrors(() =>
        cliThrowing(failure).dispatch(['task'])
    )
    const line = onlyLine(error)
    assert(!line.includes('\x1b'), line)
    assert(!line.includes('\n'), line)
    assertEquals(line, '❌ bad name \\x1b[2J\\x0a❌ forged line')
})

Deno.test('report - an unknown command name is rendered, not printed raw', async () => {
    const cli = new Cli()
    const { result, error } = await captureErrors(() =>
        cli.dispatch(['nope\x1b[31m'])
    )
    assertEquals(result, 1)
    assertEquals(error, [['❌ Unknown command: nope\\x1b[31m']])
})

Deno.test('report - a throwing message getter does not escape the printer', async () => {
    const { result, error } = await captureErrors(() =>
        cliThrowing(withThrowingGetter('message')).dispatch(['task'])
    )
    assertEquals(result, 1)
    assertEquals(
        onlyLine(error),
        '❌ [unreadable message] caused by: Error: root',
    )
})

Deno.test('report - a throwing cause getter does not escape the printer', async () => {
    const { result, error } = await captureErrors(() =>
        cliThrowing(withThrowingGetter('cause')).dispatch(['task'])
    )
    assertEquals(result, 1)
    assertEquals(
        onlyLine(error),
        '❌ getter failure caused by: [unreadable cause]',
    )
})

Deno.test('report - a throwing exitCode getter prints one fallback line and exits 1', async () => {
    const { result, error } = await captureErrors(() =>
        cliThrowing(withThrowingGetter('exitCode')).dispatch(['task'])
    )
    assertEquals(result, 1)
    assertEquals(onlyLine(error), '❌ task failed: [unreportable error]')
})

Deno.test('reportThrown - a non-failure prints the catch-all branch under the label and returns 1', async () => {
    const original = Deno.env.get('LOCKNESS_CLI_RAW_ERRORS')
    Deno.env.delete('LOCKNESS_CLI_RAW_ERRORS')
    try {
        const { result, error } = await captureErrors(() =>
            reportThrown('tool', new TypeError('boom'))
        )
        assertEquals(result, 1)
        const line = onlyLine(error)
        assert(
            line.startsWith('❌ tool failed: TypeError: boom\n    at '),
            line,
        )
        assertStringIncludes(line, 'LOCKNESS_CLI_RAW_ERRORS=1')
    } finally {
        if (original !== undefined) {
            Deno.env.set('LOCKNESS_CLI_RAW_ERRORS', original)
        }
    }
})

Deno.test('reportThrown - a failure without a cause prints its message alone', async () => {
    const { result, error } = await captureErrors(() =>
        reportThrown('tool', new CommandFailedError('No kit named "x"'))
    )
    assertEquals(result, 1)
    assertEquals(onlyLine(error), '❌ No kit named "x"')
})

Deno.test('reportThrown - the label is rendered on the catch-all branch', async () => {
    const { error } = await withRawErrors(
        undefined,
        () =>
            captureErrors(() =>
                reportThrown('tool\x1b[2J', new TypeError('boom'))
            ),
    )
    const line = onlyLine(error)
    assert(line.startsWith('❌ tool\\x1b[2J failed: '), line)
})

Deno.test('reportThrown - the label is rendered on the raw branch', async () => {
    const { error } = await withRawErrors(
        '1',
        () =>
            captureErrors(() =>
                reportThrown('tool\x1b[2J', new TypeError('boom'))
            ),
    )
    assertEquals(error.length, 1)
    const banner = String(error[0][0])
    assert(!banner.includes('\x1b'), banner)
    assertStringIncludes(banner, '❌ tool\\x1b[2J failed:')
})

Deno.test('reportThrown - a broken stderr does not make it throw', () => {
    const original = console.error
    console.error = () => {
        throw new Error('stderr is closed')
    }
    try {
        assertEquals(reportThrown('tool', new TypeError('boom')), 1)
        assertEquals(
            reportThrown(
                'tool',
                new CommandFailedError('nope', { exitCode: 4 }),
            ),
            1,
        )
    } finally {
        console.error = original
    }
})

/** Run `fn` with `LOCKNESS_CLI_RAW_ERRORS` set to `value`, or unset. */
async function withRawErrors<T>(
    value: string | undefined,
    fn: () => Promise<T>,
): Promise<T> {
    const original = Deno.env.get('LOCKNESS_CLI_RAW_ERRORS')
    if (value === undefined) Deno.env.delete('LOCKNESS_CLI_RAW_ERRORS')
    else Deno.env.set('LOCKNESS_CLI_RAW_ERRORS', value)
    try {
        return await fn()
    } finally {
        if (original === undefined) {
            Deno.env.delete('LOCKNESS_CLI_RAW_ERRORS')
        } else Deno.env.set('LOCKNESS_CLI_RAW_ERRORS', original)
    }
}
