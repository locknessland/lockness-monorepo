/**
 * Tests for the `lockness-env/env-signal` lint rule (#504): the raw reads it
 * flags, the shapes that stay clean, and the file scoping.
 */

import { assertEquals } from '@std/assert'
import plugin, { inScope } from './env_signal.ts'

/** Lint `source` as `file` and return the rule's hit count. */
function hits(source: string, file = '/repo/packages/x/mod.ts'): number {
    return Deno.lint.runPlugin(plugin, file, source)
        .filter((d) => d.id === 'lockness-env/env-signal').length
}

const POSITIVES: ReadonlyArray<readonly [string, string]> = [
    ["Deno.env.get('APP_ENV')", "const e = Deno.env.get('APP_ENV')"],
    ['Deno.env.get("DENO_ENV")', 'const e = Deno.env.get("DENO_ENV")'],
    ['a template literal name', 'const e = Deno.env.get(`APP_ENV`)'],
    [
        'a comparison on the read',
        "const dev = Deno.env.get('APP_ENV') === 'development'",
    ],
    [
        'the old fallback chain',
        "const e = Deno.env.get('DENO_ENV') ?? 'development'",
    ],
]

for (const [label, source] of POSITIVES) {
    Deno.test(`env-signal - flags ${label}`, () => {
        assertEquals(hits(source), 1)
    })
}

const NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    ['another variable', "const k = Deno.env.get('APP_KEY')"],
    ['a write', "Deno.env.set('APP_ENV', 'production')"],
    ['the resolver', 'const e = resolveEnvName()'],
    ['a computed name', 'const e = Deno.env.get(name)'],
    ['a look-alike object', "const e = env.get('APP_ENV')"],
]

for (const [label, source] of NEGATIVES) {
    Deno.test(`env-signal - leaves ${label} alone`, () => {
        assertEquals(hits(source), 0)
    })
}

Deno.test('env-signal - reports in packages, app and config', () => {
    const source = "const e = Deno.env.get('APP_ENV')"
    assertEquals(hits(source, '/repo/app/service/x.ts'), 1)
    assertEquals(hits(source, '/repo/config/app.ts'), 1)
    assertEquals(hits(source, '/repo/app/view/pages/errors/h.tsx'), 1)
})

Deno.test('env-signal - reports nothing in tests, scripts, or the resolver itself', () => {
    const source = "const e = Deno.env.get('DENO_ENV')"
    assertEquals(hits(source, '/repo/packages/x/tests/a.ts'), 0)
    assertEquals(hits(source, '/repo/packages/x/a.test.ts'), 0)
    assertEquals(hits(source, '/repo/packages/x/a_test.ts'), 0)
    assertEquals(hits(source, '/repo/scripts/kit_live.ts'), 0)
    assertEquals(hits(source, '/repo/packages/contract/environment_read.ts'), 0)
    assertEquals(
        hits(source, '/repo/packages/contract/environment_legacy.ts'),
        0,
    )
})

Deno.test('env-signal - inScope reads Windows separators', () => {
    assertEquals(inScope('C:\\repo\\config\\app.ts'), true)
    assertEquals(inScope('C:\\repo\\packages\\x\\tests\\a.ts'), false)
})
