/**
 * @fileoverview A bounded ICU-subset parser + renderer.
 *
 * Supports the MVP subset: literal text, `{name}` interpolation, cardinal
 * `{n, plural, …}` (with `=N` exact cases, `#`, and an optional `offset:`), and
 * `{v, select, …}`. Pluralization uses Deno's built-in `Intl.PluralRules`;
 * numbers format via `Intl.NumberFormat` — **zero dependency**.
 *
 * The parser is internally a **parser** (string→AST) and a **renderer**
 * (AST+params+`Intl`→string). It enforces a max nesting depth and a max
 * template length, failing with a clear {@link ICUParseError} rather than a
 * stack overflow (security S4). Params are substituted into the AST **as
 * literal text** and never re-parsed as ICU (security S1).
 *
 * @module @lockness/i18n/icu
 */

/** Raised for a malformed or over-bounded ICU message, always at parse time. */
export class ICUParseError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ICUParseError'
    }
}

/** A parsed ICU AST node. */
export type ICUNode =
    | { type: 'text'; value: string }
    | { type: 'arg'; name: string }
    | { type: 'pound' }
    | {
        type: 'plural'
        name: string
        offset: number
        cases: Map<string, ICUNode[]>
    }
    | { type: 'select'; name: string; cases: Map<string, ICUNode[]> }

/** Default parser bounds. */
export const MAX_ICU_DEPTH = 10
/** Default max template length in characters. */
export const MAX_ICU_LENGTH = 10_000

interface Cursor {
    readonly s: string
    i: number
    readonly maxDepth: number
}

/**
 * Parse an ICU-subset message into an AST.
 *
 * @param message - The message template.
 * @param options - Optional depth/length bounds.
 * @returns The parsed AST.
 * @throws {ICUParseError} On malformed input, an unknown arg type, or a bound breach.
 *
 * @example
 * ```ts
 * parseICU('{count, plural, one {# item} other {# items}}')
 * ```
 */
export function parseICU(
    message: string,
    options: { maxDepth?: number; maxLength?: number } = {},
): ICUNode[] {
    const maxLength = options.maxLength ?? MAX_ICU_LENGTH
    if (message.length > maxLength) {
        throw new ICUParseError(
            `message exceeds the maximum length (${maxLength})`,
        )
    }
    const cursor: Cursor = {
        s: message,
        i: 0,
        maxDepth: options.maxDepth ?? MAX_ICU_DEPTH,
    }
    const nodes = parseNodes(cursor, 0, false)
    if (cursor.i < message.length) {
        throw new ICUParseError(
            `unexpected '}' at position ${cursor.i}`,
        )
    }
    return nodes
}

/** Parse a run of nodes until end-of-input or a top-level `}`. */
function parseNodes(c: Cursor, depth: number, inPlural: boolean): ICUNode[] {
    if (depth > c.maxDepth) {
        throw new ICUParseError(
            `message nested beyond the maximum depth (${c.maxDepth})`,
        )
    }
    const nodes: ICUNode[] = []
    let text = ''
    const flush = () => {
        if (text) {
            nodes.push({ type: 'text', value: text })
            text = ''
        }
    }
    while (c.i < c.s.length) {
        const ch = c.s[c.i]
        if (ch === '}') break // belongs to the enclosing case
        if (ch === '#' && inPlural) {
            flush()
            nodes.push({ type: 'pound' })
            c.i++
            continue
        }
        if (ch === '{') {
            flush()
            nodes.push(parseArg(c, depth))
            continue
        }
        text += ch
        c.i++
    }
    flush()
    return nodes
}

/** Parse a single `{…}` argument (interpolation, plural, or select). */
function parseArg(c: Cursor, depth: number): ICUNode {
    c.i++ // consume '{'
    const name = readName(c)
    if (!name) throw new ICUParseError(`empty argument name at ${c.i}`)
    skipWs(c)
    if (c.s[c.i] === '}') {
        c.i++
        return { type: 'arg', name }
    }
    if (c.s[c.i] !== ',') {
        throw new ICUParseError(`expected ',' or '}' after '${name}' at ${c.i}`)
    }
    c.i++ // consume ','
    skipWs(c)
    const kind = readWord(c)
    skipWs(c)
    if (c.s[c.i] !== ',') {
        throw new ICUParseError(`expected ',' after '${kind}' at ${c.i}`)
    }
    c.i++ // consume ','
    skipWs(c)

    if (kind === 'plural') return parsePlural(c, depth, name)
    if (kind === 'select') return parseSelect(c, depth, name)
    throw new ICUParseError(`unsupported ICU type '${kind}' (at ${c.i})`)
}

