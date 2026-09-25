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
import {
    HOOK_MARKER,
    hooks,
    installHooks,
    isLocknessHook,
    resolveHooksDir,
} from './install_hooks.ts'

/**
 * A git environment isolated from the host: no inherited `GIT_*`, and neither
 * the global nor the system config — so a host `core.hooksPath`, signing key
 * or init template cannot change what a fixture does.
 */
const HERMETIC: Record<string, string> = {
    ...gitEnvFromCwd(),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
}

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
        env: HERMETIC,
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
        assertEquals(
            await Deno.realPath(await resolveHooksDir(main, HERMETIC)),
            expected,
        )
        // In the linked worktree `.git` is a FILE — the old installer refused.
        assert((await Deno.stat(join(worktree, '.git'))).isFile)
        assertEquals(
            await Deno.realPath(await resolveHooksDir(worktree, HERMETIC)),
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
            await resolveHooksDir(dir, HERMETIC)
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

Deno.test('a set core.hooksPath is refused: the hooks would never run', async () => {
    const { root, main } = await fixture()
    try {
        await git(main, 'config', 'core.hooksPath', '.githooks')
        let message = ''
        try {
            await resolveHooksDir(main, HERMETIC)
        } catch (error) {
            message = (error as Error).message
        }
        assertStringIncludes(message, 'core.hooksPath is set (.githooks)')
    } finally {
        await Deno.remove(root, { recursive: true })
    }
})

Deno.test('a foreign hook is refused and nothing is written', async () => {
    const { root, main } = await fixture()
    try {
        const dir = join(main, '.git', 'hooks')
        const foreign = '#!/bin/sh\necho "somebody else\'s hook"\n'
        await Deno.writeTextFile(join(dir, 'pre-push'), foreign)
        let message = ''
        try {
            await installHooks(dir)
        } catch (error) {
            message = (error as Error).message
        }
        assertStringIncludes(message, 'refusing to overwrite')
        assertEquals(await Deno.readTextFile(join(dir, 'pre-push')), foreign)
        const wrote = await Deno.stat(join(dir, 'pre-commit'))
            .then(() => true, () => false)
        assertEquals(wrote, false, 'pre-commit was written despite the refusal')
    } finally {
        await Deno.remove(root, { recursive: true })
    }
})

Deno.test('a hook this installer wrote, marked or legacy, is replaced', async () => {
    const { root, main } = await fixture()
    try {
        const dir = join(main, '.git', 'hooks')
        // The pre-#388 pre-push, which carries no marker.
        await Deno.writeTextFile(
            join(dir, 'pre-push'),
            '#!/bin/bash\n# Pre-push: runs `deno task gate`, the quality gate.\nexec deno task gate\n',
        )
        await Deno.writeTextFile(join(dir, 'pre-commit'), hooks['pre-commit'])
        await installHooks(dir)
        assertEquals(
            await Deno.readTextFile(join(dir, 'pre-push')),
            hooks['pre-push'],
        )
        for (const content of Object.values(hooks)) {
            assert(content.includes(HOOK_MARKER))
            assert(isLocknessHook(content))
        }
        assertEquals(isLocknessHook('#!/bin/sh\nnpx husky run\n'), false)
    } finally {
        await Deno.remove(root, { recursive: true })
    }
})
