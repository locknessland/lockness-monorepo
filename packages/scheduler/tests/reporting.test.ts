/**
 * @fileoverview Direct coverage of `report()` — the scheduler's reporter
 * guard (#394): reporter, then console, then `Deno.stderr`, and never throw.
 *
 * @module @lockness/scheduler/tests/reporting
 */

import { assertEquals } from '@std/assert'
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
