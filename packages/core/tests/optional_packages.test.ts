/**
 * Tests for the configured-package loader (#505).
 *
 * One rule, and every test below is a row of it: core imports an optional
 * package only when the kernel sets the key that names it, and a key that is
 * set but whose package does not resolve **refuses the boot**. The warning
 * "<pkg> not found - skipping" that used to stand in for that refusal must
 * never come back — it let a kit configure `cache` without declaring it, and a
 * missing `@lockness/redis` behind `schedulerLock` install no lock at all.
 */

import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
    assertStringIncludes,
} from '@std/assert'
import {
    defaultImportModule,
    type ImportModule,
    importRequiredPackage,
    isUnresolvableSpecifier,
    loadConfiguredPackage,
    MissingOptionalPackageError,
    OPTIONAL_FEATURES,
} from '../kernel/bootstrap/optional_packages.ts'
import { MissingOptionalPackageError as PublicError } from '../mod.ts'

/** What Deno raises for a bare specifier the application never declared. */
function unresolvable(specifier: string): TypeError {
    return new TypeError(
        `Import "${specifier}" not a dependency and not in import map from "file:///app/main.ts"`,
    )
}

/** An importer that records every specifier and answers from a script. */
function recordingImporter(
    answer: (specifier: string) => Promise<unknown>,
): { importModule: ImportModule; calls: string[] } {
    const calls: string[] = []
    return {
        calls,
        importModule: (specifier) => {
            calls.push(specifier)
            return answer(specifier)
        },
    }
}

/**
 * Run `fn` with `console.warn` captured, and return what it printed together
 * with how it settled: the caller asserts on the rejection, so a loader that
 * quietly resolved instead of refusing cannot pass.
 */
