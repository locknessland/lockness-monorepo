/**
 * @fileoverview Tests for the version bump script.
 *
 * Tests the helper functions used to update versions across
 * the Lockness monorepo.
 *
 * @module tests/bump_test
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { parse as parseJsonc } from '@std/jsonc'
import * as semver from '@std/semver'
import {
    getErrorMessage,
    isLocknessImport,
    LOCKNESS_VERSION_PATTERN,
    SEMVER_PATTERN,
    updateImportVersion,
    updateRootJsonc,
    VERSION_EXTRACT_PATTERN,
} from '../scripts/bump.ts'
import {
    LOCKFILE_REFRESH_ARGS,
    lockfileRefreshFailure,
    refreshLockfile,
} from '../scripts/lockfile.ts'

// =============================================================================
// getErrorMessage Tests
// =============================================================================

Deno.test('getErrorMessage - extracts message from Error instance', () => {
    const error = new Error('Something went wrong')
    assertEquals(getErrorMessage(error), 'Something went wrong')
})

Deno.test('getErrorMessage - converts string to string', () => {
    assertEquals(getErrorMessage('plain string error'), 'plain string error')
})

Deno.test('getErrorMessage - converts number to string', () => {
    assertEquals(getErrorMessage(404), '404')
})

Deno.test('getErrorMessage - converts null to string', () => {
    assertEquals(getErrorMessage(null), 'null')
})

Deno.test('getErrorMessage - converts undefined to string', () => {
    assertEquals(getErrorMessage(undefined), 'undefined')
})

Deno.test('getErrorMessage - converts object to string', () => {
    assertEquals(getErrorMessage({ code: 'ERR' }), '[object Object]')
})

// =============================================================================
// isLocknessImport Tests
// =============================================================================

Deno.test('isLocknessImport - returns true for @lockness/ key', () => {
    assertEquals(
        isLocknessImport('@lockness/core', 'jsr:@lockness/core@^0.1.0'),
        true,
    )
})

Deno.test('isLocknessImport - returns true for jsr:@lockness/ value', () => {
    assertEquals(
        isLocknessImport('core', 'jsr:@lockness/core@^0.1.0'),
        true,
    )
})

Deno.test('isLocknessImport - returns false for non-Lockness import', () => {
    assertEquals(
        isLocknessImport('@std/assert', 'jsr:@std/assert@^1.0.0'),
        false,
    )
})

Deno.test('isLocknessImport - returns false for non-string value', () => {
    assertEquals(isLocknessImport('@lockness/core', null), false)
    assertEquals(isLocknessImport('@lockness/core', undefined), false)
    assertEquals(isLocknessImport('@lockness/core', 123), false)
})

Deno.test('isLocknessImport - returns false for empty strings', () => {
    assertEquals(isLocknessImport('', ''), false)
})

// =============================================================================
// updateImportVersion Tests
// =============================================================================

Deno.test('updateImportVersion - updates caret version', () => {
    const result = updateImportVersion('jsr:@lockness/core@^0.1.0', '0.2.0')
    assertEquals(result, 'jsr:@lockness/core@^0.2.0')
})

Deno.test('updateImportVersion - updates tilde version', () => {
    const result = updateImportVersion('jsr:@lockness/auth@~1.0.0', '1.1.0')
    assertEquals(result, 'jsr:@lockness/auth@~1.1.0')
})

Deno.test('updateImportVersion - preserves package path', () => {
    const result = updateImportVersion(
        'jsr:@lockness/auth-provider@^0.1.0',
        '0.3.0',
    )
    assertEquals(result, 'jsr:@lockness/auth-provider@^0.3.0')
})

Deno.test('updateImportVersion - returns null for non-matching import', () => {
    const result = updateImportVersion('jsr:@std/assert@^1.0.0', '2.0.0')
    assertEquals(result, null)
})

Deno.test('updateImportVersion - returns null for invalid format', () => {
    const result = updateImportVersion('@lockness/core', '0.2.0')
    assertEquals(result, null)
})

Deno.test('updateImportVersion - handles complex versions', () => {
    const result = updateImportVersion(
        'jsr:@lockness/container@^10.20.30',
        '11.0.0',
    )
    assertEquals(result, 'jsr:@lockness/container@^11.0.0')
})

Deno.test('updateImportVersion - preserves a subpath after the version (regression #162)', () => {
    // A specifier whose value carries a subpath export (e.g. the JSX runtime)
    // must keep that subpath after the bump. Dropping it silently rewrites
    // `@lockness/hono/jsx-runtime` to the package's base export and breaks JSX
    // resolution for consumers of `@lockness/ui`.
    assertEquals(
        updateImportVersion('jsr:@lockness/hono@^0.2.0/jsx-runtime', '0.2.1'),
        'jsr:@lockness/hono@^0.2.1/jsx-runtime',
    )
    assertEquals(
        updateImportVersion('jsr:@lockness/hono@~1.0.0/zod-validator', '1.1.0'),
        'jsr:@lockness/hono@~1.1.0/zod-validator',
    )
})

// =============================================================================
// SEMVER_PATTERN Tests
// =============================================================================

Deno.test('SEMVER_PATTERN - matches valid semver', () => {
    assertEquals(SEMVER_PATTERN.test('0.1.0'), true)
    assertEquals(SEMVER_PATTERN.test('1.0.0'), true)
    assertEquals(SEMVER_PATTERN.test('10.20.30'), true)
})

Deno.test('SEMVER_PATTERN - rejects invalid semver', () => {
    assertEquals(SEMVER_PATTERN.test('v0.1.0'), false)
    assertEquals(SEMVER_PATTERN.test('0.1'), false)
    assertEquals(SEMVER_PATTERN.test('0.1.0.0'), false)
    assertEquals(SEMVER_PATTERN.test('abc'), false)
    assertEquals(SEMVER_PATTERN.test(''), false)
})

Deno.test('SEMVER_PATTERN - rejects semver with prerelease', () => {
    assertEquals(SEMVER_PATTERN.test('0.1.0-alpha'), false)
    assertEquals(SEMVER_PATTERN.test('1.0.0-beta.1'), false)
})

// =============================================================================
// VERSION_EXTRACT_PATTERN Tests
// =============================================================================

Deno.test('VERSION_EXTRACT_PATTERN - extracts version parts', () => {
    const match = 'jsr:@lockness/core@^0.1.0'.match(VERSION_EXTRACT_PATTERN)
    assertEquals(match !== null, true)
    assertEquals(match![1], 'jsr:@lockness/core')
    assertEquals(match![2], '^')
    assertEquals(match![3], '0.1.0')
})

Deno.test('VERSION_EXTRACT_PATTERN - extracts tilde prefix', () => {
    const match = 'jsr:@lockness/auth@~1.2.3'.match(VERSION_EXTRACT_PATTERN)
    assertEquals(match !== null, true)
    assertEquals(match![2], '~')
})

Deno.test('VERSION_EXTRACT_PATTERN - does not match non-Lockness', () => {
    const match = 'jsr:@std/assert@^1.0.0'.match(VERSION_EXTRACT_PATTERN)
    assertEquals(match, null)
})

// =============================================================================
// LOCKNESS_VERSION_PATTERN Tests (global regex)
// =============================================================================

Deno.test('LOCKNESS_VERSION_PATTERN - matches multiple imports in content', () => {
    const content = `
import { App } from "jsr:@lockness/core@^0.1.0"
import { Auth } from "jsr:@lockness/auth@~0.1.0"
import { assert } from "jsr:@std/assert@^1.0.0"
`
    const matches = content.match(LOCKNESS_VERSION_PATTERN)
    assertEquals(matches?.length, 2)
})

Deno.test('LOCKNESS_VERSION_PATTERN - can be used for replacement', () => {
    const content = 'jsr:@lockness/core@^0.1.0'
    const replaced = content.replace(LOCKNESS_VERSION_PATTERN, '$1@$20.2.0$4')
    assertEquals(replaced, 'jsr:@lockness/core@^0.2.0')
})

Deno.test('LOCKNESS_VERSION_PATTERN - replacement preserves a subpath (regression #162)', () => {
    const content = 'import x from "jsr:@lockness/hono@^0.1.0/jsx-runtime"'
    const replaced = content.replace(LOCKNESS_VERSION_PATTERN, '$1@$20.2.0$4')
    assertEquals(
        replaced,
        'import x from "jsr:@lockness/hono@^0.2.0/jsx-runtime"',
    )
})

// =============================================================================
// updateRootJsonc Tests — fixture-based comment-preservation
// =============================================================================

Deno.test(
    'updateRootJsonc - preserves comments and only bumps version + @lockness/* imports',
    async () => {
        const fixtureDir = new URL(
            './fixtures/bump/',
            import.meta.url,
        ).pathname
        const input = await Deno.readTextFile(
            `${fixtureDir}deno.jsonc.input`,
        )
        const expected = await Deno.readTextFile(
            `${fixtureDir}deno.jsonc.expected`,
        )

        const result = updateRootJsonc(input, '9.9.9')

        assertEquals(
            result,
            expected,
            'Output must equal expected fixture byte-for-byte',
        )
    },
)

Deno.test(
    'updateRootJsonc - preserves comments when no imports section exists',
    async () => {
        const fixtureDir = new URL(
            './fixtures/bump/',
            import.meta.url,
        ).pathname
        const input = await Deno.readTextFile(
            `${fixtureDir}deno.jsonc.no-imports.input`,
        )
        const expected = await Deno.readTextFile(
            `${fixtureDir}deno.jsonc.no-imports.expected`,
        )

        const result = updateRootJsonc(input, '9.9.9')

        assertEquals(
            result,
            expected,
            'Output must equal expected fixture byte-for-byte (no imports)',
        )
    },
)

Deno.test('the root version is bumped in lockstep with its members', async () => {
    // The rail's break, and the reason it survived to a release attempt: `deno
    // task bump` routes to `scripts/bump-native.ts`, which delegates to `deno
    // bump-version --workspace`. That command rewrites every workspace MEMBER
    // and every cross-package specifier -- and not the root's own `version`,
    // because the workspace root is not one of its members.
    //
    // `.specnaut/scripts/release/tag.sh` reads exactly that field to name the
    // tag. Left stale, the next release computes the PREVIOUS version and is
    // stopped only by that script's refusal to clobber an existing tag. v0.2.0
    // shipped on the legacy script, which did bump the root, so nothing had
    // ever exercised this path.
    //
    // Asserted as an INVARIANT over the checked-in tree rather than by running
    // the bump: it holds after every correct bump and fails after a bump that
    // moved the members without the root, which is the whole defect.
    const rootText = await Deno.readTextFile('deno.jsonc')
    const root = parseJsonc(rootText) as {
        version: string
        workspace: string[]
    }

    const drifted: string[] = []
    for (const member of root.workspace) {
        const manifest = `${member.replace(/^\.\//, '')}/deno.json`
        let raw: string
        try {
            raw = await Deno.readTextFile(manifest)
        } catch {
            continue
        }
        const pkg = JSON.parse(raw) as { name?: string; version?: string }
        // A member with no `version` is deliberately unpublished (the
        // test-support harness). Silence is the right answer for it here; what
        // this test is about is a member that HAS a version and disagrees.
        if (pkg.version === undefined) continue
        if (pkg.version !== root.version) {
            drifted.push(`${pkg.name ?? manifest} = ${pkg.version}`)
        }
    }

    assertEquals(
        drifted,
        [],
        `deno.jsonc says ${root.version}, but these members disagree. Either ` +
            'a bump moved the members and left the root behind -- which makes ' +
            'tag.sh compute the previous tag -- or one member was bumped ' +
            'alone, which lockstep versioning does not permit.',
    )
})

Deno.test('no workspace member pins a @lockness/* specifier off-version', async () => {
    // The second half of the same defect, and the more dangerous half.
    // `deno bump-version --workspace` skips a member with no `version` -- it
    // has nothing to bump -- and skips that member's IMPORTS with it. Those are
    // version-pinned, so after a bump they name the PREVIOUS version, Deno
    // refuses to satisfy them from the workspace, and resolves them from JSR
    // instead:
    //
    //   Workspace member '@lockness/auth@0.3.0' was not used because it did
    //   not match '@lockness/auth@^0.2.0'
    //
    // That is a WARNING, not an error. `@lockness/testing` is imported by a
    // real test in another package, so the suite compiled that path against
    // the last PUBLISHED release rather than the tree under test -- and went
    // green. A gate that reports 2168 passing while resolving off-tree is
    // worse than a red one.
    const rootText = await Deno.readTextFile('deno.jsonc')
    const root = parseJsonc(rootText) as {
        version: string
        workspace: string[]
    }
    const pattern = /jsr:@lockness\/[^@"]+@[~^]?(\d+\.\d+\.\d+)/g

    const drifted: string[] = []
    for (const member of root.workspace) {
        const manifest = `${member.replace(/^\.\//, '')}/deno.json`
        let text: string
        try {
            text = await Deno.readTextFile(manifest)
        } catch {
            continue
        }
        for (const [spec, version] of text.matchAll(pattern)) {
            if (version !== root.version) {
                drifted.push(`${manifest}: ${spec}`)
            }
        }
    }

    assertEquals(
        drifted,
        [],
        `these specifiers name a version other than the root's ` +
            `${root.version}, so Deno resolves them from JSR instead of the ` +
            'workspace and the tree under test is not the tree being compiled',
    )
})

Deno.test('the committed lockfile records the committed version', async () => {
    // v0.4.0's first publish failed on this. The bump rewrote every manifest
    // but not `deno.lock`, which records each member's `@lockness/*` range, so
    // the release commit carried a lockfile naming 0.3. publish.yml runs the
    // gate before `deno publish`; the gate's first deno command rewrote the
    // lockfile, and `deno publish` aborted on the dirty tree.
    //
    // Read from HEAD, not from disk: every deno command in the gate refreshes
    // the working-tree lockfile before this test runs, so the file on disk is
    // always current and would hide exactly the drift this pins.
    const show = async (path: string): Promise<string> => {
        const { code, stdout, stderr } = await new Deno.Command('git', {
            args: ['show', `HEAD:${path}`],
        }).output()
        if (code !== 0) {
            throw new Error(
                `git show HEAD:${path} failed: ${
                    new TextDecoder().decode(stderr)
                }`,
            )
        }
        return new TextDecoder().decode(stdout)
    }
    const root = parseJsonc(await show('deno.jsonc')) as { version: string }
    const lock = JSON.parse(await show('deno.lock')) as {
        workspace?: {
            dependencies?: string[]
            members?: Record<string, { dependencies?: string[] }>
        }
    }
    const version = semver.parse(root.version)
    const specs = [
        ...(lock.workspace?.dependencies ?? []),
        ...Object.values(lock.workspace?.members ?? {}).flatMap((m) =>
            m.dependencies ?? []
        ),
    ].filter((spec) => spec.startsWith('jsr:@lockness/'))

    const stale = specs.filter((spec) =>
        !semver.satisfies(version, semver.parseRange(locknessRange(spec)))
    )

    assert(specs.length > 0, 'no @lockness/* range in deno.lock')
    assertEquals(
        [...new Set(stale)],
        [],
        `deno.lock at HEAD does not admit ${root.version}; run \`deno install\` ` +
            'and commit the lockfile with the bump',
    )
})

// =============================================================================
// Lockfile refresh — both bump paths (#429)
// =============================================================================

/**
 * The version range a `jsr:@lockness/*` lockfile entry admits.
 *
 * An unversioned entry (`jsr:@lockness/foo`) admits any version. Its last `@`
 * is the scope sigil, so slicing after the last `@` would read `lockness/foo`
 * as the range.
 *
 * @param spec - A `jsr:@lockness/<name>[@<range>]` lockfile entry.
 * @returns The range, or `*` when the entry carries none.
 */
