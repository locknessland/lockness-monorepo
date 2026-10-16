#!/usr/bin/env -S deno run --no-prompt --allow-read=. --allow-write=_npm
/**
 * @fileoverview `npm:build`'s second step: stage each published npm package
 * under the gitignored `_npm/` root (plan 274 §5, "Published npm manifest").
 *
 * For every package in the npm scope ({@link npmScope}: non-private, `engines`
 * names bun or node) it writes `_npm/<dir>/package.json` — the field allowlist
 * {@link publishedManifest} maps — and copies the package's `files` entries
 * beside it. That directory is what `npm pack` reads, in `scripts/npm_check.ts`
 * now and in `scripts/npm_publish.ts` in P5. Nothing packs the source
 * directory, and no prepack script exists.
 *
 * Two things are adjusted while copying, both about tsc's output and nothing
 * else:
 *
 * - `*.tsbuildinfo` is tsc's incremental state, not emit: it is not staged.
 * - tsc rewrites relative `.ts` specifiers to `.js` in JavaScript
 *   (`rewriteRelativeImportExtensions`) but leaves them as written in `.d.ts`
 *   output (measured on TypeScript 6.0.3). A staged `.d.ts` gets the same
 *   rewrite, so declarations carry `.js` specifiers as the plan's compiler
 *   options row requires, and resolve for any TypeScript consumer.
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

import {
    copyFile,
    mkdir,
    readdir,
    readFile,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises'
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

/** A relative specifier ending in a TypeScript source extension, quoted. */
const RELATIVE_TS_SPECIFIER =
    /((?:\bfrom|\bimport)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]*?)\.(ts|tsx|mts|cts)\2/g

/** The JavaScript extension each TypeScript source extension emits. */
const EMITTED: Record<string, string> = {
    ts: 'js',
    tsx: 'js',
    mts: 'mjs',
    cts: 'cjs',
}

/**
 * Rewrite a declaration file's relative `.ts` specifiers to the `.js` files
 * tsc emitted beside it. Bare and `node:` specifiers, and `.d.ts` targets,
 * are left alone.
 *
 * @param text - A `.d.ts` file emitted by tsc.
 * @returns The text with every relative `.ts`/`.tsx`/`.mts`/`.cts` specifier
 *   of an `import`, `export … from` or `import()` rewritten.
 *
 * @example
 * ```ts
 * rewriteDeclarationSpecifiers("export { a } from './a.ts';")
 * // "export { a } from './a.js';"
 * ```
 */
export function rewriteDeclarationSpecifiers(text: string): string {
    return text.replace(
        RELATIVE_TS_SPECIFIER,
        (match, lead: string, quote: string, base: string, ext: string) =>
            base.endsWith('.d')
                ? match
                : `${lead}${quote}${base}.${EMITTED[ext]}${quote}`,
    )
}

/**
 * Copy a file or a directory tree into the staging directory, applying the
 * two adjustments named in the module doc.
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
    if (from.endsWith('.d.ts')) {
        const text = await readFile(from, 'utf8')
        await writeFile(to, rewriteDeclarationSpecifiers(text))
    } else {
        await copyFile(from, to)
    }
    return 1
}

/**
 * Stage one package: its published manifest and its `files` entries.
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
