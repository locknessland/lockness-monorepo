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
import { install as installGitleaks } from './install_gitleaks.ts'
import * as scan from './prepush_secret_scan.ts'
import {
    isDelete,
    parseRefUpdates,
    type PrepushResult,
    type PrepushScanOptions,
    type RefUpdate,
    type ScanResult,
    writeBaseIgnoreFile,
} from './prepush_secret_scan.ts'
import * as objects from './published_objects.ts'
import {
    type OutgoingUpdate,
    publishesNothingNew,
} from './published_objects.ts'
import {
    git,
    isolatedEnv,
    type PublishedFixture,
    publishedFixture,
    sideCommit,
    subtreeCommit,
    withTempDir,
    ZERO,
} from './prepush_test_support.ts'

// The code under test, bound to {@link isolatedEnv} with the repository as
// `HOME`. Each wrapper only appends the environment argument.
const resolveBase = (update: RefUpdate, cwd: string) =>
    scan.resolveBase(update, cwd, isolatedEnv(cwd))
const resolveRange = (update: RefUpdate, cwd: string) =>
    scan.resolveRange(update, cwd, isolatedEnv(cwd))
const commitCount = (range: string, cwd: string) =>
    scan.commitCount(range, cwd, isolatedEnv(cwd))
const readIgnoreAtBase = (base: string | null, cwd: string) =>
    scan.readIgnoreAtBase(base, cwd, isolatedEnv(cwd))
const createScanWorktree = (localSha: string, cwd: string) =>
    scan.createScanWorktree(localSha, cwd, isolatedEnv(cwd))
const removeScanWorktree = (worktreeDir: string, cwd: string) =>
    scan.removeScanWorktree(worktreeDir, cwd, isolatedEnv(cwd))
const scanRange = (
    range: string,
    cwd: string,
    gitleaksPath: string,
    expected: number,
): Promise<ScanResult> =>
    scan.scanRange(range, cwd, gitleaksPath, expected, isolatedEnv(cwd))
const published = (cwd: string) => objects.published(cwd, isolatedEnv(cwd))
const outgoing = (update: OutgoingUpdate, cwd: string) =>
    objects.outgoing(update, cwd, isolatedEnv(cwd))

/**
 * The real, verified gitleaks binary, resolved once. The installer's cache
 * lookup reads the real `HOME` — here, in the test harness, never inside the
 * code under test, which is handed the resolved path.
 */
let realGitleaks: Promise<string> | null = null

/**
 * {@link scan.runPrepushScan} with an isolated `gitEnv` and, unless the test
 * hands in its own, the real gitleaks binary resolved by the harness.
 *
 * @param stdin - The hook's stdin.
 * @param cwd - The repository root, also `HOME`.
 * @param options - Overrides (`installGitleaks`, `gitEnv`).
 * @returns The scan's outcome.
 */
