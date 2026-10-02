/**
 * @fileoverview The one rule for which `name=value` pairs carry a credential,
 * and the shape-based net `renderError` casts with it (#478, #438).
 *
 * **One rule, two mechanisms.** `renderError` REPLACES a credential value by
 * its shape, because it renders text nobody vetted. `@lockness/drizzle`
 * WITHHOLDS a whole driver message that holds a credential value it took from
 * the DSN, because #425 forbids editing around a value it knows. Both decide
 * what a credential is here, so the two can never drift apart on a name.
 *
 * Exposed on `@lockness/contract/logging/internal`, never the root:
 * `@lockness/core` re-exports the root with `export *`, so anything there
 * reaches every app.
 *
 * @module @lockness/contract/logging/internal
 */

/**
 * The credential stems. A parameter name whose normalised form ENDS WITH one
 * of these, or with one of these plus a plural `s`, is a credential.
 *
 * **Ends-with, not an exact list**, because vendors compound: `api_key`,
 * `access_token`, `client_secret`, `sslpassword`, `X-Amz-Signature`,
 * `X-Amz-Credential`, `authToken`, `passphrase`, `client_assertion`,
 * `code_verifier`. An exact list leaks the first compound nobody wrote down.
 * The cost is a pinned over-match — `monkey=` is masked — which is the safe
 * direction for a redaction rule.
 *
 * A name is normalised first: percent-decoded, lowercased, and stripped of
 * `.`, `_`, `~` and `-`. Stripping is what keeps `key_id` and `token_type` out
 * (they end in `id` and `type`) while `api_key` and `api-key` both match.
 * Then trailing digits (`password2`) and a trailing `confirmation`
 * (`password_confirmation`, the form-field idiom) are dropped.
 */
const CREDENTIAL_STEMS: readonly string[] = [
    'token',
    'key',
    'secret',
    'password',
    'passwd',
    'pwd',
    'pass',
    'sig',
    'signature',
    'credential',
    'auth',
    'jwt',
    'phrase',
    'assertion',
    'verifier',
]

/**
 * Names that are a credential only when they are the WHOLE name. `code` is an
 * OAuth authorization code; as a stem it would mask `statuscode` and
 * `errorcode`, which are exactly what an error message needs to keep.
 */
const CREDENTIAL_NAMES: ReadonlySet<string> = new Set(['code'])

/** The suffix a confirmation field adds to a credential name. */
const CONFIRMATION = 'confirmation'

/** The characters a normalised name drops. */
const STRIPPED: ReadonlySet<string> = new Set(['.', '_', '~', '-'])

/**
 * Whether a parameter name marks its value as a credential.
 *
 * Case-insensitive and encoding-insensitive: `PASSWORD`, `AuthToken` and
 * `api%5Fkey` all match. A sequence that is not `%XX` is kept as written.
 *
 * @param name - The parameter name, as written or already decoded.
 * @returns True when the name ends with a credential stem (or its plural),
 *   or is `code`, once trailing digits and `confirmation` are dropped.
 *
 * @example
 * ```typescript
 * isCredentialParamName('access_token') // true
 * isCredentialParamName('password_confirmation') // true
 * isCredentialParamName('token_type') // false
 * isCredentialParamName('statuscode') // false
 * ```
 */
export function isCredentialParamName(name: string): boolean {
    return classifyName(name) !== undefined
}

/**
 * How a name matched the rule, which the net needs and drizzle does not.
 *
 * - `exact` — the whole name is `code`: an OAuth code only inside a URL.
 * - `plural` — it ends in a stem plus `s` only (`max_tokens`): an all-digit
 *   value is a count.
 * - `stem` — it ends in a stem.
 */
type NameMatch = 'exact' | 'plural' | 'stem'

/**
 * Normalise a name and say how it matched, if it did.
 *
 * @param name - The parameter name, as written or already decoded.
 * @returns The kind of match, or `undefined` for no credential.
 */
function classifyName(name: string): NameMatch | undefined {
    let normalised = ''
    for (const char of decodeAsciiEscapes(name).toLowerCase()) {
        if (!STRIPPED.has(char)) normalised += char
    }
    normalised = withoutTrailingDigits(normalised)
    if (
        normalised.length > CONFIRMATION.length &&
        normalised.endsWith(CONFIRMATION)
    ) {
        normalised = normalised.slice(0, -CONFIRMATION.length)
    }
    if (normalised === '') return undefined
    if (CREDENTIAL_NAMES.has(normalised)) return 'exact'
    if (CREDENTIAL_STEMS.some((stem) => normalised.endsWith(stem))) {
        return 'stem'
    }
    return CREDENTIAL_STEMS.some((stem) => normalised.endsWith(`${stem}s`))
        ? 'plural'
        : undefined
}

