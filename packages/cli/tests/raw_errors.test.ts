/**
 * @fileoverview The `LOCKNESS_CLI_RAW_ERRORS` switch (#488): an allowlist,
 * off unless it is recognisably on, and off when the environment cannot be
 * read.
 *
 * @module @lockness/cli/tests/raw_errors
 */

import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert'
import { rawErrorsHint, readRawErrorsSwitch } from '../raw_errors.ts'

/** A reader that answers `value` for the switch and nothing for anything else. */
function reader(
    value: string | undefined,
): (name: string) => string | undefined {
    return (name) => name === 'LOCKNESS_CLI_RAW_ERRORS' ? value : undefined
}

for (const value of ['1', 'true', 'on', 'yes', ' TRUE ', 'Yes\r', 'ON\n']) {
    Deno.test(`raw errors - ${JSON.stringify(value)} turns the switch on`, () => {
        assertEquals(readRawErrorsSwitch(reader(value)), { state: 'on' })
    })
}

for (const value of [undefined, '', '   ', '0', 'false', 'off', 'no', ' NO ']) {
    Deno.test(`raw errors - ${JSON.stringify(value)} leaves the switch off`, () => {
        assertEquals(readRawErrorsSwitch(reader(value)), { state: 'off' })
    })
}

for (const value of ['2', 'maybe', 'enabled', 'true1', 'y']) {
    Deno.test(`raw errors - ${JSON.stringify(value)} is unrecognised, which is off`, () => {
        assertEquals(readRawErrorsSwitch(reader(value)), {
            state: 'unrecognised',
            value,
        })
    })
}

Deno.test('raw errors - a reader denied the environment (NotCapable) reads as off', () => {
    const denied = () => {
        throw new Deno.errors.NotCapable('Requires env access')
    }
    assertEquals(readRawErrorsSwitch(denied), { state: 'off' })
})

Deno.test('raw errors - any other reader failure is not swallowed', () => {
    const broken = () => {
        throw new TypeError('reader bug')
    }
    assertThrows(() => readRawErrorsSwitch(broken), TypeError, 'reader bug')
})

Deno.test('raw errors - the default reader is the process environment', () => {
    const original = Deno.env.get('LOCKNESS_CLI_RAW_ERRORS')
    Deno.env.set('LOCKNESS_CLI_RAW_ERRORS', 'yes')
    try {
        assertEquals(readRawErrorsSwitch(), { state: 'on' })
    } finally {
        if (original === undefined) Deno.env.delete('LOCKNESS_CLI_RAW_ERRORS')
        else Deno.env.set('LOCKNESS_CLI_RAW_ERRORS', original)
    }
})

Deno.test('raw errors - the off hint names the switch and the public-log warning', () => {
    assertEquals(
        rawErrorsHint({ state: 'off' }),
        '(Credentials redacted. LOCKNESS_CLI_RAW_ERRORS=1 prints the raw error; never set it where the log is public.)',
    )
})

Deno.test('raw errors - the unrecognised notice quotes the value, encoded', () => {
    const hint = rawErrorsHint({ state: 'unrecognised', value: 'tru\x1be\r' })
    assertStringIncludes(
        hint,
        'LOCKNESS_CLI_RAW_ERRORS="tru\\x1be\\x0d" is not recognised',
    )
    assertStringIncludes(hint, '1, true, on, yes, 0, false, off, no')
})
