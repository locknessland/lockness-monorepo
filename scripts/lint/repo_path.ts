/**
 * @fileoverview The repository-relative path every `scripts/lint/` plugin
 * scopes on. Matching on the absolute path lets the checkout's own location
 * decide what is linted: a clone under a directory named `tests` or
 * `packages` would switch a rule off, or on, everywhere.
 *
 * @module scripts/lint/repo_path
 */

import { fromFileUrl } from '@std/path'

/** The repository root, with forward slashes: this file is `scripts/lint/repo_path.ts`. */
export const REPO_ROOT: string = fromFileUrl(new URL('../../', import.meta.url))
    .replaceAll('\\', '/')

/**
 * `filename` relative to `root`, with forward slashes.
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @param root - The repository root.
 * @returns The relative path, or `undefined` when the file is not under
 *   `root`.
 *
 * @example
 * ```ts
 * repoPath('/src/app/packages/x/mod.ts', '/src/app') // 'packages/x/mod.ts'
 * ```
 */
export function repoPath(filename: string, root: string): string | undefined {
    const base = root.replaceAll('\\', '/').replace(/\/?$/, '/')
    const path = filename.replaceAll('\\', '/')
    return path.startsWith(base) ? path.slice(base.length) : undefined
}

/**
 * Whether a repository-relative path is test code: under a `tests/`
 * directory, or a `.test.ts(x)` / `_test.ts(x)` file.
 *
 * @param path - A path from {@link repoPath}.
 * @returns `true` for test code.
 */
export function isTestPath(path: string): boolean {
    if (/(^|\/)tests\//.test(path)) return true
    return /[._]test\.tsx?$/.test(path)
}
