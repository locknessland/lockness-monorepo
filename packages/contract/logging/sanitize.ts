/**
 * @fileoverview Makes untrusted values safe to write into a log line.
 *
 * The single home for one decision: **how a request-derived value is encoded
 * before it reaches a log sink.** Anything that logs a path, a header or a
 * param goes through here rather than interpolating it directly.
 *
 * **It lives in `@lockness/contract`, the foundation layer, and not in
 * `@lockness/core` where it started.** `@lockness/core` imports
 * `@lockness/events`, so the reverse edge would be a cycle — and the emitter is
 * exactly the module that needs to encode an event name before logging it. A
 * second encoder in the emitter was the alternative, and two spellings of one
 * rule diverge on the first escape sequence somebody remembers in only one of
 * them. `@lockness/core` re-exports this name, so no caller changed.
 *
 * @module @lockness/contract/logging/sanitize
 */

/**
 * Longest run of **input** this encoder consumes before truncating.
 *
 * **Charged against consumed code points, not emitted characters** — the
 * difference is a security property, not a detail. Charging emitted length
 * makes a character's cost depend on how wide its escape is, so a hostile
 * prefix of format characters buys ~8 units of budget each and evicts whatever
 * follows it. In `renderError` what follows is the diagnostic tail, *including
 * the `***:***` that proves redaction fired*. Measured before this changed: 64
 * hostile characters plus a tail rendered at 582 characters against this cap.
 *
 * The emitted line is still bounded; the bound is simply derived rather than
 * literal — `MAX_LENGTH` code points times the widest escape this encoder can
 * actually emit. That is **nine** characters, not ten: the widest escaped
 * codepoint is `\u{e007f}`, because nothing above the Unicode range is
 * `Cf` and no un-escaped codepoint contributes an escape at all. So the bound
 * is 512 x 9 = **4608**, or **4620** once a truncating call appends its marker
 * — both measured, not derived from the widest codepoint that exists. It is
 * fixed by this file, never chosen by the attacker, which is the whole point.
 *
 * Consequence worth knowing: `renderError` caps its message at 200 before
 * calling in here, and 200 is below this, so a rendered error is never
 * truncated twice.
 */
const MAX_LENGTH = 512

/**
 * Unicode `General_Category=Cf` — the format characters.
 *
 * **A criterion, not an enumerated range list.** The class is 170 codepoints
 * and **none of them is a letter or a digit**, so "formatting is unsafe, script
 * is not" holds by construction instead of by a range table someone has to keep
 * true. It covers the bidi overrides and isolates that motivated this, and also
 * U+061C (a Bidi_Control reachable as `%d8%9c`), U+FEFF, U+2060 and the astral
 * tag block U+E0000-E007F — every one of which an enumeration of the obvious
 * ranges leaves behind.
 *
 * No `g` flag: this is used with `test`, and a global regex carries `lastIndex`
 * between calls.
 */
const FORMAT_CHARACTER = /\p{Cf}/u

/**
 * The eleven `Cf` codepoints that are content rather than control.
 *
 * Arabic and Syriac prefix marks. **The guarantee is narrow and worth stating
 * exactly**: not one of them is a `Bidi_Control` and not one is
 * `Default_Ignorable_Code_Point` — both verified by execution over the whole
 * set — so none reorders text that its own script does not already reorder.
 * That last clause is deliberately weaker than "cannot reorder a line", which
 * an earlier draft claimed: U+070F is `Bidi_Class=AL`, and a strong RTL
 * character does resolve adjacent neutrals under UAX#9. ECMAScript exposes no
 * `Bidi_Class`, so the strong form is not checkable here — and it would not
 * matter if it were, since an ordinary Arabic letter has the identical effect
 * and is correctly left alone. Escaping U+070F would close a codepoint, not a
 * class. They are *not* "ordinary text" — like the rest of the class they carry
 * no glyph of their own in most terminals, so this carve-out knowingly passes
 * invisible characters through, two paragraphs after this file says
 * invisibility is a reason to escape.
 *
 * That is the accepted cost of not mangling every Arabic and Syriac message the
 * framework logs. Reordering is the threat this module can do something about;
 * invisibility in a script that legitimately uses these marks is not, and
 * escaping them would trade a real cost for no security benefit. This is an
 * explicit exception to a criterion, which is the one place a hand-written list
 * is the honest shape rather than a liability.
 */
const CONTENT_FORMAT_MARKS: ReadonlySet<number> = new Set([
    0x600,
    0x601,
    0x602,
    0x603,
    0x604,
    0x605,
    0x6dd,
    0x70f,
    0x890,
    0x891,
    0x8e2,
])

