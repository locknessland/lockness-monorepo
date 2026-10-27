/**
 * @fileoverview Direct coverage of `report()` — the scheduler's reporter
 * guard (#394): reporter, then console, then `Deno.stderr`, and never throw.
 *
 * The CR/LF and BigInt cases below cover #410: an unencoded `\r`/`\n` in a
 * warning forges a second log line, and `renderLine`'s documented BigInt
 * failure mode had no test.
 *
 * @module @lockness/scheduler/tests/reporting
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { stub } from '@std/testing/mock'
import { report } from '../reporting.ts'
import type { SchedulerReporter } from '../types.ts'

Deno.test('report - the reporter succeeds and console is never touched', () => {
    const consoleWarn = stub(console, 'warn')
    try {
        const calls: Array<[string, Record<string, unknown>]> = []
        const reporter: SchedulerReporter = {
            warn: (m, f) => void calls.push([m, f]),
            error: () => {},
        }
        report(reporter, 'warn', 'hello', { a: 1 })
        assertEquals(calls, [['hello', { a: 1 }]])
        assertEquals(consoleWarn.calls.length, 0, 'the reporter replaced it')
    } finally {
        consoleWarn.restore()
    }
})

Deno.test('report - no reporter falls back to console', () => {
    const consoleWarn = stub(console, 'warn')
    try {
        report(undefined, 'warn', 'hello', { a: 1 })
        assertEquals(consoleWarn.calls.length, 1)
        assertEquals(consoleWarn.calls[0].args, ['⚠️  hello', { a: 1 }])
    } finally {
        consoleWarn.restore()
    }
})

Deno.test('report - a throwing reporter falls back to console', () => {
    const consoleError = stub(console, 'error')
    try {
        const reporter: SchedulerReporter = {
            warn: () => {},
            error: () => {
                throw new Error('reporter is down')
            },
        }
        report(reporter, 'error', 'boom', { task: 'x' })
        assertEquals(consoleError.calls.length, 1)
        assertEquals(consoleError.calls[0].args, ['⚠️  boom', { task: 'x' }])
    } finally {
        consoleError.restore()
    }
})

Deno.test('report - a throwing reporter AND a throwing console fall back to stderr', () => {
    const consoleWarn = stub(console, 'warn', () => {
        throw new Error('console is down')
    })
    const realWrite = Deno.stderr.writeSync
    const written: string[] = []
    Deno.stderr.writeSync = (data: Uint8Array) => {
        written.push(new TextDecoder().decode(data))
        return data.length
    }
    try {
        const reporter: SchedulerReporter = {
            warn: () => {
                throw new Error('reporter is down')
            },
            error: () => {},
        }
        report(reporter, 'warn', 'both down', { task: 'y' })
        assertEquals(written.length, 1)
        assertEquals(written[0].includes('both down'), true)
        assertEquals(written[0].includes('"task":"y"'), true)
    } finally {
        Deno.stderr.writeSync = realWrite
        consoleWarn.restore()
    }
})

Deno.test('report - reporter, console AND stderr all throwing drops the message without throwing', () => {
    const consoleWarn = stub(console, 'warn', () => {
        throw new Error('console is down')
    })
    const realWrite = Deno.stderr.writeSync
    Deno.stderr.writeSync = () => {
        throw new Error('stderr is down')
    }
    try {
        const reporter: SchedulerReporter = {
            warn: () => {
                throw new Error('reporter is down')
            },
            error: () => {},
        }
        // Reaching the assertion below — rather than an uncaught exception
        // failing this test — IS the proof: all three channels refused, and
        // report() dropped the line instead of re-throwing.
        report(reporter, 'warn', 'all down', {})
        assertEquals(true, true)
    } finally {
        Deno.stderr.writeSync = realWrite
        consoleWarn.restore()
    }
})

Deno.test('report - fields that JSON.stringify refuses still reach stderr as the message alone', () => {
    const consoleWarn = stub(console, 'warn', () => {
        throw new Error('console is down')
    })
    const realWrite = Deno.stderr.writeSync
    const written: string[] = []
    Deno.stderr.writeSync = (data: Uint8Array) => {
        written.push(new TextDecoder().decode(data))
        return data.length
    }
    try {
        const circular: Record<string, unknown> = {}
        circular.self = circular
        const reporter: SchedulerReporter = {
            warn: () => {
                throw new Error('reporter is down')
            },
            error: () => {},
        }
        report(reporter, 'warn', 'circular fields', circular)
        assertEquals(written.length, 1)
        assertEquals(written[0], 'circular fields\n')
    } finally {
        Deno.stderr.writeSync = realWrite
        consoleWarn.restore()
    }
})

Deno.test('report - a CR/LF-bearing message is escaped before reaching console', () => {
    const consoleWarn = stub(console, 'warn')
    try {
        report(undefined, 'warn', 'line one\r\nFAKE LOG LINE', {})
        assertEquals(consoleWarn.calls.length, 1)
        const [rendered] = consoleWarn.calls[0].args as [string, unknown]
        assertStringIncludes(rendered, '\\x0d\\x0a')
        assertEquals(rendered.includes('\r'), false)
        assertEquals(rendered.includes('\n'), false)
    } finally {
        consoleWarn.restore()
    }
})

Deno.test('report - a CR/LF-bearing field value is escaped before reaching console', () => {
    const consoleWarn = stub(console, 'warn')
    try {
        report(undefined, 'warn', 'hello', { task: 'a\r\nFAKE LOG LINE' })
        assertEquals(consoleWarn.calls.length, 1)
        const [, fields] = consoleWarn.calls[0].args as [
            string,
            Record<string, unknown>,
        ]
        assertEquals(fields.task, 'a\\x0d\\x0aFAKE LOG LINE')
    } finally {
        consoleWarn.restore()
    }
})

Deno.test('report - a CR/LF-bearing message is escaped before reaching stderr', () => {
    const consoleWarn = stub(console, 'warn', () => {
        throw new Error('console is down')
    })
    const realWrite = Deno.stderr.writeSync
    const written: string[] = []
    Deno.stderr.writeSync = (data: Uint8Array) => {
        written.push(new TextDecoder().decode(data))
        return data.length
    }
    try {
        report(undefined, 'warn', 'line one\r\nFAKE LOG LINE', {})
        assertEquals(written.length, 1)
        assertStringIncludes(written[0], '\\x0d\\x0a')
        assertEquals(written[0].includes('\r'), false)
        // The trailing '\n' this function itself appends is fine; only ONE
        // newline — the one report() adds — may exist in the line.
        assertEquals(written[0].split('\n').length, 2)
    } finally {
        Deno.stderr.writeSync = realWrite
        consoleWarn.restore()
    }
})

Deno.test('report - a CR/LF-bearing field value is escaped before reaching stderr', () => {
    const consoleWarn = stub(console, 'warn', () => {
        throw new Error('console is down')
    })
    const realWrite = Deno.stderr.writeSync
    const written: string[] = []
    Deno.stderr.writeSync = (data: Uint8Array) => {
        written.push(new TextDecoder().decode(data))
        return data.length
    }
    try {
        report(undefined, 'warn', 'hello', { task: 'a\r\nFAKE LOG LINE' })
        assertEquals(written.length, 1)
        // The escaped field value ('a\x0d\x0aFAKE LOG LINE', as literal
        // characters) is JSON-encoded for stderr, so its own backslashes are
        // doubled by JSON.stringify — build the expectation the same way
        // rather than hand-writing the doubled escapes.
        const expectedFields = JSON.stringify({
            task: 'a\\x0d\\x0aFAKE LOG LINE',
        })
        assertEquals(written[0], `hello ${expectedFields}\n`)
        assertEquals(written[0].includes('a\r\nFAKE'), false)
    } finally {
        Deno.stderr.writeSync = realWrite
        consoleWarn.restore()
    }
})

Deno.test('report - the reporter receives the escaped message but raw, structured fields', () => {
    const calls: Array<[string, Record<string, unknown>]> = []
    const reporter: SchedulerReporter = {
        warn: (m, f) => void calls.push([m, f]),
        error: () => {},
    }
    report(reporter, 'warn', 'line one\r\nFAKE LOG LINE', {
        task: 'a\r\nFAKE LOG LINE',
    })
    assertEquals(calls.length, 1)
    const [message, fields] = calls[0]
    // The message IS encoded, even for the reporter — #410's binding
    // disposition: encode once, unconditionally, at the top of report().
    assertStringIncludes(message, '\\x0d\\x0a')
    // The fields object is NOT encoded for the reporter: the application's own
    // logger owns encoding for its own sink, and the reporter needs the
    // structured value back, not a string transcript of it.
    assertEquals(fields.task, 'a\r\nFAKE LOG LINE')
})

Deno.test('report - a BigInt field on the fields-drop path reaches renderLine unchanged and does not throw', () => {
    // Pins the ordering the #410 disposition requires: the encoder only
    // touches strings and must not throw on a BigInt, so this reaches
    // `renderLine`'s existing `JSON.stringify` catch exactly as it did before
    // #410 — proving the new encoder did not change this failure mode.
    const consoleWarn = stub(console, 'warn', () => {
        throw new Error('console is down')
    })
    const realWrite = Deno.stderr.writeSync
    const written: string[] = []
    Deno.stderr.writeSync = (data: Uint8Array) => {
        written.push(new TextDecoder().decode(data))
        return data.length
    }
    try {
        const reporter: SchedulerReporter = {
            warn: () => {
                throw new Error('reporter is down')
            },
            error: () => {},
        }
        report(reporter, 'warn', 'bigint field', { count: 9007199254740993n })
        assertEquals(written.length, 1)
        assertEquals(written[0], 'bigint field\n')
    } finally {
        Deno.stderr.writeSync = realWrite
        consoleWarn.restore()
    }
})

Deno.test('report - a CR/LF-bearing message stays on one line even on the fields-drop path', () => {
    // #410's ordering guarantee (b): `message` is encoded before the try that
    // can drop `fields`, so a forged message still renders single-line on the
    // path where JSON.stringify(fields) throws — the escape is NOT supplied
    // only incidentally by JSON.stringify's own quoting.
    const consoleWarn = stub(console, 'warn', () => {
        throw new Error('console is down')
    })
    const realWrite = Deno.stderr.writeSync
    const written: string[] = []
    Deno.stderr.writeSync = (data: Uint8Array) => {
        written.push(new TextDecoder().decode(data))
        return data.length
    }
    try {
        const reporter: SchedulerReporter = {
            warn: () => {
                throw new Error('reporter is down')
            },
            error: () => {},
        }
        report(reporter, 'warn', 'forged\r\nFAKE LOG LINE', {
            count: 1n,
        })
        assertEquals(written.length, 1)
        assertEquals(written[0], 'forged\\x0d\\x0aFAKE LOG LINE\n')
    } finally {
        Deno.stderr.writeSync = realWrite
        consoleWarn.restore()
    }
})
