/**
 * @fileoverview Lint plugin `lockness-exit`: the CLI exit contract stays the
 * one way a command fails (#436, D5).
 *
 * A command reports failure by throwing; `Cli.dispatch()` / `runEntry` print
 * it once and map it to the exit status, written in one place. Two shapes
 * break that contract, and each has a rule:
 *
 * - `process-exit` — a `Deno.exit(` call or a `Deno.exitCode` assignment in
 *   package code. `Deno.exit()` skips `finally` blocks and can cut off
 *   buffered output; a second `Deno.exitCode` write is a second status
 *   mapping. The owners below are the only legitimate sites: process-level
 *   exits (server boot, signal shutdown), and the CLI's one status write.
 * - `printed-failure` — a `console.error/warn/log` whose first argument starts
 *   with `❌`, in command code. That is the shape of a failure printed instead
 *   of thrown, which exits 0. The few `❌` prints in command code that are not
 *   command failures carry an inline
 *   `// deno-lint-ignore lockness-exit/printed-failure`, with the reason on
 *   the line above.
 *
 * Tests and stub templates are out of scope for both rules.
 *
 * @module scripts/lint/exit_contract
 */

/** The files allowed to call `Deno.exit()`: process-level exits, not commands. */
const EXIT_OWNERS = [
    '/packages/core/http/server.ts',
    '/packages/core/kernel/signals.ts',
]

/** The file allowed to write `Deno.exitCode`: the CLI's one status mapping. */
const EXIT_CODE_OWNERS = ['/packages/cli/report.ts']

/** The `mod.ts` files that hold a standalone tool's command code. */
const COMMAND_MODS = ['ui', 'upgrade', 'init']

/** The console methods a printed failure goes through. */
const PRINTERS = new Set(['error', 'warn', 'log'])

/** The glyph a printed failure starts with. */
const FAILURE_GLYPH = '❌'

const EXIT_MESSAGE =
    'Process exit in package code: a command throws (CommandFailedError), and the CLI maps it to the status (#436)'
const EXIT_HINT = 'Deno.exit() is owned by core/http/server.ts and ' +
    'core/kernel/signals.ts; Deno.exitCode is written by cli/report.ts only. ' +
    'The owner list lives in scripts/lint/exit_contract.ts.'

const PRINT_MESSAGE =
    'Failure printed in command code: throw a failure instead, so the command exits non-zero and prints it once (#436)'
const PRINT_HINT =
    'If this ❌ is not a command failure (the command carries on), add ' +
    '`// deno-lint-ignore lockness-exit/printed-failure` with the reason on ' +
    'the line above.'

/** `filename` with forward slashes. */
function normalize(filename: string): string {
    return filename.replaceAll('\\', '/')
}

/** Whether `path` is a test or a stub template. */
function isTestOrStub(path: string): boolean {
    if (path.includes('/tests/') || path.includes('/stubs/')) return true
    return /[._]test\.tsx?$/.test(path)
}

/**
 * Whether `process-exit` applies to a file.
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @returns `true` under `/packages/`, outside tests and stubs.
 */
export function inPackageScope(filename: string): boolean {
    const path = normalize(filename)
    return path.includes('/packages/') && !isTestOrStub(path)
}

/**
 * Whether `printed-failure` applies to a file: command code under
 * `/packages/`, outside tests and stubs.
 *
 * Command code is any `commands/` or `generators/` directory of a package,
 * any `cli_commands.ts` or `install.ts`, `cli/core_commands.ts`, `core/cli/`,
 * and the `mod.ts` of ui, upgrade and init (standalone tools).
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @returns `true` when the file holds command code.
 */
export function inCommandScope(filename: string): boolean {
    if (!inPackageScope(filename)) return false
    const match = /\/packages\/([^/]+)\/(.+)$/.exec(normalize(filename))
    if (!match) return false
    const [, pkg, rest] = match
    const base = rest.slice(rest.lastIndexOf('/') + 1)
    if (/(^|\/)(commands|generators)\//.test(rest)) return true
    if (base === 'cli_commands.ts' || base === 'install.ts') return true
    if (pkg === 'cli' && rest === 'core_commands.ts') return true
    if (pkg === 'core' && rest.startsWith('cli/')) return true
    return COMMAND_MODS.includes(pkg) && rest === 'mod.ts'
}

/** Whether `node` is the member expression `Deno.<name>`. */
function isDenoMember(node: Deno.lint.Node, name: string): boolean {
    return node.type === 'MemberExpression' && !node.computed &&
        node.object.type === 'Identifier' && node.object.name === 'Deno' &&
        node.property.type === 'Identifier' && node.property.name === name
}

/** Whether `node` is `console.error`, `console.warn` or `console.log`. */
function isPrinter(node: Deno.lint.Node): boolean {
    return node.type === 'MemberExpression' && !node.computed &&
        node.object.type === 'Identifier' && node.object.name === 'console' &&
        node.property.type === 'Identifier' && PRINTERS.has(node.property.name)
}

/** The leading text of a string literal or template, if `node` is one. */
function leadingText(node: Deno.lint.Node | undefined): string | undefined {
    if (!node) return undefined
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value
    }
    if (node.type === 'TemplateLiteral') {
        return node.quasis[0]?.cooked ?? undefined
    }
    return undefined
}

/** Whether `path` ends with one of `owners`. */
function ownedBy(path: string, owners: readonly string[]): boolean {
    return owners.some((owner) => path.endsWith(owner))
}

/** The plugin, registered in the root `deno.jsonc` beside its siblings. */
const plugin: Deno.lint.Plugin = {
    name: 'lockness-exit',
    rules: {
        'process-exit': {
            create(context) {
                if (!inPackageScope(context.filename)) return {}
                const path = normalize(context.filename)
                const exitOwned = ownedBy(path, EXIT_OWNERS)
                const exitCodeOwned = ownedBy(path, EXIT_CODE_OWNERS)
                return {
                    CallExpression(node) {
                        if (exitOwned || !isDenoMember(node.callee, 'exit')) {
                            return
                        }
                        context.report({
                            node,
                            message: EXIT_MESSAGE,
                            hint: EXIT_HINT,
                        })
                    },
                    AssignmentExpression(node) {
                        if (
                            exitCodeOwned ||
                            !isDenoMember(node.left, 'exitCode')
                        ) {
                            return
                        }
                        context.report({
                            node,
                            message: EXIT_MESSAGE,
                            hint: EXIT_HINT,
                        })
                    },
                }
            },
        },
        'printed-failure': {
            create(context) {
                if (!inCommandScope(context.filename)) return {}
                return {
                    CallExpression(node) {
                        if (!isPrinter(node.callee)) return
                        const text = leadingText(node.arguments[0])
                        if (!text?.trimStart().startsWith(FAILURE_GLYPH)) {
                            return
                        }
                        context.report({
                            node,
                            message: PRINT_MESSAGE,
                            hint: PRINT_HINT,
                        })
                    },
                }
            },
        },
    },
}

export default plugin
