/**
 * @fileoverview The DSN check `Database.connect()` runs before any driver
 * factory sees a DSN (#425). Internal: not exported from the package.
 *
 * **Why a check, and why this grammar.** A driver that cannot tell where a
 * password ends does not throw — it rewrites the DSN. postgres.js reads a comma
 * as a host separator and ends the host part at the first `/` or `?`; mysql2
 * and libsql end it at the first `/`, `?` or `#`. So
 * `postgres://u:2024/Spring@h/db` is accepted as host `u`, port `2024`,
 * database `Spring@h/db`. Password fragments then become host names looked up
 * in cleartext DNS, and appear in errors in a rewritten form no exact-DSN
 * redaction can match. The only sound fix is to refuse a DSN whose password
 * boundary is ambiguous, before a driver parses it.
 *
 * WHATWG `new URL()` alone is the wrong grammar for that: it rejects the ported
 * multi-host form (`h1:5432,h2:5433`) that postgres.js supports, and it accepts
 * `u:2024/Spring@h`. The rules below are RFC 3986's userinfo and host grammar,
 * extended with a comma-separated host list, with WHATWG kept as a final
 * well-formedness check.
 *
 * **Every DSN with a scheme is checked**, not only one containing `://`: a
 * driver hands `postgres:u:pw@h/db` to WHATWG, which reads everything after the
 * scheme as the database name. Only `file:` and `sqlite:` may omit the `//`,
 * because a SQLite path has no userinfo to misparse.
 *
 * @module
 * @internal
 */

/**
 * The one message a refused DSN produces. It quotes no part of the DSN: any
 * substring of an ambiguous DSN may be a password fragment.
 */
export const INVALID_DSN_MESSAGE =
    'DSN is not a valid URL; percent-encode reserved characters in the password'

/**
 * The outcome of {@link inspectDsn}: refused, or accepted with the secrets a
 * failure render must remove.
 */
export type DsnInspection =
    | { readonly ok: false }
    | {
        readonly ok: true
        /**
         * The password as written and as percent-decoded, with empty and
         * duplicate values dropped. Empty when the DSN holds no password.
         */
        readonly secrets: readonly string[]
    }

/**
 * RFC 3986 userinfo: unreserved, sub-delims, `:` and percent-encoded octets.
 * Excludes `@`, `/`, `?`, `#`, whitespace and every non-ASCII character.
 */
