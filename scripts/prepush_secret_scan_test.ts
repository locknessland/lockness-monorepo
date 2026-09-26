/**
 * @fileoverview Tests for `scripts/prepush_secret_scan.ts`: stdin parsing,
 * range resolution against real (throwaway) git fixture repos, and the
 * fail-closed checks mirrored from `secret-scan.yml`, exercised against a
 * fake `gitleaks` binary (a small shell script) so nothing here depends on
 * the network or a real download.
 *
 * @module
 */

import { assert, assertEquals } from '@std/assert'
import { join } from '@std/path'
import {
    commitCount,
    createScanWorktree,
    isDelete,
    parseRefUpdates,
    readIgnoreAtBase,
    type RefUpdate,
    removeScanWorktree,
    resolveBase,
    resolveRange,
    runPrepushScan,
    scanRange,
    writeBaseIgnoreFile,
} from './prepush_secret_scan.ts'

const ZERO = '0'.repeat(40)

/** Run git in `cwd` with a hermetic identity, failing loudly. */
async function git(cwd: string, ...args: string[]): Promise<string> {
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
        env: {
            HOME: cwd,
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_CONFIG_NOSYSTEM: '1',
        },
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

async function withTempDir<T>(
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

Deno.test('parseRefUpdates reads the four-field stdin lines', () => {
    const updates = parseRefUpdates(
        `refs/heads/x abc123 refs/heads/x def456\n` +
            `refs/heads/y ${ZERO} refs/heads/y ${ZERO}\n\n`,
    )
    assertEquals(updates.length, 2)
    assertEquals(updates[0], {
        localRef: 'refs/heads/x',
        localSha: 'abc123',
        remoteRef: 'refs/heads/x',
        remoteSha: 'def456',
    })
})

Deno.test('parseRefUpdates rejects a malformed line', () => {
    let threw = false
    try {
        parseRefUpdates('refs/heads/x abc123\n')
    } catch (error) {
        threw = true
        assert((error as Error).message.includes('malformed pre-push ref line'))
    }
    assert(threw, 'accepted a malformed line')
})

Deno.test('isDelete is true only for an all-zero local sha', () => {
    const base: RefUpdate = {
        localRef: 'refs/heads/x',
        localSha: 'abc',
        remoteRef: 'refs/heads/x',
        remoteSha: 'def',
    }
    assertEquals(isDelete(base), false)
    assertEquals(isDelete({ ...base, localSha: ZERO }), true)
})

Deno.test('resolveRange uses remote..local when the remote ref exists', async () => {
    const range = await resolveRange(
        {
            localRef: 'refs/heads/x',
            localSha: 'abc',
            remoteRef: 'refs/heads/x',
            remoteSha: 'def',
        },
        '.',
    )
    assertEquals(range, 'def..abc')
})

Deno.test('resolveRange falls back to full history with no merge-base', async () => {
    await withTempDir('prepush-range-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')
        const local = await git(dir, 'rev-parse', 'HEAD')
        // No 'origin' remote at all, so `merge-base origin/main` fails outright.
        const range = await resolveRange(
            {
                localRef: 'refs/heads/new',
                localSha: local,
                remoteRef: 'refs/heads/new',
                remoteSha: ZERO,
            },
            dir,
        )
        assertEquals(range, local)
    })
})

Deno.test('resolveRange scans against origin/main when it shares history', async () => {
    await withTempDir('prepush-range-origin-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')
        const mainSha = await git(dir, 'rev-parse', 'HEAD')
        await git(dir, 'update-ref', 'refs/remotes/origin/main', mainSha)
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'feature')
        const local = await git(dir, 'rev-parse', 'HEAD')
        const range = await resolveRange(
            {
                localRef: 'refs/heads/new',
                localSha: local,
                remoteRef: 'refs/heads/new',
                remoteSha: ZERO,
            },
            dir,
        )
        assertEquals(range, `origin/main..${local}`)
    })
})

Deno.test('commitCount matches git rev-list --count', async () => {
    await withTempDir('prepush-count-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'one')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'two')
        const head = await git(dir, 'rev-parse', 'HEAD')
        assertEquals(await commitCount(head, dir), 2)
    })
})

