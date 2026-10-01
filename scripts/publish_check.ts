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
 * `deno.json` and outside the workspace, then type-checks its exports. It is
 * the **one owner of declaration integrity**: `deps:analyze` does not check
 * declarations (#388).
 *
 * **Workspace packages resolve against their staged siblings, never JSR.** Every
 * package is staged first; each one is then checked with a Deno `links` entry
 * per sibling, so a declared `jsr:@lockness/x@^V` resolves to the local copy —
 * including subpaths and symbols not published yet. Two guards keep that
 * honest: a linked name resolves even when undeclared, so every sibling the
 * manifest does **not** declare is mapped to a sentinel path that cannot load;
 * and a declared range the workspace version does not satisfy would make Deno
 * fall back to JSR, so it is refused before `deno check` runs.
 *
 * It **tolerates no failure**: the verdict is `deno check`'s exit status. The
 * message only names the fault:
 *
 * | Message | Meaning |
 * | :------ | :------ |
 * | `stale range: …` | a declared `@lockness/*` range the workspace version misses |
 * | `TS2307 … not a dependency and not in import map` | the manifest is missing the dependency |
 * | `Cannot find module 'file:…/.lockness-undeclared/…'` | a sibling imported but not declared |
 * | `Cannot find module 'file:…'` | a file the exports reach is missing from `publish.include` |
 * | anything else | unrecognised — still **fail** |
 *
 * There used to be a tolerated "`@lockness/*` version not on JSR yet" case. It
 * was blind: that is a graph error, so `deno check` never reached type checking
 * and dropped every undeclared import in the same file.
 *
 * Third-party dependencies resolve against JSR/npm, so it needs network access.
 * Third-party *types* are not this check's to prove: Deno's npm peer
 * resolution is order-dependent in a staged subgraph and can silently type a
 * module as `any`, and the workspace `deno check` owns typing under the
 * lockfile. Every fault this check owns is a graph error, which does not depend
 * on third-party types. The workspace lockfile is deliberately NOT copied in: a
 * peer variant computed for the whole workspace does not exist for a subgraph.
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
import { parse as parseJsonc } from '@std/jsonc'
import { parse, parseRange, satisfies } from '@std/semver'

const ROOT = Deno.cwd()
const PACKAGES_DIR = join(ROOT, 'packages')
const ROOT_MANIFEST = join(ROOT, 'deno.jsonc')

/**
 * The shape a workspace member needs before `deno publish` will accept it.
 *
 * **A member with no `name` is not a package**, and this is the distinction the
 * check turns on rather than an edge case to tolerate. `./packages/vite/demo`
 * is a workspace member carrying no `name`, no `version` and no `exports`, and
 * v0.3.0 published successfully with it present — `deno publish` does not
 * consider it a package at all. `@lockness/testing` had a `name` and `exports`
 * and no `version`, and it aborted the entire release.
 *
 * So the rule is conditional: **declare a `name` and you owe a `version` and
 * `exports`.** A check that simply required a version everywhere would fail on
 * the demo and be deleted by whoever hit it first.
 *
 * @param manifestPath - Project-relative path, for the message.
 * @param manifest - The member's parsed manifest.
 * @returns A fault description, or `null` when the member is publishable or is
 *   not a package.
 *
 * @example
 * ```ts
 * publishabilityFault('packages/testing/deno.json', { name: '@x/y', exports: './mod.ts' })
 * // -> "packages/testing/deno.json declares \"name\" but no \"version\" …"
 * ```
 */
export function publishabilityFault(
    manifestPath: string,
    manifest: Record<string, unknown>,
): string | null {
    if (typeof manifest.name !== 'string') return null
    const missing = (['version', 'exports'] as const).filter((field) =>
        manifest[field] === undefined
    )
    if (missing.length === 0) return null
    const fields = missing.map((f) => `"${f}"`).join(' and ')
    return `${manifestPath} declares "name" (${manifest.name}) but no ` +
        `${fields}. \`deno publish\` is ATOMIC across the workspace, so this ` +
        `one member aborts the release for all of them -- that is how v0.3.0 ` +
        `failed with nothing published (#325).\n` +
        `      Add the missing field. Neither of the two obvious escapes ` +
        `works: \`"private": true\` does not exclude a member, and removing ` +
        `it from the workspace array breaks every bare import of it.`
}

/**
 * Every workspace member that declares a name but cannot be published.
 *
 * Reads the `workspace` array rather than scanning `packages/` — that array is
 * what `deno publish` acts on, and the two are not the same set: the workspace
 * carries 38 entries against 37 directories, because one member is nested.
 *
 * @returns One fault description per offending member, empty when clean.
 * @throws {Error} If the root manifest cannot be read or parsed.
 */
async function unpublishableMembers(): Promise<string[]> {
    const root = parseJsonc(
        await Deno.readTextFile(ROOT_MANIFEST),
    ) as { workspace?: string[] }
    const faults: string[] = []
    for (const member of root.workspace ?? []) {
        const rel = `${member.replace(/^\.\//, '')}/deno.json`
        let manifest: Record<string, unknown>
        try {
            manifest = JSON.parse(
                await Deno.readTextFile(join(ROOT, rel)),
            ) as Record<string, unknown>
        } catch {
            faults.push(`${rel} is listed in the workspace but unreadable`)
            continue
        }
        const fault = publishabilityFault(rel, manifest)
        if (fault) faults.push(fault)
    }
    return faults
}

/** Outcome for one package. */
interface Result {
    name: string
    ok: boolean
    detail: string
}

/**
 * Enumerate every file under a package directory, as POSIX-style paths
 * relative to it. `node_modules` is skipped (never publishable, and large);
 * filtering by `publish.include` / `publish.exclude` is a separate,
 * pure concern — see {@link selectPublishedFiles}.
 *
 * @param dir - Absolute package directory.
 * @returns Relative POSIX paths, e.g. `mod.ts`, `drivers/local.ts`.
 */
async function enumerateFiles(dir: string): Promise<string[]> {
    const found: string[] = []
    const walk = async (current: string): Promise<void> => {
        for await (const entry of Deno.readDir(current)) {
            const path = join(current, entry.name)
            if (entry.isDirectory) {
                if (entry.name === 'node_modules') continue
                await walk(path)
                continue
            }
            found.push(path.slice(dir.length + 1).replaceAll('\\', '/'))
        }
    }
    await walk(dir)
    return found
}

/**
 * Whether a relative POSIX `path` is matched by a single `deno publish`
 * include/exclude `pattern`.
 *
 * A pattern is either a **glob** (contains `*`, `?`, `[`, `]`, `{`, `}`) —
 * matched with `**` spanning directory separators and `*`/`?` confined to a
 * single segment — or a **literal path**, which matches the file itself or,
 * treated as a directory, everything beneath it (`tests` matches
 * `tests/unit/a.ts`). Leading `./` and trailing `/` are ignored.
 *
 * @param path - Relative POSIX path to test.
 * @param pattern - A single `publish.include` / `publish.exclude` entry.
 * @returns `true` when the pattern selects the path.
 */
function matchesPattern(path: string, pattern: string): boolean {
    const normalized = pattern.replace(/^\.\//, '').replace(/\/+$/, '')
    if (/[*?[\]{}]/.test(normalized)) {
        let re = ''
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized[i]
            if (char === '*') {
                if (normalized[i + 1] === '*') {
                    re += '.*'
                    i++
                    if (normalized[i + 1] === '/') i++
                } else {
                    re += '[^/]*'
                }
            } else if (char === '?') {
                re += '[^/]'
            } else if ('.+^${}()|[]\\'.includes(char)) {
                re += `\\${char}`
            } else {
                re += char
            }
        }
        return new RegExp(`^${re}$`).test(path)
    }
    return path === normalized || path.startsWith(`${normalized}/`)
}

/**
 * The subset of `files` that `deno publish` would upload, honouring **both**
 * `publish.include` and `publish.exclude` the way the real publish does:
 *
 * - `include`, when non-empty, is an **allowlist** — a file ships only if it
 *   matches at least one include pattern. A file needed at publish time but
 *   absent from `include` is therefore dropped here, which is exactly what
 *   lets the caller detect an incomplete allowlist. An empty `include` admits
 *   every file.
 * - `exclude` then **subtracts** from that set.
 * - The manifest (`configFile`) is always published and never excluded — the
 *   published package is unusable without it — so it is force-kept regardless
 *   of either list.
 *
 * @param files - Relative POSIX paths from the package root (see
 * {@link enumerateFiles}).
 * @param include - `publish.include` patterns; `[]` means "no allowlist".
 * @param exclude - `publish.exclude` patterns.
 * @param configFile - The manifest filename, always kept. Defaults to
 * `deno.json`.
 * @returns The relative paths that would actually be published.
 * @example
 * ```ts
 * // An export references helpers.ts, but the allowlist forgot it:
 * selectPublishedFiles(
 *   ['mod.ts', 'helpers.ts', 'deno.json'],
 *   ['mod.ts', 'deno.json'],
 *   [],
 * )
 * // => ['mod.ts', 'deno.json'] — helpers.ts is dropped, so a type-check of
 * //    the staged copy fails and the incomplete include is caught.
 * ```
 */
export function selectPublishedFiles(
    files: string[],
    include: string[],
    exclude: string[],
    configFile = 'deno.json',
): string[] {
    return files.filter((file) => {
        const isConfig = file === configFile
        const included = include.length === 0 || isConfig ||
            include.some((pattern) => matchesPattern(file, pattern))
        if (!included) return false
        if (isConfig) return true
        return !exclude.some((pattern) => matchesPattern(file, pattern))
    })
}

/**
 * A workspace package as the check sees it once staged: the name it is
 * imported by, the directory it was staged under, and the version a declared
 * range must accept.
 */
export interface WorkspaceSibling {
    /** The package name, e.g. `@lockness/cli`. */
    name: string
    /** Its directory under `packages/`, e.g. `cli`. */
    short: string
    /** Its manifest version, e.g. `0.4.0`. */
    version: string
}

/**
 * The directory, relative to a staged package, that sentinel import-map
 * entries point into. Nothing is ever written there, so an import routed to
 * it fails to load during type checking.
 */
const UNDECLARED_DIR = '.lockness-undeclared'

/** `jsr:<@scope/name>@<range>[/subpath]`. */
const JSR_SPECIFIER = /^jsr:\/?(@[^/@]+\/[^/@]+)(?:@([^/]+))?(\/.*)?$/

/**
 * The `imports` of a manifest as a string map, ignoring anything malformed.
 *
 * @param manifest - A parsed `deno.json`.
 * @returns The string-valued entries of its `imports` field.
 */
function importsOf(manifest: Record<string, unknown>): Record<string, string> {
    const raw = manifest.imports
    if (raw === null || typeof raw !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') out[key] = value
    }
    return out
}

/**
 * Every declared `@lockness/*` range the workspace sibling's own version does
 * not satisfy.
 *
 * Linking only holds while the declared range accepts the linked version: when
 * it does not, Deno warns and quietly resolves the import against JSR instead,
 * which can type-check green against an older published release. So a range
 * miss is refused here, before `deno check` gets the chance.
 *
 * @param manifest - The parsed `deno.json` of the package being checked.
 * @param siblings - Every staged workspace package.
 * @returns One `stale range: …` description per offending entry, empty when
 *   every sibling range is satisfied. Entries naming a non-sibling are ignored.
 *
 * @example
 * ```ts
 * workspaceRangeFaults(
 *     { imports: { '@lockness/cli': 'jsr:@lockness/cli@^0.3.0' } },
 *     [{ name: '@lockness/cli', short: 'cli', version: '0.4.0' }],
 * )
 * // -> ['stale range: @lockness/cli declares ^0.3.0, workspace is 0.4.0']
 * ```
 */
export function workspaceRangeFaults(
    manifest: Record<string, unknown>,
    siblings: readonly WorkspaceSibling[],
): string[] {
    const versions = new Map(siblings.map((s) => [s.name, s.version]))
    const faults: string[] = []
    for (const [key, value] of Object.entries(importsOf(manifest))) {
        const match = JSR_SPECIFIER.exec(value)
        if (!match) continue
        const [, name, range] = match
        const version = versions.get(name)
        if (version === undefined || range === undefined) continue
        let ok: boolean
        try {
            ok = satisfies(parse(version), parseRange(range))
        } catch {
            ok = false
        }
        if (!ok) {
            faults.push(
                `stale range: ${key} declares ${range}, workspace is ${version}`,
            )
        }
    }
    return faults
}

/**
 * The manifest a staged package is checked with: its own, plus a `links` entry
 * per workspace sibling and a sentinel for every sibling it does not declare.
 *
 * - `links` points each sibling (never the package itself) at its staged copy
 *   in `../../pkgs/<short>`, so a declared `jsr:@lockness/x@^V` resolves to the
 *   local code, unpublished subpaths and symbols included, with no download.
 * - A linked name resolves **even when undeclared**, which would hide exactly
 *   the fault this check exists for. So every sibling not declared by key —
 *   the key equals its name or starts with `<name>/`, the rule Deno resolves
 *   by (#388) — gets `<name>` and `<name>/` mapped into a directory that does
 *   not exist. Importing it then fails type checking with a `Cannot find
 *   module` naming the sentinel, which {@link classifyCheck} reports.
 *
 * Declared entries are carried over unchanged. Siblings keep their own
 * manifests: `links` is honoured only in the root config.
 *
 * @param manifest - The package's parsed `deno.json`.
 * @param selfName - The package's own name, excluded from `links`.
 * @param siblings - Every staged workspace package.
 * @returns A new manifest; the input is not modified.
 *
 * @example
 * ```ts
 * withWorkspaceLinks({ name: '@lockness/a', imports: {} }, '@lockness/a', [
 *     { name: '@lockness/a', short: 'a', version: '0.4.0' },
 *     { name: '@lockness/b', short: 'b', version: '0.4.0' },
 * ])
 * // -> { name: '@lockness/a', links: ['../../pkgs/b'], imports: {
 * //      '@lockness/b': './.lockness-undeclared/@lockness/b',
 * //      '@lockness/b/': './.lockness-undeclared/@lockness/b/' } }
 * ```
 */
export function withWorkspaceLinks(
    manifest: Record<string, unknown>,
    selfName: string,
    siblings: readonly WorkspaceSibling[],
): Record<string, unknown> {
    const declared = importsOf(manifest)
    const keys = Object.keys(declared)
    const others = siblings.filter((s) => s.name !== selfName)
    const sentinels: Record<string, string> = {}
    for (const { name } of others) {
        const isDeclared = keys.some((key) =>
            key === name || key.startsWith(`${name}/`)
        )
        if (isDeclared) continue
        sentinels[name] = `./${UNDECLARED_DIR}/${name}`
        sentinels[`${name}/`] = `./${UNDECLARED_DIR}/${name}/`
    }
    return {
        ...manifest,
        links: others.map((s) => `../../pkgs/${s.short}`),
        imports: { ...sentinels, ...declared },
    }
}

/**
 * Remove ANSI colour sequences, so matching does not depend on whether the
 * child decided it was writing to a terminal.
 *
 * @param text - Raw process output.
 * @returns The text without escape sequences.
 */
function stripAnsi(text: string): string {
    // deno-lint-ignore no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * Classify one package's `deno check` outcome. **Tolerates no failure**: the
 * verdict is the exit status (`ok === success`), and the output only decides
 * how a failure is named.
 *
 * @param name - Short package name.
 * @param success - Whether `deno check` exited 0.
 * @param rawOutput - Its stderr and stdout, concatenated.
 * @returns The verdict for that package.
 * @example
 * ```ts
 * classifyCheck('core', false, 'error: Type checking failed.').ok   // false
 * classifyCheck('core', true, '').ok                                // true
 * ```
 */
export function classifyCheck(
    name: string,
    success: boolean,
    rawOutput: string,
): Result {
    if (success) return { name, ok: true, detail: 'resolves' }

    const output = stripAnsi(rawOutput)

    // The failure this check exists for: an import the manifest never declared.
    // A third-party one reads "not a dependency"; a workspace sibling one hits
    // the sentinel `withWorkspaceLinks` put in its place. The sentinel rule has
    // to run before the `file:` rule below, which would otherwise report it as
    // a file missing from publish.include.
    const undeclared = [
        ...[
            ...output.matchAll(
                /Import "([^"]+)" not a dependency and not in import map/g,
            ),
        ].map((m) => m[1]),
        ...[
            ...output.matchAll(
                /Cannot find module ['"]file:[^'"]*\/\.lockness-undeclared\/(@[^/'"]+\/[^/'"]+)[^'"]*['"]/g,
            ),
        ].map((m) => m[1]),
    ]

    if (undeclared.length > 0) {
        return {
            name,
            ok: false,
            detail: `undeclared: ${[...new Set(undeclared)].join(', ')}`,
        }
    }

    // A local file the exports reach but `publish.include` never listed: the
    // allowlist is incomplete, so the file was not staged and `deno check`
    // fails to load it.
    const missingLocal = [
        ...output.matchAll(/Cannot find module ['"](file:[^'"]+)['"]/g),
    ].map((m) => m[1].split('/').pop() ?? m[1])
    if (missingLocal.length > 0) {
        return {
            name,
            ok: false,
            detail: `missing from publish.include: ${
                [...new Set(missingLocal)].join(', ')
            }`,
        }
    }

    // Anything else is red too, named by its first error line. There is no
    // tolerated failure: the old "@lockness/* version not on JSR yet" pass was
    // a graph error that hid every undeclared import beside it.
    const errors = output.split('\n')
        .map((line) => line.trim())
        .filter((line) => /^error:|\[ERROR\]/.test(line))
    const first = errors[0] ??
        output.split('\n').map((l) => l.trim()).find((l) => l !== '') ??
        'deno check failed with no output'
    return { name, ok: false, detail: `unrecognised failure: ${first}` }
}

