/**
 * @fileoverview The path-containment check the `make:*` scaffolders share
 * (#579): a name the user types must never write outside its directory.
 *
 * For Lockness packages only — on `@lockness/contract/fs/internal`, never the
 * package root, which `@lockness/core` re-exports to every app (#564 policy:
 * a helper shared between sibling packages goes on an `/internal` subpath).
 *
 * @module @lockness/contract/fs/internal
 */

import { isAbsolute, relative } from 'node:path'

/**
 * Whether `target` resolves to a path strictly inside `root`.
 *
 * Lexical: both paths are resolved against the working directory, symlinks
 * are not followed. `root` itself is not inside `root`.
 *
 * @param root - The directory a write must stay in.
 * @param target - The path about to be written.
 * @returns `true` when `target` is below `root`.
 *
 * @example
 * ```ts
 * isContained('./app/mail', './app/mail/Welcome.ts') // true
 * isContained('./app/mail', './app/mail/../../etc/x') // false
 * ```
 */
export function isContained(root: string, target: string): boolean {
    const rel = relative(root, target)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}
