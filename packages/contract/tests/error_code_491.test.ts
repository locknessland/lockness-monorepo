/**
 * `renderError` shows an error's `code` when it is spelled like a runtime or
 * driver code, and nothing else of the object (#491).
 *
 * Every marker is assembled at runtime, so no source line carries a value a
 * secret scanner would flag and no assertion can pass by matching its own
 * literal.
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { renderError } from '../logging/sanitize.ts'
import { isShowableErrorCode } from '../logging/error_code.ts'

const HEAD = 'FA' + 'KE'
const TAIL = 'MA' + 'RK'
/** A fake secret; it must never reach a rendered line. */
const M = HEAD + TAIL

/** Assert that no part of `marker` survived into `out`. */
function assertAbsent(out: string, marker: string): void {
    assert(!out.includes(marker), `leaked ${JSON.stringify(marker)}: ${out}`)
}

/** An `Error('boom')` carrying `code` as an own property. */
function withCode(code: unknown): Error {
    return Object.assign(new Error('boom'), { code })
}

/** The longest real runtime code known: Node's, 43 characters. */
const LONGEST_NODE_CODE = 'ERR_VM_DYNAMIC_IMPORT_' + 'CALLBACK_MISSING_FLAG'

const ACCEPTED: string[] = [
    '23505',
    '42P01',
    'ENOENT',
    'ECONNREFUSED',
    'ER_DUP_ENTRY',
    'SQLITE_CONSTRAINT',
    'CONNECT_TIMEOUT',
    LONGEST_NODE_CODE,
]

const REJECTED: [string, unknown][] = [
    ['text carrying a marker', `value_${M.toLowerCase()}`],
    ['a space', 'ENO ENT'],
    ['an ANSI escape', '\x1b[31mENOENT'],
    ['`code=x`', 'code=x'],
    ['a 49-character upper-snake', 'ERR_' + 'A'.repeat(45)],
    ['a 6-digit one-time password', '48' + '2913'],
    ['a 20-character uppercase with no underscore', 'AKIA' + 'Q'.repeat(16)],
    ['a 16-character base32 string', 'JBSW' + 'Y3DP' + 'EHPK' + '3PXP'],
    ['`E` plus digits', 'E' + '482913'],
    ['the number 23505', 23505],
    ['the empty string', ''],
    ['null', null],
    ['a boolean', true],
    ['an array holding a valid code', ['ENOENT']],
    ['a String object', new String('ENOENT')],
    ['an object that stringifies to a valid code', {
        toString: () => 'ENOENT',
    }],
    ['a symbol', Symbol('ENOENT')],
]

Deno.test('#491 a code spelled like a runtime or driver code is shown', () => {
    assertEquals(LONGEST_NODE_CODE.length, 43)
    for (const code of ACCEPTED) {
        assert(isShowableErrorCode(code), code)
        assertEquals(renderError(withCode(code)), `Error [${code}]: boom`)
    }
})

Deno.test('#491 a code spelled like anything else is never shown', () => {
    for (const [label, code] of REJECTED) {
        assertEquals(isShowableErrorCode(code), false, label)
        const out = renderError(withCode(code))
        assertEquals(out, 'Error: boom', label)
        if (typeof code === 'string' && code !== '') assertAbsent(out, code)
    }
})

Deno.test('#491 a pg-shaped error shows its SQLSTATE and never its detail or hint', () => {
    const detailMarker = `${M}-detail`
    const hintMarker = `${M}-hint`
    const error = Object.assign(
        new Error(
            'duplicate key value violates unique constraint users_email_key',
        ),
        {
            name: 'PostgresError',
            code: '23505',
            detail: `Key (email)=(${detailMarker}) already exists.`,
            hint: `Try ${hintMarker}.`,
            constraint_name: 'users_email_key',
            severity: 'ERROR',
        },
    )
    const out = renderError(error)
    assertEquals(
        out,
        'PostgresError [23505]: duplicate key value violates unique constraint users_email_key',
    )
    assertAbsent(out, detailMarker)
    assertAbsent(out, hintMarker)
    assertAbsent(out, M)
})

Deno.test('#491 a cause link shows its own code; a link past the cap never does', () => {
    const third = Object.assign(new Error('three'), { code: '42P01' })
    const second = new Error('two', { cause: third })
    const first = Object.assign(new Error('one', { cause: second }), {
        code: 'ECONNREFUSED',
    })
    const out = renderError(new Error('head', { cause: first }))
    assertEquals(
        out,
        'Error: head caused by: Error [ECONNREFUSED]: one caused by: Error: two',
    )
    assertAbsent(out, '42P01')
})

Deno.test('#491 with followCause false, only the head shows its code', () => {
    const cause = Object.assign(new Error('inner'), { code: 'ECONNREFUSED' })
    const head = Object.assign(new Error('outer', { cause }), {
        code: 'ENOENT',
    })
    assertEquals(
        renderError(head, { followCause: false }),
        'Error [ENOENT]: outer',
    )
})

Deno.test('#491 a throwing code getter renders a sentinel, name and message intact', () => {
    const error = new Error('boom')
    Object.defineProperty(error, 'code', {
        get(): never {
            throw new Error(M)
        },
    })
    const out = renderError(error)
    assertEquals(out, 'Error [unreadable code]: boom')
    assertAbsent(out, M)
})

Deno.test('#491 an AggregateError shows its own code, never its members', () => {
    const member = () =>
        Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })
    const own = Object.assign(new AggregateError([member(), member()], ''), {
        code: 'ECONNREFUSED',
    })
    assertEquals(renderError(own), 'AggregateError [ECONNREFUSED]: ')
    // The residue, pinned: members are not walked, so a code that lives only
    // on them is not shown.
    const membersOnly = new AggregateError([member(), member()], '')
    assertEquals(renderError(membersOnly), 'AggregateError: ')
})

Deno.test('#491 a real missing file renders NotFound with its ENOENT', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'error-code-491-' })
    try {
        let caught: unknown
        try {
            await Deno.readTextFile(join(dir, 'missing.txt'))
        } catch (error) {
            caught = error
        }
        const out = renderError(caught)
        assert(out.startsWith('NotFound [ENOENT]: '), out)
        assertStringIncludes(out, 'missing.txt')
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
