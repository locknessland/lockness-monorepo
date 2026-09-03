/**
 * @fileoverview The devtools gate — two decisions, both fail closed.
 *
 * The debug bar and its data collection are a dev-only surface that exposes
 * session contents, events, and request data. They must activate **only on an
 * explicit development signal**, never by default: a production deployment that
 * merely forgot to set an env var, or a `deno compile` binary running without
 * `--allow-env`, must NOT get the bar (both resolve the environment name to
 * `'development'` by default, so a plain `isDevelopment()` check fails open).
 *
 * Two distinct questions live here (see plan §5): {@link devtoolsActive} answers
 * *may devtools run at all*, and {@link authorizeDevtools} answers *may this
 * caller reach the collector* — the single authorization decider. The call
 * sites (`mod.ts`) *ask*; they never *decide*.
 *
 * @module @lockness/devtools/gate
 */

import { isExplicitlyDevelopment } from '@lockness/contract'
import { getConnInfo } from '@lockness/hono'
import type { Context } from '@lockness/hono'
import { collector } from './collector.ts'
import type { DevtoolsConfig } from './types.ts'

/**
 * Whether devtools may mount and collect.
 *
 * `true` only when the environment is **explicitly** development
 * (`DENO_ENV`/`APP_ENV === 'development'`) or the operator opts in with
 * `LOCKNESS_DEVTOOLS=1`. Ambiguous, unset, production, and no-`--allow-env`
 * states all resolve to `false` (fail closed). Never throws.
 *
 * @returns `true` when devtools is allowed to be active.
 *
 * @example
 * ```typescript
 * if (!devtoolsActive()) return // do not mount / do not collect
 * ```
 */
export function devtoolsActive(): boolean {
    if (isExplicitlyDevelopment()) return true
    try {
        return Deno.env.get('LOCKNESS_DEVTOOLS') === '1'
    } catch {
        return false
    }
}

/**
 * Header names whose presence means a hop sits between peer and client. When any
 * is set, the peer address is the proxy's, not the caller's, so loopback trust is
 * revoked (FR-011). The list spans the standard headers plus the proprietary
 * client-IP headers common proxies/CDNs emit — a same-host proxy that forwards
 * only its own header (and not `X-Forwarded-For`) must still revoke trust.
 */
const FORWARDING_HEADERS = [
    'x-forwarded-for',
    'forwarded',
    'x-real-ip',
    'x-forwarded',
    'x-original-forwarded-for',
    'x-cluster-client-ip',
    'x-client-ip',
    'cf-connecting-ip',
    'true-client-ip',
    'fastly-client-ip',
    'fly-client-ip',
] as const

/** Host header hostnames considered local (DNS-rebinding allowlist). */
const LOCALHOST_HOSTNAMES = ['localhost', '127.0.0.1', '::1', '[::1]'] as const

/**
 * Constant-time equality for two UTF-8 strings.
 *
 * Compares with no early exit, folding a length mismatch into the accumulator, so
 * the running time does not reveal how many leading characters matched (FR-006) —
 * the timing oracle a naive `===` on the token would open. The loop iterates over
 * the **configured token's** length `b`, a fixed server-side constant, so neither
 * the iteration count nor the timing depends on the attacker-controlled input `a`
 * (which would otherwise leak the token length, and let a long guess inflate work).
 *
 * @param a - First string, the presented (attacker-controlled) credential.
 * @param b - Second string, the configured token (fixed length).
 * @returns `true` iff the two strings are byte-for-byte equal.
 */
function constantTimeEqual(a: string, b: string): boolean {
    const enc = new TextEncoder()
    const ab = enc.encode(a)
    const bb = enc.encode(b)
    let diff = ab.length ^ bb.length
    for (let i = 0; i < bb.length; i++) {
        diff |= (i < ab.length ? ab[i] : 0) ^ bb[i]
    }
    return diff === 0
}

/**
 * Resolve the devtools token once: explicit config wins, else the env var.
 *
 * The env read is guarded — a missing `--allow-env` denies the *read*, not the
 * request, so the caller falls through to the loopback default rather than being
 * hard-denied.
 */
function resolveToken(cfg: DevtoolsConfig): string | undefined {
    if (cfg.token) return cfg.token
    try {
        return Deno.env.get('LOCKNESS_DEVTOOLS_TOKEN') || undefined
    } catch {
        return undefined
    }
}