function runPrepushScan(
    stdin: string,
    cwd: string,
    options: PrepushScanOptions = {},
): Promise<PrepushResult> {
    return scan.runPrepushScan(stdin, cwd, {
        installGitleaks: () => (realGitleaks ??= installGitleaks()),
        gitEnv: isolatedEnv(cwd),
        ...options,
    })
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

Deno.test('commitCount is null for a bad range, never 0 (#430 fails closed)', async () => {
    await withTempDir('prepush-count-bad-', async (dir) => {
        await git(dir, 'init', '-q')
        // "could not resolve" must never read as "nothing to scan".
        assertEquals(await commitCount('not-a-real-range', dir), null)
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

/**
 * Write a fake `gitleaks` that must never run: it records that it was called
 * in a marker file beside itself and exits non-zero.
 *
 * @param dir - Where to write the fake binary.
 * @returns The binary's path and the marker it writes when invoked.
 */
async function forbiddenGitleaks(
    dir: string,
): Promise<{ bin: string; marker: string }> {
    const bin = join(dir, 'gitleaks-forbidden')
    const marker = join(dir, 'gitleaks-was-called')
    await Deno.writeTextFile(
        bin,
        `#!/bin/sh\necho called > ${JSON.stringify(marker)}\nexit 99\n`,
    )
    await Deno.chmod(bin, 0o755)
    return { bin, marker }
}

/**
 * Whether a path exists.
 *
 * @param path - The path to test.
 * @returns `true` when something is there.
 */
async function exists(path: string): Promise<boolean> {
    return await Deno.stat(path).then(() => true, () => false)
}

Deno.test('runPrepushScan refuses a remote sha missing from the local object store (#430)', async () => {
    await withTempDir('prepush-missing-remote-', async (dir) => {
        await git(dir, 'init', '-q')
        await Deno.writeTextFile(join(dir, 'a.txt'), 'a\n')
        await git(dir, 'add', 'a.txt')
        await git(dir, 'commit', '-q', '-m', 'local work')
        const local = await git(dir, 'rev-parse', 'HEAD')
        // A `--force` push over a remote tip this clone never fetched.
        const missing = 'deadbeef'.repeat(5)
        const { bin, marker } = await forbiddenGitleaks(dir)

        const result = await runPrepushScan(
            `refs/heads/x ${local} refs/heads/x ${missing}\n`,
            dir,
            { installGitleaks: () => Promise.resolve(bin) },
        )
        assertEquals(result.ok, false, result.lines.join('\n'))
        assert(
            result.lines.some((l) =>
                l.includes('cannot resolve range — fetch first')
            ),
            result.lines.join('\n'),
        )
        assertEquals(await exists(marker), false, 'gitleaks was invoked')
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
        await Deno.writeTextFile(join(dir, 'a.txt'), 'a\n')
        await git(dir, 'add', 'a.txt')
        await git(dir, 'commit', '-q', '-m', 'root')
        const head = await git(dir, 'rev-parse', 'HEAD')
        const { bin, marker } = await forbiddenGitleaks(dir)
        // A delete (zero local sha) of a remote branch whose tip this clone
        // does not even hold — a delete sends nothing, so nothing is read —
        // then remote == local: an empty, non-delete range.
        const gone = 'deadbeef'.repeat(5)
        const result = await runPrepushScan(
            `(delete) ${ZERO} refs/heads/old ${gone}\n` +
                `refs/heads/x ${head} refs/heads/x ${head}\n`,
            dir,
            { installGitleaks: () => Promise.resolve(bin) },
        )
        assertEquals(result.ok, true, result.lines.join('\n'))
        assertEquals(result.lines, [
            '(delete): delete, skipped',
            `refs/heads/x: ${head}..${head} is empty, nothing to scan`,
        ])
        assertEquals(await exists(marker), false, 'gitleaks was invoked')
    })
})

Deno.test('runPrepushScan refuses an option-shaped sha instead of passing it to git', async () => {
    await withTempDir('prepush-option-sha-', async (dir) => {
        await git(dir, 'init', '-q')
        await Deno.writeTextFile(join(dir, 'a.txt'), 'a\n')
        await git(dir, 'add', 'a.txt')
        await git(dir, 'commit', '-q', '-m', 'root')
        const head = await git(dir, 'rev-parse', 'HEAD')
        await git(dir, 'update-ref', 'refs/remotes/origin/main', head)
        const { bin, marker } = await forbiddenGitleaks(dir)
        for (
            const line of [
                `refs/heads/x ${head} refs/heads/x --all`,
                `refs/heads/x --all refs/heads/x ${ZERO}`,
                `refs/heads/x ${head} refs/heads/x ${head.slice(0, 12)}`,
                `refs/heads/x ${head} refs/heads/x origin/main`,
            ]
        ) {
            const result = await runPrepushScan(`${line}\n`, dir, {
                installGitleaks: () => Promise.resolve(bin),
            })
            assertEquals(
                result.ok,
                false,
                `${line}\n${result.lines.join('\n')}`,
            )
            assertEquals(result.lines.length, 1, result.lines.join('\n'))
            assert(
                result.lines[0].includes('is not a full object id; refused'),
                `${line}\n${result.lines.join('\n')}`,
            )
        }
        assertEquals(await exists(marker), false, 'gitleaks was invoked')
    })
})

Deno.test('runPrepushScan runs git with the environment it is given, never the process one', async () => {
    await withTempDir('prepush-env-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const commit = await subtreeCommit(dir, m2)
        const stdin = `refs/heads/main ${commit} refs/heads/main ${ZERO}\n`
        const { bin, marker } = await forbiddenGitleaks(dir)

        // Admitted under the isolated environment.
        const admitted = await runPrepushScan(stdin, dir, {
            installGitleaks: () => Promise.resolve(bin),
        })
        assertEquals(admitted.ok, true, admitted.lines.join('\n'))

        // A global config git cannot parse makes every git call fail. Handed
        // in as gitEnv, it must reach git: admission then cannot be computed,
        // nothing is admitted, and the push is refused.
        const broken = join(dir, 'broken.gitconfig')
        await Deno.writeTextFile(broken, '[core\n')
        const refused = await runPrepushScan(stdin, dir, {
            installGitleaks: () => Promise.resolve(bin),
            gitEnv: { ...isolatedEnv(dir), GIT_CONFIG_GLOBAL: broken },
        })
        assertEquals(refused.ok, false, refused.lines.join('\n'))
        assert(!refused.lines.some((l) => l.includes(ADMITTED)))
        assertEquals(
            await objects.published(dir, {
                ...isolatedEnv(dir),
                GIT_CONFIG_GLOBAL: broken,
            }),
            new Set(),
        )
        assertEquals(await exists(marker), false, 'gitleaks was invoked')
    })
})

Deno.test('runPrepushScan: an inherited GIT_DIR cannot redirect git at another repository', async () => {
    await withTempDir('prepush-git-dir-', async (root) => {
        const dir = join(root, 'repo')
        const decoy = join(root, 'decoy')
        await Deno.mkdir(dir)
        await Deno.mkdir(decoy)
        await git(dir, 'init', '-q')
        await git(dir, 'commit', '-q', '--allow-empty', '-m', 'root')
        const head = await git(dir, 'rev-parse', 'HEAD')
        // The decoy holds none of `dir`'s objects: resolved against it, the
        // range cannot be read and the scan fails closed.
        await git(decoy, 'init', '-q')
        await git(decoy, 'commit', '-q', '--allow-empty', '-m', 'decoy')
        const before = await git(decoy, 'for-each-ref')
        const { bin, marker } = await forbiddenGitleaks(root)

        // Inherited from the caller's environment, as a hook would pass it.
        const result = await runPrepushScan(
            `refs/heads/x ${head} refs/heads/x ${head}\n`,
            dir,
            {
                installGitleaks: () => Promise.resolve(bin),
                gitEnv: { ...isolatedEnv(dir), GIT_DIR: join(decoy, '.git') },
            },
        )
        assertEquals(result.ok, true, result.lines.join('\n'))
        assert(result.lines.some((l) => l.includes('nothing to scan')))
        assertEquals(await git(decoy, 'for-each-ref'), before)
        assertEquals(await exists(marker), false, 'gitleaks was invoked')
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

/** The tail of the fake key, split so no literal in this file is a key. */
const FAKE_KEY_TAIL = 'FAKEFAKEFAKEFAKE' + 'FAKEFAKEFAKE0000'

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
        // Assembled at runtime: a literal key in this file would itself be
        // a gitleaks finding in every commit that touches the line.
        `STRIPE_KEY=${['sk', 'test', FAKE_KEY_TAIL].join('_')}\n`,
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

// ---------------------------------------------------------------------------
// #431 — the published-objects admission rule. A ref update whose outgoing
// trees and blobs are all already reachable from origin/main publishes
// nothing new and passes without a gitleaks run; anything else is scanned.
// ---------------------------------------------------------------------------

const ADMITTED = 'publishes nothing origin/main has not already published'

Deno.test('admission: an unparented subtree commit passes, and gitleaks is never invoked (realtime case)', async () => {
    await withTempDir('prepush-admit-subtree-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const commit = await subtreeCommit(dir, m2)

        const out = await outgoing({ localSha: commit, remoteSha: ZERO }, dir)
        assert(out !== null && out.size > 0, 'outgoing should list the tree')
        assertEquals(publishesNothingNew(out, await published(dir)), true)

        const { bin, marker } = await forbiddenGitleaks(dir)
        const result = await runPrepushScan(
            `refs/heads/main ${commit} refs/heads/main ${ZERO}\n`,
            dir,
            { installGitleaks: () => Promise.resolve(bin) },
        )
        assertEquals(result.ok, true, result.lines.join('\n'))
        assert(
            result.lines.some((l) => l.includes(`${ADMITTED}; not scanned`)),
            result.lines.join('\n'),
        )
        assertEquals(await exists(marker), false, 'gitleaks was invoked')
    })
})

Deno.test('admission: a release commit parented on the fetched mirror head passes (realtime branch push)', async () => {
    await withTempDir('prepush-admit-parented-', async (dir) => {
        const { m1, m2 } = await publishedFixture(dir)
        const previous = await subtreeCommit(dir, m1)
        const commit = await subtreeCommit(dir, m2, previous)

        const { bin, marker } = await forbiddenGitleaks(dir)
        const result = await runPrepushScan(
            `refs/heads/main ${commit} refs/heads/main ${previous}\n`,
            dir,
            { installGitleaks: () => Promise.resolve(bin) },
        )
        assertEquals(result.ok, true, result.lines.join('\n'))
        assert(result.lines.some((l) => l.includes(ADMITTED)))
        assertEquals(await exists(marker), false, 'gitleaks was invoked')
    })
})

Deno.test('admission: a chain from an older origin/main tree, pushed as a new ref, passes (mail-tag case)', async () => {
    await withTempDir('prepush-admit-chain-', async (dir) => {
        const { m1, m2 } = await publishedFixture(dir)
        const first = await subtreeCommit(dir, m1)
        const second = await subtreeCommit(dir, m2, first)

        const out = await outgoing({ localSha: second, remoteSha: ZERO }, dir)
        assertEquals(publishesNothingNew(out, await published(dir)), true)

        const { bin, marker } = await forbiddenGitleaks(dir)
        const result = await runPrepushScan(
            `refs/tags/v2 ${second} refs/tags/v2 ${ZERO}\n`,
            dir,
            { installGitleaks: () => Promise.resolve(bin) },
        )
        assertEquals(result.ok, true, result.lines.join('\n'))
        assert(result.lines.some((l) => l.includes(ADMITTED)))
        assertEquals(await exists(marker), false, 'gitleaks was invoked')
    })
})

Deno.test('admission: a replace ref cannot hide a new blob behind a published commit', async () => {
    await withTempDir('prepush-admit-replace-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const side = await sideCommit(dir, m2, async () => {
            await Deno.writeTextFile(join(dir, 'packages/a/new.ts'), 'new\n')
        })
        const blob = await git(
            dir,
            '--no-replace-objects',
            'rev-parse',
            `${side}:packages/a/new.ts`,
        )
        // refs/replace/<side> -> m2: a git honouring replace refs walks m2
        // (all published), while pack-objects would send side and its blob.
        await git(dir, 'replace', side, m2)

        const out = await outgoing({ localSha: side, remoteSha: ZERO }, dir)
        assert(out !== null && out.has(blob), 'the new blob is not outgoing')
        assertEquals(publishesNothingNew(out, await published(dir)), false)
    })
})

Deno.test('admission: one new blob is not passed', async () => {
    await withTempDir('prepush-admit-new-blob-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const side = await sideCommit(dir, m2, async () => {
            await Deno.writeTextFile(
                join(dir, 'packages/a/new.txt'),
                'never published\n',
            )
        })
        const commit = await subtreeCommit(dir, side)
        const newBlob = await git(
            dir,
            'rev-parse',
            `${side}:packages/a/new.txt`,
        )

        const out = await outgoing({ localSha: commit, remoteSha: ZERO }, dir)
        assert(out?.has(newBlob), 'outgoing must list the new blob')
        assertEquals(publishesNothingNew(out, await published(dir)), false)
    })
})

Deno.test('admission: an older chain whose first tree never reached origin/main is not passed', async () => {
    await withTempDir('prepush-admit-chain-foreign-', async (dir) => {
        const { m1, m2 } = await publishedFixture(dir)
        const side = await sideCommit(dir, m1, async () => {
            await Deno.writeTextFile(join(dir, 'packages/a/x.txt'), 'x\n')
        })
        const first = await subtreeCommit(dir, side)
        const second = await subtreeCommit(dir, m2, first)
        const out = await outgoing({ localSha: second, remoteSha: ZERO }, dir)
        assertEquals(publishesNothingNew(out, await published(dir)), false)
    })
})

Deno.test('admission: a foreign push carrying a new flagged blob is refused', async () => {
    await withTempDir('prepush-admit-foreign-leak-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const side = await sideCommit(
            dir,
            m2,
            () => writeFakeSecret(dir, 'packages/a/secret.env'),
        )
        const commit = await subtreeCommit(dir, side)

        // The REAL gitleaks (a cache hit once installed), as in the
        // base-snapshot tests above: the refusal must come from a scan.
        const result = await runPrepushScan(
            `refs/heads/main ${commit} refs/heads/main ${ZERO}\n`,
            dir,
        )
        assertEquals(result.ok, false, result.lines.join('\n'))
        assert(!result.lines.some((l) => l.includes(ADMITTED)))
        assert(result.lines.some((l) => l.includes('FAILED')))
    })
})

