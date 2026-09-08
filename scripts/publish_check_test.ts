/**
 * @fileoverview Unit tests for the `publish.include` / `publish.exclude` file
 * selection in {@link selectPublishedFiles}. These exercise the allowlist
 * semantics directly, without a real `deno publish` (which needs the network
 * and runs only in CI).
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { publishabilityFault, selectPublishedFiles } from './publish_check.ts'

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

Deno.test('a named member with no version is a publish-blocking fault', () => {
    const fault = publishabilityFault('packages/testing/deno.json', {
        name: '@lockness/testing',
        exports: './mod.ts',
    })
    assert(fault !== null, 'a named member with no version must be a fault')
    assertStringIncludes(fault, 'packages/testing/deno.json')
    assertStringIncludes(fault, '"version"')
    // The message has to say WHY, or the operator reaches for one of the two
    // escapes that do not work -- both of which were tried at v0.3.0.
    assertStringIncludes(fault, 'ATOMIC')
    assertStringIncludes(fault, '"private": true')
})

Deno.test('a member with NO name is not a package, and not a fault', () => {
    // `./packages/vite/demo` is a workspace member with no name, no version and
    // no exports, and v0.3.0 published successfully with it present: `deno
    // publish` does not treat it as a package. A check that demanded a version
    // from every member would fail on it and be deleted by whoever hit it.
    assertEquals(publishabilityFault('packages/vite/demo/deno.json', {}), null)
    assertEquals(
        publishabilityFault('packages/vite/demo/deno.json', {
            tasks: { dev: 'vite' },
        }),
        null,
    )
})

Deno.test('a complete member is clean, and exports is required too', () => {
    assertEquals(
        publishabilityFault('packages/core/deno.json', {
            name: '@lockness/core',
            version: '0.3.0',
            exports: './mod.ts',
        }),
        null,
    )
    const noExports = publishabilityFault('packages/x/deno.json', {
        name: '@lockness/x',
        version: '0.3.0',
    })
    assert(noExports !== null)
    assertStringIncludes(noExports, '"exports"')
})

Deno.test('publish:check EXITS NON-ZERO on an unpublishable member', async () => {
    // The acceptance criterion asks for the exit code, not only the message:
    // every gate step of run 34283254973 passed and the publish still aborted,
    // so what matters is that `deno task publish:check` refuses BEFORE a
    // release run gets that far.
    const dir = await Deno.makeTempDir({ prefix: 'publish-check-witness-' })
    try {
        await Deno.mkdir(`${dir}/packages/broken`, { recursive: true })
        await Deno.writeTextFile(
            `${dir}/deno.jsonc`,
            JSON.stringify({
                version: '0.3.0',
                workspace: ['./packages/broken'],
            }),
        )
        // A name and exports, no version -- @lockness/testing's exact shape.
        await Deno.writeTextFile(
            `${dir}/packages/broken/deno.json`,
            JSON.stringify({ name: '@scope/broken', exports: './mod.ts' }),
        )
        const command = new Deno.Command(Deno.execPath(), {
            args: [
                'run',
                '-A',
                new URL('./publish_check.ts', import.meta.url).pathname,
            ],
            cwd: dir,
            stdout: 'piped',
            stderr: 'piped',
        })
        const { code, stdout } = await command.output()
        const out = new TextDecoder().decode(stdout)
        assertEquals(code, 1, `expected a refusal, got exit ${code}:\n${out}`)
        assertStringIncludes(out, 'cannot be published')
        assertStringIncludes(out, 'packages/broken/deno.json')
    } finally {
        await Deno.remove(dir, { recursive: true }).catch(() => {})
    }
})
