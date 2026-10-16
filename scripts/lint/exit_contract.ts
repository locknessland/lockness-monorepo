/**
 * @fileoverview Lint plugin `lockness-exit`: the CLI exit contract stays the
 * one way a command fails (#436, D5).
 *
 * A command reports failure by throwing; `Cli.dispatch()` / `runEntry` print
 * it once and map it to the exit status, written in one place. Two shapes
 * break that contract, and each has a rule:
 *
 * - `process-exit` — an exit call (`Deno.exit(1)`, `Deno['exit'](1)`, `exit`
 *   destructured from `Deno`) or an exit-status write (an assignment, `++` or
 *   `--` on `Deno.exitCode`) in package code — and the same shapes on Node's
 *   `process` (`process.exit()`, `process.exitCode = 1`, `exit` destructured
 *   from `process` or imported from `node:process`; #596, plan 274 T019).
 *   An exit skips `finally` blocks and can cut off buffered output; a second
 *   status write is a second status mapping. The owners below are the only
 *   legitimate sites, for either spelling, so an owner keeps its right as it
 *   migrates off Deno: process-level exits (server boot, signal shutdown),
 *   and the CLI's one status write. `Deno` and `process` are matched by name:
 *   an alias (`const d = Deno`, `globalThis.process`, a namespace import of
 *   `node:process`) is not followed — that needs scope analysis.
 * - `printed-failure` — a `console.error/warn/log` whose first argument starts
 *   with `❌`, in command code. That is the shape of a failure printed instead
 *   of thrown, which exits 0. The few `❌` prints in command code that are not
 *   command failures carry an inline
 *   `// deno-lint-ignore lockness-exit/printed-failure`, with the reason on
 *   the line above.
 *
 * Tests and stub templates are out of scope for both rules. Scope is decided
 * on the path relative to the repository root, never on the absolute path: a
 * checkout under a directory named `tests`, `stubs` or `packages` lints the
 * same as any other.
 *
 * @module scripts/lint/exit_contract
 */

import { isTestOrStubPath, REPO_ROOT, repoPath } from './repo_path.ts'

/**
 * The files allowed to call `Deno.exit()` / `process.exit()`: process-level
 * exits, not commands.
 */
const EXIT_OWNERS = [
    'packages/core/http/server.ts',
    'packages/core/kernel/signals.ts',
]

/**
 * The file allowed to write `Deno.exitCode` / `process.exitCode`: the CLI's
 * one status mapping.
 */
const EXIT_CODE_OWNERS = ['packages/cli/report.ts']

/** The `mod.ts` files that hold a standalone tool's command code. */
const COMMAND_MODS = ['ui', 'upgrade', 'init']

/** The console methods a printed failure goes through. */
const PRINTERS = new Set(['error', 'warn', 'log'])

/** The glyph a printed failure starts with. */
const FAILURE_GLYPH = '❌'

const EXIT_MESSAGE =
    'Process exit in package code: a command throws (CommandFailedError), and the CLI maps it to the status (#436)'
const EXIT_HINT = 'Deno.exit() / process.exit() is owned by ' +
    'core/http/server.ts and core/kernel/signals.ts; Deno.exitCode / ' +
    'process.exitCode is written by cli/report.ts only. ' +
    'The owner list lives in scripts/lint/exit_contract.ts.'

const PRINT_MESSAGE =
    'Failure printed in command code: throw a failure instead, so the command exits non-zero and prints it once (#436)'
const PRINT_HINT =
    'If this ❌ is not a command failure (the command carries on), add ' +
    '`// deno-lint-ignore lockness-exit/printed-failure` with the reason on ' +
    'the line above.'

/**
 * The repository-relative path of a package file `process-exit` applies to.
 *
 * @returns The path (`packages/<pkg>/…`), or `undefined` when the file is
 *   outside the repository's `packages/`, a test or a stub.
 */
function packagePath(filename: string, root: string): string | undefined {
    const path = repoPath(filename, root)
    if (path === undefined || !path.startsWith('packages/')) return undefined
    return isTestOrStubPath(path) ? undefined : path
}

/**
 * Whether `process-exit` applies to a file.
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @param root - The repository root. Defaults to the repository holding this
 *   rule; tests pass another to place the checkout elsewhere.
 * @returns `true` under the repository's `packages/`, outside tests and stubs.
 */
export function inPackageScope(
    filename: string,
    root: string = REPO_ROOT,
): boolean {
    return packagePath(filename, root) !== undefined
}

/**
 * Whether `printed-failure` applies to a file: command code under the
 * repository's `packages/`, outside tests and stubs.
 *
 * Command code is any `commands/` or `generators/` directory of a package,
 * any `cli_commands.ts`, `commands.ts` (queue's, #592), `setup.ts` (a
 * package setup step, #592) or `install.ts`,
 * `cli/core_commands.ts`, `core/cli/`,
 * and the `mod.ts` of ui, upgrade and init (standalone tools).
 *
 * @param filename - The file being linted, as Deno hands it over.
 * @param root - The repository root, as for {@link inPackageScope}.
 * @returns `true` when the file holds command code.
 */