Deno.test('admission: without origin/main nothing passes, not even an empty outgoing set', async () => {
    await withTempDir('prepush-admit-no-origin-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const commit = await subtreeCommit(dir, m2)
        await git(dir, 'update-ref', '-d', 'refs/remotes/origin/main')

        const pub = await published(dir)
        assertEquals(pub.size, 0)
        const out = await outgoing({ localSha: commit, remoteSha: ZERO }, dir)
        assertEquals(publishesNothingNew(out, pub), false)
        assertEquals(publishesNothingNew(new Set(), pub), false)

        // It takes today's path instead: scanned (by a clean fake here).
        const bin = await fakeGitleaks(dir, {
            log: 'INF 1 commits scanned\n',
            report: '[]',
            exitCode: 0,
        })
        const result = await runPrepushScan(
            `refs/heads/main ${commit} refs/heads/main ${ZERO}\n`,
            dir,
            { installGitleaks: () => Promise.resolve(bin) },
        )
        assertEquals(result.ok, true, result.lines.join('\n'))
        assert(!result.lines.some((l) => l.includes(ADMITTED)))
        assert(result.lines.some((l) => l.includes('clean')))
    })
})

Deno.test('admission: a rev-list failure is not passed', async () => {
    await withTempDir('prepush-admit-revlist-fail-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const pub = await published(dir)
        const missing = 'deadbeef'.repeat(5)
        assertEquals(
            await outgoing({ localSha: m2, remoteSha: missing }, dir),
            null,
        )
        assertEquals(
            await outgoing({ localSha: missing, remoteSha: ZERO }, dir),
            null,
        )
        assertEquals(
            await outgoing({ localSha: '--all', remoteSha: ZERO }, dir),
            null,
            'a non-sha argument must never reach rev-list as an option',
        )
        assertEquals(publishesNothingNew(null, pub), false)
    })
})

