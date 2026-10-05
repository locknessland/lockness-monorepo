/**
 * Tests for the `lockness/app-file-specifier` lint rule (#477): one positive
 * per shape, the shapes that must stay clean, and the file scoping.
 */

import { assertEquals } from '@std/assert'
import plugin, { inScope } from './app_file_specifier.ts'
import { REPO_ROOT } from './repo_path.ts'

/** Lint `source` as a package source file and return the rule's hit count. */
function hits(source: string, file = `${REPO_ROOT}packages/x/mod.ts`): number {
    return Deno.lint.runPlugin(plugin, file, source)
        .filter((d) => d.id === 'lockness/app-file-specifier').length
}

const POSITIVES: ReadonlyArray<readonly [string, string]> = [
    ['import of file://${…}', 'await import(`file://${p}`)'],
    ['import of file:///${…}', 'await import(`file:///${p}`)'],
    ['import of file:${…}', 'await import(`file:${p}`)'],
    ['file://${…} as a string', 'const u = `file://${p}`'],
    [
        'the template on the line after import(',
        'await import(\n    `file://${Deno.cwd()}/${p}`\n)',
    ],
    ['Deno.cwd() interpolated', 'const m = `${Deno.cwd()}/app/kernel.ts`'],
    ["'file://' + p", "const u = 'file://' + p"],
    ["Deno.cwd() + '/x'", "const u = Deno.cwd() + '/app/x.ts'"],
    ["new URL(p, 'file://')", "const u = new URL(p, 'file://')"],
    ['import of a non-relative template', 'await import(`${name}/install`)'],
]

for (const [label, source] of POSITIVES) {
    Deno.test(`app-file-specifier - flags ${label}`, () => {
        assertEquals(hits(source), 1)
    })
}

const NEGATIVES: ReadonlyArray<readonly [string, string]> = [
    ['importAppFile(p)', 'await importAppFile(p)'],
    ['a literal relative import', "await import('./x.ts')"],
    ['a relative template import', 'await import(`./sub/${n}.ts`)'],
    ['a parent-relative template import', 'await import(`../sub/${n}.ts`)'],
    ['toFileUrl(p).href', 'const u = toFileUrl(p).href'],
    [
        'new URL relative to import.meta.url',
        "const u = new URL('./stubs', import.meta.url)",
    ],
    [
        "import.meta.url.startsWith('file://')",
        "const local = import.meta.url.startsWith('file://')",
    ],
    ['an unrelated template', 'const s = `hello ${name}`'],
    ['string concatenation without file:', "const s = 'a' + b"],
]

for (const [label, source] of NEGATIVES) {
    Deno.test(`app-file-specifier - leaves ${label} alone`, () => {
        assertEquals(hits(source), 0)
    })
}

Deno.test('app-file-specifier - reports nothing in tests or outside packages', () => {
    const source = 'await import(`file://${p}`)'
    assertEquals(hits(source, `${REPO_ROOT}packages/x/tests/a.ts`), 0)
    assertEquals(hits(source, `${REPO_ROOT}packages/x/a.test.ts`), 0)
    assertEquals(hits(source, `${REPO_ROOT}packages/x/a_test.ts`), 0)
    assertEquals(hits(source, `${REPO_ROOT}scripts/a.ts`), 0)
})

Deno.test('app-file-specifier - inScope reads Windows separators', () => {
    assertEquals(inScope('C:\\repo\\packages\\x\\mod.ts', 'C:\\repo'), true)
    assertEquals(
        inScope('C:\\repo\\packages\\x\\tests\\a.ts', 'C:\\repo'),
        false,
    )
})

Deno.test('app-file-specifier - inScope ignores where the checkout lives', () => {
    assertEquals(
        inScope('/home/tests/repo/packages/x/mod.ts', '/home/tests/repo'),
        true,
    )
    assertEquals(
        inScope('/srv/packages/repo/scripts/x.ts', '/srv/packages/repo'),
        false,
    )
})
