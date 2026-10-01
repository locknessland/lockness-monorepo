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
    registryVerdict,
    resolutionVerdict,
    selectPublishedFiles,
    withWorkspaceLinks,
    workspaceRangeFaults,
    type WorkspaceSibling,
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

/**
 * A REAL `deno check` failure for a `@lockness/*` version not on JSR, captured
 * from a child process piped exactly as `publish:check` pipes it (Deno 2.9.6).
 * It is kept byte for byte — ANSI colour included, since `deno` colours even a
 * piped stream — with only the fixture's temp path normalised. A hand-typed
 * literal would only prove the regex matches what someone thought Deno says.
 */
const PRE_RELEASE_OUTPUT = await Deno.readTextFile(
    new URL(
        '../tests/fixtures/publish_check/pre_release_deno_check.txt',
        import.meta.url,
    ),
)

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

Deno.test('the captured pre-release output is red', () => {
    // It used to pass as "declared; not on JSR yet". But when that message
    // fires, deno check never reaches type checking, so it drops any
    // undeclared-import error in the same file: the tolerance proved nothing
    // about declarations. Workspace packages now resolve against their staged
    // siblings, so a @lockness/* version missing from JSR is never consulted.
    assertStringIncludes(PRE_RELEASE_OUTPUT, '\x1b[', 'fixture lost its colour')
    const result = classifyCheck('core', false, PRE_RELEASE_OUTPUT)
    assertEquals(result.ok, false, result.detail)
    assertStringIncludes(result.detail, 'unrecognised failure')
})

Deno.test('the captured pre-release line does not launder a type error', () => {
    const result = classifyCheck(
        'core',
        false,
        `${PRE_RELEASE_OUTPUT}error: Type checking failed.\n`,
    )
    assertEquals(result.ok, false)
})

