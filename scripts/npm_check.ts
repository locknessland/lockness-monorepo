#!/usr/bin/env -S deno run -A
/**
 * @fileoverview `npm:check` — proves each staged npm package works as npm
 * will ship it, before anything is published (plan 274 §5 rows 172, 229,
 * 236; T017; disposition E). A gate step, right after `npm:build`.
 *
 * Scope: every non-private package whose `engines` names bun or node
 * ({@link npmScope}) — the same predicate `npm:build` builds. Today that is
 * `@lockness/transform` alone. For each one, from its staged directory under
 * `_npm/`:
 *
 * 1. **Scope rule.** Its `package.json` `lockness.jsr` is empty: a package that
 *    names bun or node has no runtime JSR import left (hard rule #2).
 * 2. **Pack.** `npm pack --ignore-scripts` of the staged directory — never of
 *    the source directory. The staged manifest must equal what
 *    `publishedManifest()` maps today, or the staging is stale.
 * 3. **Content.** The packed `package.json` has a `files` allowlist, no
 *    `scripts` (so no lifecycle script), no `devDependencies`, no `lockness`
 *    key and no `jsr:` range in any field. The listing has a README and a
 *    LICENSE, and no tests, fixtures, `.env*`, `*.key`, `.npmrc` or
 *    `.tsbuildinfo`.
 * 4. **Install, registry-free.** Every tarball is unpacked into one temp
 *    `node_modules`; each package's declared third-party dependencies are
 *    linked from the frozen install (`deno install --frozen`), and nothing
 *    else. No npm cache, no network (row 236). A sibling dependency outside
 *    the scope is a fault.
 * 5. **Closure.** No `@jsr/*` or `@std/*` package and no `jsr:` range anywhere
 *    in the installed dependency tree; no `jsr:`, `@std/` or `@jsr/` import in
 *    a packed file; no relative `.ts` specifier left in packed JavaScript.
 * 6. **Import.** Every export is imported on each of bun and node the package's
 *    `engines` names. For `@lockness/transform` that includes
 *    `@lockness/transform/register` on Node (#619's built-register criterion).
 * 7. **Types.** A consumer file importing every export is type-checked with
 *    `tsc` (`nodenext`, `strict`, no `skipLibCheck`) against the packed
 *    `.d.ts`.
 *
 * **Prerequisites.** npm and Node, and Bun once a scoped package names it. A
 * missing one fails the step and names its pin file (`.node-version`,
 * `.bun-version`); it never skips. `tar` unpacks the tarballs; TypeScript and
 * `@types/node` come from the root `devDependencies` in `node_modules`.
 *
 * The script uses `node:` built-ins only (FR-016).
 *
 * Exit codes: `0` every package passed (or none is in scope), `1` a fault.
 *
 * @example
 * ```bash
 * deno task npm:build && deno task npm:check
 * ```
 *
 * @module
 */

import { spawn } from 'node:child_process'
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
    type Member,
    npmScope,
    type PackageManifest,
    publishedManifest,
    readMembers,
    stagingDirOf,
} from './manifests.ts'
import { LICENSE_FILE, README_FILE } from './npm_stage.ts'

/** A runtime `npm:check` imports the packed exports on. */
export type NpmRuntime = 'bun' | 'node'

/** A tool `npm:check` needs, and the file that pins its version. */
export const PIN_FILES: Readonly<Record<NpmRuntime | 'npm', string>> = {
    node: '.node-version',
    bun: '.bun-version',
    // npm ships with Node: the Node pin decides it.
    npm: '.node-version',
}

/**
 * The environment variables every child of `npm:check` inherits — the
 * version probes, `npm pack`, `tar`, the import probe and the consumer `tsc` —
 * and no other: a runtime needs its `PATH`, a home and a temp directory
 * (`SystemRoot` and `USERPROFILE` on Windows). Everything else stays out —
 * `NODE_OPTIONS`, `NODE_PATH` and any secret of the calling shell.
 */
export const CHILD_ENV_NAMES: readonly string[] = [
    'PATH',
    'HOME',
    'TMPDIR',
    'TEMP',
    'TMP',
    'SystemRoot',
    'USERPROFILE',
]

