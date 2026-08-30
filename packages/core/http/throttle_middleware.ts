/**
 * @fileoverview Turns a `@Throttle` declaration into a running rate limiter.
 *
 * The decorator (in `@lockness/contract`) only records intent. This module is
 * where that intent becomes a Hono middleware, backed by `hono-rate-limiter`
 * re-exported through `@lockness/hono`.
 *
 * @module
 */

import type { Context, MiddlewareHandler } from 'hono'
import {
    parseTimeWindow,
    type ThrottleConfig,
    type ThrottleKey,
} from '@lockness/contract'
import { rateLimiter } from '@lockness/hono'

/**
 * The status-code union `rateLimiter` accepts, derived from the function
 * itself. Hono does not expose it through any mapped subpath, and adding a
 * mapping just to name a type would widen this package's surface for nothing.
 */
type LimiterStatusCode = NonNullable<
    Parameters<typeof rateLimiter>[0]['statusCode']
>

/**
 * Headers a reverse proxy uses to carry the originating address, most
 * specific first.
 *
 * These are trusted as given. Behind a proxy that does not strip inbound
 * copies, a client can forge them — which is a deployment concern, not one the
 * framework can settle: with no proxy there is no header to read, and with a
 * correctly configured one the value is authoritative.
 */
const FORWARDED_HEADERS = [
    'cf-connecting-ip',
    'x-real-ip',
    'x-forwarded-for',
] as const

/**
 * Best-effort client address.
 *
 * `x-forwarded-for` is a comma-separated chain; the first entry is the client.
 *
 * @param c - The request context.
 * @returns The address, or `'unknown'` when none is present.
 */
function clientAddress(c: Context): string {
    for (const header of FORWARDED_HEADERS) {
        const value = c.req.header(header)
        if (value) return value.split(',')[0].trim()
    }
    return 'unknown'
}

/**
 * Build the function that turns a request into a counter key.
 *
 * @param by - The identification strategy from the decorator.
 * @returns A key generator suitable for `rateLimiter`.
 * @throws {TypeError} If `by` is a string that is neither `'ip'`, `'user'`,
 * nor `header:<name>`.
 */
function keyGeneratorFor(
    by: ThrottleKey = 'ip',
): (c: Context) => string | Promise<string> {
    if (typeof by === 'function') return by

    if (by === 'ip') return (c) => `ip:${clientAddress(c)}`

    if (by === 'user') {
        // Read the auth context structurally. `@lockness/core` must not depend
        // on `@lockness/auth`, and throttling has to work with auth absent.
        return (c) => {
            const auth = (c.get as (k: string) => unknown)('auth') as
                | { user?: { id?: unknown } }
                | undefined
            const id = auth?.user?.id
            if (id !== undefined && id !== null) return `user:${String(id)}`
            // Anonymous requests fall back to the address, under a distinct
            // prefix — otherwise one unauthenticated flood would share a bucket
            // with every other anonymous caller and lock them all out together.
            return `anon:${clientAddress(c)}`
        }
    }

    if (by.startsWith('header:')) {
        const name = by.slice('header:'.length)
        if (!name) {
            throw new TypeError(
                "@Throttle option `by: 'header:'` needs a header name, for example 'header:X-Api-Key'.",
            )
        }
        return (c) => {
            const value = c.req.header(name)
            return value ? `${name}:${value}` : `noheader:${clientAddress(c)}`
        }
    }

    throw new TypeError(
        `@Throttle option \`by\` must be 'ip', 'user', 'header:<name>' or a function, received "${by}".`,
    )
}

/**
 * Create the middleware enforcing one throttle rule.
 *
 * @param config - The rule recorded by the `@Throttle` decorator.
 * @returns A Hono middleware handler.
 * @throws {TypeError} If the window or the `by` strategy is malformed. This
 * happens while routes are being registered, so a bad rule fails at boot
 * rather than silently leaving an endpoint unprotected.
 *
 * @example
 * ```ts
 * const mw = throttleDecoratorMiddleware({ limit: 5, window: '1m' })
 * ```
 */
export function throttleDecoratorMiddleware(
    config: ThrottleConfig,
): MiddlewareHandler {
    const { limit, window, options = {} } = config

    return rateLimiter({
        windowMs: parseTimeWindow(window),
        limit,
        standardHeaders: options.headers === false ? false : 'draft-7',
        keyGenerator: keyGeneratorFor(options.by),
        ...(options.message !== undefined ? { message: options.message } : {}),
        // `statusCode` is a plain number on the public contract so callers are
        // not forced to import Hono's union; the library wants that union.
        ...(options.statusCode !== undefined
            ? { statusCode: options.statusCode as LimiterStatusCode }
            : {}),
        ...(options.skip !== undefined ? { skip: options.skip } : {}),
        ...(options.store !== undefined
            ? { store: options.store as never }
            : {}),
    })
}