/**
 * Replace the value of every credential-named `name=value` pair with `***`.
 *
 * **Any `name=value`, not only a URL query.** The same credential reaches an
 * error message as `?api_key=…`, a libpq `password=…`, an ODBC `Pwd=…;`, a
 * CLI `--password=…` and an environment dump's `AWS_SECRET_ACCESS_KEY=…`. A
 * rule bound to URL syntax misses all but the first, and inherits every
 * boundary question the userinfo net already answers.
 *
 * **Linear by construction.** It scans for `=` or `%3D` and, from each, walks
 * LEFT over the name. A walk stops at the previous non-name character, which
 * is never before the previous `=`, so walks cover disjoint spans and the
 * whole pass touches each character a bounded number of times. A global
 * regular expression of the obvious shape was measured quadratic on the
 * uncapped message (40k characters: 2.4 s).
 *
 * The walk crosses `%XX` only when it decodes to a name character, so an
 * encoded separator (`%3F`, `%26`) ends a name the way a raw one does — which
 * is what finds `token` in `next=%2Fcb%3Ftoken%3D…`. Spaces or tabs may
 * surround the `=` (`password = …`, libpq's spelling), and ANSI escapes are
 * removed before the scan, so `\x1b[1mpassword\x1b[0m=…` still names a
 * credential; a text that holds none keeps its escapes.
 *
 * **Where a value ends depends on where the pair is.**
 *
 * - A value that opens with `"`, `'` or a backtick runs to the matching
 *   closing quote, skipping backslash-escaped ones, or to the end of the text
 *   when there is none — so `password='a b'` and `AWS_SECRET_ACCESS_KEY="…"`
 *   are covered whole. An escaped opener (`\"`, as JSON serialisation writes a
 *   quoted CLI argument) runs to its escaped twin.
 * - Inside a URL query or fragment (the name follows `?`, `&` or `#`, raw or
 *   percent-encoded) a value also ends at `&`, `#`, `<` or `>`, so the
 *   neighbouring parameters stay readable.
 * - Anywhere else it ends only at ASCII whitespace or a quote. A CLI
 *   `--password=ab&cd` holds its `&` as content; ending there would leak the
 *   rest. `;` and `%26` never end a value: an ODBC tail after `Pwd=` is
 *   eaten, and eating more is the safe direction.
 *
 * An empty value is left alone, so `?token=&page=1` stays diagnostic; blanks
 * after `=` count as part of the value only when blanks also precede it
 * (`name = value`), so `token= in header` keeps its `in`.
 *
 * **Non-secrets kept on purpose.** A bare `code` is an OAuth code only in a
 * URL query; elsewhere (`status code=503`, Postgres `code=23505`) it is left
 * alone. A name that matches only through a plural stem with an all-digit
 * value is a count (`max_tokens=4096`), not a credential — chosen over a
 * documented over-match because LLM and quota errors carry exactly these.
 *
 * **Not seen.** This net is a shape rule for `name=value`. It does not see a
 * JSON `"token":"…"`, a header- or YAML-style `name: value`, an
 * `Authorization: Bearer …` header, a bare token with no name, a doubly
 * encoded separator (`%253D`), or a session id under a name it does not
 * know. Those need a source-side fix where the value is known.
 *
 * @param text - Text that may carry credential pairs.
 * @returns The text with each credential value replaced by `***`.
 *
 * @example
 * ```typescript
 * redactQueryCredentials('GET /cb?code=abc&state=1')
 * // 'GET /cb?code=***&state=1'
 * redactQueryCredentials("host=db password='a b' dbname=app")
 * // "host=db password='***' dbname=app"
 * ```
 */
export function redactQueryCredentials(text: string): string {
    if (!text.includes('\x1b')) return redactPairs(text)
    const plain = text.replace(ANSI, '')
    const redacted = redactPairs(plain)
    return redacted === plain ? text : redacted
}

/** ANSI CSI sequences (colours, cursor moves), removed before the scan. */
// deno-lint-ignore no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

/**
 * The scan behind {@link redactQueryCredentials}, on ANSI-free text.
 *
 * @param text - Text that may carry credential pairs.
 * @returns The text with each credential value replaced by `***`.
 */
