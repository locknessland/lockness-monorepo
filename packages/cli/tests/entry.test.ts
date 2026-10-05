/**
 * @fileoverview `runEntry` — a standalone tool's work runs under the CLI exit
 * contract (#436, plan §5 "How a standalone entry runs its work").
 *
 * In-process: the status, the one printed line and `Deno.exitCode`. As a
 * subprocess: the real exit status, a fake credential in message and cause
 * absent from stderr, and no `error: Uncaught`. Every fake credential is
 * assembled at run time.
 *
 * @module @lockness/cli/tests/entry
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { CommandFailedError } from '../command_failure.ts'
import { runEntry } from '../entry.ts'

/**
 * Run `fn` with `console.error` recorded and `Deno.exitCode` preset to
 * `preset`, returning what was printed and the exit code it left — always
 * restoring both, so a leaked non-zero code cannot fail the test process.
 */
async function observe<T>(
    preset: number,
    fn: () => Promise<T>,
): Promise<{ result: T; error: unknown[][]; exitCode: number }> {
    const error: unknown[][] = []
    const original = { error: console.error, exitCode: Deno.exitCode }
    console.error = (...args: unknown[]) => void error.push(args)
    Deno.exitCode = preset
    try {
        const result = await fn()
        return { result, error, exitCode: Deno.exitCode }
    } finally {
        console.error = original.error
        Deno.exitCode = original.exitCode
    }
}

/** A fake secret, distinct per call; it must never reach stderr. */
function fakeSecret(tag: string): string {
    return ['fx', tag, crypto.randomUUID().slice(0, 8)].join('')
}

Deno.test('runEntry - work that resolves returns 0 and leaves Deno.exitCode as it was', async () => {
    let ran = false
    const { result, error, exitCode } = await observe(
        7,
        () =>
            runEntry('tool', () => {
                ran = true
            }),
    )
    assert(ran)
    assertEquals(result, 0)
    assertEquals(error, [])
    assertEquals(exitCode, 7)
})

Deno.test('runEntry - a failure returns its status, sets Deno.exitCode and prints one ❌ line', async () => {
    const { result, error, exitCode } = await observe(
        0,
        () =>
            runEntry('tool', () =>
                Promise.reject(
                    new CommandFailedError('No kit named "x"', { exitCode: 2 }),
                )),
    )
    assertEquals(result, 2)
    assertEquals(exitCode, 2)
    assertEquals(error, [['❌ No kit named "x"']])
})

Deno.test('runEntry - a synchronous throw is caught too', async () => {
    const { result, error } = await observe(0, () =>
        runEntry('tool', () => {
            throw new CommandFailedError('A component name is required')
        }))
    assertEquals(result, 1)
    assertEquals(error, [['❌ A component name is required']])
})

Deno.test('runEntry - a TypeError takes the catch-all branch under the label', async () => {
    const original = Deno.env.get('LOCKNESS_CLI_RAW_ERRORS')
    Deno.env.delete('LOCKNESS_CLI_RAW_ERRORS')
    try {
        const { result, error, exitCode } = await observe(
            0,
            () =>
                runEntry('tool', () => {
                    throw new TypeError('x is undefined')
                }),
        )
        assertEquals(result, 1)
        assertEquals(exitCode, 1)
        assertEquals(error.length, 1)
        const line = String(error[0][0])
        assert(
            line.startsWith(
                '❌ tool failed: TypeError: x is undefined\n    at ',
            ),
            line,
        )
    } finally {
        if (original !== undefined) {
            Deno.env.set('LOCKNESS_CLI_RAW_ERRORS', original)
        }
    }
})

Deno.test('runEntry - a finally block in the work still runs on failure', async () => {
    let closed = false
    const { result } = await observe(0, () =>
        runEntry('tool', async () => {
            try {
                await Promise.reject(new CommandFailedError('write failed'))
            } finally {
                closed = true
            }
        }))
    assertEquals(result, 1)
    assert(closed)
})

for (const kind of ['failure', 'unexpected'] as const) {
    Deno.test(`runEntry - a subprocess whose work throws (${kind}) exits non-zero, redacted, with no uncaught error`, async () => {
        const [inMessage, inCause] = ['msg', 'cause'].map(fakeSecret)
        const fixture = new URL('./fixtures/entry/tool.ts', import.meta.url)
        const { code, stdout, stderr } = await new Deno.Command(
            Deno.execPath(),
            {
                args: ['run', fixture.pathname, kind, inMessage, inCause],
                env: { NO_COLOR: '1' },
                stdout: 'piped',
                stderr: 'piped',
            },
        ).output()
        const out = new TextDecoder().decode(stdout) +
            new TextDecoder().decode(stderr)
        assertEquals(code, 1, out)
        assert(!out.includes(inMessage), out)
        assert(!out.includes(inCause), out)
        assert(!out.includes('error: Uncaught'), out)
        assertEquals(out.split('❌').length - 1, 1, out)
        assertStringIncludes(out, 'postgres://***:***@db.test/app')
        assertStringIncludes(out, 'api_key=***')
    })
}
