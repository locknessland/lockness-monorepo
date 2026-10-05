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
 * Exposed on `@lockness/contract/logging/internal` (the `internal.ts`
 * barrel), never the root: `@lockness/core` re-exports the root with
 * `export *`, so anything there reaches every app.
 *
 * @module @lockness/contract/logging/credential_params
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
 * `pin`, `otp`, `cvv` and `cvc` guard short all-digit secrets (#497), so no
 * digit exemption applies to them: `pin=4821` is masked like any other
 * value. The ends-with rule is what reaches `totp`, `hotp`, `mpin`,
 * `upiPin` and (after the trailing digit) `cvv2`. It also over-matches
 * `spin`, `hairpin` and `gpio_pin`, pinned like `monkey=`.
 *
 * A name is normalised first: percent-decoded, lowercased, and stripped of
 * `.`, `_`, `~`, `-`, `[` and `]`. Stripping is what keeps `key_id` and
 * `token_type` out (they end in `id` and `type`) while `api_key` and
 * `api-key` both match. Then trailing digits (`password2`) and a trailing
 * `confirmation` (`password_confirmation`, the form-field idiom) are
 * dropped. A bracketed name (`card[cvc]`) is matched by its field segment
 * first, and its stripped path can only raise that match (#526).
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
    'pin',
    'otp',
    'cvv',
    'cvc',
]

/**
 * Names that are a credential only when they are the WHOLE name. `code` is an
 * OAuth authorization code; as a stem it would mask `statuscode` and
 * `errorcode`, which are exactly what an error message needs to keep. A
 * longer `code` name is decided by its qualifier instead
 * ({@link CODE_SUFFIXES}).
 */
const CREDENTIAL_NAMES: ReadonlySet<string> = new Set(['code'])

/**
 * The suffixes a qualified code name ends in. A name that ends in one of them
 * WITH something before it is a credential only when that leftover is a
 * qualifier ({@link isCodeQualifier}); otherwise it is a diagnostic
 * (`status_code`, `exit_code`). The plural is listed on its own because a
 * name ending in `codes` (`backup_codes`) does not end in `code`.
 */
const CODE_SUFFIXES: readonly string[] = ['codes', 'code']

/**
 * The factor words that make a `code` compound a one-time secret:
 * `mfa_code`, `sms_code`, `verification_code`, `backup_codes`. They count only
 * before `code`, never alone, so `mfa=required` and `access=denied` stay
 * diagnostics.
 */
const CODE_QUALIFIERS: readonly string[] = [
    'mfa',
    '2fa',
    'sms',
    'onetime',
    'security',
    'verification',
    'verify',
    'recovery',
    'backup',
    'access',
]

/** The suffix a confirmation field adds to a credential name. */
const CONFIRMATION = 'confirmation'

/** The brackets a nested name writes its segments in: `card[cvc]`, `%5B`/`%5D`. */
const BRACKETS: ReadonlySet<string> = new Set(['[', ']'])

/** The characters a normalised name drops, and the walks cross. */
const STRIPPED: ReadonlySet<string> = new Set(['.', '_', '~', '-', ...BRACKETS])

/**
 * Whether a parameter name marks its value as a credential.
 *
 * Case-insensitive and encoding-insensitive: `PASSWORD`, `AuthToken` and
 * `api%5Fkey` all match. A sequence that is not `%XX` is kept as written.
 *
 * A bracketed name, as qs, PHP and Rails nest form fields, is decided by its
 * field segment — the last bracket segment that holds a letter — so
 * `card[cvc]`, `user[password]` and `card%5Bcvc%5D` match while
 * `card[number]` and `token[type]` do not. An index segment (`[]`, `[0]`) is
 * skipped, and a name whose segments are all indexes is read as its path, so
 * `password[]` matches. The whole path can only raise a field to a stem match
 * (`verification[code]`, `password[confirmation]`); an outer segment alone
 * never matches (#526).
 *
 * @param name - The parameter name, as written or already decoded.
 * @returns True when the name (or, bracketed, its field segment) ends with a
 *   credential stem (or its plural), is `code`, or ends in `code`/`codes`
 *   after a credential stem or a factor word (`pin_code`, `mfa_code`), once
 *   trailing digits and `confirmation` are dropped.
 *
 * @example
 * ```typescript
 * isCredentialParamName('access_token') // true
 * isCredentialParamName('password_confirmation') // true
 * isCredentialParamName('pin_code') // true
 * isCredentialParamName('card[cvc]') // true
 * isCredentialParamName('token_type') // false
 * isCredentialParamName('statuscode') // false
 * isCredentialParamName('status_code') // false
 * isCredentialParamName('card[number]') // false
 * ```
 */
export function isCredentialParamName(name: string): boolean {
    return classifyName(name) !== undefined
}

/**
 * The plurals a count is named with: `max_tokens`, S3's `max-keys`.
 */
const COUNT_PLURALS: readonly string[] = ['tokens', 'keys']

/**
 * The words that make a `tokens` or `keys` plural a count rather than a list
 * of credentials: a limit or a tally, as LLM and quota errors report them.
 */
const COUNT_WORDS: readonly string[] = ['max', 'prompt', 'completion', 'total']

/**
 * How a name matched the rule, which the net needs and drizzle does not.
 *
 * - `exact` — the whole name is `code`: an OAuth code only inside a URL.
 * - `count` — a known count name (`max_tokens`, `max-keys`): an all-digit
 *   value is a count.
 * - `stem` — it ends in a stem, in a stem plus `s`, or in a qualified `code`
 *   (`pin_code`, `mfa_code`): masked whatever the value.
 */
type NameMatch = 'exact' | 'count' | 'stem'

/**
 * Say how a name matched, if it did.
 *
 * A bracketed name (`card[cvc]`, `user[code][]`) is classified by its field
 * segment ({@link fieldSegment}); its whole path, read the way a dotted name
 * is, can only raise that result to `stem` (`verification[code]`,
 * `password[confirmation]`), never lower it (`max[api_tokens]` stays a
 * `stem`). A flat name, or one whose bracket segments are all indexes, reads
 * as its path alone.
 *
 * @param name - The parameter name, as written or already decoded.
 * @returns The kind of match, or `undefined` for no credential.
 */
function classifyName(name: string): NameMatch | undefined {
    const decoded = decodeAsciiEscapes(name).toLowerCase()
    const field = fieldSegment(decoded)
    const match = classifyNormalised(normalise(field ?? decoded))
    if (field === undefined) return match
    return classifyNormalised(normalise(decoded)) === 'stem' ? 'stem' : match
}

/**
 * The field segment of a bracketed name: the last segment after a bracket
 * that holds a letter — `cvc` in `card[cvc][]`, `password` in
 * `[INFO]password`.
 *
 * Reads the name once, from its end: each bracket closes the segment after
 * it, so no segment is read twice.
 *
 * @param decoded - A decoded, lowercased name.
 * @returns The segment, or `undefined` for a flat name and for one whose
 *   bracket segments are all indexes (`password[0]`), which reads as its
 *   path.
 */
function fieldSegment(decoded: string): string | undefined {
    let end = decoded.length
    for (let j = end - 1; j >= 0; j--) {
        if (!BRACKETS.has(decoded[j])) continue
        if (hasLetter(decoded, j + 1, end)) return decoded.slice(j + 1, end)
        end = j
    }
    return undefined
}

/**
 * Whether `text[from, to)` holds an ASCII letter.
 *
 * @param text - A lowercased name.
 * @param from - The first index.
 * @param to - One past the last index.
 * @returns True when a character in the span is `a-z`.
 */
function hasLetter(text: string, from: number, to: number): boolean {
    for (let j = from; j < to; j++) {
        const code = text.charCodeAt(j)
        if (code >= 0x61 && code <= 0x7a) return true
    }
    return false
}

/**
 * Normalise a decoded name: drop the {@link STRIPPED} characters, then
 * trailing digits, then a trailing `confirmation`.
 *
 * @param decoded - A decoded, lowercased name or segment.
 * @returns The normalised name.
 */
function normalise(decoded: string): string {
    let normalised = ''
    for (const char of decoded) {
        if (!STRIPPED.has(char)) normalised += char
    }
    normalised = withoutTrailingDigits(normalised)
    if (
        normalised.length > CONFIRMATION.length &&
        normalised.endsWith(CONFIRMATION)
    ) {
        normalised = normalised.slice(0, -CONFIRMATION.length)
    }
    return normalised
}

/**
 * Say how a normalised name matched, if it did.
 *
 * @param normalised - A name {@link normalise} produced.
 * @returns The kind of match, or `undefined` for no credential.
 */
function classifyNormalised(normalised: string): NameMatch | undefined {
    if (normalised === '') return undefined
    if (CREDENTIAL_NAMES.has(normalised)) return 'exact'
    const rest = withoutCodeSuffix(normalised)
    if (rest !== undefined) return isCodeQualifier(rest) ? 'stem' : undefined
    if (CREDENTIAL_STEMS.some((stem) => normalised.endsWith(stem))) {
        return 'stem'
    }
    if (!CREDENTIAL_STEMS.some((stem) => normalised.endsWith(`${stem}s`))) {
        return undefined
    }
    return isCountName(normalised) ? 'count' : 'stem'
}

/**
 * What precedes a code suffix, when a normalised name has one.
 *
 * @param normalised - A normalised name.
 * @returns The leftover before `code` or `codes`, or `undefined` when the
 *   name does not end in one or is nothing but the suffix.
 */
function withoutCodeSuffix(normalised: string): string | undefined {
    for (const suffix of CODE_SUFFIXES) {
        if (normalised.length > suffix.length && normalised.endsWith(suffix)) {
            return normalised.slice(0, -suffix.length)
        }
    }
    return undefined
}

/**
 * Whether what precedes a code suffix makes it a secret: a factor word
 * (`mfa`, `verification`) or a credential stem (`pin`, `pass`, `auth`).
 *
 * @param rest - The leftover before `code` or `codes`.
 * @returns True for `mfa`, `pin`, `emailverification` and the like.
 */
function isCodeQualifier(rest: string): boolean {
    return CODE_QUALIFIERS.some((word) => rest.endsWith(word)) ||
        CREDENTIAL_STEMS.some((stem) => rest.endsWith(stem))
}

/**
 * Whether a normalised plural name counts something rather than lists
 * credentials: it ends in `tokens` or `keys` AND names a limit or a tally.
 *
 * Both halves, because the count reason covers nothing wider: `api_tokens`
 * and `passwords` are credentials whatever their value looks like.
 *
 * @param normalised - A normalised name that ends in a plural stem.
 * @returns True for `maxtokens`, `prompttokens`, `maxkeys` and the like.
 */
function isCountName(normalised: string): boolean {
    return COUNT_PLURALS.some((plural) => normalised.endsWith(plural)) &&
        COUNT_WORDS.some((word) => normalised.includes(word))
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
 * uncapped message (40k characters: 2.4 s). Brackets are name characters, so
 * a bracketed name is one run to both walks, and its structure is read once,
 * from the name's end, when the name is classified: no walk pairs a `[` with
 * its `]`, which would rescan on `x]=` repeated, and no segment is read to
 * the end of the name, which would rescan on `[0]` repeated.
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
 *   quoted CLI argument) runs to its escaped twin, skipping a serialised
 *   escaped quote (`\\\"`).
 * - Inside a URL query or fragment (the name follows `?`, `&` or `#`, raw or
 *   percent-encoded) a value also ends at `&`, `#`, `<` or `>`, so the
 *   neighbouring parameters stay readable. A bare `code` after `&amp;` (an
 *   `href`'s query) ends there too.
 * - Anywhere else it ends at ASCII whitespace or a quote, save a form-body
 *   `code`, which ends at `&` (below). A CLI `--password=ab&cd` holds its
 *   `&` as content, and so does a value after `&amp;` that was HTML-escaped
 *   whole (`password=ab&lt;cd`); ending there would leak the rest. A `;` or
 *   `,` is content the same way (`Pwd=ab;cd`), and so are `%26`, `%3B` and
 *   `%2C` wherever they sit.
 * - Such a raw value also ends before a `&`, `&amp;`, `;` or `,` (the
 *   {@link CUT_SEPARATORS}) that starts another credential `name=` (named by
 *   this same rule), so that pair is masked by its own rule (#500, #525).
 *   Eating it is NOT the safe direction: the eaten name is hidden from the
 *   scan, and a quoted or blank-separated value of that pair
 *   (`&amp;token="…"`, an ODBC `Pwd=…;Token="…"`, `password=…,secret =…`)
 *   would render in clear. A URL-mode value is never cut; it already ends at
 *   `&`.
 * - A pair such a cut starts inside a masked value keeps the raw end and the
 *   cut check, and takes no exemption (#524): it is never in URL mode, and a
 *   bare `code` or a count there is masked. Its value is the rest of the
 *   value before it, so either rule would show that rest
 *   (`--password=ab&token=cd&ef` renders `--password=***&token=***`, and
 *   `Pwd=ab;max_tokens=4096` renders `Pwd=***;max_tokens=***`). Every cut
 *   passes this on, whatever value it ends, an empty one included (#528):
 *   `pwd=A;token=;code=B` renders `pwd=***;token=;code=***`, and
 *   `--password=,code=B,retry=C` renders `--password=,code=***`. A pair after
 *   a kept count sits inside no masked value and keeps its own rule, so
 *   `max_tokens=4096;code=23505` renders whole. The cost: an empty raw
 *   credential value before a separator and a bare `code` or a count masks
 *   that pair (`token=;code=23505` renders `token=;code=***`).
 * - The accepted cost, and what the cut leaves: a value that holds a
 *   separator before a credential `name=` shows that separator and name
 *   (`Pwd=ab;token=cd` renders `Pwd=***;token=***`), and so does a password
 *   holding `&pin=`, `;pin=` or `,pin=`. A quoted value after a cut ends at
 *   its quote (`Pwd=ab;key="x"yz` shows `yz`); a URL-mode value is not cut
 *   (`?password=A;token="B"` shows `"B"`); a pair this rule does not name is
 *   no cut (`Pwd=ab;x= cd` shows `cd`); and a raw quote or whitespace inside
 *   a password still ends its value. A form body with a secret before its
 *   `code` loses that code's neighbours
 *   (`client_secret=cs&code=xyz&grant_type=…` renders
 *   `client_secret=***&code=***`).
 *
 * An empty value is left alone, so `?token=&page=1` stays diagnostic. Blanks
 * after `=` are always skipped, so `password= …` (what `util.format('k=', v)`
 * prints) is covered; the accepted cost is that `token= in header` renders
 * as `token= *** header`.
 *
 * **Non-secrets kept on purpose.** A bare `code` is an OAuth code only in a
 * URL query, after `&amp;`, or in a form body where its value ends at `&`
 * (or `&amp;`) and another `name=` (`code=…&grant_type=…`); elsewhere
 * (`status code=503`, Postgres `code=23505`) it is left alone. A longer
 * `code` name is masked anywhere when what precedes `code` or `codes` ends in
 * a credential stem or a factor word (`pin_code`, `passcode`, `mfa_code`,
 * `backup_codes`); every other one is a diagnostic (`status_code`,
 * `exit_code`, `zip_code`) and stays readable. A known count
 * name with an unquoted all-digit value is a count (`max_tokens=4096`), not
 * a credential — chosen over a documented over-match because LLM and quota
 * errors carry exactly these. A count name ends in `tokens` or `keys` AND
 * contains `max`, `prompt`, `completion` or `total`; every other plural stays
 * masked (`api_tokens=123456`, `passwords=4821`), and so does a quoted count
 * (`max_tokens="4096"`). A numeric-PIN plural is never a count, so
 * `max_pins=8` is masked. Neither non-secret is kept for a pair a cut starts
 * inside a masked value (above). Known residue: after `&amp;` a count name
 * takes the raw end, so `?a=1&amp;max_tokens=4096&amp;b=2` masks the count —
 * its value runs on to `&amp;b=2`, which starts no credential pair.
 *
 * **Bracketed names (#526).** `[` and `]`, raw or as `%5B`/`%5D`, are name
 * characters, so both walks cross them and the pair is classified by
 * {@link isCredentialParamName}'s field-segment rule: `card[cvc]=…`,
 * `user[password]=…`, `card[cvc][]=…` and `password[0]=…` are masked, a
 * cut finds `&card[cvc]=` after a password, and a nested `code` field takes
 * the bare `code` rule (`user[code]=…&state=1` is a form body, masked;
 * `status[code]=503` renders). Known residue, each case pinned by a `#526`
 * test (the over-matches by the path test, the rest by the accepted-cost
 * test): a credential container with a generic field renders
 * (`password[value]`, `token[raw]`, as `password_value` does); a segment
 * holding a blank, `:`, `/`, `@`, `+` or non-ASCII ends the walk inside the
 * brackets (`user[pass word]=x` renders); an unqualified container's `code`
 * renders in free text (`user[code]=x`, `two_factor[code]=x`); a dotted
 * path keeps its single compound reading (`user.code=X&a=b` renders); a raw
 * credential value outside a URL eats the bracket pair after it
 * (`card[cvc]=314&card[number]=4242` renders `card[cvc]=***`); a query name
 * that begins with a bracket, or has one before its field segment, takes URL
 * mode, so the text after the next `&` shows (`?[x]password=A&B` renders
 * `?[x]password=***&B`; likewise `&a[b]password=`, `&x]token=` and
 * `#V[key=`); a cut shows its separator and its bracketed name,
 * and `[` and `]` join the run such a cut can show; and `[auth]code=23505`,
 * `config[key]=v` and, in a URL or form body, `error[code]=E_X` are pinned
 * over-matches.
 *
 * **Not seen.** This net is a shape rule for `name=value`. It does not see a
 * JSON `"token":"…"`, a header- or YAML-style `name: value`, an
 * `Authorization: Bearer …` header, a bare token with no name, a doubly
 * encoded separator (`%253D`) or bracket (`%255B`), or a session id under a
 * name it does not know. Those need a source-side fix where the value is
 * known.
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
    const runs = new FormRuns()
    // Where the name of the pair a cut started inside a masked value begins
    // (#524): that pair keeps the raw end and takes no exemption.
    let inherited = -1
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
        if (match === undefined) {
            i += equalsLength
            continue
        }
        // Blanks after `=` are skipped whatever precedes it: `password= …` is
        // what `util.format('password=', v)` prints. The cost is that an
        // empty value takes the next word (`token= *** header`).
        const valueStart = skipBlanksRight(text, i + equalsLength)
        // A pair a cut started sits inside a masked value: URL mode or an
        // exemption would show the rest of that value as this one's.
        const cut = start === inherited
        const url = !cut && (inUrl(text, start) ||
            (match === 'exact' && isOAuthCode(text, start, valueStart, runs)))
        if (match === 'exact' && !url && !cut) {
            // A status or exit code (`code=23505`, `exit code=1`) an operator
            // needs.
            i += equalsLength
            continue
        }
        const quoted = quotedValue(text, valueStart)
        if (quoted !== undefined) {
            if (quoted.end > quoted.start) {
                out += `${text.slice(copied, quoted.start)}***`
                copied = quoted.end
            }
            i = quoted.next
            continue
        }
        const ends = url ? URL_VALUE_END : RAW_VALUE_END
        let end = valueStart
        let cutHere = false
        while (end < text.length && !ends.has(text[end])) {
            if (
                !url && CUT_SEPARATORS.has(text[end]) &&
                startsCredentialPair(text, end)
            ) {
                cutHere = true
                break
            }
            end++
        }
        if (match === 'count' && !cut && isDigits(text, valueStart, end)) {
            // `max_tokens=4096` counts tokens; it is not one.
            i = end
            continue
        }
        if (end > valueStart) {
            out += `${text.slice(copied, valueStart)}***`
            copied = end
        }
        if (cutHere) inherited = separatorEnd(text, end)
        i = Math.max(end, i + equalsLength)
    }
    return copied === 0 ? text : out + text.slice(copied)
}

/** The span of a quoted value's content, and where the scan resumes. */
interface QuotedValue {
    /** The index of the content's first character, past the opener. */
    readonly start: number
    /** One past the content's last character: the closer, or the length. */
    readonly end: number
    /** Where the scan resumes, past the closer. */
    readonly next: number
}

/**
 * Read a value that opens with a quote, plain (`"`) or escaped (`\"`).
 *
 * @param text - The text being scanned.
 * @param at - Where the value starts.
 * @returns The content's span, or `undefined` when no quote opens it.
 */
function quotedValue(text: string, at: number): QuotedValue | undefined {
    if (text[at] === '\\' && QUOTES.has(text[at + 1])) {
        // An escaped opener (`\"`, JSON-serialised text) closes at its
        // escaped twin.
        const end = closingEscapedQuote(text, at)
        return { start: at + 2, end, next: end + 2 }
    }
    if (!QUOTES.has(text[at])) return undefined
    const end = closingQuote(text, at)
    return { start: at + 1, end, next: end + 1 }
}

/**
 * Where an escaped-quote value ends: the escaped twin of its opener, or the
 * end of the text.
 *
 * {@link closingQuote}'s escape rule, one level up. In serialised text a
 * backslash is itself written `\\`, so `\\` escapes the unit after it — one
 * character, or a whole `\x` pair — and `\\\"` is an escaped quote inside
 * the value, not its end. Any other `\x` pair is one serialised character.
 *
 * @param text - The text being scanned.
 * @param open - The index of the opener's backslash.
 * @returns The index of the closer's backslash, or the text's length.
 */
function closingEscapedQuote(text: string, open: number): number {
    const quote = text[open + 1]
    let j = open + 2
    while (j < text.length) {
        if (text[j] !== '\\') {
            j++
        } else if (text[j + 1] === quote) {
            return j
        } else if (text[j + 1] === '\\') {
            // A serialised backslash: step over it and the unit it escapes.
            j += text[j + 2] === '\\' ? 4 : 3
        } else {
            j += 2
        }
    }
    return text.length
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
 * The separators a raw value is cut before when another credential `name=`
 * follows (#500, #525): `&` (and `&amp;`, which opens with it) for a query or
 * a form body, `;` for an ODBC connection string, `,` for a comma-separated
 * list. Only outside URL mode, where a value already ends at `&`; and never
 * the encoded `%26`, `%3B` or `%2C`, which a value carries as content.
 */
const CUT_SEPARATORS: ReadonlySet<string> = new Set(['&', ';', ','])

/** The HTML escape of `&`, as a query inside an `href` attribute is written. */
const AMP = '&amp;'

/**
 * Where the name after a separator starts: past `&amp;`, or past the one
 * character of any other separator.
 *
 * The single home of a separator's width. {@link pairNameAfter} reads the
 * name from here, and the scan marks the pair a cut starts at the same
 * index, which is where its own walk left over the name stops.
 *
 * @param text - The text being scanned.
 * @param at - The index of a separator, raw or the start of `&amp;`.
 * @returns The index just past the separator.
 */
function separatorEnd(text: string, at: number): number {
    return isEscapedAmpersand(text, at) ? at + AMP.length : at + 1
}

/**
 * Whether `text` holds `&amp;` at `at`, in any case.
 *
 * @param text - The text being scanned.
 * @param at - Where the escape would start; may be negative.
 * @returns True for `&amp;`, `&AMP;` and the like.
 */
function isEscapedAmpersand(text: string, at: number): boolean {
    return at >= 0 && text.slice(at, at + AMP.length).toLowerCase() === AMP
}

/**
 * Whether a bare `code` outside a raw-separator query is still an OAuth code,
 * and so takes the URL rule.
 *
 * It is one after the `&amp;` an `href` writes, or in a form body
 * (`code=…&grant_type=…`); anywhere else it is a status or exit code. Only
 * this decision puts a name after `&amp;` in URL mode, so its value ends at
 * the next `&amp;` whatever follows. Any other name after `&amp;` keeps the
 * raw end, because an HTML-escaped value carries `&lt;` or `&amp;` as
 * content; that raw value stops at `&amp;` only before another credential
 * pair. Never asked for a pair a cut starts inside a masked value, which
 * takes no exemption (#524).
 *
 * @param text - The text being scanned.
 * @param start - The index of the name's first character.
 * @param valueStart - Where the value starts.
 * @param runs - The scan's form-run reader, shared across its `code=` pairs.
 * @returns True when the `code` is in URL mode.
 */
function isOAuthCode(
    text: string,
    start: number,
    valueStart: number,
    runs: FormRuns,
): boolean {
    return isEscapedAmpersand(text, start - AMP.length) ||
        runs.at(text, valueStart).query
}

/**
 * Reads form runs for one scan, reusing the last run while the scan stays
 * inside it — which keeps a text of bare `code=` pairs linear.
 */
class FormRuns {
    #last: FormRun = { end: -1, query: false }

    /**
     * The form run a value starting at `from` belongs to.
     *
     * @param text - The text being scanned.
     * @param from - Where the value starts.
     * @returns The run, read once and reused while it covers `from`.
     */
    at(text: string, from: number): FormRun {
        if (this.#last.end < from) this.#last = readFormRun(text, from)
        return this.#last
    }
}

/**
 * Where an unquoted value would end under the URL rule, and whether it ends
 * as a form body does: at `&` followed by another `name=`.
 */
interface FormRun {
    /** The index of the first URL value terminator, or the text's length. */
    readonly end: number
    /** Whether `&` and another pair follow at `end`. */
    readonly query: boolean
}

/**
 * Read the run of non-terminators from `from` and say whether it ends as a
 * form body: `code=…&grant_type=…` is an OAuth token request's body, which
 * carries no `?` for {@link inUrl} to see.
 *
 * Each run is read once: a later `code=` inside it shares the same end.
 *
 * @param text - The text being scanned.
 * @param from - Where the value starts.
 * @returns The run's end and whether another pair follows it.
 */
function readFormRun(text: string, from: number): FormRun {
    let end = from
    while (end < text.length && !URL_VALUE_END.has(text[end])) end++
    if (text[end] !== '&') return { end, query: false }
    return { end, query: pairNameAfter(text, end) !== undefined }
}

/**
 * Whether the separator at `at` starts another credential pair, which must
 * end the raw value it sits in so the pair is masked by its own rule.
 *
 * @param text - The text being scanned.
 * @param at - The index of a separator, raw or the start of `&amp;`.
 * @returns True when a credential-named `name=` follows.
 */
function startsCredentialPair(text: string, at: number): boolean {
    const name = pairNameAfter(text, at)
    return name !== undefined && classifyName(name) !== undefined
}

/**
 * The name of the pair that starts after the separator at `at`: a `&`, the
 * `&amp;` it opens, a `;` or a `,`.
 *
 * A name here is what {@link nameStart} walks over, read rightwards: name
 * characters, raw or percent-encoded. Blanks may sit before the equals sign,
 * as in `api_key =…`.
 *
 * Linear across a scan: the read stops at the first character that is
 * neither a name character nor a blank, so it never crosses the next
 * separator, and the reads after two separators never overlap.
 *
 * @param text - The text being scanned.
 * @param at - The index of a separator, raw or the start of `&amp;`.
 * @returns The name as written, or `undefined` when no `name=` follows.
 */
function pairNameAfter(text: string, at: number): string | undefined {
    const start = separatorEnd(text, at)
    const end = nameEnd(text, start)
    if (end === start) return undefined
    return equalsAt(text, skipBlanksRight(text, end)) > 0
        ? text.slice(start, end)
        : undefined
}

/**
 * Whether the name starting at `start` sits in a URL query or fragment: it
 * follows `?`, `&` or `#`, raw or percent-encoded.
 *
 * Not `&amp;`: only a bare `code` takes URL mode after it, in
 * {@link isOAuthCode}. A raw value elsewhere stops at `&amp;` only before
 * another credential pair.
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
 * Walk right from `start` over a parameter name and return where it ends —
 * {@link nameStart}'s walk in the other direction, crossing `%XX` only when
 * it decodes to a name character.
 *
 * @param text - The text being scanned.
 * @param start - The index of the name's first character.
 * @returns One past the name's last character; `start` when there is none.
 */
function nameEnd(text: string, start: number): number {
    let j = start
    while (j < text.length) {
        if (text[j] === '%' && isHex(text[j + 1]) && isHex(text[j + 2])) {
            const decoded = String.fromCharCode(
                parseInt(text.slice(j + 1, j + 3), 16),
            )
            if (!isNameCharacter(decoded)) break
            j += 3
            continue
        }
        if (!isNameCharacter(text[j])) break
        j++
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
 * `.`, `_`, `~`, `-`, `[` and `]`.
 *
 * The brackets are here so a nested form name (`card[cvc]`) is one run to
 * both walks; its segments are read only by {@link classifyName} (#526).
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
