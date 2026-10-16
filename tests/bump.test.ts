/**
 * @fileoverview Tests for the version bump script.
 *
 * Tests the helper functions used to update versions across
 * the Lockness monorepo.
 *
 * @module tests/bump_test
 */

import { test } from 'node:test'
import {
    assert,
    assertEquals,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import { parse as parseJsonc } from '@std/jsonc'
import * as semver from '@std/semver'
import {
    bumpPackageManifest,
    getErrorMessage,
    isLocknessImport,
    resolveTargetVersion,
    SEMVER_PATTERN,
    updateImportVersion,
    updateRootJsonc,
    VERSION_EXTRACT_PATTERN,
} from '../scripts/bump.ts'
import { readWorkspaceMembers } from '../scripts/manifests.ts'
import {
    LOCKFILE_REFRESH_ARGS,
    lockfileRefreshFailure,
    refreshLockfile,
} from '../scripts/lockfile.ts'

// =============================================================================
// getErrorMessage Tests
// =============================================================================

test('getErrorMessage - extracts message from Error instance', () => {
    const error = new Error('Something went wrong')
    assertEquals(getErrorMessage(error), 'Something went wrong')
})

test('getErrorMessage - converts string to string', () => {
    assertEquals(getErrorMessage('plain string error'), 'plain string error')
})

test('getErrorMessage - converts number to string', () => {
    assertEquals(getErrorMessage(404), '404')
})

test('getErrorMessage - converts null to string', () => {
    assertEquals(getErrorMessage(null), 'null')
})

test('getErrorMessage - converts undefined to string', () => {
    assertEquals(getErrorMessage(undefined), 'undefined')
})

test('getErrorMessage - converts object to string', () => {
    assertEquals(getErrorMessage({ code: 'ERR' }), '[object Object]')
})

// =============================================================================
// isLocknessImport Tests
// =============================================================================

test('isLocknessImport - returns true for @lockness/ key', () => {
    assertEquals(
        isLocknessImport('@lockness/core', 'jsr:@lockness/core@^0.1.0'),
        true,
    )
})

test('isLocknessImport - returns true for jsr:@lockness/ value', () => {
    assertEquals(
        isLocknessImport('core', 'jsr:@lockness/core@^0.1.0'),
        true,
    )
})

test('isLocknessImport - returns false for non-Lockness import', () => {
    assertEquals(
        isLocknessImport('@std/assert', 'jsr:@std/assert@^1.0.0'),
        false,
    )
})

test('isLocknessImport - returns false for non-string value', () => {
    assertEquals(isLocknessImport('@lockness/core', null), false)
    assertEquals(isLocknessImport('@lockness/core', undefined), false)
    assertEquals(isLocknessImport('@lockness/core', 123), false)
})

test('isLocknessImport - returns false for empty strings', () => {
    assertEquals(isLocknessImport('', ''), false)
})

// =============================================================================
// updateImportVersion Tests
// =============================================================================

test('updateImportVersion - updates caret version', () => {
    const result = updateImportVersion('jsr:@lockness/core@^0.1.0', '0.2.0')
    assertEquals(result, 'jsr:@lockness/core@^0.2.0')
})

test('updateImportVersion - updates tilde version', () => {
    const result = updateImportVersion('jsr:@lockness/auth@~1.0.0', '1.1.0')
    assertEquals(result, 'jsr:@lockness/auth@~1.1.0')
})

test('updateImportVersion - preserves package path', () => {
    const result = updateImportVersion(
        'jsr:@lockness/auth-provider@^0.1.0',
        '0.3.0',
    )
    assertEquals(result, 'jsr:@lockness/auth-provider@^0.3.0')
})

test('updateImportVersion - returns null for non-matching import', () => {
    const result = updateImportVersion('jsr:@std/assert@^1.0.0', '2.0.0')
    assertEquals(result, null)
})

test('updateImportVersion - returns null for invalid format', () => {
    const result = updateImportVersion('@lockness/core', '0.2.0')
    assertEquals(result, null)
})

test('updateImportVersion - handles complex versions', () => {
    const result = updateImportVersion(
        'jsr:@lockness/container@^10.20.30',
        '11.0.0',
    )
    assertEquals(result, 'jsr:@lockness/container@^11.0.0')
})

test('updateImportVersion - preserves a subpath after the version (regression #162)', () => {
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

test('SEMVER_PATTERN - matches valid semver', () => {
    assertEquals(SEMVER_PATTERN.test('0.1.0'), true)
    assertEquals(SEMVER_PATTERN.test('1.0.0'), true)
    assertEquals(SEMVER_PATTERN.test('10.20.30'), true)
})

test('SEMVER_PATTERN - rejects invalid semver', () => {
    assertEquals(SEMVER_PATTERN.test('v0.1.0'), false)
    assertEquals(SEMVER_PATTERN.test('0.1'), false)
    assertEquals(SEMVER_PATTERN.test('0.1.0.0'), false)
    assertEquals(SEMVER_PATTERN.test('abc'), false)
    assertEquals(SEMVER_PATTERN.test(''), false)
})

test('SEMVER_PATTERN - rejects semver with prerelease', () => {
    assertEquals(SEMVER_PATTERN.test('0.1.0-alpha'), false)
    assertEquals(SEMVER_PATTERN.test('1.0.0-beta.1'), false)
})

// =============================================================================
// VERSION_EXTRACT_PATTERN Tests
// =============================================================================

test('VERSION_EXTRACT_PATTERN - extracts version parts', () => {
    const match = 'jsr:@lockness/core@^0.1.0'.match(VERSION_EXTRACT_PATTERN)
    assertEquals(match !== null, true)
    assertEquals(match![1], 'jsr:@lockness/core')
    assertEquals(match![2], '^')
    assertEquals(match![3], '0.1.0')
})

test('VERSION_EXTRACT_PATTERN - extracts tilde prefix', () => {
    const match = 'jsr:@lockness/auth@~1.2.3'.match(VERSION_EXTRACT_PATTERN)
    assertEquals(match !== null, true)
    assertEquals(match![2], '~')
})

test('VERSION_EXTRACT_PATTERN - does not match non-Lockness', () => {
    const match = 'jsr:@std/assert@^1.0.0'.match(VERSION_EXTRACT_PATTERN)
    assertEquals(match, null)
})

// =============================================================================
// bumpPackageManifest / resolveTargetVersion Tests (#591)
// =============================================================================

test('bumpPackageManifest - moves the version and every @lockness/* range', () => {
    const bumped = bumpPackageManifest({
        name: '@lockness/auth',
        version: '0.4.0',
        dependencies: {
            '@lockness/contract': '^0.4.0',
            '@lockness/crypto': '~0.4.0',
            'zod': '^3.25.0',
        },
        peerDependencies: { '@lockness/cache': '^0.4.0' },
        devDependencies: { '@lockness/testing': '0.4.0' },
        lockness: { jsr: { '@std/assert': '1' } },
    }, '0.5.0')
    assertEquals(bumped, {
        name: '@lockness/auth',
        version: '0.5.0',
        dependencies: {
            '@lockness/contract': '^0.5.0',
            '@lockness/crypto': '~0.5.0',
            'zod': '^3.25.0',
        },
        peerDependencies: { '@lockness/cache': '^0.5.0' },
        devDependencies: { '@lockness/testing': '0.5.0' },
        lockness: { jsr: { '@std/assert': '1' } },
    })
})

test('bumpPackageManifest - a member with no version keeps none, its ranges still move', () => {
    // The vite demo: never published, so a bump must not add a version --
    // but a pinned sibling range left behind would resolve from the registry.
    assertEquals(
        bumpPackageManifest({
            private: true,
            dependencies: { '@lockness/core': '^0.4.0', 'vite': '^8' },
        }, '0.5.0'),
        {
            private: true,
            dependencies: { '@lockness/core': '^0.5.0', 'vite': '^8' },
        },
    )
})

test('bumpPackageManifest - does not mutate its input', () => {
    const input = {
        version: '0.4.0',
        dependencies: { '@lockness/a': '^0.4.0' },
    }
    bumpPackageManifest(input, '0.5.0')
    assertEquals(input.dependencies['@lockness/a'], '^0.4.0')
})

test('resolveTargetVersion - flags, keywords and an absolute version', () => {
    assertEquals(resolveTargetVersion({ patch: true }, '0.4.0'), '0.4.1')
    assertEquals(resolveTargetVersion({ minor: true }, '0.4.1'), '0.5.0')
    assertEquals(resolveTargetVersion({ major: true }, '0.4.1'), '1.0.0')
    assertEquals(
        resolveTargetVersion({ positional: 'minor' }, '0.4.0'),
        '0.5.0',
    )
    // Any jump: the bump is no longer limited to one increment.
    assertEquals(
        resolveTargetVersion({ positional: '0.9.0' }, '0.4.0'),
        '0.9.0',
    )
})

test('resolveTargetVersion - refuses nothing to do and a malformed version', () => {
    assertThrows(() => resolveTargetVersion({}, '0.4.0'), Error, 'Usage')
    assertThrows(
        () => resolveTargetVersion({ positional: 'v0.5.0' }, '0.4.0'),
        Error,
        'X.Y.Z',
    )
})

// =============================================================================
// updateRootJsonc Tests — fixture-based comment-preservation
// =============================================================================

test(
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

test(
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

test('the root version is bumped in lockstep with its members', async () => {
    // `.specnaut/scripts/release/tag.sh` reads the root `deno.jsonc` `version`
    // to name the tag. Left stale while the members moved, the next release
    // computes the PREVIOUS version and is stopped only by that script's
    // refusal to clobber an existing tag (#324).
    //
    // Asserted as an INVARIANT over the checked-in tree rather than by running
    // the bump: it holds after every correct bump and fails after a bump that
    // moved the members without the root, which is the whole defect. Each
    // member's package.json is its source manifest (#591), and its generated
    // deno.json must say the same.
    const root = parseJsonc(await Deno.readTextFile('deno.jsonc')) as {
        version: string
    }

    const drifted: string[] = []
    for (const member of await readWorkspaceMembers('.')) {
        for (const file of ['package.json', 'deno.json']) {
            const pkg = JSON.parse(
                await Deno.readTextFile(`${member}/${file}`),
            ) as { name?: string; version?: string }
            // A member with no `version` is an app (the vite demo), never
            // published; what this test is about is one that HAS a version.
            if (pkg.version === undefined) continue
            if (pkg.version !== root.version) {
                drifted.push(`${member}/${file} = ${pkg.version}`)
            }
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

test('no workspace member pins a @lockness/* range off-version', async () => {
    // A member left out of a bump keeps ranges naming the PREVIOUS version.
    // Deno then refuses to satisfy them from the workspace and resolves them
    // from the registry instead -- a WARNING, not an error:
    //
    //   Workspace member '@lockness/auth@0.3.0' was not used because it did
    //   not match '@lockness/auth@^0.2.0'
    //
    // `@lockness/testing` is imported by a real test in another package, so
    // the suite once compiled that path against the last PUBLISHED release
    // rather than the tree under test -- and went green. Both the source
    // ranges (package.json) and the generated pins (deno.json) are read.
    const root = parseJsonc(await Deno.readTextFile('deno.jsonc')) as {
        version: string
    }
    const pattern = /"(?:jsr:)?@lockness\/[^@"]+(?:@|": ")[~^]?(\d+\.\d+\.\d+)/g

    const drifted: string[] = []
    for (const member of await readWorkspaceMembers('.')) {
        for (const file of ['package.json', 'deno.json']) {
            const text = await Deno.readTextFile(`${member}/${file}`)
            for (const [spec, version] of text.matchAll(pattern)) {
                if (version !== root.version) {
                    drifted.push(`${member}/${file}: ${spec}`)
                }
            }
        }
    }

    assertEquals(
        drifted,
        [],
        `these ranges name a version other than the root's ` +
            `${root.version}, so Deno resolves them from the registry instead ` +
            'of the workspace and the tree under test is not the tree compiled',
    )
})

test('the committed lockfile records the committed version', async () => {
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

test('locknessRange - reads the range, and * for an unversioned entry', () => {
    assertEquals(locknessRange('jsr:@lockness/core@0.4'), '0.4')
    assertEquals(locknessRange('jsr:@lockness/core@^0.4.0'), '^0.4.0')
    assertEquals(locknessRange('jsr:@lockness/foo'), '*')
})

test('refreshLockfile - runs deno install and reports success', async () => {
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

test('refreshLockfile - a dry run runs nothing', async () => {
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

test('refreshLockfile - a failure returns its code and says how to recover', async () => {
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
 * Build a two-member workspace at 0.1.0 where `@lockness/b` depends on
 * `@lockness/a@^0.1.0`, generate its deno.json files from package.json, and
 * let `deno install` write its lockfile.
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
    const json = (value: unknown) => JSON.stringify(value, null, 4) + '\n'
    await Deno.writeTextFile(
        `${dir}/deno.jsonc`,
        '{\n    // bump fixture\n    "version": "0.1.0"\n}\n',
    )
    await Deno.writeTextFile(
        `${dir}/package.json`,
        json({ private: true, workspaces: ['packages/a', 'packages/b'] }),
    )
    const member = (name: string, extra: Record<string, unknown>) =>
        json({
            name,
            version: '0.1.0',
            license: 'MIT',
            type: 'module',
            exports: {
                '.': {
                    'lockness-source': './mod.ts',
                    default: './dist/mod.js',
                },
            },
            engines: { deno: '>=2.2' },
            ...extra,
        })
    await Deno.writeTextFile(
        `${dir}/packages/a/package.json`,
        member('@lockness/a', {
            lockness: { jsr: { '@std/semver': '1' }, versionModule: true },
        }),
    )
    await Deno.writeTextFile(
        `${dir}/packages/a/mod.ts`,
        "export { parse } from '@std/semver'\n",
    )
    await Deno.writeTextFile(
        `${dir}/packages/b/package.json`,
        member('@lockness/b', { dependencies: { '@lockness/a': '^0.1.0' } }),
    )
    await Deno.writeTextFile(
        `${dir}/packages/b/mod.ts`,
        "export { parse } from '@lockness/a'\n",
    )
    const generate = await deno(
        ['run', '-A', '--config', REPO_CONFIG, scriptPath('manifests.ts')],
        dir,
    )
    assertEquals(
        generate.code,
        0,
        `fixture manifests failed:\n${generate.output}`,
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

/** One bump, run the way a maintainer or `tag.sh` runs it. */
interface BumpCase {
    /** The bump arguments. */
    readonly args: string[]
    /** The version the fixture should end at. */
    readonly target: string
}

const BUMP_CASES: readonly BumpCase[] = [
    // An arbitrary jump: 0.1.0 -> 0.5.0 is not one semver step. The retired
    // native bump refused it and the legacy script existed only for it.
    { args: ['0.5.0'], target: '0.5.0' },
    { args: ['--minor'], target: '0.2.0' },
]

for (const bump of BUMP_CASES) {
    const name = `deno task bump ${bump.args.join(' ')}`

    test(`${name} moves every manifest and leaves a deno.lock that admits the new version`, async () => {
        // Every bump must leave a tree `deno publish` accepts. The HEAD-based
        // test above sees a stale lockfile only once the release commit and
        // tag exist; this runs the bump itself.
        const dir = await lockfileFixture()
        try {
            const before = lockEntries(
                await Deno.readTextFile(`${dir}/deno.lock`),
                bump.target,
            )
            // The fixture can fail: its fresh lockfile names 0.1.
            assert(before.stale.length > 0, 'fixture lockfile is not stale')

            const run = await deno(
                [
                    'run',
                    '-A',
                    '--config',
                    REPO_CONFIG,
                    scriptPath('bump.ts'),
                    ...bump.args,
                ],
                dir,
            )
            assertEquals(run.code, 0, run.output)

            const root = parseJsonc(
                await Deno.readTextFile(`${dir}/deno.jsonc`),
            ) as { version: string }
            assertEquals(root.version, bump.target)

            const b = JSON.parse(
                await Deno.readTextFile(`${dir}/packages/b/package.json`),
            )
            assertEquals(b.version, bump.target)
            assertEquals(b.dependencies['@lockness/a'], `^${bump.target}`)
            // The generated manifest follows its source.
            const bDeno = JSON.parse(
                await Deno.readTextFile(`${dir}/packages/b/deno.json`),
            )
            assertEquals(bDeno.version, bump.target)
            assertEquals(
                bDeno.imports['@lockness/a'],
                `jsr:@lockness/a@^${bump.target}`,
            )
            // So does the own-version module a package reads at run time.
            assertStringIncludes(
                await Deno.readTextFile(
                    `${dir}/packages/a/version.generated.ts`,
                ),
                `export const VERSION = '${bump.target}'`,
            )

            const after = lockEntries(
                await Deno.readTextFile(`${dir}/deno.lock`),
                bump.target,
            )
            assert(after.specs.length > 0, 'no @lockness/* range in deno.lock')
            assertEquals(
                after.stale,
                [],
                `${name} left deno.lock naming the previous version; the ` +
                    'release commit could not be published',
            )
            assertStringIncludes(run.output, 'deno.lock refreshed')
        } finally {
            await Deno.remove(dir, { recursive: true })
        }
    })

    test(`${name} --dry-run writes nothing and names the lockfile refresh`, async () => {
        const dir = await lockfileFixture()
        try {
            const files = [
                'deno.jsonc',
                'deno.lock',
                'packages/a/package.json',
                'packages/a/deno.json',
                'packages/b/package.json',
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
                    scriptPath('bump.ts'),
                    ...bump.args,
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

test('deno task bump writes nothing when a bumped manifest cannot be generated from', async () => {
    // The plan is computed in memory first. Before, every package.json was
    // written and only then did generation run, so a refused manifest left
    // the tree half-bumped: sources at the new version, deno.json at the old.
    const dir = await lockfileFixture()
    try {
        // b is planned after a, so a's package.json would already be written.
        const bPath = `${dir}/packages/b/package.json`
        const b = JSON.parse(await Deno.readTextFile(bPath))
        b.lockness = { imports: { 'x': '@nope/x' } }
        await Deno.writeTextFile(bPath, JSON.stringify(b, null, 4) + '\n')

        const files = [
            'deno.jsonc',
            'deno.lock',
            'packages/a/package.json',
            'packages/a/deno.json',
            'packages/a/version.generated.ts',
            'packages/b/package.json',
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
                scriptPath('bump.ts'),
                '--minor',
            ],
            dir,
        )
        assertEquals(run.code, 1, run.output)
        assertStringIncludes(run.output, '@nope/x')
        assertStringIncludes(run.output, 'Nothing was written.')
        assertEquals(await read(), before, 'a refused bump wrote a file')
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})