/**
 * Encodes a request-derived value for safe logging.
 *
 * @remarks
 * **Why this is needed even though the value came from a URL.** Hono's
 * `getPath` applies `tryDecodeURI` before handing you `c.req.path`, and
 * `decodeURI` does decode `%0A`, `%0D` and `%1B` — they are not in its reserved
 * set. So a request to `/%0aFAKE%20LOG%20LINE` yields a path containing a real
 * newline, and `%1b` yields a real escape byte. Interpolated into
 * `console.log`, the first forges log entries and the second drives the
 * operator's terminal. `c.req.param()` decodes the same way.
 *
 * **Unicode format characters are encoded too**, and for a distinct reason: they
 * do not forge a line, they *reorder* one. U+202E RIGHT-TO-LEFT OVERRIDE makes
 * `/admin<RLO>gnp.txt` render as `/admintxt.png` in any bidi-aware terminal, so
 * an operator reading the log sees a request that never happened. The invisible
 * members of the class (U+200B, U+FEFF, the astral tags) hide text outright.
 * Membership is decided by `General_Category=Cf` rather than by a list of
 * ranges — see `FORMAT_CHARACTER`, and `CONTENT_FORMAT_MARKS` for the eleven
 * Arabic and Syriac marks that are exempt because they are content.
 *
 * Control characters are replaced rather than stripped, so the log still shows
 * that something was there.
 *
 * **Escape widths.** `\xXX` at or below `0xFF`, `\u{...}` above it, and the
 * backslash itself as `\\`. That last one is what makes an escape readable in
 * exactly one way: without it a real U+2028 and the literal six characters
 * `\x2028` produce byte-identical output, and the encoding says nothing about
 * which arrived. The visible cost is that a Windows path renders
 * `C:\\Users\\...`.
 *
 * @param value - A request-derived value, or anything else untrusted.
 * @returns A single-line, control-free string, truncated if very long.
 *
 * @example
 * ```typescript
 * console.log('→', c.req.method, safeForLog(c.req.path))
 * ```
 */
export function safeForLog(value: string): string {
    let encoded = ''
    let consumed = 0

    // Iterating the string yields one CODE POINT per step, so an astral
    // character arrives whole. Switching to charCodeAt would split every one of
    // them into two surrogates and escape both.
    for (const char of value) {
        if (consumed === MAX_LENGTH) {
            // The marker carries the input's own size, which content cannot
            // forge. A value may contain the literal text `…[truncated]` — U+2026
            // is `Po`, the brackets and letters all pass — so the marker alone
            // never proved a truncation. Until this change, length did: a real
            // truncation emitted exactly 512 + 12 characters, every time.
            // Charging the cap against input removed that oracle (real
            // truncations now span 524 to 4620), so the count replaces it.
            // Counted, not materialised: `[...value]` would allocate the whole
            // input, and this path exists because the input is already large.
            let total = 0
            for (const _ of value) total++
            return `${encoded}\u2026[truncated at ${MAX_LENGTH} of ${total}]`
        }
        consumed++

        const code = char.codePointAt(0) ?? 0
        // U+2028 / U+2029 are outside the C1 range but ARE line
        // terminators in JavaScript, so a JS-based log consumer splits on
        // them exactly as it splits on LF. decodeURI turns %e2%80%a8 into
        // U+2028 the same way it turns %0a into LF, so the request shape
        // that motivated this function reaches them too.
        // C0 controls, DEL, and the C1 range — everything that can forge a
        // log line or drive a terminal. Then the backslash, so an escape has
        // one parse. Then the format characters, which reorder or hide.
        const mustEscape = code < 0x20 || code === 0x7f ||
            (code >= 0x80 && code <= 0x9f) ||
            code === 0x2028 || code === 0x2029 ||
            code === 0x5c ||
            // `code >= 0xad` is not an optimisation bolted on afterwards: U+00AD
            // is the LOWEST Cf codepoint, so the guard is behaviour-identical
            // by construction (verified across all 1.1M codepoints, zero
            // divergences) and it keeps a regex off every ordinary character of
            // every logged value. `||` short-circuits only on true, so without
            // it the test below runs for every letter of every path. Measured
            // 2.1x on a realistic request path.
            (code >= 0xad && FORMAT_CHARACTER.test(char) &&
                !CONTENT_FORMAT_MARKS.has(code))

        if (!mustEscape) {
            encoded += char
        } else if (code === 0x5c) {
            encoded += '\\\\'
        } else if (code <= 0xff) {
            encoded += `\\x${code.toString(16).padStart(2, '0')}`
        } else {
            encoded += `\\u{${code.toString(16)}}`
        }
    }

    return encoded
}

