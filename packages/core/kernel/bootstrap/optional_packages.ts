/**
 * @fileoverview The one place core loads an optional package (#505).
 *
 * **One rule.** Core imports an optional package only when the kernel sets the
 * key that names it. A key that is unset imports nothing and prints nothing; a
 * key that is set and whose package does not resolve from the application
 * **refuses the boot** with {@link MissingOptionalPackageError}. There is no
 * third outcome — the "`<pkg>` not found - skipping" warning this replaces made
 * a configured feature silently absent, which is how a kit shipped `cache`
 * without declaring `@lockness/cache`, and how a missing `@lockness/redis`
 * behind `schedulerLock` installed no lock while every replica ran its
 * `onOneServer` tasks.
 *
 * | Kernel key                      | Outcome                                   |
 * | :------------------------------ | :---------------------------------------- |
 * | unset (or `false`)              | nothing imported, nothing printed         |
 * | set, package resolves           | loaded                                    |
 * | set, package does not resolve   | `MissingOptionalPackageError`, boot stops |
 * | set, package throws on load     | that error, rethrown unchanged            |
 *
 * **The specifier is a variable on purpose.** It resolves against the
 * *application's* import map — the app is what declares an optional package —
 * which is right for these and wrong for a hard dependency of core: that is
 * why `@lockness/events` is now imported statically instead.
 *
 * @module @lockness/core/kernel/bootstrap/optional_packages
 * @since 0.5.0
 */

import type { KernelConfig } from '../kernel_decorators.ts'

/**
 * Loads a module by specifier. Injected so a test can stand in for the
 * resolver; the default is {@link defaultImportModule}.
 */
export type ImportModule = (specifier: string) => Promise<unknown>

/**
 * The kernel keys that pull in an optional package, and the package each one
 * names.
 *
 * The `satisfies` clause is the guard: a key here that `KernelConfig` does not
 * have fails to compile, so the table cannot drift from the config it reads.
 * Driver-backed packages (`@lockness/redis` behind a `redis` cache, session or
 * scheduler lock) are not keys and go through {@link importRequiredPackage}.
 */
export const OPTIONAL_FEATURES = {
    database: '@lockness/drizzle',
    session: '@lockness/session',
    cache: '@lockness/cache',
    i18n: '@lockness/i18n',
    devtools: '@lockness/devtools',
    telemetry: '@lockness/telemetry',
    logger: '@lockness/logger',
} as const satisfies {
    readonly [K in keyof KernelConfig]?: `@lockness/${string}`
}

/** A kernel key that names an optional package. */
export type OptionalFeature = keyof typeof OPTIONAL_FEATURES

/**
 * Raised when the kernel configures a feature whose package the application
 * does not declare.
 *
 * Boot stops here rather than continuing without the feature: an application
 * that asked for a cache, a session or a distributed lock and silently runs
 * without one is broken in a way nothing reports.
 *
 * @example
 * ```typescript
 * try {
 *     await createApp(AppKernel)
 * } catch (error) {
 *     if (error instanceof MissingOptionalPackageError) {
 *         console.error(`add ${error.packageName}, or drop ${error.feature}`)
 *     }
 *     throw error
 * }
 * ```
 */
export class MissingOptionalPackageError extends Error {
    override readonly name = 'MissingOptionalPackageError'

    /** The package that did not resolve, e.g. `@lockness/cache`. */
    readonly packageName: string

    /** The setting that asked for it — a kernel key, or a label such as `schedulerLock.driver 'redis'`. */
    readonly feature: string

    /**
     * @param packageName - The package that did not resolve.
     * @param feature - The kernel setting that requires it.
     * @param options - `cause`: the resolver's own error, kept for diagnosis.
     */
    constructor(
        packageName: string,
        feature: string,
        options?: { cause?: unknown },
    ) {
        super(
            `${packageName} is configured but not installed: the kernel sets \`${feature}\`, ` +
                `and "${packageName}" does not resolve from this application.\n` +
                `Fix: deno add jsr:${packageName} (same version as @lockness/core), ` +
                `or remove \`${feature}\` from @Kernel().`,
            options,
        )
        this.packageName = packageName
        this.feature = feature
    }
}

/**
 * The production importer: a dynamic `import()` with a variable specifier, so
 * it resolves against the application's import map.
 *
 * @param specifier - The module to load.
 * @returns The module namespace.
 *
 * @example
 * ```typescript
 * const cache = await defaultImportModule('@lockness/cache')
 * ```
 */
export const defaultImportModule: ImportModule = (specifier) =>
    import(specifier)

/**
 * Whether an import failed because the specifier does not resolve — the
 * package is not declared — rather than because it loaded and threw.
 *
 * Matches the resolver's message text; Deno exposes no error code for it.
 * `optional_packages.test.ts` pins the classification against the real
 * resolver so a Deno upgrade that rewords it fails a test.
 *
 * @param error - What the import rejected with.
 * @returns `true` for a resolution failure.
 *
 * @example
 * ```typescript
 * isUnresolvableSpecifier(new TypeError('Import "x" not a dependency')) // true
 * ```
 */
export function isUnresolvableSpecifier(error: unknown): boolean {
    return error instanceof TypeError && (
        error.message.includes('Cannot resolve') ||
        error.message.includes('not a dependency') ||
        error.message.includes('not in import map')
    )
}

/**
 * Import a package a configuration setting requires, refusing the boot when
 * it does not resolve.
 *
 * @template T - The shape the caller relies on.
 * @param packageName - The package, e.g. `@lockness/redis`.
 * @param featureLabel - The setting that requires it, as the operator wrote it.
 * @param importModule - The importer; {@link defaultImportModule} in production.
 * @returns The module.
 * @throws {MissingOptionalPackageError} When the package does not resolve.
 * @throws {unknown} Any other import failure, unchanged.
 *
 * @example
 * ```typescript
 * const redis = await importRequiredPackage<RedisModule>(
 *     '@lockness/redis',
 *     "schedulerLock.driver 'redis'",
 *     defaultImportModule,
 * )
 * ```
 */
export async function importRequiredPackage<T>(
    packageName: string,
    featureLabel: string,
    importModule: ImportModule,
): Promise<T> {
    try {
        return await importModule(packageName) as T
    } catch (error) {
        if (isUnresolvableSpecifier(error)) {
            throw new MissingOptionalPackageError(packageName, featureLabel, {
                cause: error,
            })
        }
        throw error
    }
}

/**
 * Load the package behind a kernel key — only when the key is set.
 *
 * @template T - The shape the caller relies on.
 * @param config - The kernel configuration.
 * @param feature - The key to consult.
 * @param importModule - The importer; {@link defaultImportModule} in production.
 * @returns The module, or `null` when the key is unset — in which case nothing
 * was imported.
 * @throws {MissingOptionalPackageError} When the key is set and the package
 * does not resolve.
 * @throws {unknown} Any other import failure, unchanged.
 *
 * @example
 * ```typescript
 * const cache = await loadConfiguredPackage<CacheModule>(
 *     context.config,
 *     'cache',
 *     context.importModule ?? defaultImportModule,
 * )
 * if (!cache) return
 * ```
 */
export function loadConfiguredPackage<T>(
    config: KernelConfig,
    feature: OptionalFeature,
    importModule: ImportModule,
): Promise<T | null> {
    if (!config[feature]) return Promise.resolve(null)
    return importRequiredPackage<T>(
        OPTIONAL_FEATURES[feature],
        feature,
        importModule,
    )
}