/**
 * The verdict for a whole run over the resolution results.
 *
 * @param results - One result per package.
 * @returns The exit code, and the lines to print — the success line appears
 *   only when the code is `0`, so the log can never contradict the exit status.
 * @example
 * ```ts
 * resolutionVerdict([{ name: 'core', ok: false, detail: 'x' }]).code   // 1
 * ```
 */
export function resolutionVerdict(
    results: Result[],
): { code: 0 | 1; lines: string[] } {
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
        return {
            code: 1,
            lines: [
                `\n❌ ${failed.length} package(s) do not resolve standalone: ${
                    failed.map((r) => r.name).join(', ')
                }`,
                "   Fix each ❌ above. An undeclared import is declared in that package's own deno.json.",
            ],
        }
    }
    return { code: 0, lines: ['\n✅ Every package resolves standalone'] }
}

/** A package staged in its published shape, with the manifest it shipped. */
interface StagedPackage {
    /** Short package name (its directory under `packages/`). */
    short: string
    /** The parsed `deno.json`. */
    manifest: Record<string, unknown>
}

/**
 * Copy every file under `from` into `to`, keeping relative paths.
 *
 * @param from - Source directory.
 * @param to - Destination directory, created as needed.
 */
async function copyTree(from: string, to: string): Promise<void> {
    await Deno.mkdir(to, { recursive: true })
    for (const relative of await enumerateFiles(from)) {
        const target = join(to, relative)
        await Deno.mkdir(dirname(target), { recursive: true })
        await Deno.copyFile(join(from, relative), target)
    }
}

