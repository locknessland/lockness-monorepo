/**
 * @fileoverview Helper utilities for bootstrap steps.
 *
 * This module provides centralized helpers for:
 * - Optional package imports with standardized error handling
 * - Configuration normalization
 * - Error classification
 *
 * @module @lockness/core/kernel/bootstrap/helpers
 * @since 0.2.0
 *
 * @example Using optional import helper
 * ```typescript
 * const drizzle = await tryImportOptionalPackage(
 *     '@lockness/drizzle',
 *     'database'
 * )
 *
 * if (drizzle) {
 *     const { Database } = drizzle
 *     // Use Database class
 * }
 * ```
 */

import type { CacheConfig, SessionConfig } from '../kernel_decorators.ts'

/**
 * Is this process running in production?
 *
 * Reads `DENO_ENV` first, then `APP_ENV`, because those are the two names the
 * framework answers to and they disagree in its own shipped container:
 * `packages/init/stubs/init/Dockerfile.stub` sets `DENO_ENV=production`, while
 * this file read only `APP_ENV`. A gate consulting one name is inert wherever
 * the other is set — which for the session boot gate meant inert in the exact
 * image it exists to protect.
 *
 * `packages/core/http/server.ts` already resolved it this way; this is that rule
 * given a name so the two cannot drift.
 *
 * @returns `true` when either variable is `production`.
 *
 * @example
 * ```typescript
 * if (isProduction()) throw new Error('refusing to start without a key')
 * ```
 */
export function isProduction(): boolean {
    return (Deno.env.get('DENO_ENV') ?? Deno.env.get('APP_ENV')) ===
        'production'
}

/**
 * Normalized session config.
 *
 * `secret` is **optional on purpose**. In production with no `APP_KEY` there is
 * nothing to return — the framework refuses to boot rather than substituting a
 * literal — so the absence has to be representable. `steps/session.ts` is where
 * that absence becomes a boot failure or a development key.
 */
export interface NormalizedSessionConfig {
    driver: NonNullable<SessionConfig['driver']>
    secret?: string
    lifetime: number
    /**
     * The absolute-lifetime ceiling in seconds, or `undefined` when disabled.
     * Passed through verbatim (opt-in); a non-positive value is rejected at
     * normalisation, so this is either `undefined` or a positive number.
     */
    absoluteLifetime?: number
    /** Whether per-session cookie revocation is enabled. Requires the cap. */
    revocation?: boolean
    secure: boolean
}

/**
 * Normalized cache config with required fields.
 */
export interface NormalizedCacheConfig {
    driver: NonNullable<CacheConfig['driver']>
    ttl: number
    prefix: string
    kvPath?: string
}

/**
 * Attempt to import an optional package with standardized error handling.
 *
 * If the package is not installed, logs a warning and returns null.
 * If import fails for other reasons, re-throws the error.
 *
 * @param packageName - Name of the package to import (e.g., '@lockness/session')
 * @param featureName - Human-readable feature name for error messages (e.g., 'session')
 * @returns The imported module or null if package not found
 * @throws {Error} If import fails for reasons other than missing package
 *
 * @example
 * ```typescript
 * const sessionModule = await tryImportOptionalPackage(
 *     '@lockness/session',
 *     'session'
 * )
 *
 * if (sessionModule) {
 *     const { configureSession } = sessionModule
 *     configureSession({ driver: 'cookie' })
 * }
 * ```
 */
export async function tryImportOptionalPackage<T = unknown>(
    packageName: string,
    featureName: string,
): Promise<T | null> {
    try {
        return await import(packageName) as T
    } catch (error) {
        // Check if this is a "package not found" error
        if (
            error instanceof TypeError &&
            (
                error.message.includes('Cannot resolve') ||
                error.message.includes('not a dependency') ||
                error.message.includes('not in import map')
            )
        ) {
            console.warn(
                `⚠️  ${packageName} not found - skipping ${featureName} setup`,
            )
            return null
        }

        // Re-throw unexpected errors (connection failures, etc.)
        throw error
    }
}

/**
 * Normalize session configuration to a full SessionConfig object.
 *
 * Handles both boolean shorthand and explicit config objects.
 * Applies defaults for missing properties.
 *
 * @param config - Session configuration (boolean or object)
 * @returns Normalized session configuration
 *
 * @example
 * ```typescript
 * const config1 = normalizeSessionConfig(true)
 * // Returns: { driver: 'cookie', secret: env.APP_KEY, lifetime: 7200, secure: false }
 * // — with `secret: undefined` when APP_KEY is unset. That is not an oversight;
 * //   see the note in the body.
 *
 * const config2 = normalizeSessionConfig({ driver: 'memory' })
 * // Returns: { driver: 'memory', secret: env.APP_KEY, lifetime: 7200, secure: false }
 * ```
 */
