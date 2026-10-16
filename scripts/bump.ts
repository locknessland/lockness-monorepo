#!/usr/bin/env -S deno run -A
/**
 * @fileoverview The lockstep version bump for the Lockness monorepo — the one
 * behind `deno task bump` (plan §5, "Lockstep bump").
 *
 * Every workspace member moves to the same version on every release. The bump
 * works on the **source** manifests, then regenerates everything derived from
 * them, in this order:
 *
 * 1. every member's `package.json` (the root `package.json` `workspaces`
 *    list): its `version`, when it has one, and every `@lockness/*` range in
 *    `dependencies`, `peerDependencies` and `devDependencies`, keeping the
 *    range's `^` / `~` prefix. A member with no `version` (the vite demo) gets
 *    none, but its ranges still move: a range left naming the previous version
 *    makes Deno resolve that sibling from the registry instead of the
 *    workspace;
 * 2. the root `deno.jsonc`: its `version` — what
 *    `.specnaut/scripts/release/tag.sh` reads to name the tag (#324) — and its
 *    `@lockness/*` imports, edited through `@david/jsonc-morph` so every
 *    comment survives byte-for-byte;
 * 3. the generated manifests, through `scripts/manifests.ts` (each member's
 *    `deno.json` and own-version module);
 * 4. `deno.lock`, through `scripts/lockfile.ts` (`deno install`): it records
 *    each member's ranges, and a release commit without the refresh cannot be
 *    published (#429).
 *
 * Steps 1 to 3 are computed in memory first: a manifest the generator refuses
 * stops the bump before any file is written, never half-way through.
 *
 * It replaced two tools (#591): `bump-native.ts`, a wrapper over Deno's
 * `deno bump-version`, which rewrites `deno.json` files that are now
 * generated; and the legacy hand-rolled bump. No stub carries a version pin —
 * the scaffolder writes `{{ locknessVersion }}` from `@lockness/init`'s own
 * version module — so no stub is rewritten.
 *
 * `--dry-run` writes nothing and says what would change.
 *
 * @module scripts/bump
 *
 * @example
 * ```bash
 * deno task bump --patch            # 0.4.0 -> 0.4.1, every member
 * deno task bump minor              # 0.4.0 -> 0.5.0
 * deno task bump 0.9.0              # any jump
 * deno task bump --patch --dry-run
 * ```
 */

import { parse as parseJsoncCst } from '@david/jsonc-morph'
import { parse } from '@std/jsonc'
import { parseArgs } from '@std/cli/parse-args'
import * as semver from '@std/semver'
import { refreshLockfile } from './lockfile.ts'
import {
    type GeneratedFile,
    type Member,
    type PackageManifest,
    planFiles,
    readWorkspaceMembers,
    writeFiles,
} from './manifests.ts'

/** Path to the root configuration file, which carries the release version. */
const ROOT_CONFIG_PATH = './deno.jsonc' as const

/**
 * A JSR Lockness specifier with its version. Group 4 captures an optional
 * subpath export (e.g. `/jsx-runtime`) so the bump preserves it instead of
 * collapsing `@lockness/hono/jsx-runtime` onto the base export (#162).
 */