/**
 * Stage one package's published files, unmodified, in `<scratch>/pkgs/<short>`.
 * That copy is what every other package links against, so it is never
 * rewritten.
 *
 * @param short - Short package name.
 * @param scratch - The run's scratch root.
 * @returns The staged package.
 */
async function stagePackage(
    short: string,
    scratch: string,
): Promise<StagedPackage> {
    const source = join(PACKAGES_DIR, short)
    const manifest = JSON.parse(
        await Deno.readTextFile(join(source, 'deno.json')),
    ) as Record<string, unknown>
    const publish = (manifest.publish ?? {}) as {
        include?: string[]
        exclude?: string[]
    }

    const staged = join(scratch, 'pkgs', short)
    await Deno.mkdir(staged, { recursive: true })
    const published = selectPublishedFiles(
        await enumerateFiles(source),
        publish.include ?? [],
        publish.exclude ?? [],
    )
    for (const relative of published) {
        const target = join(staged, relative)
        await Deno.mkdir(dirname(target), { recursive: true })
        await Deno.copyFile(join(source, relative), target)
    }
    return { short, manifest }
}

/**
 * Check one staged package against its staged siblings.
 *
 * @param pkg - The package, already staged by {@link stagePackage}.
 * @param siblings - Every staged workspace package.
 * @param scratch - The run's scratch root.
 * @returns The outcome.
 */
