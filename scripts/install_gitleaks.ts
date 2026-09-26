#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Download, checksum-verify, and cache the pinned gitleaks
 * binary (`scripts/gitleaks_manifest.json`) for the current OS/arch, printing
 * its path on success.
 *
 * Two readers share `gitleaks_manifest.json`: this file (`with { type: 'json'
 * }`, for the local pre-push hook via `scripts/prepush_secret_scan.ts`) and
 * `.github/workflows/secret-scan.yml` (`jq`, so the CI job needs no Deno
 * setup — see that workflow's own cross-pointing comment). Bump the version
 * only in the JSON.
 *
 * The `linux_x64` hash was already pinned as a literal in `secret-scan.yml`
 * before this manifest existed; it is carried over unchanged. `darwin_arm64`,
 * `darwin_x64` and `linux_arm64` were copied from the official
 * `gitleaks_8.30.1_checksums.txt` published beside the release,
 * https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1 — never computed
 * locally, and never re-read from that checksums file at verify time
 * (re-reading it would defeat the pin: a tampered tarball ships a tampered
 * checksums file with it). The hash actually checked against a downloaded
 * tarball is always the literal in the JSON.
 *
 * Fails closed: an unsupported platform, a download failure, or a checksum
 * mismatch all throw (and, run as a script, exit non-zero) — never falling
 * back to an unverified binary.
 *
 * The verified binary is cached under `~/.cache/lockness/gitleaks/<version>/`
 * (overridable via `LOCKNESS_CACHE_HOME`, used by this file's tests), keyed by
 * version, in a directory created `0o700` (owner-only). A cache hit is not a
 * bare `stat`: the cached binary is re-hashed against a sidecar recording the
 * hash observed right after it was verified, on every call. A binary that
 * does not match that sidecar (tampered, or a sidecar-less cache from before
 * this check existed) is discarded and re-installed rather than trusted.
 *
 * @module
 */

import { join } from '@std/path'
import manifestJson from './gitleaks_manifest.json' with { type: 'json' }

/** One pinned gitleaks release: its version and its per-platform tarball sha256. */
export interface GitleaksManifest {
    /** The gitleaks release version, without the leading `v`. */
    version: string
    /**
     * sha256 (lowercase hex) of `gitleaks_<version>_<platform>.tar.gz`, keyed
     * by `<os>_<arch>` as produced by {@link platformKey}. Only the platforms
     * below are pinned; any other platform is refused rather than installed
     * unverified.
     */
    sha256: {
        linux_x64: string
        darwin_arm64: string
        darwin_x64?: string
        linux_arm64?: string
    }
}

/** The pinned gitleaks release, read from `scripts/gitleaks_manifest.json`. */
export const GITLEAKS_MANIFEST: GitleaksManifest =
    manifestJson as GitleaksManifest

/**
 * Map a Deno build target to the manifest's platform key.
 *
 * @param os - `Deno.build.os` (e.g. `'linux'`, `'darwin'`).
 * @param arch - `Deno.build.arch` (e.g. `'x86_64'`, `'aarch64'`).
 * @returns The manifest key, e.g. `'linux_x64'`.
 * @throws {Error} When the OS/arch pair has no pinned hash — refused rather
 *   than silently falling back to some other platform's binary.
 * @example
 * ```ts
 * platformKey('linux', 'x86_64')     // 'linux_x64'
 * platformKey('darwin', 'aarch64')   // 'darwin_arm64'
 * ```
 */
export function platformKey(os: string, arch: string): string {
    const osKey = os === 'darwin' ? 'darwin' : os === 'linux' ? 'linux' : null
    const archKey = arch === 'x86_64'
        ? 'x64'
        : arch === 'aarch64'
        ? 'arm64'
        : null
    if (osKey === null || archKey === null) {
        throw new Error(
            `unsupported platform for gitleaks: os=${os} arch=${arch}`,
        )
    }
    return `${osKey}_${archKey}`
}

/**
 * Look up the pinned sha256 for a platform key.
 *
 * @param manifest - The manifest to read.
 * @param key - A key returned by {@link platformKey}.
 * @returns The pinned lowercase hex sha256.
 * @throws {Error} When `key` has no pinned hash in `manifest` — an unpinned
 *   platform is refused, not trusted unverified.
 */
export function pinnedSha256(manifest: GitleaksManifest, key: string): string {
    const value = (manifest.sha256 as Record<string, string | undefined>)[key]
    if (!value) {
        throw new Error(
            `no pinned sha256 for platform '${key}' in the gitleaks manifest`,
        )
    }
    return value
}

/**
 * Hex-encode the sha256 digest of a byte array.
 *
 * @param bytes - The bytes to hash (a downloaded tarball or cached binary).
 * @returns The lowercase hex sha256.
 * @example
 * ```ts
 * await sha256Hex(new TextEncoder().encode('abc'))
 * // 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
 * ```
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new Uint8Array(bytes).buffer as ArrayBuffer,
    )
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

/** The minimum environment reader this file needs (matches `Deno.env`). */
export interface EnvReader {
    get(key: string): string | undefined
}

/**
 * Resolve the cache directory for one pinned version, outside the repository.
 *
 * `LOCKNESS_CACHE_HOME` overrides the base directory — used by this file's
 * own tests to avoid touching a real home directory; it names no real
 * machine path and is not required for normal use.
 *
 * @param version - The pinned gitleaks version.
 * @param env - Read for `LOCKNESS_CACHE_HOME` and `HOME`. Defaults to
 *   `Deno.env`.
 * @returns The absolute cache directory for that version.
 * @throws {Error} When neither override is set and `HOME` is unset.
 */
export function cacheDir(version: string, env: EnvReader = Deno.env): string {
    const override = env.get('LOCKNESS_CACHE_HOME')
    if (override) return join(override, 'gitleaks', version)
    const home = env.get('HOME')
    if (!home) {
        throw new Error(
            'HOME is not set; cannot resolve a cache directory for gitleaks',
        )
    }
    return join(home, '.cache', 'lockness', 'gitleaks', version)
}

/** The sidecar file recording the hash observed right after a binary was verified. */
function sidecarPath(binPath: string): string {
    return `${binPath}.sha256`
}

/**
 * Whether a file has at least one executable bit set.
 *
 * @param path - The file to check.
 * @returns `true` when the file exists and is executable by someone.
 */
async function isExecutable(path: string): Promise<boolean> {
    const stat = await Deno.stat(path).catch(() => null)
    if (!stat) return false
    return ((stat.mode ?? 0) & 0o111) !== 0
}

/**
 * Read the sidecar hash recorded for a cached binary, if any.
 *
 * @param binPath - The cached binary's path.
 * @returns The recorded lowercase hex sha256, or `null` if there is none.
 */
async function readRecordedHash(binPath: string): Promise<string | null> {
    return await Deno.readTextFile(sidecarPath(binPath))
        .then((text) => text.trim() || null, () => null)
}

/**
 * Record the hash of a freshly verified, freshly extracted binary, so the
 * next call can detect tampering rather than trusting a bare `stat`.
 *
 * @param binPath - The binary's path.
 * @param hash - Its current sha256.
 */
async function recordHash(binPath: string, hash: string): Promise<void> {
    await Deno.writeTextFile(sidecarPath(binPath), `${hash}\n`)
}

/**
 * Discard a cache entry that failed its integrity check — both the binary
 * and its sidecar, so a stale sidecar cannot mask a future tamper.
 *
 * @param binPath - The binary's path.
 */
async function discardCacheEntry(binPath: string): Promise<void> {
    await Deno.remove(binPath).catch(() => {})
    await Deno.remove(sidecarPath(binPath)).catch(() => {})
}

/**
 * Whether the file at `binPath` is a trustworthy cache hit: present, matching
 * its recorded sha256, and executable. Re-hashes the file every call — a
 * `stat` alone cannot see a byte-for-byte tamper of an otherwise
 * present, executable file.
 *
 * @param binPath - The cached binary's path.
 * @returns `true` only when every check passes.
 */
async function isValidCacheHit(binPath: string): Promise<boolean> {
    const bytes = await Deno.readFile(binPath).catch(() => null)
    if (!bytes) return false
    const recorded = await readRecordedHash(binPath)
    if (recorded === null) return false
    const current = await sha256Hex(bytes)
    if (current !== recorded) return false
    return await isExecutable(binPath)
}

/** A download function: given a URL, returns the response bytes. */
export type Fetcher = (url: string) => Promise<Uint8Array>

/**
 * The default {@link Fetcher}: a real HTTP GET.
 *
 * @param url - The tarball URL.
 * @returns The response bytes.
 * @throws {Error} On a non-2xx response.
 */
export async function httpFetch(url: string): Promise<Uint8Array> {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(
            `download failed: ${response.status} ${response.statusText} (${url})`,
        )
    }
    return new Uint8Array(await response.arrayBuffer())
}

/**
 * Extract the `gitleaks` binary from a downloaded tarball into `destDir`.
 *
 * @param tarballPath - Path of the (already checksum-verified) tarball.
 * @param destDir - Directory to extract `gitleaks` into.
 * @throws {Error} When `tar` fails.
 */
async function defaultExtract(
    tarballPath: string,
    destDir: string,
): Promise<void> {
    const run = await new Deno.Command('tar', {
        args: ['-xzf', tarballPath, '-C', destDir, 'gitleaks'],
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    if (!run.success) {
        throw new Error(
            `tar extraction failed: ${new TextDecoder().decode(run.stderr)}`,
        )
    }
}

/** Injection points for {@link install}; every field defaults to the real thing. */
export interface InstallOptions {
    /** Defaults to {@link GITLEAKS_MANIFEST}. */
    manifest?: GitleaksManifest
    /** Defaults to `Deno.build.os`. */
    os?: string
    /** Defaults to `Deno.build.arch`. */
    arch?: string
    /** Defaults to `Deno.env`. */
    env?: EnvReader
    /** Defaults to {@link httpFetch}. */
    fetcher?: Fetcher
    /** Defaults to a real `tar -xzf`. */
    extract?: (tarballPath: string, destDir: string) => Promise<void>
}

/**
 * Download (or reuse a cached), checksum-verify, and install the pinned
 * gitleaks binary.
 *
 * @param options - Injection points for tests.
 * @returns The absolute path of the verified, executable `gitleaks` binary.
 * @throws {Error} On an unsupported platform, a download failure, a checksum
 *   mismatch, or a binary that is not executable after installation. Never
 *   returns a path to an unverified or non-executable binary.
 * @example
 * ```ts
 * const gitleaks = await install()
 * console.log(gitleaks) // '/home/user/.cache/lockness/gitleaks/8.30.1/gitleaks'
 * ```
 */
export async function install(options: InstallOptions = {}): Promise<string> {
    const manifest = options.manifest ?? GITLEAKS_MANIFEST
    const os = options.os ?? Deno.build.os
    const arch = options.arch ?? Deno.build.arch
    const env = options.env ?? Deno.env
    const fetcher = options.fetcher ?? httpFetch
    const extract = options.extract ?? defaultExtract

    const key = platformKey(os, arch)
    const expected = pinnedSha256(manifest, key)
    const dir = cacheDir(manifest.version, env)
    const binPath = join(dir, 'gitleaks')

    if (await isValidCacheHit(binPath)) return binPath
    // Present but invalid (tampered, unrecorded, or not executable): don't
    // trust it — discard and fall through to a fresh, verified install.
    await discardCacheEntry(binPath)

    const tarballName = `gitleaks_${manifest.version}_${key}.tar.gz`
    const url =
        `https://github.com/gitleaks/gitleaks/releases/download/v${manifest.version}/${tarballName}`
    const bytes = await fetcher(url)

    const actual = await sha256Hex(bytes)
    if (actual !== expected) {
        throw new Error(
            `sha256 mismatch for ${tarballName}: expected ${expected}, got ` +
                `${actual}. Refusing to install an unverified binary.`,
        )
    }

    await Deno.mkdir(dir, { recursive: true, mode: 0o700 })
    const tmpTarball = await Deno.makeTempFile({ suffix: '.tar.gz' })
    try {
        await Deno.writeFile(tmpTarball, bytes)
        await extract(tmpTarball, dir)
    } finally {
        await Deno.remove(tmpTarball).catch(() => {})
    }
    await Deno.chmod(binPath, 0o755)

    const installedBytes = await Deno.readFile(binPath)
    await recordHash(binPath, await sha256Hex(installedBytes))

    if (!(await isExecutable(binPath))) {
        throw new Error(
            `installed gitleaks binary at ${binPath} is not executable`,
        )
    }
    return binPath
}

if (import.meta.main) {
    try {
        const path = await install()
        console.log(path)
    } catch (error) {
        console.error(
            `gitleaks install failed: ${(error as Error).message}`,
        )
        Deno.exit(1)
    }
}