function redactPairs(text: string): string {
    let out = ''
    let copied = 0
    let i = 0
    while (i < text.length) {
        const equalsLength = equalsAt(text, i)
        if (equalsLength === 0) {
            i++
            continue
        }
        const nameEnd = skipBlanksLeft(text, i, copied)
        const start = nameStart(text, nameEnd, copied)
        const match = start === nameEnd
            ? undefined
            : classifyName(text.slice(start, nameEnd))
        const url = match !== undefined && inUrl(text, start)
        // `code` is an OAuth code in a URL query; anywhere else it is a status
        // or exit code (`code=23505`, `exit code=1`) an operator needs.
        if (match === undefined || (match === 'exact' && !url)) {
            i += equalsLength
            continue
        }
        // Blanks after `=` belong to the value only in the symmetric
        // `name = value` spelling; `token= in header` has an empty value.
        const valueStart = nameEnd < i
            ? skipBlanksRight(text, i + equalsLength)
            : i + equalsLength
        if (
            text[valueStart] === '\\' && QUOTES.has(text[valueStart + 1])
        ) {
            // An escaped opener (`\"`, JSON-serialised text) closes at its
            // escaped twin.
            const close = text.indexOf(
                `\\${text[valueStart + 1]}`,
                valueStart + 2,
            )
            const valueEnd = close < 0 ? text.length : close
            if (valueEnd > valueStart + 2) {
                out += `${text.slice(copied, valueStart + 2)}***`
                copied = valueEnd
            }
            i = close < 0 ? text.length : close + 2
            continue
        }
        if (QUOTES.has(text[valueStart])) {
            const valueEnd = closingQuote(text, valueStart)
            if (valueEnd > valueStart + 1) {
                out += `${text.slice(copied, valueStart + 1)}***`
                copied = valueEnd
            }
            i = valueEnd + 1
            continue
        }
        const ends = url ? URL_VALUE_END : RAW_VALUE_END
        let end = valueStart
        while (end < text.length && !ends.has(text[end])) end++
        if (match === 'plural' && isDigits(text, valueStart, end)) {
            // `max_tokens=4096` counts tokens; it is not one.
            i = end
            continue
        }
        if (end > valueStart) {
            out += `${text.slice(copied, valueStart)}***`
            copied = end
        }
        i = Math.max(end, i + equalsLength)
    }
    return copied === 0 ? text : out + text.slice(copied)
}

/**
 * Where a quoted value ends: its matching quote, skipping any escaped with a
 * backslash, or the end of the text.
 *
 * @param text - The text being scanned.
 * @param open - The index of the opening quote.
 * @returns The index of the closing quote, or the text's length.
 */
function closingQuote(text: string, open: number): number {
    const quote = text[open]
    let j = open + 1
    while (j < text.length) {
        if (text[j] === '\\') {
            j += 2
            continue
        }
        if (text[j] === quote) return j
        j++
    }
    return text.length
}

/**
 * Whether `text[from, to)` is a non-empty run of ASCII digits.
 *
 * @param text - The text being scanned.
 * @param from - The first index.
 * @param to - One past the last index.
 * @returns True for digits only.
 */
function isDigits(text: string, from: number, to: number): boolean {
    if (to <= from) return false
    for (let j = from; j < to; j++) {
        const code = text.charCodeAt(j)
        if (code < 0x30 || code > 0x39) return false
    }
    return true
}

/** The quotes that open a quoted value. */
const QUOTES: ReadonlySet<string | undefined> = new Set(['"', "'", '`'])

/**
 * What ends a raw value outside a URL: ASCII whitespace and quotes. Not `\v`,
 * which no shell or connection string uses as a separator.
 */
const RAW_VALUE_END: ReadonlySet<string> = new Set([
    ' ',
    '\t',
    '\n',
    '\r',
    '\f',
    '"',
    "'",
    '`',
])

/** What ends a value inside a URL query: also `&`, `#`, `<` and `>`. */
const URL_VALUE_END: ReadonlySet<string> = new Set([
    ...RAW_VALUE_END,
    '&',
    '#',
    '<',
    '>',
])

/** The separators that put the name after them inside a URL query. */
const URL_SEPARATORS: ReadonlySet<string | undefined> = new Set([
    '?',
    '&',
    '#',
])

/**
 * Whether the name starting at `start` sits in a URL query or fragment: it
 * follows `?`, `&` or `#`, raw or percent-encoded.
 *
 * @param text - The text being scanned.
 * @param start - The index of the name's first character.
 * @returns True inside a URL query.
 */
