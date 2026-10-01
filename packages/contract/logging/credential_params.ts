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
 * of these is a credential.
 *
 * **Ends-with, not an exact list**, because vendors compound: `api_key`,
 * `access_token`, `client_secret`, `sslpassword`, `X-Amz-Signature`,
 * `X-Amz-Credential`, `authToken`. An exact list leaks the first compound
 * nobody wrote down. The cost is a pinned over-match — `monkey=` is masked —
 * which is the safe direction for a redaction rule.
 *
 * A name is normalised first: percent-decoded, lowercased, and stripped of
 * `.`, `_`, `~` and `-`. Stripping is what keeps `key_id` and `token_type` out
 * (they end in `id` and `type`) while `api_key` and `api-key` both match.
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
]

/**
 * Names that are a credential only when they are the WHOLE name. `code` is an
 * OAuth authorization code; as a stem it would mask `statuscode` and
 * `errorcode`, which are exactly what an error message needs to keep.
 */
const CREDENTIAL_NAMES: ReadonlySet<string> = new Set(['code'])

/** The characters a normalised name drops. */
const STRIPPED: ReadonlySet<string> = new Set(['.', '_', '~', '-'])

/**
 * Whether a parameter name marks its value as a credential.
 *
 * Case-insensitive and encoding-insensitive: `PASSWORD`, `AuthToken` and
 * `api%5Fkey` all match. A sequence that is not `%XX` is kept as written.
 *
 * @param name - The parameter name, as written or already decoded.
 * @returns True when the name ends with a credential stem, or is `code`.
 *
 * @example
 * ```typescript
 * isCredentialParamName('access_token') // true
 * isCredentialParamName('X-Amz-Signature') // true
 * isCredentialParamName('token_type') // false
 * isCredentialParamName('statuscode') // false
 * ```
 */
export function isCredentialParamName(name: string): boolean {
    let normalised = ''
    for (const char of decodeAsciiEscapes(name).toLowerCase()) {
        if (!STRIPPED.has(char)) normalised += char
    }
    if (normalised === '') return false
    if (CREDENTIAL_NAMES.has(normalised)) return true
    return CREDENTIAL_STEMS.some((stem) => normalised.endsWith(stem))
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
 * is what finds `token` in `next=%2Fcb%3Ftoken%3D…`.
 *
 * A value ends at the first `&`, `#`, ASCII whitespace, `"`, `'`, `<`, `>` or
 * backtick. `;` and `%26` do NOT end it: an ODBC tail after `Pwd=` is eaten,
 * and eating more is the safe direction. An empty value is left alone, so
 * `token=&page=1` stays diagnostic.
 *
 * @param text - Text that may carry credential pairs.
 * @returns The text with each credential value replaced by `***`.
 *
 * @example
 * ```typescript
 * redactQueryCredentials('GET /cb?code=abc&state=1')
 * // 'GET /cb?code=***&state=1'
 * redactQueryCredentials('host=db password=hunter2 dbname=app')
 * // 'host=db password=*** dbname=app'
 * ```
 */
export function redactQueryCredentials(text: string): string {
    let out = ''
    let copied = 0
    let i = 0
    while (i < text.length) {
        const equalsLength = equalsAt(text, i)
        if (equalsLength === 0) {
            i++
            continue
        }
        const start = nameStart(text, i, copied)
        const valueStart = i + equalsLength
        if (start === i || !isCredentialParamName(text.slice(start, i))) {
            i = valueStart
            continue
        }
        let end = valueStart
        while (end < text.length && !VALUE_END.has(text[end])) end++
        if (end > valueStart) {
            out += `${text.slice(copied, valueStart)}***`
            copied = end
        }
        i = end
    }
    return copied === 0 ? text : out + text.slice(copied)
}

/** The characters that end a credential value. */
const VALUE_END: ReadonlySet<string> = new Set([
    '&',
    '#',
    ' ',
    '\t',
    '\n',
    '\r',
    '\f',
    '\v',
    '"',
    "'",
    '<',
    '>',
    '`',
])

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
 * @param end - The index of the equals sign.
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
