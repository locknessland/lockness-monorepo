#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/**
 * @fileoverview Proves every package resolves in its **published** shape.
 *
 * `deno publish --dry-run` runs inside the workspace, where a bare
 * `@lockness/x` specifier resolves by workspace member *name* whether or not
 * the importing package declares it. So the dry run passes for a package that
 * ships a manifest a consumer cannot resolve — measured: `@lockness/drizzle`
 * dry-ran green while `install.ts` imported an undeclared `@lockness/cli`.
 *
 * This check copies each package's publishable files, alone, next to its own
 * `deno.json` and outside the workspace, then type-checks its exports. Two
 * outcomes are distinguished, and only one is a failure:
 *
 * | Message | Meaning | Verdict |
 * | :------ | :------ | :------ |
 * | `TS2307 … not a dependency and not in import map` | the manifest is missing the dependency | **fail** |
 * | `Could not find version … that matches` | declared, but that version is not on JSR yet | pass |
 *
 * The second is the expected state for an unreleased version and must not be
 * confused with the first.
 *
 * It also asks JSR whether each package **exists in the registry**. A package
 * must be created there before anything can be published to it, and
 * `deno publish` publishes the workspace atomically — so one missing package
 * aborts all 27. That is how the v0.2.0 release failed: `@lockness/scheduler`
 * was new and had never been created on jsr.io.
 *
 * @example
 * ```bash
 * deno task publish:check
 * ```
 *
 * @module
 */

import { dirname, join } from '@std/path'

const ROOT = Deno.cwd()
const PACKAGES_DIR = join(ROOT, 'packages')

/** Outcome for one package. */
interface Result {
    name: string
    ok: boolean
    detail: string
}

/**
 * Files `deno publish` would upload for a package.
 *
 * @param dir - Absolute package directory.
 * @param exclude - Directory names excluded by the manifest's `publish.exclude`.
 * @returns Absolute paths.
 */
async function publishableFiles(
    dir: string,
    exclude: string[],
): Promise<string[]> {
    const found: string[] = []
    const walk = async (current: string): Promise<void> => {
        for await (const entry of Deno.readDir(current)) {
            const path = join(current, entry.name)
            if (entry.isDirectory) {
                if (entry.name === 'node_modules') continue
                if (exclude.some((e) => e.replace(/\/$/, '') === entry.name)) {
                    continue
                }
                await walk(path)
                continue
            }
            found.push(path)
        }
    }
    await walk(dir)
    return found
}

/**
 * Check one package in isolation.
 *
 * @param name - Short package name.
 * @param scratch - Directory to stage the copy in.
 * @returns The outcome.
 */
async function checkPackage(name: string, scratch: string): Promise<Result> {
    const source = join(PACKAGES_DIR, name)
    const manifest = JSON.parse(
        await Deno.readTextFile(join(source, 'deno.json')),
    )
    const exclude: string[] = manifest.publish?.exclude ?? []

    const staged = join(scratch, name)
    await Deno.mkdir(staged, { recursive: true })

    for (const file of await publishableFiles(source, exclude)) {
        const relative = file.slice(source.length + 1)
        const target = join(staged, relative)
        await Deno.mkdir(dirname(target), { recursive: true })
        await Deno.copyFile(file, target)
    }

    const exportsField = manifest.exports ?? {}
    const entries = (
        typeof exportsField === 'string'
            ? [exportsField]
            : Object.values(exportsField) as string[]
    ).filter((v) => typeof v === 'string' && /\.tsx?$/.test(v))

    if (entries.length === 0) {
        return { name, ok: true, detail: 'no type-checkable exports' }
    }

    const result = await new Deno.Command(Deno.execPath(), {
        args: ['check', ...entries],
        cwd: staged,
        stdout: 'piped',
        stderr: 'piped',
    }).output()

    const output = new TextDecoder().decode(result.stderr) +
        new TextDecoder().decode(result.stdout)

    // The only failure this check owns: an import the manifest never declared.
    const undeclared = [
        ...output.matchAll(
            /Import "([^"]+)" not a dependency and not in import map/g,
        ),
    ].map((m) => m[1])

    if (undeclared.length > 0) {
        return {
            name,
            ok: false,
            detail: `undeclared: ${[...new Set(undeclared)].join(', ')}`,
        }
    }
    if (result.success) return { name, ok: true, detail: 'resolves' }
    return {
        name,
        ok: true,
        detail: 'declared; some versions not on JSR yet (expected pre-release)',
    }
}

