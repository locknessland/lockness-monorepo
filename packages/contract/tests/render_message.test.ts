/**
 * `renderMessage` renders a failure message a program wrote — and that may
 * quote text nobody vetted — as one safe, bounded line (#436): the same two
 * redactions `renderError` applies, then `safeForLog`.
 *
 * Every marker is assembled at runtime, so no source line carries a value a
 * secret scanner would flag and no assertion can pass by matching its own
 * literal.
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import {
    isCredentialParamName,
    redactQueryCredentials,
    renderMessage,
} from '../logging/internal.ts'
import * as root from '../mod.ts'

/** A fake secret, distinct per call; it must never reach a rendered line. */
function marker(tag: string): string {
    return ['fx', tag, crypto.randomUUID().slice(0, 8)].join('')
}

/** Assert that no part of `secret` survived into `out`. */
function assertAbsent(out: string, secret: string): void {
    assert(!out.includes(secret), `leaked ${JSON.stringify(secret)}: ${out}`)
}

Deno.test('renderMessage - plain text passes unchanged', () => {
    assertEquals(
        renderMessage('Controller name is required'),
        'Controller name is required',
    )
})

Deno.test('renderMessage - the userinfo of a credential URL is redacted', () => {
    const secret = marker('dsn')
    const out = renderMessage(
        `Cannot reach postgres://app:${secret}@db.test:5432/app`,
    )
    assertAbsent(out, secret)
    assertStringIncludes(out, 'postgres://***:***@db.test:5432/app')
})

Deno.test('renderMessage - a credential pair is redacted', () => {
    const secret = marker('pair')
    const out = renderMessage(
        `Request failed: https://api.test/v1?api_key=${secret}&page=2`,
    )
    assertAbsent(out, secret)
    assertStringIncludes(out, 'api_key=***')
    assertStringIncludes(out, 'page=2')
})

Deno.test('renderMessage - control and format characters are encoded', () => {
    const out = renderMessage('red \x1b[31mtext\x1b[0m and /admin\u202egnp.txt')
    assert(!out.includes('\x1b'), out)
    assert(!out.includes('\u202e'), out)
    assertStringIncludes(out, '\\x1b[31m')
    assertStringIncludes(out, '\\u{202e}')
})

Deno.test('renderMessage - a newline cannot forge a second line', () => {
    const out = renderMessage('first\n❌ forged\r\u2028third')
    for (const terminator of ['\n', '\r', '\u2028']) {
        assert(!out.includes(terminator), out)
    }
    assertEquals(out, 'first\\x0a❌ forged\\x0d\\u{2028}third')
})

Deno.test('renderMessage - the line is bounded at 512 code points of input', () => {
    const out = renderMessage('a'.repeat(600))
    assertEquals(out, `${'a'.repeat(512)}…[truncated at 512 of 600]`)
})

Deno.test('renderMessage - redaction runs before the bound, so a cut never leaks a prefix', () => {
    const secret = marker('long')
    const out = renderMessage(
        `${'x'.repeat(480)} postgres://app:${secret}${
            'y'.repeat(64)
        }@db.test/app`,
    )
    assertAbsent(out, secret.slice(0, 6))
    assertStringIncludes(out, 'postgres://***:***@')
})

Deno.test('logging/internal - re-exports the credential rule beside renderMessage', () => {
    assertEquals(isCredentialParamName('api_key'), true)
    assertEquals(
        redactQueryCredentials('a?code=abc&state=1'),
        'a?code=***&state=1',
    )
})

Deno.test('the contract root exposes the three public sanitize names and not renderMessage', () => {
    assertEquals(typeof root.safeForLog, 'function')
    assertEquals(typeof root.renderError, 'function')
    assertEquals('renderMessage' in root, false)
    assertEquals('redactQueryCredentials' in root, false)
})
