/**
 * @fileoverview The `LOCKNESS_CLI_RAW_ERRORS` switch (#488): an allowlist,
 * off unless it is recognisably on, and off when the environment cannot be
 * read.
 *
 * Portable: a reader's failure is classified by the error's `name`, so these
 * rows build Deno's error shapes by name. The rows that need Deno itself —
 * its real error classes and its permission model — are in
 * `raw_errors.deno.test.ts`.
 *
 * @module @lockness/cli/tests/raw_errors
 */

import process from 'node:process'
import { test } from 'node:test'
import { assertEquals, assertStringIncludes } from '@std/assert'
import { rawErrorsHint, readRawErrorsSwitch } from '../raw_errors.ts'

/** A reader that answers `value` for the switch and nothing for anything else. */
function reader(
    value: string | undefined,
): (name: string) => string | undefined {
    return (name) => name === 'LOCKNESS_CLI_RAW_ERRORS' ? value : undefined
}

/** An error named like one of Deno's `Deno.errors` classes. */
function named(name: string, message: string): Error {
    return Object.assign(new Error(message), { name })
}

for (const value of ['1', 'true', 'on', 'yes', ' TRUE ', 'Yes\r', 'ON\n']) {
    test(`raw errors - ${JSON.stringify(value)} turns the switch on`, () => {
        assertEquals(readRawErrorsSwitch(reader(value)), { state: 'on' })
    })
}

for (const value of [undefined, '', '   ', '0', 'false', 'off', 'no', ' NO ']) {
    test(`raw errors - ${JSON.stringify(value)} leaves the switch off`, () => {
        assertEquals(readRawErrorsSwitch(reader(value)), { state: 'off' })
    })
}

for (const value of ['2', 'maybe', 'enabled', 'true1', 'y']) {
    test(`raw errors - ${JSON.stringify(value)} is unrecognised, which is off`, () => {
        assertEquals(readRawErrorsSwitch(reader(value)), {
            state: 'unrecognised',
            value,
        })
    })
}

test('raw errors - a reader denied the environment (NotCapable) reads as off', () => {
    const denied = () => {
        throw named('NotCapable', 'Requires env access')
    }
    assertEquals(readRawErrorsSwitch(denied), { state: 'off' })
})

test('raw errors - a value that is not valid Unicode (InvalidData) reads as off, with a notice', () => {
    const invalid = () => {
        throw named(
            'InvalidData',
            'environment variable was not valid unicode',
        )
    }
    assertEquals(readRawErrorsSwitch(invalid), {
        state: 'unreadable',
        placeholder: '<not valid Unicode>',
    })
})

test('raw errors - a thrown non-Error is never classified by a name it carries', () => {
    // Only an Error is matched by name, as `instanceof Deno.errors.*` was.
    const impostor = () => {
        throw { name: 'NotCapable', message: 'not an Error' }
    }
    assertEquals(readRawErrorsSwitch(impostor), {
        state: 'unreadable',
        placeholder: '<unreadable>',
    })
})

test('raw errors - any other reader failure reads as off, with a notice', () => {
    const broken = () => {
        throw new TypeError('reader bug')
    }
    assertEquals(readRawErrorsSwitch(broken), {
        state: 'unreadable',
        placeholder: '<unreadable>',
    })
})

test('raw errors - the default reader is the process environment', () => {
    const original = process.env.LOCKNESS_CLI_RAW_ERRORS
    process.env.LOCKNESS_CLI_RAW_ERRORS = 'yes'
    try {
        assertEquals(readRawErrorsSwitch(), { state: 'on' })
    } finally {
        if (original === undefined) delete process.env.LOCKNESS_CLI_RAW_ERRORS
        else process.env.LOCKNESS_CLI_RAW_ERRORS = original
    }
})

test('raw errors - the off hint names the switch and the public-log warning', () => {
    assertEquals(
        rawErrorsHint({ state: 'off' }),
        '(Credentials redacted. LOCKNESS_CLI_RAW_ERRORS=1 prints the raw error; never set it where the log is public.)',
    )
})

test('raw errors - the unrecognised notice quotes the value, encoded', () => {
    const hint = rawErrorsHint({ state: 'unrecognised', value: 'tru\x1be\r' })
    assertStringIncludes(
        hint,
        'LOCKNESS_CLI_RAW_ERRORS="tru\\x1be\\x0d" is not recognised',
    )
    assertStringIncludes(hint, '1, true, on, yes, 0, false, off, no')
})

test('raw errors - the unreadable notice shows a placeholder, never the bytes', () => {
    assertEquals(
        rawErrorsHint({
            state: 'unreadable',
            placeholder: '<not valid Unicode>',
        }),
        'LOCKNESS_CLI_RAW_ERRORS=<not valid Unicode> could not be read, so the error above is redacted. Use one of: 1, true, on, yes, 0, false, off, no.',
    )
})
