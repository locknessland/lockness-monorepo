/**
 * @fileoverview Lint plugin `lockness-runtime`: code that claims to run on
 * Bun or Node does not reach for Deno (#596, plan 274 FR-001, FR-016).
 *
 * A package proven on Bun or Node — its `package.json` `engines` names `bun`
 * or `node` — must not depend on a Deno-only API: on the other runtimes that
 * is a `ReferenceError` at the first call, found by a user rather than by the
 * gate. Two rules:
 *
 * - **`no-deno`** reports three forms:
 *   - **the `Deno` global** — any reference to the identifier (a call, a bare
 *     read, `typeof Deno`, a `Deno.*` type), `globalThis.Deno` / `self.Deno`
 *     (dotted or with a static key), and the `'Deno' in …` probe. A `Deno`
 *     property of another object, a `Deno` key or member name, and the word
 *     in a string or comment are not references and pass. An alias
 *     (`const g = globalThis; g.Deno`) is not followed — that needs scope
 *     analysis;
 *   - **`hono/deno`** — Hono's Deno adapter, by any specifier spelling
 *     (`hono/deno`, `npm:hono@4/deno`, `jsr:@hono/hono/deno`);
 *   - **`@lockness/hono/{deno,bun,node}`** — the framework's per-runtime Hono
 *     adapters, which only `packages/runtime/` may import: it is the one
 *     place that chooses a runtime (FR-002).
 * - **`neutral-imports`** reports a relative static import, in an in-scope
 *   script, of a file outside the scope. A per-file rule cannot see a `Deno`
 *   call one import away: a script importing a Deno-bound one is not neutral.
 *   A lint plugin module may import an in-scope script, never the reverse.
 *   Bare specifiers are not checked: resolving them off Deno is part of the
 *   B4 move.
 *
 * Imports are matched in `import`, `export … from` and a static dynamic
 * `import()`, type-only ones included. A `typeof import('…')` type is not.
 *
 * **Scope.** Tests and stub templates are never in scope. Otherwise a file is
 * in scope when it is:
 *
 * - source of a package whose `engines` names bun or node — decided by
 *   `namesBunOrNode` from `scripts/manifests.ts`, the one predicate the
 *   runtime lanes, `npm:build` and `npm:check` scope on (plan §5 row 201) —
 *   and not named in {@link EXEMPT_FILES};
 * - any script under `scripts/`, except the shrink-only baseline in
 *   `deno_bound_scripts.ts` and the modules the root `deno.jsonc` registers
 *   under `lint.plugins` (read from that file, never copied): those are typed
 *   on `Deno.lint` and are rewritten, not migrated, when the lint leaves Deno
 *   at B4.
 *
 * Scope is decided on the path relative to the repository root, never the
 * absolute path.
 *
 * @module scripts/lint/runtime_neutral
 */

import { existsSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'
import { parse as parseJsonc } from '@std/jsonc'
import { namesBunOrNode, type PackageManifest } from '../manifests.ts'
import { DENO_BOUND_SCRIPTS } from './deno_bound_scripts.ts'
import { isTestOrStubPath, REPO_ROOT, repoPath } from './repo_path.ts'

/**
 * The files of an in-scope package the rule skips, each by its exact
 * repository-relative path — never a directory or a pattern, so an exemption
 * cannot grow by itself. Empty while `@lockness/transform` is the only package
 * in scope; an entry joins in the change that brings its package into scope
 * (the kept Deno KV drivers, the Deno side of `packages/runtime/`), with the
 * reason beside it.
 */
export const EXEMPT_FILES: readonly string[] = []

/** The `no-deno` message for a reference to the `Deno` global. */
const DENO_MESSAGE = 'Deno global in runtime-neutral code (#596)'

/** The `no-deno` message for a runtime-specific Hono adapter import. */
const ADAPTER_MESSAGE =
    'Runtime-specific Hono adapter imported in runtime-neutral code (#596)'

/** The hint shown under either `no-deno` message. */
const HINT =
    'Use a node: built-in or a web standard, or go through @lockness/runtime. ' +
    'A package file that must stay Deno-only is exempted by name in ' +
    'EXEMPT_FILES (scripts/lint/runtime_neutral.ts); a script joins ' +
    'scripts/lint/deno_bound_scripts.ts only for a Deno-only runtime API.'

/** The `neutral-imports` message. */
const IMPORT_MESSAGE =
    'Runtime-neutral script imports a file outside the runtime-neutral scope (#596)'

/** The hint shown under the `neutral-imports` message. */
const IMPORT_HINT = 'Migrate the imported script off Deno and drop it from ' +
    'scripts/lint/deno_bound_scripts.ts, or move the shared code into a ' +
    'neutral module. A lint plugin may import a neutral script, never the ' +
    'reverse.'

/** Hono's Deno adapter, by any specifier spelling. */
const HONO_DENO = /^(?:npm:|jsr:)?(?:@hono\/)?hono(?:@[^/]*)?\/deno(?:\/|$)/

/** The framework's per-runtime Hono adapters. */
const LOCKNESS_ADAPTER =
    /^(?:npm:|jsr:)?@lockness\/hono(?:@[^/]*)?\/(?:deno|bun|node)(?:\/|$)/

/** The globals a `.Deno` member read reaches the Deno namespace through. */
const GLOBAL_OBJECTS = new Set(['globalThis', 'self'])

/**
 * The scope a linted file falls in: a package file (`'package'`), a file of
 * `packages/runtime/`, which may import the Hono adapters (`'runtime'`), or a
 * script (`'script'`).
 */
export type LintScope = 'package' | 'runtime' | 'script'

/** Where the rules look, and what they skip. */
export interface RuntimeNeutralOptions {
    /** The repository root. Defaults to the repository holding this rule. */
    root?: string
    /** Repository-relative package files skipped. Defaults to {@link EXEMPT_FILES}. */
    exempt?: readonly string[]
    /**
     * Repository-relative scripts that still use Deno, skipped. Defaults to
     * the baseline in `deno_bound_scripts.ts`.
     */
    denoBound?: readonly string[]
    /**
     * Repository-relative lint plugin modules, skipped. Defaults to the root
     * `deno.jsonc` `lint.plugins`, read from the file.
     */
    plugins?: readonly string[]
}

/** What one plugin instance has read already. */
export interface ScopeCache {
    /** Whether each package manifest names bun or node, by manifest path. */
    manifests: Map<string, boolean>
    /** The repository-relative `lint.plugins` modules, once read. */
    plugins?: readonly string[]
}

/** `root` with forward slashes and one trailing `/`. */
function withSlash(root: string): string {
    return root.replaceAll('\\', '/').replace(/\/?$/, '/')
}

/**
 * Whether the package whose manifest is `manifestPath` names bun or node,
 * remembered in `cache`.
 *
 * The verdict lives as long as the plugin instance. `deno lint` builds one
 * per run, so the gate always reads current manifests; the editor's language
 * server keeps its instance, so it sees an `engines` change only after a
 * restart.
 *
 * @throws {SyntaxError} When the manifest is not valid JSON: a broken
 *   manifest fails the lint, it does not switch the rule off.
 */
function packageInScope(manifestPath: string, cache: ScopeCache): boolean {
    const known = cache.manifests.get(manifestPath)
    if (known !== undefined) return known
    const inScope = existsSync(manifestPath) &&
        namesBunOrNode(
            JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest,
        )
    cache.manifests.set(manifestPath, inScope)
    return inScope
}

/**
 * The lint plugin modules the root `deno.jsonc` registers, repository-relative.
 *
 * @throws {Error} When the root `deno.jsonc` cannot be read or parsed: the
 *   carve-out is read from the file, so a missing file fails loudly.
 */
function lintPlugins(
    root: string,
    options: RuntimeNeutralOptions,
    cache: ScopeCache,
): readonly string[] {
    if (options.plugins !== undefined) return options.plugins
    if (cache.plugins !== undefined) return cache.plugins
    const config = parseJsonc(
        readFileSync(`${withSlash(root)}deno.jsonc`, 'utf8'),
    ) as { lint?: { plugins?: unknown } }
    const listed = config.lint?.plugins
    const plugins = Array.isArray(listed)
        ? listed.filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => posix.normalize(entry))
        : []
    cache.plugins = plugins
    return plugins
}

