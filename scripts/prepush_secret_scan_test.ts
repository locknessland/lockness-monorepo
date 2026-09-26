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
    isDelete,
    parseRefUpdates,
    type RefUpdate,
    resolveRange,
    runPrepushScan,
    scanRange,
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
        const result = await scanRange('HEAD~2..HEAD', dir, bin, 3)
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
        const result = await scanRange('HEAD~1..HEAD', dir, bin, 1)
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
        const result = await scanRange('HEAD~2..HEAD', dir, bin, 2)
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
        const result = await scanRange('HEAD~1..HEAD', dir, bin, 1)
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
        const result = await scanRange('HEAD~1..HEAD', dir, bin, 1)
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