function locknessRange(spec: string): string {
    const match = spec.match(/^jsr:@lockness\/[^@]+(?:@(.+))?$/)
    if (!match) throw new Error(`not a jsr:@lockness/* entry: ${spec}`)
    return match[1] ?? '*'
}

Deno.test('locknessRange - reads the range, and * for an unversioned entry', () => {
    assertEquals(locknessRange('jsr:@lockness/core@0.4'), '0.4')
    assertEquals(locknessRange('jsr:@lockness/core@^0.4.0'), '^0.4.0')
    assertEquals(locknessRange('jsr:@lockness/foo'), '*')
})

Deno.test('refreshLockfile - runs deno install and reports success', async () => {
    const calls: (readonly string[])[] = []
    const code = await refreshLockfile({
        run: (args) => {
            calls.push(args)
            return Promise.resolve(0)
        },
    })
    assertEquals(code, 0)
    assertEquals(calls, [LOCKFILE_REFRESH_ARGS])
    assertEquals(LOCKFILE_REFRESH_ARGS, ['install'])
})

Deno.test('refreshLockfile - a dry run runs nothing', async () => {
    let ran = false
    const code = await refreshLockfile({
        dryRun: true,
        run: () => {
            ran = true
            return Promise.resolve(0)
        },
    })
    assertEquals(code, 0)
    assertEquals(ran, false)
})

