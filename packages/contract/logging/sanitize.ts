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

import {
    diagnosticLocation,
    formatCompileDiagnostic,
    readCompileDiagnostic,
} from './compile_diagnostic.ts'
import { redactQueryCredentials } from './credential_params.ts'
import { readShownCode } from './error_code.ts'

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
 * **The terminator set is the whole design, and it is stated as a set of
 * terminators rather than as a set of permitted characters on purpose.**
 * Redaction is the one place in this module where matching TOO MUCH is the
 * safe direction: an over-match costs a line some diagnostic value, an
 * under-match puts a credential in a log store. A permitted-character
 * allowlist fails in the dangerous direction the moment a password contains a
 * character nobody listed.
 *
 * Three terminators, each earning its place:
 *
 * - `@` ends the userinfo, by definition.
 * - **`/` is PERMITTED in the span, and the shape decides.** It was a
 *   terminator until the review gate showed what that cost: a `/` in a
 *   password made the match stop early and the password went out in cleartext
 *   — and `/` in the userinfo is *simultaneously* what makes WHATWG `new URL()`
 *   throw, so the redactor failed on precisely the inputs that generate the
 *   error message it exists to clean. Measured: `postgres://app:aB3/xY9+z@db`
 *   renders that DSN verbatim inside `TypeError: Invalid URL`. A `/` appears in
 *   a random 16-byte base64 secret about a third of the time.
 *
 *   So the span may cross a `/`, and `redactDsnCredentials` then refuses any
 *   span that crossed one without a credential-shaped colon. That keeps
 *   `https://jsr.io/@std/assert` and `.../logo@2x.png` untouched — neither has
 *   a colon in the span — while `app:aB3/xY9+z` redacts.
 * - **`"`, `?`, `#`, `<` and `>`**, which RFC 3986 does not permit unencoded in
 *   a userinfo — a password containing one is percent-encoded long before it
 *   reaches a DSN, so terminating on them costs no real credential. They are
 *   here because over-matching is safe only up to the point where it starts
 *   LYING: measured, a JSON error body
 *   `{"url":"https://api.example.com","contact":"support@example.com"}` rendered
 *   as `https://***:***@example.com` — destroying the host and the field names,
 *   and asserting a `user:password` pair that never existed. The `***:***` form
 *   is a deliberate operator signal that a password WAS configured, so an
 *   attacker-controlled colon-bearing span between a `scheme://` and an `@`
 *   could forge exactly that. `?` and `#` close the same hole for a query string
 *   or fragment carrying an email.
 * - **ASCII whitespace, spelled out rather than `\s`.** This is #301: JS `\s`
 *   contains U+FEFF, so `postgres://user:pass<U+FEFF>@host/db` ended the match
 *   early and logged the password in cleartext, while the same DSN without it
 *   was redacted. An invisible character is exactly what an accidental
 *   copy-paste out of a web page introduces — and exactly what an attacker
 *   would add on purpose. Real whitespace still terminates, because it has to:
 *   `see http://docs and mail bob@y.com` has no path slash, and whitespace is
 *   the only thing standing between the rule and that unrelated address.
 */