async function capturingWarn(
    fn: () => Promise<unknown>,
): Promise<{ warned: unknown[]; settled: PromiseSettledResult<unknown> }> {
    const warned: unknown[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => warned.push(args)
    try {
        const [settled] = await Promise.allSettled([fn()])
        return { warned, settled }
    } finally {
        console.warn = original
    }
}

Deno.test('OPTIONAL_FEATURES - names the seven kernel keys and their packages', () => {
    assertEquals(OPTIONAL_FEATURES, {
        database: '@lockness/drizzle',
        session: '@lockness/session',
        cache: '@lockness/cache',
        i18n: '@lockness/i18n',
        devtools: '@lockness/devtools',
        telemetry: '@lockness/telemetry',
        logger: '@lockness/logger',
    })
})

Deno.test('loadConfiguredPackage - an unset key imports nothing and returns null', async () => {
    const { importModule, calls } = recordingImporter(() => {
        throw new Error('must not be called')
    })

    assertEquals(await loadConfiguredPackage({}, 'cache', importModule), null)
    assertEquals(calls, [])
})

Deno.test('loadConfiguredPackage - a key set to false is unset, not a request', async () => {
    const { importModule, calls } = recordingImporter(() => {
        throw new Error('must not be called')
    })

    assertEquals(
        await loadConfiguredPackage(
            { telemetry: false },
            'telemetry',
            importModule,
        ),
        null,
    )
    assertEquals(calls, [])
})

Deno.test('loadConfiguredPackage - a set key loads its package once', async () => {
    const module = { configureCache: () => {} }
    const { importModule, calls } = recordingImporter(() =>
        Promise.resolve(module)
    )

    const loaded = await loadConfiguredPackage(
        { cache: true },
        'cache',
        importModule,
    )

    assertStrictEquals(loaded, module)
    assertEquals(calls, ['@lockness/cache'])
})

Deno.test('loadConfiguredPackage - a set key whose package does not resolve refuses the boot', async () => {
    const cause = unresolvable('@lockness/cache')
    const { importModule } = recordingImporter(() => Promise.reject(cause))

    const error = await assertRejects(
        () => loadConfiguredPackage({ cache: true }, 'cache', importModule),
        MissingOptionalPackageError,
    )

    assertEquals(error.name, 'MissingOptionalPackageError')
    assertEquals(error.packageName, '@lockness/cache')
    assertEquals(error.feature, 'cache')
    assertStrictEquals(error.cause, cause)
    assertEquals(
        error.message,
        '@lockness/cache is configured but not installed: the kernel sets `cache`, ' +
            'and "@lockness/cache" does not resolve from this application.\n' +
            'Fix: deno add jsr:@lockness/cache (same version as @lockness/core), ' +
            'or remove `cache` from @Kernel().',
    )
})

Deno.test('MissingOptionalPackageError - is the class @lockness/core exports', () => {
    assertStrictEquals(PublicError, MissingOptionalPackageError)
})

Deno.test('loadConfiguredPackage - a missing package never warns, it refuses', async () => {
    const resolverError = unresolvable('@lockness/session')
    const { importModule } = recordingImporter(() =>
        Promise.reject(resolverError)
    )

    const { warned, settled } = await capturingWarn(() =>
        loadConfiguredPackage({ session: true }, 'session', importModule)
    )

    assertEquals(warned, [])
    assertEquals(settled.status, 'rejected')
    const reason = (settled as PromiseRejectedResult).reason
    assertInstanceOf(reason, MissingOptionalPackageError)
    assertStrictEquals(reason.cause, resolverError)
})

Deno.test('loadConfiguredPackage - any other import failure is rethrown as the same object', async () => {
    // A package that resolves and then throws while evaluating is a bug in
    // that package, not an absent one — renaming it "not installed" would send
    // the operator to `deno add` for a package they already have.
    const broken = new SyntaxError('Unexpected token in @lockness/i18n')
    const { importModule } = recordingImporter(() => Promise.reject(broken))

    const error = await assertRejects(() =>
        loadConfiguredPackage(
            { i18n: { catalogs: {}, defaultLocale: 'en' } },
            'i18n',
            importModule,
        )
    )

    assertStrictEquals(error, broken)
})

Deno.test('importRequiredPackage - names the setting it was given, not a kernel key', async () => {
    const cause = unresolvable('@lockness/redis')
    const { importModule } = recordingImporter(() => Promise.reject(cause))

    const error = await assertRejects(
        () =>
            importRequiredPackage(
                '@lockness/redis',
                "schedulerLock.driver 'redis'",
                importModule,
            ),
        MissingOptionalPackageError,
    )

    assertEquals(error.packageName, '@lockness/redis')
    assertEquals(error.feature, "schedulerLock.driver 'redis'")
    assertStrictEquals(error.cause, cause)
    assertStringIncludes(
        error.message,
        "the kernel sets `schedulerLock.driver 'redis'`",
    )
    assertStringIncludes(error.message, 'deno add jsr:@lockness/redis')
})

Deno.test('importRequiredPackage - returns the module when it resolves', async () => {
    const module = { RedisClient: class {} }
    const loaded = await importRequiredPackage(
        '@lockness/redis',
        "schedulerLock.driver 'redis'",
        () => Promise.resolve(module),
    )

    assertStrictEquals(loaded, module)
})

Deno.test('isUnresolvableSpecifier - recognises the resolver failures and nothing else', () => {
    assertEquals(isUnresolvableSpecifier(unresolvable('@lockness/x')), true)
    assertEquals(
        isUnresolvableSpecifier(new TypeError('Cannot resolve module "x"')),
        true,
    )
    assertEquals(
        isUnresolvableSpecifier(
            new TypeError('Relative import path "x" not in import map'),
        ),
        true,
    )
    assertEquals(
        isUnresolvableSpecifier(new TypeError('x is not a function')),
        false,
    )
    assertEquals(
        isUnresolvableSpecifier(new Error('not a dependency')),
        false,
        'only a TypeError is a resolution failure',
    )
    assertEquals(isUnresolvableSpecifier('not a dependency'), false)
})

Deno.test('isUnresolvableSpecifier - matches what this Deno actually raises for an undeclared package', async () => {
    // The classifier matches the resolver's message text — the one part of
    // this design that a Deno upgrade can silently break. Pinned here against
    // the real resolver, so the break shows up as a red test rather than as a
    // missing package rethrown with a raw resolver message.
    const error = await defaultImportModule('@lockness/non-existent-package')
        .then(() => undefined, (e: unknown) => e)

    assertEquals(isUnresolvableSpecifier(error), true)
})

Deno.test('defaultImportModule - loads a package the workspace declares', async () => {
    const module = await defaultImportModule('@std/assert') as {
        assert?: unknown
    }

    assertEquals(typeof module.assert, 'function')
})
