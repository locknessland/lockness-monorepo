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
 * Reports `Deno.env.get('APP_ENV')` / `Deno.env.get('DENO_ENV')` (any quote
 * style) in `packages/`, `app/` and `config/`, outside tests and the two
 * contract files. Writes (`Deno.env.set`) are not reads and pass. Markdown
 * examples are not linted.
 *
 * @module scripts/lint/env_signal
 */

/** The rule's message, naming the sanctioned way. */
const MESSAGE =
    'Raw environment-signal read: use resolveEnvName() / isProduction() / isExplicitlyDevelopment() from @lockness/core or @lockness/contract (#504)'

/** The hint shown under the message. */
const HINT =
    'APP_ENV is read in one place so the framework and the app never disagree. ' +
    'DENO_ENV is no longer an environment signal.'

/** The variables only the resolver may read. */
const SIGNALS = new Set(['APP_ENV', 'DENO_ENV'])

/** The two files that own the raw reads. */
const OWNERS = [
    '/packages/contract/environment_read.ts',
    '/packages/contract/environment_legacy.ts',
]

/**
 * Whether the rule applies to a file.
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @returns `true` under `/packages/`, `/app/` or `/config/`, outside tests and
 * the resolver's own files.
 */
export function inScope(filename: string): boolean {
    const path = filename.replaceAll('\\', '/')
    if (
        !['/packages/', '/app/', '/config/'].some((dir) => path.includes(dir))
    ) {
        return false
    }
    if (path.includes('/tests/')) return false
    if (path.endsWith('.test.ts') || path.endsWith('_test.ts')) return false
    if (path.endsWith('.test.tsx')) return false
    return !OWNERS.some((owner) => path.endsWith(owner))
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

/** The plugin, registered in the root `deno.jsonc` beside its sibling. */
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
                }
            },
        },
    },
}

export default plugin