Deno.test('commitCount is 0 for a bad range rather than throwing', async () => {
    await withTempDir('prepush-count-bad-', async (dir) => {
        await git(dir, 'init', '-q')
        assertEquals(await commitCount('not-a-real-range', dir), 0)
    })
})

/**
 * Write an executable fake `gitleaks` binary that prints `log` to stderr,
 * writes `report` (a JSON string) to whatever `--report-path` names, and
 * exits with `exitCode`.
 *
 * @param dir - Where to write the fake binary.
 * @param opts - What the fake should print/write/exit with.
 * @returns The fake binary's path.
 */
async function fakeGitleaks(
    dir: string,
    opts: { log: string; report: string; exitCode: number },
): Promise<string> {
    const path = join(dir, 'gitleaks')
    const script = `#!/bin/sh
# Fake gitleaks for tests. Finds --report-path's VALUE (the next argv) and
# writes the fixture report there; prints the fixture log to stderr.
report=""
prev=""
for arg in "$@"; do
    if [ "$prev" = "--report-path" ]; then
        report="$arg"
    fi
    prev="$arg"
done
printf '%s' ${JSON.stringify(opts.report)} > "$report"
printf '%s' ${JSON.stringify(opts.log)} 1>&2
exit ${opts.exitCode}
`
    await Deno.writeTextFile(path, script)
    await Deno.chmod(path, 0o755)
    return path
}

Deno.test('scanRange passes on a clean, non-empty report', async () => {
    await withTempDir('prepush-scan-clean-', async (dir) => {
        const bin = await fakeGitleaks(dir, {
            log: 'INF 3 commits scanned\n',
            report: '[]',
            exitCode: 0,
        })
        const result = await scanRange(
            'HEAD~2..HEAD',
            dir,
            bin,
            3,
        )
        assertEquals(result, { ok: true })
    })
})

Deno.test('scanRange fails closed on an ERR log line even with exit 0', async () => {
    await withTempDir('prepush-scan-err-', async (dir) => {
        const bin = await fakeGitleaks(dir, {
            log: 'ERR something went sideways\n1 commits scanned\n',
            report: '[]',
            exitCode: 0,
        })
        const result = await scanRange(
            'HEAD~1..HEAD',
            dir,
            bin,
            1,
        )
        assertEquals(result.ok, false)
        assert(result.reason?.includes('ERR/FTL'))
    })
})

Deno.test('scanRange fails closed on "0 commits scanned" when commits exist', async () => {
    await withTempDir('prepush-scan-zero-', async (dir) => {
        const bin = await fakeGitleaks(dir, {
            log: 'INF 0 commits scanned\n',
            report: '[]',
            exitCode: 0,
        })
        const result = await scanRange(
            'HEAD~2..HEAD',
            dir,
            bin,
            2,
        )
        assertEquals(result.ok, false)
        assert(result.reason?.includes('the range holds 2'))
    })
})

Deno.test('scanRange fails closed on leaks found but exit 0', async () => {
    await withTempDir('prepush-scan-leak-', async (dir) => {
        const bin = await fakeGitleaks(dir, {
            log: '1 commits scanned\n',
            report: '[{"Fingerprint":"abc:def:generic-api-key:1"}]',
            exitCode: 0,
        })
        const result = await scanRange(
            'HEAD~1..HEAD',
            dir,
            bin,
            1,
        )
        assertEquals(result.ok, false)
        assert(result.reason?.includes('exited 0'))
    })
})

Deno.test('scanRange fails a real finding reported honestly (exit 1)', async () => {
    await withTempDir('prepush-scan-real-', async (dir) => {
        const bin = await fakeGitleaks(dir, {
            log: '1 commits scanned\n',
            report: '[{"Fingerprint":"abc:def:generic-api-key:1"}]',
            exitCode: 1,
        })
        const result = await scanRange(
            'HEAD~1..HEAD',
            dir,
            bin,
            1,
        )
        assertEquals(result.ok, false)
    })
})

Deno.test('runPrepushScan refuses when .gitleaks.toml is present', async () => {
    await withTempDir('prepush-toml-', async (dir) => {
        await Deno.writeTextFile(join(dir, '.gitleaks.toml'), '# nope\n')
        const result = await runPrepushScan(
            `x ${ZERO} x ${ZERO}\n`,
            dir,
        )
        assertEquals(result.ok, false)
        assert(result.lines.some((l) => l.includes('.gitleaks.toml')))
    })
})

