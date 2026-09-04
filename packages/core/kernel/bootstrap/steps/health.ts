/**
 * @fileoverview Health + readiness probe bootstrap step (#218).
 *
 * Registers two framework endpoints on the **public** Hono layer, before the
 * internal controller layer is mounted, so they bypass application middleware:
 *
 * - `GET /health` — liveness. The process is up. Touches no dependency, opens no
 *   connection. Always `200`.
 * - `GET /ready` — readiness. Runs every check registered through
 *   `registerHealthCheck` (`@lockness/contract`), each bounded by a timeout, and
 *   reports `200` when all pass or `503` when any fails. The body carries each
 *   check's **name and a coarse `up`/`down` status only** — never a dependency's
 *   raw error, host, port, or version (an unauthenticated caller must not be
 *   handed internal topology). The aggregate result is cached for a short TTL so
 *   a burst of probes shares one evaluation pass rather than amplifying into
 *   dependency load.
 *
 * @module @lockness/core/kernel/bootstrap/steps/health
 * @since 0.2.1
 */

import type { BootstrapStep } from '../types.ts'
import { collectHealthChecks } from '@lockness/contract/lifecycle/health/internal'
import { safeForLog } from '@lockness/contract'

/** How long a single check may run before it counts as `down`. */
const CHECK_TIMEOUT_MS = 3_000

/** How long an aggregate `/ready` result is reused before re-evaluating. */
const READY_CACHE_TTL_MS = 1_000

/** One check's public-safe outcome: name + coarse status, nothing more. */
interface CheckStatus {
    readonly name: string
    readonly status: 'up' | 'down'
}

/** A cached `/ready` evaluation. */
interface ReadySnapshot {
    readonly at: number
    readonly ready: boolean
    readonly checks: readonly CheckStatus[]
}

/** The shape a check resolves to: healthy/unhealthy plus optional log detail. */
interface CheckOutcome {
    readonly ok: boolean
    readonly detail?: string
}

/** Run one check with a timeout; any throw or timeout is `down`. Never throws. */
async function runCheck(
    check: { name: string; check(): Promise<CheckOutcome> },
): Promise<CheckStatus> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<CheckOutcome>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false }), CHECK_TIMEOUT_MS)
    })
    try {
        const result = await Promise.race([
            Promise.resolve().then(() => check.check()),
            timeout,
        ])
        if (!result.ok) {
            // Record WHICH dependency failed and why, server-side only — the
            // /ready body stays name+status (SEC-F4), but a 503 must leave a
            // diagnostic trail. `detail` is encoded before it reaches the log.
            console.warn(
                `[health] check "${safeForLog(check.name)}" is down`,
                result.detail !== undefined
                    ? { detail: safeForLog(result.detail) }
                    : {},
            )
        }
        return { name: check.name, status: result.ok ? 'up' : 'down' }
    } catch (error) {
        // A check must not throw, but if it does the dependency is not usable.
        console.warn(
            `[health] check "${safeForLog(check.name)}" threw`,
            { error: safeForLog((error as Error).message) },
        )
        return { name: check.name, status: 'down' }
    } finally {
        if (timer !== undefined) clearTimeout(timer)
    }
}

/**
 * Health + readiness routes.
 *
 * Order: 540 — after the app instance exists (200) and after global middleware
 * (300), but **before** app initialization (550) mounts the internal layer onto
 * the root layer, so the probe routes sit on the root layer ahead of the mount
 * and are matched without running application middleware.
 */
export const healthStep: BootstrapStep = {
    id: 'health',
    order: 540,

    run(context): void {
        if (!context.app) {
            throw new Error('App instance not created')
        }
        const app = context.app as {
            getRootHono(): {
                get(
                    path: string,
                    handler: (c: HealthContext) => Response | Promise<Response>,
                ): void
            }
        }
        const appName =
            (context.config as { app?: { name?: string } }).app?.name ??
                'lockness'

        const root = app.getRootHono()

        // Liveness — no dependency, no connection.
        root.get('/health', (c: HealthContext) =>
            c.json({
                status: 'ok',
                app: appName,
                time: new Date().toISOString(),
            }))

        // Readiness — every registered check, timed out, aggregated, cached.
        let cache: ReadySnapshot | undefined
        root.get('/ready', async (c: HealthContext) => {
            const now = Date.now()
            if (!cache || now - cache.at >= READY_CACHE_TTL_MS) {
                const checks = await Promise.all(
                    collectHealthChecks().map(runCheck),
                )
                cache = {
                    at: now,
                    ready: checks.every((s) => s.status === 'up'),
                    checks,
                }
            }
            return c.json(
                {
                    status: cache.ready ? 'ready' : 'not_ready',
                    checks: cache.checks,
                },
                cache.ready ? 200 : 503,
            )
        })
    },
}

/** The slice of a Hono context these handlers use. */
interface HealthContext {
    json(body: unknown, status?: number): Response
}
