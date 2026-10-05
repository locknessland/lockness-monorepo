/**
 * @fileoverview #420 — the database boot step makes zero round trips.
 *
 * Booting with a database URL used to probe the database (`SELECT 1`) on every
 * start, which on a scale-to-zero database wakes and bills the compute on every
 * isolate start. The step now only configures the client; the one round trip
 * belongs to the `database` readiness check behind `/ready`.
 *
 * These tests run `databaseStep` against the container's own `Database`
 * singleton — the instance the step resolves — with a counting fake driver
 * factory, so the round trips are counted without a live database.
 *
 * @module @lockness/core/tests/database_step
 */

import { assertEquals } from '@std/assert'
import { container } from '@lockness/container'
import { deregisterHealthCheck, type HealthCheck } from '@lockness/contract'
import { collectHealthChecks } from '@lockness/contract/lifecycle/health/internal'
import { Database, type DriverFactory } from '@lockness/drizzle'
import { databaseStep } from '../kernel/bootstrap/steps/database.ts'

const URL_UNDER_TEST = 'postgres://u:p@db.example:5432/app'

/** Clear the process-wide health registry so each test starts from zero. */
function resetRegistry(): void {
    for (const c of collectHealthChecks()) {
        deregisterHealthCheck({ _check: c })
    }
}

/** Silence the step's console chatter for the duration of a test. */
function muteConsole(): () => void {
    const { log, error, warn } = console
    console.log = () => {}
    console.error = () => {}
    console.warn = () => {}
    return () => {
        console.log = log
        console.error = error
        console.warn = warn
    }
}

/**
 * Run `fn` against a fresh container `Database` singleton and an empty health
 * registry, restoring both afterwards so no state leaks between tests.
 */
async function withFreshDatabase(
    fn: (db: Database) => Promise<void>,
): Promise<void> {
    const restore = muteConsole()
    container.delete(Database)
    resetRegistry()
    try {
        await fn(container.get(Database))
    } finally {
        await container.get(Database).close()
        container.delete(Database)
        resetRegistry()
        restore()
    }
}

/** Run the step with a database URL in the kernel config. */
async function runStep(): Promise<void> {
    await databaseStep.run(
        {
            config: { database: { url: URL_UNDER_TEST } },
        } as unknown as Parameters<
            typeof databaseStep.run
        >[0],
    )
}

/** The one registered `database` readiness check. */
function databaseCheck(): HealthCheck {
    const checks = collectHealthChecks().filter((c) => c.name === 'database')
    assertEquals(checks.length, 1, 'expected one database readiness check')
    return checks[0]
}

Deno.test('#420 boot configures the database with zero round trips; /ready makes one', async () => {
    await withFreshDatabase(async (db) => {
        const counts = { built: 0, probes: 0 }
        const factory: DriverFactory = () => {
            counts.built++
            return Promise.resolve({
                db: {} as unknown,
                close: () => Promise.resolve(),
                probe: () => {
                    counts.probes++
                    return Promise.resolve()
                },
            })
        }
        db.setDriverFactory('postgres', factory)

        await runStep()

        assertEquals(
            counts,
            { built: 1, probes: 0 },
            'boot woke the database',
        )

        const result = await databaseCheck().check()
        assertEquals(result, { ok: true })
        assertEquals(counts, { built: 1, probes: 1 })
    })
})

Deno.test('#420 a client that cannot be built does not stop boot, and /ready reports down', async () => {
    await withFreshDatabase(async (db) => {
        db.setDriverFactory('postgres', () => {
            throw new Error('Cannot find module postgres')
        })

        // Must not throw: a configuration error does not stop boot (#420).
        await runStep()

        const result = await databaseCheck().check()
        assertEquals(result.ok, false)
    })
})

// -----------------------------------------------------------------------------
// #454 — `logger: true` routes PostgreSQL notices to @lockness/logger
// -----------------------------------------------------------------------------

/** The options the step handed `Database.connect`, captured by a spy. */
type ConnectOptions = Parameters<Database['connect']>[1]

/**
 * Run the step with `config`, an importer that serves a fake
 * `@lockness/logger`, and the container `Database`'s `connect` replaced by a
 * spy. Returns what `connect` received, every logger call, and every import.
 */
async function runStepCapturingConnect(
    config: Record<string, unknown>,
): Promise<{
    readonly options: ConnectOptions[]
    readonly logged: string[]
    readonly imported: string[]
}> {
    const options: ConnectOptions[] = []
    const logged: string[] = []
    const imported: string[] = []
    const fakeLogger = {
        logger: () => ({
            warn: (message: string, fields?: Record<string, unknown>) => {
                logged.push(`warn:${message}:${JSON.stringify(fields)}`)
                return Promise.resolve()
            },
            debug: (message: string, fields?: Record<string, unknown>) => {
                logged.push(`debug:${message}:${JSON.stringify(fields)}`)
                return Promise.resolve()
            },
        }),
    }
    await withFreshDatabase(async (db) => {
        db.connect = (_url, given) => {
            options.push(given)
            return Promise.resolve({ success: true })
        }
        await databaseStep.run(
            {
                config: { database: { url: URL_UNDER_TEST }, ...config },
                importModule: (specifier: string) => {
                    imported.push(specifier)
                    return specifier === '@lockness/logger'
                        ? Promise.resolve(fakeLogger)
                        : import(specifier)
                },
            } as unknown as Parameters<typeof databaseStep.run>[0],
        )
    })
    return { options, logged, imported }
}

Deno.test('#454 logger: true passes notices whose warn and debug reach the logger', async () => {
    const { options, logged } = await runStepCapturingConnect({ logger: true })

    assertEquals(options.length, 1)
    const notices = options[0]?.notices
    if (!notices) throw new Error('connect received no notices reporter')
    notices.warn('w', { code: '01000' })
    notices.debug('n', { code: '42P06' })
    assertEquals(logged, [
        'warn:w:{"code":"01000"}',
        'debug:n:{"code":"42P06"}',
    ])
})

Deno.test('#454 without logger, connect receives no notices key and the logger is not imported', async () => {
    const { options, imported } = await runStepCapturingConnect({})

    assertEquals(options.length, 1)
    assertEquals(Object.hasOwn(options[0] ?? {}, 'notices'), false)
    assertEquals(imported.includes('@lockness/logger'), false)
})