/** Parse a plural argument's optional offset + cases. */
function parsePlural(c: Cursor, depth: number, name: string): ICUNode {
    let offset = 0
    if (c.s.startsWith('offset:', c.i)) {
        c.i += 'offset:'.length
        const num = readWord(c)
        offset = Number(num)
        if (!Number.isFinite(offset)) {
            throw new ICUParseError(`invalid plural offset '${num}'`)
        }
        skipWs(c)
    }
    const cases = parseCases(c, depth, true)
    if (!cases.has('other')) {
        throw new ICUParseError(`plural '${name}' is missing an 'other' case`)
    }
    return { type: 'plural', name, offset, cases }
}

/** Parse a select argument's cases. */
function parseSelect(c: Cursor, depth: number, name: string): ICUNode {
    const cases = parseCases(c, depth, false)
    if (!cases.has('other')) {
        throw new ICUParseError(`select '${name}' is missing an 'other' case`)
    }
    return { type: 'select', name, cases }
}

/** Parse `key {submessage}` pairs until the closing `}` of the argument. */
function parseCases(
    c: Cursor,
    depth: number,
    inPlural: boolean,
): Map<string, ICUNode[]> {
    const cases = new Map<string, ICUNode[]>()
    while (c.i < c.s.length && c.s[c.i] !== '}') {
        skipWs(c)
        if (c.s[c.i] === '}') break
        const key = readCaseKey(c)
        if (!key) throw new ICUParseError(`empty case key at ${c.i}`)
        skipWs(c)
        if (c.s[c.i] !== '{') {
            throw new ICUParseError(
                `expected '{' after case '${key}' at ${c.i}`,
            )
        }
        c.i++ // consume '{'
        const body = parseNodes(c, depth + 1, inPlural)
        if (c.s[c.i] !== '}') {
            throw new ICUParseError(`unterminated case '${key}' at ${c.i}`)
        }
        c.i++ // consume '}'
        cases.set(key, body)
        skipWs(c)
    }
    if (c.s[c.i] !== '}') {
        throw new ICUParseError(`unterminated argument at ${c.i}`)
    }
    c.i++ // consume the argument's closing '}'
    return cases
}

const NAME_CHARS = /[A-Za-z0-9_.]/
const WORD_CHARS = /[A-Za-z0-9_.=+-]/

function readName(c: Cursor): string {
    let out = ''
    skipWs(c)
    while (c.i < c.s.length && NAME_CHARS.test(c.s[c.i])) out += c.s[c.i++]
    return out
}
function readWord(c: Cursor): string {
    let out = ''
    while (c.i < c.s.length && WORD_CHARS.test(c.s[c.i])) out += c.s[c.i++]
    return out
}
function readCaseKey(c: Cursor): string {
    let out = ''
    while (
        c.i < c.s.length && c.s[c.i] !== '{' && !/\s/.test(c.s[c.i])
    ) out += c.s[c.i++]
    return out
}
function skipWs(c: Cursor): void {
    while (c.i < c.s.length && /\s/.test(c.s[c.i])) c.i++
}

/**
 * Render a parsed ICU AST with params for a locale.
 *
 * @param nodes - The parsed AST.
 * @param params - Interpolation values (data — substituted as literal text).
 * @param locale - The BCP-47 locale for `Intl` formatting.
 * @param pound - The value `#` renders (the plural count minus offset).
 * @returns The rendered string.
 */
export function renderICU(
    nodes: readonly ICUNode[],
    params: Record<string, unknown>,
    locale: string,
    pound?: number,
): string {
    let out = ''
    for (const node of nodes) {
        switch (node.type) {
            case 'text':
                out += node.value
                break
            case 'pound':
                out += pound === undefined
                    ? ''
                    : new Intl.NumberFormat(locale).format(pound)
                break
            case 'arg':
                out += formatValue(params[node.name], node.name, locale)
                break
            case 'select': {
                const key = String(params[node.name])
                const chosen = node.cases.get(key) ?? node.cases.get('other')!
                out += renderICU(chosen, params, locale, pound)
                break
            }
            case 'plural': {
                const value = Number(params[node.name])
                const n = Number.isFinite(value) ? value - node.offset : 0
                const exact = node.cases.get(`=${value}`)
                const chosen = exact ??
                    node.cases.get(new Intl.PluralRules(locale).select(n)) ??
                    node.cases.get('other')!
                out += renderICU(chosen, params, locale, n)
                break
            }
        }
    }
    return out
}

/** Format an interpolated value; a missing param renders a visible placeholder. */
function formatValue(value: unknown, name: string, locale: string): string {
    if (value === undefined || value === null) return `{${name}}`
    if (typeof value === 'number') {
        return new Intl.NumberFormat(locale).format(value)
    }
    return String(value)
}
