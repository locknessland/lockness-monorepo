/**
 * @fileoverview Lint rule `lockness-runtime/no-deno`: code that claims to run
 * on Bun or Node does not reach for Deno (#596, plan 274 FR-001).
 *
 * A package proven on Bun or Node — its `package.json` `engines` names `bun`
 * or `node` — must not depend on a Deno-only API: on the other runtimes that
 * is a `ReferenceError` at the first call, found by a user rather than by the
 * gate. The rule reports three forms:
 *
 * - **the `Deno` global** — any reference to the identifier (a call, a bare
 *   read, `typeof Deno`, a `Deno.*` type), `globalThis.Deno` / `self.Deno`
 *   (dotted or with a static key), and the `'Deno' in …` probe. A `Deno`
 *   property of another object, a `Deno` key or member name, and the word in
 *   a string or comment are not references and pass. An alias
 *   (`const g = globalThis; g.Deno`) is not followed — that needs scope
 *   analysis;
 * - **`hono/deno`** — Hono's Deno adapter, by any specifier spelling
 *   (`hono/deno`, `npm:hono@4/deno`, `jsr:@hono/hono/deno`);
 * - **`@lockness/hono/{deno,bun,node}`** — the framework's per-runtime Hono
 *   adapters, which only `packages/runtime/` may import: it is the one place
 *   that chooses a runtime (FR-002).
 *
 * Imports are matched in `import`, `export … from` and a static dynamic
 * `import()`, type-only ones included. A `typeof import('…')` type is not.
 *
 * **Scope.** A file is linted when it is shipped source of a package whose
 * `engines` names bun or node — decided by `namesBunOrNode` from
 * `scripts/manifests.ts`, the one predicate the runtime lanes, `npm:build` and
 * `npm:check` scope on (plan §5 row 201) — or a script on the runtime-neutral
 * list (`runtime_neutral_scripts.ts`, FR-016). Tests and stub templates are
 * out of scope, and so is every file named in {@link EXEMPT_FILES}. Scope is
 * decided on the path relative to the repository root, never the absolute
 * path.
 *
 * @module scripts/lint/runtime_neutral
 */

import { existsSync, readFileSync } from 'node:fs'
import { namesBunOrNode, type PackageManifest } from '../manifests.ts'
import { isTestOrStubPath, REPO_ROOT, repoPath } from './repo_path.ts'
import { RUNTIME_NEUTRAL_SCRIPTS } from './runtime_neutral_scripts.ts'

/**
 * The files of an in-scope package the rule skips, each by its exact
 * repository-relative path — never a directory or a pattern, so an exemption
 * cannot grow by itself. Empty while `@lockness/transform` is the only package
 * in scope; an entry joins in the change that brings its package into scope
 * (the kept Deno KV drivers, the Deno side of `packages/runtime/`), with the
 * reason beside it.
 */
export const EXEMPT_FILES: readonly string[] = []

/** The rule's message for a reference to the `Deno` global. */
const DENO_MESSAGE =
    'Deno global in runtime-neutral code: this package names bun or node in its engines (#596)'

/** The rule's message for a runtime-specific Hono adapter import. */
const ADAPTER_MESSAGE =
    'Runtime-specific Hono adapter imported in runtime-neutral code (#596)'

/** The hint shown under either message. */
const HINT =
    'Use a node: built-in or a web standard, or go through @lockness/runtime. ' +
    'A file that must stay Deno-only is exempted by name in ' +
    'scripts/lint/runtime_neutral.ts (EXEMPT_FILES).'

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
 * listed script (`'script'`).
 */
export type LintScope = 'package' | 'runtime' | 'script'

/** Where the rule looks, and what it skips. */
export interface RuntimeNeutralOptions {
    /** The repository root. Defaults to the repository holding this rule. */
    root?: string
    /** Repository-relative files skipped. Defaults to {@link EXEMPT_FILES}. */
    exempt?: readonly string[]
    /**
     * Repository-relative scripts linted. Defaults to the runtime-neutral
     * script list.
     */
    scripts?: readonly string[]
}

