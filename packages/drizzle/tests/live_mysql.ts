/**
 * @fileoverview The live-mysql harness — whether a suite that needs a REAL
 * MySQL server runs at all, and which server it may touch (#446).
 *
 * The live-mysql suite is destructive: it creates and drops whole databases
 * and runs `db:fresh` inside one. So the two decisions live here once — the
 * gate, and the loopback guard — the shape `live_postgres.ts` set.
 *
 * Not a `.test.ts` file, so `deno test` does not collect it.
 *
 * @module @lockness/drizzle/tests/live_mysql
 */

import mysql from 'mysql2'

/**
 * Whether the live-mysql suite runs at all — the single reader of
 * `LOCKNESS_MYSQL_INTEGRATION`. The root `deno.jsonc` task `test:mysql` and
 * the `live-mysql` CI job set it.
 */
export const LIVE_MYSQL: boolean =
    Deno.env.get('LOCKNESS_MYSQL_INTEGRATION') === '1'

/**
 * Hosts a destructive suite may run against, as mysql2 reports them. mysql2
 * keeps the brackets of an IPv6 host (`[::1]`), a form it cannot connect to,
 * so no IPv6 form is listed.
 */
const LOOPBACK: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost'])

/** The destination fields of mysql2's own parse of a url. */
interface ParsedDestination {
    readonly host: string
    readonly socketPath?: string
}

/**
 * mysql2's `ConnectionConfig` — the parser `createPool(url)` runs. The
 * package exports the constructor at runtime, but its typings declare
 * `ConnectionConfig` as an options interface only, hence the narrow cast.
 */
const ConnectionConfig = (mysql as unknown as {
    ConnectionConfig: new (url: string) => ParsedDestination
}).ConnectionConfig

/**
 * Refuse `url` unless mysql2 would connect to a loopback host.
 *
 * The destination is read from mysql2's own parse, the one the suite connects
 * with: the url text is not enough, because its query string feeds options —
 * `?socketPath=…` replaces the host entirely — and an empty host defaults to
 * `localhost`. A socket path is refused outright: the guard is about which
 * server, and a path names none it can check. Parsing opens no connection.
 * No error quotes the url, which may hold a password; the parser's own error
 * does, so it is replaced, not chained.
 *
 * @param url - The candidate server url.
 * @returns The url.
 * @throws {Error} When it is empty, unparsable, names a socket path or a
 *   non-loopback host.
 *
 * @example
 * ```ts
 * assertMysqlLoopback('mysql://root@127.0.0.1:3306/')
 * ```
 */
export function assertMysqlLoopback(url: string): string {
    if (url === '') throw new Error('LOCKNESS_MYSQL_URL is unset')
    let parsed: ParsedDestination
    try {
        parsed = new ConnectionConfig(url)
    } catch {
        throw new Error('LOCKNESS_MYSQL_URL is not a url')
    }
    if (parsed.socketPath !== undefined || !LOOPBACK.has(parsed.host)) {
        throw new Error('LOCKNESS_MYSQL_URL must name a loopback host only')
    }
    return url
}

/**
 * The server url, refused unless the host it names is loopback.
 *
 * @returns The url.
 * @throws {Error} When it is unset, unparsable or not loopback.
 *
 * @example
 * ```ts
 * const admin = await mysql.createConnection(liveMysqlUrl())
 * ```
 */
export function liveMysqlUrl(): string {
    return assertMysqlLoopback(Deno.env.get('LOCKNESS_MYSQL_URL') ?? '')
}