Deno.test('admission: a remote sha missing locally is refused even when everything is published', async () => {
    await withTempDir('prepush-admit-missing-remote-', async (dir) => {
        const { m2 } = await publishedFixture(dir)
        const missing = 'deadbeef'.repeat(5)
        const { bin, marker } = await forbiddenGitleaks(dir)
        const result = await runPrepushScan(
            `refs/heads/main ${m2} refs/heads/main ${missing}\n`,
            dir,
            { installGitleaks: () => Promise.resolve(bin) },
        )
        assertEquals(result.ok, false, result.lines.join('\n'))
        assert(
            result.lines.some((l) =>
                l.includes('cannot resolve range — fetch first')
            ),
            result.lines.join('\n'),
        )
        assertEquals(await exists(marker), false, 'gitleaks was invoked')
    })
})

Deno.test('admission: outgoing leaves out commit ids but keeps trees and blobs', async () => {
    await withTempDir('prepush-admit-commit-ids-', async (dir) => {
        const { m1, m2 } = await publishedFixture(dir)
        const out = await outgoing({ localSha: m2, remoteSha: m1 }, dir)
        assert(out !== null)
        assertEquals(out.has(m2), false, 'a commit id leaked into outgoing')
        assert(out.has(await git(dir, 'rev-parse', `${m2}:packages/a/mod.ts`)))
        assertEquals(
            out.has(await git(dir, 'rev-parse', `${m2}:packages/a/docs`)),
            false,
            'an object the remote tip already has was listed as outgoing',
        )
    })
})

