/**
 * @fileoverview Database initialization bootstrap step.
 *
 * Configures the database client if configured in the kernel — without a round
 * trip (#420).
 *
 * @module @lockness/core/kernel/bootstrap/steps/database
 * @since 0.2.0
 */

import type { BootstrapContext, BootstrapStep } from '../types.ts'
import { getDatabaseUrl } from '../helpers.ts'
import {
    defaultImportModule,
    loadConfiguredPackage,
} from '../optional_packages.ts'
import { container } from '@lockness/container'
import { registerHealthCheck, renderError } from '@lockness/contract'
import { triggerDeprecation } from '@lockness/deprecation-contracts'
import type { KernelConfig } from '../../kernel_decorators.ts'
import { SHUTDOWN_PRIORITY } from '../../shutdown_registry.ts'

/**
 * Report a set `database.autoConnect` — a field nothing has ever read (#421).
 *
 * Fires on the field's presence, whatever its value: `false` never kept boot
 * off the database, so a user relying on it is misled either way. Once per
 * boot, because the step runs once per `createApp()`. It only reports: boot
 * behaviour is the same with or without the field.
 *
 * @param setting - The kernel's `database` key.
 * @returns void
 * @throws {Error} When `STRICT_DEPRECATIONS=true` — the deprecation
 * package's own contract, which an application opts into.
 */
function reportDeprecatedAutoConnect(
    setting: KernelConfig['database'],
): void {
    if (typeof setting !== 'object' || setting.autoConnect === undefined) {
        return
    }
    triggerDeprecation(
        '@lockness/core',
        '0.5.0',
        '`database.autoConnect` has no effect and is removed in v0.6.0 — ' +
            'delete it from your @Kernel() database config',
    )
}

/** The notice reporter port `@lockness/drizzle` declares, structurally. */
interface NoticeReporter {
    warn(message: string, fields: Readonly<Record<string, unknown>>): void
    debug(message: string, fields: Readonly<Record<string, unknown>>): void
}

/**
 * Build the reporter PostgreSQL server notices go to (#454).
 *
 * `@lockness/drizzle` may not import `@lockness/logger` — its dependency
 * ceiling forbids it — so the wiring happens here, at the composition root,
 * the way the scheduler step wires its reporter (#505). Not shared with that
 * step: the two ports have different method sets, and two cases are below the
 * Rule of Three.
 *
 * @param context - The bootstrap context: its `logger` key and its importer.
 * @returns A reporter backed by the application's logger, or `undefined` when
 * the kernel does not set `logger` — drizzle's console fallback then applies.
 * @throws {MissingOptionalPackageError} When `logger` is set and
 * `@lockness/logger` does not resolve.
 */
async function buildNoticeReporter(
    context: BootstrapContext,
): Promise<NoticeReporter | undefined> {
    const loggerModule = await loadConfiguredPackage<{
        logger: () => {
            warn: (m: string, f?: Record<string, unknown>) => Promise<void>
            debug: (m: string, f?: Record<string, unknown>) => Promise<void>
        }
    }>(context.config, 'logger', context.importModule ?? defaultImportModule)

    if (!loggerModule) return undefined

    const { logger } = loggerModule
    // The port is synchronous; the logger's methods are async. Not awaited:
    // the reporter runs inside postgres.js's socket handler. A rejected sink
    // (a full disk, a network transport that is down) is reported on stderr:
    // left unhandled, it would end the process when a notice arrived.
    const settle = (sent: Promise<void>): void => {
        sent.catch((error) =>
            console.error(`logger failed: ${renderError(error)}`)
        )
    }
    return {
        warn: (message, fields) =>
            settle(logger().warn(message, { ...fields })),
        debug: (message, fields) =>
            settle(logger().debug(message, { ...fields })),
    }
}

/**
 * Database initialization step.
 *
 * Order: 100 (infrastructure setup)
 *
 * Responsibilities:
 * - Import @lockness/drizzle if database is configured
 * - Configure the database client using URL from config or environment —
 *   with zero round trips (#420)
 * - With `logger: true`, route PostgreSQL server notices to the application's
 *   logger — warnings at `warn`, the rest at `debug` (#454)
 * - Register the `database` readiness check behind `/ready`
 * - Raise a deprecation notice when `database.autoConnect` is set (#421)
 * - Refuse the boot if `database` is set and the package does not resolve
 */
export const databaseStep: BootstrapStep = {
    id: 'database',
    order: 100,

    async run(context) {
        const setting = context.config.database
        // Before the package load, so the notice is raised even on a boot the
        // loader then refuses.
        reportDeprecatedAutoConnect(setting)
        const drizzleModule = await loadConfiguredPackage<{
            Database: new () => {
                connect(
                    url: string,
                    options?: {
                        driver?: 'postgres' | 'mysql' | 'sqlite'
                        notices?: NoticeReporter
                    },
                ): Promise<{ success: boolean; error?: string }>
                probe(): Promise<unknown>
            }
        }>(
            context.config,
            'database',
            context.importModule ?? defaultImportModule,
        )
        // `!setting` narrows the type only: the loader already returned null
        // for an unset key, having imported nothing.
        if (!drizzleModule || !setting) {
            return
        }

        const { Database } = drizzleModule
        const db = container.get(Database)

        // Determine connection URL
        const url = getDatabaseUrl(setting)

        // Connect if URL is available. Pass the configured dialect so the boot
        // path honours `driver`; the CLI path relies on URL-scheme inference.
        // `config.database` may be `true` (defaults shorthand) — only an object
        // carries a driver.
        const driver = typeof setting === 'object' ? setting.driver : undefined
        if (url) {
            // Configure only — boot does NOT probe (#420). `connect()` builds a
            // lazy client and makes zero round trips: on a scale-to-zero
            // database a boot-time `SELECT 1` wakes and bills the compute on
            // every cold start, whether or not a route ever queries it. The
            // result is deliberately not acted on: `connect()` has already
            // logged a failure (missing client package, URL the client
            // rejects), a configuration error does not stop boot, and the
            // `database` check below then reports it on `/ready`. An app that
            // wants boot to fail when the database is down calls
            // `Database.probe()` from its own `@OnBoot` hook.
            //
            // A THROW is deliberately not caught (#427): `connect()` throws
            // only when the singleton already holds a client — a second
            // configure in one process, such as an `@OnBoot` hook that also
            // calls `connect()`. That is a wiring error, like `App instance
            // not created`, so it fails boot with drizzle's own message.
            //
            // With `logger: true`, PostgreSQL notices go to the logger (#454);
            // without it, no `notices` key, and drizzle's console fallback
            // prints a warning as one line and discards the rest.
            const notices = await buildNoticeReporter(context)
            await db.connect(url, notices ? { driver, notices } : { driver })

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

        // Only when this boot actually connected. Registering unconditionally
        // would call close() on a service that was never opened.
        //
        // Checked BEFORE the import (#505). The import used to come first, so
        // every boot without a database probed for @lockness/drizzle once more
        // here — the fourth "not found - skipping" line on the slim kit.
        const dbConfig = context.config.database
        if (!dbConfig) return
        if (!getDatabaseUrl(dbConfig)) return

        const drizzleModule = await loadConfiguredPackage<{
            Database: new () => unknown
        }>(
            context.config,
            'database',
            context.importModule ?? defaultImportModule,
        )
        if (!drizzleModule) return

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