/**
 * The allowlisted environment a packed package is imported and type-checked
 * under. `APP_ENV` in particular must be absent: `@lockness/transform`'s
 * register refuses to run when it says production.
 *
 * @param source - The calling process's environment.
 * @returns Only the {@link CHILD_ENV_NAMES} that are set.
 *
 * @example
 * ```ts
 * childEnv({ PATH: '/usr/bin', APP_ENV: 'production', NODE_OPTIONS: '--x' })
 * // { PATH: '/usr/bin' }
 * ```
 */
export function childEnv(
    source: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
    const env: Record<string, string> = {}
    for (const name of CHILD_ENV_NAMES) {
        const value = source[name]
        if (value !== undefined) env[name] = value
    }
    return env
}

/**
 * The major version a version string or pin file states.
 *
 * @param text - e.g. `v24.22.0`, `1.4.3\n`.
 * @returns The major, or `null` when the text starts with no number.
 */
function majorOf(text: string): number | null {
    const match = /^\s*v?(\d+)/.exec(text)
    return match === null ? null : Number(match[1])
}

/**
 * Whether an installed runtime matches the major its pin file names.
 *
 * @param tool - The runtime.
 * @param version - What `<tool> --version` printed.
 * @param pin - The pin file's content, or `null` when it is missing.
 * @returns A fault naming the pin file, or `null` when the majors agree.
 *
 * @example
 * ```ts
 * pinnedMajorFault('node', 'v22.1.0\n', '24.22.0\n')
 * // 'node v22.1.0 does not match the major pinned in .node-version (24): …'
 * ```
 */
export function pinnedMajorFault(
    tool: NpmRuntime,
    version: string,
    pin: string | null,
): string | null {
    const file = PIN_FILES[tool]
    const wanted = pin === null ? null : majorOf(pin)
    if (wanted === null) {
        return `${file} states no version, so npm:check cannot verify ${tool}`
    }
    if (majorOf(version) === wanted) return null
    return `${tool} ${version.trim()} does not match the major pinned in ${file} (${wanted}): install the version pinned in ${file}`
}

/** Lifecycle scripts npm runs on install or publish. */
const LIFECYCLE_SCRIPTS = [
    'preinstall',
    'install',
    'postinstall',
    'prepare',
    'prepack',
    'postpack',
    'prepublish',
    'prepublishOnly',
    'publish',
    'postpublish',
]