Deno.test('refreshLockfile - a failure returns its code and says how to recover', async () => {
    const code = await refreshLockfile({ run: () => Promise.resolve(3) })
    assertEquals(code, 3)
    const message = lockfileRefreshFailure(3)
    assertStringIncludes(message, 'code 3')
    assertStringIncludes(message, 'The version bump IS applied')
    assertStringIncludes(message, 'Do not re-run the bump')
})

/** Absolute path of a repo script, for running it from a fixture directory. */
const scriptPath = (name: string): string =>
    new URL(`../scripts/${name}`, import.meta.url).pathname

/** Absolute path of the repo's root config, so script imports resolve. */
const REPO_CONFIG = new URL('../deno.jsonc', import.meta.url).pathname

/**
 * Run `deno` in `cwd` and capture its output.
 *
 * @param args - Arguments passed to the `deno` executable.
 * @param cwd - The working directory.
 * @returns The exit code and the decoded stdout + stderr.
 */
async function deno(
    args: string[],
    cwd: string,
): Promise<{ code: number; output: string }> {
    const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
        args,
        cwd,
        env: { NO_COLOR: '1' },
    }).output()
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
    return { code, output: decode(stdout) + decode(stderr) }
}

/**
 * Build a two-member workspace at 0.1.0 where `@lockness/b` pins
 * `@lockness/a@^0.1.0`, and let `deno install` write its lockfile.
 *
 * The `@std/semver` import exists only so deno writes a lockfile at all: it
 * writes none for a graph with no remote package.
 *
 * @returns The fixture directory.
 */
