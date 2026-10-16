/**
 * Tests for the `lockness-runtime/no-deno` lint rule (#596, plan 274 FR-001):
 * the forms it flags, the look-alikes it leaves alone, and its scope — the
 * packages whose `engines` names bun or node, the runtime-neutral script list,
 * and the named exemptions.
 *
 * Scope is read from each package's `package.json`, so the rule is linted
 * against a fixture repository built in a temporary directory: whether a
 * package is in scope there is decided by the fixture, not by today's tree.
 */

import { after, test } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertEquals, assertThrows } from '@std/assert'
import { parse as parseJsonc } from '@std/jsonc'
import defaultPlugin, {
    createRuntimeNeutralPlugin,
    EXEMPT_FILES,
    lintScope,
} from './runtime_neutral.ts'
import { REPO_ROOT } from './repo_path.ts'

/** The fixture repository, with forward slashes and a trailing `/`. */
const ROOT = mkdtempSync(join(tmpdir(), 'runtime-neutral-'))
    .replaceAll('\\', '/') + '/'

/** Write a fixture package manifest naming `engines`. */
function fixturePackage(name: string, engines: Record<string, string>): void {
    mkdirSync(`${ROOT}packages/${name}`, { recursive: true })
    writeFileSync(
        `${ROOT}packages/${name}/package.json`,
        JSON.stringify({ name: `@lockness/${name}`, engines }),
    )
}

fixturePackage('neutral', { deno: '>=2.2', node: '>=24' })
fixturePackage('buncore', { deno: '>=2.2', bun: '>=1.4' })
fixturePackage('denoonly', { deno: '>=2.2' })
fixturePackage('runtime', { deno: '>=2.2', bun: '>=1.4', node: '>=24' })
mkdirSync(`${ROOT}packages/broken`, { recursive: true })
writeFileSync(`${ROOT}packages/broken/package.json`, '{ not json')
// The plugin carve-out is read from the fixture's own root deno.jsonc.
writeFileSync(
    `${ROOT}deno.jsonc`,
    '{ "lint": { "plugins": [\n  // a comment, as in the real file\n  "./scripts/lint/rule.ts"\n] } }',
)

after(() => rmSync(ROOT, { recursive: true, force: true }))

const OPTIONS = {
    root: ROOT,
    exempt: ['packages/neutral/kv_deno.ts'],
    denoBound: ['scripts/old.ts'],
}
const plugin = createRuntimeNeutralPlugin(OPTIONS)

/** An in-scope package file no list names. */
const NEUTRAL = `${ROOT}packages/neutral/mod.ts`

/** Lint `source` as `file` and return the hit count of `rule`. */
function hits(
    source: string,
    file = NEUTRAL,
    rule: 'no-deno' | 'neutral-imports' = 'no-deno',
): number {
    return Deno.lint.runPlugin(plugin, file, source)
        .filter((d) => d.id === `lockness-runtime/${rule}`).length
}

// ---------------------------------------------------------------------------
// The forbidden forms
// ---------------------------------------------------------------------------

const POSITIVES: ReadonlyArray<readonly [string, string]> = [
    ['a Deno.* call', "const v = Deno.env.get('X')"],
    ['a bare Deno reference', 'const d = Deno'],
    ['typeof Deno', "const onDeno = typeof Deno !== 'undefined'"],
    ['Deno in a type', 'let n: Deno.lint.Node'],
    ['a Deno shorthand property', 'const o = { Deno }'],
    ['globalThis.Deno', 'const d = globalThis.Deno'],
    ["globalThis['Deno']", "const d = globalThis['Deno']"],
    ['self.Deno', 'const d = self.Deno'],
    ["the 'Deno' in probe", "const onDeno = 'Deno' in globalThis"],
    ['a hono/deno import', "import { serveStatic } from 'hono/deno'"],
    [
        'an npm: hono/deno import',
        "import { upgradeWebSocket } from 'npm:hono@4/deno'",
    ],
    [
        'a jsr: hono/deno import',
        "import { serveStatic } from 'jsr:@hono/hono/deno'",
    ],
    ['a hono/deno re-export', "export { serveStatic } from 'hono/deno'"],
    ['a hono/deno star re-export', "export * from 'hono/deno'"],
    ['a dynamic hono/deno import', "const m = await import('hono/deno')"],
    [
        'an @lockness/hono/deno import',
        "import { x } from '@lockness/hono/deno'",
    ],
    ['an @lockness/hono/bun import', "import { x } from '@lockness/hono/bun'"],
    [
        'an @lockness/hono/node import',
        "import { x } from '@lockness/hono/node'",
    ],
    [
        'a versioned jsr: @lockness/hono/node import',
        "import { x } from 'jsr:@lockness/hono@^0.4.0/node'",
    ],
    [
        'a type-only adapter import',
        "import type { X } from '@lockness/hono/bun'",
    ],
]

for (const [label, source] of POSITIVES) {
    test(`no-deno - flags ${label}`, () => {
        assertEquals(hits(source), 1)
    })
}

const NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    ['a Deno property of another object', 'const v = engines.Deno'],
    ['a Deno object key', 'const o = { Deno: 1 }'],
    ['a Deno class member', 'class A { Deno = 1 }'],
    ['a Deno interface member', 'interface A { Deno: string }'],
    ['the word in a string', "const s = 'runs on Deno'"],
    [
        'the word in a comment',
        '// Deno answers for a missing node\nconst x = 1',
    ],
    ['a right-hand qualified name', 'let n: Lint.Deno'],
    ['the root hono barrel', "import { Hono } from '@lockness/hono'"],
    ['another hono subpath', "import { jsx } from '@lockness/hono/jsx'"],
    ['a look-alike package', "import { x } from 'hono-deno'"],
    ['node: built-ins', "import { readFileSync } from 'node:fs'"],
    ['a computed dynamic import', 'const m = await import(specifier)'],
]

for (const [label, source] of NEGATIVES) {
    test(`no-deno - leaves ${label} alone`, () => {
        assertEquals(hits(source), 0)
    })
}

test('no-deno - one hit per forbidden form in a file', () => {
    const source = [
        "import { serveStatic } from 'hono/deno'",
        "import { x } from '@lockness/hono/node'",
        'Deno.exit(0)',
    ].join('\n')
    assertEquals(hits(source), 3)
})

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

test('no-deno - lints a package whose engines names node or bun', () => {
    assertEquals(hits('Deno.cwd()', `${ROOT}packages/neutral/a/b.ts`), 1)
    assertEquals(hits('Deno.cwd()', `${ROOT}packages/buncore/mod.ts`), 1)
    assertEquals(hits('Deno.cwd()', `${ROOT}packages/neutral/view.tsx`), 1)
})

test('no-deno - leaves a Deno-only package alone', () => {
    assertEquals(hits('Deno.cwd()', `${ROOT}packages/denoonly/mod.ts`), 0)
})

test('no-deno - leaves tests and stubs alone', () => {
    for (
        const file of [
            'packages/neutral/tests/a.ts',
            'packages/neutral/a.test.ts',
            'packages/neutral/a_test.ts',
            'packages/neutral/stubs/a.ts',
        ]
    ) {
        assertEquals(hits('Deno.cwd()', `${ROOT}${file}`), 0, file)
    }
})

test('no-deno - leaves an exempt file alone, by its exact name only', () => {
    assertEquals(hits('Deno.openKv()', `${ROOT}packages/neutral/kv_deno.ts`), 0)
    assertEquals(
        hits('Deno.openKv()', `${ROOT}packages/neutral/sub/kv_deno.ts`),
        1,
    )
})

test('no-deno - lets packages/runtime/ import the hono adapters, nothing else', () => {
    const file = `${ROOT}packages/runtime/http.ts`
    assertEquals(hits("import { x } from '@lockness/hono/bun'", file), 0)
    assertEquals(hits("import { x } from '@lockness/hono/node'", file), 0)
    assertEquals(hits("import { x } from 'hono/deno'", file), 1)
    assertEquals(hits('Deno.serve(() => new Response())', file), 1)
})

test('no-deno - lints every script outside the baseline and the plugins', () => {
    // A new script is in scope by default: nothing has to opt it in.
    assertEquals(hits('Deno.exit(1)', `${ROOT}scripts/new.ts`), 1)
    assertEquals(hits('Deno.exit(1)', `${ROOT}scripts/sub/new.ts`), 1)
    assertEquals(
        hits(
            "import { x } from '@lockness/hono/deno'",
            `${ROOT}scripts/new.ts`,
        ),
        1,
    )
    assertEquals(hits('Deno.exit(1)', `${ROOT}scripts/old.ts`), 0)
    assertEquals(hits('Deno.exit(1)', `${ROOT}scripts/lint/rule.ts`), 0)
    assertEquals(hits('Deno.exit(1)', `${ROOT}scripts/new_test.ts`), 0)
    assertEquals(hits('Deno.exit(1)', `${ROOT}scripts/tests/a.ts`), 0)
})

// ---------------------------------------------------------------------------
// neutral-imports
// ---------------------------------------------------------------------------

const IMPORT_POSITIVES: ReadonlyArray<readonly [string, string]> = [
    ['an import of a baseline script', "import { a } from './old.ts'"],
    ['a type-only import of one', "import type { A } from './old.ts'"],
    ['a re-export of one', "export { a } from './old.ts'"],
    ['a star re-export of one', "export * from './old.ts'"],
    ['a dynamic import of one', "const m = await import('./old.ts')"],
    ['an import of a plugin module', "import p from './lint/rule.ts'"],
    [
        'an import of a Deno-only package',
        "import { x } from '../packages/denoonly/mod.ts'",
    ],
    ['an import of a test helper', "import { t } from './new_test.ts'"],
]

for (const [label, source] of IMPORT_POSITIVES) {
    test(`neutral-imports - flags ${label}`, () => {
        assertEquals(
            hits(source, `${ROOT}scripts/new.ts`, 'neutral-imports'),
            1,
        )
    })
}

