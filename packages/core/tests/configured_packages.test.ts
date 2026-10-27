/**
 * The bootstrap steps against the configured-package rule (#505).
 *
 * `optional_packages.test.ts` proves the loader; this file proves the steps go
 * through it. Two halves, and both are needed: a step that refuses when its
 * key names an absent package shows the importer is wired, and a full boot
 * with an empty kernel that calls the importer zero times shows nothing else
 * still probes behind its back — which is what "<pkg> not found - skipping"
 * used to be, printed on every boot of the slim kit.
 */

import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertStringIncludes,
} from '@std/assert'
import { App } from '../app.ts'
import { runBootstrapSteps } from '../kernel/bootstrap/registry.ts'
import {
    type ImportModule,
    MissingOptionalPackageError,
} from '../kernel/bootstrap/optional_packages.ts'
import type {
    BootstrapContext,
    BootstrapStep,
} from '../kernel/bootstrap/types.ts'
import type { KernelConfig } from '../kernel/kernel_decorators.ts'
import {
    databaseStep,
    databaseTeardownStep,
} from '../kernel/bootstrap/steps/database.ts'
import { sessionStep } from '../kernel/bootstrap/steps/session.ts'
import { i18nStep } from '../kernel/bootstrap/steps/i18n.ts'
import { cacheStep } from '../kernel/bootstrap/steps/cache.ts'
import { telemetryStep } from '../kernel/bootstrap/steps/telemetry.ts'
import { devtoolsStep } from '../kernel/bootstrap/steps/devtools.ts'
import { devtoolsRoutesStep } from '../kernel/bootstrap/steps/devtools_routes.ts'
import { schedulerStep } from '../kernel/bootstrap/steps/scheduler.ts'
import { scheduler, setScheduler } from '@lockness/scheduler'
import { eventsStep } from '../kernel/bootstrap/steps/events.ts'
import { createLifecycleMiddleware } from '../http/lifecycle_middleware.ts'
import {
    dispatcher,
    KernelBooted,
    RequestCompleted,
    RequestStarted,
} from '@lockness/events'
import { Hono } from 'hono'

/** Run `fn` with the given variables set (or deleted), then restore them. */
async function withEnv<T>(
    vars: Record<string, string | undefined>,
    fn: () => Promise<T>,
): Promise<T> {
    const saved = new Map<string, string | undefined>()
    for (const [key, value] of Object.entries(vars)) {
        saved.set(key, Deno.env.get(key))
        if (value === undefined) Deno.env.delete(key)
        else Deno.env.set(key, value)
    }
    try {
        return await fn()
    } finally {
        for (const [key, value] of saved) {
            if (value === undefined) Deno.env.delete(key)
            else Deno.env.set(key, value)
        }
    }
}

/**
 * An importer that records every specifier and resolves none of them, the way
 * Deno answers for a package the application never declared.
 */
function refusingImporter(): { importModule: ImportModule; calls: string[] } {
    const calls: string[] = []
    return {
        calls,
        importModule: (specifier) => {
            calls.push(specifier)
            return Promise.reject(
                new TypeError(
                    `Import "${specifier}" not a dependency and not in import map from "file:///app/main.ts"`,
                ),
            )
        },
    }
}

/** A context for one step, with an App when `withApp` is set. */
function contextFor(
    config: KernelConfig,
    importModule: ImportModule,
    withApp = true,
): BootstrapContext {
    class TestKernel {}
    return {
        config,
        kernel: new TestKernel(),
        KernelClass: TestKernel,
        bootHooks: [],
        importModule,
        app: withApp ? new App() : undefined,
    }
}

Deno.test('a full boot with an empty kernel config imports no optional package', async () => {
    const { importModule, calls } = refusingImporter()
    const skipped: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
        const line = args.map(String).join(' ')
        if (line.includes('not found')) skipped.push(line)
    }

    try {
        await withEnv(
            { APP_ENV: 'development', SCHEDULER_ENABLED: 'false' },
            async () => {
                class TestKernel {}
                const context: BootstrapContext = {
                    config: {
                        controllers: [],
                        listenersDir: './tmp/does-not-exist-listeners',
                    },
                    kernel: new TestKernel(),
                    KernelClass: TestKernel,
                    bootHooks: [],
                    importModule,
                }
                await runBootstrapSteps(context)
                assertEquals(context.app instanceof App, true)
            },
        )
    } finally {
        console.warn = originalWarn
    }

    assertEquals(calls, [], 'no step consults the importer for an unset key')
    assertEquals(skipped, [], 'and nothing prints "not found - skipping"')
})

/** One row per step: the key that names a package, and the package. */
const REFUSALS: ReadonlyArray<{
    step: BootstrapStep
    config: KernelConfig
    packageName: string
    feature: string
}> = [
    {
        step: databaseStep,
        config: { database: true },
        packageName: '@lockness/drizzle',
        feature: 'database',
    },
    {
        step: databaseTeardownStep,
        config: { database: { url: 'postgres://u:p@127.0.0.1:1/db' } },
        packageName: '@lockness/drizzle',
        feature: 'database',
    },
    {
        step: sessionStep,
        config: { session: true },
        packageName: '@lockness/session',
        feature: 'session',
    },
    {
        step: i18nStep,
        config: { i18n: { catalogs: {}, defaultLocale: 'en' } },
        packageName: '@lockness/i18n',
        feature: 'i18n',
    },
    {
        step: cacheStep,
        config: { cache: true },
        packageName: '@lockness/cache',
        feature: 'cache',
    },
    {
        step: telemetryStep,
        config: { telemetry: true },
        packageName: '@lockness/telemetry',
        feature: 'telemetry',
    },
    {
        step: devtoolsStep,
        config: { devtools: true },
        packageName: '@lockness/devtools',
        feature: 'devtools',
    },
    {
        step: devtoolsRoutesStep,
        config: { devtools: true },
        packageName: '@lockness/devtools',
        feature: 'devtools',
    },
]

