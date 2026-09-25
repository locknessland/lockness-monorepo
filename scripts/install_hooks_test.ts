/**
 * @fileoverview Tests for `scripts/install_hooks.ts` (#388): the hooks
 * directory is the repository's COMMON dir, so the installer works from a
 * linked worktree — where `.git` is a file — and an inherited `GIT_DIR` cannot
 * redirect it to another repository.
 *
 * Every repository here is a throwaway fixture; nothing touches the checkout
 * the tests run in.
 *
 * @module
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { gitEnvFromCwd } from '@mutations/harness.ts'
import { hooks, resolveHooksDir } from './install_hooks.ts'

/**
 * Run git in `cwd` with no inherited `GIT_*` variables, failing loudly.
 *
 * @param cwd - Working directory.
 * @param args - git arguments.
 */
async function git(cwd: string, ...args: string[]): Promise<void> {
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
        env: gitEnvFromCwd(),
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
}

/**
 * A fixture repository with one commit and one linked worktree.
 *
 * @returns The temp root, the main checkout, and the linked worktree.
 */
async function fixture(): Promise<
    { root: string; main: string; worktree: string }
> {
    const root = await Deno.realPath(
        await Deno.makeTempDir({ prefix: 'install-hooks-' }),
    )
    const main = join(root, 'main')
    const worktree = join(root, 'linked')
    await Deno.mkdir(main)
    await git(main, 'init', '-q')
    await git(main, 'commit', '-q', '--allow-empty', '-m', 'init')
    await git(main, 'worktree', 'add', '-q', '-b', 'side', worktree)
    return { root, main, worktree }
}

Deno.test('the main checkout and a linked worktree share one hooks dir', async () => {
    const { root, main, worktree } = await fixture()
    try {
        const expected = join(main, '.git', 'hooks')
        assertEquals(await Deno.realPath(await resolveHooksDir(main)), expected)
        // In the linked worktree `.git` is a FILE — the old installer refused.
        assert((await Deno.stat(join(worktree, '.git'))).isFile)
        assertEquals(
            await Deno.realPath(await resolveHooksDir(worktree)),
            expected,
        )
    } finally {
        await Deno.remove(root, { recursive: true })
    }
})

Deno.test('outside a repository the resolver throws', async () => {
    const dir = await Deno.makeTempDir({ prefix: 'install-hooks-norepo-' })
    try {
        let threw = false
        try {
            await resolveHooksDir(dir)
        } catch (error) {
            threw = true
            assertStringIncludes(
                (error as Error).message,
                'not a git repository',
            )
        }
        assert(threw, 'resolved a hooks dir outside any repository')
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

Deno.test('installing from a worktree writes the shared hooks, and an inherited GIT_DIR cannot redirect it', async () => {
    const { root, main, worktree } = await fixture()
    // A decoy repository. If the installer honoured an inherited GIT_DIR, the
    // hooks would land here instead of in the fixture's common dir.
    const decoy = join(root, 'decoy')
    await Deno.mkdir(decoy)
    await git(decoy, 'init', '-q')
    try {
        const run = await new Deno.Command(Deno.execPath(), {
            args: [
                'run',
                '-A',
                new URL('./install_hooks.ts', import.meta.url).pathname,
            ],
            cwd: worktree,
            env: { GIT_DIR: join(decoy, '.git') },
            stdout: 'piped',
            stderr: 'piped',
        }).output()
        const out = new TextDecoder().decode(run.stdout) +
            new TextDecoder().decode(run.stderr)
        assertEquals(run.code, 0, out)

        for (const [name, content] of Object.entries(hooks)) {
            const path = join(main, '.git', 'hooks', name)
            assertEquals(await Deno.readTextFile(path), content)
            assert(((await Deno.stat(path)).mode ?? 0) & 0o100, `${name} +x`)
            const leaked = await Deno.stat(join(decoy, '.git', 'hooks', name))
                .then(() => true, () => false)
            assertEquals(leaked, false, `${name} was written to the decoy`)
        }
        assertStringIncludes(hooks['pre-push'], 'deno task gate')
    } finally {
        await Deno.remove(root, { recursive: true })
    }
})
