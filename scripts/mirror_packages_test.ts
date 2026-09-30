/**
 * @fileoverview Tests for `scripts/mirror_packages.ts` (#431): local bare
 * repositories stand in for the monorepo's `origin` and for every package
 * mirror, and a fake `gh` answers `repo view` and `run list`. Nothing here
 * touches the network or the real repository: every git call runs with a
 * hermetic environment (no global/system config, `GIT_DIR` and friends
 * stripped) inside a temp directory.
 *
 * Each mirror carries a `post-receive` hook that appends every push it
 * receives to a log, so "one atomic push" and "no push" are asserted on
 * what the mirror actually received.
 *
 * @module
 */

import { assert, assertEquals, assertNotEquals } from '@std/assert'
import { join } from '@std/path'
import {
    type CommandOutput,
    type GhRunner,
    mirrorPackages,
    type MirrorRun,
} from './mirror_packages.ts'

/** The environment every git call in these tests runs with. */
function hermeticEnv(home: string): Record<string, string> {
    return {
        HOME: home,
        PATH: Deno.env.get('PATH') ?? '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    }
}

/** Run git in `cwd` hermetically, failing loudly. */
async function git(
    home: string,
    cwd: string,
    ...args: string[]
): Promise<string> {
    const run = await new Deno.Command('git', {
        args: [
            '-c',
            'commit.gpgsign=false',
            '-c',
            'tag.gpgsign=false',
            ...args,
        ],
        cwd,
        clearEnv: true,
        env: hermeticEnv(home),
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    if (!run.success) {
        throw new Error(
            `git ${args.join(' ')} failed: ${
                new TextDecoder().decode(run.stderr)
            }`,
        )
    }
    return new TextDecoder().decode(run.stdout).trim()
}

/** A monorepo clone, its `origin`, and two package mirrors. */
interface Fixture {
    /** The temp root; also `HOME` for every git call. */
    base: string
    /** The bare repository standing in for the monorepo's GitHub remote. */
    origin: string
    /** The working clone the mirror script runs from. */
    mono: string
    /** The directory holding `<name>.git` bare mirrors (the base URL). */
    mirrors: string
    /** Where the mirrors' `post-receive` hooks append each push. */
    pushLog: string
    /** Head shas the fake `gh` reports as green `Secret scan` push runs. */
    greenHeads: string[]
    /** Further green runs `run list` reports, with their own event/branch. */
    extraRuns: {
        headSha: string
        event: string
        headBranch: string
        conclusion: string
    }[]
    /** When set, `repo view` fails with this stderr (not a not-found). */
    viewFailure: string | null
    /** When set, `repo edit` fails with this stderr. */
    editFailure: string | null
    /** Every `gh` invocation the script made. */
    ghCalls: string[][]
    /** The fake `gh`. */
    gh: GhRunner
    /** Run git hermetically in a fixture directory. */
    git: (cwd: string, ...args: string[]) => Promise<string>
}

/** The package directories every fixture monorepo holds. */
const PACKAGES = ['mail', 'realtime']

/**
 * Commit a release: set the workspace version, write the given package
 * files, commit, tag `v<version>` (annotated, as `/ship` does), and push the
 * branch and the tag to `origin`.
 *
 * @param f - The fixture.
 * @param cwd - The clone to release from.
 * @param version - The version to cut.
 * @param files - Package files to write, relative to `packages/`.
 * @returns The release commit's sha.
 */
async function release(
    f: Fixture,
    cwd: string,
    version: string,
    files: Record<string, string>,
): Promise<string> {
    await Deno.writeTextFile(
        join(cwd, 'deno.jsonc'),
        JSON.stringify({ version }, null, 4) + '\n',
    )
    for (const [path, content] of Object.entries(files)) {
        const full = join(cwd, 'packages', path)
        await Deno.mkdir(join(full, '..'), { recursive: true })
        await Deno.writeTextFile(full, content)
    }
    await f.git(cwd, 'add', '.')
    await f.git(cwd, 'commit', '-q', '-m', `chore(release): v${version}`)
    const sha = await f.git(cwd, 'rev-parse', 'HEAD')
    await f.git(cwd, 'tag', '-a', `v${version}`, '-m', `v${version}`)
    await f.git(cwd, 'push', '-q', 'origin', 'main', `refs/tags/v${version}`)
    return sha
}

/**
 * Build the fixture: an origin with one pre-release commit and a `v1.0.0`
 * release, a clone of it, two empty mirrors that log every push, and a fake
 * `gh` reporting a green scan on the release commit.
 *
 * @param base - An empty temp directory.
 * @returns The fixture.
 */
async function fixture(base: string): Promise<Fixture> {
    const origin = join(base, 'origin.git')
    const mono = join(base, 'mono')
    const mirrors = join(base, 'mirrors')
    const pushLog = join(base, 'push.log')
    const run = (cwd: string, ...args: string[]) => git(base, cwd, ...args)

    await run(base, 'init', '-q', '--bare', '-b', 'main', origin)
    await run(base, 'init', '-q', '-b', 'main', mono)
    await run(mono, 'remote', 'add', 'origin', origin)
    await Deno.writeTextFile(join(mono, 'README.md'), '# mono\n')
    await run(mono, 'add', '.')
    await run(mono, 'commit', '-q', '-m', 'init')
    await run(mono, 'push', '-q', 'origin', 'main')

    await Deno.mkdir(mirrors)
    for (const name of PACKAGES) {
        const bare = join(mirrors, `${name}.git`)
        await run(base, 'init', '-q', '--bare', '-b', 'main', bare)
        const hook = join(bare, 'hooks', 'post-receive')
        await Deno.writeTextFile(
            hook,
            `#!/bin/sh\n{ echo "PUSH ${name}"; cat; } >> ${
                JSON.stringify(pushLog)
            }\n`,
        )
        await Deno.chmod(hook, 0o755)
    }

    const f: Fixture = {
        base,
        origin,
        mono,
        mirrors,
        pushLog,
        greenHeads: [],
        extraRuns: [],
        viewFailure: null,
        editFailure: null,
        ghCalls: [],
        gh: (args) => fakeGh(f, args),
        git: run,
    }
    const released = await release(f, mono, '1.0.0', {
        'mail/mod.ts': 'export const mail = 1\n',
        'mail/docs/DOCS.md': '# mail\n',
        'realtime/mod.ts': 'export const realtime = 1\n',
    })
    f.greenHeads.push(released)
    return f
}

/**
 * The fake `gh`: `repo view` succeeds when the mirror's bare repository
 * exists and answers gh's real not-found message otherwise, `run list`
 * reports {@link Fixture.greenHeads} as push runs on main followed by
 * {@link Fixture.extraRuns}, `repo edit` succeeds, anything else fails.
 * {@link Fixture.viewFailure} and {@link Fixture.editFailure} inject errors.
 *
 * @param f - The fixture.
 * @param args - The `gh` arguments.
 * @returns The fake command's output.
 */
async function fakeGh(f: Fixture, args: string[]): Promise<CommandOutput> {
    f.ghCalls.push(args)
    const ok = (stdout = ''): CommandOutput => ({
        ok: true,
        stdout,
        stderr: '',
    })
    if (args[0] === 'repo' && args[1] === 'view') {
        if (f.viewFailure !== null) {
            return { ok: false, stdout: '', stderr: f.viewFailure }
        }
        const name = args[2].split('/')[1]
        const exists = await Deno.stat(join(f.mirrors, `${name}.git`)).then(
            () => true,
            () => false,
        )
        return exists ? ok(JSON.stringify({ name })) : {
            ok: false,
            stdout: '',
            stderr: `GraphQL: Could not resolve to a Repository with ` +
                `the name '${args[2]}'. (repository)`,
        }
    }
    if (args[0] === 'run' && args[1] === 'list') {
        assert(args.includes('Secret scan'), `unexpected run list: ${args}`)
        assert(args.includes('main'), `run list not scoped to main: ${args}`)
        const status = args.indexOf('--status')
        assert(
            status >= 0 && args[status + 1] === 'success',
            `run list not scoped to green: ${args}`,
        )
        const event = args.indexOf('--event')
        assert(
            event >= 0 && args[event + 1] === 'push',
            `run list not scoped to push events: ${args}`,
        )
        return ok(JSON.stringify([
            ...f.greenHeads.map((headSha) => ({
                headSha,
                event: 'push',
                headBranch: 'main',
                conclusion: 'success',
            })),
            ...f.extraRuns,
        ]))
    }
    if (args[0] === 'repo' && args[1] === 'edit') {
        return f.editFailure === null
            ? ok()
            : { ok: false, stdout: '', stderr: f.editFailure }
    }
    return { ok: false, stdout: '', stderr: `fake gh: ${args.join(' ')}` }
}

/**
 * Run the mirror script against the fixture.
 *
 * @param f - The fixture.
 * @param root - The clone to run from. Defaults to the fixture's.
 * @param flags - Extra options (`dryRun`).
 * @returns The run's outcome and its log.
 */
function mirror(
    f: Fixture,
    root: string = f.mono,
    flags: { dryRun?: boolean } = {},
): Promise<MirrorRun> {
    return mirrorPackages({
        root,
        mirrorBaseUrl: f.mirrors,
        gh: f.gh,
        gitEnv: hermeticEnv(f.base),
        log: () => {},
        ...flags,
    })
}

/**
 * The pushes the mirrors received, in order: one entry per `git push`, each
 * listing the refs it updated.
 *
 * @param f - The fixture.
 * @returns `{ mirror, refs }` per push.
 */
async function pushes(
    f: Fixture,
): Promise<{ mirror: string; refs: string[] }[]> {
    const text = await Deno.readTextFile(f.pushLog).catch(() => '')
    const out: { mirror: string; refs: string[] }[] = []
    for (const line of text.split('\n').filter((l) => l.length > 0)) {
        if (line.startsWith('PUSH ')) {
            out.push({ mirror: line.slice(5), refs: [] })
        } else {
            out.at(-1)?.refs.push(line.split(' ')[2])
        }
    }
    return out
}

/** Forget every push logged so far. */
async function clearPushes(f: Fixture): Promise<void> {
    await Deno.remove(f.pushLog).catch(() => {})
}

/** Read a ref from a mirror, or `null` when it does not exist. */
async function mirrorRef(
    f: Fixture,
    name: string,
    ref: string,
): Promise<string | null> {
    return await f.git(
        f.base,
        '--git-dir',
        join(f.mirrors, `${name}.git`),
        'rev-parse',
        '--verify',
        '--quiet',
        ref,
    ).catch(() => null)
}

async function withFixture(
    run: (f: Fixture) => Promise<void>,
): Promise<void> {
    const base = await Deno.realPath(
        await Deno.makeTempDir({ prefix: 'mirror-test-' }),
    )
    try {
        await run(await fixture(base))
    } finally {
        await Deno.remove(base, { recursive: true })
    }
}

Deno.test('mirror: the tree comes from the release tag even when HEAD has moved', async () => {
    await withFixture(async (f) => {
        await Deno.writeTextFile(
            join(f.mono, 'packages/realtime/mod.ts'),
            'export const realtime = "unreleased"\n',
        )
        await f.git(f.mono, 'commit', '-q', '-am', 'feat: after the release')

        const result = await mirror(f)
        assertEquals(result.ok, true, result.lines.join('\n'))

        const mirrored = await mirrorRef(f, 'realtime', 'main^{tree}')
        const tagged = await f.git(
            f.mono,
            'rev-parse',
            'v1.0.0^{commit}:packages/realtime',
        )
        const head = await f.git(f.mono, 'rev-parse', 'HEAD:packages/realtime')
        assertEquals(mirrored, tagged)
        assertNotEquals(mirrored, head)
        assertEquals(
            await mirrorRef(f, 'realtime', 'refs/tags/v1.0.0'),
            await mirrorRef(f, 'realtime', 'main'),
        )
        const subject = await f.git(
            f.base,
            '--git-dir',
            join(f.mirrors, 'realtime.git'),
            'log',
            '-1',
            '--format=%s',
            'main',
        )
        assertEquals(subject, 'Release v1.0.0')
    })
})

/**
 * Assert a run refused before touching any mirror.
 *
 * @param f - The fixture.
 * @param result - The run.
 * @param reason - A fragment the refusal must name.
 */
async function assertRefused(
    f: Fixture,
    result: MirrorRun,
    reason: string,
): Promise<void> {
    assertEquals(result.ok, false, result.lines.join('\n'))
    assert(
        result.lines.some((l) => l.includes(reason)),
        `expected "${reason}" in:\n${result.lines.join('\n')}`,
    )
    assertEquals(await pushes(f), [], 'a mirror was pushed despite refusal')
}

Deno.test('mirror: refuses when the release tag is missing locally', async () => {
    await withFixture(async (f) => {
        await f.git(f.mono, 'tag', '-d', 'v1.0.0')
        await assertRefused(f, await mirror(f), 'does not exist locally')
    })
})

Deno.test('mirror: refuses when the local tag differs from origin', async () => {
    await withFixture(async (f) => {
        await f.git(f.mono, 'commit', '-q', '--allow-empty', '-m', 'later')
        await f.git(f.mono, 'tag', '-f', '-a', 'v1.0.0', '-m', 'moved')
        await assertRefused(f, await mirror(f), 'differs from origin')
    })
})

Deno.test('mirror: refuses when origin has no such tag', async () => {
    await withFixture(async (f) => {
        await f.git(f.mono, 'push', '-q', 'origin', ':refs/tags/v1.0.0')
        await assertRefused(f, await mirror(f), 'is not on origin')
    })
})

Deno.test('mirror: refuses a tag that is not on origin/main', async () => {
    await withFixture(async (f) => {
        // A release commit on a side branch, tagged and pushed as a tag only.
        await f.git(f.mono, 'checkout', '-q', '-b', 'side')
        await f.git(f.mono, 'commit', '-q', '--allow-empty', '-m', 'side')
        await f.git(f.mono, 'tag', '-f', '-a', 'v1.0.0', '-m', 'side')
        await f.git(
            f.mono,
            'push',
            '-q',
            '--force',
            'origin',
            'refs/tags/v1.0.0',
        )
        f.greenHeads.push(await f.git(f.mono, 'rev-parse', 'HEAD'))
        await assertRefused(
            f,
            await mirror(f),
            'not an ancestor of origin/main',
        )
    })
})

Deno.test('mirror: refuses without a green Secret scan run on main', async () => {
    await withFixture(async (f) => {
        f.greenHeads.length = 0
        await assertRefused(f, await mirror(f), 'no green Secret scan run')
    })
})

Deno.test('mirror: refuses when every green scan predates the tag', async () => {
    await withFixture(async (f) => {
        f.greenHeads.length = 0
        f.greenHeads.push(await f.git(f.mono, 'rev-parse', 'v1.0.0^{commit}~1'))
        await assertRefused(f, await mirror(f), 'no green Secret scan run')
    })
})

Deno.test('mirror: refuses a green scan whose head contains the tag but is not on origin/main', async () => {
    await withFixture(async (f) => {
        // A descendant of the tag that never reached origin/main — what a
        // run on a fork's pull request from a branch named main would scan.
        await f.git(f.mono, 'commit', '-q', '--allow-empty', '-m', 'unmerged')
        f.greenHeads.length = 0
        f.greenHeads.push(await f.git(f.mono, 'rev-parse', 'HEAD'))
        await assertRefused(f, await mirror(f), 'no green Secret scan run')
    })
})

Deno.test('mirror: refuses when the only green scan on the tag is not a push event', async () => {
    await withFixture(async (f) => {
        const [tagCommit] = f.greenHeads
        f.greenHeads.length = 0
        f.extraRuns.push({
            headSha: tagCommit,
            event: 'pull_request',
            headBranch: 'main',
            conclusion: 'success',
        })
        await assertRefused(f, await mirror(f), 'no green Secret scan run')
    })
})

Deno.test('mirror: refuses when the only scan on the tag did not succeed', async () => {
    // `--status success` is asked of gh, but a run that did not succeed must
    // not become provenance if that flag is ever dropped or ignored.
    await withFixture(async (f) => {
        const [tagCommit] = f.greenHeads
        f.greenHeads.length = 0
        f.extraRuns.push({
            headSha: tagCommit,
            event: 'push',
            headBranch: 'main',
            conclusion: 'failure',
        })
        await assertRefused(f, await mirror(f), 'no green Secret scan run')
    })
})

Deno.test('mirror: a green scan on a later origin/main commit admits the tag', async () => {
    await withFixture(async (f) => {
        await f.git(f.mono, 'commit', '-q', '--allow-empty', '-m', 'later')
        await f.git(f.mono, 'push', '-q', 'origin', 'main')
        f.greenHeads.length = 0
        f.greenHeads.push(await f.git(f.mono, 'rev-parse', 'HEAD'))
        const result = await mirror(f)
        assertEquals(result.ok, true, result.lines.join('\n'))
    })
})

Deno.test('mirror: a gh repo view failure that is not "not found" fails closed', async () => {
    await withFixture(async (f) => {
        f.viewFailure = 'HTTP 502: Bad Gateway (https://api.github.com/graphql)'
        const result = await mirror(f)
        await assertRefused(f, result, 'could not tell whether')
        assert(
            result.lines.some((l) => l.includes('HTTP 502')),
            result.lines.join('\n'),
        )
        assertEquals(
            f.ghCalls.filter((c) => c[0] === 'repo' && c[1] !== 'view'),
            [],
            'a repository was created or edited',
        )
    })
})

Deno.test('mirror: a missing repository is reported, not created, without --create', async () => {
    await withFixture(async (f) => {
        await Deno.remove(join(f.mirrors, 'mail.git'), { recursive: true })
        const result = await mirror(f)
        assertEquals(result.ok, true, result.lines.join('\n'))
        assert(
            result.lines.some((l) =>
                l.includes('mail') && l.includes('no repository')
            ),
            result.lines.join('\n'),
        )
        assert((await mirrorRef(f, 'realtime', 'refs/tags/v1.0.0')) !== null)
    })
})

Deno.test('mirror: a failed description update is reported as a failure', async () => {
    await withFixture(async (f) => {
        f.editFailure = 'HTTP 403: Resource not accessible by integration'
        const result = await mirror(f)
        assertEquals(result.ok, false, result.lines.join('\n'))
        assert(
            result.lines.some((l) =>
                l.includes('realtime') &&
                l.includes('description update failed')
            ),
            result.lines.join('\n'),
        )
        assert(
            result.lines.some((l) => l.includes('HTTP 403')),
            result.lines.join('\n'),
        )
        // The push itself landed; only the description is behind.
        assert((await mirrorRef(f, 'realtime', 'refs/tags/v1.0.0')) !== null)
    })
})

Deno.test('mirror: a re-run with every mirror synced pushes nothing', async () => {
    await withFixture(async (f) => {
        assertEquals((await mirror(f)).ok, true)
        const heads = await Promise.all(
            PACKAGES.map((p) => mirrorRef(f, p, 'main')),
        )
        await clearPushes(f)

        const again = await mirror(f)
        assertEquals(again.ok, true, again.lines.join('\n'))
        assertEquals(await pushes(f), [])
        for (const name of PACKAGES) {
            assert(
                again.lines.some((l) =>
                    l.includes(name) && l.includes('already at v1.0.0')
                ),
                again.lines.join('\n'),
            )
        }
        assertEquals(
            await Promise.all(PACKAGES.map((p) => mirrorRef(f, p, 'main'))),
            heads,
        )
    })
})

Deno.test('mirror: a mirror missing only its tag gets a tag-only push (mail case)', async () => {
    await withFixture(async (f) => {
        assertEquals((await mirror(f)).ok, true)
        const mailHead = await mirrorRef(f, 'mail', 'main')
        await f.git(
            f.base,
            '--git-dir',
            join(f.mirrors, 'mail.git'),
            'update-ref',
            '-d',
            'refs/tags/v1.0.0',
        )
        await clearPushes(f)

        const again = await mirror(f)
        assertEquals(again.ok, true, again.lines.join('\n'))
        assertEquals(await pushes(f), [
            { mirror: 'mail', refs: ['refs/tags/v1.0.0'] },
        ])
        assertEquals(await mirrorRef(f, 'mail', 'main'), mailHead)
        assertEquals(await mirrorRef(f, 'mail', 'refs/tags/v1.0.0'), mailHead)
    })
})

Deno.test('mirror: a changed package gets one atomic branch + tag push (realtime case), from a clone that never held the mirror history', async () => {
    await withFixture(async (f) => {
        assertEquals((await mirror(f)).ok, true)
        const previous = await mirrorRef(f, 'realtime', 'main')
        const mailHead = await mirrorRef(f, 'mail', 'main')

        // A fresh clone: no refs/mirrors/*, none of the mirrors' objects.
        const fresh = join(f.base, 'fresh')
        await f.git(f.base, 'clone', '-q', f.origin, fresh)
        f.greenHeads.push(
            await release(f, fresh, '1.1.0', {
                'realtime/mod.ts': 'export const realtime = 2\n',
            }),
        )
        await clearPushes(f)

        const result = await mirror(f, fresh)
        assertEquals(result.ok, true, result.lines.join('\n'))
        assertEquals(await pushes(f), [
            { mirror: 'mail', refs: ['refs/tags/v1.1.0'] },
            {
                mirror: 'realtime',
                refs: ['refs/heads/main', 'refs/tags/v1.1.0'],
            },
        ])
        assertEquals(
            await mirrorRef(f, 'realtime', 'main^'),
            previous,
            'the release commit is not parented on the previous mirror head',
        )
        assertEquals(
            await mirrorRef(f, 'realtime', 'main^{tree}'),
            await f.git(
                fresh,
                'rev-parse',
                'v1.1.0^{commit}:packages/realtime',
            ),
        )
        assertEquals(await mirrorRef(f, 'mail', 'main'), mailHead)
        assertEquals(await mirrorRef(f, 'mail', 'refs/tags/v1.1.0'), mailHead)
    })
})

Deno.test('mirror: a rejected tag keeps its branch from landing (--atomic), and its stderr is surfaced', async () => {
    await withFixture(async (f) => {
        // A per-ref `update` hook: it refuses the tag and accepts the branch.
        // Without --atomic, receive-pack would apply refs/heads/main and
        // reject only the tag; a pre-receive hook could not tell the two
        // apart, because it refuses the whole push either way.
        const hook = join(f.mirrors, 'realtime.git', 'hooks', 'update')
        await Deno.writeTextFile(
            hook,
            '#!/bin/sh\n' +
                'case "$1" in\n' +
                '  refs/tags/*) echo "fixture refuses tags" >&2; exit 1 ;;\n' +
                'esac\n' +
                'exit 0\n',
        )
        await Deno.chmod(hook, 0o755)

        const result = await mirror(f)
        assertEquals(result.ok, false, result.lines.join('\n'))
        assert(
            result.lines.some((l) => l.includes('fixture refuses tags')),
            result.lines.join('\n'),
        )
        // --atomic: the branch the hook accepted did not land without its tag.
        assertEquals(
            await mirrorRef(f, 'realtime', 'refs/heads/main'),
            null,
            'refs/heads/main landed without its tag',
        )
        assertEquals(await mirrorRef(f, 'realtime', 'refs/tags/v1.0.0'), null)
        assertEquals(
            (await pushes(f)).filter((p) => p.mirror === 'realtime'),
            [],
        )
        // The other mirror is unaffected.
        assert((await mirrorRef(f, 'mail', 'refs/tags/v1.0.0')) !== null)
    })
})

/**
 * A snapshot of a repository's refs and config, to prove nothing wrote to it.
 *
 * @param f - The fixture (for its hermetic git).
 * @param dir - The repository's work tree.
 * @returns Every ref with its sha, then the local config.
 */
async function repoState(f: Fixture, dir: string): Promise<string> {
    return [
        await f.git(dir, 'for-each-ref'),
        await Deno.readTextFile(join(dir, '.git', 'config')),
    ].join('\n---\n')
}

Deno.test('mirror: an inherited GIT_DIR cannot redirect git at another repository', async () => {
    await withFixture(async (f) => {
        // A decoy repository with no origin and no packages/. If GIT_DIR
        // reached a child git, the fetch, the tag lookup and every
        // refs/mirrors/* write would target it instead of the clone.
        const decoy = join(f.base, 'decoy')
        await f.git(f.base, 'init', '-q', '-b', 'main', decoy)
        await f.git(decoy, 'commit', '-q', '--allow-empty', '-m', 'decoy')
        const before = await repoState(f, decoy)

        const result = await mirrorPackages({
            root: f.mono,
            mirrorBaseUrl: f.mirrors,
            gh: f.gh,
            gitEnv: { ...hermeticEnv(f.base), GIT_DIR: join(decoy, '.git') },
            log: () => {},
        })
        assertEquals(result.ok, true, result.lines.join('\n'))
        assert((await mirrorRef(f, 'realtime', 'refs/tags/v1.0.0')) !== null)
        assertEquals(await repoState(f, decoy), before, 'the decoy was written')
    })
})

Deno.test('mirror: --dry-run reports the plan and pushes nothing', async () => {
    await withFixture(async (f) => {
        const result = await mirror(f, f.mono, { dryRun: true })
        assertEquals(result.ok, true, result.lines.join('\n'))
        assertEquals(await pushes(f), [])
        assert(
            result.lines.some((l) =>
                l.includes('realtime') && l.includes('branch + tag')
            ),
            result.lines.join('\n'),
        )
    })
})

Deno.test('mirror: the real repository was never touched', async () => {
    // Every call above ran with GIT_DIR & co. stripped and cwd in a temp dir.
    const bare = await new Deno.Command('git', {
        args: ['config', '--get', 'core.bare'],
        cwd: new URL('..', import.meta.url).pathname,
        stdout: 'piped',
        stderr: 'null',
    }).output()
    const value = new TextDecoder().decode(bare.stdout).trim()
    assert(value === '' || value === 'false', `core.bare is ${value}`)
})
