#!/usr/bin/env -S deno run --no-prompt --allow-read=. --allow-write=_npm
/**
 * @fileoverview `npm:build`'s second step: stage each published npm package
 * under the gitignored `_npm/` root (plan 274 §5, "Published npm manifest").
 *
 * For every package in the npm scope ({@link npmScope}: non-private, `engines`
 * names bun or node) it writes `_npm/<dir>/package.json` — the field allowlist
 * {@link publishedManifest} maps — and copies the package's `files` entries
 * beside it, plus its `README*` and `LICENSE*`, which `npm pack` of a source
 * directory always includes. A package with no licence file of its own gets
 * the root `LICENSE`. That directory is what `npm pack` reads, in `scripts/npm_check.ts`
 * now and in `scripts/npm_publish.ts` in P5. Nothing packs the source
 * directory, and no prepack script exists.
 *
 * tsc's output is copied unchanged: no file's content is rewritten. Only
 * `*.tsbuildinfo`, tsc's incremental state rather than emit, is left out.
 *
 * The staging root is cleared first, so a package that left the scope leaves
 * no stale directory behind. Run it through `deno task npm:build`, after the
 * sandboxed `tsc -b`; it reads `.` and writes `_npm/` only.
 *
 * The script uses `node:` built-ins only (FR-016).
 *
 * @example
 * ```bash
 * deno task npm:build
 * ```
 *
 * @module
 */

import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
    type Member,
    NPM_STAGING_ROOT,
    npmScope,
    publishedManifest,
    readMembers,
    stagingDirOf,
} from './manifests.ts'

/** A file npm packs from a package root whatever `files` says: a README. */
export const README_FILE = /^readme(\.[^/]*)?$/i

/** A file npm packs from a package root whatever `files` says: a licence. */
export const LICENSE_FILE = /^licen[cs]e(\.[^/]*)?$/i

/**
 * The README and licence files to stage for a package: its own, and the root
 * licence when it has none.
 *
 * @param root - The workspace root.
 * @param dir - The package directory, relative to the root.
 * @returns Absolute sources and the name each is staged under, sorted.
 */
async function alwaysPacked(
    root: string,
    dir: string,
): Promise<{ from: string; name: string }[]> {
    const own = (await readdir(join(root, dir))).sort()
    const picked = own
        .filter((name) => README_FILE.test(name) || LICENSE_FILE.test(name))
        .map((name) => ({ from: join(root, dir, name), name }))
    if (!own.some((name) => LICENSE_FILE.test(name))) {
        for (const name of (await readdir(root)).sort()) {
            if (LICENSE_FILE.test(name)) {
                picked.push({ from: join(root, name), name })
            }
        }
    }
    return picked
}

/**
 * Copy a file or a directory tree into the staging directory, as it is,
 * leaving out tsc's `*.tsbuildinfo`.
 *
 * @param from - The source path.
 * @param to - The destination path.
 * @returns The number of files written.
 */
async function copyEntry(from: string, to: string): Promise<number> {
    const info = await stat(from)
    if (info.isDirectory()) {
        let written = 0
        await mkdir(to, { recursive: true })
        const names = (await readdir(from)).sort()
        for (const name of names) {
            written += await copyEntry(join(from, name), join(to, name))
        }
        return written
    }
    if (from.endsWith('.tsbuildinfo')) return 0
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
    return 1
}

/**
 * Stage one package: its published manifest, its `files` entries, its README
 * and its licence (the root one when it has none).
 *
 * @param root - The workspace root.
 * @param member - A member in the npm scope.
 * @returns The number of files staged, the manifest included.
 * @throws {Error} When the package has no `files` allowlist, or an entry is
 *   missing — the build did not run, or emitted elsewhere.
 */
export async function stagePackage(
    root: string,
    member: Member,
): Promise<number> {
    const label = member.pkg.name ?? member.dir
    const files = member.pkg.files ?? []
    if (files.length === 0) {
        throw new Error(
            `${label}: package.json has no "files" allowlist; npm would pack everything`,
        )
    }
    const target = join(root, stagingDirOf(member))
    await mkdir(target, { recursive: true })
    await writeFile(
        join(target, 'package.json'),
        JSON.stringify(publishedManifest(member.pkg), null, 4) + '\n',
    )
    let written = 1
    for (const entry of files) {
        const from = join(root, member.dir, entry)
        try {
            await stat(from)
        } catch (error) {
            throw new Error(
                `${label}: "files" entry ${entry} does not exist (${
                    (error as Error).message
                }); run the tsc step of \`deno task npm:build\``,
            )
        }
        written += await copyEntry(from, join(target, entry))
    }
    for (const { from, name } of await alwaysPacked(root, member.dir)) {
        written += await copyEntry(from, join(target, name))
    }
    return written
}

/**
 * Clear the staging root and stage every package in the npm scope.
 *
 * @param root - The workspace root.
 * @returns One line per staged package, for the log.
 * @throws {Error} See {@link stagePackage}.
 *
 * @example
 * ```ts
 * await stageAll('.')   // ['@lockness/transform → _npm/transform (14 files)']
 * ```
 */
export async function stageAll(root: string): Promise<string[]> {
    await rm(join(root, NPM_STAGING_ROOT), { recursive: true, force: true })
    const lines: string[] = []
    for (const member of npmScope(await readMembers(root))) {
        const count = await stagePackage(root, member)
        lines.push(
            `${member.pkg.name} → ${stagingDirOf(member)} (${count} files)`,
        )
    }
    return lines
}

/**
 * Stage, and decide the exit code.
 *
 * @param root - The workspace root.
 * @returns `0` when staged, `1` on a staging fault.
 *
 * @example
 * ```ts
 * process.exitCode = await main()
 * ```
 */
export async function main(
    root: string = fileURLToPath(new URL('..', import.meta.url)),
): Promise<number> {
    try {
        const lines = await stageAll(root)
        for (const line of lines) console.log(`   staged ${line}`)
        console.log(
            lines.length === 0
                ? '✅ npm:stage: no package names bun or node; nothing staged'
                : `✅ npm:stage: ${lines.length} package(s) staged`,
        )
        return 0
    } catch (error) {
        console.error(`❌ npm:stage: ${(error as Error).message}`)
        return 1
    }
}

if (import.meta.main) {
    process.exitCode = await main()
}
