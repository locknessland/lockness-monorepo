/**
 * Tests for the CSS/Tailwind integration (#111).
 *
 * @module @lockness/vite/tests/css
 */

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
import {
    buildCssPlugin,
    buildTailwindArgs,
    compileCss,
    createCssCollector,
    cssPlugin,
} from '../src/plugins/css.ts'
import { defineViteConfig } from '../src/define_config.ts'
import { resolve } from '@std/path'
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

Deno.test('cssPlugin - is serve-only so the build path compiles Tailwind once', () => {
    const plugin = cssPlugin({ collector: createCssCollector() })
    assertEquals(plugin.apply, 'serve')
})

Deno.test('buildCssPlugin - is build-only, pre-enforced, and named', () => {
    const plugin = buildCssPlugin()
    assertEquals(plugin.name, 'lockness:build-css')
    assertEquals(plugin.apply, 'build')
    assertEquals(plugin.enforce, 'pre')
})

Deno.test('buildCssPlugin - load ignores a module that is not the cssInput (no compile)', async () => {
    const plugin = buildCssPlugin()
    // configResolved never ran → the matched id is empty → every id is ignored,
    // so no Tailwind subprocess is ever spawned for an unrelated module.
    const load = plugin.load as unknown as (
        id: string,
    ) => Promise<string | null>
    assertEquals(await load('/some/other/module.ts'), null)
    assertEquals(await load('/abs/app/view/assets/app.css?used'), null)
})

Deno.test('compileCss - throws on a failed Tailwind run (build fails loudly, FR-004)', async () => {
    // A cssInput that cannot be read makes the Tailwind CLI exit non-zero; the
    // seam must surface that as a throw, not an empty string.
    const config = defineViteConfig({
        cssInput: '/nonexistent/does-not-exist.css',
    })
    await assertRejects(
        () => compileCss(config),
        Error,
        'Tailwind build failed',
    )
})

Deno.test('createCssCollector.rebuild - swallows a failed run and logs (dev fallback, FR-004 dev side)', async () => {
    // The build path throws (compileCss); the DEV collector must instead keep the
    // watcher alive — log the failure and leave the last good CSS in place.
    const collector = createCssCollector({
        config: { cssInput: '/nonexistent/does-not-exist.css' },
    })
    const errors: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => {
        errors.push(args)
    }
    try {
        await collector.rebuild() // must NOT reject
    } finally {
        console.error = original
    }
    assertEquals(collector.getCss(), '') // stayed empty, never a partial write
    assert(errors.length >= 1, 'the failed run is logged at ERROR')
})

Deno.test('buildCssPlugin - load matches the ABSOLUTE-resolved cssInput, not the relative literal', async () => {
    const root = '/some/project/root'
    // A deliberately nonexistent relative path: a matched id reaches compileCss
    // (which throws on missing input), an unmatched id returns null immediately.
    const cssInput = 'no/such/app.css'
    const plugin = buildCssPlugin({ config: { cssInput } })
    ;(plugin.configResolved as unknown as (r: { root: string }) => void)({
        root,
    })
    const load = plugin.load as unknown as (
        id: string,
    ) => Promise<string | null>

    // The exact bug the plan warns about (A-arch F4): a bare relative literal must
    // NOT match — otherwise utilities silently never compile on a real build.
    assertEquals(await load(cssInput), null)
    assertEquals(await load('/unrelated/module.ts'), null)

    // The absolute-resolved id DOES match → it reaches compileCss, which throws on
    // this (nonexistent) input. A null return here would mean the match silently
    // failed — the regression this test guards.
    const absId = resolve(root, cssInput)
    await assertRejects(() => load(absId), Error, 'Tailwind build failed')
    // A Vite query suffix on the matched id still resolves.
    await assertRejects(
        () => load(`${absId}?used`),
        Error,
        'Tailwind build failed',
    )
})
