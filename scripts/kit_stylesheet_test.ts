/**
 * @fileoverview #506 — the web kit's `css:build` runs Tailwind v4, and
 * `kits:smoke` can tell a compiled stylesheet from a copied one.
 *
 * The kit shipped a PostCSS config with no plugins, so `css:build` copied
 * `app.css` to `public/css/app.css` unchanged and every utility class in the
 * kit's own views rendered unstyled. These read the stubs and pin the judge
 * without scaffolding anything; `kits:smoke` owns running the real build.
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { parse as parseJsonc } from '@std/jsonc'
import { judgeStylesheet, STYLESHEET_PROBES } from './kit_smoke.ts'

const ROOT = new URL('../', import.meta.url)
const STUBS = new URL('packages/init/stubs/', ROOT)

/** The web kit's `deno.json.stub`, parsed. */
async function webDenoJson(): Promise<{
    tasks: Record<string, string>
    imports: Record<string, string>
}> {
    return JSON.parse(
        await Deno.readTextFile(new URL('kits/web/deno.json.stub', STUBS)),
    )
}

/** Every view-layer source the web kit scaffolds, concatenated. */
async function webViewSources(): Promise<string> {
    const files = [
        'init/app/view/components/ui.tsx.stub',
        'init/app/view/layouts/main_layout.tsx.stub',
        'init/app/view/pages/home.tsx.stub',
        'kits/web/app/view/pages/login.tsx.stub',
        'kits/web/app/controller/auth_controller.tsx.stub',
    ]
    const sources = await Promise.all(
        files.map((f) => Deno.readTextFile(new URL(f, STUBS))),
    )
    return sources.join('\n')
}

Deno.test('#506 judgeStylesheet - a copied entry file fails', async () => {
    // What the plugin-less PostCSS build wrote: the source, byte for byte.
    const copied = await Deno.readTextFile(
        new URL('init/app/view/assets/app.css.stub', STUBS),
    )
    const verdict = judgeStylesheet(copied)
    assertEquals(verdict.ok, false)
    assertStringIncludes(verdict.detail, '.flex')
})

Deno.test('#506 judgeStylesheet - the pre-#506 plain stylesheet fails', () => {
    const verdict = judgeStylesheet(
        ':root { --primary-color: #3b82f6; }\nbody { line-height: 1.6; }\n',
    )
    assertEquals(verdict.ok, false)
})

Deno.test('#506 judgeStylesheet - compiled utilities pass', () => {
    const css = STYLESHEET_PROBES.map((cls) => `.${cls} {\n  color: red;\n}`)
        .join('\n')
    const verdict = judgeStylesheet(`/*! tailwindcss v4.1.18 */\n${css}\n`)
    assert(verdict.ok, verdict.detail)
})

Deno.test('#506 judgeStylesheet - a prefix of a probe is not the probe', () => {
    // `.flex-col` must not satisfy `.flex`.
    const verdict = judgeStylesheet(
        STYLESHEET_PROBES.map((cls) => `.${cls}-col { color: red; }`).join(
            '\n',
        ),
    )
    assertEquals(verdict.ok, false)
})

Deno.test('#506 judgeStylesheet - an unresolved @import fails even with rules', () => {
    // The CLI inlines `@import 'tailwindcss'`; seeing it in the output means
    // the file was copied, whatever else it holds.
    const css = STYLESHEET_PROBES.map((cls) => `.${cls} { color: red; }`)
        .join('\n')
    const verdict = judgeStylesheet(`@import 'tailwindcss';\n${css}\n`)
    assertEquals(verdict.ok, false)
    assertStringIncludes(verdict.detail, '@import')
})

Deno.test('#506 every stylesheet probe is a class the web kit views use', async () => {
    // A probe nothing uses would pass on a build that scans nothing.
    const views = await webViewSources()
    for (const cls of STYLESHEET_PROBES) {
        assert(
            new RegExp(`[\\s"'\`]${cls}[\\s"'\`]`).test(views),
            `probe "${cls}" appears in no web kit view`,
        )
    }
})

Deno.test('#506 the web CSS entry imports Tailwind', async () => {
    const css = await Deno.readTextFile(
        new URL('init/app/view/assets/app.css.stub', STUBS),
    )
    assert(
        /^@import ['"]tailwindcss['"]/m.test(css),
        'app.css.stub must @import "tailwindcss"',
    )
})

Deno.test('#506 css:build and css:watch run the Tailwind CLI on one pipeline', async () => {
    const { tasks } = await webDenoJson()
    const build = tasks['css:build'] ?? ''
    const watch = tasks['css:watch'] ?? ''
    assertStringIncludes(build, '@tailwindcss/cli')
    assertStringIncludes(build, '-i app/view/assets/app.css')
    assertStringIncludes(build, '-o public/css/app.css')
    // The same command, plus the watch flag: two pipelines drift. `=always`
    // because scripts/dev.sh runs css:watch as a background job, whose stdin
    // is /dev/null, and a bare --watch exits at stdin EOF before building.
    assertEquals(watch, `${build} --watch=always`)
    assertEquals(build.includes('postcss'), false)
})

Deno.test('#506 the web kit pins Tailwind exactly as the framework root does', async () => {
    const { imports } = await webDenoJson()
    const root = parseJsonc(
        await Deno.readTextFile(new URL('deno.jsonc', ROOT)),
    ) as { imports: Record<string, string> }
    for (const name of ['tailwindcss', '@tailwindcss/cli']) {
        assertEquals(imports[name], root.imports[name], name)
    }
    for (const name of Object.keys(imports)) {
        assertEquals(name.startsWith('postcss'), false, `${name} is dead`)
    }
})
