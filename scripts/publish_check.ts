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
 * It **tolerates no failure**. A run is red if `deno check` exits non-zero, OR
 * a dynamic edge carries an error field, OR the workspace dry-run exits
 * non-zero or emits a diagnostic that is not inventoried (#463).
 *
 * - **`deno check`** owns static imports and types, per staged package.
 * - **Dynamic edges** (Rule A): `deno check` exits 0 on an `import('…')` it
 *   cannot resolve, so `deno info --json` reads Deno's own resolution of every
 *   dynamic edge in the staged package, under the same links and sentinels.
 *   The verdict is the presence of an `error` field, never a message match.
 * - **Runtime imports** (Rule B): a computed `import(spec)` or
 *   `import.meta.resolve(spec)` is in no graph. One workspace
 *   `deno publish --dry-run` names each such site, and each must be inventoried
 *   with a count and a reason under `runtimeImports` in `deps.policy.jsonc`.
 * - **Published `.tsx`** (Rule C, #470): a package may publish a `.tsx` only
 *   with a `"jsx": "<reason>"` entry in `deps.policy.jsonc`. Under
 *   `"jsx": "precompile"`, Deno transpiles a JSR `.tsx` with the CONSUMING
 *   app's `jsxImportSource`, so a `.tsx` reached by an app without JSX fails
 *   that app at load. A stale entry (no `.tsx` left) is red too.
 *
 * The message only names the fault:
 *
 * | Message | Meaning |
 * | :------ | :------ |
 * | `stale range: …` | a declared `@lockness/*` range the workspace version misses |
 * | `TS2307 … not a dependency and not in import map` | the manifest is missing the dependency |
 * | `Cannot find module 'file:…/.lockness-undeclared/…'` | a sibling imported but not declared |
 * | `Cannot find module 'file:…'` | a file the exports reach is missing from `publish.include` |
 * | `<file>:<line>: undeclared dynamic import — import('x')` | an `import()` of a package the manifest does not declare |
 * | `<file>:<line>: undeclared dynamic import: @scope/x — …` | an `import()` of a sibling the manifest does not declare |
 * | `<file>:<line>: missing from publish.include: … — …` | an `import()` of a file that was not staged |
 * | `<file>:<line>: unresolved dynamic import: … — …` | any other dynamic edge error, e.g. `Unknown export` — still **fail** |
 * | `unrecognised graph failure: …` | `deno info` built no graph — still **fail** |
 * | `<pkg>/<file>: N unanalysable import site(s), …` | a runtime-import site missing from, or drifting against, the inventory |
 * | `<pkg>: publishes N .tsx file(s) (…), no "jsx" entry …` | a published `.tsx` the policy does not allow |
 * | `<pkg>: "jsx" entry …, but no .tsx is published …` | a stale `jsx` entry |
 * | `dry-run diagnostic: warning[…]` / `error[…]` | any other dry-run diagnostic |
 * | `deno publish --dry-run exited N: …` | the dry-run itself failed |
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
 * lockfile. The check still fails on any type error, so a third-party typing
 * artefact in the staged subgraph can redden it (drizzle's TS7006 did); the fix
 * there is an explicit annotation, not a tolerance. The workspace lockfile is
 * deliberately NOT copied in: a peer variant computed for the whole workspace
 * does not exist for a subgraph.
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

import { dirname, join, toFileUrl } from '@std/path'
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
        } catch (error) {
            // Not stale — unparseable. Surface the parser's reason as the fault.
            faults.push(
                `invalid range: ${key} declares ${range}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
            continue
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
 * The verdict for a whole run over the resolution results and the runtime
 * import inventory.
 *
 * @param results - One result per package.
 * @param runtimeFaults - Faults from the workspace dry-run and the runtime
 *   import inventory ({@link runtimeImportFaults}); defaults to none.
 * @param jsxFaults - Faults from the published-`.tsx` policy
 *   ({@link jsxPolicyFaults}); defaults to none.
 * @returns The exit code, and the lines to print — the success line appears
 *   only when the code is `0`, so the log can never contradict the exit status.
 * @example
 * ```ts
 * resolutionVerdict([{ name: 'core', ok: false, detail: 'x' }]).code   // 1
 * resolutionVerdict([], ['cli/mod.ts: not inventoried']).code           // 1
 * resolutionVerdict([], [], ['core: publishes 1 .tsx file(s)']).code    // 1
 * ```
 */
export function resolutionVerdict(
    results: Result[],
    runtimeFaults: readonly string[] = [],
    jsxFaults: readonly string[] = [],
): { code: 0 | 1; lines: string[] } {
    const failed = results.filter((r) => !r.ok)
    if (
        failed.length > 0 || runtimeFaults.length > 0 || jsxFaults.length > 0
    ) {
        const lines: string[] = []
        if (failed.length > 0) {
            lines.push(
                `\n❌ ${failed.length} package(s) do not resolve standalone: ${
                    failed.map((r) => r.name).join(', ')
                }`,
                "   Fix each ❌ above. An undeclared import is declared in that package's own deno.json.",
            )
        }
        if (runtimeFaults.length > 0) {
            lines.push(
                `\n❌ ${runtimeFaults.length} runtime-import fault(s) in the workspace dry-run:`,
                ...runtimeFaults.map((fault) => `   ${fault}`),
                '   A non-literal import() or import.meta.resolve() is inventoried, with a reason,',
                '   under that package\'s "runtimeImports" in deps.policy.jsonc.',
            )
        }
        if (jsxFaults.length > 0) {
            lines.push(
                `\n❌ ${jsxFaults.length} jsx-policy fault(s) in the published files:`,
                ...jsxFaults.map((fault) => `   ${fault}`),
                "   A published .tsx is transpiled with the CONSUMING app's jsxImportSource",
                '   and breaks an app without JSX (#470). Write it as .ts, or justify it',
                '   under that package\'s "jsx" in deps.policy.jsonc.',
            )
        }
        return { code: 1, lines }
    }
    return { code: 0, lines: ['\n✅ Every package resolves standalone'] }
}

// ---- Rule A: dynamic edges, as Deno resolves them (#463) ------------------

/**
 * One faulty dynamic `import()` in a staged package, as Deno's module graph
 * reports it.
 */
export interface DynamicImportFault {
    /** The importing file, relative to the staged package root (POSIX). */
    file: string
    /** The 1-based line the specifier sits on. */
    line: number
    /** The specifier exactly as written in the source. */
    specifier: string
    /** What is wrong, for the log — never the basis of the verdict. */
    reason: string
}

/** The file the dynamic-edge pass hands to `deno info`; never published. */
const GRAPH_ROOT_FILE = '.lockness-graph-root.ts'

/**
 * A plain-object guard for walking untyped JSON.
 *
 * @param value - Anything.
 * @returns Whether it is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Every dynamic edge of a staged package whose resolution Deno marks as
 * failed, read from `deno info --json` over that package's graph root.
 *
 * `deno check` never fails on a dynamic import it cannot resolve (measured on
 * Deno 2.9.6: an undeclared sibling, an undeclared third-party package and a
 * non-exported subpath all exit 0, even with `--all`), so the declaration owner
 * had a hole exactly where lazy drivers live. `deno info` records the failure
 * as data. **The verdict is the presence of an `error` field** — on the edge
 * itself (`code.error`) or on the module the edge resolved to — never a message
 * match; the message only names the fault, so a reworded Deno error stays red.
 *
 * Only modules under `stagedRoot` are walked, and only their `isDynamic`
 * edges: static edges belong to `deno check`, which already fails on them, and
 * edges that start inside third-party modules are not this package's to fix.
 *
 * @param info - The parsed `deno info --json` output, unvalidated.
 * @param stagedRoot - The staged package directory, as an absolute real path
 *   (Deno reports canonical paths, so a symlinked temp dir must be resolved).
 * @returns One fault per failed dynamic edge, empty when every one resolves.
 * @throws {Error} When `info` is not a module graph (`unrecognised graph
 *   failure`): a shape this function cannot read must never read as clean.
 * @example
 * ```ts
 * const info = JSON.parse(stdoutOfDenoInfo)
 * dynamicImportFaults(info, '/tmp/lockness-publish-x/root/drizzle')
 * // -> [{ file: 'drivers.ts', line: 368, specifier: 'x', reason: 'undeclared dynamic import' }]
 * ```
 */
export function dynamicImportFaults(
    info: unknown,
    stagedRoot: string,
): DynamicImportFault[] {
    if (!isRecord(info) || !Array.isArray(info.modules)) {
        throw new Error(
            'unrecognised graph failure: deno info --json returned no modules',
        )
    }
    const rootUrl = toFileUrl(stagedRoot).href.replace(/\/?$/, '/')
    const graphRootUrl = `${rootUrl}${GRAPH_ROOT_FILE}`
    const undeclaredUrl = `${rootUrl}${UNDECLARED_DIR}/`
    const targetError = targetErrorLookup(info.modules, info.redirects)

    const faults: DynamicImportFault[] = []
    for (const module of info.modules) {
        if (!isRecord(module) || typeof module.specifier !== 'string') continue
        const from = module.specifier
        if (!from.startsWith(rootUrl) || from === graphRootUrl) continue
        if (from.startsWith(undeclaredUrl)) continue
        if (!Array.isArray(module.dependencies)) continue
        const file = decodeURIComponent(from.slice(rootUrl.length))
        for (const dependency of module.dependencies) {
            const fault = classifyDynamicEdge(
                dependency,
                file,
                rootUrl,
                targetError,
            )
            if (fault !== undefined) faults.push(fault)
        }
    }
    return faults
}

/**
 * A lookup of the `error` field of the module a specifier lands on, following
 * one `redirects` hop.
 *
 * @param modules - The `modules` array of a `deno info --json` graph.
 * @param redirects - Its `redirects` field, unvalidated.
 * @returns A function giving the target module's error, or `undefined` when
 *   that module loaded.
 */
function targetErrorLookup(
    modules: readonly unknown[],
    redirects: unknown,
): (specifier: string) => string | undefined {
    const moduleErrors = new Map<string, string>()
    for (const module of modules) {
        if (
            isRecord(module) && typeof module.specifier === 'string' &&
            typeof module.error === 'string'
        ) {
            moduleErrors.set(module.specifier, module.error)
        }
    }
    const hops = isRecord(redirects) ? redirects : {}
    return (specifier) => {
        const redirected = hops[specifier]
        return moduleErrors.get(specifier) ??
            (typeof redirected === 'string'
                ? moduleErrors.get(redirected)
                : undefined)
    }
}

/**
 * Classify one dependency of a staged module: a fault when it is a dynamic
 * edge that carries an `error` field, or that resolves to a module which does.
 *
 * @param dependency - One entry of the module's `dependencies`, unvalidated.
 * @param file - The importing file, relative to the staged root (POSIX).
 * @param rootUrl - The staged package root, as a `file:` URL ending in `/`.
 * @param targetError - From {@link targetErrorLookup}.
 * @returns The fault, or `undefined` for a static edge or a resolved one.
 */
function classifyDynamicEdge(
    dependency: unknown,
    file: string,
    rootUrl: string,
    targetError: (specifier: string) => string | undefined,
): DynamicImportFault | undefined {
    if (!isRecord(dependency) || dependency.isDynamic !== true) return undefined
    const specifier = typeof dependency.specifier === 'string'
        ? dependency.specifier
        : '<unknown>'
    const code = isRecord(dependency.code) ? dependency.code : {}
    const span = isRecord(code.span) ? code.span : {}
    const start = isRecord(span.start) ? span.start : {}
    const line = typeof start.line === 'number' ? start.line + 1 : 0

    let reason: string | undefined
    if (typeof code.error === 'string') {
        reason = /not a dependency/.test(code.error)
            ? 'undeclared dynamic import'
            : `unresolved dynamic import: ${firstLine(code.error)}`
    } else if (typeof code.specifier === 'string') {
        const error = targetError(code.specifier)
        if (error !== undefined) {
            reason = describeTarget(code.specifier, error, rootUrl)
        }
    }
    return reason === undefined ? undefined : { file, line, specifier, reason }
}

/**
 * Name a dynamic edge whose target module failed to load.
 *
 * @param target - The `file:` (or other) URL the edge resolved to.
 * @param error - The target module's `error` field.
 * @param rootUrl - The staged package root, as a `file:` URL ending in `/`.
 * @returns The fault reason.
 */
function describeTarget(
    target: string,
    error: string,
    rootUrl: string,
): string {
    const sentinel = target.startsWith(`${rootUrl}${UNDECLARED_DIR}/`)
        ? /^(@[^/]+\/[^/]+)/.exec(
            decodeURIComponent(
                target.slice(`${rootUrl}${UNDECLARED_DIR}/`.length),
            ),
        )
        : null
    if (sentinel) return `undeclared dynamic import: ${sentinel[1]}`
    if (target.startsWith(rootUrl)) {
        return `missing from publish.include: ${
            decodeURIComponent(target.slice(rootUrl.length))
        }`
    }
    return `unresolved dynamic import: ${firstLine(error)}`
}

/**
 * The first non-empty line of a message.
 *
 * @param text - A possibly multi-line message.
 * @returns Its first non-empty line, trimmed.
 */
function firstLine(text: string): string {
    return text.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? text
}

/**
 * Format a dynamic-import fault for the per-package log line.
 *
 * @param fault - The fault.
 * @returns `<file>:<line>: <reason> — import('<specifier>')`.
 * @example
 * ```ts
 * formatDynamicFault({ file: 'mod.ts', line: 2, specifier: 'x', reason: 'undeclared dynamic import' })
 * // -> "mod.ts:2: undeclared dynamic import — import('x')"
 * ```
 */
function formatDynamicFault(fault: DynamicImportFault): string {
    return `${fault.file}:${fault.line}: ${fault.reason} — import('${fault.specifier}')`
}

// ---- Rule B: the runtime-import inventory (#463) --------------------------

/** The dry-run diagnostic codes that name a site Deno cannot analyse. */
const RUNTIME_IMPORT_CODES = new Set([
    'unanalyzable-dynamic-import',
    'unanalyzable-import-meta-resolve',
])

/**
 * What the workspace `deno publish --dry-run` reported, sorted into the sites
 * the inventory accounts for and every other diagnostic.
 */
export interface DryRunDiagnostics {
    /**
     * Unanalysable runtime-import sites per package directory, then per file
     * relative to it: `{ cli: { 'mod.ts': 1 } }`.
     */
    sites: Record<string, Record<string, number>>
    /**
     * Every other `warning[…]` / `error[…]` diagnostic, or an unanalysable
     * site outside `packages/`, as `<level>[<code>] at <location>`.
     */
    other: string[]
}

/**
 * Parse the diagnostics of a workspace `deno publish --dry-run` (stderr, ANSI
 * included or not).
 *
 * Each diagnostic opens with `warning[<code>]` or `error[<code>]` at the start
 * of a line and names its site on the next `--> <path>:<line>:<col>` line. The
 * two codes for a site Deno cannot analyse are counted per package and file;
 * any other code is collected verbatim, because the verdict has to see it.
 * Deno's own box of deprecated npm packages carries no code and is not a
 * diagnostic.
 *
 * @param dryRunOutput - The dry-run's combined output.
 * @param root - The workspace root, as an absolute real path.
 * @returns The sorted diagnostics.
 * @example
 * ```ts
 * runtimeImportSites(
 *     'warning[unanalyzable-dynamic-import]: unable to analyze dynamic import\n' +
 *         '  --> /w/packages/cli/mod.ts:321:53\n',
 *     '/w',
 * )
 * // -> { sites: { cli: { 'mod.ts': 1 } }, other: [] }
 * ```
 */
export function runtimeImportSites(
    dryRunOutput: string,
    root: string,
): DryRunDiagnostics {
    const lines = stripAnsi(dryRunOutput).split('\n')
    const packagesPrefix = `${root.replace(/[\\/]+$/, '')}/packages/`
    const sites: Record<string, Record<string, number>> = {}
    const other: string[] = []

    for (let i = 0; i < lines.length; i++) {
        const header = /^(warning|error)\[([A-Za-z0-9_-]+)\]/.exec(lines[i])
        if (!header) continue
        const [, level, code] = header
        let location: string | undefined
        for (let j = i + 1; j < lines.length; j++) {
            if (/^(warning|error)\[/.test(lines[j])) break
            const arrow = /^\s*-->\s+(.+?)\s*$/.exec(lines[j])
            if (arrow) {
                location = arrow[1]
                break
            }
        }
        const path = location === undefined
            ? undefined
            : location.replace(/:\d+:\d+$/, '').replace(/^file:\/\//, '')
                .replaceAll('\\', '/')
        if (
            RUNTIME_IMPORT_CODES.has(code) && path !== undefined &&
            path.startsWith(packagesPrefix)
        ) {
            const relative = path.slice(packagesPrefix.length)
            const slash = relative.indexOf('/')
            const pkg = relative.slice(0, slash)
            const file = relative.slice(slash + 1)
            sites[pkg] ??= {}
            sites[pkg][file] = (sites[pkg][file] ?? 0) + 1
            continue
        }
        const where = location === undefined
            ? '(no location)'
            : location.startsWith(root)
            ? location.slice(root.length).replace(/^[\\/]/, '')
            : location
        other.push(`${level}[${code}] at ${where}`)
    }
    return { sites, other }
}

/**
 * Compare the dry-run's unanalysable sites with the `runtimeImports`
 * inventory in `deps.policy.jsonc`.
 *
 * A non-literal `import(spec)` is invisible to every graph — `deno info`
 * included — so it can neither be declared nor checked. Listing it without
 * failing would be a silent skip with a green log; refusing it outright would
 * refuse the framework's own discovery loaders. So each one is **inventoried**:
 * per package, per file, a site count and a reason. Red when:
 *
 * - a file with sites is not listed;
 * - a listed count differs from the dry-run's, up or down;
 * - a listed file has no sites left (a stale entry);
 * - an entry has no reason, or a malformed count;
 * - any other dry-run diagnostic appears.
 *
 * @param diagnostics - The parsed dry-run, from {@link runtimeImportSites}.
 * @param policy - The parsed `deps.policy.jsonc`, unvalidated; `undefined`
 *   (no policy file) is an empty inventory.
 * @returns One fault description per discrepancy, empty when they agree.
 * @example
 * ```ts
 * runtimeImportFaults(
 *     { sites: { cli: { 'mod.ts': 1 } }, other: [] },
 *     { packages: { cli: { runtimeImports: {
 *         'mod.ts': { sites: 1, reason: 'a user-app module path' },
 *     } } } },
 * )
 * // -> []
 * ```
 */
export function runtimeImportFaults(
    diagnostics: DryRunDiagnostics,
    policy: unknown,
): string[] {
    const faults = diagnostics.other.map((d) => `dry-run diagnostic: ${d}`)
    const inventory = runtimeInventory(policy)
    const names = new Set([
        ...Object.keys(diagnostics.sites),
        ...Object.keys(inventory),
    ])
    for (const pkg of [...names].sort()) {
        const found = diagnostics.sites[pkg] ?? {}
        const listed = inventory[pkg] ?? {}
        const files = new Set([...Object.keys(found), ...Object.keys(listed)])
        for (const file of [...files].sort()) {
            faults.push(
                ...inventoryFileFaults(
                    `${pkg}/${file}`,
                    found[file] ?? 0,
                    listed[file],
                ),
            )
        }
    }
    return faults
}

/**
 * The `runtimeImports` section of every package in the policy, unvalidated
 * below the per-file level.
 *
 * @param policy - The parsed `deps.policy.jsonc`, unvalidated.
 * @returns Per package directory, its file-to-entry map.
 */
function runtimeInventory(
    policy: unknown,
): Record<string, Record<string, unknown>> {
    const packages = isRecord(policy) && isRecord(policy.packages)
        ? policy.packages
        : {}
    const inventory: Record<string, Record<string, unknown>> = {}
    for (const [pkg, entry] of Object.entries(packages)) {
        if (isRecord(entry) && isRecord(entry.runtimeImports)) {
            inventory[pkg] = entry.runtimeImports
        }
    }
    return inventory
}

/**
 * Compare one file's unanalysable-site count with its inventory entry.
 *
 * @param at - `<pkg>/<file>`, for the message.
 * @param count - The sites the dry-run found in that file; `0` for none.
 * @param entry - The file's inventory entry, unvalidated; `undefined` when
 *   the file is not listed.
 * @returns One fault description per discrepancy, empty when they agree.
 */
function inventoryFileFaults(
    at: string,
    count: number,
    entry: unknown,
): string[] {
    if (entry === undefined) {
        return [
            `${at}: ${count} unanalysable import site(s), not inventoried in deps.policy.jsonc runtimeImports`,
        ]
    }
    if (!isRecord(entry)) return [`${at}: inventory entry is not an object`]
    const faults: string[] = []
    const { sites, reason } = entry
    if (typeof reason !== 'string' || reason.trim() === '') {
        faults.push(`${at}: inventory entry has no reason`)
    }
    if (typeof sites !== 'number' || !Number.isInteger(sites) || sites < 1) {
        faults.push(`${at}: inventory "sites" must be a positive integer`)
    } else if (count === 0) {
        faults.push(
            `${at}: inventoried with ${sites} site(s), the dry-run finds none — remove the stale entry`,
        )
    } else if (count !== sites) {
        faults.push(
            `${at}: ${count} unanalysable import site(s), inventory says ${sites}`,
        )
    }
    return faults
}

// ---- Rule C: a published .tsx needs a "jsx" policy entry (#470) -----------

/** How many `.tsx` paths a fault names before eliding the rest. */
const JSX_FAULT_SAMPLE = 3

/**
 * Compare each package's published `.tsx` files with the `"jsx"` entries in
 * `deps.policy.jsonc`.
 *
 * A JSR `.tsx` is not self-contained: under `"jsx": "precompile"` Deno
 * transpiles it with the consuming app's `jsxImportSource`, ignoring the
 * pragma `deno publish` writes into it, and the runtime that names is not in
 * the pre-loaded graph of an app that has no JSX of its own. That is how
 * `@lockness/core@0.4.0` failed to load in the api and slim kits (#470). So a
 * package publishes a `.tsx` only when the policy says why it may. Red when:
 *
 * - a package publishes a `.tsx` and has no `"jsx"` entry;
 * - a `"jsx"` entry is not a non-empty string;
 * - a `"jsx"` entry names a package that publishes no `.tsx` (stale).
 *
 * @param published - Per short package name, the files `deno publish` would
 *   upload (after `publish.include` / `publish.exclude`, see
 *   {@link selectPublishedFiles}) — so an excluded `demo/*.tsx` never counts.
 * @param policy - The parsed `deps.policy.jsonc`, unvalidated; `undefined`
 *   (no policy file) allows no `.tsx` anywhere.
 * @returns One fault description per discrepancy, sorted by package; empty
 *   when they agree.
 * @example
 * ```ts
 * jsxPolicyFaults(
 *     { ui: ['mod.ts', 'button.tsx'] },
 *     { packages: { ui: { jsx: 'its consumers are JSX apps' } } },
 * )
 * // -> []
 * ```
 */
export function jsxPolicyFaults(
    published: Readonly<Record<string, readonly string[]>>,
    policy: unknown,
): string[] {
    const packages = isRecord(policy) && isRecord(policy.packages)
        ? policy.packages
        : {}
    const allowed: Record<string, unknown> = {}
    for (const [pkg, entry] of Object.entries(packages)) {
        if (isRecord(entry) && 'jsx' in entry) allowed[pkg] = entry.jsx
    }

    const faults: string[] = []
    const names = new Set([...Object.keys(published), ...Object.keys(allowed)])
    for (const pkg of [...names].sort()) {
        const tsx = (published[pkg] ?? []).filter((f) => f.endsWith('.tsx'))
            .sort()
        if (!(pkg in allowed)) {
            if (tsx.length === 0) continue
            const sample = tsx.slice(0, JSX_FAULT_SAMPLE).join(', ') +
                (tsx.length > JSX_FAULT_SAMPLE ? ', …' : '')
            faults.push(
                `${pkg}: publishes ${tsx.length} .tsx file(s) (${sample}), no "jsx" entry in deps.policy.jsonc`,
            )
            continue
        }
        const reason = allowed[pkg]
        if (typeof reason !== 'string' || reason.trim() === '') {
            faults.push(`${pkg}: "jsx" entry has no reason`)
            continue
        }
        if (tsx.length === 0) {
            faults.push(
                `${pkg}: "jsx" entry in deps.policy.jsonc, but no .tsx is published — remove the stale entry`,
            )
        }
    }
    return faults
}

/** A package staged in its published shape, with the manifest it shipped. */
interface StagedPackage {
    /** Short package name (its directory under `packages/`). */
    short: string
    /** The parsed `deno.json`. */
    manifest: Record<string, unknown>
    /** The relative paths `deno publish` would upload. */
    files: string[]
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
    return { short, manifest, files: published }
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

    const checked = classifyCheck(name, result.success, output)

    // Rule A (#463): `deno check` passes an unresolvable dynamic import, so
    // read Deno's own resolution of every dynamic edge. Run even when the
    // check failed, so one run names every fault.
    const dynamic = await dynamicEdgeFaults(root, entries)
    if (dynamic.length === 0) return checked
    return {
        name,
        ok: false,
        detail: [...(checked.ok ? [] : [checked.detail]), ...dynamic]
            .join('; '),
    }
}

/**
 * Run `deno info --json` over a staged package's exports and report every
 * dynamic edge Deno could not resolve.
 *
 * `deno info` takes one root file, so a graph root importing every export is
 * written beside them (the `deps_analyzer.ts` precedent). It resolves with the
 * same manifest, `links` and sentinels as `deno check`. It exits 0 even when
 * the graph holds errors, so its exit status only catches a failure to build
 * a graph at all — which is red, never skipped.
 *
 * @param root - The staged package directory.
 * @param entries - Its type-checkable export paths.
 * @returns One formatted fault per failed dynamic edge.
 */
async function dynamicEdgeFaults(
    root: string,
    entries: readonly string[],
): Promise<string[]> {
    await Deno.writeTextFile(
        join(root, GRAPH_ROOT_FILE),
        entries.map((entry) => `import './${entry.replace(/^\.\//, '')}'\n`)
            .join(''),
    )
    const result = await new Deno.Command(Deno.execPath(), {
        args: ['info', '--json', GRAPH_ROOT_FILE],
        cwd: root,
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    if (!result.success) {
        return [
            `unrecognised graph failure: deno info exited ${result.code}: ${
                firstLine(
                    stripAnsi(new TextDecoder().decode(result.stderr)),
                ) || 'no output'
            }`,
        ]
    }
    let info: unknown
    try {
        info = JSON.parse(new TextDecoder().decode(result.stdout))
    } catch (error) {
        return [
            `unrecognised graph failure: deno info printed no JSON: ${
                error instanceof Error ? error.message : String(error)
            }`,
        ]
    }
    try {
        return dynamicImportFaults(info, await Deno.realPath(root)).map(
            formatDynamicFault,
        )
    } catch (error) {
        return [error instanceof Error ? error.message : String(error)]
    }
}

/**
 * Read and parse `deps.policy.jsonc` once, for Rules B and C.
 *
 * An absent file is an empty policy; an unparseable one is a fault, never a
 * silent empty policy.
 *
 * @returns The parsed policy (`undefined` when absent or unparseable) and the
 *   fault describing a parse failure, if any.
 * @throws {Error} If the file exists but cannot be read.
 */
async function readPolicy(): Promise<{ policy: unknown; faults: string[] }> {
    let text: string
    try {
        text = await Deno.readTextFile(join(ROOT, 'deps.policy.jsonc'))
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return { policy: undefined, faults: [] }
        }
        throw error
    }
    try {
        return { policy: parseJsonc(text), faults: [] }
    } catch (error) {
        return {
            policy: undefined,
            faults: [
                `deps.policy.jsonc is unparseable: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            ],
        }
    }
}

/**
 * Rule B (#463): run the workspace `deno publish --dry-run` once, and compare
 * its unanalysable runtime-import sites with the `runtimeImports` inventory.
 *
 * `--no-check` because type checking is the per-package pass's; `--allow-dirty`
 * because a pre-push run has uncommitted state by design. The dry-run's exit
 * status counts: non-zero is red, named by its first error line.
 *
 * @param policy - The parsed `deps.policy.jsonc`, from {@link readPolicy}.
 * @returns One fault description per problem, empty when clean.
 */
async function runtimeImportCheck(policy: unknown): Promise<string[]> {
    const result = await new Deno.Command(Deno.execPath(), {
        args: ['publish', '--dry-run', '--no-check', '--allow-dirty'],
        cwd: ROOT,
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    const output = new TextDecoder().decode(result.stderr) +
        new TextDecoder().decode(result.stdout)

    const faults: string[] = []
    if (!result.success) {
        const plain = stripAnsi(output)
        const error = plain.split('\n').map((l) => l.trim())
            .find((l) => /^error(\[|:)/.test(l))
        faults.push(
            `deno publish --dry-run exited ${result.code}: ${
                error ?? firstLine(plain)
            }`,
        )
    }
    const diagnostics = runtimeImportSites(output, await Deno.realPath(ROOT))
    return [...faults, ...runtimeImportFaults(diagnostics, policy)]
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

    // Rule B (#463): one workspace dry-run, after every package, so a single
    // run reports the per-package faults and the runtime-import ones together.
    console.log(
        '\n🔎 Checking runtime imports (workspace deno publish --dry-run)...',
    )
    const { policy, faults: policyFaults } = await readPolicy()
    const runtimeFaults = [
        ...policyFaults,
        ...await runtimeImportCheck(policy),
    ]
    console.log(
        runtimeFaults.length === 0
            ? '  ✅ every unanalysable import site is inventoried'
            : `  ❌ ${runtimeFaults.length} runtime-import fault(s)`,
    )

    // Rule C (#470): every published .tsx is allowed, with a reason, by policy.
    console.log('\n🔎 Checking published .tsx files against the jsx policy...')
    const jsxFaults = jsxPolicyFaults(
        Object.fromEntries(staged.map(({ short, files }) => [short, files])),
        policy,
    )
    console.log(
        jsxFaults.length === 0
            ? '  ✅ every published .tsx is allowed by deps.policy.jsonc'
            : `  ❌ ${jsxFaults.length} jsx-policy fault(s)`,
    )

    // Registry existence is a PRE-PUBLISH gate, not a pre-push one: a package
    // that has never been created on JSR is only a problem at publish time, and
    // failing every push over it would block unrelated work. Hence the flag —
    // `publish.yml` passes it, CI and the pre-push hook do not.
    const verdict = resolutionVerdict(results, runtimeFaults, jsxFaults)
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
