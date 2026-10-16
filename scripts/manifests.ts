#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Generates every workspace member's `deno.json`,
 * `tsconfig.json` and own-version module from its `package.json`.
 *
 * **`packages/<pkg>/package.json` is the one hand-edited manifest** (plan §5,
 * "Package facts"). It names the package, its version, its dependencies, its
 * optional peers, the runtimes it is proven on (`engines`) and its exports.
 * Everything Deno and JSR need that npm has no field for lives under one
 * `lockness` key:
 *
 * | `lockness.<key>`  | Becomes, in `deno.json` |
 * | :---------------- | :---------------------- |
 * | `jsr`             | `imports` entries `jsr:<name>@<range>` — the JSR-only packages (`@std/*`, `@libs/*`), which npm cannot express |
 * | `imports`         | extra `imports` entries: an alias or a subpath of a declared package, `"key": "<package>[/subpath]"`, given that package's declared range |
 * | `publish`         | `publish` (JSR include/exclude filters) |
 * | `compilerOptions` | `compilerOptions` (the per-package JSX options) |
 * | `tasks`, `lint`   | copied as they are |
 * | `versionModule`   | `true` writes `version.generated.ts`, exporting `VERSION` |
 *
 * `dependencies` become `imports` too: a `@lockness/*` sibling as
 * `jsr:@lockness/<pkg>@<range>`, anything else as `npm:<name>@<range>`. Optional
 * peers and dev dependencies do not: an optional peer is loaded through the
 * app's import map, and a test dependency resolves by workspace member name.
 * Each `exports` entry carries a `lockness-source` condition naming the `.ts`
 * source; `deno.json` exports exactly that. Top-level `//…` comment keys are
 * carried over.
 *
 * Two entries are always added to a package's `publish.exclude`:
 * `package.json` and `tsconfig.json`. `deno publish` uploads every file it is
 * not told to skip, and neither file belongs in the JSR package — a staged
 * `package.json` would also make `publish:check` resolve the package's npm
 * dependencies instead of its `deno.json`.
 *
 * `tsconfig.json` is the tsc project graph: a composite project per package,
 * referencing the siblings it depends on.
 *
 * **The generated files are committed.** The publish job holding the id-token
 * may not generate anything (#476), so what it publishes is what is in git.
 *
 * `--check` writes nothing and fails when any of these hold:
 *
 * - a generated file differs from what `package.json` produces;
 * - `engines` is not monotonic: a package names a runtime that one of its
 *   static, optional-peer or test dependencies does not (plan §6 invariant);
 * - `deno.lock` resolves any `@lockness/*` package from a registry — every one
 *   must resolve to a workspace member (plan §5, "One lockfile").
 *
 * Optional peers are a package's soft edges. Whether each one is allowed is
 * not this script's question: `deps.policy.jsonc` `soft` is the permission,
 * and `deps:analyze` checks every optional peer against it.
 *
 * @example
 * ```bash
 * deno task manifests           # regenerate
 * deno task manifests --check   # the gate step
 * ```
 *
 * @module
 */

import { join, relative } from '@std/path'

/** One `exports` entry: the `.ts` source, and the built file for npm. */
export interface ExportConditions {
    /** The TypeScript source, used by Deno, JSR and workspace development. */
    'lockness-source': string
    /** The built JavaScript an npm consumer resolves. */
    default: string
}

/** The Deno- and JSR-only facts of a package, under `package.json` `lockness`. */
export interface LocknessKey {
    /** JSR-only packages, name to range: become `jsr:<name>@<range>`. */
    jsr?: Record<string, string>
    /** Extra import-map keys, each naming a declared package and a subpath. */
    imports?: Record<string, string>
    /** JSR publish filters. */
    publish?: { include?: string[]; exclude?: string[] }
    /** Compiler options for Deno — the per-package JSX settings. */
    compilerOptions?: { jsx?: string; jsxImportSource?: string }
    /** `deno task` entries. */
    tasks?: Record<string, string>
    /** Per-member `deno lint` settings, copied as they are. */
    lint?: Record<string, unknown>
    /** Whether to generate `version.generated.ts`. */
    versionModule?: boolean
}

/** A workspace member's `package.json`, as this generator reads it. */
export interface PackageManifest {
    /** The package name; absent for an app member such as the vite demo. */
    name?: string
    /** The lockstep version; absent for an app member. */
    version?: string
    /** One-line description. */
    description?: string
    /** SPDX licence. */
    license?: string
    /** Keeps the member off npm. */
    private?: boolean
    /** Always `module`. */
    type?: 'module'
    /** Subpath to conditions. */
    exports?: Record<string, ExportConditions>
    /** The npm tarball allowlist. */
    files?: string[]
    /** Runtime to version range: the runtimes the package is proven on. */
    engines?: Record<string, string>
    /** Runtime dependencies. */
    dependencies?: Record<string, string>
    /** Peers: the optional ones are packages loaded only when configured. */
    peerDependencies?: Record<string, string>
    /** Which peers are optional. */
    peerDependenciesMeta?: Record<string, { optional?: boolean }>
    /** Packages only the tests import. */
    devDependencies?: Record<string, string>
    /** The Deno- and JSR-only facts. */
    lockness?: LocknessKey
    /** Comment keys, carried into `deno.json`. */
    [comment: `//${string}`]: string
}

/** A generated `deno.json`. */
export interface DenoJson {
    /** Package name. */
    name?: string
    /** Package version. */
    version?: string
    /** SPDX licence. */
    license?: string
    /** One-line description. */
    description?: string
    /** Subpath to source file. */
    exports?: Record<string, string>
    /** `deno task` entries. */
    tasks?: Record<string, string>
    /** JSR publish filters. */
    publish?: { include?: string[]; exclude?: string[] }
    /** Per-package compiler options. */
    compilerOptions?: { jsx?: string; jsxImportSource?: string }
    /** Per-member lint settings. */
    lint?: Record<string, unknown>
    /** Import map, every value fully qualified and pinned. */
    imports?: Record<string, string>
    /** Comment keys. */
    [comment: `//${string}`]: string
}

/** A generated `tsconfig.json`. */
export interface TsConfig {
    /** Options for the composite build. */
    compilerOptions: {
        composite: true
        rootDir: string
        outDir: string
        jsx?: string
        jsxImportSource?: string
    }
    /** Root files of the build. */
    include: string[]
    /** Paths left out of the build. */
    exclude: string[]
    /** The sibling projects this one depends on. */
    references: { path: string }[]
}

/** One generated file, relative to the workspace root. */
export interface GeneratedFile {
    /** POSIX path relative to the root. */
    path: string
    /** Full file content. */
    content: string
}

/** The parts of `deno.lock` this generator reads. */
export interface Lockfile {
    /** The lockfile format version. */
    version?: string
    /** Specifier to resolved version. */
    specifiers?: Record<string, string>
    /** Resolved npm packages. */
    npm?: Record<string, unknown>
    /** Resolved JSR packages. */
    jsr?: Record<string, unknown>
    /** Workspace declarations; never a resolution. */
    workspace?: unknown
}

/** The scope every workspace sibling is published under. */
const SCOPE = '@lockness/'

/** Files beside `deno.json` that never belong in the JSR package. */
const NEVER_PUBLISHED = ['package.json', 'tsconfig.json']

/** The own-version module's file name. */
export const VERSION_MODULE = 'version.generated.ts'

/** The run that fixes a stale file, for messages. */
const REGENERATE = '`deno task manifests`'

/**
 * Whether a dependency name is a workspace sibling.
 *
 * @param name - A dependency name.
 * @returns `true` for `@lockness/*`.
 */
function isSibling(name: string): boolean {
    return name.startsWith(SCOPE)
}

/**
 * The fully qualified, pinned specifier of a declared package.
 *
 * @param name - The package name.
 * @param range - Its declared range.
 * @param registry - Where it is published.
 * @returns e.g. `jsr:@lockness/cli@^0.4.0`, `npm:zod@^3.25.0`.
 */
function specifier(
    name: string,
    range: string,
    registry: 'jsr' | 'npm',
): string {
    return `${registry}:${name}@${range}`
}

/**
 * Name to fully qualified specifier for a dependency map.
 *
 * @param deps - Name to range.
 * @returns A sibling as `jsr:`, anything else as `npm:`, in declaration order.
 */
function specifiersOf(deps: Record<string, string> = {}): [string, string][] {
    return Object.entries(deps).map(([name, range]) => [
        name,
        specifier(name, range, isSibling(name) ? 'jsr' : 'npm'),
    ])
}

/**
 * Every package a manifest's import map holds by its own name: the runtime
 * dependencies and the JSR-only packages.
 *
 * @param pkg - The manifest.
 * @returns Name to fully qualified specifier, in declaration order.
 */
function declaredSpecifiers(pkg: PackageManifest): Map<string, string> {
    const declared = new Map(specifiersOf(pkg.dependencies))
    for (const [name, range] of Object.entries(pkg.lockness?.jsr ?? {})) {
        declared.set(name, specifier(name, range, 'jsr'))
    }
    return declared
}

/**
 * Resolve an alias or subpath target against the declared packages.
 *
 * The longest declared name that the target equals, or starts with followed
 * by `/`, wins: `@lockness/hono/jsx-runtime` is `@lockness/hono` plus
 * `/jsx-runtime`.
 *
 * @param target - `<package>[/subpath]`.
 * @param declared - From {@link declaredSpecifiers}.
 * @returns The specifier with the subpath appended, or `null` when no declared
 *   package matches.
 */
function resolveTarget(
    target: string,
    declared: Map<string, string>,
): string | null {
    let best: string | null = null
    for (const name of declared.keys()) {
        if (target !== name && !target.startsWith(`${name}/`)) continue
        if (best === null || name.length > best.length) best = name
    }
    if (best === null) return null
    return `${declared.get(best)}${target.slice(best.length)}`
}

/**
 * The `deno.json` a `package.json` produces.
 *
 * @param pkg - The member's `package.json`.
 * @returns The manifest, with keys in a fixed order.
 * @throws {Error} When an export has no `lockness-source`, or a
 *   `lockness.imports` entry names a package the manifest does not declare.
 *
 * @example
 * ```ts
 * denoJsonFor({
 *     name: '@lockness/auth', version: '0.4.0',
 *     exports: { '.': { 'lockness-source': './mod.ts', default: './dist/mod.js' } },
 *     dependencies: { '@lockness/contract': '^0.4.0' },
 * }).imports
 * // { '@lockness/contract': 'jsr:@lockness/contract@^0.4.0' }
 * ```
 */
export function denoJsonFor(pkg: PackageManifest): DenoJson {
    const deno: DenoJson = {}
    for (const [key, value] of Object.entries(pkg)) {
        if (key.startsWith('//') && typeof value === 'string') {
            deno[key as `//${string}`] = value
        }
    }
    const label = pkg.name ?? 'an unnamed member'
    if (pkg.name !== undefined) deno.name = pkg.name
    if (pkg.version !== undefined) deno.version = pkg.version
    if (pkg.license !== undefined) deno.license = pkg.license
    if (pkg.description !== undefined) deno.description = pkg.description
    if (pkg.exports !== undefined) {
        const exports: Record<string, string> = {}
        for (const [subpath, conditions] of Object.entries(pkg.exports)) {
            const source = conditions?.['lockness-source']
            if (typeof source !== 'string') {
                throw new Error(
                    `${label}: export "${subpath}" has no "lockness-source" condition naming its source file`,
                )
            }
            exports[subpath] = source
        }
        deno.exports = exports
    }
    const lockness = pkg.lockness ?? {}
    if (lockness.tasks !== undefined) deno.tasks = lockness.tasks
    if (pkg.name !== undefined) {
        const exclude = [...(lockness.publish?.exclude ?? [])]
        for (const file of NEVER_PUBLISHED) {
            if (!exclude.includes(file)) exclude.push(file)
        }
        deno.publish = lockness.publish?.include === undefined
            ? { exclude }
            : { include: lockness.publish.include, exclude }
    }
    if (lockness.compilerOptions !== undefined) {
        deno.compilerOptions = lockness.compilerOptions
    }
    if (lockness.lint !== undefined) deno.lint = lockness.lint

    const declared = declaredSpecifiers(pkg)
    const imports: Record<string, string> = Object.fromEntries(declared)
    // A test dependency is reachable by an explicit entry only: the import
    // map is published, and an entry lets the package's own code import it.
    const resolvable = new Map([
        ...declared,
        ...specifiersOf(pkg.devDependencies),
    ])
    for (const [key, target] of Object.entries(lockness.imports ?? {})) {
        const resolved = resolveTarget(target, resolvable)
        if (resolved === null) {
            throw new Error(
                `${label}: lockness.imports["${key}"] names ${target}, which is not in dependencies, devDependencies or lockness.jsr`,
            )
        }
        imports[key] = resolved
    }
    if (Object.keys(imports).length > 0) deno.imports = imports
    return deno
}

/**
 * Whether a publish-allowlist entry is a build root.
 *
 * @param entry - A `publish.include` entry.
 * @returns `true` for a `.ts` or `.tsx` file.
 */
function isSourceEntry(entry: string): boolean {
    return /\.tsx?$/.test(entry)
}

/**
 * The `tsconfig.json` a `package.json` produces: a composite project that
 * references each sibling it depends on.
 *
 * @param pkg - The member's `package.json`.
 * @param members - Every sibling's name to its directory, relative to the root.
 * @param dir - This member's directory, relative to the root.
 * @returns The project file.
 *
 * @example
 * ```ts
 * tsconfigFor(pkg, new Map([['@lockness/contract', 'packages/contract']]), 'packages/auth')
 *     .references // [{ path: '../contract' }]
 * ```
 */
export function tsconfigFor(
    pkg: PackageManifest,
    members: ReadonlyMap<string, string>,
    dir: string,
): TsConfig {
    const lockness = pkg.lockness ?? {}
    const compilerOptions: TsConfig['compilerOptions'] = {
        composite: true,
        rootDir: '.',
        outDir: 'dist',
    }
    const jsxImportSource = lockness.compilerOptions?.jsxImportSource
    if (lockness.compilerOptions?.jsx !== undefined) {
        // `precompile` is Deno's optimisation of the automatic runtime; tsc
        // emits the same import source through `react-jsx`.
        compilerOptions.jsx = 'react-jsx'
    }
    if (jsxImportSource !== undefined) {
        compilerOptions.jsxImportSource = jsxImportSource
    }
    const include = lockness.publish?.include?.filter(isSourceEntry) ??
        ['**/*.ts', '**/*.tsx']
    const references = Object.keys(pkg.dependencies ?? {})
        .filter(isSibling)
        .flatMap((name) => {
            const target = members.get(name)
            return target === undefined
                ? []
                : [{ path: relative(dir, target).replaceAll('\\', '/') }]
        })
    return {
        compilerOptions,
        include,
        exclude: ['dist', 'node_modules', ...(lockness.publish?.exclude ?? [])],
        references,
    }
}

/**
 * The own-version module a package asks for with `lockness.versionModule`.
 *
 * It replaces `import … from './deno.json'`, which ties the source to the
 * Deno manifest and cannot be read once the package is built for npm.
 *
 * @param pkg - The member's `package.json`.
 * @returns The module source, or `null` when the package does not ask for one.
 * @throws {Error} When the package asks for one but has no version.
 *
 * @example
 * ```ts
 * versionModuleFor({ name: '@lockness/core', version: '0.4.0', lockness: { versionModule: true } })
 * // "…export const VERSION = '0.4.0'\n"
 * ```
 */
export function versionModuleFor(pkg: PackageManifest): string | null {
    if (pkg.lockness?.versionModule !== true) return null
    if (typeof pkg.version !== 'string') {
        throw new Error(
            `${
                pkg.name ?? 'an unnamed member'
            } asks for a version module but has no version`,
        )
    }
    return [
        '/**',
        ` * @fileoverview The version of \`${pkg.name}\` this copy ships as.`,
        ' *',
        ' * Generated from `package.json` by `scripts/manifests.ts`. Do not edit:',
        ` * change the version with \`deno task bump\`, or run ${REGENERATE}.`,
        ' *',
        ' * @module',
        ' */',
        '',
        `/** The version of \`${pkg.name}\`, e.g. \`${pkg.version}\`. */`,
        `export const VERSION = '${pkg.version}'`,
        '',
    ].join('\n')
}

/**
 * The runtimes a package declares in `engines`.
 *
 * @param pkg - A manifest.
 * @returns The runtime names.
 */
function runtimesOf(pkg: PackageManifest): string[] {
    return Object.keys(pkg.engines ?? {})
}

/**
 * Every place `engines` is not monotonic: a package names a runtime that one
 * of its sibling dependencies does not. Static dependencies, optional peers
 * and test (dev) dependencies are all edges — a package's tests cannot run on
 * a runtime its test dependency is not proven on.
 *
 * Only the runtime names are compared, not their version floors.
 *
 * @param packages - Every named workspace member.
 * @returns One message per fault, empty when monotonic.
 *
 * @example
 * ```ts
 * enginesFaults([
 *     { name: '@lockness/a', engines: { deno: '>=2.2', bun: '>=1.4' }, dependencies: { '@lockness/b': '^0.4.0' } },
 *     { name: '@lockness/b', engines: { deno: '>=2.2' } },
 * ])
 * // ['@lockness/a declares engines.bun, but its dependency @lockness/b does not']
 * ```
 */
export function enginesFaults(packages: readonly PackageManifest[]): string[] {
    const byName = new Map(
        packages.flatMap((p) => p.name === undefined ? [] : [[p.name, p]]),
    )
    const faults: string[] = []
    for (const pkg of packages) {
        if (pkg.name === undefined) continue
        const optional = Object.entries(pkg.peerDependenciesMeta ?? {})
            .filter(([, meta]) => meta.optional === true)
            .map(([name]) => name)
        const edges: [string, string[]][] = [
            ['dependency', Object.keys(pkg.dependencies ?? {})],
            ['optional peer', optional],
            ['test dependency', Object.keys(pkg.devDependencies ?? {})],
        ]
        for (const [kind, names] of edges) {
            for (const name of names.filter(isSibling)) {
                const dependency = byName.get(name)
                if (dependency === undefined) {
                    faults.push(
                        `${pkg.name} depends on ${name}, which is not a workspace member`,
                    )
                    continue
                }
                const proven = runtimesOf(dependency)
                for (const runtime of runtimesOf(pkg)) {
                    if (proven.includes(runtime)) continue
                    faults.push(
                        `${pkg.name} declares engines.${runtime}, but its ${kind} ${name} does not`,
                    )
                }
            }
        }
    }
    return faults
}

/**
 * Every `@lockness/*` package `deno.lock` resolves from a registry.
 *
 * Every one must resolve to a workspace member. The `specifiers`, `npm` and
 * `jsr` sections are resolutions; `workspace` is not — it records what each
 * member's manifests declare, including `npm:@lockness/*` for a `package.json`
 * sibling dependency, which Deno satisfies from the workspace.
 *
 * @param lock - The parsed `deno.lock`.
 * @returns One message per registry-resolved entry, empty when clean.
 *
 * @example
 * ```ts
 * lockfileFaults({ specifiers: { 'npm:@lockness/core@0.4': '0.4.0' } })
 * // ['deno.lock resolves npm:@lockness/core@0.4 from a registry']
 * ```
 */
export function lockfileFaults(lock: Lockfile): string[] {
    const faults: string[] = []
    for (const spec of Object.keys(lock.specifiers ?? {})) {
        if (/^(npm|jsr):@lockness\//.test(spec)) {
            faults.push(`deno.lock resolves ${spec} from a registry`)
        }
    }
    for (const registry of ['npm', 'jsr'] as const) {
        for (const name of Object.keys(lock[registry] ?? {})) {
            if (isSibling(name)) {
                faults.push(
                    `deno.lock carries the ${registry} package ${name}`,
                )
            }
        }
    }
    return faults
}

/**
 * The first cycle among the workspace's runtime sibling dependencies.
 *
 * Runtime dependencies become `tsconfig.json` references, and a reference
 * cycle is fatal to both tsc and Deno, which reads those files too.
 *
 * @param packages - Every workspace member.
 * @returns The ring, its first name repeated at the end, or `null` when the
 *   graph is acyclic.
 *
 * @example
 * ```ts
 * dependencyCycle([
 *     { name: '@lockness/a', dependencies: { '@lockness/b': '^0.4.0' } },
 *     { name: '@lockness/b', dependencies: { '@lockness/a': '^0.4.0' } },
 * ])
 * // ['@lockness/a', '@lockness/b', '@lockness/a']
 * ```
 */
export function dependencyCycle(
    packages: readonly PackageManifest[],
): string[] | null {
    const edges = new Map(
        packages.flatMap((p) =>
            p.name === undefined ? [] : [[
                p.name,
                Object.keys(p.dependencies ?? {}).filter(isSibling),
            ]]
        ),
    )
    const done = new Set<string>()
    const stack: string[] = []
    const visit = (name: string): string[] | null => {
        const at = stack.indexOf(name)
        if (at !== -1) return [...stack.slice(at), name]
        if (done.has(name)) return null
        stack.push(name)
        for (const next of edges.get(name) ?? []) {
            const ring = visit(next)
            if (ring !== null) return ring
        }
        stack.pop()
        done.add(name)
        return null
    }
    for (const name of edges.keys()) {
        const ring = visit(name)
        if (ring !== null) return ring
    }
    return null
}

/**
 * Render JSON the way `deno fmt` leaves it: four spaces, trailing newline.
 *
 * @param value - The value.
 * @returns The text.
 */
function renderJson(value: unknown): string {
    return JSON.stringify(value, null, 4) + '\n'
}

/**
 * The workspace members, from the root `package.json` `workspaces` list —
 * the one home of workspace membership (plan §5).
 *
 * @param root - The workspace root.
 * @returns Member directories relative to the root, POSIX, without `./`.
 * @throws {Error} When the root `package.json` is missing or has no
 *   `workspaces` array of strings.
 *
 * @example
 * ```ts
 * await readWorkspaceMembers('.')   // ['packages/core', …]
 * ```
 */
export async function readWorkspaceMembers(root: string): Promise<string[]> {
    const path = join(root, 'package.json')
    const parsed: unknown = JSON.parse(await Deno.readTextFile(path))
    const workspaces = typeof parsed === 'object' && parsed !== null
        ? (parsed as { workspaces?: unknown }).workspaces
        : undefined
    if (
        !Array.isArray(workspaces) ||
        !workspaces.every((m): m is string => typeof m === 'string')
    ) {
        throw new Error(`${path} has no "workspaces" array of strings`)
    }
    return workspaces.map((m) => m.replace(/^\.\//, '').replace(/\/+$/, ''))
}

/** A member and its parsed `package.json`. */
export interface Member {
    /** Directory relative to the root. */
    dir: string
    /** The parsed manifest. */
    pkg: PackageManifest
}

/**
 * Read every member's `package.json`.
 *
 * @param root - The workspace root.
 * @returns The members, in workspace order.
 * @throws {Error} When a member has no readable `package.json`.
 */
async function readMembers(root: string): Promise<Member[]> {
    const members: Member[] = []
    for (const dir of await readWorkspaceMembers(root)) {
        const path = join(root, dir, 'package.json')
        let pkg: PackageManifest
        try {
            pkg = JSON.parse(await Deno.readTextFile(path))
        } catch (error) {
            throw new Error(
                `${dir}/package.json is unreadable: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
        members.push({ dir, pkg })
    }
    return members
}

/**
 * Every file the workspace's `package.json` files produce.
 *
 * @param root - The workspace root.
 * @returns The files, member by member, in a fixed order.
 * @throws {Error} When a manifest cannot be read or generated from.
 *
 * @example
 * ```ts
 * (await planManifests('.')).map((f) => f.path)
 * // ['packages/core/deno.json', 'packages/core/tsconfig.json', 'packages/core/version.generated.ts', …]
 * ```
 */
export async function planManifests(root: string): Promise<GeneratedFile[]> {
    return planFiles(await readMembers(root))
}

/**
 * Every file a set of in-memory `package.json` files produces — no I/O, so a
 * caller about to rewrite those manifests (the bump) can prove generation
 * succeeds before it writes anything.
 *
 * @param members - Each member's directory and manifest, in workspace order.
 * @returns The files, member by member, in a fixed order.
 * @throws {Error} When the runtime dependencies form a cycle, or a manifest
 *   cannot be generated from.
 *
 * @example
 * ```ts
 * planFiles([{ dir: 'packages/a', pkg: { name: '@lockness/a', version: '0.4.0' } }])
 *     .map((f) => f.path) // ['packages/a/deno.json', 'packages/a/tsconfig.json']
 * ```
 */
export function planFiles(members: readonly Member[]): GeneratedFile[] {
    const cycle = dependencyCycle(members.map((m) => m.pkg))
    if (cycle !== null) {
        throw new Error(
            `dependency cycle: ${cycle.join(' → ')}. Runtime dependencies ` +
                'become tsconfig.json references, which must be acyclic (Deno ' +
                'overflows its stack reading a cycle). A sibling used only by ' +
                'tests belongs in devDependencies.',
        )
    }
    const dirs = new Map(
        members.flatMap(({ dir, pkg }) =>
            pkg.name === undefined ? [] : [[pkg.name, dir]]
        ),
    )
    const files: GeneratedFile[] = []
    for (const { dir, pkg } of members) {
        files.push({
            path: `${dir}/deno.json`,
            content: renderJson(denoJsonFor(pkg)),
        })
        // An unnamed member is an app, not a package: it is never built.
        if (pkg.name === undefined) continue
        files.push({
            path: `${dir}/tsconfig.json`,
            content: renderJson(tsconfigFor(pkg, dirs, dir)),
        })
        const version = versionModuleFor(pkg)
        if (version !== null) {
            files.push({ path: `${dir}/${VERSION_MODULE}`, content: version })
        }
    }
    return files
}

/**
 * Write every generated file whose content changed.
 *
 * @param root - The workspace root.
 * @returns The paths written.
 * @throws {Error} When a manifest cannot be read or generated from.
 *
 * @example
 * ```ts
 * await writeManifests('.')   // ['packages/core/deno.json'] after a bump
 * ```
 */
export async function writeManifests(root: string): Promise<string[]> {
    return writeFiles(root, await planManifests(root))
}

/**
 * Write each planned file whose content differs from what is on disk.
 *
 * @param root - The workspace root.
 * @param files - From {@link planFiles} or {@link planManifests}.
 * @returns The paths written.
 * @throws {Error} When a file cannot be read or written.
 *
 * @example
 * ```ts
 * await writeFiles('.', planFiles(members))
 * ```
 */
export async function writeFiles(
    root: string,
    files: readonly GeneratedFile[],
): Promise<string[]> {
    const written: string[] = []
    for (const file of files) {
        const path = join(root, file.path)
        if (await readOrNull(path) === file.content) continue
        await Deno.writeTextFile(path, file.content)
        written.push(file.path)
    }
    return written
}

/**
 * Read a file, or `null` when it does not exist.
 *
 * @param path - The file.
 * @returns Its text, or `null` when absent.
 * @throws {Error} On any failure other than absence.
 */
async function readOrNull(path: string): Promise<string | null> {
    try {
        return await Deno.readTextFile(path)
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null
        throw error
    }
}

/**
 * Every reason the workspace's manifests are not current: stale or missing
 * generated files, non-monotonic `engines`, a registry-resolved `@lockness/*`
 * in `deno.lock` (skipped when there is no lockfile).
 *
 * @param root - The workspace root.
 * @returns One message per fault, empty when current.
 * @throws {Error} When a manifest or the lockfile cannot be parsed.
 *
 * @example
 * ```ts
 * const faults = await checkManifests('.')
 * if (faults.length > 0) Deno.exit(1)
 * ```
 */
export async function checkManifests(root: string): Promise<string[]> {
    const faults: string[] = []
    for (const file of await planManifests(root)) {
        const current = await readOrNull(join(root, file.path))
        if (current === file.content) continue
        const source = file.path.replace(/\/[^/]+$/, '/package.json')
        faults.push(
            current === null
                ? `${file.path} is missing: run ${REGENERATE}`
                : `${file.path} is stale: edit ${source}, then run ${REGENERATE}`,
        )
    }
    const packages = (await readMembers(root)).map((m) => m.pkg)
    faults.push(...enginesFaults(packages))

    const lock = await readOrNull(join(root, 'deno.lock'))
    if (lock !== null) faults.push(...lockfileFaults(JSON.parse(lock)))
    return faults
}

/**
 * Regenerate, or with `--check` verify, the workspace's manifests.
 *
 * @param args - The command-line arguments.
 * @param root - The workspace root.
 * @returns The exit code: `0` when written or current, `1` on a fault, `2` on
 *   an unknown argument.
 *
 * @example
 * ```ts
 * Deno.exit(await main(Deno.args))
 * ```
 */
export async function main(
    args: readonly string[],
    root: string = Deno.cwd(),
): Promise<number> {
    const unknown = args.filter((arg) => arg !== '--check')
    if (unknown.length > 0) {
        console.error(
            `❌ manifests: unknown argument ${unknown[0]} (known: --check)`,
        )
        return 2
    }
    if (args.includes('--check')) {
        const faults = await checkManifests(root)
        if (faults.length > 0) {
            console.error(`❌ ${faults.length} manifest fault(s):`)
            for (const fault of faults) console.error(`   ${fault}`)
            return 1
        }
        console.log('✅ manifests are current')
        return 0
    }
    const written = await writeManifests(root)
    for (const path of written) console.log(`   wrote ${path}`)
    console.log(
        written.length === 0
            ? '✅ manifests already current'
            : `✅ ${written.length} file(s) regenerated`,
    )
    return 0
}

if (import.meta.main) {
    Deno.exit(await main(Deno.args))
}
