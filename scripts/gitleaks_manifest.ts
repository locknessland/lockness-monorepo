/**
 * @fileoverview The single pin for the gitleaks release consumed by
 * `.github/workflows/secret-scan.yml` (CI) and by `scripts/install_gitleaks.ts`
 * (the local pre-push hook, via `scripts/prepush_secret_scan.ts`). A version
 * bump touches exactly this file plus the hashes below — never the workflow
 * or the installer, which both read from here.
 *
 * The `linux_x64` hash was already pinned as a literal in
 * `secret-scan.yml` before this manifest existed; it is carried over
 * unchanged. `darwin_arm64`, `darwin_x64` and `linux_arm64` were copied from
 * the official `gitleaks_8.30.1_checksums.txt` published beside the
 * release, https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1 — never
 * computed locally, and never re-read from that checksums file at verify
 * time. Re-reading it at verify time would defeat the pin: a tampered
 * tarball ships a tampered checksums file with it. The hash actually checked
 * against a downloaded tarball is always the literal below.
 *
 * @module
 */

/** One pinned gitleaks release: its version and its per-platform tarball sha256. */
export interface GitleaksManifest {
    /** The gitleaks release version, without the leading `v`. */
    version: string
    /**
     * sha256 (lowercase hex) of `gitleaks_<version>_<platform>.tar.gz`, keyed
     * by `<os>_<arch>` as produced by {@link platformKey} in
     * `scripts/install_gitleaks.ts`. Only the platforms below are pinned;
     * any other platform is refused rather than installed unverified.
     */
    sha256: {
        linux_x64: string
        darwin_arm64: string
        darwin_x64?: string
        linux_arm64?: string
    }
}

/**
 * The pinned gitleaks release. Bump the version and every hash together —
 * a version bump with a stale hash is a checksum mismatch, not a silent
 * upgrade.
 */
export const GITLEAKS_MANIFEST: GitleaksManifest = {
    version: '8.30.1',
    sha256: {
        linux_x64:
            '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
        darwin_arm64:
            'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
        darwin_x64:
            'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
        linux_arm64:
            'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
    },
}