const DSN_USERINFO = /([a-z][a-z0-9+.-]{0,31}:\/\/)([^@ \t\n\r\f\v"?#<>]+)@/gi

/**
 * A userinfo span that is really a `host:port`, not a credential.
 *
 * Needed only because `/` is permitted in the span (see `DSN_USERINFO`): with
 * it allowed, `https://api.example.com:8443/path@thing` produces a span that
 * carries a colon and would otherwise redact a host and a port that were never
 * a credential.
 */
const PORT_SHAPED = /^[^:/]*:\d+(?:\/|$)/

/**
 * Redacts `user:password@` credentials embedded in URL-shaped substrings.
 *
 * **A residual this cannot close, stated rather than left to be discovered.**
 * Whitespace still terminates, so `postgres://app:my pass@db` leaks. Removing
 * whitespace from the terminator set is not available: `see http://docs and
 * mail bob@y.com` has no path slash, and whitespace is the only thing keeping
 * the rule off that address. A raw `@` in a password truncates similarly. The
 * durable fix for a DSN the process actually holds is source-side —
 * `Database.connect` redacts by substring against the exact URL it was given,
 * which needs no parsing and has no ambiguity to trade against. This function
 * is the net for everything that did not go through such a site.
 *
 * A Drizzle/Postgres connection failure embeds the full DSN — userinfo
 * included — in `error.message`, so dropping the error object is not enough:
 * the message carrier still leaks the password. This rewrites the userinfo
 * segment only, preserving the scheme, host, port and path so the line stays
 * diagnostic.
 *
 * **Any userinfo is redacted, not only a `user:password` pair** (#303). The
 * old rule fired only when the userinfo carried a `:`, which left
 * `https://<token>@host` — the shape GitHub, GitLab and most APIs accept a
 * credential in — going out verbatim, and a `fetch` rejection carries that URL
 * in `error.message`. The `:` gate was believed to be what stopped a
 * `host:port` being mistaken for a credential; it never was. `redis://cache:6379/0`
 * is untouched because it has no `@` at all, which is the pattern's job, not
 * the gate's. Measured against six control lines: dropping the gate changed
 * none of them.
 *
 * The two shapes stay distinguishable — `***:***` for a pair, `***` for a
 * single value — because the shape is the last thing left of the credential
 * and it is what tells an operator whether a password was configured at all.
 *
 * The cost is that a non-secret username is redacted too: `ssh://git@github.com`
 * becomes `ssh://***@github.com`. That is accepted rather than worked around,
 * because nothing in a string distinguishes the username `git` from the token
 * `ghp_...`, and guessing wrong in the other direction leaks.
 *
 * @param message - The raw error message, possibly carrying a DSN.
 * @returns The message with any userinfo replaced by `***@` or `***:***@`.
 *
 * @example
 * ```typescript
 * redactDsnCredentials('postgres://user:password@host:5432/db')
 * // 'postgres://***:***@host:5432/db'
 * redactDsnCredentials('https://ghp_token@github.com/org/repo')
 * // 'https://***@github.com/org/repo'
 * ```
 */
function redactDsnCredentials(message: string): string {
    return message.replace(
        DSN_USERINFO,
        (match, scheme: string, userinfo: string) => {
            const hasColon = userinfo.includes(':')
            // A span that crossed a `/` is a credential only if it carries a
            // colon that is not a port. Without this the permissive class would
            // eat every scoped-package and `@`-in-filename URL there is.
            if (
                userinfo.includes('/') &&
                (!hasColon || PORT_SHAPED.test(userinfo))
            ) {
                return match
            }
            return `${scheme}${hasColon ? '***:***' : '***'}@`
        },
    )
}

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

/** Longest run of a single error's message, in code points. */
const MAX_MESSAGE = 200

/**
 * Longest run of a single error's `name`, in code points.
 *
 * `name` was uncapped, which is why this file's own bound was wrong by a
 * factor the review measured: `safeForLog` bounds its input at `MAX_LENGTH`
 * and can emit nine characters per code point, so one name could contribute
 * thousands of characters to a line reasoned about as a few hundred. A name is
 * a class identifier; 64 is generous for one.
 */
const MAX_NAME = 64

/**
 * Links of `cause` followed beyond the top-level error.
 *
 * Two, so a rendered line holds at most three errors. The bound exists because
 * a chain is attacker-influenceable in length while a log line is not.
 *
 * **The arithmetic, corrected.** An earlier version of this comment reasoned
 * "three times `MAX_MESSAGE` plus two separators" and put the bound near 624.
 * That was wrong on both factors: an escaped code point emits up to nine
 * characters, and `name` was not capped at all. Per link the real ceiling is
 * `(MAX_NAME + MAX_MESSAGE) x 9` plus the separator, so three links land under
 * **7.2k characters** — bounded, deterministic, and about twelve times the
 * number the comment used to claim. Measured rather than derived, because the
 * derived figure is what was wrong the first time.
 */
const MAX_CAUSE_LINKS = 2

/**
 * Most stack frames a sink may ask for (#488).
 *
 * A count is a request, and a request from a caller is still a length this
 * file has to bound: without it `frames: 1e6` on a deep recursion would print
 * every frame V8 kept. Fifty is five times V8's default capture depth.
 */
const MAX_FRAMES = 50

/**
 * Longest run of a single frame, in code points (#488).
 *
 * A frame is a function name and a module URL, so it is usually short — but a
 * dynamic class name or a long query string is not, and a frame is no more
 * trustworthy than a message. Like `MAX_MESSAGE`, it is charged before
 * encoding, so a frame's emitted width is bounded by `safeForLog`'s factor.
 */
const MAX_FRAME = 300

/**
 * A stack line shaped like a frame.
 *
 * V8 writes `Name: message` and then one `    at …` per frame. The shape alone
 * does not make a line a frame: a message line can be shaped the same way, so
 * `renderFrames` drops the header by its line count first and applies this only
 * to what follows (#508). No `g` flag: it is used with `test`.
 */
const FRAME_LINE = /^\s*at\s/

/**
 * Where a `data:` URL starts in a frame (#488). Case-insensitive, because a URL
 * scheme is.
 */
const DATA_URL = /data:/i

/**
 * A frame's own `:line:col` position, with the `)` that closes a named frame.
 *
 * Anchored to the end of the line, so a `:7:7` inside inline source is never
 * mistaken for it (#508).
 */
const POSITION_SUFFIX = /:\d+:\d+\)?$/

/** What a stack whose read threw renders as, already indented. */
const UNREADABLE_STACK = '    [unreadable stack]'

/**
 * Normalise a sink's frame request to a count this file will honour.
 *
 * @param frames - What the sink asked for.
 * @returns `0` for anything that is not a positive integer, otherwise the
 *   request clamped to `MAX_FRAMES`.
 */
function frameCount(frames: number | undefined): number {
    if (frames === undefined || !Number.isInteger(frames) || frames < 1) {
        return 0
    }
    return Math.min(frames, MAX_FRAMES)
}

/**
 * Collapse a `data:` URL in a frame to `data:…`, keeping the frame's position.
 *
 * A module imported from a `data:` URL is named by its whole source, so its
 * frames carry that source verbatim — and source holds literals no redaction
 * recognises. Everything from `data:` to the frame's own `:line:col` goes, or
 * to the end of the line when there is no position: the frame still says
 * where it ran, and none of what it ran.
 *
 * **Whatever the source holds** (#508). The collapse used to stop at the first
 * space or `)`, and unencoded source is full of both, so everything after the
 * first one printed. It is plain string slicing now, so no character the
 * source can hold — a CR or U+2028 included — ends it early.
 *
 * @param frame - One trimmed frame.
 * @returns The frame, its `data:` URL replaced by `data:…` and its position.
 */
function collapseDataUrl(frame: string): string {
    const start = frame.search(DATA_URL)
    if (start === -1) return frame
    const position = POSITION_SUFFIX.exec(frame.slice(start + 'data:'.length))
    return `${frame.slice(0, start)}data:…${position?.[0] ?? ''}`
}

/**
 * Render one frame: redacted, collapsed, capped, encoded.
 *
 * The order is the same as for a message, and for the same reason: both
 * redactions run on the whole frame **before** the cap, so a cut can never
 * strip the `@` the userinfo rule needs and leave the password before it.
 *
 * @param line - One raw stack line that `FRAME_LINE` accepted.
 * @returns The frame, without its indent.
 */
function renderFrame(line: string): string {
    const withoutUserinfo = redactDsnCredentials(line.trim())
    const withoutPairs = redactQueryCredentials(withoutUserinfo)
    const collapsed = collapseDataUrl(withoutPairs)
    return safeForLog(capCodePoints(collapsed, MAX_FRAME))
}

/**
 * How many leading stack lines are the header, not frames (#508).
 *
 * V8 writes the header as `Error.prototype.toString` of the error, so a
 * message with newlines spans that many lines — and a message line shaped like
 * `    at …` used to pass the frame filter. It then printed outside the message
 * cap, unredacted as message, and pushed the real frames out. Counting the
 * header's lines drops it whatever its lines look like.
 *
 * @param stack - The error's stack.
 * @param header - `Error.prototype.toString` of the same error.
 * @returns The header's line count when the stack starts with it, otherwise
 *   `0`: a stack assigned from elsewhere has no header this can locate, and
 *   the frame filter alone decides, as it did before.
 */
function headerLineCount(stack: string, header: string): number {
    return stack.startsWith(header) ? header.split('\n').length : 0
}

/**
 * Render the head error's first `count` frames, one per line.
 *
 * Frames come only from the lines after the header (`headerLineCount`), so
 * message text is capped and redacted as message, never as frames.
 *
 * **Total, like `renderOne`.** The `.stack` read is a property access on a
 * caught value, and a getter can throw; so can the `name` and `message` reads
 * that build the header. The catch returns a sentinel so the line still says a
 * stack was asked for and could not be read — without a header there is no
 * telling message lines from frames, so none is guessed at. Only an `Error`
 * with a string `stack` has frames — anything else has none to offer.
 *
 * @param error - The head of the chain.
 * @param count - A count already normalised by `frameCount`.
 * @returns `''`, or each frame on its own indented line, each preceded by
 *   `\n`.
 */
function renderFrames(error: unknown, count: number): string {
    if (count === 0) return ''
    let stack: unknown
    let header: string
    try {
        if (!(error instanceof Error)) return ''
        stack = error.stack
        header = Error.prototype.toString.call(error)
    } catch {
        return `\n${UNREADABLE_STACK}`
    }
    if (typeof stack !== 'string') return ''
    return stack.split('\n')
        .slice(headerLineCount(stack, header))
        .filter((line) => FRAME_LINE.test(line))
        .slice(0, count)
        .map((line) => `\n    ${renderFrame(line)}`)
        .join('')
}

/**
 * Render one error of a chain: redacted, capped, encoded. Never the stack —
 * frames are `renderFrames`' job, and only the head's.
 *
 * **Total by construction.** Every caller is a `catch` block, and several are
 * shutdown drains or a `void guard(...)` whose rejection Deno turns into a
 * process exit — so a throw here replaces the error being reported with a new
 * one, at the exact moment nothing is left to catch it. Before the cause chain
 * existed a well-formed `Error` could not make this throw; a cause can, and
 * seven shapes did: a null-prototype object, a `toString` that throws, a
 * `Symbol.toPrimitive` that throws, a throwing `cause` getter, a Proxy, and a
 * `message` that is not a string or is absent. All measured.
 *
 * The catch returns a sentinel rather than swallowing: the line still says
 * something was there, which is the same rule the encoder above follows for a
 * control character.
 */
function renderOne(error: unknown): string {
    try {
        if (error instanceof Error) {
            // `name` and `message` are typed `string` and are not guaranteed to
            // be one — an application subclass can assign anything.
            const name = typeof error.name === 'string' ? error.name : 'Error'
            const raw = typeof error.message === 'string'
                ? error.message
                : String(error.message)
            // Recognised first, on the raw text: the excerpt and the headline
            // are dropped whole, so neither redaction has to know about them.
            const diagnostic = readCompileDiagnostic(name, raw)
            const message = diagnostic === undefined
                ? raw
                : formatCompileDiagnostic(
                    diagnostic.kind,
                    diagnosticLocation(diagnostic),
                )
            const redacted = redactDsnCredentials(message)
            // `SyntaxError: SyntaxError at …` says one thing twice.
            return renderHead(
                diagnostic?.kind === name ? undefined : name,
                redactQueryCredentials(redacted),
                // A compile failure's code is Deno's `ERR_MODULE_NOT_FOUND`,
                // which mislabels a parse failure (#478), so none is shown.
                diagnostic === undefined ? readShownCode(error) : undefined,
            )
        }
        return safeForLog(
            capCodePoints(
                redactQueryCredentials(redactDsnCredentials(String(error))),
                MAX_MESSAGE,
            ),
        )
    } catch {
        return '[unrenderable error]'
    }
}

/**
 * Cap and encode one error's name, its code and its already-redacted message.
 *
 * @param name - The error's name, or `undefined` to render the message alone.
 * @param redacted - The message, with both redactions already applied.
 * @param code - A code already vetted by `readShownCode`, shown only beside a
 *   name.
 * @returns `name [code]: message`, `name: message`, or the message alone.
 */
function renderHead(
    name: string | undefined,
    redacted: string,
    code?: string,
): string {
    const shown = safeForLog(capCodePoints(redacted, MAX_MESSAGE))
    if (name === undefined) return shown
    return `${safeForLog(capCodePoints(name, MAX_NAME))}${
        code === undefined ? '' : ` [${safeForLog(code)}]`
    }: ${shown}`
}

/**
 * How a sink wants an error rendered.
 *
 * A vetted `code` is shown on every rendered link whatever these options say:
 * it is checked by spelling and is narrower than the name every sink carries.
 */
export interface RenderErrorOptions {
    /**
     * Follow `error.cause`. Defaults to `true`.
     *
     * **Set `false` for a sink that carries the line OUT OF THE PROCESS.** The
     * chain is redacted like any other text, so a DSN in a cause is safe — but
     * redaction only knows the shapes it knows, and a bare API key in a cause
     * is not one of them. A log line an operator reads and a span exported to a
     * trace backend are different trust boundaries, and
     * `@lockness/telemetry`'s `toRecordedException` already draws that line for
     * stacks with the same reasoning.
     *
     * This is a **sink policy, not a second renderer**: there is still exactly
     * one place that decides how an error becomes text. What varies is how much
     * of the chain a given sink is willing to carry, and that belongs to the
     * sink.
     */
    followCause?: boolean

    /**
     * Stack frames of the head error to append, one per line. Defaults to `0`.
     *
     * **Set it only for a sink a human reads in the same process** — the CLI
     * dispatcher asks for 10. Leave it unset for a sink that carries the line
     * out of the process (telemetry, a log shipper), on the reasoning
     * `followCause` gives: a frame names functions and absolute module paths,
     * and its text outside a URL is not redacted.
     *
     * Each frame goes through the same chain as a message: userinfo, then
     * credential pairs, then a `data:` URL collapsed to `data:…` followed by
     * the frame's own `:line:col`, then a cap of 300 code points, then
     * `safeForLog`, indented four spaces. Frames are read only after the
     * header's lines, so a message line shaped like a frame is never printed
     * as one. The header is never repeated, a cause's frames are never shown,
     * a count that is not
     * a positive integer means `0`, and a count above 50 is clamped. A `stack`
     * that cannot be read renders as `[unreadable stack]`.
     */
    frames?: number
}

/**
 * Render a caught error for a log line.
 *
 * The name, its code when spelled like a runtime or driver code, and the
 * **redacted, truncated, encoded** message; no other property, ever, and the
 * stack's frames only when the sink asks (`frames`, #488) — redacted the same
 * way, one per line. `console.error('...', error)` prints the whole object and
 * its stack, and teardown is exactly where credential-bearing errors are
 * produced: a Postgres driver failure carries
 * `postgres://user:password@host/db`, a `fetch` rejection
 * carries a URL with its token in the query string. Log stores routinely have
 * broader access than the database those credentials open.
 *
 * The DSN userinfo and every credential-named `name=value` pair (see
 * `redactQueryCredentials`) are redacted **before** truncation and encoding, so
 * the cleartext secret can never reach the sink — it is gone before the string
 * is bounded or escaped, not merely hidden past the truncation boundary.
 *
 * **A module that failed to compile or link renders as its kind and location
 * only** (#478): `TypeError: SyntaxError at file:///…/broken.ts:2:19 [source
 * excerpt withheld]`. The runtime's message quotes the failing source line, in
 * its excerpt and in its headline, and that line can hold a credential
 * literal. `importAppFile` translates the same failure earlier, with the path
 * relative to the app root; this is the backstop for an import that bypassed
 * it.
 *
 * **The code renders as `Name [CODE]: message`** (#491), on the head and on
 * every cause link rendered, so the SQLSTATE, errno or `ERR_*` that says what
 * failed reaches the operator. It is shown only when `isShowableErrorCode`
 * accepts its spelling: SQLSTATE, POSIX errno, or upper-snake with an
 * underscore, at most 48 characters. **That check limits the code's shape, not
 * its secrecy** — it turns away the common shapes of random secrets, but any
 * five characters of `[0-9A-Z]`, `E` followed by up to fifteen letters, and any
 * upper-snake value still pass whatever they carry, so never put a secret in
 * `.code`. `detail`, `hint` and every other
 * property are never rendered: they carry row data no redaction recognises. A
 * compile failure shows no code, because Deno labels a parse failure
 * `ERR_MODULE_NOT_FOUND`.
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
 * @param options - How much of the cause chain, and how many stack frames,
 *   this sink carries.
 * @returns One safe, bounded line — then, only when `frames` asks, up to that
 *   many indented frame lines, each one as bounded. Every newline in the result
 *   is structural; none comes from the error.
 *
 * @example
 * ```typescript
 * renderError(new Error('boom'))  // 'Error: boom'
 * renderError(Object.assign(new Error('duplicate key'), { code: '23505' }))
 * // 'Error [23505]: duplicate key'
 * renderError(new Error('boom'), { frames: 2 })
 * // 'Error: boom\n    at main (file:///app/x.ts:3:9)\n    at file:///app/x.ts:5:1'
 * ```
 */
export function renderError(
    error: unknown,
    options: RenderErrorOptions = {},
): string {
    // The chain, not just the head (#302). A wrapper whose whole content is its
    // cause rendered to nothing useful — `Error: websocket transport error` and
    // not one word about what actually failed — which is a real shape in this
    // repo: packages/realtime/websocket.ts attaches the transport event as a
    // cause deliberately, and had to mirror the detail into its own message by
    // hand to work around this.
    //
    // Every link goes through `renderOne`, so redaction and the cap apply to a
    // cause exactly as they apply to the head. A chain that skipped either
    // would be a credential hole opened by the fix.
    //
    // The stack stays dropped unless the sink asks for frames (#488). That
    // omission is about filesystem paths, and a cause chain carries none — so
    // the argument for dropping the stack was never an argument for dropping
    // the cause.
    const links = options.followCause === false ? 0 : MAX_CAUSE_LINKS
    const seen = new Set<unknown>()
    let rendered = ''
    let current: unknown = error

    for (let link = 0; link <= links; link++) {
        if (current === undefined || current === null) break
        // A cycle has no depth to run out of: `a.cause = b; b.cause = a` walks
        // forever against a depth bound alone, because each step is a new link.
        if (seen.has(current)) {
            rendered += ' caused by: [cycle]'
            break
        }
        seen.add(current)
        rendered += link === 0
            ? renderOne(current)
            : ` caused by: ${renderOne(current)}`
        // The `.cause` READ is its own hazard, separate from rendering the
        // value it yields: a getter can throw, and a Proxy can throw on the
        // property access itself. Wrapping only `renderOne` left this one live
        // — measured, three of four hostile shapes were fixed and the throwing
        // getter still took the process down.
        try {
            current = current instanceof Error ? current.cause : undefined
        } catch {
            rendered += ' caused by: [unreadable cause]'
            break
        }
    }

    return rendered + renderFrames(error, frameCount(options.frames))
}