/**
 * The scope a file is linted in, if any.
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @param options - The root, exemptions, baseline and plugin list;
 *   repository defaults.
 * @param cache - What this plugin instance has read already.
 * @returns The scope, or `undefined` when the rules do not apply: a test or
 *   stub, outside `packages/` and `scripts/`, an exempt package file, a
 *   package whose `engines` names neither bun nor node, a baseline script or
 *   a lint plugin module.
 * @throws {SyntaxError} When the package's `package.json` is not valid JSON.
 *
 * @example
 * ```ts
 * lintScope(`${REPO_ROOT}packages/transform/hook.ts`)  // 'package'
 * lintScope(`${REPO_ROOT}packages/core/app.ts`)        // undefined (Deno only)
 * lintScope(`${REPO_ROOT}scripts/npm_check.ts`)        // 'script'
 * ```
 */
export function lintScope(
    filename: string,
    options: RuntimeNeutralOptions = {},
    cache: ScopeCache = { manifests: new Map() },
): LintScope | undefined {
    const root = options.root ?? REPO_ROOT
    const path = repoPath(filename, root)
    if (path === undefined || isTestOrStubPath(path)) return undefined
    if (path.startsWith('scripts/')) {
        if ((options.denoBound ?? DENO_BOUND_SCRIPTS).includes(path)) {
            return undefined
        }
        return lintPlugins(root, options, cache).includes(path)
            ? undefined
            : 'script'
    }
    const match = /^packages\/([^/]+)\//.exec(path)
    if (!match) return undefined
    if ((options.exempt ?? EXEMPT_FILES).includes(path)) return undefined
    const manifest = `${withSlash(root)}packages/${match[1]}/package.json`
    if (!packageInScope(manifest, cache)) return undefined
    return match[1] === 'runtime' ? 'runtime' : 'package'
}

/**
 * The name a property key spells when it is static: `Deno` for `x.Deno`,
 * `x['Deno']` and ``x[`Deno`]``; `undefined` for a dynamic key.
 */
function staticKey(key: Deno.lint.Node, computed: boolean): string | undefined {
    if (!computed && key.type === 'Identifier') return key.name
    return specifierOf(key)
}

/**
 * Whether the identifier `node` refers to a binding rather than naming a
 * property, a member or the right side of a qualified type name.
 */
function isReference(node: Deno.lint.Identifier): boolean {
    const parent = node.parent
    switch (parent.type) {
        case 'MemberExpression':
            return parent.property !== node || parent.computed
        case 'Property':
            // `{ Deno }` carries the name twice, as key and as value: the
            // value node is the reference, so it is reported once.
            return parent.key !== node || parent.computed
        case 'MethodDefinition':
        case 'PropertyDefinition':
        case 'TSPropertySignature':
        case 'TSMethodSignature':
            return parent.key !== node || parent.computed
        case 'TSQualifiedName':
            return parent.right !== node
        default:
            return true
    }
}

/** The text of a static string or substitution-free template, if `node` is one. */
function specifierOf(
    node: Deno.lint.Node | null | undefined,
): string | undefined {
    if (!node) return undefined
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value
    }
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
        return node.quasis[0]?.cooked ?? undefined
    }
    return undefined
}

