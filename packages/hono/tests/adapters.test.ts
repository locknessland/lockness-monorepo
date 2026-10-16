/**
 * @fileoverview Contract test for `@lockness/hono`'s per-runtime adapters and
 * automatic JSX runtime (plan 274 §5, FR-007, T023).
 *
 * The Node adapter is one of the subpaths `@lockness/runtime` will choose
 * between; the Deno and Bun ones load on their own runtime only and are tested
 * in `deno_adapter.deno.test.ts` and `bun_adapter.test.ts`. An adapter must
 * wire the peer address the way its runtime hands it to `fetch`, or a
 * fail-closed check built on it (the devtools gate) denies or admits the wrong
 * peer. The checks drive a real `Hono` app with the env the runtime would
 * pass, so they run on every lane without a server. The root
 * barrel must carry no runtime-specific adapter: importing `@lockness/hono`
 * may not pin a runtime.
 *
 * @module @lockness/hono/tests/adapters
 */

import { test } from 'node:test'
import { assertEquals, assertFalse } from '@std/assert'
import * as barrel from '../mod.ts'
import { Hono } from '../mod.ts'
import * as node from '../node.ts'
import { Fragment, jsx, jsxs } from '../jsx_runtime.ts'
import { Fragment as DevFragment, jsxDEV } from '../jsx_dev_runtime.ts'

/** An app answering `/` with the peer address the adapter reads. */
function peerApp(
    read: (c: Parameters<typeof node.getConnInfo>[0]) => {
        remote: { address?: string; addressType?: string; port?: number }
    },
): Hono {
    const app = new Hono()
    app.get('/', (c) => c.json(read(c).remote))
    return app
}

test('node adapter - getConnInfo reads the socket peer of the incoming request', async () => {
    const env = {
        incoming: {
            socket: {
                remoteAddress: '10.0.0.7',
                remotePort: 5123,
                remoteFamily: 'IPv4',
            },
        },
    }
    const res = await peerApp(node.getConnInfo).request('/', {}, env)
    assertEquals(await res.json(), {
        address: '10.0.0.7',
        port: 5123,
        addressType: 'IPv4',
    })
})

test('node adapter - exposes serve, serveStatic and the WebSocket upgrade', () => {
    assertEquals(typeof node.serve, 'function')
    assertEquals(typeof node.createAdaptorServer, 'function')
    assertEquals(typeof node.serveStatic({ root: '.' }), 'function')
    const ws = node.createNodeWebSocket({ app: new Hono() })
    assertEquals(typeof ws.upgradeWebSocket, 'function')
    assertEquals(typeof ws.injectWebSocket, 'function')
})

test('root barrel - carries no runtime-specific adapter', () => {
    for (const name of ['denoServeStatic', 'getConnInfo', 'upgradeWebSocket']) {
        assertFalse(name in barrel, `${name} leaked into the root barrel`)
    }
})

test('jsx runtime - automatic jsx/jsxs/Fragment render to HTML', () => {
    assertEquals(String(jsx('p', { children: 'a & b' })), '<p>a &amp; b</p>')
    assertEquals(
        String(jsxs('ul', {
            children: [
                jsx('li', { children: '1' }),
                jsx('li', { children: '2' }),
            ],
        })),
        '<ul><li>1</li><li>2</li></ul>',
    )
    assertEquals(
        String(jsx(Fragment, { children: [jsx('b', {}), 'x'] })),
        '<b></b>x',
    )
})

test('jsx dev runtime - jsxDEV renders like jsx and shares Fragment', () => {
    assertEquals(String(jsxDEV('i', { children: 'y' })), '<i>y</i>')
    assertEquals(DevFragment, Fragment)
})
