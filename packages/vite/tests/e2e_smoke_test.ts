/**
 * @fileoverview End-to-end smoke test for the `@lockness/vite` demo (#115).
 *
 * Proves the integration in-process, without a browser or a live Vite server:
 * - **Dev SSR** — the demo `App.fetch()` renders the JSX home page through
 *   `@lockness/core`, and (through the dev bridge) a non-asset request is served
 *   while a Vite-internal request is not.
 * - **Production asset resolution** — `viteAssets()` resolves the demo's client
 *   entry to hashed URLs from a built-shape manifest.
 *
 * A real `vite build` + browser HMR are covered by the manual smoke procedure in
 * `packages/vite/demo/README.md` (a full Vite 8 / Rolldown build subprocess and a
 * browser are out of reach of a deterministic unit suite — named, not dropped).
 *
 * @module @lockness/vite/tests/e2e_smoke
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { defineViteConfig } from '../src/define_config.ts'
import { viteAssets } from '../src/vite_assets.ts'
import {
    forwardWebResponse,
    isViteInternalRequest,
} from '../src/plugins/dev_server.ts'
import demoApp from '../demo/main.ts'

Deno.test('e2e - demo App.fetch renders the SSR home page (#115 dev SSR)', async () => {
    const res = await demoApp.fetch(new Request('http://localhost/'))
    assertEquals(res.status, 200)
    const body = await res.text()
    assertStringIncludes(body, 'Lockness + Vite Demo')
    assertStringIncludes(body, 'data-testid="demo-heading"')
})

Deno.test('e2e - the dev bridge forwards the demo SSR response verbatim', async () => {
    // A Vite-internal request is never forwarded to the app.
    assert(isViteInternalRequest('/@vite/client'))
    assert(!isViteInternalRequest('/'))

    // Forwarding the demo response onto a Node response preserves the markup.
    const response = await demoApp.fetch(new Request('http://localhost/'))
    const captured: { statusCode: number; body?: string } = { statusCode: 0 }
    await forwardWebResponse(response, {
        statusCode: 0,
        setHeader: () => {},
        end: (b?: string | Uint8Array) => {
            captured.body = typeof b === 'string'
                ? b
                : new TextDecoder().decode(b)
        },
    })
    assertStringIncludes(captured.body!, 'Lockness + Vite Demo')
})

Deno.test('e2e - production build manifest resolves the demo entry to hashed URLs (#115 prod)', async () => {
    // Shape of a real `vite build` manifest for the demo client entry.
    const dir = await Deno.makeTempDir()
    const manifestPath = join(dir, 'manifest.json')
    await Deno.writeTextFile(
        manifestPath,
        JSON.stringify({
            'app/client.ts': {
                file: 'assets/client.9f8e7d.js',
                css: ['assets/client.1a2b3c.css'],
                isEntry: true,
            },
        }),
    )
    const config = defineViteConfig({ manifestPath })
    const { html, tags } = await viteAssets('app/client.ts', {
        isDevServer: false,
        config,
        nonce: 'demo-nonce',
    })
    assertStringIncludes(html, '/assets/client.9f8e7d.js')
    assertStringIncludes(html, '/assets/client.1a2b3c.css')
    // Manifest is present and asset paths resolved — never a dev-server URL.
    assert(!html.includes('localhost:5173'), 'no dev origin in production')
    assert(
        tags.every((t) => t.attributes.nonce === 'demo-nonce'),
        'nonce propagates to every resolved tag',
    )
})