// ---------------------------------------------------------------------------
// #434 — shallow and partial clones. `published` / `outgoing` either work or
// fail closed: a clone shape may narrow what is admitted, never widen it.
// ---------------------------------------------------------------------------

/**
 * A {@link publishedFixture} pushed to a bare `origin` that serves filters,
 * plus a clone of it made with `cloneArgs`.
 *
 * @param root - An empty temp directory.
 * @param cloneArgs - Extra `git clone` arguments (`--depth 1`, `--filter=…`).
 * @returns The full source, the clone, and the fixture's commits.
 */
async function clonedFixture(
    root: string,
    cloneArgs: string[],
): Promise<PublishedFixture & { clone: string; origin: string }> {
    const src = join(root, 'src')
    const origin = join(root, 'origin.git')
    const clone = join(root, 'clone')
    await Deno.mkdir(src)
    const fixture = await publishedFixture(src)
    await git(root, 'init', '-q', '--bare', '-b', 'main', origin)
    await git(origin, 'config', 'uploadpack.allowFilter', 'true')
    await git(src, 'push', '-q', origin, `${fixture.m2}:refs/heads/main`)
    // file:// so the transport honours --depth and --filter on a local path.
    await git(root, 'clone', '-q', ...cloneArgs, `file://${origin}`, clone)
    return { ...fixture, clone, origin }
}

