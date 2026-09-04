/**
 * @fileoverview Translation-key extraction — scans source for `t('…')` /
 * `trans('…')` string-literal keys and diffs them against a catalog's keys.
 *
 * String literals only: a dynamic (non-literal) key is **reported as
 * un-extractable, never guessed**, and extracted content is **reported, never
 * evaluated** (security S2). The walk root is bounded to the given directory.
 *
 * @module @lockness/i18n/extract
 */

import { join } from '@std/path'

/** Matches `t('key')` / `trans("key")` with a single-quoted or double-quoted literal. */
const KEY_RE = /\b(?:t|trans)\(\s*(['"])([^'"]+)\1/g

/**
 * Extract string-literal translation keys from a source string.
 *
 * @param source - The source text.
 * @returns The set of literal keys found.
 */
export function extractKeys(source: string): Set<string> {
    const keys = new Set<string>()
    for (const match of source.matchAll(KEY_RE)) keys.add(match[2])
    return keys
}

/** Whether a call uses a dynamic (non-literal) key — reported, never guessed. */
const DYNAMIC_RE = /\b(?:t|trans)\(\s*[^'")\s]/

/**
 * Whether the source contains at least one dynamic `t(...)` key.
 *
 * @param source - The source text.
 * @returns `true` when a non-literal key call is present.
 */
export function hasDynamicKeys(source: string): boolean {
    return DYNAMIC_RE.test(source)
}

/**
 * Walk a directory (bounded to `root`, no symlink following) collecting literal
 * keys from `.ts`/`.tsx` files.
 *
 * @param root - The directory to walk (the walk never escapes it).
 * @returns The union of literal keys found.
 */
export async function walkKeys(root: string): Promise<Set<string>> {
    const keys = new Set<string>()
    const visit = async (dir: string) => {
        for await (const entry of Deno.readDir(dir)) {
            const path = join(dir, entry.name)
            // Do not follow symlinks — a symlink could point outside `root`.
            if (entry.isSymlink) continue
            if (entry.isDirectory) {
                await visit(path)
            } else if (/\.tsx?$/.test(entry.name)) {
                const source = await Deno.readTextFile(path)
                for (const k of extractKeys(source)) keys.add(k)
            }
        }
    }
    await visit(root)
    return keys
}

/** The result of diffing used keys against a catalog's keys. */
export interface KeyDiff {
    /** Keys used in source but absent from the catalog. */
    missing: string[]
    /** Keys present in the catalog but never used in source. */
    unused: string[]
}

/**
 * Diff used keys against catalog keys.
 *
 * @param used - Keys found in source.
 * @param catalog - Keys present in a catalog.
 * @returns The missing + unused sets, sorted.
 */
export function diffKeys(
    used: Set<string>,
    catalog: Set<string>,
): KeyDiff {
    const missing = [...used].filter((k) => !catalog.has(k)).sort()
    const unused = [...catalog].filter((k) => !used.has(k)).sort()
    return { missing, unused }
}