/**
 * Whether the package whose manifest is `manifestPath` names bun or node,
 * remembered in `cache`.
 *
 * @throws {SyntaxError} When the manifest is not valid JSON: a broken
 *   manifest fails the lint, it does not switch the rule off.
 */
function packageInScope(
    manifestPath: string,
    cache: Map<string, boolean>,
): boolean {
    const known = cache.get(manifestPath)
    if (known !== undefined) return known
    const inScope = existsSync(manifestPath) &&
        namesBunOrNode(
            JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest,
        )
    cache.set(manifestPath, inScope)
    return inScope
}

/**
 * The scope a file is linted in, if any.
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @param options - The root, exemptions and script list; repository defaults.
 * @param cache - Manifest verdicts already read, by manifest path.
 * @returns The scope, or `undefined` when the rule does not apply: outside
 *   `packages/` and the script list, a test or stub, an exempt file, or a
 *   package whose `engines` names neither bun nor node.
 * @throws {SyntaxError} When the package's `package.json` is not valid JSON.
 *
 * @example
 * ```ts
 * lintScope(`${REPO_ROOT}packages/transform/hook.ts`)  // 'package'
 * lintScope(`${REPO_ROOT}packages/core/app.ts`)        // undefined (Deno only)
 * ```
 */
export function lintScope(
    filename: string,
    options: RuntimeNeutralOptions = {},
    cache: Map<string, boolean> = new Map(),
): LintScope | undefined {
    const root = options.root ?? REPO_ROOT
    const path = repoPath(filename, root)
    if (path === undefined) return undefined
    if ((options.exempt ?? EXEMPT_FILES).includes(path)) return undefined
    if ((options.scripts ?? RUNTIME_NEUTRAL_SCRIPTS).includes(path)) {
        return 'script'
    }
    const match = /^packages\/([^/]+)\//.exec(path)
    if (!match || isTestOrStubPath(path)) return undefined
    const base = root.replaceAll('\\', '/').replace(/\/?$/, '/')
    const manifest = `${base}packages/${match[1]}/package.json`
    if (!packageInScope(manifest, cache)) return undefined
    return match[1] === 'runtime' ? 'runtime' : 'package'
}

/**
 * The name a property key spells when it is static: `Deno` for `x.Deno`,
 * `x['Deno']` and ``x[`Deno`]``; `undefined` for a dynamic key.
 */
function staticKey(key: Deno.lint.Node, computed: boolean): string | undefined {
    if (!computed && key.type === 'Identifier') return key.name
    if (key.type === 'Literal' && typeof key.value === 'string') {
        return key.value
    }
    if (key.type === 'TemplateLiteral' && key.expressions.length === 0) {
        return key.quasis[0]?.cooked ?? undefined
    }
    return undefined
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

/** The specifier of a static string source, if `node` is one. */
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

/**
 * Build the plugin over a repository.
 *
 * The default export is this plugin over the repository holding the rule;
 * the factory exists so tests can lint against a fixture repository whose
 * package manifests they control.
 *
 * @param options - The root, exemptions and script list; repository defaults.
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
    const cache = new Map<string, boolean>()
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
                    const checkSource = (
                        node: Deno.lint.Node,
                        source: Deno.lint.Node | null | undefined,
                    ) => {
                        const specifier = specifierOf(source)
                        if (specifier === undefined) return
                        const forbidden = HONO_DENO.test(specifier) ||
                            (scope !== 'runtime' &&
                                LOCKNESS_ADAPTER.test(specifier))
                        if (!forbidden) return
                        context.report({
                            node,
                            message: ADAPTER_MESSAGE,
                            hint: HINT,
                        })
                    }
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
                        ImportDeclaration(node) {
                            checkSource(node, node.source)
                        },
                        ExportNamedDeclaration(node) {
                            checkSource(node, node.source)
                        },
                        ExportAllDeclaration(node) {
                            checkSource(node, node.source)
                        },
                        ImportExpression(node) {
                            checkSource(node, node.source)
                        },
                    }
                },
            },
        },
    }
}

/** The plugin over this repository, registered in the root `deno.jsonc`. */
const plugin: Deno.lint.Plugin = createRuntimeNeutralPlugin()

export default plugin
