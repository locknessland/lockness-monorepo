import { assertEquals, assertStringIncludes } from '@std/assert'
import { safeForLog } from '../logging/sanitize.ts'

Deno.test('safeForLog - neutralises a newline injected through a decoded path', () => {
    // decodeURI turns %0A into a real newline, so this is what reaches the sink.
    const forged = '/x\nGET /admin 200 - looks like a second request'

    const out = safeForLog(forged)

    assertEquals(out.includes('\n'), false)
    assertStringIncludes(out, '\\x0a')
})

Deno.test('safeForLog - neutralises a carriage return', () => {
    const out = safeForLog('/x\rGET /admin')

    assertEquals(out.includes('\r'), false)
    assertStringIncludes(out, '\\x0d')
})

Deno.test('safeForLog - neutralises a terminal escape', () => {
    const out = safeForLog('/x\u001b[2J\u001b[H')

    assertEquals(out.includes('\u001b'), false)
    assertStringIncludes(out, '\\x1b')
})

Deno.test('safeForLog - leaves an ordinary path untouched', () => {
    assertEquals(safeForLog('/fr/ca/users?q=1'), '/fr/ca/users?q=1')
})

Deno.test('safeForLog - truncates a very long value rather than flooding the log', () => {
    const out = safeForLog('/'.padEnd(5000, 'a'))

    assertEquals(out.length < 600, true)
    assertStringIncludes(out, '[truncated]')
})

Deno.test('safeForLog - neutralises DEL, the C1 range and the JS line terminators', () => {
    // The predicate singles out four classes and the tests covered only C0.
    // Deleting `code === 0x7f`, `(code >= 0x80 && code <= 0x9f)` or the
    // U+2028/U+2029 clause left every test green — and U+2028 is the one the
    // module's own comment calls out, because a JS-based log consumer splits on
    // it exactly as it splits on a newline.
    assertStringIncludes(safeForLog('a\u007fb'), '\\x7f', 'DEL')
    assertStringIncludes(safeForLog('a\u0085b'), '\\x85', 'C1 (NEL)')
    assertStringIncludes(safeForLog('a\u009fb'), '\\x9f', 'C1 (upper edge)')
    assertStringIncludes(safeForLog('a\u2028b'), '\\x2028', 'JS line separator')
    assertStringIncludes(
        safeForLog('a\u2029b'),
        '\\x2029',
        'JS paragraph separator',
    )

    // And an ordinary non-ASCII character is left alone.
    assertEquals(safeForLog('héllo — ok'), 'héllo — ok')
})

Deno.test('safeForLog - truncates at exactly the documented bound', () => {
    // `out.length < 600` passed for any MAX_LENGTH from 1 to ~587.
    const out = safeForLog('a'.repeat(5000))
    assertEquals(out.length, 512 + '\u2026[truncated]'.length)
    assertStringIncludes(out, '[truncated]')
})