Deno.test('admission: a shallow clone narrows the published set, never widens it', async () => {
    await withTempDir('prepush-shallow-', async (root) => {
        const f = await clonedFixture(root, ['--depth', '1'])
        assertEquals(
            await git(f.clone, 'rev-parse', '--is-shallow-repository'),
            'true',
        )
        const full = await published(f.dir)
        const shallow = await published(f.clone)
        assert(shallow.size > 0, 'origin/main resolved to nothing')
        assert(shallow.size < full.size, 'the shallow set was not narrower')
        for (const id of shallow) assert(full.has(id), `${id} is not published`)

        // The tip's subtree is inside the boundary: still admitted.
        const tip = await subtreeCommit(f.clone, f.m2)
        assertEquals(
            publishesNothingNew(
                await outgoing({ localSha: tip, remoteSha: ZERO }, f.clone),
                shallow,
            ),
            true,
        )
        // m1's blob of packages/a/mod.ts is beyond the boundary: not in the
        // shallow published set, so a push carrying it would be scanned.
        const oldBlob = await git(
            f.dir,
            'rev-parse',
            `${f.m1}:packages/a/mod.ts`,
        )
        assert(full.has(oldBlob) && !shallow.has(oldBlob))
        // A remote tip beyond the boundary cannot be walked: null, refused.
        assertEquals(
            await outgoing({ localSha: tip, remoteSha: f.m1 }, f.clone),
            null,
        )
    })
})

Deno.test('admission: a blobless partial clone fetches what rev-list needs, or admits nothing', async () => {
    await withTempDir('prepush-partial-', async (root) => {
        const f = await clonedFixture(root, ['--filter=blob:none'])
        assertEquals(
            await git(f.clone, 'config', 'remote.origin.promisor'),
            'true',
        )
        // With its promisor unreachable, rev-list cannot complete the walk
        // over the missing blobs: published is empty and nothing is admitted.
        await git(
            f.clone,
            'remote',
            'set-url',
            'origin',
            join(root, 'gone.git'),
        )
        assertEquals(await published(f.clone), new Set())

        // With the promisor reachable, rev-list fetches the missing blobs
        // on demand and the published set is complete.
        await git(f.clone, 'remote', 'set-url', 'origin', `file://${f.origin}`)
        const full = await published(f.dir)
        assertEquals(await published(f.clone), full)
        const tip = await subtreeCommit(f.clone, f.m2)
        assertEquals(
            publishesNothingNew(
                await outgoing({ localSha: tip, remoteSha: ZERO }, f.clone),
                full,
            ),
            true,
        )
    })
})
