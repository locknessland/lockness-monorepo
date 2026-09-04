/**
 * @fileoverview Database initialization bootstrap step.
 *
 * Connects to the database if configured in the kernel.
 *
 * @module @lockness/core/kernel/bootstrap/steps/database
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { getDatabaseUrl, tryImportOptionalPackage } from '../helpers.ts'
import { container } from '@lockness/container'
import { registerHealthCheck } from '@lockness/contract'
import { SHUTDOWN_PRIORITY } from '../../shutdown_registry.ts'

/**
 * Database initialization step.
 *
 * Order: 100 (infrastructure setup)
 *
 * Responsibilities:
 * - Import @lockness/drizzle if database is configured
 * - Connect to database using URL from config or environment
 * - Skip gracefully if package not installed
 */
export const databaseStep: BootstrapStep = {
    id: 'database',
    order: 100,

    async run(context) {
        if (!context.config.database) {
            return
        }

        const drizzleModule = await tryImportOptionalPackage<{
            Database: new () => {
                connect(
                    url: string,
                    options?: {
                        driver?: 'postgres' | 'mysql' | 'sqlite'
                    },
                ): Promise<void>
                probe(): Promise<unknown>
            }
        }>(
            '@lockness/drizzle',
            'database',
        )

        if (!drizzleModule) {
            return
        }

        const { Database } = drizzleModule
        const db = container.get(Database)

        // Determine connection URL
        const url = getDatabaseUrl(context.config.database)

        // Connect if URL is available. Pass the configured dialect so the boot
        // path honours `driver`; the CLI path relies on URL-scheme inference.
        // `config.database` may be `true` (defaults shorthand) — only an object
        // carries a driver.
        const driver = typeof context.config.database === 'object'
            ? context.config.database.driver
            : undefined
        if (url) {
            await db.connect(url, { driver })

            // Announce a readiness probe for `/ready` (#218). `probe()` runs
            // `SELECT 1`; a throw (connection down) surfaces as `down`, never as
            // an unhandled rejection, and its message stays out of the public
            // body.
            registerHealthCheck({
                name: 'database',
                check: async () => {
                    try {
                        await db.probe()
                        return { ok: true }
                    } catch (error) {
                        return { ok: false, detail: (error as Error).message }
                    }
                },
            })
        }
    },
}

/**
 * Database teardown registration.
 *
 * **Order: 210 — after `app_init` (200), and that is the entire point.**
 * `databaseStep` runs at 100, before `context.app` exists, so a registration
 * written there reaches `context.app?.onShutdown(...)` with `context.app`
 * still `undefined`. The optional chain evaluates to `undefined`: no throw, no
 * warning, and the connection core opens itself is never released — while the
 * shutdown report says everything ran. That shipped, and the whole suite was
 * green, which is why `packages/core/tests/shutdown_step_order.test.ts` now
 * enumerates the steps by search rather than trusting a reader to notice.
 *
 * Separate from `databaseStep` rather than moving that one: the connection has
 * to be open before session (110), cache (120) and the boot hooks run.
 */
export const databaseTeardownStep: BootstrapStep = {
    id: 'database_teardown',
    order: 210,

    async run(context) {
        // Loud, not optional. `?.` here is what hid the original defect; a
        // missing app at this order is a wiring error, and
        // `steps/shutdown_hooks.ts` throws for exactly the same reason.
        if (!context.app) {
            throw new Error('App instance not created')
        }

        const drizzleModule = await tryImportOptionalPackage<{
            Database: new () => unknown
        }>('@lockness/drizzle', 'database')
        if (!drizzleModule) return

        // Only when this boot actually connected. Registering unconditionally
        // would call close() on a service that was never opened.
        const dbConfig = context.config.database
        if (dbConfig === undefined) return
        if (!getDatabaseUrl(dbConfig)) return

        const db = container.get(drizzleModule.Database) as {
            close?: () => void | Promise<void>
            disconnect?: () => void | Promise<void>
        }

        // CONNECTIONS runs LAST, so nothing that still needs the database is
        // torn down after it. Deliberately not `databaseStep`'s order of 100 —
        // a different axis, and 100 read as an ascending priority would close
        // the database FIRST.
        context.app.onShutdown('database', async () => {
            // The Database service is optionally loaded, so its teardown method
            // is not knowable at compile time. Checked explicitly rather than
            // with `??`: `close?.() ?? disconnect?.()` calls BOTH the day a
            // driver's close() returns void, because `undefined ?? x` evaluates
            // x. And a driver with neither must say so, not no-op in silence —
            // invariant 3 calls silence about a hook a defect.
            if (typeof db.close === 'function') {
                await db.close()
            } else if (typeof db.disconnect === 'function') {
                await db.disconnect()
            } else {
                throw new Error(
                    'The Database service exposes neither close() nor disconnect(); ' +
                        'the connection cannot be released.',
                )
            }
        }, SHUTDOWN_PRIORITY.CONNECTIONS)
    },
}