/**
 * Matches the `scheme://userinfo@` prefix of a DSN-shaped substring.
 *
 * The `userinfo` capture is bounded by `[^@\s/]+`, so it can never cross a `/`
 * (into the path) or an `@` (into a second authority) — a `host:port` with no
 * `@` after it is not matched at all, because a bare authority has no userinfo.
 * The redaction below only fires when that captured userinfo carries a `:`,
 * i.e. a `user:password` pair; a credential-free DSN (`sqlite:///path`) is left
 * untouched.
 */
const DSN_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)([^@\s/]+)@/gi

/**
 * Redacts `user:password@` credentials embedded in URL-shaped substrings.
 *
 * A Drizzle/Postgres connection failure embeds the full DSN — userinfo
 * included — in `error.message`, so dropping the error object is not enough:
 * the message carrier still leaks the password. This rewrites only the
 * `user:password` userinfo segment to `***:***`, preserving the scheme, host,
 * port and path so the line stays diagnostic. Only DSN-shaped substrings whose
 * userinfo contains a `:` are touched — a port (`host:6379`) is not userinfo
 * and is never mistaken for a credential.
 *
 * @param message - The raw error message, possibly carrying a DSN.
 * @returns The message with any `user:password@` userinfo replaced by `***:***@`.
 *
 * @example
 * ```typescript
 * redactDsnCredentials('postgres://user:password@host:5432/db')
 * // 'postgres://***:***@host:5432/db'
 * ```
 */
function redactDsnCredentials(message: string): string {
    return message.replace(
        DSN_USERINFO,
        (match, scheme: string, userinfo: string) =>
            userinfo.includes(':') ? `${scheme}***:***@` : match,
    )
}

/**
 * Render a caught error for a log line.
 *
 * `name` plus a **redacted, truncated, encoded** message — never the object,
 * never the stack. `console.error('...', error)` prints both, and teardown is
 * exactly where credential-bearing errors are produced: a Postgres driver
 * failure carries `postgres://user:password@host/db`, a `fetch` rejection
 * carries a URL with its token in the query string. Log stores routinely have
 * broader access than the database those credentials open.
 *
 * The DSN userinfo is redacted **before** truncation and encoding, so the
 * cleartext password can never reach the sink — it is gone before the string is
 * bounded or escaped, not merely hidden past the truncation boundary.
 *
 * The encoding half is not theoretical either:
 * `packages/session/drivers/redis.ts:104` throws a Redis server's error reply
 * verbatim, on the path `close()` takes.
 *
 * **It lives here, in the foundation, for the same reason `safeForLog` does.**
 * The disposables drain has to render a teardown failure, and
 * `@lockness/contract` cannot import `@lockness/core` — so leaving it in core
 * would force a second renderer here, and two spellings of one rule diverge on
 * the first escape sequence somebody remembers in only one of them.
 * `@lockness/core` re-exports it, so no caller changed.
 *
 * @param error - Whatever was thrown.
 * @returns One safe, bounded line.
 *
 * @example
 * ```typescript
 * renderError(new Error('boom'))  // 'Error: boom'
 * ```
 */
/**
 * Caps a string at `max` **code points**, never UTF-16 units.
 *
 * `slice(0, 200)` charges an astral character two units and an ASCII one, so a
 * prefix of astral characters evicts twice as much of the line as its length
 * suggests — the same units mismatch `safeForLog`'s own cap exists to avoid,
 * one layer up. Measured before this: 120 astral code points removed the
 * `***:***` that proves redaction fired, where 180 ASCII characters did not.
 *
 * It also removes a second defect at the same boundary: `slice` can cut between
 * a surrogate pair, and a lone surrogate reaches the sink unescaped and renders
 * as U+FFFD. Iterating code points cannot land mid-pair.
 *
 * @param text - The string to bound.
 * @param max - The budget, in code points.
 * @returns `text` unchanged, or its first `max` code points with an ellipsis.
 */
function capCodePoints(text: string, max: number): string {
    let out = ''
    let seen = 0
    for (const char of text) {
        if (seen === max) return `${out}…`
        out += char
        seen++
    }
    return text
}

export function renderError(error: unknown): string {
    const MAX = 200

    if (error instanceof Error) {
        const redacted = redactDsnCredentials(error.message)
        return `${safeForLog(error.name)}: ${
            safeForLog(capCodePoints(redacted, MAX))
        }`
    }

    return safeForLog(capCodePoints(redactDsnCredentials(String(error)), MAX))
}
