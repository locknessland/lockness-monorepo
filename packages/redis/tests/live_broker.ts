/**
 * @fileoverview The live-broker test harness — everything about talking to a
 * REAL Redis that is not specific to any one consumer package (#273).
 *
 * This module is the **single home** for six decisions (see
 * `.specnaut/specs/243-live-redis-integration/plan.md` §5): whether an
 * integration suite runs at all, where its connection settings come from, what
 * its preflight refuses, the key/topic namespace one run owns, what cleaning up
 * after a run means, and how a test waits for an asynchronous outcome.
 *
 * It lives in `@lockness/redis` rather than beside the suite that first needed
 * it because `packages/session/deno.json` and `packages/queue/deno.json` both
 * declare `@lockness/redis` and **neither declares `@lockness/realtime`** — a
 * `LOCKNESS_REDIS_*` contract homed in realtime's tests is one the next
 * consumer cannot import, and would therefore copy.
 *
 * Not a `.test.ts` file, so `deno test` does not collect it — the same
 * arrangement as `fake_server.ts` and `lua_eval.ts` beside it.
 *
 * @module @lockness/redis/tests/live_broker
 */

import { RedisClient, type RedisClientConfig } from '../mod.ts'
import type { RespReply } from '../resp.ts'

/**
 * Whether the live-broker suites run at all — the **single home** for that
 * decision. No other file may read `LOCKNESS_REDIS_INTEGRATION`; a second
 * reader is a second decider, and the two drift.
 *
 * The one sanctioned second occurrence of the literal is the root `deno.jsonc`
 * task, which *sets* the variable rather than reading it.
 */
export const LIVE_BROKER: boolean =
    Deno.env.get('LOCKNESS_REDIS_INTEGRATION') === '1'

/** The minimum server the realtime driver's `EXPIRE` option flags require. */
export const MIN_REDIS_MAJOR = 7

/** Loopback hosts, for which a plaintext password is not a network exposure. */
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '[::1]'])

/**
 * Resolve the broker connection settings from the environment — the **single
 * home** for that decision.
 *
 * Names are broker-scoped rather than realtime-scoped on purpose: a later suite
 * in `@lockness/session` or `@lockness/queue` reuses this contract rather than
 * inventing a second spelling of it.
 *
 * @returns The resolved connection config for this run.
 * @example
 * ```typescript
 * const config = brokerConfig()
 * const client = new RedisClient(config)
 * ```
 */
export function brokerConfig(): RedisClientConfig {
    // `?? '6379'` alone is not enough: an env var set to the empty string is
    // present, and `Number('')` is 0 — a silently wrong port, not a default.
    const port = Number(Deno.env.get('LOCKNESS_REDIS_PORT') || '6379')
    const db = Number(Deno.env.get('LOCKNESS_REDIS_DB') || '0')
    return {
        hostname: Deno.env.get('LOCKNESS_REDIS_HOST') ?? '127.0.0.1',
        port: Number.isFinite(port) ? port : 6379,
        password: Deno.env.get('LOCKNESS_REDIS_PASSWORD'),
        db: Number.isFinite(db) ? db : 0,
        // Accept the spellings an operator actually types. Reading only '1'
        // here would turn `LOCKNESS_REDIS_TLS=true` into silent plaintext —
        // the one misreading whose failure direction sends a password in the
        // clear.
        tls: ['1', 'true', 'yes', 'on'].includes(
            (Deno.env.get('LOCKNESS_REDIS_TLS') ?? '').toLowerCase(),
        ),
    }
}

/**
 * Everything the preflight refuses, in one place.
 *
 * Three refusals, each with its own message so a maintainer learns which of the
 * three went wrong from the failure alone:
 *
 * 1. **Unreachable** — names the host and port it tried, and *nothing else from
 *    the resolved config*. The config carries the password; it is never
 *    stringified into a message, and never interpolated into an assertion.
 * 2. **Below Redis 7.0** — the driver's `EXPIRE … NX` / `EXPIRE … GT` flags do
 *    not exist before 7.0, so a 6.x broker fails obscurely somewhere downstream
 *    instead of here.
 * 3. **A password aimed at a remote broker with TLS off** — refused rather than
 *    warned. `AuthenticatedConnection` already raises a one-time cleartext-AUTH
 *    warning, but a warning on a loopback run is noise an operator learns to
 *    skim.
 *
 * It never degrades to a skip. A gated suite that skips silently when the gate
 * is ON is how "we have live coverage" becomes untrue while every check stays
 * green — the exact history that produced #273.
 *
 * @param config - The resolved connection config to check.
 * @returns The server's reported version string.
 * @throws {Error} On any of the three refusals above.
 */
