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

/** Longest value written into a log line before truncation. */
const MAX_LENGTH = 512

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
 * Control characters are replaced rather than stripped, so the log still shows
 * that something was there.
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

    for (const char of value) {
        const code = char.codePointAt(0) ?? 0
        // U+2028 / U+2029 are outside the C1 range but ARE line
        // terminators in JavaScript, so a JS-based log consumer splits on
        // them exactly as it splits on LF. decodeURI turns %e2%80%a8 into
        // U+2028 the same way it turns %0a into LF, so the request shape
        // that motivated this function reaches them too.
        // C0 controls, DEL, and the C1 range — everything that can forge a
        // log line or drive a terminal.
        const isControl = code < 0x20 || code === 0x7f ||
            (code >= 0x80 && code <= 0x9f) ||
            code === 0x2028 || code === 0x2029

        encoded += isControl ? `\\x${code.toString(16).padStart(2, '0')}` : char
    }

    return encoded.length > MAX_LENGTH
        ? `${encoded.slice(0, MAX_LENGTH)}\u2026[truncated]`
        : encoded
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
export function renderError(error: unknown): string {
    const MAX = 200

    if (error instanceof Error) {
        const redacted = redactDsnCredentials(error.message)
        const message = redacted.length > MAX
            ? `${redacted.slice(0, MAX)}…`
            : redacted
        return `${safeForLog(error.name)}: ${safeForLog(message)}`
    }

    const redacted = redactDsnCredentials(String(error))
    return safeForLog(
        redacted.length > MAX ? `${redacted.slice(0, MAX)}…` : redacted,
    )
}
