/**
 * @fileoverview The one emit of user TypeScript for runtimes that cannot run
 * it themselves: TypeScript 6 `transpileModule`, with the compiler options of
 * the app's `tsconfig.json`.
 *
 * The app's `tsconfig.json` is the single home of the options that shape user
 * code — the decorator lowering (through `target`) and the JSX emit (plan 274
 * §5, audit A10). This module reads them and spells none of them. The Node
 * load hook (`register.ts`) calls {@link transpile} per file; `lockness build`
 * reuses the same function, so development and production emit the same code.
 *
 * The emit is single-file (`transpileModule`): no type check, no module
 * resolution. Type errors are the editor's and `deno check`'s job; only
 * syntax errors and invalid options stop a file here.
 *
 * TypeScript comes from npm because it has no JSR build (hard rule #2
 * exception, recorded in `package.json` and `deps.policy.jsonc`), pinned
 * exactly to 6.0.3: TypeScript 7 has no JavaScript API (#612).
 *
 * @module
 */

import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import type { CompilerOptions, Diagnostic } from 'typescript'

export type { CompilerOptions } from 'typescript'

/** The file name {@link findTsconfig} looks for. */
const TSCONFIG = 'tsconfig.json'

/**
 * TS18003, "No inputs were found in config file". {@link readCompilerOptions}
 * asks for the options only and lists no files, so this one is expected.
 */
const NO_INPUTS = 18003

/**
 * The JSX emits Node cannot run: `preserve` and `react-native` leave the JSX
 * in the output. Unset means `preserve` too.
 */
const UNRUNNABLE_JSX: ReadonlySet<ts.JsxEmit | undefined> = new Set([
    undefined,
    ts.JsxEmit.None,
    ts.JsxEmit.Preserve,
    ts.JsxEmit.ReactNative,
])

/**
 * The files that mark an app root. The `tsconfig.json` search never climbs
 * past the nearest directory holding one: compiler options such as
 * `jsxImportSource` decide which code is loaded, so a `tsconfig.json` planted
 * in a shared ancestor must not govern the app (#618).
 */
const BOUNDARY = ['package.json', 'deno.json', 'deno.jsonc'] as const

/** The group and other write bits. */
const GROUP_OTHER_WRITE = 0o022

/**
 * Find the `tsconfig.json` that governs a directory: the nearest one in it or
 * an ancestor, as the TypeScript language service does — but never above the
 * app root, the nearest directory holding a `package.json`, `deno.json` or
 * `deno.jsonc`.
 *
 * The file found must belong to the current user and be writable by nobody
 * else (on POSIX): its options decide which code the transform loads.
 *
 * @param fromDir - The directory the walk starts in, e.g. the directory of a
 *   source file.
 * @returns The absolute path of the nearest `tsconfig.json`, or `null` when the
 *   walk reaches the app root or the filesystem root without finding one.
 * @throws {Error} When the `tsconfig.json` found belongs to another user or is
 *   writable by group or others.
 *
 * @example
 * ```ts
 * findTsconfig('/srv/app/app/controller') // '/srv/app/tsconfig.json'
 * ```
 */
export function findTsconfig(fromDir: string): string | null {
    let dir = fromDir
    while (true) {
        const candidate = join(dir, TSCONFIG)
        if (existsSync(candidate)) {
            assertOwnTsconfig(candidate)
            return candidate
        }
        if (BOUNDARY.some((marker) => existsSync(join(dir, marker)))) {
            return null
        }
        const parent = dirname(dir)
        if (parent === dir) return null
        dir = parent
    }
}

/**
 * Refuse a `tsconfig.json` another local user could have written. Windows,
 * which has neither `getuid` nor POSIX mode bits, is not checked.
 *
 * @param path - The `tsconfig.json`.
 * @throws {Error} When it belongs to another user or is writable by group or
 *   others.
 */
function assertOwnTsconfig(path: string): void {
    if (typeof process.getuid !== 'function') return
    const stat = statSync(path)
    let problem: string | undefined
    if (stat.uid !== process.getuid()) problem = 'belongs to another user'
    else if ((stat.mode & GROUP_OTHER_WRITE) !== 0) {
        problem = 'is writable by group or others'
    }
    if (problem === undefined) return
    throw new Error(
        `@lockness/transform: ${path} ${problem}. Its compiler options ` +
            `decide which code the transform loads, so it is not used. Make ` +
            `it yours and writable by you alone (chmod go-w).`,
    )
}

