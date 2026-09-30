/**
 * @fileoverview The DSN check `Database.connect()` runs before any driver
 * factory sees a DSN (#425). Internal: not exported from the package.
 *
 * **Why a check, and why this grammar.** A driver that cannot tell where a
 * password ends does not throw — it rewrites the DSN. postgres.js reads a comma
 * as a host separator, and every client reads the first `/`, `?` or `#` as the
 * end of the authority. So `postgres://u:2024/Spring@h/db` is accepted as host
 * `u`, port `2024`, database `Spring@h/db`. Password fragments then become host
 * names looked up in cleartext DNS, and appear in errors in a rewritten form no
 * exact-DSN redaction can match. The only sound fix is to refuse a DSN whose
 * password boundary is ambiguous, before a driver parses it.
 *
 * WHATWG `new URL()` alone is the wrong grammar for that: it rejects the ported
 * multi-host form (`h1:5432,h2:5433`) that postgres.js supports, and it accepts
 * `u:2024/Spring@h`. The rules below are RFC 3986's userinfo and host grammar,
 * extended with a comma-separated host list, with WHATWG kept as a final
 * well-formedness check.
 *
 * **Only a URL-shaped DSN is checked** (one containing `://`). A bare SQLite
 * path such as `file:local.db` has no userinfo to misparse.
 *
 * @module @lockness/drizzle/dsn
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
 * port. A percent-encoded unix-socket path is a registered name.
 */
const HOST =
    /^(?:\[[0-9A-Fa-f:.]+\]|(?:[A-Za-z0-9\-._~!$&'()*+;=]|%[0-9A-Fa-f]{2})*)(?::[0-9]{0,5})?$/

/**
 * Decide whether a DSN is unambiguous, and collect its password if so.
 *
 * For a URL-shaped DSN, the authority is the text after `://` up to the first
 * `/`, `?` or `#`; the tail is the rest. It is accepted only when:
 *
 * - **R1** the tail holds no raw `@` — so no `@` a driver could take as the end
 *   of the userinfo hides after a `/`, `?` or `#` in the password;
 * - **R2** the authority holds at most one `@`, the userinfo matches the RFC 3986
 *   userinfo grammar, and its user and password each percent-decode;
 * - **R3** the host part is empty or a comma-separated list of `[IPv6]` or
 *   registered-name entries, each with an optional numeric port;
 * - **R4** WHATWG `new URL()` accepts the DSN with its host list collapsed to
 *   the first entry.
 *
 * @param url - The DSN passed to `Database.connect()`.
 * @returns `{ ok: false }` when a driver could misparse the DSN; otherwise
 *   `{ ok: true, secrets }`. A DSN that is not URL-shaped is accepted with no
 *   secrets.
 *
 * @example
 * ```ts
 * inspectDsn('postgres://u:p%40ss@h1:5432,h2:5433/db')
 * // { ok: true, secrets: ['p%40ss', 'p@ss'] }
 * inspectDsn('postgres://u:2024/Spring@h/db') // { ok: false }
 * ```
 */
export function inspectDsn(url: string): DsnInspection {
    const schemeEnd = url.indexOf('://')
    if (schemeEnd < 0) return { ok: true, secrets: [] }

    const rest = url.slice(schemeEnd + 3)
    const authorityEnd = rest.search(/[/?#]/)
    const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd)
    const tail = authorityEnd < 0 ? '' : rest.slice(authorityEnd)

    // R1
    if (tail.includes('@')) return { ok: false }

    // R2
    const at = authority.indexOf('@')
    if (at !== authority.lastIndexOf('@')) return { ok: false }
    const userinfo = at < 0 ? '' : authority.slice(0, at)
    const hosts = at < 0 ? authority : authority.slice(at + 1)
    if (!USERINFO.test(userinfo)) return { ok: false }
    const colon = userinfo.indexOf(':')
    const user = colon < 0 ? userinfo : userinfo.slice(0, colon)
    const password = colon < 0 ? '' : userinfo.slice(colon + 1)
    const decodedUser = decoded(user)
    const decodedPassword = decoded(password)
    if (decodedUser === undefined || decodedPassword === undefined) {
        return { ok: false }
    }

    // R3
    const entries = hosts.split(',')
    if (hosts !== '' && !entries.every((entry) => HOST.test(entry))) {
        return { ok: false }
    }

    // R4
    const collapsed = url.slice(0, schemeEnd + 3) +
        (at < 0 ? '' : `${userinfo}@`) + entries[0] + tail
    if (!URL.canParse(collapsed)) return { ok: false }

    const secrets = [...new Set([password, decodedPassword])]
        .filter((secret) => secret !== '')
    return { ok: true, secrets }
}

/**
 * Percent-decode one userinfo part, or report that it does not decode.
 *
 * `decodeURIComponent` throws `URIError` on a sequence that is not UTF-8
 * (`%C3` alone). That is not a failure to handle: it is the answer — a part a
 * driver would decode differently, or not at all.
 *
 * @param part - A user or password, as written in the DSN.
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