export function inCommandScope(
    filename: string,
    root: string = REPO_ROOT,
): boolean {
    const path = packagePath(filename, root)
    if (path === undefined) return false
    const match = /^packages\/([^/]+)\/(.+)$/.exec(path)
    if (!match) return false
    const [, pkg, rest] = match
    const base = rest.slice(rest.lastIndexOf('/') + 1)
    if (/(^|\/)(commands|generators)\//.test(rest)) return true
    if (
        ['cli_commands.ts', 'commands.ts', 'setup.ts', 'install.ts'].includes(
            base,
        )
    ) {
        return true
    }
    if (pkg === 'cli' && rest === 'core_commands.ts') return true
    if (pkg === 'core' && rest.startsWith('cli/')) return true
    return COMMAND_MODS.includes(pkg) && rest === 'mod.ts'
}

/**
 * The name a property key spells, when it is static: `exit` for the key of
 * `Deno.exit`, `Deno['exit']`, ``Deno[`exit`]``, `{ exit }` and
 * `{ 'exit': x }`.
 *
 * @param key - A member's property, or a pattern property's key.
 * @param computed - Whether the key is written in brackets.
 * @returns The name, or `undefined` for a dynamic key (`Deno[key]`).
 */
function staticKey(
    key: Deno.lint.Node,
    computed: boolean,
): string | undefined {
    if (!computed && key.type === 'Identifier') return key.name
    if (key.type === 'Literal' && typeof key.value === 'string') {
        return key.value
    }
    if (key.type === 'TemplateLiteral' && key.expressions.length === 0) {
        return key.quasis[0]?.cooked ?? undefined
    }
    return undefined
}

/** The objects whose `exit` / `exitCode` end the process: Deno's and Node's. */
const PROCESS_OBJECTS = new Set(['Deno', 'process'])

/** The specifiers Node's `process` module is imported by. */
const PROCESS_MODULES = new Set(['node:process', 'process'])

/** Whether `node` is the identifier `Deno` or `process`. */
function isProcessObject(node: Deno.lint.Node | null | undefined): boolean {
    return node?.type === 'Identifier' && PROCESS_OBJECTS.has(node.name)
}

/**
 * Whether `node` is `Deno.<name>` or `process.<name>`, dotted or computed
 * with a static key.
 */
function isProcessMember(node: Deno.lint.Node, name: string): boolean {
    return node.type === 'MemberExpression' && isProcessObject(node.object) &&
        staticKey(node.property, node.computed) === name
}

/** Whether `node` imports `exit` from `node:process`, renamed or not. */
function importsExit(node: Deno.lint.ImportDeclaration): boolean {
    return typeof node.source.value === 'string' &&
        PROCESS_MODULES.has(node.source.value) &&
        node.specifiers.some((specifier) =>
            specifier.type === 'ImportSpecifier' &&
            staticKey(specifier.imported, false) === 'exit'
        )
}

/** Whether the pattern `node` takes out `exit` (`{ exit }`, `{ exit: x }`). */
function destructuresExit(node: Deno.lint.Node): boolean {
    return node.type === 'ObjectPattern' &&
        node.properties.some((property) =>
            property.type === 'Property' &&
            staticKey(property.key, property.computed) === 'exit'
        )
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

/** The plugin, registered in the root `deno.jsonc` beside its siblings. */
const plugin: Deno.lint.Plugin = {
    name: 'lockness-exit',
    rules: {
        'process-exit': {
            create(context) {
                const path = packagePath(context.filename, REPO_ROOT)
                if (path === undefined) return {}
                const exitOwned = EXIT_OWNERS.includes(path)
                const exitCodeOwned = EXIT_CODE_OWNERS.includes(path)
                const report = (node: Deno.lint.Node) =>
                    context.report({
                        node,
                        message: EXIT_MESSAGE,
                        hint: EXIT_HINT,
                    })
                const writesExitCode = (target: Deno.lint.Node) =>
                    !exitCodeOwned && isProcessMember(target, 'exitCode')
                const takesExit = (
                    pattern: Deno.lint.Node,
                    source: Deno.lint.Node | null,
                ) => !exitOwned && isProcessObject(source) &&
                    destructuresExit(pattern)
                return {
                    CallExpression(node) {
                        if (
                            !exitOwned && isProcessMember(node.callee, 'exit')
                        ) {
                            report(node)
                        }
                    },
                    ImportDeclaration(node) {
                        if (!exitOwned && importsExit(node)) report(node)
                    },
                    VariableDeclarator(node) {
                        if (takesExit(node.id, node.init)) report(node)
                    },
                    AssignmentExpression(node) {
                        if (writesExitCode(node.left)) report(node)
                        if (takesExit(node.left, node.right)) report(node)
                    },
                    UpdateExpression(node) {
                        if (writesExitCode(node.argument)) report(node)
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