export async function preflight(config: RedisClientConfig): Promise<string> {
    const where = `${config.hostname}:${config.port ?? 6379}`

    if (config.password && !config.tls && !LOOPBACK.has(config.hostname)) {
        throw new Error(
            `[live-broker] refusing to send AUTH in cleartext to ${where}: ` +
                'LOCKNESS_REDIS_PASSWORD is set, LOCKNESS_REDIS_TLS is not, ' +
                'and the host is not loopback. Set LOCKNESS_REDIS_TLS=1.',
        )
    }

    const client = new RedisClient(config)
    let info: RespReply
    try {
        info = await client.command('INFO', 'server')
    } catch (error) {
        await client.close().catch((closeError) =>
            console.warn(
                `[live-broker] failed to close the preflight socket to ` +
                    `${where}: ${closeError}`,
            )
        )
        // Named by host and port only. `config` holds the password, so it is
        // never interpolated — see the module doc's refusal 1.
        throw new Error(
            `[live-broker] no Redis answered at ${where}. The integration ` +
                'gate is ON, so this is a failure, not a skip. Cause: ' +
                (error instanceof Error ? error.message : String(error)),
        )
    }

    try {
        const text = info.type === 'bulk' ? info.value : ''
        const version = /redis_version:([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(text)
        if (!version) {
            throw new Error(
                `[live-broker] could not read redis_version from ${where}.`,
            )
        }
        if (Number(version[1]) < MIN_REDIS_MAJOR) {
            throw new Error(
                `[live-broker] ${where} reports Redis ` +
                    `${version[1]}.${version[2]}.${version[3]}, but the ` +
                    `realtime driver needs ${MIN_REDIS_MAJOR}.0 or newer — ` +
                    "its EXPIRE 'NX' / 'GT' option flags do not exist before " +
                    '7.0 and fail silently as no-ops.',
            )
        }
        return `${version[1]}.${version[2]}.${version[3]}`
    } finally {
        await client.close()
    }
}

/**
 * Mint the namespace one run owns — the **single home** for that decision.
 *
 * The random half is drawn over a fixed `[a-z0-9]` alphabet so the namespace
 * can contain no Redis glob metacharacter (`*` `?` `[` `]` `\`). That matters
 * twice over: the namespace is used verbatim as a `SCAN … MATCH` pattern by
 * {@link teardown} **and** as a `PSUBSCRIBE` pattern by any consumer that
 * subscribes, so a metacharacter would widen a destructive delete and a
 * subscription at the same time.
 *
 * @returns A namespace matching `/^lockness-it:[a-z0-9]+$/`.
 * @example
 * ```typescript
 * const ns = runNamespace() // "lockness-it:k3f9qz1m"
 * ```
 */
export function runNamespace(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    let suffix = ''
    for (const byte of bytes) suffix += alphabet[byte % alphabet.length]
    return `lockness-it:${suffix}`
}

/**
 * Delete every key under `namespace`, and nothing else — the **single home**
 * for what cleaning up after a run means.
 *
 * Discovery is `SCAN … MATCH`, never `KEYS`: `KEYS` blocks the server, and this
 * suite may run against a broker carrying somebody else's working set. There is
 * deliberately no `FLUSHDB`/`FLUSHALL` path — a test that can wipe a
 * developer's broker is a test nobody runs twice.
 *
 * Call this from a `finally`. The run it most needs to clean up after is the
 * failing one, and that is the run whose remaining statements do not execute.
 *
 * @param client - A client to issue the scan and deletes on.
 * @param namespace - The run namespace whose keys are removed.
 * @returns How many keys were deleted.
 */
export async function teardown(
    client: RedisClient,
    namespace: string,
): Promise<number> {
    let cursor = '0'
    let deleted = 0
    do {
        const reply = await client.command(
            'SCAN',
            cursor,
            'MATCH',
            `${namespace}*`,
            'COUNT',
            '500',
        )
        if (reply.type !== 'array' || reply.value.length !== 2) break
        const next = reply.value[0]
        cursor = next.type === 'bulk' ? next.value : '0'
        const batch = reply.value[1]
        if (batch.type !== 'array') continue
        const keys = batch.value
            .map((k) => (k.type === 'bulk' ? k.value : undefined))
            .filter((k): k is string => k !== undefined)
        if (keys.length > 0) {
            await client.command('DEL', ...keys)
            deleted += keys.length
        }
    } while (cursor !== '0')
    return deleted
}

/**
 * Poll `cond` until it holds or the deadline passes — the **single home** for
 * waiting on an asynchronous outcome.
 *
 * Never a fixed `setTimeout`: pub/sub delivery has no bounded latency, so a
 * fixed sleep is either flaky or slow, and usually both.
 *
 * The predicate may be async, because the most useful condition in an
 * integration suite is "what does the broker say now" — a round-trip. A sync-only
 * `waitFor` pushes callers into swallowing the timeout and re-asserting
 * afterwards, which turns a loud failure into a silent one.
 *
 * @param cond - The condition to poll; may return a promise.
 * @param message - What the caller was waiting for, used in the timeout error.
 * @param timeoutMs - How long to wait before failing.
 * @throws {Error} When the deadline passes with `cond` still false.
 */
export async function waitFor(
    cond: () => boolean | Promise<boolean>,
    message: string,
    timeoutMs = 5000,
): Promise<void> {
    const start = Date.now()
    while (!(await cond())) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`[live-broker] waitFor timed out: ${message}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}