/** The import forms both rules read a source specifier from. */
type ImportNode =
    | Deno.lint.ImportDeclaration
    | Deno.lint.ExportNamedDeclaration
    | Deno.lint.ExportAllDeclaration
    | Deno.lint.ImportExpression

/** The visitors that hand each static import's node and specifier to `check`. */
function importVisitors(
    check: (node: ImportNode, specifier: string) => void,
): Deno.lint.LintVisitor {
    const visit = (node: ImportNode) => {
        const specifier = specifierOf(node.source)
        if (specifier !== undefined) check(node, specifier)
    }
    return {
        ImportDeclaration: visit,
        ExportNamedDeclaration: visit,
        ExportAllDeclaration: visit,
        ImportExpression: visit,
    }
}

/**
 * Build the plugin over a repository.
 *
 * The default export is this plugin over the repository holding the rules;
 * the factory exists so tests can lint against a fixture repository whose
 * manifests, baseline and plugin list they control.
 *
 * @param options - The root, exemptions, baseline and plugin list;
 *   repository defaults.
 * @returns The `lockness-runtime` plugin.
 *
 * @example
 * ```ts
 * const plugin = createRuntimeNeutralPlugin({ root: '/tmp/fixture/' })
 * Deno.lint.runPlugin(plugin, '/tmp/fixture/packages/x/mod.ts', 'Deno.cwd()')
 * ```
 */
export function createRuntimeNeutralPlugin(
    options: RuntimeNeutralOptions = {},
): Deno.lint.Plugin {
    const cache: ScopeCache = { manifests: new Map() }
    const root = options.root ?? REPO_ROOT
    return {
        name: 'lockness-runtime',
        rules: {
            'no-deno': {
                create(context) {
                    const scope = lintScope(context.filename, options, cache)
                    if (scope === undefined) return {}
                    const reportDeno = (node: Deno.lint.Node) =>
                        context.report({
                            node,
                            message: DENO_MESSAGE,
                            hint: HINT,
                        })
                    return {
                        Identifier(node) {
                            if (node.name === 'Deno' && isReference(node)) {
                                reportDeno(node)
                            }
                        },
                        MemberExpression(node) {
                            if (
                                node.object.type === 'Identifier' &&
                                GLOBAL_OBJECTS.has(node.object.name) &&
                                staticKey(node.property, node.computed) ===
                                    'Deno'
                            ) {
                                reportDeno(node)
                            }
                        },
                        BinaryExpression(node) {
                            if (
                                node.operator === 'in' &&
                                specifierOf(node.left) === 'Deno'
                            ) {
                                reportDeno(node)
                            }
                        },
                        ...importVisitors((node, specifier) => {
                            const forbidden = HONO_DENO.test(specifier) ||
                                (scope !== 'runtime' &&
                                    LOCKNESS_ADAPTER.test(specifier))
                            if (!forbidden) return
                            context.report({
                                node,
                                message: ADAPTER_MESSAGE,
                                hint: HINT,
                            })
                        }),
                    }
                },
            },
            'neutral-imports': {
                create(context) {
                    const scope = lintScope(context.filename, options, cache)
                    if (scope !== 'script') return {}
                    const from = repoPath(context.filename, root) ?? ''
                    return importVisitors((node, specifier) => {
                        if (!/^\.\.?\//.test(specifier)) return
                        const target = posix.join(
                            posix.dirname(from),
                            specifier,
                        )
                        const targetScope = lintScope(
                            `${withSlash(root)}${target}`,
                            options,
                            cache,
                        )
                        if (targetScope !== undefined) return
                        context.report({
                            node,
                            message: IMPORT_MESSAGE,
                            hint: IMPORT_HINT,
                        })
                    })
                },
            },
        },
    }
}

/** The plugin over this repository, registered in the root `deno.jsonc`. */
const plugin: Deno.lint.Plugin = createRuntimeNeutralPlugin()

export default plugin