Deno.test('runPrepushScan skips deletes and empty ranges without invoking gitleaks', async () => {
    await withTempDir('prepush-skip-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')
        const head = await git(dir, 'rev-parse', 'HEAD')
        // remote == local: an empty, non-delete range.
        const result = await runPrepushScan(
            `refs/heads/x ${head} refs/heads/x ${head}\n`,
            dir,
        )
        assertEquals(result.ok, true)
        assert(result.lines.some((l) => l.includes('nothing to scan')))
    })
})

Deno.test('resolveBase returns remoteSha for an existing branch', async () => {
    const base = await resolveBase(
        {
            localRef: 'refs/heads/x',
            localSha: 'abc',
            remoteRef: 'refs/heads/x',
            remoteSha: 'def',
        },
        '.',
    )
    assertEquals(base, 'def')
})

Deno.test('resolveBase is null for a new branch with no merge-base', async () => {
    await withTempDir('prepush-base-none-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')
        const local = await git(dir, 'rev-parse', 'HEAD')
        const base = await resolveBase(
            {
                localRef: 'refs/heads/new',
                localSha: local,
                remoteRef: 'refs/heads/new',
                remoteSha: ZERO,
            },
            dir,
        )
        assertEquals(base, null)
    })
})

Deno.test('readIgnoreAtBase reads .gitleaksignore as it stood at a given commit, not the tip', async () => {
    await withTempDir('prepush-base-ignore-', async (dir) => {
        await git(dir, 'init', '-q')
        await Deno.writeTextFile(
            join(dir, '.gitleaksignore'),
            'base-fingerprint\n',
        )
        await git(dir, 'add', '.gitleaksignore')
        await git(dir, 'commit', '-q', '-m', 'base has an ignore entry')
        const baseSha = await git(dir, 'rev-parse', 'HEAD')

        // The tip adds a DIFFERENT entry after the base commit.
        await Deno.writeTextFile(
            join(dir, '.gitleaksignore'),
            'base-fingerprint\ntip-only-fingerprint\n',
        )
        await git(dir, 'add', '.gitleaksignore')
        await git(dir, 'commit', '-q', '-m', 'tip adds another entry')

        const content = await readIgnoreAtBase(baseSha, dir)
        assert(content?.includes('base-fingerprint'))
        assert(
            !content?.includes('tip-only-fingerprint'),
            'read the tip file instead of the base',
        )
    })
})

Deno.test('readIgnoreAtBase is empty when the base predates .gitleaksignore', async () => {
    await withTempDir('prepush-base-ignore-none-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(
            dir,
            'commit',
            '-q',
            '--allow-empty',
            '-m',
            'root, no ignore file',
        )
        const baseSha = await git(dir, 'rev-parse', 'HEAD')
        assertEquals(await readIgnoreAtBase(baseSha, dir), '')
    })
})

Deno.test('readIgnoreAtBase returns null (keep the tip) when there is no base', async () => {
    assertEquals(await readIgnoreAtBase(null, '.'), null)
})

Deno.test('createScanWorktree checks out local_sha in a disposable, detached worktree', async () => {
    await withTempDir('prepush-worktree-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')
        const local = await git(dir, 'rev-parse', 'HEAD')

        const worktreeDir = await createScanWorktree(local, dir)
        try {
            assertEquals(await git(worktreeDir, 'rev-parse', 'HEAD'), local)
            assertEquals(
                await git(worktreeDir, 'rev-parse', '--abbrev-ref', 'HEAD'),
                'HEAD',
                'worktree HEAD was not detached',
            )
        } finally {
            await removeScanWorktree(worktreeDir, dir)
        }
    })
})

Deno.test('removeScanWorktree leaves no worktree registered, even when the scan throws mid-way', async () => {
    await withTempDir('prepush-worktree-throw-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')
        const local = await git(dir, 'rev-parse', 'HEAD')

        let worktreeDir: string | null = null
        let threw = false
        try {
            worktreeDir = await createScanWorktree(local, dir)
            throw new Error('simulated crash mid-scan')
        } catch {
            threw = true
        } finally {
            if (worktreeDir) await removeScanWorktree(worktreeDir, dir)
        }
        assert(threw, 'the simulated mid-scan failure did not actually throw')

        const list = await git(dir, 'worktree', 'list', '--porcelain')
        const registered = (list.match(/^worktree /gm) ?? []).length
        assertEquals(
            registered,
            1,
            `only the main worktree should remain:\n${list}`,
        )
        assertEquals(
            await git(dir, 'config', '--get', 'core.bare').catch(() => 'false'),
            'false',
        )
    })
})

