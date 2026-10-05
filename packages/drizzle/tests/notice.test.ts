/**
 * @fileoverview #454 — the notice routing table, and the console fallback's
 * one-line output.
 *
 * Hermetic: no server. A real `db:fresh` is covered by the live suite.
 *
 * @module @lockness/drizzle/tests/notice
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import {
    consoleNoticeReporter,
    type NoticeReporter,
    reportNotice,
} from '../notice.ts'

/** A reporter that records which channel each notice reached. */
function spyReporter() {
    const calls: Array<
        readonly [
            'warn' | 'debug',
            string,
            Readonly<Record<string, unknown>>,
        ]
    > = []
    const reporter: NoticeReporter = {
        warn: (message, fields) => void calls.push(['warn', message, fields]),
        debug: (message, fields) => void calls.push(['debug', message, fields]),
    }
    return { calls, reporter }
}

/** Capture every console line `fn` writes, by stream. */
function captureConsole(fn: () => void) {
    const lines = {
        log: [] as string[],
        warn: [] as string[],
        error: [] as string[],
    }
    const { log, warn, error } = console
    console.log = (...a: unknown[]) => void lines.log.push(a.join(' '))
    console.warn = (...a: unknown[]) => void lines.warn.push(a.join(' '))
    console.error = (...a: unknown[]) => void lines.error.push(a.join(' '))
    try {
        fn()
    } finally {
        console.log = log
        console.warn = warn
        console.error = error
    }
    return lines
}

Deno.test('#454 reportNotice - WARNING goes to warn', () => {
    const { calls, reporter } = spyReporter()
    reportNotice({ severity: 'WARNING', message: 'm' }, reporter)
    assertEquals(calls.map(([channel]) => channel), ['warn'])
})

for (const severity of ['NOTICE', 'INFO', 'LOG', 'DEBUG']) {
    Deno.test(`#454 reportNotice - ${severity} goes to debug`, () => {
        const { calls, reporter } = spyReporter()
        reportNotice({ severity, message: 'm' }, reporter)
        assertEquals(calls.map(([channel]) => channel), ['debug'])
    })
}

for (
    const [label, notice] of [
        ['an unrecognised severity', { severity: 'PANIC?', message: 'm' }],
        ['a missing severity', { message: 'm' }],
        ['a non-string severity', { severity: 3, message: 'm' }],
    ] as const
) {
    Deno.test(`#454 reportNotice - ${label} goes to warn`, () => {
        const { calls, reporter } = spyReporter()
        reportNotice(notice, reporter)
        assertEquals(calls.map(([channel]) => channel), ['warn'])
    })
}

for (const notice of [null, undefined, 'text', 42]) {
    Deno.test(`#454 reportNotice - a non-object (${String(notice)}) goes to warn with a placeholder`, () => {
        const { calls, reporter } = spyReporter()
        reportNotice(notice, reporter)
        assertEquals(calls.length, 1)
        assertEquals(calls[0][0], 'warn')
        assertStringIncludes(calls[0][1], 'unreadable PostgreSQL notice')
    })
}

Deno.test('#454 reportNotice - passes on only the present string fields', () => {
    const { calls, reporter } = spyReporter()
    reportNotice({
        severity: 'NOTICE',
        severity_local: 'NOTICE',
        message: 'schema "drizzle" already exists, skipping',
        code: '42P06',
        hint: 'h',
        file: 'schemacmds.c',
        line: '132',
        routine: 'CreateSchemaCommand',
    }, reporter)
    assertEquals(calls, [[
        'debug',
        'schema "drizzle" already exists, skipping',
        { severity: 'NOTICE', code: '42P06', hint: 'h' },
    ]])
})

Deno.test('#454 consoleNoticeReporter - a WARNING writes exactly one stderr line, with no object dump', () => {
    const lines = captureConsole(() =>
        reportNotice({
            severity: 'WARNING',
            message: 'there is no transaction in progress',
            code: '25P01',
        }, consoleNoticeReporter)
    )
    assertEquals(lines.log, [])
    assertEquals(lines.error, [])
    assertEquals(lines.warn, [
        '⚠️  PostgreSQL warning: there is no transaction in progress',
    ])
    assertEquals(lines.warn[0].includes('severity:'), false)
    assertEquals(lines.warn[0].includes('{'), false)
})

Deno.test('#454 consoleNoticeReporter - a WARNING with a hint carries it on the same line', () => {
    const lines = captureConsole(() =>
        reportNotice(
            { severity: 'WARNING', message: 'm', hint: 'do x' },
            consoleNoticeReporter,
        )
    )
    assertEquals(lines.warn, ['⚠️  PostgreSQL warning: m — hint: do x'])
})

Deno.test('#454 consoleNoticeReporter - a NOTICE writes nothing', () => {
    const lines = captureConsole(() =>
        reportNotice(
            { severity: 'NOTICE', message: 'already exists, skipping' },
            consoleNoticeReporter,
        )
    )
    assertEquals(lines, { log: [], warn: [], error: [] })
})

Deno.test('#454 consoleNoticeReporter - control characters in a message come out escaped', () => {
    const lines = captureConsole(() =>
        reportNotice(
            {
                severity: 'WARNING',
                message: 'line one\nFAKE LOG LINE\x1b[2J',
                hint: 'h\r\n',
            },
            consoleNoticeReporter,
        )
    )
    assertEquals(lines.warn.length, 1)
    assertEquals(
        ['\n', '\r', '\x1b'].some((c) => lines.warn[0].includes(c)),
        false,
    )
    assertStringIncludes(lines.warn[0], 'line one\\x0aFAKE LOG LINE\\x1b')
})
