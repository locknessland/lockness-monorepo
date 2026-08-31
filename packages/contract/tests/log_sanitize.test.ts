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
