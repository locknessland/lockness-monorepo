/**
 * @fileoverview Lint rule `lockness/app-file-specifier`: no hand-built
 * specifier for a file of the user's app in published package source (#477).
 *
 * A package that imports an app file must go through `importAppFile` from
 * `@lockness/contract`. Every hand-built alternative passes inside this
 * monorepo, where packages load from disk, and breaks for a consumer who
 * installs from JSR:
 *
 * - `` `file://${p}` `` (or `file:///`, `file:`) — `deno publish` rewrites an
 *   `import()` of it into a relative path that resolves against the registry,
 *   and as a plain string a `#` or `?` in the path truncates it.
 * - A path built from `Deno.cwd()` by interpolation or `+` — a bare absolute
 *   path resolves against the importing module, which from JSR is `https:`.
 * - `new URL(p, 'file:…')` — the same truncation, through the URL parser.
 * - `` import(`${x}/…`) `` — a template that is not a `./` or `../` relative
 *   path is something `deno publish` cannot analyse, and usually one of the
 *   above.
 *
 * Deno's module graph sees none of the first three (measured: it is blind to
 * every shape `deno publish` silently rewrites), so this rule walks the AST
 * instead. It reports only in package source: tests, `*.test.ts` and
 * `*_test.ts` are skipped, since they build such specifiers on purpose.
 *
 * A path built with `join(Deno.cwd(), …)` and passed to `import()` through a
 * variable is NOT seen here; `publish:check` catches it as an uninventoried
 * non-literal import site.
 *
 * @module scripts/lint/app_file_specifier
 */

/** The rule's message, naming the one sanctioned way. */
const MESSAGE =
    'Hand-built app-file specifier: import app files through importAppFile() from @lockness/contract (#477)'

/** The hint shown under the message. */
const HINT =
    'From JSR this resolves against the registry, or truncates at a "#". ' +
    'For a non-app file:// URL use toFileUrl(path).href from @std/path.'

/**
 * Whether the rule applies to a file: published package source only.
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @returns `true` under `/packages/`, outside tests.
 */
export function inScope(filename: string): boolean {
    const path = filename.replaceAll('\\', '/')
    if (!path.includes('/packages/')) return false
    if (path.includes('/tests/')) return false
    return !path.endsWith('.test.ts') && !path.endsWith('_test.ts')
}

/** Whether `node` is a `Deno.cwd()` call. */
function isDenoCwd(node: Deno.lint.Node): boolean {
    if (node.type !== 'CallExpression') return false
    const callee = node.callee
    return callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'Deno' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'cwd'
}

/** Whether `node` is a string literal starting with `file:`. */
function isFileString(node: Deno.lint.Node): boolean {
    return node.type === 'Literal' && typeof node.value === 'string' &&
        node.value.startsWith('file:')
}

/** Whether a template literal starts with `file:` or interpolates `Deno.cwd()`. */
function isAppFileTemplate(node: Deno.lint.TemplateLiteral): boolean {
    const head = node.quasis[0]?.cooked ?? node.quasis[0]?.raw ?? ''
    return head.startsWith('file:') || node.expressions.some(isDenoCwd)
}

/** The plugin, registered once in the root `deno.jsonc`. */
const plugin: Deno.lint.Plugin = {
    name: 'lockness',
    rules: {
        'app-file-specifier': {
            create(context) {
                if (!inScope(context.filename)) return {}
                const report = (node: Deno.lint.Node) =>
                    context.report({ node, message: MESSAGE, hint: HINT })
                return {
                    // Shapes 1 and 2: `file:${…}`, `${Deno.cwd()}/…`.
                    TemplateLiteral(node) {
                        if (isAppFileTemplate(node)) report(node)
                    },
                    // Shape 3: 'file://' + p, Deno.cwd() + '/x'.
                    BinaryExpression(node) {
                        if (node.operator !== '+') return
                        const operands = [node.left, node.right]
                        if (
                            operands.some((operand) =>
                                isFileString(operand) || isDenoCwd(operand)
                            )
                        ) report(node)
                    },
                    // Shape 4: new URL(p, 'file://').
                    NewExpression(node) {
                        if (
                            node.callee.type !== 'Identifier' ||
                            node.callee.name !== 'URL'
                        ) return
                        const base = node.arguments[1]
                        if (base && isFileString(base)) report(node)
                    },
                    // Shape 5: import(`${x}/…`), a template that is not a
                    // relative path. Shapes 1 and 2 report the template itself.
                    ImportExpression(node) {
                        const source = node.source
                        if (source.type !== 'TemplateLiteral') return
                        if (isAppFileTemplate(source)) return
                        const head = source.quasis[0]?.cooked ?? ''
                        if (head.startsWith('./') || head.startsWith('../')) {
                            return
                        }
                        report(node)
                    },
                }
            },
        },
    },
}

export default plugin
