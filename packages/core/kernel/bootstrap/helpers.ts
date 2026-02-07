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
 * Normalized session config with required fields.
 */
export interface NormalizedSessionConfig {
    driver: NonNullable<SessionConfig['driver']>
    secret: string
    lifetime: number
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
 *
 * const config2 = normalizeSessionConfig({ driver: 'memory' })
 * // Returns: { driver: 'memory', secret: env.APP_KEY, lifetime: 7200, secure: false }
 * ```
 */
export function normalizeSessionConfig(
    config: SessionConfig | boolean,
): NormalizedSessionConfig {
    const baseConfig = typeof config === 'object' ? config : {}

    const secret = baseConfig.secret ?? Deno.env.get('APP_KEY') ??
        'change-me-in-production'

    // Warn if using default secret
    if (secret === 'change-me-in-production') {
        console.warn(
            '⚠️  Using default session secret. Set APP_KEY environment variable for production.',
        )
    }

    return {
        driver: baseConfig.driver ?? 'cookie',
        secret,
        lifetime: baseConfig.lifetime ?? 7200,
        secure: baseConfig.secure ??
            (Deno.env.get('APP_ENV') === 'production'),
    }
}

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
