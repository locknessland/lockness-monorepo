/**
 * @fileoverview Unit tests for the `publish.include` / `publish.exclude` file
 * selection in {@link selectPublishedFiles}. These exercise the allowlist
 * semantics directly, without a real `deno publish` (which needs the network
 * and runs only in CI).
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import {
    classifyCheck,
    publishabilityFault,
    resolutionVerdict,
    selectPublishedFiles,
} from './publish_check.ts'

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

// ---- Fail closed (#388) ---------------------------------------------------

const PRE_RELEASE_LINE =
    "error: Could not find version of '@lockness/core' that matches specified version constraint '^9.9.9'"

Deno.test('fail closed: an unrecognised deno check failure is red', () => {
    // A type error is not a pre-release condition. This exact shape used to
    // read "declared; some versions not on JSR yet" and pass.
    const result = classifyCheck(
        'core',
        false,
        "TS2322 [ERROR]: Type 'string' is not assignable to type 'number'.\n" +
            'error: Type checking failed.\n',
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.detail, 'unrecognised failure')
})

Deno.test('fail closed: a failure with no output at all is red', () => {
    assertEquals(classifyCheck('core', false, '').ok, false)
})

Deno.test('the recognised pre-release condition passes', () => {
    const result = classifyCheck(
        'core',
        false,
        `Download https://jsr.io/@lockness/core/meta.json\n${PRE_RELEASE_LINE}\n` +
            '    at file:///tmp/x/mod.ts:1:8\n',
    )
    assertEquals(result.ok, true, result.detail)
})

Deno.test('the pre-release condition is recognised through ANSI colour', () => {
    const coloured = `\x1b[1m\x1b[31merror\x1b[0m: Could not find version of ` +
        `'@lockness/core' that matches specified version constraint '^9.9.9'`
    assertEquals(classifyCheck('core', false, coloured).ok, true)
})

Deno.test('a missing third-party version is not a pre-release state', () => {
    const result = classifyCheck(
        'core',
        false,
        "error: Could not find version of '@std/path' that matches specified version constraint '^99.0.0'",
    )
    assertEquals(result.ok, false)
})

Deno.test('a pre-release line does not launder another error', () => {
    const result = classifyCheck(
        'core',
        false,
        `${PRE_RELEASE_LINE}\nerror: Type checking failed.`,
    )
    assertEquals(result.ok, false)
})

Deno.test('an undeclared import is still named as such', () => {
    const result = classifyCheck(
        'drizzle',
        false,
        'TS2307 [ERROR]: Import "@lockness/cli" not a dependency and not in import map',
    )
    assertEquals(result.ok, false)
    assertEquals(result.detail, 'undeclared: @lockness/cli')
})

Deno.test('the success line appears only with exit code 0', () => {
    const red = resolutionVerdict([
        { name: 'core', ok: true, detail: 'resolves' },
        { name: 'cli', ok: false, detail: 'unrecognised failure: x' },
    ])
    assertEquals(red.code, 1)
    assert(!red.lines.some((line) => line.includes('✅')), red.lines.join('\n'))
    assertStringIncludes(red.lines.join('\n'), 'cli')

    const green = resolutionVerdict([
        { name: 'core', ok: true, detail: 'resolves' },
    ])
    assertEquals(green.code, 0)
    assert(green.lines.some((line) => line.includes('✅')))
})

Deno.test({
    name:
        'an unrecognised failure turns the whole run red, with no success line',
    fn: async () => {
        const dir = await Deno.makeTempDir({ prefix: 'publish-check-closed-' })
        try {
            await Deno.mkdir(`${dir}/packages/bad`, { recursive: true })
            await Deno.writeTextFile(
                `${dir}/deno.jsonc`,
                JSON.stringify({ workspace: ['./packages/bad'] }),
            )
            await Deno.writeTextFile(
                `${dir}/packages/bad/deno.json`,
                JSON.stringify({
                    name: '@scope/bad',
                    version: '0.0.1',
                    exports: './mod.ts',
                }),
            )
            // Resolves fine, fails to type-check: a failure publish:check has
            // no rule for. Offline by construction — no imports at all.
            await Deno.writeTextFile(
                `${dir}/packages/bad/mod.ts`,
                "export const x: number = 'not a number'\n",
            )
            const { code, stdout, stderr } = await new Deno.Command(
                Deno.execPath(),
                {
                    args: [
                        'run',
                        '-A',
                        new URL('./publish_check.ts', import.meta.url)
                            .pathname,
                    ],
                    cwd: dir,
                    stdout: 'piped',
                    stderr: 'piped',
                },
            ).output()
            const out = new TextDecoder().decode(stdout) +
                new TextDecoder().decode(stderr)
            assertEquals(code, 1, `expected red, got exit ${code}:\n${out}`)
            assertStringIncludes(out, 'unrecognised failure')
            assert(
                !out.includes('Every package resolves standalone'),
                `a red run printed the success line:\n${out}`,
            )
        } finally {
            await Deno.remove(dir, { recursive: true }).catch(() => {})
        }
    },
})