async function lockfileFixture(): Promise<string> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness-bump-' })
    await Deno.mkdir(`${dir}/packages/a`, { recursive: true })
    await Deno.mkdir(`${dir}/packages/b`, { recursive: true })
    await Deno.writeTextFile(
        `${dir}/deno.jsonc`,
        '{\n    // bump fixture\n    "version": "0.1.0",\n' +
            '    "workspace": ["./packages/a", "./packages/b"]\n}\n',
    )
    const member = (name: string, imports: Record<string, string>) =>
        JSON.stringify(
            { name, version: '0.1.0', exports: './mod.ts', imports },
            null,
            4,
        ) + '\n'
    await Deno.writeTextFile(
        `${dir}/packages/a/deno.json`,
        member('@lockness/a', { '@std/semver': 'jsr:@std/semver@1' }),
    )
    await Deno.writeTextFile(
        `${dir}/packages/a/mod.ts`,
        "export { parse } from '@std/semver'\n",
    )
    await Deno.writeTextFile(
        `${dir}/packages/b/deno.json`,
        member('@lockness/b', { '@lockness/a': 'jsr:@lockness/a@^0.1.0' }),
    )
    await Deno.writeTextFile(
        `${dir}/packages/b/mod.ts`,
        "export { parse } from '@lockness/a'\n",
    )
    const install = await deno(['install'], dir)
    assertEquals(
        install.code,
        0,
        `fixture deno install failed:\n${install.output}`,
    )
    return dir
}