Deno.test('writeBaseIgnoreFile writes base content into the worktree, never the developer tree', async () => {
    await withTempDir('prepush-write-ignore-', async (dir) => {
        await git(dir, 'init', '-q')
        await Deno.writeTextFile(join(dir, '.gitleaksignore'), 'tip\n')
        await git(dir, 'add', '.gitleaksignore')
        await git(dir, 'commit', '-q', '-m', 'tip ignore')
        const local = await git(dir, 'rev-parse', 'HEAD')

        const worktreeDir = await createScanWorktree(local, dir)
        try {
            await writeBaseIgnoreFile('base\n', worktreeDir)
            assertEquals(
                await Deno.readTextFile(join(worktreeDir, '.gitleaksignore')),
                'base\n',
            )
            assertEquals(
                await Deno.readTextFile(join(dir, '.gitleaksignore')),
                'tip\n',
                'writeBaseIgnoreFile touched the developer tree',
            )
        } finally {
            await removeScanWorktree(worktreeDir, dir)
        }
    })
})

Deno.test('writeBaseIgnoreFile with null content leaves the worktree checkout (the tip) untouched', async () => {
    await withTempDir('prepush-write-ignore-null-', async (dir) => {
        await git(dir, 'init', '-q')
        await Deno.writeTextFile(join(dir, '.gitleaksignore'), 'tip\n')
        await git(dir, 'add', '.gitleaksignore')
        await git(dir, 'commit', '-q', '-m', 'tip ignore')
        const local = await git(dir, 'rev-parse', 'HEAD')

        const worktreeDir = await createScanWorktree(local, dir)
        try {
            await writeBaseIgnoreFile(null, worktreeDir)
            assertEquals(
                await Deno.readTextFile(join(worktreeDir, '.gitleaksignore')),
                'tip\n',
            )
        } finally {
            await removeScanWorktree(worktreeDir, dir)
        }
    })
})

/**
 * Write a fake Stripe test-mode key gitleaks reliably flags
 * (`stripe-access-token`), never a real secret.
 *
 * @param dir - The repository working directory.
 * @param file - The file to write it into.
 */
async function writeFakeSecret(dir: string, file: string): Promise<void> {
    await Deno.writeTextFile(
        join(dir, file),
        'STRIPE_KEY=sk_test_FAKEFAKEFAKEFAKEFAKEFAKEFAKE0000\n',
    )
}

// The next two tests exercise the actual base-snapshot behavior end to end
// against the REAL gitleaks binary (`runPrepushScan` installs it — a cache
// hit, no network, once it has been fetched once in this environment): a
// fake gitleaks binary cannot honour `.gitleaksignore` itself.

Deno.test('runPrepushScan refuses a same-push .gitleaksignore self-suppression (#HIGH)', async () => {
    await withTempDir('prepush-self-suppress-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')
        const root = await git(dir, 'rev-parse', 'HEAD')
        await git(dir, 'update-ref', 'refs/remotes/origin/main', root)

        // Same push: the secret AND its own suppression, in two new commits.
        await writeFakeSecret(dir, 'secret.env')
        await git(dir, 'add', 'secret.env')
        await git(dir, 'commit', '-q', '-m', 'add secret')
        const secretSha = await git(dir, 'rev-parse', 'HEAD')

        await Deno.writeTextFile(
            join(dir, '.gitleaksignore'),
            `${secretSha}:secret.env:stripe-access-token:1\n`,
        )
        await git(dir, 'add', '.gitleaksignore')
        await git(dir, 'commit', '-q', '-m', 'suppress it (same push)')
        const local = await git(dir, 'rev-parse', 'HEAD')

        const result = await runPrepushScan(
            `refs/heads/new ${local} refs/heads/new ${ZERO}\n`,
            dir,
        )
        assertEquals(result.ok, false, result.lines.join('\n'))
    })
})

