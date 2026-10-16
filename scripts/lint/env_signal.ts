/**
 * @fileoverview Lint rule `lockness-env/env-signal`: no raw read of `APP_ENV` or
 * `DENO_ENV` outside the framework's one resolver (#504).
 *
 * `APP_ENV` is the single environment signal, read, trimmed and lower-cased in
 * exactly one place (`packages/contract/environment_read.ts`), and every
 * predicate derives from that read. A second hand-written read is how the
 * framework and the scaffolded config came to disagree on whether a process
 * was in production — and a security control keyed on one answer fails open
 * under the other. `DENO_ENV` is read only by the tripwire
 * (`packages/contract/environment_legacy.ts`).
 *
 * Reports, in `packages/`, `app/` and `config/`, outside tests and the owners
 * below:
 *
 * - `Deno.env.get('APP_ENV')` / `Deno.env.get('DENO_ENV')` (any quote style);
 * - a member read of either name on any object — `process.env.APP_ENV`,
 *   `process.env['DENO_ENV']`, and `env.APP_ENV` on an environment handed in
 *   as a parameter (#596, plan 274 T019). Any object, not only
 *   `process.env`: the Node idiom is to pass `process.env` along, and a rule
 *   keyed on the `process.env` spelling would miss the read where it happens;
 * - either name destructured (`const { APP_ENV } = process.env`, a
 *   `{ APP_ENV }` parameter).
 *
 * Writes (`Deno.env.set`, an assignment to `process.env.APP_ENV`, `delete`)
 * are not reads and pass, and so does an object key or a type member named
 * `APP_ENV`. Markdown examples are not linted.
 *
 * @module scripts/lint/env_signal
 */

import { isTestPath, REPO_ROOT, repoPath } from './repo_path.ts'

/** The rule's message, naming the sanctioned way. */
const MESSAGE =
    'Raw environment-signal read: use resolveEnvName() / isProduction() / isExplicitlyDevelopment() from @lockness/core or @lockness/contract (#504)'

/** The hint shown under the message. */
const HINT =
    'APP_ENV is read in one place so the framework and the app never disagree. ' +
    'DENO_ENV is no longer an environment signal. The owner list lives in ' +
    'scripts/lint/env_signal.ts.'

/** The variables only the resolver may read. */
const SIGNALS = new Set(['APP_ENV', 'DENO_ENV'])

/**
 * The files that own a raw read: the contract resolver and its tripwire, and
 * `@lockness/transform`'s production refusal, which runs before any
 * `@lockness/*` package loads and may import none — so it repeats the
 * resolver's trim/lower-case rule rather than importing it (#596).
 */
const OWNERS = [
    'packages/contract/environment_read.ts',
    'packages/contract/environment_legacy.ts',
    'packages/transform/hook.ts',
]

/**
 * Whether the rule applies to a file.
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @param root - The repository root. Defaults to the repository holding this
 *   rule; tests pass another to place the checkout elsewhere.
 * @returns `true` under the repository's `packages/`, `app/` or `config/`,
 * outside tests and the resolver's own files.
 */
export function inScope(filename: string, root: string = REPO_ROOT): boolean {
    const path = repoPath(filename, root)
    if (path === undefined) return false
    if (!['packages/', 'app/', 'config/'].some((dir) => path.startsWith(dir))) {
        return false
    }
    if (isTestPath(path)) return false
    return !OWNERS.includes(path)
}

/** The string value of a literal or a substitution-free template, if any. */
function staticString(node: Deno.lint.Node | undefined): string | undefined {
    if (!node) return undefined
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value
    }
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
        return node.quasis[0]?.cooked ?? undefined
    }
    return undefined
}

/** Whether `node` is the member expression `Deno.env.get`. */
function isDenoEnvGet(node: Deno.lint.Node): boolean {
    if (node.type !== 'MemberExpression' || node.computed) return false
    if (node.property.type !== 'Identifier' || node.property.name !== 'get') {
        return false
    }
    const env = node.object
    return env.type === 'MemberExpression' && !env.computed &&
        env.object.type === 'Identifier' && env.object.name === 'Deno' &&
        env.property.type === 'Identifier' && env.property.name === 'env'
}

/**
 * The name a property key spells when it is static (`APP_ENV` for
 * `x.APP_ENV`, `x['APP_ENV']`, `{ APP_ENV }`), or `undefined`.
 */
function staticKey(key: Deno.lint.Node, computed: boolean): string | undefined {
    if (!computed && key.type === 'Identifier') return key.name
    return staticString(key)
}

/** Whether the member expression `node` is written to, not read. */
function isWriteTarget(node: Deno.lint.MemberExpression): boolean {
    const parent = node.parent
    if (parent.type === 'AssignmentExpression') return parent.left === node
    if (parent.type === 'UpdateExpression') return true
    return parent.type === 'UnaryExpression' && parent.operator === 'delete'
}

/** The plugin, registered in the root `deno.jsonc` beside its siblings. */
const plugin: Deno.lint.Plugin = {
    name: 'lockness-env',
    rules: {
        'env-signal': {
            create(context) {
                if (!inScope(context.filename)) return {}
                return {
                    CallExpression(node) {
                        if (!isDenoEnvGet(node.callee)) return
                        const name = staticString(node.arguments[0])
                        if (name === undefined || !SIGNALS.has(name)) return
                        context.report({ node, message: MESSAGE, hint: HINT })
                    },
                    MemberExpression(node) {
                        const name = staticKey(node.property, node.computed)
                        if (name === undefined || !SIGNALS.has(name)) return
                        if (isWriteTarget(node)) return
                        context.report({ node, message: MESSAGE, hint: HINT })
                    },
                    ObjectPattern(node) {
                        for (const property of node.properties) {
                            if (property.type !== 'Property') continue
                            const name = staticKey(
                                property.key,
                                property.computed,
                            )
                            if (name === undefined || !SIGNALS.has(name)) {
                                continue
                            }
                            context.report({
                                node: property,
                                message: MESSAGE,
                                hint: HINT,
                            })
                        }
                    },
                }
            },
        },
    },
}

export default plugin