async function checkPackage(
    pkg: StagedPackage,
    siblings: readonly WorkspaceSibling[],
    scratch: string,
): Promise<Result> {
    const { short: name, manifest } = pkg

    // A range the linked version misses makes Deno fall back to JSR, which can
    // pass against an older release -- so it is refused before `deno check`.
    const stale = workspaceRangeFaults(manifest, siblings)
    if (stale.length > 0) {
        return { name, ok: false, detail: stale.join('; ') }
    }

    const exportsField = manifest.exports ?? {}
    const entries = (
        typeof exportsField === 'string'
            ? [exportsField]
            : Object.values(exportsField as Record<string, unknown>)
    ).filter((v): v is string => typeof v === 'string' && /\.tsx?$/.test(v))

    if (entries.length === 0) {
        return { name, ok: true, detail: 'no type-checkable exports' }
    }

    const root = join(scratch, 'root', name)
    await copyTree(join(scratch, 'pkgs', name), root)
    const selfName = typeof manifest.name === 'string' ? manifest.name : ''
    await Deno.writeTextFile(
        join(root, 'deno.json'),
        JSON.stringify(withWorkspaceLinks(manifest, selfName, siblings)),
    )

    const result = await new Deno.Command(Deno.execPath(), {
        args: ['check', ...entries],
        cwd: root,
        stdout: 'piped',
        stderr: 'piped',
    }).output()

    const output = new TextDecoder().decode(result.stderr) +
        new TextDecoder().decode(result.stdout)

    return classifyCheck(name, result.success, output)
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
        // The registry API, NOT `jsr.io/@scope/name/meta.json`. `meta.json`
        // only appears once a version has been published, so a package that
        // was created correctly but has no versions yet — exactly the case
        // this check exists for — reads as 404 there and blocks forever.
        // The API returns the package record with `versionCount: 0`.
        const response = await fetch(
            `https://api.jsr.io/scopes/lockness/packages/${name}`,
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
 * The verdict for the `--registry` existence check, decided from the counts
 * gathered while probing each package with {@link existsOnJsr}.
 *
 * Split out from {@link main} so the branch that matters -- missing wins over
 * merely unreachable, and an unreachable-only run is not a proven fault -- is
 * unit-testable without a real JSR round trip (#397, finding 5).
 *
 * @param missing - Package names JSR has never seen.
 * @param unreachable - How many probes could not reach the registry at all.
 * @returns `code: 1` names every missing package and the URL to create it;
 * `code: 0` otherwise (including when every probe was merely unreachable --
 * inconclusive is not a proven fault, so it must not fail the run).
 * @example
 * ```ts
 * registryVerdict(['scheduler'], 0).code   // 1
 * registryVerdict([], 2).code              // 0 -- unreachable, not missing
 * ```
 */
export function registryVerdict(
    missing: string[],
    unreachable: number,
): { code: 0 | 1; lines: string[] } {
    if (missing.length === 0 && unreachable === 0) {
        return { code: 0, lines: ['  ✅ every package exists on JSR'] }
    }
    if (missing.length === 0) return { code: 0, lines: [] }
    return {
        code: 1,
        lines: [
            `\n❌ ${missing.length} package(s) must be created on JSR before any publish.`,
            '   `deno publish` is atomic across the workspace — one missing',
            '   package aborts all of them. Create each here:',
            ...missing.map((name) =>
                `   https://jsr.io/new?scope=lockness&package=${name}`
            ),
        ],
    }
}

/**
 * Run the check for every package.
 */
async function main(): Promise<void> {
    // FIRST, and in the default mode, so it gates every local run, the pre-push
    // hook and CI -- not only `--registry` runs. It also has to precede the
    // registry section: an unpublishable member used to be reported there as
    // "does not exist on JSR", which reads as an instruction to create it, and
    // that is how an empty package got created on the registry (#325).
    const unpublishable = await unpublishableMembers()
    if (unpublishable.length > 0) {
        console.log('❌ A workspace member cannot be published:\n')
        for (const fault of unpublishable) console.log(`   ${fault}\n`)
        Deno.exit(1)
    }

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
    // Stage every package before checking any: each check links against the
    // staged copies of all the others.
    const staged: StagedPackage[] = []
    for (const name of names) staged.push(await stagePackage(name, scratch))
    const siblings: WorkspaceSibling[] = staged.flatMap(
        ({ short, manifest }) =>
            typeof manifest.name === 'string' &&
                typeof manifest.version === 'string'
                ? [{ name: manifest.name, short, version: manifest.version }]
                : [],
    )

    const results: Result[] = []
    for (const pkg of staged) {
        const name = pkg.short
        const result = await checkPackage(pkg, siblings, scratch)
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
    const verdict = resolutionVerdict(results)
    if (!Deno.args.includes('--registry')) {
        // The success line only on the path that exits 0: it used to print
        // before `Deno.exit(1)`, so a red run read green in the log (#388).
        if (verdict.code !== 0) {
            for (const line of verdict.lines) console.error(line)
            Deno.exit(verdict.code)
        }
        for (const line of verdict.lines) console.log(line)
        console.log('   (registry existence not checked; pass --registry)')
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
    const registry = registryVerdict(missing, unreachable)
    if (registry.code !== 0) {
        for (const line of registry.lines) console.error(line)
        Deno.exit(registry.code)
    }
    for (const line of registry.lines) console.log(line)

    if (verdict.code !== 0) {
        for (const line of verdict.lines) console.error(line)
        Deno.exit(verdict.code)
    }
    for (const line of verdict.lines) console.log(line)
}

if (import.meta.main) {
    await main()
}
