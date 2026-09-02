/**
 * Tests for the CSS/Tailwind integration (#111).
 *
 * @module @lockness/vite/tests/css
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import {
    buildTailwindArgs,
    createCssCollector,
    cssPlugin,
} from '../src/plugins/css.ts'
import { DEFAULTS } from '../src/shared.ts'

Deno.test('buildTailwindArgs - assembles the CLI vector, --watch optional', () => {
    const args = buildTailwindArgs(DEFAULTS, { outFile: '/tmp/out.css' })
    assertEquals(args.slice(0, 4), ['deno', 'run', '-A', '@tailwindcss/cli'])
    assertStringIncludes(args.join(' '), `-i ${DEFAULTS.cssInput}`)
    assertStringIncludes(args.join(' '), '-o /tmp/out.css')
    assert(!args.includes('--watch'))
    assert(
        buildTailwindArgs(DEFAULTS, { outFile: '/tmp/o.css', watch: true })
            .includes('--watch'),
    )
})

Deno.test('createCssCollector - getCss is empty before the first rebuild', () => {
    assertEquals(createCssCollector().getCss(), '')
})

Deno.test('cssPlugin - a css change rebuilds and reloads; a server-reload change is ignored here', async () => {
    let rebuilds = 0
    const collector = {
        getCss: () => '.x{}',
        rebuild: () => {
            rebuilds++
            return Promise.resolve()
        },
    }
    const sent: string[] = []
    let onChange: ((p: string) => void) | undefined
    const server = {
        watcher: { on: (_e: string, cb: (p: string) => void) => onChange = cb },
        ws: { send: (p: { type: string }) => sent.push(p.type) },
    }
    const plugin = cssPlugin({ collector })
    ;(plugin.configureServer as unknown as (s: typeof server) => void)(server)
    assert(onChange)
    await onChange!('app/view/card.tsx') // 'css' → rebuild + reload
    await onChange!('app/controller/home.tsx') // 'server-reload' → ignored here
    await onChange!('README.md') // 'ignore'
    assertEquals(rebuilds, 1)
    assertEquals(sent, ['full-reload'])
})