/**
 * Read the compiler options of a `tsconfig.json`, following `extends`.
 *
 * Only `compilerOptions` matter here: the `include` / `files` list is not
 * enumerated, so reading the options of a large app costs one parse.
 *
 * @param tsconfigPath - Absolute path of the `tsconfig.json`.
 * @returns The parsed options, as TypeScript's API represents them (enum
 *   values, absolute paths).
 * @throws {Error} When the file cannot be read or parsed, or names an invalid
 *   option — the message names the file and every error TypeScript reported.
 *
 * @example
 * ```ts
 * const options = readCompilerOptions('/srv/app/tsconfig.json')
 * options.jsx // ts.JsxEmit.ReactJSX
 * ```
 */
export function readCompilerOptions(tsconfigPath: string): CompilerOptions {
    const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
    if (read.error !== undefined) {
        throw new Error(describe(tsconfigPath, [read.error]))
    }
    const host: ts.ParseConfigHost = {
        useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
        readDirectory: () => [],
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
    }
    const parsed = ts.parseJsonConfigFileContent(
        read.config,
        host,
        dirname(tsconfigPath),
        undefined,
        tsconfigPath,
    )
    const errors = parsed.errors.filter((d) => d.code !== NO_INPUTS)
    if (errors.length > 0) throw new Error(describe(tsconfigPath, errors))
    return parsed.options
}

/**
 * Emit the JavaScript for one TypeScript source file.
 *
 * The compiler options are the app's, with one exception: the output is
 * always an ES module (`module: ESNext`), because both consumers — the Node
 * load hook and `lockness build` — load the result as one. `moduleResolution`
 * is dropped with it: it does not affect a single-file emit, and a Node
 * resolution mode would contradict the ES module kind.
 *
 * @param source - The file's TypeScript source.
 * @param fileName - The file's path; its extension decides whether JSX is
 *   parsed (`.tsx`), and it names the file in errors.
 * @param options - The app's compiler options, from {@link readCompilerOptions}.
 * @returns The emitted JavaScript.
 * @throws {Error} When the source has a syntax error or the options are
 *   invalid (the message carries `file:line:column` for each), or when a
 *   `.tsx` file is emitted under a `jsx` option that leaves JSX in the output.
 *
 * @example
 * ```ts
 * const options = readCompilerOptions(findTsconfig(dir)!)
 * const js = transpile(readFileSync(file, 'utf8'), file, options)
 * ```
 */
export function transpile(
    source: string,
    fileName: string,
    options: CompilerOptions,
): string {
    if (fileName.endsWith('.tsx') && UNRUNNABLE_JSX.has(options.jsx)) {
        throw new Error(
            `${fileName}: the governing tsconfig.json sets no runnable "jsx" ` +
                `emit (unset, "preserve" or "react-native" leave JSX in the ` +
                `output). Set "jsx" to "react-jsx", "react-jsxdev" or "react".`,
        )
    }
    const { moduleResolution: _ignored, ...rest } = options
    const result = ts.transpileModule(source, {
        compilerOptions: { ...rest, module: ts.ModuleKind.ESNext },
        fileName,
        reportDiagnostics: true,
    })
    const errors = (result.diagnostics ?? []).filter(
        (d) => d.category === ts.DiagnosticCategory.Error,
    )
    if (errors.length > 0) throw new Error(describe(fileName, errors))
    return result.outputText
}

/**
 * One message for a list of TypeScript diagnostics.
 *
 * @param subject - The file the diagnostics are about.
 * @param diagnostics - The diagnostics, at least one.
 * @returns `subject` on the first line, then one line per diagnostic, located
 *   as `file:line:column` when TypeScript gives a position.
 */
function describe(subject: string, diagnostics: readonly Diagnostic[]): string {
    const lines = diagnostics.map((d) => {
        const text = ts.flattenDiagnosticMessageText(d.messageText, '\n')
        if (d.file === undefined || d.start === undefined) {
            return `  TS${d.code}: ${text}`
        }
        const { line, character } = d.file.getLineAndCharacterOfPosition(
            d.start,
        )
        return `  ${d.file.fileName}:${line + 1}:${
            character + 1
        } TS${d.code}: ${text}`
    })
    return [`${subject}: TypeScript reported an error`, ...lines].join('\n')
}

/**
 * The version of the TypeScript compiler doing the emit, part of every cache
 * key: a compiler change can change the output for the same input.
 */
export const TYPESCRIPT_VERSION: string = ts.version