/**
 * The `jsr:@lockness/*` entries of a lockfile, and those that do not admit
 * `version`.
 *
 * @param lockText - The `deno.lock` text.
 * @param version - The version every entry should admit.
 * @returns The entries, and the stale ones among them.
 */
function lockEntries(
    lockText: string,
    version: string,
): { specs: string[]; stale: string[] } {
    const lock = JSON.parse(lockText) as {
        workspace?: {
            dependencies?: string[]
            members?: Record<string, { dependencies?: string[] }>
        }
    }
    const specs = [
        ...(lock.workspace?.dependencies ?? []),
        ...Object.values(lock.workspace?.members ?? {}).flatMap((m) =>
            m.dependencies ?? []
        ),
    ].filter((spec) => spec.startsWith('jsr:@lockness/'))
    const parsed = semver.parse(version)
    const stale = specs.filter((spec) =>
        !semver.satisfies(parsed, semver.parseRange(locknessRange(spec)))
    )
    return { specs, stale }
}

/** One bump path, run the way a maintainer or `tag.sh` runs it. */
interface BumpPath {
    /** The `deno task` name. */
    readonly task: string
    /** The script under `scripts/` the task runs. */
    readonly script: string
    /** The bump arguments. */
    readonly args: string[]
    /** The version the fixture should end at. */
    readonly target: string
}

