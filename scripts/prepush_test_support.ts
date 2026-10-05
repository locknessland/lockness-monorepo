/**
 * @fileoverview Test support shared by `scripts/prepush_secret_scan_test.ts`
 * and `scripts/prepush_test.ts`: a hermetic `git`, throwaway directories, and
 * the #431 published-objects fixture.
 *
 * Both suites test the same predicate — `publishesNothingNew(outgoing(update),
 * published())` decides the scan's admission and the gate skip (#433) — so
 * they build their repositories with the same fixture. A fixture forked per
 * suite could drift, and the two consumers would then be tested against two
 * different notions of "already published".
 *
 * Not a test file itself (no `_test.ts` suffix), so `deno test` does not
 * discover it.
 *
 * @module
 */

import { dirname, join } from '@std/path'

/** The all-zero sha git uses for "this ref does not exist (yet/anymore)". */
export const ZERO = '0'.repeat(40)

/**
 * The isolated environment every git (and gitleaks) subprocess in these
 * suites runs with — the test's own helper AND the code under test: `HOME`
 * is the fixture directory, and neither the global nor the system git config
 * is read. Nothing here sees the developer's real `HOME` or `~/.gitconfig`.
 * Repository discovery stops at `home`'s parent (`GIT_CEILING_DIRECTORIES`),
 * so a fixture that is not a repository can never resolve to one that happens
 * to enclose the temp directory.
 *
 * @param home - The fixture directory, used as `HOME`.
 * @returns The environment.
 */
export function isolatedEnv(home: string): Record<string, string> {
    return {
        HOME: home,
        PATH: Deno.env.get('PATH') ?? '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CEILING_DIRECTORIES: dirname(home),
    }
}

/**
 * Run git in `cwd` with a hermetic identity, failing loudly.
 *
 * @param cwd - The repository to run in, also `HOME`.
 * @param args - Arguments to `git`.
 * @returns Trimmed stdout.
 * @throws {Error} When git exits non-zero.
 */
export async function git(cwd: string, ...args: string[]): Promise<string> {
    const run = await new Deno.Command('git', {
        args: [
            '-c',
            'user.name=fixture',
            '-c',
            'user.email=fixture@example.invalid',
            '-c',
            'commit.gpgsign=false',
            ...args,
        ],
        cwd,
        clearEnv: true,
        env: isolatedEnv(cwd),
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

/**
 * Run `run` in a fresh temp directory (its real path), removing the directory
 * afterwards whatever happens.
 *
 * @param prefix - The temp directory's name prefix.
 * @param run - The test body.
 * @returns What `run` returns.
 */
export async function withTempDir<T>(
    prefix: string,
    run: (dir: string) => Promise<T>,
): Promise<T> {
    const dir = await Deno.realPath(await Deno.makeTempDir({ prefix }))
    try {
        return await run(dir)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

/** A monorepo-shaped fixture: two commits on origin/main, set by update-ref. */
export interface PublishedFixture {
    dir: string
    /** The older origin/main commit (packages/a at its first release). */
    m1: string
    /** The current origin/main commit (packages/a changed since m1). */
    m2: string
}

/**
 * Build a repository whose `refs/remotes/origin/main` holds two releases of
 * `packages/a`, the way the monorepo holds every past mirror tree.
 *
 * @param dir - An empty temp directory.
 * @returns The fixture's commits.
 */
export async function publishedFixture(dir: string): Promise<PublishedFixture> {
    await git(dir, 'init', '-q')
    await Deno.mkdir(join(dir, 'packages/a/docs'), { recursive: true })
    await Deno.writeTextFile(join(dir, 'packages/a/mod.ts'), 'export {}\n')
    await Deno.writeTextFile(join(dir, 'packages/a/docs/DOCS.md'), '# a\n')
    await git(dir, 'add', '.')
    await git(dir, 'commit', '-q', '-m', 'release 1')
    const m1 = await git(dir, 'rev-parse', 'HEAD')
    await Deno.writeTextFile(
        join(dir, 'packages/a/mod.ts'),
        'export const a = 2\n',
    )
    await git(dir, 'add', '.')
    await git(dir, 'commit', '-q', '-m', 'release 2')
    const m2 = await git(dir, 'rev-parse', 'HEAD')
    await git(dir, 'update-ref', 'refs/remotes/origin/main', m2)
    return { dir, m1, m2 }
}

/**
 * Cut a mirror-style commit whose tree IS `packages/a` at `source`.
 *
 * @param dir - The fixture repository.
 * @param source - The commit-ish the subtree is read from.
 * @param parent - The previous mirror commit, if any.
 * @returns The new commit's sha.
 */
export async function subtreeCommit(
    dir: string,
    source: string,
    parent?: string,
): Promise<string> {
    const tree = await git(dir, 'rev-parse', `${source}:packages/a`)
    const args = ['commit-tree', tree, '-m', 'Release']
    if (parent) args.push('-p', parent)
    return await git(dir, ...args)
}

/**
 * A commit off `base` that adds one file to `packages/a`, never on
 * origin/main — the source of a subtree holding one unpublished blob.
 *
 * @param dir - The fixture repository.
 * @param base - The commit to branch from.
 * @param write - Writes the new file into the working tree.
 * @returns The side commit's sha.
 */
export async function sideCommit(
    dir: string,
    base: string,
    write: () => Promise<void>,
): Promise<string> {
    await git(dir, 'checkout', '-q', '--detach', base)
    await write()
    await git(dir, 'add', '.')
    await git(dir, 'commit', '-q', '-m', 'unpublished')
    return await git(dir, 'rev-parse', 'HEAD')
}