export const VERSION_EXTRACT_PATTERN =
    /(jsr:@lockness\/[^@]+)@([\^~])([\d.]+)(\/[^"'\s]*)?/

/** A plain `X.Y.Z` version, no prerelease or build metadata. */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

/** A `package.json` range the bump rewrites: an optional `^`/`~` and `X.Y.Z`. */
const RANGE_PATTERN = /^([\^~]?)\d+\.\d+\.\d+$/

/** The increments the bump accepts as a flag or a bare keyword. */
const INCREMENTS = ['major', 'minor', 'patch'] as const

/** The dependency fields whose `@lockness/*` ranges move in lockstep. */
const DEPENDENCY_FIELDS = [
    'dependencies',
    'peerDependencies',
    'devDependencies',
] as const

/**
 * Extract the message from an unknown thrown value.
 *
 * @param error - The thrown value.
 * @returns Its message, or its string form.
 */
export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/**
 * Whether an import-map entry is a Lockness package.
 *
 * @param key - The import key.
 * @param value - The import value.
 * @returns `true` when the key or the value names `@lockness/`.
 */
export function isLocknessImport(key: string, value: unknown): value is string {
    return (
        typeof value === 'string' &&
        (key.startsWith('@lockness/') || value.includes('jsr:@lockness/'))
    )
}

/**
 * Set the version of a `jsr:@lockness/*` specifier, keeping its prefix and
 * subpath.
 *
 * @param importValue - e.g. `jsr:@lockness/hono@^0.4.0/jsx-runtime`.
 * @param newVersion - The version to write.
 * @returns The rewritten specifier, or `null` when it is not one.
 *
 * @example
 * ```ts
 * updateImportVersion('jsr:@lockness/core@^0.4.0', '0.5.0') // 'jsr:@lockness/core@^0.5.0'
 * ```
 */
export function updateImportVersion(
    importValue: string,
    newVersion: string,
): string | null {
    const match = importValue.match(VERSION_EXTRACT_PATTERN)
    if (!match) return null
    const [, packagePath, versionPrefix, , subpath] = match
    return `${packagePath}@${versionPrefix}${newVersion}${subpath ?? ''}`
}

/**
 * Rewrite the root `deno.jsonc` text: its `version` and every `@lockness/*`
 * import value, leaving every comment, blank line and other token intact.
 *
 * @param text - The raw JSONC source.
 * @param newVersion - The version to write.
 * @returns The rewritten source.
 * @throws {Error} If the JSONC is malformed or has no `version` key.
 *
 * @example
 * ```ts
 * updateRootJsonc('{ "version": "0.4.0" }', '0.5.0') // '{ "version": "0.5.0" }'
 * ```
 */
export function updateRootJsonc(text: string, newVersion: string): string {
    const root = parseJsoncCst(text)
    const obj = root.asObjectOrThrow()
    obj.getOrThrow('version').setValue(newVersion)

    const importsProp = obj.get('imports')
    if (importsProp) {
        const importsObj = importsProp.valueIfObjectOrThrow()
        for (const prop of importsObj.properties()) {
            const key = prop.nameOrThrow().decodedValue()
            const valNode = prop.value()
            if (!valNode || !valNode.isString()) continue
            const strLit = valNode.asStringLitOrThrow()
            const current = strLit.decodedValue()
            if (!isLocknessImport(key, current)) continue
            const updated = updateImportVersion(current, newVersion)
            if (updated && updated !== current) {
                // setRawValue expects the raw JSON token including quotes
                strLit.setRawValue(`"${updated}"`)
            }
        }
    }
    return root.toString()
}

/**
 * A member's `package.json` at a new lockstep version.
 *
 * @param pkg - The manifest; not mutated.
 * @param version - The new version.
 * @returns A copy with its `version` (only when it has one) and every
 *   `@lockness/*` range moved, each range keeping its `^` / `~` prefix.
 *
 * @example
 * ```ts
 * bumpPackageManifest({ version: '0.4.0', dependencies: { '@lockness/a': '^0.4.0' } }, '0.5.0')
 * // { version: '0.5.0', dependencies: { '@lockness/a': '^0.5.0' } }
 * ```
 */
export function bumpPackageManifest(
    pkg: PackageManifest,
    version: string,
): PackageManifest {
    const bumped: PackageManifest = structuredClone(pkg)
    if (typeof bumped.version === 'string') bumped.version = version
    for (const field of DEPENDENCY_FIELDS) {
        const deps = bumped[field]
        if (deps === undefined) continue
        for (const [name, range] of Object.entries(deps)) {
            const match = RANGE_PATTERN.exec(range)
            if (!name.startsWith('@lockness/') || match === null) continue
            deps[name] = `${match[1]}${version}`
        }
    }
    return bumped
}

/** The parsed bump request. */
export interface BumpRequest {
    /** `--major`. */
    major?: boolean
    /** `--minor`. */
    minor?: boolean
    /** `--patch`. */
    patch?: boolean
    /** A bare `major` / `minor` / `patch`, or an absolute `X.Y.Z`. */
    positional?: string
}

/**
 * The version a bump request lands on.
 *
 * @param request - Flags and the positional argument.
 * @param current - The current version.
 * @returns The target version.
 * @throws {Error} When the request names no bump, or an absolute version is
 *   not `X.Y.Z`.
 *
 * @example
 * ```ts
 * resolveTargetVersion({ patch: true }, '0.4.0')          // '0.4.1'
 * resolveTargetVersion({ positional: '0.9.0' }, '0.4.0')  // '0.9.0'
 * ```
 */
export function resolveTargetVersion(
    request: BumpRequest,
    current: string,
): string {
    const flag = INCREMENTS.find((kind) => request[kind] === true)
    const keyword = INCREMENTS.find((kind) => request.positional === kind)
    const increment = flag ?? keyword
    if (increment !== undefined) {
        return semver.format(semver.increment(semver.parse(current), increment))
    }
    if (request.positional === undefined) {
        throw new Error(
            'Usage: deno task bump <--major|--minor|--patch | major|minor|patch | X.Y.Z> [--dry-run]',
        )
    }
    if (!SEMVER_PATTERN.test(request.positional)) {
        throw new Error(
            `"${request.positional}" is not a version: use the form X.Y.Z`,
        )
    }
    return request.positional
}

/**
 * Read the current release version from the root `deno.jsonc`.
 *
 * @returns The version.
 * @throws {Error} If the file cannot be read or has no string `version`.
 */
async function readCurrentVersion(): Promise<string> {
    const config = parse(await Deno.readTextFile(ROOT_CONFIG_PATH))
    const version = typeof config === 'object' && config !== null
        ? (config as { version?: unknown }).version
        : undefined
    if (typeof version !== 'string') {
        throw new Error(`${ROOT_CONFIG_PATH} has no string "version" field`)
    }
    return version
}

/** One file the bump rewrites, with its content before and after. */
interface Rewrite {
    /** Path relative to the root. */
    path: string
    /** Current content. */
    before: string
    /** Content at the new version. */
    after: string
}

/** Everything a bump writes, computed before anything is written. */
interface BumpPlan {
    /** Every member's `package.json` whose content changes. */
    sources: Rewrite[]
    /** The root `deno.jsonc`. */
    root: Rewrite
    /** Every generated file, from the bumped manifests. */
    generated: GeneratedFile[]
}

/**
 * Compute the whole bump in memory: every bumped `package.json`, the root
 * `deno.jsonc`, and every file generated from the bumped manifests. A
 * manifest the generator refuses throws here, before any file is written, so
 * a failed bump never leaves a half-bumped tree.
 *
 * @param version - The new version.
 * @returns The plan.
 * @throws {Error} When a manifest cannot be read, or cannot be generated from.
 */
async function planBump(version: string): Promise<BumpPlan> {
    const members: Member[] = []
    const sources: Rewrite[] = []
    for (const dir of await readWorkspaceMembers('.')) {
        const path = `${dir}/package.json`
        const before = await Deno.readTextFile(path)
        const pkg = bumpPackageManifest(JSON.parse(before), version)
        members.push({ dir, pkg })
        const after = JSON.stringify(pkg, null, 4) + '\n'
        if (after !== before) sources.push({ path, before, after })
    }
    const generated = planFiles(members)
    const rootBefore = await Deno.readTextFile(ROOT_CONFIG_PATH)
    return {
        sources,
        root: {
            path: ROOT_CONFIG_PATH,
            before: rootBefore,
            after: updateRootJsonc(rootBefore, version),
        },
        generated,
    }
}

/**
 * Run the bump.
 *
 * @param args - The command-line arguments.
 * @returns The exit code.
 */
async function main(args: string[]): Promise<number> {
    const parsed = parseArgs(args, {
        boolean: ['major', 'minor', 'patch', 'dry-run'],
        alias: { major: 'M', minor: 'm', patch: 'p' },
    })
    const dryRun = parsed['dry-run'] === true
    let current: string
    let target: string
    let plan: BumpPlan
    try {
        current = await readCurrentVersion()
        target = resolveTargetVersion({
            major: parsed.major,
            minor: parsed.minor,
            patch: parsed.patch,
            positional: parsed._[0]?.toString(),
        }, current)
        plan = await planBump(target)
    } catch (error) {
        console.error(`❌ ${getErrorMessage(error)}`)
        console.error('   Nothing was written.')
        return 1
    }

    console.log(`🚀 ${current} -> ${target}${dryRun ? ' (dry run)' : ''}`)
    for (const file of [...plan.sources, plan.root]) {
        if (!dryRun && file.after !== file.before) {
            await Deno.writeTextFile(file.path, file.after)
        }
        console.log(`   ${file.path}`)
    }
    if (dryRun) {
        console.log('   generated manifests would be regenerated')
    } else {
        for (const path of await writeFiles('.', plan.generated)) {
            console.log(`   ${path} (generated)`)
        }
    }

    const lockCode = await refreshLockfile({ dryRun })
    if (lockCode !== 0) return lockCode

    console.log(
        dryRun
            ? `Dry run: nothing was written. A real run sets every package to ${target}.`
            : `✨ Every package is at ${target}. Commit deno.lock with the manifests, or deno publish refuses the tag.`,
    )
    return 0
}

if (import.meta.main) {
    Deno.exit(await main(Deno.args))
}
