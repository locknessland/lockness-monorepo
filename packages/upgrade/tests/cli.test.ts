/**
 * @fileoverview `jsr:@lockness/upgrade` run as a subprocess (#436): a failure
 * exits non-zero with exactly one `❌` line and no `error: Uncaught`, through
 * `runEntry` rather than `Deno.exit()`.
 *
 * Every case uses an explicit target version or fails before any version is
 * fetched, so no case reaches the network.
 *
 * @module @lockness/upgrade/tests/cli
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { fromFileUrl, join } from '@std/path'

const ENTRY = fromFileUrl(new URL('../mod.ts', import.meta.url))

/** Run the upgrade tool in `cwd` and capture both streams and the status. */
async function runUpgrade(
    cwd: string,
    args: string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
    const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', ENTRY, ...args],
        cwd,
        env: { NO_COLOR: '1' },
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    return {
        code,
        stdout: new TextDecoder().decode(stdout),
        stderr: new TextDecoder().decode(stderr),
    }
}

/** A non-zero status, exactly one `❌` line, and no escaped throw. */
function assertFailedOnce(
    result: { code: number; stdout: string; stderr: string },
): void {
    const out = result.stdout + result.stderr
    assert(result.code !== 0, out)
    assertEquals(out.split('❌').length - 1, 1, out)
    assert(!out.includes('error: Uncaught'), out)
}

/** Run `fn` in a fresh temporary directory, removed afterwards. */
async function inTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await Deno.makeTempDir({ prefix: 'lockness_upgrade_test_' })
    try {
        await fn(dir)
    } finally {
        await Deno.remove(dir, { recursive: true })
    }
}

Deno.test('upgrade CLI - no Lockness package is a one-line failure', async () => {
    await inTempDir(async (dir) => {
        await Deno.writeTextFile(
            join(dir, 'deno.json'),
            JSON.stringify({ imports: { '@std/path': 'jsr:@std/path@^1' } }),
        )

        const result = await runUpgrade(dir, ['0.2.0'])

        assertFailedOnce(result)
        assertEquals(result.code, 1)
        assertStringIncludes(
            result.stderr,
            '❌ No Lockness packages found in imports\n',
        )
    })
})

Deno.test('upgrade CLI - a missing deno.json reaches the catch-all once', async () => {
    await inTempDir(async (dir) => {
        const result = await runUpgrade(dir, ['0.2.0'])

        assertFailedOnce(result)
        assertStringIncludes(result.stderr, '❌ upgrade failed:')
    })
})

Deno.test('upgrade CLI - --help exits 0 and prints the usage', async () => {
    await inTempDir(async (dir) => {
        const result = await runUpgrade(dir, ['--help'])

        assertEquals(result.code, 0, result.stderr)
        assertStringIncludes(result.stdout, 'Lockness Upgrade Tool')
    })
})

Deno.test('upgrade CLI - an explicit target upgrades and exits 0', async () => {
    await inTempDir(async (dir) => {
        const config = join(dir, 'deno.json')
        await Deno.writeTextFile(
            config,
            JSON.stringify({
                imports: { '@lockness/core': 'jsr:@lockness/core@^0.1.19' },
            }),
        )

        const result = await runUpgrade(dir, ['0.2.0'])

        assertEquals(result.code, 0, result.stderr)
        assertEquals(
            JSON.parse(await Deno.readTextFile(config)).imports[
                '@lockness/core'
            ],
            'jsr:@lockness/core@^0.2.0',
        )
    })
})