/** Whether an address string is an IPv4/IPv6 loopback address. */
function isLoopbackAddress(address: string): boolean {
    if (address === '::1') return true
    if (address.startsWith('127.')) return true // 127.0.0.0/8
    if (address.startsWith('::ffff:127.')) return true // IPv4-mapped IPv6
    return false
}

/** Whether the request's host hostname is in the localhost allowlist. */
function hasLocalhostHost(c: Context): boolean {
    // Prefer the `Host` header (the DNS-rebinding vector); fall back to the URL
    // authority when it is absent (e.g. a synthetic relative-path request).
    let host = c.req.header('host')
    if (!host) {
        try {
            host = new URL(c.req.url).host
        } catch {
            return false // unparseable => cannot vouch => deny
        }
    }
    if (!host) return false
    const hostname = host.replace(/:\d+$/, '').toLowerCase()
    return (LOCALHOST_HOSTNAMES as readonly string[]).includes(hostname)
}

/**
 * The default posture: trust a loopback peer, hardened per FR-011.
 *
 * A forwarding header revokes the trust (the peer is a proxy, not the client),
 * and the `Host` must be allowlisted (DNS-rebinding). The peer address is read
 * via `getConnInfo`, which **throws** when the peer is undetectable (a synthetic
 * `app.request()` with no conn-info env, or a non-Deno runtime); that throw
 * propagates to {@link authorizeDevtools}'s catch and denies (fail closed, R5).
 */
function isTrustedLoopback(c: Context): boolean {
    if (FORWARDING_HEADERS.some((h) => c.req.header(h) !== undefined)) {
        return false
    }
    if (!hasLocalhostHost(c)) return false
    const { remote } = getConnInfo(c)
    return remote.address !== undefined && isLoopbackAddress(remote.address)
}

/** Whether the request carries a Bearer credential matching `token`. */
function hasMatchingBearer(c: Context, token: string): boolean {
    const header = c.req.header('authorization') ?? ''
    const prefix = 'Bearer '
    if (!header.startsWith(prefix)) return false
    return constantTimeEqual(header.slice(prefix.length), token)
}

/**
 * Whether **this caller** may reach the gated devtools routes — the single
 * authorization decider (plan §5 Row 2).
 *
 * Composes the three mechanisms in a fixed precedence (FR-009):
 * 1. **`authorize`** — if configured, it is *the* decider; its boolean result
 *    (awaited) settles the request and supersedes the token and the default.
 * 2. **`token`** — else, if a token is configured (via `cfg.token` or the
 *    `LOCKNESS_DEVTOOLS_TOKEN` env var), a constant-time-matching
 *    `Authorization: Bearer <token>` is required from any host.
 * 3. **default posture** — else, a loopback peer is trusted, hardened by
 *    FR-011 (a forwarding header revokes trust; the `Host` must be allowlisted).
 *
 * Fails **closed** (FR-005/FR-010): the `authorize` call and the `getConnInfo`
 * read are wrapped in a `try/catch` that denies **and** logs at WARN via the
 * collector — an undetectable peer, an internal error, or a throwing/rejecting
 * callback all yield `false`, never access. Does not touch {@link devtoolsActive}.
 *
 * @param c - The Hono request context for the incoming devtools request.
 * @param cfg - The resolved devtools configuration (token / authorize).
 * @returns A promise resolving to `true` to allow, `false` to deny.
 *
 * @example
 * ```typescript
 * app.use('/_devtools', async (c, next) => {
 *   if (!(await authorizeDevtools(c, cfg))) return c.body(null, 401)
 *   return next()
 * })
 * ```
 */
export async function authorizeDevtools(
    c: Context,
    cfg: DevtoolsConfig,
): Promise<boolean> {
    try {
        if (cfg.authorize) {
            return (await cfg.authorize(c)) === true
        }
        const token = resolveToken(cfg)
        if (token) {
            return hasMatchingBearer(c, token)
        }
        return isTrustedLoopback(c)
    } catch (error) {
        // Fail closed and record why — never a silent catch (constitution).
        collector.addLog({
            timestamp: Date.now(),
            level: 'warn',
            message: 'devtools authorization check failed; denying request',
            context: {
                error: error instanceof Error ? error.message : String(error),
            },
        })
        return false
    }
}
