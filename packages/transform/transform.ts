/**
 * @fileoverview The one emit of user TypeScript for runtimes that cannot run
 * it themselves: TypeScript 6 `transpileModule`, with the compiler options of
 * the app's `tsconfig.json`.
 *
 * Compiler options split in two (plan 274 §5, rows 204 and 204b):
 *
 * - **Semantic options** decide what the code means — `target` (and with it
 *   the decorator lowering), class fields, `jsx*`, `verbatimModuleSyntax`.
 *   Their single home is the app's `tsconfig.json` (audit A10): this module
 *   reads them and spells none of them.
 * - **Placement options** decide where the emitted code and its map go and how
 *   specifiers are written. They depend on who consumes the emit, so they live
 *   in one table here, {@link PLACEMENT}, and the app's value for any of them
 *   never reaches the emit.
 *
 * Two entry points run over one private emit:
 *
 * | Entry point | Consumer | Specifiers | Source map |
 * | :--- | :--- | :--- | :--- |
 * | {@link transpileForLoad} | the Node load hook | kept (`./a.ts`) | inlined |
 * | {@link transpileForBuild} | `lockness build` | `.ts`/`.tsx` → `.js` | external, with a `sourceRoot` |
 *
 * The emit is single-file (`transpileModule`): no type check, no module
 * resolution. Type errors are the editor's and `deno check`'s job; only
 * syntax errors and invalid options stop a file here — and invalid options
 * fail closed, because TypeScript drops a rejected value and the emit would
 * silently change.
 *
 * TypeScript comes from npm because it has no JSR build (recorded in
 * `package.json` and `deps.policy.jsonc`), pinned
 * exactly to 6.0.3: TypeScript 7 has no JavaScript API (#612).
 *
 * @module
 */

import {
    closeSync,
    existsSync,
    fstatSync,
    openSync,
    readFileSync,
    type Stats,
    statSync,
} from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import type { CompilerOptions, Diagnostic } from 'typescript'

export type { CompilerOptions } from 'typescript'

/** The result of {@link transpileForBuild}: the module and its source map. */
export interface BuildEmit {
    /**
     * The emitted JavaScript. It ends with a `sourceMappingURL` comment
     * naming `<outFile>.map` by its base name.
     */
    readonly code: string
    /**
     * The source map, as JSON text, to write at `<outFile>.map`. Its
     * `sourceRoot` joined with its one `sources` entry resolves, from the
     * map's location, to the source file.
     */
    readonly map: string
}

/** Who consumes an emit: the Node load hook, or `lockness build`. */
type Consumer = 'load' | 'build'

/**
 * The placement options — the one table of them. The app's value for every
 * option named here is discarded, then the consumer's values are applied.
 *
 * `dropped` are the layout options: where `tsc` puts outputs and maps when it
 * compiles a project. A single-file emit has no layout of its own, and some
 * of them still leak into it (`outDir` moves the map's `sources`, `mapRoot`
 * the `sourceMappingURL`). `moduleResolution` goes too: it does not affect a
 * single-file emit, and a Node resolution mode contradicts `module: ESNext`.
 * (They are deleted, not set to `undefined`: `transpileModule` validates
 * every key it is given.)
 *
 * Both consumers force `module: ESNext`, because both load the output as an
 * ES module (an app's `module: nodenext` makes `transpileModule` emit
 * CommonJS for a lone `.ts`). The load hook keeps `./a.ts` specifiers, which
 * Node resolves to the file the hook transforms next, and inlines the map;
 * the build rewrites them to the `.js` files it writes and keeps the map
 * beside the output (its `sourceRoot` is computed per file).
 */
const PLACEMENT: {
    readonly dropped: readonly (keyof CompilerOptions)[]
} & Readonly<Record<Consumer, CompilerOptions>> = {
    dropped: [
        'moduleResolution',
        'outDir',
        'outFile',
        'rootDir',
        'rootDirs',
        'declaration',
        'declarationDir',
        'declarationMap',
        'emitDeclarationOnly',
        'noEmit',
        'composite',
        'incremental',
        'tsBuildInfoFile',
        'sourceMap',
        'inlineSourceMap',
        'inlineSources',
        'sourceRoot',
        'mapRoot',
    ],
    load: {
        module: ts.ModuleKind.ESNext,
        rewriteRelativeImportExtensions: false,
        inlineSourceMap: true,
    },
    build: {
        module: ts.ModuleKind.ESNext,
        rewriteRelativeImportExtensions: true,
        sourceMap: true,
    },
}

