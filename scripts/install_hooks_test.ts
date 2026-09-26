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

import {
    assert,
    assertEquals,
    assertRejects,
    assertStringIncludes,
} from '@std/assert'
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
 * Create a fresh temp directory and run `setup` inside it, removing the
 * directory if `setup` throws.
 *
 * A prior version of {@link fixture} created its root and only THEN entered a
 * `try`/`finally` in each caller — so a git step failing partway through setup
 * left the root known only to this function, with nothing outside it able to
 * remove it (#397). Owning the cleanup here, around `setup` itself, covers
 * every failure between `makeTempDir` and a successful return.
 *
 * @param prefix - Passed to `Deno.makeTempDir`.
 * @param setup - Runs with the directory's real path.
 * @returns Whatever `setup` returns.
 * @throws Whatever `setup` throws, after removing the directory.
 * @example
 * ```ts
 * const value = await withTempDir('my-fixture-', async (dir) => {
 *     await Deno.writeTextFile(`${dir}/x`, 'y')
 *     return dir
 * })
 * ```
 */
async function withTempDir<T>(
    prefix: string,
    setup: (dir: string) => Promise<T>,
): Promise<T> {
    const dir = await Deno.realPath(await Deno.makeTempDir({ prefix }))
    try {
        return await setup(dir)
    } catch (error) {
        await Deno.remove(dir, { recursive: true })
        throw error
    }
}

/**
 * A fixture repository with one commit and one linked worktree.
 *
 * @returns The temp root, the main checkout, and the linked worktree.
 */
function fixture(): Promise<{ root: string; main: string; worktree: string }> {
    return withTempDir('install-hooks-', async (root) => {
        const main = join(root, 'main')
        const worktree = join(root, 'linked')
        await Deno.mkdir(main)
        await git(main, 'init', '-q')
        await git(main, 'commit', '-q', '--allow-empty', '-m', 'init')
        await git(main, 'worktree', 'add', '-q', '-b', 'side', worktree)
        return { root, main, worktree }
    })
}

Deno.test('withTempDir removes its directory when setup throws', async () => {
    let dir = ''
    await assertRejects(
        () =>
            withTempDir('install-hooks-leak-', (d) => {
                dir = d
                return Promise.reject(new Error('setup failed'))
            }),
        Error,
        'setup failed',
    )
    assert(dir !== '', 'setup never ran')
    const stillThere = await Deno.stat(dir).then(() => true, () => false)
    assertEquals(stillThere, false, 'a failed setup left its temp dir behind')
})

Deno.test('withTempDir keeps its directory on success', async () => {
    let dir = ''
    const result = await withTempDir('install-hooks-ok-', (d) => {
        dir = d
        return Promise.resolve('ok')
    })
    assertEquals(result, 'ok')
    try {
        assert((await Deno.stat(dir)).isDirectory)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
})

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

Deno.test('installing from the main checkout writes the shared hooks', async () => {
    // #397: every other install test drives the installer from a linked
    // worktree; none ran it from the main checkout itself.
    const { root, main } = await fixture()
    try {
        const run = await new Deno.Command(Deno.execPath(), {
            args: [
                'run',
                '-A',
                new URL('./install_hooks.ts', import.meta.url).pathname,
            ],
            cwd: main,
            clearEnv: true,
            env: HERMETIC,
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
        }
    } finally {
        await Deno.remove(root, { recursive: true })
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
        assertStringIncludes(hooks['pre-push'], 'prepush_secret_scan.ts')
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

/**
 * Hooks earlier versions of this installer really wrote, byte for byte,
 * evaluated from the template literals at those commits: `pre-385` from
 * 113737e1..5a5d69e3, `pre-388` from the #385 version up to this change.
 */
const LEGACY_FIXTURES = ['pre-385', 'pre-388'].flatMap((era) =>
    ['pre-commit', 'pre-push'].map((name) => ({ era, name }))
)

/**
 * Read one legacy hook fixture.
 *
 * @param era - `pre-385` or `pre-388`.
 * @param name - The hook name.
 * @returns The hook's exact historic content.
 */
function legacyHook(era: string, name: string): Promise<string> {
    return Deno.readTextFile(
        new URL(
            `../tests/fixtures/install_hooks/${era}.${name}`,
            import.meta.url,
        ),
    )
}

for (const { era, name } of LEGACY_FIXTURES) {
    Deno.test(`the ${era} ${name} this installer wrote is recognised and replaced`, async () => {
        const { root, main } = await fixture()
        try {
            const dir = join(main, '.git', 'hooks')
            const old = await legacyHook(era, name)
            assertEquals(
                old.includes(HOOK_MARKER),
                false,
                'fixture has a marker',
            )
            assert(isLocknessHook(old), `${era} ${name} is not recognised`)
            await Deno.writeTextFile(join(dir, name), old)
            await installHooks(dir)
            assertEquals(await Deno.readTextFile(join(dir, name)), hooks[name])
        } finally {
            await Deno.remove(root, { recursive: true })
        }
    })
}

Deno.test('the current hooks are marked, and a foreign one is not recognised', () => {
    for (const content of Object.values(hooks)) {
        assert(content.includes(HOOK_MARKER))
        assert(isLocknessHook(content))
    }
    assertEquals(isLocknessHook('#!/bin/sh\nnpx husky run\n'), false)
})

/**
 * Assert that installing over an unreadable `pre-push` refuses and writes
 * nothing.
 *
 * @param place - Puts something unreadable at the given hook path.
 */
async function assertRefusesUnreadable(
    place: (hookPath: string) => Promise<void>,
): Promise<void> {
    const { root, main } = await fixture()
    const dir = join(main, '.git', 'hooks')
    const hookPath = join(dir, 'pre-push')
    try {
        await place(hookPath)
        let message = ''
        try {
            await installHooks(dir)
        } catch (error) {
            message = (error as Error).message
        }
        assertStringIncludes(message, 'cannot read the existing hook')
        const wrote = await Deno.stat(join(dir, 'pre-commit'))
            .then(() => true, () => false)
        assertEquals(wrote, false, 'pre-commit was written despite the refusal')
    } finally {
        await Deno.chmod(hookPath, 0o644).catch(() => {})
        await Deno.remove(root, { recursive: true })
    }
}

Deno.test({
    name: 'a writable but unreadable hook is refused, not overwritten',
    // root reads a mode-000 file anyway, so the case cannot be staged there.
    ignore: Deno.uid() === 0,
    fn: async () => {
        let content = ''
        await assertRefusesUnreadable(async (hookPath) => {
            content = '#!/bin/sh\necho "a hook nobody can read"\n'
            await Deno.writeTextFile(hookPath, content)
            await Deno.chmod(hookPath, 0o200) // write-only
        })
        assert(content !== '')
    },
})

Deno.test('a directory where a hook should be is refused', async () => {
    await assertRefusesUnreadable((hookPath) => Deno.mkdir(hookPath))
})