const IMPORT_NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    ['an import of an in-scope script', "import { b } from './other.ts'"],
    ['an import up and back down', "import { b } from '../scripts/other.ts'"],
    [
        'an import of an in-scope package',
        "import { x } from '../packages/neutral/mod.ts'",
    ],
    ['a bare specifier', "import { join } from '@std/path'"],
    // Bare specifiers are B4's to resolve, even one spelled like a file here.
    [
        'a bare specifier spelled like a baseline file',
        "import { a } from 'old.ts'",
    ],
    ['a node: built-in', "import { readFile } from 'node:fs/promises'"],
    ['a computed dynamic import', 'const m = await import(specifier)'],
]

for (const [label, source] of IMPORT_NEGATIVES) {
    test(`neutral-imports - leaves ${label} alone`, () => {
        assertEquals(
            hits(source, `${ROOT}scripts/new.ts`, 'neutral-imports'),
            0,
        )
    })
}

test('neutral-imports - leaves package source to deps:analyze and engines', () => {
    // Package edges are governed by deps.policy.jsonc and engines
    // monotonicity, not by this script rule.
    assertEquals(
        hits(
            "import { x } from '../denoonly/mod.ts'",
            NEUTRAL,
            'neutral-imports',
        ),
        0,
    )
})

test('neutral-imports - binds in-scope scripts only', () => {
    const source = "import { a } from './old.ts'"
    // A plugin may import a neutral script; a baseline script may import anything.
    assertEquals(
        hits(source, `${ROOT}scripts/lint/rule.ts`, 'neutral-imports'),
        0,
    )
    assertEquals(hits(source, `${ROOT}scripts/old.ts`, 'neutral-imports'), 0)
    assertEquals(
        hits(
            "import { a } from '../old.ts'",
            `${ROOT}scripts/lint/helper.ts`,
            'neutral-imports',
        ),
        1,
    )
})

test('no-deno - leaves files outside packages/ and the list alone', () => {
    for (const file of ['app/kernel.ts', 'config/app.ts', 'main.ts']) {
        assertEquals(hits('Deno.cwd()', `${ROOT}${file}`), 0, file)
    }
    assertEquals(hits('Deno.cwd()', '/elsewhere/packages/neutral/mod.ts'), 0)
})

test('lintScope - names the scope each path falls in', () => {
    assertEquals(lintScope(NEUTRAL, OPTIONS), 'package')
    assertEquals(
        lintScope(`${ROOT}packages/runtime/mod.ts`, OPTIONS),
        'runtime',
    )
    assertEquals(lintScope(`${ROOT}scripts/new.ts`, OPTIONS), 'script')
    assertEquals(lintScope(`${ROOT}scripts/old.ts`, OPTIONS), undefined)
    assertEquals(lintScope(`${ROOT}scripts/lint/rule.ts`, OPTIONS), undefined)
    assertEquals(
        lintScope(`${ROOT}packages/denoonly/mod.ts`, OPTIONS),
        undefined,
    )
    assertEquals(
        lintScope(`${ROOT}packages/missing/mod.ts`, OPTIONS),
        undefined,
    )
    assertEquals(
        lintScope(`${ROOT}packages/neutral/kv_deno.ts`, OPTIONS),
        undefined,
    )
})

test('lintScope - a checkout under a directory named packages lints the same', () => {
    const nested = `${ROOT}packages/`
    assertEquals(
        lintScope(`${nested}mod.ts`, { ...OPTIONS, root: nested }),
        undefined,
    )
})

test('lintScope - an unreadable manifest fails loudly instead of skipping', () => {
    assertThrows(
        () => lintScope(`${ROOT}packages/broken/mod.ts`, OPTIONS),
        SyntaxError,
    )
})

// ---------------------------------------------------------------------------
// The repository's own configuration
// ---------------------------------------------------------------------------

test('no-deno - the root lint config registers the rule', () => {
    const config = parseJsonc(
        Deno.readTextFileSync(`${REPO_ROOT}deno.jsonc`),
    ) as { lint?: { plugins?: string[] } }
    assertEquals(
        config.lint?.plugins?.includes('./scripts/lint/runtime_neutral.ts'),
        true,
    )
})

test('no-deno - every named exemption is an existing package file', () => {
    for (const path of EXEMPT_FILES) {
        assertEquals(path.startsWith('packages/'), true, path)
        assertEquals(Deno.statSync(`${REPO_ROOT}${path}`).isFile, true, path)
    }
})

test('no-deno - the default plugin lints @lockness/transform clean', () => {
    // transform is the first package to name node (C09): its source must pass
    // with no exemption.
    for (const entry of Deno.readDirSync(`${REPO_ROOT}packages/transform`)) {
        if (!entry.isFile || !/\.tsx?$/.test(entry.name)) continue
        const file = `${REPO_ROOT}packages/transform/${entry.name}`
        const source = Deno.readTextFileSync(file)
        const found = Deno.lint.runPlugin(defaultPlugin, file, source)
            .filter((d) => d.id === 'lockness-runtime/no-deno')
        assertEquals(found.length, 0, entry.name)
    }
    assertEquals(
        lintScope(`${REPO_ROOT}packages/transform/hook.ts`),
        'package',
    )
})