function inUrl(text: string, start: number): boolean {
    if (URL_SEPARATORS.has(text[start - 1])) return true
    if (start < 3 || text[start - 3] !== '%') return false
    const escaped = text.slice(start - 2, start).toUpperCase()
    return escaped === '3F' || escaped === '26' || escaped === '23'
}

/**
 * Step left from `i` over spaces and tabs.
 *
 * @param text - The text being scanned.
 * @param i - The index of the equals sign.
 * @param floor - Never step before this index.
 * @returns The index just after the name.
 */
function skipBlanksLeft(text: string, i: number, floor: number): number {
    let j = i
    while (j > floor && (text[j - 1] === ' ' || text[j - 1] === '\t')) j--
    return j
}

/**
 * Step right from `i` over spaces and tabs.
 *
 * @param text - The text being scanned.
 * @param i - The index just after the equals sign.
 * @returns The index where the value starts.
 */
function skipBlanksRight(text: string, i: number): number {
    let j = i
    while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++
    return j
}

/**
 * The length of the equals sign at `i`: 1 for `=`, 3 for `%3D`, 0 for none.
 *
 * @param text - The text being scanned.
 * @param i - The position to look at.
 * @returns The width of the separator, or 0.
 */
function equalsAt(text: string, i: number): number {
    if (text[i] === '=') return 1
    if (
        text[i] === '%' && text[i + 1] === '3' &&
        (text[i + 2] === 'D' || text[i + 2] === 'd')
    ) {
        return 3
    }
    return 0
}

/**
 * Walk left from `end` over a parameter name and return where it starts.
 *
 * @param text - The text being scanned.
 * @param end - The index just after the name.
 * @param floor - Never walk before this index (text already rewritten).
 * @returns The index of the name's first character; `end` when there is none.
 */
function nameStart(text: string, end: number, floor: number): number {
    let j = end
    while (j > floor) {
        if (
            j - 3 >= floor && text[j - 3] === '%' && isHex(text[j - 2]) &&
            isHex(text[j - 1])
        ) {
            const decoded = String.fromCharCode(
                parseInt(text.slice(j - 2, j), 16),
            )
            // An encoded separator ends the name, exactly as a raw one does.
            if (!isNameCharacter(decoded)) break
            j -= 3
            continue
        }
        if (!isNameCharacter(text[j - 1])) break
        j--
    }
    return j
}

/**
 * Drop a run of ASCII digits from the end of a string, by hand: a regular
 * expression anchored at the end restarts at every digit of a long run.
 *
 * @param text - A normalised name.
 * @returns The name without its trailing digits.
 */
function withoutTrailingDigits(text: string): string {
    let end = text.length
    while (end > 0) {
        const code = text.charCodeAt(end - 1)
        if (code < 0x30 || code > 0x39) break
        end--
    }
    return text.slice(0, end)
}

/**
 * Whether a character may appear in a parameter name: ASCII letters, digits,
 * `.`, `_`, `~` and `-`.
 *
 * @param char - One character.
 * @returns True for a name character.
 */
function isNameCharacter(char: string): boolean {
    const code = char.charCodeAt(0)
    return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) ||
        (code >= 0x61 && code <= 0x7a) || STRIPPED.has(char)
}

/**
 * Whether a character is a hexadecimal digit.
 *
 * @param char - One character, or `undefined` past either end.
 * @returns True for `0-9`, `a-f` or `A-F`.
 */
function isHex(char: string | undefined): boolean {
    if (char === undefined) return false
    const code = char.charCodeAt(0)
    return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x46) ||
        (code >= 0x61 && code <= 0x66)
}

/**
 * Decode every `%XX` that names an ASCII character, by hand.
 *
 * By hand rather than `decodeURIComponent`, which throws on a sequence that
 * is not UTF-8 and would need a catch. A name holding a non-ASCII byte cannot
 * end in an ASCII stem through it, so those bytes are kept as written.
 *
 * @param name - A parameter name.
 * @returns The name with its ASCII escapes decoded.
 */
function decodeAsciiEscapes(name: string): string {
    if (!name.includes('%')) return name
    let out = ''
    let i = 0
    while (i < name.length) {
        if (name[i] === '%' && isHex(name[i + 1]) && isHex(name[i + 2])) {
            const code = parseInt(name.slice(i + 1, i + 3), 16)
            if (code < 0x80) {
                out += String.fromCharCode(code)
                i += 3
                continue
            }
        }
        out += name[i]
        i++
    }
    return out
}