for (const row of REFUSALS) {
    Deno.test(`${row.step.id} - a set key whose package does not resolve refuses the boot`, async () => {
        const { importModule, calls } = refusingImporter()

        const error = await withEnv(
            { APP_ENV: 'development' },
            () =>
                assertRejects(
                    async () => {
                        await row.step.run(
                            contextFor(row.config, importModule),
                        )
                    },
                    MissingOptionalPackageError,
                ),
        )

        assertEquals(error.packageName, row.packageName)
        assertEquals(error.feature, row.feature)
        assertEquals(calls, [row.packageName])
    })
}

Deno.test('schedulerStep - logger: true without @lockness/logger refuses the boot', async () => {
    const { importModule, calls } = refusingImporter()
    try {
        const error = await assertRejects(
            async () =>
                await schedulerStep.run(contextFor({
                    logger: true,
                    schedulesDir: './tmp/does-not-exist-schedules',
                }, importModule)),
            MissingOptionalPackageError,
        )
        assertEquals(error.packageName, '@lockness/logger')
        assertEquals(error.feature, 'logger')
        assertEquals(calls, ['@lockness/logger'])
    } finally {
        scheduler().stop()
        setScheduler(undefined)
    }
})

Deno.test('devtools outside development imports nothing, whatever the key says', async () => {
    const { importModule, calls } = refusingImporter()

    await withEnv({ APP_ENV: 'production' }, async () => {
        await devtoolsStep.run(contextFor({ devtools: true }, importModule))
        await devtoolsRoutesStep.run(
            contextFor({ devtools: true }, importModule),
        )
    })

    assertEquals(calls, [])
})

Deno.test('database_teardown - no database configured imports nothing', async () => {
    // It used to import @lockness/drizzle BEFORE reading config.database, so
    // every boot without a database still probed — and warned — once more.
    const { importModule, calls } = refusingImporter()

    await databaseTeardownStep.run(contextFor({}, importModule))

    assertEquals(calls, [])
})

Deno.test('telemetry - telemetry: true installs the middleware the package provides', async () => {
    let built = 0
    const importModule: ImportModule = (specifier) => {
        assertEquals(specifier, '@lockness/telemetry')
        return Promise.resolve({
            telemetryMiddleware: () => {
                built++
                return async (_c: unknown, next: () => Promise<void>) => {
                    await next()
                }
            },
        })
    }

    await telemetryStep.run(contextFor({ telemetry: true }, importModule))

    assertEquals(built, 1)
})

Deno.test('the refusal names the fix in words an operator can act on', async () => {
    const { importModule } = refusingImporter()

    const error = await assertRejects(
        async () =>
            await cacheStep.run(
                contextFor({ cache: true }, importModule, false),
            ),
        MissingOptionalPackageError,
    )

    assertStringIncludes(error.message, 'deno add jsr:@lockness/cache')
    assertStringIncludes(error.message, 'remove `cache` from @Kernel()')
    assertStrictEquals(error.cause instanceof TypeError, true)
})

Deno.test('events - KernelBooted reaches a listener without consulting the importer', async () => {
    // #505: the step used to load @lockness/events through the variable
    // specifier, which resolves against the APPLICATION's import map. A
    // JSR-installed app does not map @lockness/events, so KernelBooted never
    // fired there. A hard dependency is imported statically now, so the event
    // arrives even with an importer that resolves nothing.
    const { importModule, calls } = refusingImporter()
    let seen: unknown
    const off = dispatcher().on(KernelBooted, (event: unknown) => {
        seen = event
    })

    try {
        await eventsStep.run(contextFor({}, importModule, false))
    } finally {
        off?.()
    }

    assertEquals(seen instanceof KernelBooted, true)
    assertEquals(calls, [])
})

Deno.test('lifecycle middleware - emits RequestStarted and RequestCompleted for a request', async () => {
    const seen: string[] = []
    const offStarted = dispatcher().on(RequestStarted, () => {
        seen.push('started')
    })
    const offCompleted = dispatcher().on(RequestCompleted, () => {
        seen.push('completed')
    })

    try {
        const hono = new Hono()
        hono.use('*', createLifecycleMiddleware())
        hono.get('/', (c) => c.text('ok'))
        const response = await hono.request('/')
        await response.text()
    } finally {
        offStarted?.()
        offCompleted?.()
    }

    assertEquals(seen, ['started', 'completed'])
})

Deno.test("schedulerStep - schedulerLock.driver 'redis' without @lockness/redis refuses the boot", async () => {
    // It used to log once and install no lock, so every replica ran each
    // onOneServer task — the duplicate the lock exists to prevent.
    const { importModule, calls } = refusingImporter()
    try {
        const error = await assertRejects(
            async () =>
                await schedulerStep.run(contextFor({
                    schedulerLock: {
                        driver: 'redis',
                        redis: { hostname: '127.0.0.1' },
                    },
                    schedulesDir: './tmp/does-not-exist-schedules',
                }, importModule)),
            MissingOptionalPackageError,
        )
        assertEquals(error.packageName, '@lockness/redis')
        assertEquals(error.feature, "schedulerLock.driver 'redis'")
        assertEquals(calls, ['@lockness/redis'])
        assertEquals(scheduler().hasLock, false)
    } finally {
        scheduler().stop()
        setScheduler(undefined)
    }
})
