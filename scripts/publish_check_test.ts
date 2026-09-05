/**
 * @fileoverview Unit tests for the `publish.include` / `publish.exclude` file
 * selection in {@link selectPublishedFiles}. These exercise the allowlist
 * semantics directly, without a real `deno publish` (which needs the network
 * and runs only in CI).
 *
 * @module
 */

import { assertEquals } from '@std/assert'
import { selectPublishedFiles } from './publish_check.ts'

Deno.test('an empty include admits every file, then exclude subtracts', () => {
    const files = ['mod.ts', 'helpers.ts', 'tests/mod_test.ts', 'deno.json']
    assertEquals(
        selectPublishedFiles(files, [], ['tests/']),
        ['mod.ts', 'helpers.ts', 'deno.json'],
    )
})

Deno.test('an incomplete include drops a file needed at publish time', () => {
    const files = ['mod.ts', 'helpers.ts', 'deno.json', 'README.md']
    // The allowlist forgot helpers.ts, which mod.ts imports.
    const selected = selectPublishedFiles(
        files,
        ['mod.ts', 'deno.json', 'README.md'],
        [],
    )
    assertEquals(selected.includes('helpers.ts'), false)
    assertEquals(selected, ['mod.ts', 'deno.json', 'README.md'])
})

Deno.test('a complete include keeps every needed file', () => {
    const files = ['mod.ts', 'helpers.ts', 'deno.json', 'README.md']
    const selected = selectPublishedFiles(
        files,
        ['mod.ts', 'helpers.ts', 'deno.json', 'README.md'],
        [],
    )
    assertEquals(selected.includes('helpers.ts'), true)
    assertEquals(selected, files)
})

Deno.test('a literal include entry matches a whole directory subtree', () => {
    const files = [
        'mod.ts',
        'drivers/local.ts',
        'drivers/s3.ts',
        'deno.json',
    ]
    assertEquals(
        selectPublishedFiles(files, ['mod.ts', 'drivers', 'deno.json'], []),
        files,
    )
})

Deno.test('a glob include matches nested files, not other segments', () => {
    const files = ['src/a.ts', 'src/nested/b.ts', 'src/c.md', 'deno.json']
    assertEquals(
        selectPublishedFiles(files, ['src/**/*.ts'], []),
        ['src/a.ts', 'src/nested/b.ts', 'deno.json'],
    )
})

Deno.test('exclude subtracts even when include matched the file', () => {
    const files = ['mod.ts', 'internal.ts', 'deno.json']
    assertEquals(
        selectPublishedFiles(
            files,
            ['mod.ts', 'internal.ts', 'deno.json'],
            ['internal.ts'],
        ),
        ['mod.ts', 'deno.json'],
    )
})

Deno.test('the manifest is always kept, even absent from include', () => {
    const files = ['mod.ts', 'deno.json']
    assertEquals(
        selectPublishedFiles(files, ['mod.ts'], []),
        ['mod.ts', 'deno.json'],
    )
})

Deno.test('a custom manifest filename is honoured as always-kept', () => {
    const files = ['mod.ts', 'deno.jsonc']
    assertEquals(
        selectPublishedFiles(files, ['mod.ts'], [], 'deno.jsonc'),
        ['mod.ts', 'deno.jsonc'],
    )
})