/**
 * The options one consumer's emit runs with.
 *
 * @param options - The app's compiler options.
 * @param consumer - Who consumes the emit.
 * @returns The app's semantic options with the consumer's placement applied.
 */
function placed(options: CompilerOptions, consumer: Consumer): CompilerOptions {
    const semantic: CompilerOptions = { ...options }
    for (const name of PLACEMENT.dropped) delete semantic[name]
    return { ...semantic, ...PLACEMENT[consumer] }
}

/** The file name {@link findTsconfig} looks for. */
const TSCONFIG = 'tsconfig.json'

/**
 * TS18003, "No inputs were found in config file". {@link readCompilerOptions}
 * asks for the options only and lists no files, so this one is expected.
 */
const NO_INPUTS = 18003

/**
 * The options whose **value** diagnostics are tolerated: they name the type
 * environment (`"lib": ["deno.ns"]` for a Deno-oriented app), which a
 * single-file emit never reads. Every other option diagnostic is fatal.
 */
const ENVIRONMENT_OPTIONS: ReadonlySet<string> = new Set(['lib', 'types'])

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

/**
 * The other-write bit. Group write is allowed: a tree writable by a shared
 * group is exposed through its sources, which no check here can protect.
 */
const OTHER_WRITE = 0o002

/**
 * Find the `tsconfig.json` that governs a directory: the nearest one in it or
 * an ancestor, as the TypeScript language service does — but never above the
 * app root, the nearest directory holding a `package.json`, `deno.json` or
 * `deno.jsonc`.
 *
 * The file found must belong to the current user and not be writable by
 * others (on POSIX): its options decide which code the transform loads.
 * Group write is allowed, as for the source files beside it.
 *
 * @param fromDir - The directory the walk starts in, e.g. the directory of a
 *   source file.
 * @returns The absolute path of the nearest `tsconfig.json`, or `null` when the
 *   walk reaches the app root or the filesystem root without finding one.
 * @throws {Error} When the `tsconfig.json` found belongs to another user or is
 *   writable by others.
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
 * @throws {Error} When it belongs to another user or is writable by others.
 */
function assertOwnTsconfig(path: string): void {
    const uid = process.getuid?.()
    if (uid === undefined) return
    assertOwnStat(statSync(path), path, uid)
}

/**
 * Read a `tsconfig.json`, or a file one extends, through a descriptor whose
 * `fstat` passes the owner rule — so the bytes parsed are the bytes checked.
 * `extends` may resolve above the app root (an ancestor's `node_modules`), so
 * every file of the chain is checked, not only the one {@link findTsconfig}
 * found.
 *
 * @param path - The file.
 * @returns Its text, or `undefined` when it does not exist (TypeScript then
 *   reports it as unreadable).
 * @throws {Error} When it belongs to another user or is writable by others,
 *   or cannot be read for another reason.
 */
function readOwnConfig(path: string): string | undefined {
    let fd: number
    try {
        fd = openSync(path, 'r')
    } catch (error) {
        if ((error as { code?: unknown }).code === 'ENOENT') return undefined
        throw error
    }
    try {
        const uid = process.getuid?.()
        if (uid !== undefined) assertOwnStat(fstatSync(fd), path, uid)
        return readFileSync(fd, 'utf8')
    } finally {
        closeSync(fd)
    }
}

/**
 * The owner rule for compiler-option files, on POSIX.
 *
 * @param stat - The file's stat.
 * @param path - The file, for the message.
 * @param uid - The current user's uid.
 * @throws {Error} When it belongs to another user or is writable by others.
 */
function assertOwnStat(stat: Stats, path: string, uid: number): void {
    let problem: string | undefined
    if (stat.uid !== uid) problem = 'belongs to another user'
    else if ((stat.mode & OTHER_WRITE) !== 0) {
        problem = 'is writable by others'
    }
    if (problem === undefined) return
    throw new Error(
        `@lockness/transform: ${path} ${problem}. Its compiler options ` +
            `decide which code the transform loads, so it is not used. Make ` +
            `it yours and not writable by others (chmod o-w).`,
    )
}

