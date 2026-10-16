/**
 * @fileoverview Contract test for `@lockness/hono/deno`, the Deno adapter
 * `denoServeStatic` and `getConnInfo` moved to when they left the root barrel
 * (plan 274 §5, T023). Deno-only: it is the adapter for one runtime, run on
 * that runtime's lane.
 *
 * @module @lockness/hono/tests/deno_adapter
 */

import { assertEquals } from '@std/assert'
import { Hono } from '../mod.ts'
import { getConnInfo, serveStatic, upgradeWebSocket } from '../deno.ts'

Deno.test('deno adapter - getConnInfo reads the remoteAddr Deno.serve passes', async () => {
    const app = new Hono()
    app.get('/', (c) => c.json(getConnInfo(c).remote))
    const env = {
        remoteAddr: { hostname: '192.0.2.4', port: 7001, transport: 'tcp' },
    }
    const res = await app.request('/', {}, env)
    assertEquals(await res.json(), {
        address: '192.0.2.4',
        port: 7001,
        transport: 'tcp',
    })
})

Deno.test('deno adapter - exposes serveStatic and the WebSocket upgrade', () => {
    assertEquals(typeof serveStatic({ root: '.' }), 'function')
    assertEquals(typeof upgradeWebSocket, 'function')
})
