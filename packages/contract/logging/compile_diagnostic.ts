/**
 * @fileoverview Recognise a module that failed to compile or link, so its
 * source excerpt never reaches a log line (#478).
 *
 * **Measured on Deno 2.9.6, with real files.** A parse failure rejects the
 * `import()` with a `TypeError` whose message is
 * `SyntaxError: <headline>\n  |\nN | <source line>\n  | ~~~\n    at file:///<abs>:L:C`.
 * The excerpt quotes the app's own source, which can be a line holding a
 * credential literal — and so does the HEADLINE (`Expected ',', got 'string
 * literal ("…")'`), so dropping only the excerpt lines still leaks. V8's own
 * compile errors are real `SyntaxError`s with no excerpt and the same trailing
 * location: an invalid regular expression quotes its body, a link error names
 * the missing export.
 *
 * **Recognised by the shape of the message, never by class or `code`.** The
 * parse failure is a `TypeError` carrying `code: 'ERR_MODULE_NOT_FOUND'`, the
 * same pair "Module not found" carries. Keying on that pair would mislabel a
 * parse failure as not-found, miss every V8 compile error, and leak silently
 * the day Deno corrects the class. The excerpt gutter and a `SyntaxError` with
 * a location are what the failure actually is.
 *
 * What is kept is the kind and the location; the rest is withheld. The cost is
 * DX: the parser's headline is gone, and the developer runs `deno check` at
 * the location given — the product call #478 made.
 *
 * Internal: `renderError` and `importAppFile` import it; no entry point does.
 *
 * @module
 */

/** What a recognised compile or link failure keeps: its kind and location. */
export interface CompileDiagnostic {
    /** `SyntaxError`, from the message's `XxxError: ` prefix or the error name. */
    readonly kind: string
    /** The module's URL as the message names it, when it names one. */
    readonly url?: string
    /** The 1-based line, when the message names a location. */
    readonly line?: number
    /** The 1-based column, when the message names a location. */
    readonly column?: number
}

/** The text that replaces a withheld excerpt and headline. */
export const EXCERPT_WITHHELD = '[source excerpt withheld]'

/**
 * One gutter line of a source excerpt: `  |`, `2 | …`, `  | ~~~`.
 *
 * Unambiguous on purpose: whitespace, then optionally digits and whitespace,
 * then the bar. No two quantifiers compete for the same character, so a line
 * of a million spaces costs one pass rather than a quadratic backtrack.
 */
const EXCERPT_LINE = /\n[ \t]*(?:\d+[ \t]*)?\|/

/** The `XxxError: ` prefix a parse failure's message starts with. */
const KIND_PREFIX = /^([A-Z][A-Za-z0-9]{0,63}Error): /

/** A URL scheme and `://`, at the start of the location. */
const LOCATION_URL = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i

/** ANSI SGR sequences, which a coloured message may carry. */
// deno-lint-ignore no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g

/**
 * Read a compile or link failure out of an error's name and message.
 *
 * Fires when the message holds an excerpt gutter line, OR when its kind is
 * `SyntaxError` and it ends with ` at <scheme>://…:L:C`. Anything else —
 * "Module not found", an application `TypeError('SyntaxError: …')` with no
 * location, a `JSON.parse` error — is not a compile diagnostic.
 *
 * @param name - The error's `name`.
 * @param message - The error's `message`, as thrown.
 * @returns The kind and location, or `undefined` when the shape is not one.
 *
 * @example
 * ```typescript
 * try {
 *     await import('./broken.ts')
 * } catch (error) {
 *     readCompileDiagnostic((error as Error).name, (error as Error).message)
 *     // { kind: 'SyntaxError', url: 'file:///…/broken.ts', line: 2, column: 19 }
 * }
 * ```
 */
export function readCompileDiagnostic(
    name: string,
    message: string,
): CompileDiagnostic | undefined {
    const text = message.includes('\x1b') ? message.replace(ANSI, '') : message
    const kind = KIND_PREFIX.exec(text)?.[1] ?? name
    const location = readLocation(text)
    const excerpt = EXCERPT_LINE.test(text)
    if (!excerpt && !(kind === 'SyntaxError' && location !== undefined)) {
        return undefined
    }
    return { kind, ...location }
}