const USERINFO = /^(?:[A-Za-z0-9\-._~!$&'()*+,;=:]|%[0-9A-Fa-f]{2})*$/

/**
 * One entry of the host list: an IP literal, or a registered name (RFC 3986
 * reg-name without `,`, which separates entries), then an optional numeric
 * port. A percent-encoded name such as `%2Fvar%2Frun` is a registered name;
 * postgres.js 3.4.8 treats it as a TCP host name, not a unix socket.
 */
const HOST =
    /^(?:\[[0-9A-Fa-f:.]+\]|(?:[A-Za-z0-9\-._~!$&'()*+;=]|%[0-9A-Fa-f]{2})*)(?::[0-9]{0,5})?$/

/** Schemes whose value is a path, so they may omit the `//` authority. */
const PATH_SCHEMES: ReadonlySet<string> = new Set(['file', 'sqlite'])

/** A URI scheme and its colon, at the very start of the DSN. */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/

/** A refused DSN. */
const REFUSED: DsnInspection = { ok: false }

/** A DSN with nothing a driver could misparse, and no password to hold. */
const NO_SECRETS: DsnInspection = { ok: true, secrets: [] }

/**
 * Decide whether a DSN is unambiguous, and collect its password if so.
 *
 * - **R0** the DSN holds no C0 control character or DEL and does not start with
 *   a space: WHATWG drops a tab or newline anywhere and strips a leading space,
 *   so the text a driver parses would not be the text checked. A scheme must
 *   be followed by `//`, except `file:` and `sqlite:`.
 *
 * For a DSN of the form `scheme://…`, the authority is the text after `//` up
 * to the first `/`, `?` or `#`; the tail is the rest. It is accepted only when:
 *
 * - **R1** the tail holds no raw `@` — so no `@` a driver could take as the end
 *   of the userinfo hides after a `/`, `?` or `#` in the password;
 * - **R2** the authority holds at most one `@`, the userinfo matches the RFC 3986
 *   userinfo grammar, and its user and password each percent-decode;
 * - **R3** the host part is empty or a comma-separated list of `[IPv6]` or
 *   registered-name entries, each with an optional numeric port;
 * - **R4** WHATWG `new URL()` accepts the DSN with its host list collapsed to
 *   the first entry;
 * - **R5** a host list holding a comma, once percent-decoded, does not occur in
 *   the DSN before the host part. postgres.js collapses the list by replacing
 *   the first match of its decoded form anywhere in the DSN, so it would
 *   rewrite the password instead.
 *
 * @param url - The DSN passed to `Database.connect()`.
 * @returns `{ ok: false }` when a driver could misparse the DSN; otherwise
 *   `{ ok: true, secrets }`. A `file:` or `sqlite:` path, and a DSN with no
 *   scheme, are accepted with no secrets.
 *
 * @example
 * ```ts
 * inspectDsn('postgres://u:p%40ss@h1:5432,h2:5433/db')
 * // { ok: true, secrets: ['p%40ss', 'p@ss'] }
 * inspectDsn('postgres://u:2024/Spring@h/db') // { ok: false }
 * inspectDsn('postgres:u:pw@h/db') // { ok: false }
 * ```
 */
export function inspectDsn(url: string): DsnInspection {
    // R0
    if (hasControlCharacter(url) || url.startsWith(' ')) return REFUSED
    const scheme = SCHEME.exec(url)?.[0]
    // With leading spaces and controls refused, WHATWG cannot find a scheme
    // here either: every client fails to parse it, and none misparses it.
    if (scheme === undefined) return NO_SECRETS
    if (!url.startsWith('//', scheme.length)) {
        return PATH_SCHEMES.has(scheme.slice(0, -1).toLowerCase())
            ? NO_SECRETS
            : REFUSED
    }

    const authorityStart = scheme.length + 2
    const rest = url.slice(authorityStart)
    const authorityEnd = rest.search(/[/?#]/)
    const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd)
    const tail = authorityEnd < 0 ? '' : rest.slice(authorityEnd)

    // R1
    if (tail.includes('@')) return REFUSED

    // R2
    const at = authority.indexOf('@')
    if (at !== authority.lastIndexOf('@')) return REFUSED
    const userinfo = at < 0 ? '' : authority.slice(0, at)
    const hosts = at < 0 ? authority : authority.slice(at + 1)
    if (!USERINFO.test(userinfo)) return REFUSED
    const colon = userinfo.indexOf(':')
    const user = colon < 0 ? userinfo : userinfo.slice(0, colon)
    const password = colon < 0 ? '' : userinfo.slice(colon + 1)
    const decodedUser = decoded(user)
    const decodedPassword = decoded(password)
    if (decodedUser === undefined || decodedPassword === undefined) {
        return REFUSED
    }

    // R3
    const entries = hosts.split(',')
    if (hosts !== '' && !entries.every((entry) => HOST.test(entry))) {
        return REFUSED
    }

    // R4
    const collapsed = url.slice(0, authorityStart) +
        (at < 0 ? '' : `${userinfo}@`) + entries[0] + tail
    if (!URL.canParse(collapsed)) return REFUSED

    // R5 — postgres.js searches for the DECODED list. One that does not
    // decode makes it throw instead, which misparses nothing.
    const list = decoded(hosts)
    if (list !== undefined && list.includes(',')) {
        const first = url.indexOf(list)
        if (first >= 0 && first < authorityStart + at + 1) return REFUSED
    }

    const secrets = [...new Set([password, decodedPassword])]
        .filter((secret) => secret !== '')
    return { ok: true, secrets }
}

/**
 * Percent-decode one part of the authority, or report that it does not decode.
 *
 * `decodeURIComponent` throws `URIError` on a sequence that is not UTF-8
 * (`%C3` alone). That is not a failure to handle: it is the answer — a part a
 * driver would decode differently, or not at all.
 *
 * @param part - A user, password or host list, as written in the DSN.
 * @returns The decoded text, or `undefined` when it does not decode.
 */
function decoded(part: string): string | undefined {
    try {
        return decodeURIComponent(part)
    } catch (error) {
        if (error instanceof URIError) return undefined
        throw error
    }
}

/**
 * Whether a string holds a C0 control character (U+0000–U+001F) or DEL.
 *
 * A loop rather than a regular expression, whose control-character class would
 * need a lint exception.
 *
 * @param text - The DSN.
 * @returns True when any such character is present.
 */
function hasControlCharacter(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        if (code < 0x20 || code === 0x7f) return true
    }
    return false
}