/** Paths a published tarball never carries (plan §5 row 229). */
const FORBIDDEN_PATHS: readonly [RegExp, string][] = [
    [/(^|\/)(tests?|__tests__)\//, 'a test directory'],
    [/(^|\/)fixtures?\//, 'a fixture directory'],
    [/(^|\/)[^/]*[._]test\.[cm]?[jt]sx?$/, 'a test file'],
    [/(^|\/)\.env[^/]*$/, 'an .env file'],
    [/\.key$/, 'a key file'],
    [/(^|\/)\.npmrc$/, 'an .npmrc'],
    [/\.tsbuildinfo$/, "tsc's build state"],
]

/**
 * A JSR-only specifier inside a packed file: `jsr:…`, `@std/…` or `@jsr/…`,
 * quoted after `from`, `import`, `import(` or `require(`.
 */
const JSR_SPECIFIER =
    /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"]((?:jsr:|@std\/|@jsr\/)[^'"]*)['"]/g

/** A relative specifier still ending in a TypeScript source extension. */
const RELATIVE_TS_SPECIFIER =
    /(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]*\.(?:ts|tsx|mts|cts))['"]/g

/**
 * The bun and node runtimes a package's `engines` names.
 *
 * @param pkg - A manifest.
 * @returns The runtimes to import its exports on, in a fixed order.
 *
 * @example
 * ```ts
 * runtimesToProve({ engines: { deno: '>=2.2', node: '>=22.15' } })  // ['node']
 * ```
 */
export function runtimesToProve(pkg: PackageManifest): NpmRuntime[] {
    const engines = pkg.engines ?? {}
    return (['bun', 'node'] as const).filter((r) => Object.hasOwn(engines, r))
}

/**
 * The specifiers a consumer imports a package's exports by.
 *
 * @param pkg - A named manifest.
 * @returns `.` as the name, `./x` as `<name>/x`, in `exports` order.
 *
 * @example
 * ```ts
 * exportSpecifiers({ name: '@lockness/transform', exports: { '.': …, './register': … } })
 * // ['@lockness/transform', '@lockness/transform/register']
 * ```
 */
export function exportSpecifiers(pkg: PackageManifest): string[] {
    return Object.keys(pkg.exports ?? {}).map((subpath) =>
        subpath === '.' ? `${pkg.name}` : `${pkg.name}/${subpath.slice(2)}`
    )
}

/**
 * The scope rule on a source `package.json`: a package in the npm scope has
 * no runtime JSR import left, so its `lockness.jsr` is empty.
 *
 * @param pkg - A scoped member's manifest.
 * @returns One message per fault.
 *
 * @example
 * ```ts
 * scopeFaults({ name: '@lockness/a', lockness: { jsr: { '@std/path': '^1' } } })
 * // ['@lockness/a: lockness.jsr lists @std/path, …']
 * ```
 */
export function scopeFaults(pkg: PackageManifest): string[] {
    return Object.keys(pkg.lockness?.jsr ?? {}).map((name) =>
        `${pkg.name}: lockness.jsr lists ${name}, but a package whose engines names bun or node has no runtime JSR import (hard rule #2)`
    )
}

/**
 * Whether a dependency name or range reaches a JSR-only package.
 *
 * @param name - The dependency name.
 * @param range - Its range.
 * @returns `true` for `@jsr/*`, `@std/*`, a `jsr:` range or an
 *   `npm:@jsr/…` alias.
 */
function isJsrDependency(name: string, range: string): boolean {
    return name.startsWith('@jsr/') || name.startsWith('@std/') ||
        range.startsWith('jsr:') || range.startsWith('npm:@jsr/')
}

/**
 * Every string in a JSON value that is a `jsr:` specifier, with its path.
 *
 * @param value - Any JSON value.
 * @param path - Where the value sits, for messages.
 * @returns `<path>: <value>` per `jsr:` string, keys included.
 */
function jsrStrings(value: unknown, path: string): string[] {
    if (typeof value === 'string') {
        return value.includes('jsr:') ? [`${path}: ${value}`] : []
    }
    if (Array.isArray(value)) {
        return value.flatMap((v, i) => jsrStrings(v, `${path}[${i}]`))
    }
    if (typeof value === 'object' && value !== null) {
        return Object.entries(value).flatMap(([k, v]) => [
            ...(k.includes('jsr:') ? [`${path} key: ${k}`] : []),
            ...jsrStrings(v, `${path}.${k}`),
        ])
    }
    return []
}

/**
 * The content rules on a packed `package.json` (plan §5 rows 225, 229).
 *
 * @param label - The package, for messages.
 * @param manifest - The parsed `package.json` from the tarball.
 * @returns One message per fault, empty when clean.
 *
 * @example
 * ```ts
 * packedManifestFaults('@lockness/a', { name: '@lockness/a', scripts: { postinstall: 'x' } })
 * // ['@lockness/a: the packed package.json has no "files" allowlist', '…lifecycle script postinstall…']
 * ```
 */
export function packedManifestFaults(
    label: string,
    manifest: unknown,
): string[] {
    if (
        typeof manifest !== 'object' || manifest === null ||
        Array.isArray(manifest)
    ) {
        return [`${label}: the packed package.json is not a JSON object`]
    }
    const m = manifest as Record<string, unknown>
    const faults: string[] = []
    if (!Array.isArray(m.files) || m.files.length === 0) {
        faults.push(
            `${label}: the packed package.json has no "files" allowlist`,
        )
    }
    if (m.scripts !== undefined) {
        const names = typeof m.scripts === 'object' && m.scripts !== null
            ? Object.keys(m.scripts)
            : []
        const lifecycle = names.filter((n) => LIFECYCLE_SCRIPTS.includes(n))
        faults.push(
            lifecycle.length > 0
                ? `${label}: the packed package.json carries the lifecycle script(s) ${
                    lifecycle.join(', ')
                }`
                : `${label}: the packed package.json carries "scripts"; a published manifest has none`,
        )
    }
    for (const key of ['devDependencies', 'lockness']) {
        if (key in m) {
            faults.push(`${label}: the packed package.json carries "${key}"`)
        }
    }
    for (const found of jsrStrings(m, 'package.json')) {
        faults.push(`${label}: a jsr: specifier in the packed ${found}`)
    }
    for (
        const field of [
            'dependencies',
            'peerDependencies',
            'optionalDependencies',
        ]
    ) {
        const deps = m[field]
        if (typeof deps !== 'object' || deps === null) continue
        for (const [name, range] of Object.entries(deps)) {
            if (isJsrDependency(name, String(range))) {
                faults.push(
                    `${label}: ${field} declares the JSR-only package ${name}`,
                )
            }
        }
    }
    return faults
}

/**
 * The content rules on a tarball listing (plan §5 row 229).
 *
 * @param label - The package, for messages.
 * @param paths - Each packed path, relative to the package root.
 * @returns One message per forbidden path.
 *
 * @example
 * ```ts
 * listingFaults('@lockness/a', ['package.json', 'dist/mod.js', '.env'])
 * // ['@lockness/a: the tarball carries .env (an .env file)']
 * ```
 */
export function listingFaults(
    label: string,
    paths: readonly string[],
): string[] {
    const faults: string[] = []
    for (const path of paths) {
        for (const [pattern, what] of FORBIDDEN_PATHS) {
            if (!pattern.test(path)) continue
            faults.push(`${label}: the tarball carries ${path} (${what})`)
            break
        }
    }
    return faults
}

/**
 * The files npm consumers expect in every tarball: a README and a licence at
 * the package root.
 *
 * @param label - The package, for messages.
 * @param paths - Each packed path, relative to the package root.
 * @returns One message per missing file.
 *
 * @example
 * ```ts
 * requiredFilesFaults('@lockness/a', ['package.json', 'README.md'])
 * // ['@lockness/a: the tarball has no LICENSE']
 * ```
 */
export function requiredFilesFaults(
    label: string,
    paths: readonly string[],
): string[] {
    const faults: string[] = []
    if (!paths.some((path) => README_FILE.test(path))) {
        faults.push(`${label}: the tarball has no README`)
    }
    if (!paths.some((path) => LICENSE_FILE.test(path))) {
        faults.push(`${label}: the tarball has no LICENSE`)
    }
    return faults
}

/**
 * The closure and specifier rules on one packed source file.
 *
 * @param label - The package, for messages.
 * @param path - The file, relative to the package root.
 * @param text - Its content.
 * @returns One message per JSR-only import, and, in JavaScript only, per
 *   relative `.ts` specifier. A `.d.ts` keeps tsc's `.ts` specifiers by
 *   design: TypeScript resolves them to the `.d.ts` beside it.
 *
 * @example
 * ```ts
 * sourceFaults('@lockness/a', 'dist/mod.js', "import { join } from '@std/path'")
 * // ["@lockness/a: dist/mod.js imports the JSR-only @std/path"]
 * ```
 */
export function sourceFaults(
    label: string,
    path: string,
    text: string,
): string[] {
    const faults: string[] = []
    for (const [, specifier] of text.matchAll(JSR_SPECIFIER)) {
        faults.push(`${label}: ${path} imports the JSR-only ${specifier}`)
    }
    if (!/\.[cm]?js$/.test(path)) return faults
    for (const [, specifier] of text.matchAll(RELATIVE_TS_SPECIFIER)) {
        if (specifier.endsWith('.d.ts')) continue
        faults.push(
            `${label}: ${path} carries the .ts specifier ${specifier}; npm consumers need .js`,
        )
    }
    return faults
}

/**
 * The module each runtime runs to import every export.
 *
 * @param specifiers - The export specifiers.
 * @returns An ES module importing each one in turn.
 *
 * @example
 * ```ts
 * importProbe(['@lockness/transform'])
 * // "await import(\"@lockness/transform\")\nconsole.log(…)\n"
 * ```
 */
export function importProbe(specifiers: readonly string[]): string {
    return [
        ...specifiers.map((s) => `await import(${JSON.stringify(s)})`),
        `console.log(${
            JSON.stringify(`imported ${specifiers.length} export(s)`)
        })`,
        '',
    ].join('\n')
}

/**
 * The consumer file type-checked against the packed `.d.ts`.
 *
 * @param specifiers - Every export specifier in scope.
 * @returns A TypeScript module importing each export as a namespace.
 *
 * @example
 * ```ts
 * consumerSource(['@lockness/transform'])
 * // "import * as e0 from \"@lockness/transform\"\nexport const all = [e0]\n"
 * ```
 */
export function consumerSource(specifiers: readonly string[]): string {
    return [
        ...specifiers.map((s, i) =>
            `import * as e${i} from ${JSON.stringify(s)}`
        ),
        `export const all = [${specifiers.map((_, i) => `e${i}`).join(', ')}]`,
        '',
    ].join('\n')
}

/** The consumer project's compiler options: a strict npm consumer. */
export const CONSUMER_TSCONFIG = {
    compilerOptions: {
        target: 'ES2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: ['node'],
    },
    files: ['consumer.ts'],
} as const

/** What one spawned command produced. */
export interface RunResult {
    /** The exit code; `null` when the command could not start or was killed. */
    code: number | null
    /** Its standard output. */
    stdout: string
    /** Its standard error. */
    stderr: string
    /** `true` when the executable was not found. */
    missing: boolean
}

/**
 * Runs a command; injected so the missing-runtime rule is testable.
 *
 * @param command - The executable.
 * @param args - Its arguments.
 * @param options - Working directory and environment.
 * @returns What it produced.
 */
export type Runner = (
    command: string,
    args: readonly string[],
    options: { cwd: string; env?: Record<string, string> },
) => Promise<RunResult>

/**
 * Spawn a command, capturing its output.
 *
 * @param command - The executable.
 * @param args - Its arguments.
 * @param options - Working directory and environment.
 * @returns What it produced; `missing` on ENOENT.
 */
export const spawnCapture: Runner = (command, args, options) =>
    new Promise((resolve) => {
        const child = spawn(command, [...args], {
            cwd: options.cwd,
            env: options.env ?? process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk) => stdout += chunk)
        child.stderr.on('data', (chunk) => stderr += chunk)
        child.on('error', (error: NodeJS.ErrnoException) => {
            resolve({
                code: null,
                stdout,
                stderr: stderr + error.message,
                missing: error.code === 'ENOENT',
            })
        })
        child.on('close', (code) => {
            resolve({ code, stdout, stderr, missing: false })
        })
    })

/**
 * The last lines of a command's output, for a fault message.
 *
 * @param result - The command's result.
 * @returns Up to 12 lines.
 */
function tail(result: RunResult): string {
    return `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-12)
        .join('\n      ')
}

/**
 * Whether a path exists, without following a final symlink.
 *
 * @param path - The path.
 * @returns `true` when something is there.
 */
async function exists(path: string): Promise<boolean> {
    try {
        await lstat(path)
        return true
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
        throw error
    }
}

/**
 * Resolve a package the way Node does from `fromDir`: the nearest
 * `node_modules/<name>` up the tree, to its real path.
 *
 * @param name - The package name.
 * @param fromDir - The directory to start from.
 * @param stopAt - A directory not to search above.
 * @returns The package's real directory, or `null` when not installed.
 */
async function resolvePackage(
    name: string,
    fromDir: string,
    stopAt: string,
): Promise<string | null> {
    let dir = fromDir
    while (true) {
        const candidate = join(dir, 'node_modules', name)
        if (await exists(candidate)) return await realpath(candidate)
        if (dir === stopAt || dirname(dir) === dir) return null
        dir = dirname(dir)
    }
}

/** A `package.json` as the closure walk reads it. */
interface InstalledManifest {
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

/**
 * Walk the installed dependency tree under the linked third-party packages,
 * refusing any JSR-only package in it.
 *
 * @param label - The package the walk starts for, for messages.
 * @param start - Real directories of its linked third-party dependencies.
 * @param root - The workspace root, the top of every resolution.
 * @returns One message per JSR-only or uninstalled dependency.
 */
async function closureFaults(
    label: string,
    start: readonly string[],
    root: string,
): Promise<string[]> {
    const faults: string[] = []
    const seen = new Set<string>()
    const queue = [...start]
    while (queue.length > 0) {
        const dir = queue.shift() as string
        if (seen.has(dir)) continue
        seen.add(dir)
        const manifest: InstalledManifest = JSON.parse(
            await readFile(join(dir, 'package.json'), 'utf8'),
        )
        const optionalPeers = new Set(
            Object.entries(manifest.peerDependenciesMeta ?? {})
                .filter(([, meta]) => meta.optional === true)
                .map(([name]) => name),
        )
        const edges: [string, string, boolean][] = [
            ...Object.entries(manifest.dependencies ?? {}).map((
                [n, r],
            ): [string, string, boolean] => [n, r, true]),
            ...Object.entries(manifest.optionalDependencies ?? {}).map((
                [n, r],
            ): [string, string, boolean] => [n, r, false]),
            ...Object.entries(manifest.peerDependencies ?? {}).map((
                [n, r],
            ): [string, string, boolean] => [n, r, !optionalPeers.has(n)]),
        ]
        for (const [name, range, required] of edges) {
            if (isJsrDependency(name, range)) {
                faults.push(
                    `${label}: its dependency closure reaches the JSR-only ${name} (${range}) through ${dir}`,
                )
                continue
            }
            const next = await resolvePackage(name, dir, root)
            if (next !== null) queue.push(next)
            else if (required) {
                faults.push(
                    `${label}: ${name}, required from ${dir}, is not in the frozen install`,
                )
            }
        }
    }
    return faults
}

/** Options for {@link checkNpm}. */
export interface NpmCheckOptions {
    /** Where TypeScript and `@types/node` are installed; defaults to `root`. */
    toolsRoot?: string
    /** Spawns commands; defaults to {@link spawnCapture}. */
    run?: Runner
    /** Prints progress. */
    log?: (line: string) => void
}

/**
 * Run every rule over every package in the npm scope.
 *
 * @param root - The workspace root.
 * @param options - Tools location, runner and logger.
 * @returns One message per fault, empty when every package passed.
 * @throws {Error} When the workspace manifests cannot be read.
 *
 * @example
 * ```ts
 * const faults = await checkNpm('.')
 * ```
 */
export async function checkNpm(
    root: string,
    options: NpmCheckOptions = {},
): Promise<string[]> {
    const run = options.run ?? spawnCapture
    const log = options.log ?? (() => {})
    const toolsRoot = options.toolsRoot ?? root
    const scope = npmScope(await readMembers(root))
    if (scope.length === 0) {
        log('npm:check: no package names bun or node; nothing to check')
        return []
    }
    const faults: string[] = []
    // Every child — the probes, npm, tar, the imports, tsc — runs under one
    // allowlisted environment. No APP_ENV: transform refuses production.
    const env = childEnv(process.env)

    // Prerequisites: npm, Node (npm and tsc run on it), every named runtime.
    const tools = new Set<NpmRuntime | 'npm'>(['npm', 'node'])
    for (const { pkg } of scope) {
        for (const runtime of runtimesToProve(pkg)) tools.add(runtime)
    }
    for (const tool of tools) {
        const result = await run(tool, ['--version'], { cwd: root, env })
        if (result.missing || result.code !== 0) {
            faults.push(
                `${tool} is required by npm:check but is not installed: install the version pinned in ${
                    PIN_FILES[tool]
                }`,
            )
            continue
        }
        // npm ships with Node; only the runtimes carry a pin of their own.
        if (tool === 'npm') continue
        const pin = await readFile(join(toolsRoot, PIN_FILES[tool]), 'utf8')
            .catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return null
                throw error
            })
        const mismatch = pinnedMajorFault(tool, result.stdout, pin)
        if (mismatch !== null) faults.push(mismatch)
    }
    if (faults.length > 0) return faults

    for (const { pkg } of scope) faults.push(...scopeFaults(pkg))

    const temp = await mkdtemp(join(tmpdir(), 'lockness-npm-check-'))
    try {
        const tarballs = join(temp, 'tarballs')
        const consumer = join(temp, 'consumer')
        const modules = join(consumer, 'node_modules')
        await mkdir(tarballs, { recursive: true })
        await mkdir(modules, { recursive: true })
        await writeFile(
            join(consumer, 'package.json'),
            JSON.stringify({ private: true, type: 'module' }) + '\n',
        )

        const installed: Member[] = []
        for (const member of scope) {
            const label = member.pkg.name as string
            const staged = join(root, stagingDirOf(member))
            const stagedFaults = await stagedManifestFaults(member, staged)
            if (stagedFaults.length > 0) {
                faults.push(...stagedFaults)
                continue
            }
            log(`── ${label}: npm pack ${stagingDirOf(member)}`)
            const pack = await run('npm', [
                'pack',
                staged,
                '--json',
                '--ignore-scripts',
                '--pack-destination',
                tarballs,
            ], { cwd: temp, env })
            if (pack.code !== 0) {
                faults.push(`${label}: npm pack failed:\n      ${tail(pack)}`)
                continue
            }
            const [packed] = JSON.parse(pack.stdout) as {
                filename: string
                files: { path: string }[]
            }[]
            const paths = packed.files.map((f) => f.path)
            faults.push(...listingFaults(label, paths))
            faults.push(...requiredFilesFaults(label, paths))

            const target = join(modules, label)
            await mkdir(target, { recursive: true })
            const untar = await run('tar', [
                '-xzf',
                join(tarballs, packed.filename),
                '-C',
                target,
                '--strip-components=1',
            ], { cwd: temp, env })
            if (untar.code !== 0) {
                faults.push(
                    `${label}: tar could not unpack ${packed.filename}:\n      ${
                        tail(untar)
                    }`,
                )
                continue
            }
            const manifest: unknown = JSON.parse(
                await readFile(join(target, 'package.json'), 'utf8'),
            )
            faults.push(...packedManifestFaults(label, manifest))
            for (const path of paths) {
                if (!/\.(?:[cm]?js|d\.[cm]?ts)$/.test(path)) continue
                const text = await readFile(join(target, path), 'utf8')
                faults.push(...sourceFaults(label, path, text))
            }
            installed.push(member)
        }

        // Link each package's declared third-party dependencies, and nothing
        // else, from the frozen install.
        const scopeNames = new Set(scope.map((m) => m.pkg.name))
        const linked = new Map<string, string>()
        for (const member of installed) {
            const label = member.pkg.name as string
            const optional = new Set(
                Object.entries(member.pkg.peerDependenciesMeta ?? {})
                    .filter(([, meta]) => meta.optional === true)
                    .map(([name]) => name),
            )
            const declared = [
                ...Object.keys(member.pkg.dependencies ?? {}),
                ...Object.keys(member.pkg.peerDependencies ?? {})
                    .filter((name) => !optional.has(name)),
            ]
            const starts: string[] = []
            for (const name of declared) {
                if (name.startsWith('@lockness/')) {
                    if (!scopeNames.has(name)) {
                        faults.push(
                            `${label}: its dependency ${name} is not in the npm scope (its engines must name bun or node, and it must not be private)`,
                        )
                    }
                    continue
                }
                const source = await resolvePackage(
                    name,
                    join(root, member.dir),
                    root,
                )
                if (source === null) {
                    faults.push(
                        `${label}: its dependency ${name} is not in the frozen install; run deno install --frozen`,
                    )
                    continue
                }
                starts.push(source)
                const already = linked.get(name)
                if (already !== undefined) {
                    if (already !== source) {
                        faults.push(
                            `${label}: ${name} resolves to ${source}, another scoped package to ${already}`,
                        )
                    }
                    continue
                }
                await mkdir(dirname(join(modules, name)), { recursive: true })
                await symlink(source, join(modules, name), 'dir')
                linked.set(name, source)
            }
            faults.push(...await closureFaults(label, starts, root))
        }
        if (faults.length > 0) return faults

        // Import every export on each runtime its engines names.
        for (const runtime of ['node', 'bun'] as const) {
            const specifiers = installed
                .filter((m) => runtimesToProve(m.pkg).includes(runtime))
                .flatMap((m) => exportSpecifiers(m.pkg))
            if (specifiers.length === 0) continue
            const probe = `import_probe_${runtime}.mjs`
            await writeFile(join(consumer, probe), importProbe(specifiers))
            log(`── import ${specifiers.join(', ')} on ${runtime}`)
            const result = await run(runtime, [probe], { cwd: consumer, env })
            if (result.code !== 0) {
                faults.push(
                    `importing ${
                        specifiers.join(', ')
                    } on ${runtime} failed:\n      ${tail(result)}`,
                )
            }
        }

        // Type-check a consumer against the packed declarations.
        const typesNode = await resolvePackage(
            '@types/node',
            toolsRoot,
            toolsRoot,
        )
        const tsc = join(toolsRoot, 'node_modules/typescript/lib/tsc.js')
        if (typesNode === null || !await exists(tsc)) {
            faults.push(
                'npm:check needs typescript and @types/node from the root devDependencies; run deno install --frozen',
            )
            return faults
        }
        if (!linked.has('@types/node')) {
            await mkdir(join(modules, '@types'), { recursive: true })
            await symlink(typesNode, join(modules, '@types/node'), 'dir')
        }
        const specifiers = installed.flatMap((m) => exportSpecifiers(m.pkg))
        await writeFile(
            join(consumer, 'consumer.ts'),
            consumerSource(specifiers),
        )
        await writeFile(
            join(consumer, 'tsconfig.json'),
            JSON.stringify(CONSUMER_TSCONFIG, null, 4) + '\n',
        )
        log(`── type-check a consumer of ${specifiers.join(', ')}`)
        const check = await run('node', [tsc, '-p', 'tsconfig.json'], {
            cwd: consumer,
            env,
        })
        if (check.code !== 0) {
            faults.push(
                `a consumer importing ${
                    specifiers.join(', ')
                } does not type-check against the packed .d.ts:\n      ${
                    tail(check)
                }`,
            )
        }
        return faults
    } finally {
        await rm(temp, { recursive: true, force: true })
    }
}

/**
 * The staged manifest must be what `publishedManifest()` maps today.
 *
 * @param member - A scoped member.
 * @param staged - Its staged directory.
 * @returns One message when the staging is missing or stale.
 */
async function stagedManifestFaults(
    member: Member,
    staged: string,
): Promise<string[]> {
    const label = member.pkg.name as string
    let text: string
    try {
        text = await readFile(join(staged, 'package.json'), 'utf8')
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        return [
            `${label}: ${
                stagingDirOf(member)
            } is not staged; run deno task npm:build`,
        ]
    }
    const expected = JSON.stringify(publishedManifest(member.pkg), null, 4) +
        '\n'
    return text === expected ? [] : [
        `${label}: ${
            stagingDirOf(member)
        }/package.json is stale; run deno task npm:build`,
    ]
}

/**
 * Run the check and decide the exit code.
 *
 * @param root - The workspace root.
 * @param options - See {@link checkNpm}.
 * @returns `0` when every package passed or none is in scope, `1` otherwise.
 *
 * @example
 * ```ts
 * process.exitCode = await main()
 * ```
 */
export async function main(
    root: string = fileURLToPath(new URL('..', import.meta.url)),
    options: NpmCheckOptions = { log: (line) => console.log(line) },
): Promise<number> {
    const faults = await checkNpm(root, options)
    if (faults.length > 0) {
        console.error(`❌ npm:check: ${faults.length} fault(s):`)
        for (const fault of faults) console.error(`   ${fault}`)
        return 1
    }
    console.log('✅ npm:check passed')
    return 0
}

if (import.meta.main) {
    process.exitCode = await main()
}
