/**
 * @fileoverview Contract test for `@lockness/hono/bun` (plan 274 §5, T023).
 *
 * Hono's Bun adapter reads the `Bun` global when its module is evaluated, so
 * `@lockness/hono/bun` loads on Bun only. The tests import it dynamically and
 * run on the Bun lane; on Deno and Node they are skipped, not failed.
 *
 * @module @lockness/hono/tests/bun_adapter
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import { Hono } from '../mod.ts'

/** Whether this process runs on Bun, the only runtime the adapter loads on. */
const onBun = 'Bun' in globalThis
const skip = onBun ? false : 'loads on Bun only'

test('bun adapter - getConnInfo reads the peer through server.requestIP', {
    skip,
}, async () => {
    const { getConnInfo } = await import('../bun.ts')
    const app = new Hono()
    app.get('/', (c) => c.json(getConnInfo(c).remote))
    const env = {
        requestIP: () => ({ address: '::1', family: 'IPv6', port: 6001 }),
    }
    const res = await app.request('/', {}, env)
    assertEquals(await res.json(), {
        address: '::1',
        addressType: 'IPv6',
        port: 6001,
    })
})

test('bun adapter - exposes serveStatic and the WebSocket upgrade', {
    skip,
}, async () => {
    const bun = await import('../bun.ts')
    assertEquals(typeof bun.serveStatic({ root: '.' }), 'function')
    assertEquals(typeof bun.upgradeWebSocket, 'function')
    assertEquals(typeof bun.createBunWebSocket, 'function')
})
