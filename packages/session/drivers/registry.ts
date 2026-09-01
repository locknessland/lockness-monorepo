/**
 * @fileoverview Process-wide memo for session drivers.
 *
 * A session driver used to be constructed on every request
 * (`middleware.ts` → `createDriver`), so `deno-kv` and `redis` leaked an OS
 * handle per request and `memory` never persisted a session past one request
 * (its store is instance state). This module memoizes the driver **per process,
 * keyed on the resolved config**, so one handle serves the process and the
 * memory store survives across requests. See #138.
 *
 * **Two drivers are deliberately NOT memoized, each a first-class branch here:**
 *
 * - `cookie` closes over the request `Context` and holds no OS resource, so it
 *   is built fresh per request.
 * - `redis` is per-request **while gated**. Sharing one Redis socket across
 *   requests is unsafe until its reply reader drains a full frame and its
 *   commands are serialized ({@link https://github.com/locknessland/lockness-monorepo/issues/145 | #145}).
 *   The gate lives here, not as an emergent "everything not cookie is memoized"
 *   else-branch — that shape would let redis slip into the memo unnoticed.
 *
 * The per-request/per-process split has **one** home: this file. `middleware.ts`
 * calls {@link getOrCreateDriver} and never re-decides it.
 *
 * @module @lockness/session/drivers/registry
 */

import type { Context } from 'hono'
import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'
import type { SessionConfig, SessionDriver } from '../types.ts'
import { createDriver } from './mod.ts'

/** One driver instance per resolved-config key, for the life of the process. */
const memo = new Map<string, SessionDriver>()

/** The registry's own shutdown hook, registered once, lazily. */
let registryHandle: DisposableHandle | undefined

/** The driver names that are memoized (per process). Cookie and redis are not. */
const MEMOIZED = new Set<SessionConfig['driver']>(['memory', 'deno-kv'])

/**
 * Get the session driver for a resolved config, constructing it once per
 * process for the memoized backends and per request for the others.
 *
 * The `config` MUST be the per-request **resolved** config
 * (`{ ...getSessionConfig(), ...override }`) — memoizing the *unresolved* config
 * is the #137 defect. The `Context` is used only to build the per-request
 * `cookie` driver; the memoized branches ignore it.
 *
 * @param c - The request context (used only by the per-request cookie branch).
 * @param config - The resolved session configuration.
 * @returns The driver serving this config — memoized for `memory` / `deno-kv`,
 *   fresh for `cookie` / `redis`.
 * @example
 * ```typescript
 * const driver = getOrCreateDriver(c, { ...getSessionConfig(), ...override })
 * ```
 */
export function getOrCreateDriver(
    c: Context,
    config: SessionConfig,
): SessionDriver {
    // Memoization is an allowlist, not an else-branch: only the drivers in
    // MEMOIZED are ever cached, so cookie and redis are per-request by NOT
    // being on the list. This is the stronger form of the redis gate — a driver
    // cannot slip into the memo by failing to match a `cookie` check; it has to
    // be added to MEMOIZED explicitly, and `driverKey` throws for anything else.
    if (!MEMOIZED.has(config.driver)) {
        return createDriver(c, config)
    }

    const key = driverKey(config)
    let driver = memo.get(key)
    if (!driver) {
        driver = createDriver(c, config)
        memo.set(key, driver)
        // Register the registry's own teardown the first time it holds anything,
        // so a process that never uses sessions registers nothing.
        registryHandle ??= registerDisposable({
            name: 'session:driver-registry',
            dispose: () => resetDriverRegistry(),
        })
    }
    return driver
}

/**
 * The canonical memo key for a resolved config: what makes two configs the same
 * resource. Over the resource-determining fields only — the driver name, the KV
 * path, and (for a future memoized redis) host/port/db. **Never the redis
 * password**: the key must stay safe to log, and a per-request redis is not
 * keyed at all today.
 *
 * @param config - A resolved config whose driver is memoized.
 * @returns A stable key string.
 * @throws {Error} If called for a per-request driver (`cookie` / `redis`) — a
 *   key for those would be the artefact that lets one into the memo by mistake.
 * @example
 * ```typescript
 * driverKey({ driver: 'deno-kv', kvPath: './s.db', ... }) // "deno-kv:./s.db"
 * ```
 */
export function driverKey(config: SessionConfig): string {
    switch (config.driver) {
        case 'memory':
            return 'memory'
        case 'deno-kv':
            return `deno-kv:${config.kvPath ?? ''}`
        default:
            throw new Error(
                `driverKey called for the per-request driver '${config.driver}': ` +
                    'cookie and redis are never memoized.',
            )
    }
}

/**
 * Close every memoized driver and clear the memo.
 *
 * Branches on capability: a driver exposing `close()` (deno-kv) is closed to
 * release its handle; one exposing `clear()` (memory) is cleared so no session
 * survives into the next app. `close()` is idempotent, so this overlapping with
 * core's own disposables drain at shutdown frees each handle at most once.
 *
 * `@internal` — for the test lifecycle (call between session tests) and for the
 * registry's own shutdown hook. Not re-exported from `mod.ts`.
 *
 * @example
 * ```typescript
 * // In a test afterEach:
 * resetDriverRegistry()
 * ```
 */
export function resetDriverRegistry(): void {
    for (const driver of memo.values()) {
        if (typeof driver.close === 'function') {
            // kv.close() runs synchronously inside close(); the promise is only
            // the wrapper. A rejection must not throw mid-teardown (it would
            // strand the drivers behind it), but it is not swallowed silently:
            // it is logged, so a failed teardown is visible.
            void Promise.resolve(driver.close()).catch((error) => {
                console.warn(
                    'session: a driver close() failed during registry reset',
                    error,
                )
            })
        } else {
            const withClear = driver as { clear?: () => void }
            withClear.clear?.()
        }
    }
    memo.clear()
    // Drop the shutdown hook too, so the next memoization re-arms one. Without
    // this, a reset (test teardown, or the shutdown drain itself) would leave
    // `registryHandle` truthy and the `??=` below would never register again.
    if (registryHandle) {
        deregisterDisposable(registryHandle)
        registryHandle = undefined
    }
}