/**
 * The one line a recognised failure renders as.
 *
 * @param kind - The failure's kind, `SyntaxError` in practice.
 * @param where - The location to show (`file:line:col`), when known.
 * @returns `SyntaxError at <where> [source excerpt withheld]`.
 *
 * @example
 * ```typescript
 * formatCompileDiagnostic('SyntaxError', 'app/x.ts:2:19')
 * // 'SyntaxError at app/x.ts:2:19 [source excerpt withheld]'
 * ```
 */
export function formatCompileDiagnostic(
    kind: string,
    where: string | undefined,
): string {
    return where === undefined
        ? `${kind} ${EXCERPT_WITHHELD}`
        : `${kind} at ${where} ${EXCERPT_WITHHELD}`
}

/**
 * Render a diagnostic's location as `url:line:col`, or just the URL.
 *
 * @param diagnostic - A recognised diagnostic.
 * @returns The location text, or `undefined` when the message named none.
 */
export function diagnosticLocation(
    diagnostic: CompileDiagnostic,
): string | undefined {
    if (diagnostic.url === undefined) return undefined
    return diagnostic.line === undefined
        ? diagnostic.url
        : `${diagnostic.url}:${diagnostic.line}:${diagnostic.column}`
}

/**
 * Read the trailing ` at <scheme>://…:L:C` of a message, by hand.
 *
 * By index rather than one regular expression anchored at the end, which
 * backtracks from every start position on an uncapped message. A `file:` URL
 * holds no whitespace (`toFileUrl` escapes it), so the location is everything
 * after the last ` at `.
 *
 * @param text - The ANSI-stripped message.
 * @returns The URL, line and column, or `undefined` when there is none.
 */
function readLocation(
    text: string,
): { url: string; line: number; column: number } | undefined {
    const trimmed = text.trimEnd()
    const at = trimmed.lastIndexOf(' at ')
    if (at < 0) return undefined
    const tail = trimmed.slice(at + 4)
    const columnColon = tail.lastIndexOf(':')
    const lineColon = tail.lastIndexOf(':', columnColon - 1)
    if (columnColon < 0 || lineColon < 0) return undefined
    const line = tail.slice(lineColon + 1, columnColon)
    const column = tail.slice(columnColon + 1)
    const url = tail.slice(0, lineColon)
    if (!isDigits(line) || !isDigits(column) || !LOCATION_URL.test(url)) {
        return undefined
    }
    return { url, line: Number(line), column: Number(column) }
}

/**
 * Whether a string is a non-empty run of ASCII digits.
 *
 * @param text - The candidate.
 * @returns True for `0-9`+.
 */
function isDigits(text: string): boolean {
    if (text === '' || text.length > 9) return false
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        if (code < 0x30 || code > 0x39) return false
    }
    return true
}

/**
 * An app file that does not compile or link, reported by location only.
 *
 * Thrown by `importAppFile` in place of the runtime's error, whose message
 * quotes the failing source line. It carries **no `cause`** on purpose:
 * `Deno.inspect` and the CLI dispatcher print a cause in full, and the cause
 * would be the excerpt this class exists to withhold. Every other failure of
 * the import — a missing file, an error raised while the module evaluates — is
 * rethrown untouched.
 *
 * @example
 * ```typescript
 * import { AppFileCompileError, importAppFile } from '@lockness/contract/app-file/internal'
 *
 * try {
 *     await importAppFile('app/controller/broken.ts')
 * } catch (error) {
 *     if (error instanceof AppFileCompileError) console.error(error.message)
 *     // 'SyntaxError at app/controller/broken.ts:2:19 [source excerpt withheld]'
 * }
 * ```
 */
export class AppFileCompileError extends Error {
    /** The failure's kind, `SyntaxError` in practice. */
    readonly kind: string
    /** The failing file: relative to the app root when under it, else absolute. */
    readonly file: string
    /** The 1-based line, when the runtime named one. */
    readonly line: number | undefined
    /** The 1-based column, when the runtime named one. */
    readonly column: number | undefined

    /**
     * @param kind - The failure's kind.
     * @param file - The failing file, as it should be shown.
     * @param line - The 1-based line, if known.
     * @param column - The 1-based column, if known.
     */
    constructor(
        kind: string,
        file: string,
        line?: number,
        column?: number,
    ) {
        super(
            formatCompileDiagnostic(
                kind,
                line === undefined ? file : `${file}:${line}:${column}`,
            ),
        )
        this.name = 'AppFileCompileError'
        this.kind = kind
        this.file = file
        this.line = line
        this.column = column
    }
}