export function normalizeSessionConfig(
    config: SessionConfig | boolean,
): NormalizedSessionConfig {
    const baseConfig = typeof config === 'object' ? config : {}

    // Explicit configuration, then APP_KEY, then NOTHING.
    //
    // There is deliberately no third fallback. The literal that used to sit here
    // — committed to this repository, guarded by a console.warn — made every
    // deployment that forgot APP_KEY share one publicly known key. Returning
    // `undefined` instead moves the decision to the one place that can take it:
    // `steps/session.ts`, which knows the environment and can refuse to boot.
    const secret = baseConfig.secret ?? Deno.env.get('APP_KEY')

    // The absolute cap is opt-in (undefined = off). A non-positive value is a
    // configuration error, NOT "off" — refuse it rather than silently disable the
    // cap an operator believed they had enabled (fail-closed on misconfig).
    const absoluteLifetime = baseConfig.absoluteLifetime
    if (absoluteLifetime !== undefined && absoluteLifetime <= 0) {
        throw new Error(
            `session.absoluteLifetime must be a positive number of seconds when set (got ${absoluteLifetime}); ` +
                'leave it undefined to disable the absolute-lifetime cap.',
        )
    }

    // Revocation needs the cap to bound each revocation entry's retention; an
    // unbounded cookie has no finite horizon for its revocation record. Refuse
    // the combination at boot rather than grow the KV set forever.
    const revocation = baseConfig.revocation ?? false
    if (revocation && absoluteLifetime === undefined) {
        throw new Error(
            'session.revocation requires session.absoluteLifetime to be set — ' +
                'it bounds how long each revocation entry is retained.',
        )
    }

    return {
        driver: baseConfig.driver ?? 'cookie',
        secret,
        lifetime: baseConfig.lifetime ?? 7200,
        absoluteLifetime,
        revocation,
        secure: baseConfig.secure ?? isProduction(),
    }
}

/**
 * The development session key, generated once per process.
 *
 * Outside production, an application with no `APP_KEY` gets a random key rather
 * than a shared literal: sessions then do not survive a restart, which is
 * correct and far preferable to every developer's machine — and every forgotten
 * deployment — running on the same publicly known key.
 *
 * **Memoised at module scope, not inside {@link normalizeSessionConfig}.** That
 * function is pure and runs once per `createApp` plus four times in core's own
 * suite, so generating inside it would produce a key *per call*: two
 * applications in one process would hold different keys, and nothing would
 * notice.
 *
 * The generator is passed in rather than imported. `@lockness/session` is an
 * optional dependency loaded at bootstrap, so core cannot import it statically —
 * and it must not grow a second key generator of its own, which would drift from
 * the shape `assertUsableSecret` enforces.
 *
 * @param generate - `generateAppKey` from the loaded session module.
 * @returns The same key for the lifetime of this process.
 *
 * @example
 * ```typescript
 * const secret = devSessionKey(sessionModule.generateAppKey)
 * ```
 */
export function devSessionKey(generate: () => string): string {
    processSessionKey ??= generate()
    return processSessionKey
}

let processSessionKey: string | undefined

/**
 * Normalize cache configuration to a full CacheConfig object.
 *
 * Handles both boolean shorthand and explicit config objects.
 * Applies defaults for missing properties.
 *
 * @param config - Cache configuration (boolean or object)
 * @returns Normalized cache configuration
 *
 * @example
 * ```typescript
 * const config1 = normalizeCacheConfig(true)
 * // Returns: { driver: 'memory', ttl: 3600, prefix: 'lockness' }
 *
 * const config2 = normalizeCacheConfig({ driver: 'deno-kv', ttl: 7200 })
 * // Returns: { driver: 'deno-kv', ttl: 7200, prefix: 'lockness' }
 * ```
 */
export function normalizeCacheConfig(
    config: CacheConfig | boolean,
): NormalizedCacheConfig {
    const baseConfig = typeof config === 'object' ? config : {}

    return {
        driver: baseConfig.driver ?? 'memory',
        ttl: baseConfig.ttl ?? 3600,
        prefix: baseConfig.prefix ?? 'lockness',
        kvPath: baseConfig.kvPath,
    }
}

/**
 * Determine database URL from configuration or environment.
 *
 * @param config - Database configuration (boolean or object)
 * @returns Database URL or undefined if not specified
 *
 * @example
 * ```typescript
 * const url1 = getDatabaseUrl({ url: 'postgres://localhost/db' })
 * // Returns: 'postgres://localhost/db'
 *
 * const url2 = getDatabaseUrl(true) // Reads from DATABASE_URL env var
 * // Returns: value of DATABASE_URL or undefined
 * ```
 */
export function getDatabaseUrl(
    config: { url?: string } | boolean,
): string | undefined {
    if (typeof config === 'object' && config.url) {
        return config.url
    }
    return Deno.env.get('DATABASE_URL')
}