const BUMP_PATHS: readonly BumpPath[] = [
    // The legacy path is the one that skipped the refresh (#429). The
    // arbitrary jump is why it still exists: 0.1.0 -> 0.5.0 is not one semver
    // step, so `deno task bump` refuses it and points here.
    {
        task: 'bump:legacy',
        script: 'bump.ts',
        args: ['0.5.0'],
        target: '0.5.0',
    },
    {
        task: 'bump',
        script: 'bump-native.ts',
        args: ['--minor'],
        target: '0.2.0',
    },
]

for (const path of BUMP_PATHS) {
    Deno.test(`deno task ${path.task} leaves a deno.lock that admits the new version`, async () => {
        // Every supported bump path must leave a tree `deno publish` accepts.
        // The HEAD-based test above sees a stale lockfile only once the
        // release commit and tag exist; this runs the bump itself.
        const dir = await lockfileFixture()
        try {
            const before = lockEntries(
                await Deno.readTextFile(`${dir}/deno.lock`),
                path.target,
            )
            // The fixture can fail: its fresh lockfile names 0.1.
            assert(before.stale.length > 0, 'fixture lockfile is not stale')

            const run = await deno(
                [
                    'run',
                    '-A',
                    '--config',
                    REPO_CONFIG,
                    scriptPath(path.script),
                    ...path.args,
                ],
                dir,
            )
            assertEquals(run.code, 0, run.output)

            const root = parseJsonc(
                await Deno.readTextFile(`${dir}/deno.jsonc`),
            ) as { version: string }
            assertEquals(root.version, path.target)

            const after = lockEntries(
                await Deno.readTextFile(`${dir}/deno.lock`),
                path.target,
            )
            assert(after.specs.length > 0, 'no @lockness/* range in deno.lock')
            assertEquals(
                after.stale,
                [],
                `deno task ${path.task} left deno.lock naming the previous ` +
                    'version; the release commit could not be published',
            )
            assertStringIncludes(run.output, 'deno.lock refreshed')
        } finally {
            await Deno.remove(dir, { recursive: true })
        }
    })

    Deno.test(`deno task ${path.task} --dry-run writes nothing and names the lockfile refresh`, async () => {
        const dir = await lockfileFixture()
        try {
            const files = [
                'deno.jsonc',
                'deno.lock',
                'packages/a/deno.json',
                'packages/b/deno.json',
            ]
            const read = () =>
                Promise.all(files.map((f) => Deno.readTextFile(`${dir}/${f}`)))
            const before = await read()

            const run = await deno(
                [
                    'run',
                    '-A',
                    '--config',
                    REPO_CONFIG,
                    scriptPath(path.script),
                    ...path.args,
                    '--dry-run',
                ],
                dir,
            )
            assertEquals(run.code, 0, run.output)
            assertEquals(await read(), before, 'a dry run wrote a file')
            assertStringIncludes(run.output, 'deno.lock would be refreshed')
        } finally {
            await Deno.remove(dir, { recursive: true })
        }
    })
}