/**
 * Read the compiler options of a `tsconfig.json`, following `extends`.
 *
 * Only `compilerOptions` matter here: the `include` / `files` list is not
 * enumerated, so reading the options of a large app costs one parse.
 *
 * Option diagnostics fail closed: an unknown option or an invalid value
 * throws, because TypeScript drops a rejected value and the emit would
 * silently differ from what the file asks for. The one exception is a value
 * diagnostic on `lib` or `types`, which name the type environment (for
 * example Deno's `"deno.ns"`) and do not affect a single-file emit. The file
 * is parsed as a source file so that each diagnostic maps to the option that
 * raised it.
 *
 * @param tsconfigPath - Absolute path of the `tsconfig.json`.
 * @returns The parsed options, as TypeScript's API represents them (enum
 *   values, absolute paths).
 * @throws {Error} When the file (or one it extends) cannot be read, belongs
 *   to another user or is writable by others, or is not valid JSONC, or names an unknown option or an invalid value — the message
 *   names the file and locates every error TypeScript reported.
 *
 * @example
 * ```ts
 * const options = readCompilerOptions('/srv/app/tsconfig.json')
 * options.jsx // ts.JsxEmit.ReactJSX
 * ```
 */
export function readCompilerOptions(tsconfigPath: string): CompilerOptions {
    const text = readOwnConfig(tsconfigPath)
    if (text === undefined) {
        throw new Error(`${tsconfigPath}: cannot read the file`)
    }
    const syntax = ts.parseConfigFileTextToJson(tsconfigPath, text).error
    if (syntax !== undefined) {
        throw new Error(describe(tsconfigPath, [syntax]))
    }
    const host: ts.ParseConfigHost = {
        useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
        readDirectory: () => [],
        fileExists: ts.sys.fileExists,
        readFile: readOwnConfig,
    }
    const parsed = ts.parseJsonSourceFileConfigFileContent(
        ts.readJsonConfigFile(tsconfigPath, () => text),
        host,
        dirname(tsconfigPath),
        undefined,
        tsconfigPath,
    )
    const errors = parsed.errors.filter((d) =>
        d.code !== NO_INPUTS && !isEnvironmentValueDiagnostic(d)
    )
    if (errors.length > 0) throw new Error(describe(tsconfigPath, errors))
    return parsed.options
}

/**
 * Emit the JavaScript the Node load hook hands to Node for one file.
 *
 * Relative specifiers stay as written (`./a.ts`): Node resolves them to the
 * next file the hook transforms. The source map is inlined as a data URL, so
 * `--enable-source-maps` locates a stack frame with nothing written to disk.
 *
 * @param source - The file's TypeScript source.
 * @param fileName - The file's path; its extension decides whether JSX is
 *   parsed (`.tsx`), and it names the file in errors and in the map.
 * @param options - The app's compiler options, from {@link readCompilerOptions}.
 * @returns The emitted JavaScript, an ES module.
 * @throws {Error} When the source has a syntax error or the options are
 *   invalid (the message carries `file:line:column` for each), or when a
 *   `.tsx` file is emitted under a `jsx` option that leaves JSX in the output.
 *
 * @example
 * ```ts
 * const options = readCompilerOptions(findTsconfig(dir)!)
 * const js = transpileForLoad(readFileSync(file, 'utf8'), file, options)
 * ```
 */
export function transpileForLoad(
    source: string,
    fileName: string,
    options: CompilerOptions,
): string {
    return emit(source, fileName, optionsForLoad(options)).outputText
}

/**
 * The options {@link transpileForLoad} emits with: the app's semantic
 * options with the load placement applied. The load hook keys its cache on
 * these, not on the app's raw options, so a change to the placement table
 * alone can never serve an entry emitted under the old one. Internal: not
 * exported from the package.
 *
 * @param options - The app's compiler options.
 * @returns The options of the load emit.
 *
 * @example
 * ```ts
 * cacheKey({ transformerVersion, compilerOptions: optionsForLoad(options), fileName, source })
 * ```
 */
export function optionsForLoad(options: CompilerOptions): CompilerOptions {
    return placed(options, 'load')
}

/**
 * Emit one file for `lockness build`: the module and its external source map.
 *
 * Relative `.ts` / `.tsx` specifiers are rewritten to the `.js` files the
 * build writes; bare and `.d.ts` specifiers are left alone. The map names the
 * source file through a `sourceRoot` relative to `outFile`, so it resolves
 * wherever the build output is moved as a whole. The build never reads the
 * load hook's cache.
 *
 * @param source - The file's TypeScript source.
 * @param fileName - The file's path; its extension decides whether JSX is
 *   parsed (`.tsx`), and it names the file in errors and in the map.
 * @param outFile - Where the build writes the module, e.g.
 *   `/srv/app/dist/main.js`. Its base name must be the one the rewritten
 *   imports point at (`main.ts` → `main.js`).
 * @param options - The app's compiler options, from {@link readCompilerOptions}.
 * @returns The code and its map; write the map at `<outFile>.map`.
 * @throws {Error} As {@link transpileForLoad} does, and when `outFile`'s base
 *   name is not the emitted one.
 *
 * @example
 * ```ts
 * const { code, map } = transpileForBuild(source, file, outFile, options)
 * writeFileSync(outFile, code)
 * writeFileSync(`${outFile}.map`, map)
 * ```
 */
