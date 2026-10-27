/**
 * Throttling contracts for the `@Throttle` decorator family.
 *
 * This module holds only types and the pure `parseTimeWindow` helper. The
 * middleware that turns a {@link ThrottleConfig} into a running rate limiter
 * lives in `@lockness/core`, so this package keeps its rule of importing no
 * runtime dependency.
 *
 * @module
 */

import type { Context } from 'hono'

/**
 * A rate-limit window, expressed either as raw milliseconds or as a shorthand
 * string with a unit suffix.
 *
 * @example
 * ```ts
 * const a: TimeWindow = '30s'
 * const b: TimeWindow = '15m'
 * const c: TimeWindow = 60_000
 * ```
 */
export type TimeWindow =
    | number
    | `${number}s`
    | `${number}m`
    | `${number}h`
    | `${number}d`

/**
 * How a client is identified for the purpose of counting requests.
 *
 * - `'ip'` — the connecting address (default).
 * - `'user'` — the authenticated user id, falling back to the address when the
 *   request is anonymous, so an unauthenticated flood cannot share one bucket.
 * - `` `header:${string}` `` — the value of a named request header, for API keys.
 * - a function — anything the application can derive from the context.
 */
export type ThrottleKey =
    | 'ip'
    | 'user'
    | `header:${string}`
    | ((c: Context) => string | Promise<string>)

/**
 * A pluggable counter backend. Structurally compatible with
 * `hono-rate-limiter`'s `Store`, so a Redis-backed implementation can be
 * supplied without this package depending on it.
 */
export interface ThrottleStoreContract {
    /** Record one hit and return the running total plus its reset time. */
    increment(
        key: string,
    ): Promise<{ totalHits: number; resetTime?: Date }> | {
        totalHits: number
        resetTime?: Date
    }
    /** Undo one hit, used when a request is not counted after the fact. */
    decrement(key: string): Promise<void> | void
    /** Forget one client entirely. */
    resetKey(key: string): Promise<void> | void
}

/**
 * Optional behaviour for {@link ThrottleConfig}.
 */
export interface ThrottleOptions {
    /** How to identify a client. Defaults to `'ip'`. */
    by?: ThrottleKey
    /** Return `true` to let a request through without counting it. */
    skip?: (c: Context) => boolean | Promise<boolean>
    /** Body of the 429 response. */
    message?: string
    /** Status returned when the limit is exceeded. Defaults to `429`. */
    statusCode?: number
    /** Emit `RateLimit-*` response headers. Defaults to `true`. */
    headers?: boolean
    /** Counter backend. Defaults to the in-memory store. */
    store?: ThrottleStoreContract
}

/**
 * A resolved throttle rule: how many requests, over what window, keyed how.
 */
export interface ThrottleConfig {
    /** Maximum number of requests permitted within the window. */
    limit: number
    /** Length of the window. */
    window: TimeWindow
    /** Optional behaviour. */
    options?: ThrottleOptions
}

/** Milliseconds per shorthand unit. */
const UNIT_MS = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
} as const

const SHORTHAND = /^(\d+(?:\.\d+)?)([smhd])$/

/**
 * Convert a {@link TimeWindow} to milliseconds.
 *
 * A number passes through unchanged and is treated as milliseconds. A string
 * must be a positive quantity followed by one of `s`, `m`, `h` or `d`.
 *
 * @param window - The window to convert.
 * @returns The window in milliseconds.
 * @throws {TypeError} If the value is not a finite positive number, or is a
 * string that does not match the shorthand grammar. Failing loudly matters
 * here: a silently defaulted window would under-protect the route it guards.
 *
 * @example
 * ```ts
 * parseTimeWindow('30s') // 30_000
 * parseTimeWindow('15m') // 900_000
 * parseTimeWindow(500)   // 500
 * ```
 */
export function parseTimeWindow(window: TimeWindow): number {
    if (typeof window === 'number') {
        if (!Number.isFinite(window) || window <= 0) {
            throw new TypeError(
                `Throttle window must be a finite positive number of milliseconds, received ${window}.`,
            )
        }
        return window
    }

    const match = SHORTHAND.exec(window)
    if (!match) {
        throw new TypeError(
            `Throttle window "${window}" is not valid. Use milliseconds, or a quantity followed by s, m, h or d — for example '30s' or '15m'.`,
        )
    }

    const quantity = Number(match[1])
    if (quantity <= 0) {
        throw new TypeError(
            `Throttle window "${window}" must be greater than zero.`,
        )
    }

    return quantity * UNIT_MS[match[2] as keyof typeof UNIT_MS]
}
