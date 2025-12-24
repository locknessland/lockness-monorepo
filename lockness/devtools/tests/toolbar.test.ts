/**
 * Tests for toolbar HTML generation
 */

import { assertStringIncludes } from '@std/assert'
import { generateToolbarHtml } from '../toolbar_html.ts'
import { collector } from '../collector.ts'

Deno.test('generateToolbarHtml - generates valid HTML', () => {
    collector.clear()

    const html = generateToolbarHtml()

    assertStringIncludes(html, 'lockness-debug-toolbar')
    assertStringIncludes(html, '🔧')
    assertStringIncludes(html, 'Lockness')
})

Deno.test('generateToolbarHtml - includes stats', () => {
    collector.clear()

    collector.addRoute({ method: 'GET', path: '/test', middlewares: [] })
    collector.addLog({ timestamp: Date.now(), level: 'info', message: 'Test' })

    const html = generateToolbarHtml()

    assertStringIncludes(html, 'ROUTES')
    assertStringIncludes(html, 'LOGS')
    assertStringIncludes(html, '>1<') // Count of routes/logs
})

Deno.test('generateToolbarHtml - shows request duration', () => {
    collector.clear()

    const requestId = crypto.randomUUID()
    collector.addRequest({
        id: requestId,
        method: 'GET',
        path: '/test',
        timestamp: Date.now(),
        headers: {},
        query: {},
    })
    collector.updateRequest(requestId, { duration: 123.45 })

    const html = generateToolbarHtml(requestId)

    assertStringIncludes(html, 'DURATION')
    assertStringIncludes(html, '123.45ms')
})

Deno.test('generateToolbarHtml - shows error badge', () => {
    collector.clear()

    collector.addLog({
        timestamp: Date.now(),
        level: 'error',
        message: 'Error!',
    })

    const html = generateToolbarHtml()

    // Should have red badge for errors
    assertStringIncludes(html, '#ef4444')
})

Deno.test('generateToolbarHtml - includes links to dashboard', () => {
    collector.clear()

    const html = generateToolbarHtml()

    assertStringIncludes(html, '/_devtools')
    assertStringIncludes(html, '/_devtools?panel=routes')
    assertStringIncludes(html, '/_devtools?panel=logs')
    assertStringIncludes(html, '/_devtools?panel=sql')
})
