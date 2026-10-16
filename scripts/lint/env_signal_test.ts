/**
 * Tests for the `lockness-env/env-signal` lint rule (#504): the raw reads it
 * flags, the shapes that stay clean, and the file scoping.
 */

import { test } from 'node:test'
import { assertEquals } from '@std/assert'
import plugin, { inScope } from './env_signal.ts'
import { REPO_ROOT } from './repo_path.ts'

/** Lint `source` as `file` and return the rule's hit count. */
function hits(source: string, file = `${REPO_ROOT}packages/x/mod.ts`): number {
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
    // T019 (#596): the Node-side reads, on process.env or any env object.
    ['process.env.APP_ENV', 'const e = process.env.APP_ENV'],
    ["process.env['DENO_ENV']", "const e = process.env['DENO_ENV']"],
    ['an optional-chained read', 'const e = process.env?.APP_ENV?.trim()'],
    ['a read on an injected env', 'const prod = env.APP_ENV === "production"'],
    ['a read on Deno.env.toObject()', 'const e = Deno.env.toObject().APP_ENV'],
    ['a read on the right of an assignment', 'let e; e = process.env.APP_ENV'],
    ['APP_ENV destructured', 'const { APP_ENV } = process.env'],
    [
        'DENO_ENV destructured and renamed',
        'const { DENO_ENV: e } = process.env',
    ],
    ['APP_ENV destructured in a parameter', 'function f({ APP_ENV }) {}'],
]

for (const [label, source] of POSITIVES) {
    test(`env-signal - flags ${label}`, () => {
        assertEquals(hits(source), 1)
    })
}

const NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    ['another variable', "const k = Deno.env.get('APP_KEY')"],
    ['a write', "Deno.env.set('APP_ENV', 'production')"],
    ['the resolver', 'const e = resolveEnvName()'],
    ['a computed name', 'const e = Deno.env.get(name)'],
    ['a look-alike object', "const e = env.get('APP_ENV')"],
    ['another process.env variable', 'const k = process.env.APP_KEY'],
    ['a process.env write', "process.env.APP_ENV = 'production'"],
    ['a computed process.env write', "process.env['APP_ENV'] = 'test'"],
    ['a process.env delete', 'delete process.env.APP_ENV'],
    ['a computed process.env name', 'const e = process.env[name]'],
    ['the whole environment handed over', 'assertNotProduction(process.env)'],
    ['an APP_ENV object key', "const o = { APP_ENV: 'test' }"],
    ['an APP_ENV type member', 'interface E { APP_ENV?: string }'],
]

for (const [label, source] of NEGATIVES) {
    test(`env-signal - leaves ${label} alone`, () => {
        assertEquals(hits(source), 0)
    })
}

test('env-signal - reports in packages, app and config', () => {
    const source = "const e = Deno.env.get('APP_ENV')"
    assertEquals(hits(source, `${REPO_ROOT}app/service/x.ts`), 1)
    assertEquals(hits(source, `${REPO_ROOT}config/app.ts`), 1)
    assertEquals(hits(source, `${REPO_ROOT}app/view/pages/errors/h.tsx`), 1)
})

test('env-signal - reports nothing in tests, scripts, or the resolver itself', () => {
    const source = "const e = Deno.env.get('DENO_ENV')"
    assertEquals(hits(source, `${REPO_ROOT}packages/x/tests/a.ts`), 0)
    assertEquals(hits(source, `${REPO_ROOT}packages/x/a.test.ts`), 0)
    assertEquals(hits(source, `${REPO_ROOT}packages/x/a_test.ts`), 0)
    assertEquals(hits(source, `${REPO_ROOT}scripts/kit_live.ts`), 0)
    assertEquals(
        hits(source, `${REPO_ROOT}packages/contract/environment_read.ts`),
        0,
    )
    assertEquals(
        hits(source, `${REPO_ROOT}packages/contract/environment_legacy.ts`),
        0,
    )
})

test('env-signal - transform/hook.ts owns its env read, and only it', () => {
    // @lockness/transform loads before any @lockness/* package and may import
    // none, so hook.ts repeats the resolver's trim/lower-case rule (#596).
    const source =
        "const p = env.APP_ENV?.trim().toLowerCase() === 'production'"
    assertEquals(hits(source, `${REPO_ROOT}packages/transform/hook.ts`), 0)
    assertEquals(hits(source, `${REPO_ROOT}packages/transform/register.ts`), 1)
    assertEquals(hits(source, `${REPO_ROOT}packages/transform/cache.ts`), 1)
})

test('env-signal - inScope reads Windows separators', () => {
    assertEquals(inScope('C:\\repo\\config\\app.ts', 'C:\\repo'), true)
    assertEquals(
        inScope('C:\\repo\\packages\\x\\tests\\a.ts', 'C:\\repo'),
        false,
    )
})

test('env-signal - inScope ignores where the checkout lives', () => {
    assertEquals(
        inScope('/home/tests/repo/config/app.ts', '/home/tests/repo'),
        true,
    )
    assertEquals(inScope('/srv/app/repo/scripts/x.ts', '/srv/app/repo'), false)
})
