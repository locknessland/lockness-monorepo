/**
 * Tests for toolbar HTML generation
 */

import { assertStringIncludes } from '@std/assert'
import { DebugToolbar } from '../components/toolbar.tsx'
import { collector } from '../collector.ts'

Deno.test('DebugToolbar - generates valid HTML', () => {
    collector.clear()

    const html = DebugToolbar({}).toString()

    assertStringIncludes(html, 'lockness-debug-toolbar')
})

Deno.test('DebugToolbar - includes stats', () => {
    collector.clear()

    collector.setRoutes([{ method: 'GET', path: '/test', middlewares: [] }])
    collector.addLog({ timestamp: Date.now(), level: 'info', message: 'Test' })

    const html = DebugToolbar({}).toString()

    assertStringIncludes(html, 'Routes')
    assertStringIncludes(html, 'Logs')
    assertStringIncludes(html.toLowerCase(), '>1<') // Count of routes/logs
})

Deno.test('DebugToolbar - shows request duration', () => {
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

    const html = DebugToolbar({ requestId }).toString()

    assertStringIncludes(html, 'Duration')
    assertStringIncludes(html, '123.45ms')
})

Deno.test('DebugToolbar - shows error badge', () => {
    collector.clear()

    collector.addLog({
        timestamp: Date.now(),
        level: 'error',
        message: 'Error!',
    })

    const html = DebugToolbar({}).toString()

    // Should have red badge for errors
    assertStringIncludes(html, '#ef4444')
})

Deno.test('DebugToolbar - includes links to dashboard', () => {
    collector.clear()

    const html = DebugToolbar({}).toString()

    assertStringIncludes(html, '/_devtools')
    assertStringIncludes(html, '/_devtools?panel=routes')
    assertStringIncludes(html, '/_devtools?panel=logs')
    assertStringIncludes(html, '/_devtools?panel=sql')
})