Deno.test('a missing third-party version is not a pre-release state', () => {
    // The captured output with only the package name swapped.
    const thirdParty = PRE_RELEASE_OUTPUT.replace(
        "'@lockness/core'",
        "'@std/path'",
    )
    assert(thirdParty !== PRE_RELEASE_OUTPUT, 'the swap did not apply')
    const result = classifyCheck(
        'core',
        false,
        thirdParty,
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
                    // publish_check.ts stages its scratch copy in
                    // `Deno.makeTempDir()` with no directory override, so it
                    // lands wherever the host's TMPDIR points (#397). Pin it
                    // to this fixture root, which carries its own minimal
                    // `deno.jsonc`: `deno check`'s upward config search then
                    // stops there instead of climbing past it to whatever the
                    // host's ambient TMPDIR happens to sit inside -- which
                    // could be a subdirectory of THIS repository, whose real
                    // `deno.jsonc` would otherwise be picked up in its place.
                    env: { TMPDIR: dir },
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

// ---- Workspace links (hermetic @lockness/* resolution) --------------------
//
// A @lockness/* import resolves against the staged sibling copy through Deno
// `links`, never against JSR. These cover the two pure transforms, the
// classifier rules they feed, and four offline end-to-end runs.

const SIBLINGS: WorkspaceSibling[] = [
    { name: '@lockness/cli', short: 'cli', version: '0.4.0' },
    { name: '@lockness/contract', short: 'contract', version: '0.4.0' },
    { name: '@lockness/core', short: 'core', version: '0.4.0' },
    { name: '@lockness/drizzle', short: 'drizzle', version: '0.4.0' },
]

Deno.test('withWorkspaceLinks: declared entries are kept unchanged', () => {
    const imports = {
        '@lockness/cli': 'jsr:@lockness/cli@^0.4.0',
        '@std/path': 'jsr:@std/path@^1.0.0',
        'drizzle-orm': 'npm:drizzle-orm@^0.36.3',
    }
    const out = withWorkspaceLinks(
        { name: '@lockness/drizzle', version: '0.4.0', imports },
        '@lockness/drizzle',
        SIBLINGS,
    )
    const rewritten = out.imports as Record<string, string>
    for (const [key, value] of Object.entries(imports)) {
        assertEquals(rewritten[key], value, key)
    }
    assertEquals(out.name, '@lockness/drizzle')
    assertEquals(out.version, '0.4.0')
})

Deno.test('withWorkspaceLinks: one sentinel pair per undeclared sibling', () => {
    const out = withWorkspaceLinks(
        {
            name: '@lockness/drizzle',
            imports: { '@lockness/cli': 'jsr:@lockness/cli@^0.4.0' },
        },
        '@lockness/drizzle',
        SIBLINGS,
    )
    const imports = out.imports as Record<string, string>
    for (const name of ['@lockness/contract', '@lockness/core']) {
        assertEquals(imports[name], `./.lockness-undeclared/${name}`)
        assertEquals(imports[`${name}/`], `./.lockness-undeclared/${name}/`)
    }
    // Declared: no sentinel, the declaration stands.
    assertEquals(imports['@lockness/cli'], 'jsr:@lockness/cli@^0.4.0')
    assertEquals(imports['@lockness/cli/'], undefined)
})

Deno.test('withWorkspaceLinks: a prefix key alone declares the sibling', () => {
    // The #388 rule: Deno resolves by key, and `@lockness/core/` is a key for
    // that package -- so it is declared, and no sentinel may shadow it.
    const out = withWorkspaceLinks(
        {
            name: '@lockness/drizzle',
            imports: { '@lockness/core/': 'jsr:/@lockness/core@^0.4.0/' },
        },
        '@lockness/drizzle',
        SIBLINGS,
    )
    const imports = out.imports as Record<string, string>
    assertEquals(imports['@lockness/core'], undefined)
    assertEquals(imports['@lockness/core/'], 'jsr:/@lockness/core@^0.4.0/')
})

Deno.test('withWorkspaceLinks: links name every sibling but never self', () => {
    const out = withWorkspaceLinks(
        { name: '@lockness/drizzle', imports: {} },
        '@lockness/drizzle',
        SIBLINGS,
    )
    assertEquals(out.links, [
        '../../pkgs/cli',
        '../../pkgs/contract',
        '../../pkgs/core',
    ])
    const imports = out.imports as Record<string, string>
    assertEquals(imports['@lockness/drizzle'], undefined)
})

Deno.test('workspaceRangeFaults: a range the workspace satisfies is clean', () => {
    assertEquals(
        workspaceRangeFaults(
            { imports: { '@lockness/cli': 'jsr:@lockness/cli@^0.4.0' } },
            SIBLINGS,
        ),
        [],
    )
})

Deno.test('workspaceRangeFaults: a stale range is a fault', () => {
    const faults = workspaceRangeFaults(
        { imports: { '@lockness/cli': 'jsr:@lockness/cli@^0.3.0' } },
        SIBLINGS,
    )
    assertEquals(faults, [
        'stale range: @lockness/cli declares ^0.3.0, workspace is 0.4.0',
    ])
})

Deno.test('workspaceRangeFaults: an unparseable range is named invalid, with its cause', () => {
    const faults = workspaceRangeFaults(
        { imports: { '@lockness/cli': 'jsr:@lockness/cli@^not.a.range' } },
        SIBLINGS,
    )
    assertEquals(faults.length, 1)
    assertStringIncludes(
        faults[0],
        'invalid range: @lockness/cli declares ^not.a.range: ',
    )
    assert(!faults[0].startsWith('stale range'))
})

Deno.test('workspaceRangeFaults: a subpath specifier is parsed', () => {
    assertEquals(
        workspaceRangeFaults(
            {
                imports: {
                    '@lockness/core/jsx-runtime':
                        'jsr:@lockness/core@^0.4.0/jsx-runtime',
                },
            },
            SIBLINGS,
        ),
        [],
    )
    const stale = workspaceRangeFaults(
        {
            imports: {
                '@lockness/core/jsx-runtime':
                    'jsr:@lockness/core@^0.3.0/jsx-runtime',
            },
        },
        SIBLINGS,
    )
    assertEquals(stale.length, 1)
    assertStringIncludes(stale[0], '@lockness/core/jsx-runtime declares ^0.3.0')
})

Deno.test('workspaceRangeFaults: non-siblings are ignored', () => {
    assertEquals(
        workspaceRangeFaults(
            {
                imports: {
                    '@std/path': 'jsr:@std/path@^0.1.0',
                    'drizzle-orm': 'npm:drizzle-orm@^0.36.3',
                    '@other/cli': 'jsr:@other/cli@^0.0.1',
                },
            },
            SIBLINGS,
        ),
        [],
    )
})

Deno.test('a sentinel hit reads as undeclared, not as missing from publish.include', () => {
    const output =
        "TS2307 [ERROR]: Cannot find module 'file:///tmp/lockness-publish-x/root/drizzle/.lockness-undeclared/@lockness/contract'.\n" +
        '    at file:///tmp/lockness-publish-x/root/drizzle/mod.ts:1:8\n' +
        'error: Type checking failed.\n'
    const result = classifyCheck('drizzle', false, output)
    assertEquals(result.ok, false)
    assertEquals(result.detail, 'undeclared: @lockness/contract')
})

Deno.test('a sentinel hit on a subpath names the package', () => {
    const output =
        "TS2307 [ERROR]: Cannot find module 'file:///tmp/s/root/drizzle/.lockness-undeclared/@lockness/core/jsx-runtime'.\n" +
        'error: Type checking failed.\n'
    assertEquals(
        classifyCheck('drizzle', false, output).detail,
        'undeclared: @lockness/core',
    )
})

Deno.test("today's Unknown export failure is red", () => {
    const result = classifyCheck(
        'drizzle',
        false,
        "error: Unknown export './command-failure' for '@lockness/cli@0.4.0'.\n",
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.detail, 'Unknown export')
})

Deno.test('no tolerated failure: every fixture verdict equals the exit status', () => {
    const fixtures: Array<[boolean, string]> = [
        [true, ''],
        [true, 'Check file:///tmp/x/mod.ts\n'],
        [false, ''],
        [false, PRE_RELEASE_OUTPUT],
        [false, "error: Unknown export './x' for '@lockness/cli@0.4.0'.\n"],
        [
            false,
            'TS2307 [ERROR]: Import "@lockness/cli" not a dependency and not in import map',
        ],
        [
            false,
            "TS2307 [ERROR]: Cannot find module 'file:///tmp/x/helpers.ts'.",
        ],
        [
            false,
            "TS2307 [ERROR]: Cannot find module 'file:///tmp/x/.lockness-undeclared/@lockness/core'.",
        ],
    ]
    for (const [success, output] of fixtures) {
        assertEquals(
            classifyCheck('core', success, output).ok,
            success,
            JSON.stringify(output),
        )
    }
})

/** One package of an offline end-to-end fixture workspace. */
interface FixturePackage {
    /** Short directory name under `packages/`. */
    short: string
    /** Its `deno.json`. */
    manifest: Record<string, unknown>
    /** Relative path to source text. */
    files: Record<string, string>
}

/**
 * Build a throwaway workspace under a fake scope and run `publish_check.ts` in
 * it, with TMPDIR pinned to it (see the fail-closed test above for why). The
 * scope is fake so that any fallback to JSR fails instead of passing against a
 * published copy: green here can only come from the linked sibling.
 *
 * @param packages - The workspace members.
 * @returns The exit code and the combined output.
 */
async function runWorkspace(
    packages: FixturePackage[],
): Promise<{ code: number; out: string }> {
    const dir = await Deno.makeTempDir({ prefix: 'publish-check-links-' })
    try {
        await Deno.writeTextFile(
            `${dir}/deno.jsonc`,
            JSON.stringify({
                workspace: packages.map((p) => `./packages/${p.short}`),
            }),
        )
        for (const pkg of packages) {
            const root = `${dir}/packages/${pkg.short}`
            await Deno.mkdir(root, { recursive: true })
            await Deno.writeTextFile(
                `${root}/deno.json`,
                JSON.stringify(pkg.manifest),
            )
            for (const [file, text] of Object.entries(pkg.files)) {
                await Deno.writeTextFile(`${root}/${file}`, text)
            }
        }
        const { code, stdout, stderr } = await new Deno.Command(
            Deno.execPath(),
            {
                args: [
                    'run',
                    '-A',
                    new URL('./publish_check.ts', import.meta.url).pathname,
                ],
                cwd: dir,
                env: { TMPDIR: dir },
                stdout: 'piped',
                stderr: 'piped',
            },
        ).output()
        return {
            code,
            out: new TextDecoder().decode(stdout) +
                new TextDecoder().decode(stderr),
        }
    } finally {
        await Deno.remove(dir, { recursive: true }).catch(() => {})
    }
}

/** A sibling exporting a subpath that exists only in the workspace. */
const PKG_A: FixturePackage = {
    short: 'a',
    manifest: {
        name: '@x-lockness-fixture/a',
        version: '0.1.0',
        exports: { '.': './mod.ts', './local-only': './local_only.ts' },
    },
    files: {
        'mod.ts': 'export const a: number = 1\n',
        'local_only.ts': 'export const onlyHere: number = 2\n',
    },
}

/** A sibling nobody declares. */
const PKG_C: FixturePackage = {
    short: 'c',
    manifest: {
        name: '@x-lockness-fixture/c',
        version: '0.1.0',
        exports: './mod.ts',
    },
    files: { 'mod.ts': 'export const c: number = 3\n' },
}

/**
 * The package under test, importing `source` and declaring `imports`.
 *
 * @param source - The body of `mod.ts`.
 * @param imports - The manifest's import map.
 * @returns The fixture package.
 */
function pkgB(
    source: string,
    imports: Record<string, string>,
): FixturePackage {
    return {
        short: 'b',
        manifest: {
            name: '@x-lockness-fixture/b',
            version: '0.1.0',
            exports: './mod.ts',
            imports,
        },
        files: { 'mod.ts': source },
    }
}

const DECLARES_A = {
    '@x-lockness-fixture/a': 'jsr:@x-lockness-fixture/a@^0.1.0',
}

Deno.test('links: a subpath that exists only in the workspace resolves', async () => {
    const { code, out } = await runWorkspace([
        PKG_A,
        pkgB(
            "import { onlyHere } from '@x-lockness-fixture/a/local-only'\n" +
                'export const b: number = onlyHere\n',
            DECLARES_A,
        ),
        PKG_C,
    ])
    assertEquals(code, 0, out)
    assertStringIncludes(out, 'Every package resolves standalone')
})

Deno.test('links: an undeclared sibling import is red and named', async () => {
    // The tripwire for `links` name semantics: a linked package resolves by
    // name even when undeclared, so only the sentinel can catch this.
    const { code, out } = await runWorkspace([
        PKG_A,
        pkgB(
            "import { a } from '@x-lockness-fixture/a'\n" +
                "import { c } from '@x-lockness-fixture/c'\n" +
                'export const b: number = a + c\n',
            DECLARES_A,
        ),
        PKG_C,
    ])
    assertEquals(code, 1, out)
    assertStringIncludes(out, 'undeclared: @x-lockness-fixture/c')
})

Deno.test('links: a range the workspace version misses is red', async () => {
    const { code, out } = await runWorkspace([
        PKG_A,
        pkgB(
            "import { a } from '@x-lockness-fixture/a'\nexport const b = a\n",
            { '@x-lockness-fixture/a': 'jsr:@x-lockness-fixture/a@^0.0.9' },
        ),
        PKG_C,
    ])
    assertEquals(code, 1, out)
    assertStringIncludes(out, 'stale range')
})

Deno.test('links: a subpath the sibling does not export is red', async () => {
    const { code, out } = await runWorkspace([
        PKG_A,
        pkgB(
            "import { x } from '@x-lockness-fixture/a/missing'\nexport const b = x\n",
            DECLARES_A,
        ),
        PKG_C,
    ])
    assertEquals(code, 1, out)
    assertStringIncludes(out, '❌ b')
    // Red because the LINKED copy lacks the export -- not because JSR was
    // consulted and knows nothing of the fake scope.
    assertStringIncludes(out, "Unknown export './missing'")
    assert(!out.includes('JSR package not found'), out)
})

// ---- --registry (#397, finding 5) -----------------------------------------
//
// `existsOnJsr` itself needs a real network round trip and is not tested here
// (coordinated with #396, which owns `gate --registry`); `registryVerdict` is
// the decision the network result feeds, and is what these cover directly.

Deno.test('registryVerdict: every package present is a clean pass', () => {
    const result = registryVerdict([], 0)
    assertEquals(result.code, 0)
    assert(result.lines.some((line) => line.includes('✅')))
})

Deno.test('registryVerdict: a missing package fails closed with a create URL', () => {
    const result = registryVerdict(['scheduler'], 0)
    assertEquals(result.code, 1)
    const joined = result.lines.join('\n')
    assertStringIncludes(joined, 'must be created on JSR')
    assertStringIncludes(
        joined,
        'https://jsr.io/new?scope=lockness&package=scheduler',
    )
})

Deno.test('registryVerdict: unreachable-only is inconclusive, not a fault', () => {
    const result = registryVerdict([], 2)
    assertEquals(result.code, 0)
    assertEquals(result.lines, [])
})

Deno.test('registryVerdict: a missing package wins over a merely unreachable one', () => {
    const result = registryVerdict(['queue'], 1)
    assertEquals(result.code, 1)
    assertStringIncludes(result.lines.join('\n'), 'queue')
})