Deno.test('runPrepushScan honours a .gitleaksignore entry already present at the base', async () => {
    await withTempDir('prepush-base-suppress-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')
        const root = await git(dir, 'rev-parse', 'HEAD')

        // A side branch with the secret, built off root — NOT an ancestor of
        // the base below, so its commit stays inside this push's range.
        await writeFakeSecret(dir, 'secret.env')
        await git(dir, 'add', 'secret.env')
        await git(dir, 'commit', '-q', '-m', 'add secret (side branch)')
        const secretSha = await git(dir, 'rev-parse', 'HEAD')

        // The base branch: built off root too, and already carries the
        // suppression for the (already known) secret commit's fingerprint —
        // as if reviewed and pre-approved before this push merges it in.
        await git(dir, 'checkout', '-q', '--detach', root)
        await Deno.writeTextFile(
            join(dir, '.gitleaksignore'),
            `${secretSha}:secret.env:stripe-access-token:1\n`,
        )
        await git(dir, 'add', '.gitleaksignore')
        await git(dir, 'commit', '-q', '-m', 'pre-approve the secret commit')
        const baseSha = await git(dir, 'rev-parse', 'HEAD')
        await git(dir, 'update-ref', 'refs/remotes/origin/main', baseSha)

        // This push merges the secret commit into the base.
        const merge = await git(
            dir,
            'merge',
            '-q',
            '--no-ff',
            '-m',
            'merge secret branch',
            secretSha,
        )
        void merge
        const local = await git(dir, 'rev-parse', 'HEAD')

        const result = await runPrepushScan(
            `refs/heads/new ${local} refs/heads/new ${ZERO}\n`,
            dir,
        )
        assertEquals(result.ok, true, result.lines.join('\n'))
        // Confirm the secret commit really was inside the scanned range —
        // otherwise this would trivially pass for the wrong reason.
        assert(
            result.lines.some((l) =>
                l.includes(`origin/main..${local}`) && l.includes('clean')
            ),
            result.lines.join('\n'),
        )
    })
})

Deno.test('runPrepushScan never mutates the developer real .gitleaksignore, including an uncommitted edit', async () => {
    await withTempDir('prepush-tree-untouched-', async (dir) => {
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')

        // The base carries one suppression entry.
        await Deno.writeTextFile(
            join(dir, '.gitleaksignore'),
            'base-entry\n',
        )
        await git(dir, 'add', '.gitleaksignore')
        await git(dir, 'commit', '-q', '-m', 'base ignore')
        const baseSha = await git(dir, 'rev-parse', 'HEAD')
        await git(dir, 'update-ref', 'refs/remotes/origin/main', baseSha)

        // The tip commits a DIFFERENT, committed version of the file...
        await Deno.writeTextFile(
            join(dir, '.gitleaksignore'),
            'base-entry\ntip-entry\n',
        )
        await git(dir, 'add', '.gitleaksignore')
        await git(dir, 'commit', '-q', '-m', 'tip ignore')
        const local = await git(dir, 'rev-parse', 'HEAD')

        // ...and the developer then makes an UNCOMMITTED edit on top, which
        // must survive the scan byte-for-byte.
        const uncommitted = 'base-entry\ntip-entry\nUNCOMMITTED-EDIT\n'
        await Deno.writeTextFile(join(dir, '.gitleaksignore'), uncommitted)

        const result = await runPrepushScan(
            `refs/heads/new ${local} refs/heads/new ${ZERO}\n`,
            dir,
        )
        assertEquals(result.ok, true, result.lines.join('\n'))
        assertEquals(
            await Deno.readTextFile(join(dir, '.gitleaksignore')),
            uncommitted,
            'the developer working tree .gitleaksignore was mutated by the scan',
        )

        // No worktree left registered, and the repo itself was never flipped
        // to bare in the process.
        const list = await git(dir, 'worktree', 'list', '--porcelain')
        const registered = (list.match(/^worktree /gm) ?? []).length
        assertEquals(
            registered,
            1,
            `only the main worktree should remain:\n${list}`,
        )
        assertEquals(
            await git(dir, 'config', '--get', 'core.bare').catch(() => 'false'),
            'false',
        )
    })
})
