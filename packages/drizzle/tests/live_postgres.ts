/**
 * @fileoverview The live-postgres harness — whether a suite that needs a REAL
 * server runs at all, and which server it may touch (#435, #444).
 *
 * Every live-postgres suite is destructive: it drops schemas, or creates and
 * drops whole databases. So the two decisions live here once — the gate, and
 * the loopback guard — and each suite imports them rather than carrying a copy
 * that drifts. The precedent is `packages/redis/tests/live_broker.ts`.
 *
 * **Consumers outside this package** — a change here changes them too:
 * `scripts/kit_migrations_live_test.ts`, `scripts/kit_token_flow_live_test.ts`
 * and `scripts/remember_me_live_test.ts` import it by relative path. This
 * package's `AGENTS.md` names them as well (#450).
 *
 * Not a `.test.ts` file, so `deno test` does not collect it.
 *
 * @module @lockness/drizzle/tests/live_postgres
 */

import postgres from 'postgres'

/**
 * Whether the live-postgres suites run at all — the single reader of
 * `LOCKNESS_POSTGRES_INTEGRATION`. The root `deno.jsonc` task `test:postgres`
 * and the `live-postgres` CI job set it.
 */
export const LIVE_POSTGRES: boolean =
    Deno.env.get('LOCKNESS_POSTGRES_INTEGRATION') === '1'

/**
 * Hosts a destructive suite may run against. postgres.js parses a bracketed
 * IPv6 host (`[::1]`) to `[`, so only the forms it can connect to are listed.
 */
const LOOPBACK: ReadonlySet<string> = new Set([
    '127.0.0.1',
    'localhost',
    '::1',
])

/**
 * Refuse `url` unless EVERY host postgres.js would try is a loopback host.
 *
 * The url text is not enough: postgres.js takes a host list —
 * `u@evil.example,x@127.0.0.1` is two hosts, the first one remote — and an
 * empty host falls back to `PGHOST`. So the hosts are read from postgres.js's
 * own parse, the one the suite connects with. The client is built to be
 * parsed only and never connects. No error quotes the url, which may hold a
 * password; the parser's own error does, so it is replaced, not chained.
 *
 * @param url - The candidate server url.
 * @returns The url.
 * @throws {Error} When it is empty, unparsable or names a non-loopback host.
 *
 * @example
 * ```ts
 * await assertLoopback('postgres://postgres@127.0.0.1:5432/postgres')
 * ```
 */
export async function assertLoopback(url: string): Promise<string> {
    if (url === '') throw new Error('LOCKNESS_POSTGRES_URL is unset')
    let hosts: readonly string[]
    try {
        const parsed = postgres(url, { max: 1 })
        hosts = parsed.options.host
        await parsed.end()
    } catch {
        throw new Error('LOCKNESS_POSTGRES_URL is not a url')
    }
    if (hosts.length === 0 || !hosts.every((host) => LOOPBACK.has(host))) {
        throw new Error('LOCKNESS_POSTGRES_URL must name loopback hosts only')
    }
    return url
}

/**
 * The server url, refused unless every host it names is loopback.
 *
 * @returns The url.
 * @throws {Error} When it is unset, unparsable or not loopback.
 *
 * @example
 * ```ts
 * const sql = postgres(await liveUrl(), { max: 1 })
 * ```
 */
export function liveUrl(): Promise<string> {
    return assertLoopback(Deno.env.get('LOCKNESS_POSTGRES_URL') ?? '')
}