export function transpileForBuild(
    source: string,
    fileName: string,
    outFile: string,
    options: CompilerOptions,
): BuildEmit {
    const sourceRoot = relative(dirname(outFile), dirname(fileName))
        .split(sep).join('/')
    const result = emit(source, fileName, {
        ...placed(options, 'build'),
        sourceRoot: sourceRoot === '' ? '' : `${sourceRoot}/`,
    })
    const map = result.sourceMapText ?? ''
    const emitted = (JSON.parse(map) as { file: string }).file
    if (basename(outFile) !== emitted) {
        throw new Error(
            `${fileName}: the build output must be named ${emitted}, the ` +
                `name its importers' rewritten specifiers point at; got ` +
                `${outFile}.`,
        )
    }
    return { code: result.outputText, map }
}

/**
 * The one emit both entry points run over.
 *
 * @param source - The file's TypeScript source.
 * @param fileName - The file's path.
 * @param compilerOptions - The app's options with the consumer's placement
 *   options already applied.
 * @returns TypeScript's output.
 * @throws {Error} On a syntax or option error, or an unrunnable `jsx` emit
 *   for a `.tsx` file.
 */
function emit(
    source: string,
    fileName: string,
    compilerOptions: CompilerOptions,
): ts.TranspileOutput {
    if (fileName.endsWith('.tsx') && UNRUNNABLE_JSX.has(compilerOptions.jsx)) {
        throw new Error(
            `${fileName}: the governing tsconfig.json sets no runnable "jsx" ` +
                `emit (unset, "preserve" or "react-native" leave JSX in the ` +
                `output). Set "jsx" to "react-jsx", "react-jsxdev" or "react".`,
        )
    }
    const result = ts.transpileModule(source, {
        compilerOptions,
        fileName,
        reportDiagnostics: true,
    })
    const errors = (result.diagnostics ?? []).filter(
        (d) => d.category === ts.DiagnosticCategory.Error,
    )
    if (errors.length > 0) throw new Error(describe(fileName, errors))
    return result
}

/**
 * Whether a `tsconfig.json` diagnostic is a value diagnostic on `lib` or
 * `types` — the one kind {@link readCompilerOptions} tolerates.
 *
 * The diagnostic is mapped to its option through the parsed JSON: it must lie
 * inside the **value** of a `compilerOptions.lib` or `compilerOptions.types`
 * property. A diagnostic with no position, or on an option's name (an unknown
 * option), is not one.
 *
 * @param diagnostic - A diagnostic from parsing a `tsconfig.json` or a file
 *   it extends.
 * @returns `true` when it may be ignored.
 */
function isEnvironmentValueDiagnostic(diagnostic: Diagnostic): boolean {
    const { file, start } = diagnostic
    if (file === undefined || start === undefined) return false
    const statement = file.statements[0]
    if (statement === undefined || !ts.isExpressionStatement(statement)) {
        return false
    }
    const compilerOptions = propertyValue(
        statement.expression,
        'compilerOptions',
    )
    if (compilerOptions === undefined) return false
    for (const name of ENVIRONMENT_OPTIONS) {
        const value = propertyValue(compilerOptions, name)
        if (value !== undefined && start >= value.pos && start < value.end) {
            return true
        }
    }
    return false
}

/**
 * The value of one property of a JSON object literal.
 *
 * @param node - A parsed JSON value.
 * @param name - The property name.
 * @returns The property's value node, or `undefined` when `node` is not an
 *   object or has no such property.
 */
function propertyValue(
    node: ts.Expression,
    name: string,
): ts.Expression | undefined {
    if (!ts.isObjectLiteralExpression(node)) return undefined
    for (const property of node.properties) {
        if (
            ts.isPropertyAssignment(property) &&
            ts.isStringLiteral(property.name) &&
            property.name.text === name
        ) {
            return property.initializer
        }
    }
    return undefined
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
 * key: a compiler change can change the output for the same input. Internal:
 * the load hook's cache is its one consumer.
 */
export const TYPESCRIPT_VERSION: string = ts.version