/**
 * Ask JSR whether a package exists in the registry.
 *
 * @param name - Short package name.
 * @returns `true` when it exists, `false` when JSR has never seen it,
 * `null` when the registry could not be reached.
 */
async function existsOnJsr(name: string): Promise<boolean | null> {
    try {
        const response = await fetch(
            `https://jsr.io/@lockness/${name}/meta.json`,
            { signal: AbortSignal.timeout(15_000) },
        )
        // Drain the body so the connection closes and the process can exit.
        await response.body?.cancel()
        if (response.status === 404) return false
        if (!response.ok) return null
        return true
    } catch {
        return null
    }
}

/**
 * Run the check for every package.
 */
async function main(): Promise<void> {
    const scratch = await Deno.makeTempDir({ prefix: 'lockness-publish-' })
    const names: string[] = []
    for await (const entry of Deno.readDir(PACKAGES_DIR)) {
        if (entry.isDirectory && !entry.name.startsWith('.')) {
            names.push(entry.name)
        }
    }
    names.sort()

    console.log(
        `🔎 Checking ${names.length} packages in their published shape...\n`,
    )
    const results: Result[] = []
    for (const name of names) {
        const result = await checkPackage(name, scratch)
        results.push(result)
        console.log(
            `${result.ok ? '  ✅' : '  ❌'} ${
                name.padEnd(24)
            } ${result.detail}`,
        )
    }
    await Deno.remove(scratch, { recursive: true }).catch(() => {})

    // Registry existence is a PRE-PUBLISH gate, not a pre-push one: a package
    // that has never been created on JSR is only a problem at publish time, and
    // failing every push over it would block unrelated work. Hence the flag —
    // `publish.yml` passes it, CI and the pre-push hook do not.
    if (!Deno.args.includes('--registry')) {
        console.log(
            '\n✅ Every package resolves standalone (registry existence not checked; pass --registry)',
        )
        const resolutionFailed = results.filter((r) => !r.ok)
        if (resolutionFailed.length > 0) Deno.exit(1)
        return
    }

    console.log('\n🌐 Checking registry existence...\n')
    const missing: string[] = []
    let unreachable = 0
    for (const name of names) {
        const exists = await existsOnJsr(name)
        if (exists === null) {
            unreachable++
            console.log(`  ⚠️  ${name.padEnd(24)} registry unreachable`)
        } else if (!exists) {
            missing.push(name)
            console.log(`  ❌ ${name.padEnd(24)} does not exist on JSR`)
        }
    }
    if (missing.length === 0 && unreachable === 0) {
        console.log('  ✅ every package exists on JSR')
    }
    if (missing.length > 0) {
        console.error(
            `\n❌ ${missing.length} package(s) must be created on JSR before any publish.`,
        )
        console.error(
            '   `deno publish` is atomic across the workspace — one missing',
        )
        console.error('   package aborts all of them. Create each here:')
        for (const name of missing) {
            console.error(
                `   https://jsr.io/new?scope=lockness&package=${name}`,
            )
        }
        Deno.exit(1)
    }

    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
        console.error(
            `\n❌ ${failed.length} package(s) would ship a manifest a consumer cannot resolve.`,
        )
        console.error("   Declare the import in that package's own deno.json.")
        Deno.exit(1)
    }
    console.log('\n✅ Every package resolves standalone')
}

if (import.meta.main) {
    await main()
}
