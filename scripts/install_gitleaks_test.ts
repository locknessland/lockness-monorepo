/**
 * @fileoverview Tests for `scripts/install_gitleaks.ts`: platform mapping,
 * the cache directory, and — the load-bearing case — that a checksum
 * mismatch is rejected before anything is extracted or cached. The network
 * and `tar` are always injected; nothing here downloads a real tarball.
 *
 * @module
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import {
    cacheDir,
    type EnvReader,
    install,
    pinnedSha256,
    platformKey,
    sha256Hex,
} from './install_gitleaks.ts'
import type { GitleaksManifest } from './gitleaks_manifest.ts'

/** A fixed manifest so tests never depend on the real pinned values. */
const TEST_MANIFEST: GitleaksManifest = {
    version: '9.9.9-test',
    sha256: {
        linux_x64: 'a'.repeat(64),
        darwin_arm64: 'b'.repeat(64),
    },
}

/** An `EnvReader` backed by a plain object, for a hermetic cache dir. */
function envOf(vars: Record<string, string>): EnvReader {
    return { get: (key) => vars[key] }
}

Deno.test('platformKey maps supported os/arch pairs', () => {
    assertEquals(platformKey('linux', 'x86_64'), 'linux_x64')
    assertEquals(platformKey('linux', 'aarch64'), 'linux_arm64')
    assertEquals(platformKey('darwin', 'x86_64'), 'darwin_x64')
    assertEquals(platformKey('darwin', 'aarch64'), 'darwin_arm64')
})

Deno.test('platformKey refuses an unsupported os', () => {
    let threw = false
    try {
        platformKey('windows', 'x86_64')
    } catch (error) {
        threw = true
        assert((error as Error).message.includes('unsupported platform'))
    }
    assert(threw, 'accepted an unsupported os')
})

Deno.test('platformKey refuses an unsupported arch', () => {
    let threw = false
    try {
        platformKey('linux', 'arm')
    } catch (error) {
        threw = true
        assert((error as Error).message.includes('unsupported platform'))
    }
    assert(threw, 'accepted an unsupported arch')
})

Deno.test('pinnedSha256 refuses a platform with no pinned hash', () => {
    let threw = false
    try {
        pinnedSha256(TEST_MANIFEST, 'linux_arm64')
    } catch (error) {
        threw = true
        assert((error as Error).message.includes('no pinned sha256'))
    }
    assert(threw, 'returned a hash for an unpinned platform')
})

Deno.test('sha256Hex matches a known vector', async () => {
    const digest = await sha256Hex(new TextEncoder().encode('abc'))
    assertEquals(
        digest,
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
})

Deno.test('cacheDir uses LOCKNESS_CACHE_HOME when set', () => {
    const env = envOf({ LOCKNESS_CACHE_HOME: '/tmp/fixture-cache' })
    assertEquals(
        cacheDir('8.30.1', env),
        join('/tmp/fixture-cache', 'gitleaks', '8.30.1'),
    )
})

Deno.test('cacheDir falls back to HOME/.cache/lockness', () => {
    const env = envOf({ HOME: '/tmp/fixture-home' })
    assertEquals(
        cacheDir('8.30.1', env),
        join('/tmp/fixture-home', '.cache', 'lockness', 'gitleaks', '8.30.1'),
    )
})

Deno.test('cacheDir refuses when neither override nor HOME is set', () => {
    let threw = false
    try {
        cacheDir('8.30.1', envOf({}))
    } catch (error) {
        threw = true
        assert((error as Error).message.includes('HOME is not set'))
    }
    assert(threw, 'resolved a cache dir with no HOME and no override')
})

/**
 * Run `install` against a temp cache dir, removing it afterwards.
 *
 * @param run - Receives the temp cache base and returns whatever the test
 *   needs to assert on.
 */
async function withCache<T>(
    run: (cacheHome: string) => Promise<T>,
): Promise<T> {
    const cacheHome = await Deno.makeTempDir({ prefix: 'gitleaks-cache-' })
    try {
        return await run(cacheHome)
    } finally {
        await Deno.remove(cacheHome, { recursive: true })
    }
}

Deno.test('install rejects a checksum mismatch and installs nothing', async () => {
    await withCache(async (cacheHome) => {
        let extracted = false
        await assertRejects(
            () =>
                install({
                    manifest: TEST_MANIFEST,
                    os: 'linux',
                    arch: 'x86_64',
                    env: envOf({ LOCKNESS_CACHE_HOME: cacheHome }),
                    fetcher: () =>
                        Promise.resolve(
                            new TextEncoder().encode('not the real tarball'),
                        ),
                    extract: () => {
                        extracted = true
                        return Promise.resolve()
                    },
                }),
            Error,
            'sha256 mismatch',
        )
        assertEquals(extracted, false, 'extracted an unverified tarball')
        const binPath = join(
            cacheHome,
            'gitleaks',
            TEST_MANIFEST.version,
            'gitleaks',
        )
        const wrote = await Deno.stat(binPath).then(() => true, () => false)
        assertEquals(wrote, false, 'wrote a binary despite the mismatch')
    })
})

Deno.test('install verifies, extracts, and caches a matching tarball', async () => {
    await withCache(async (cacheHome) => {
        const bytes = new TextEncoder().encode('a fake gitleaks tarball')
        const manifest: GitleaksManifest = {
            version: '9.9.9-ok',
            sha256: { linux_x64: await sha256Hex(bytes), darwin_arm64: 'x' },
        }
        let fetchCalls = 0
        let extractCalls = 0
        const options = {
            manifest,
            os: 'linux',
            arch: 'x86_64',
            env: envOf({ LOCKNESS_CACHE_HOME: cacheHome }),
            fetcher: (url: string) => {
                fetchCalls++
                assert(
                    url.includes('gitleaks_9.9.9-ok_linux_x64.tar.gz'),
                    url,
                )
                return Promise.resolve(bytes)
            },
            extract: async (_tarballPath: string, destDir: string) => {
                extractCalls++
                await Deno.writeTextFile(
                    join(destDir, 'gitleaks'),
                    '#!/bin/sh\n',
                )
            },
        }

        const first = await install(options)
        assertEquals(
            first,
            join(cacheHome, 'gitleaks', '9.9.9-ok', 'gitleaks'),
        )
        assertEquals(fetchCalls, 1)
        assertEquals(extractCalls, 1)
        assert(((await Deno.stat(first)).mode ?? 0) & 0o100, 'not executable')

        // Second install of the same pin is a cache hit: no re-download.
        const second = await install(options)
        assertEquals(second, first)
        assertEquals(fetchCalls, 1, 'redownloaded a cached, verified binary')
        assertEquals(extractCalls, 1, 're-extracted a cached, verified binary')
    })
})

Deno.test('install refuses an unsupported platform before any download', async () => {
    await withCache(async (cacheHome) => {
        let fetchCalls = 0
        await assertRejects(
            () =>
                install({
                    manifest: TEST_MANIFEST,
                    os: 'windows',
                    arch: 'x86_64',
                    env: envOf({ LOCKNESS_CACHE_HOME: cacheHome }),
                    fetcher: () => {
                        fetchCalls++
                        return Promise.resolve(new Uint8Array())
                    },
                }),
            Error,
            'unsupported platform',
        )
        assertEquals(
            fetchCalls,
            0,
            'downloaded despite an unsupported platform',
        )
    })
})
