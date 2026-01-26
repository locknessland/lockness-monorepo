/**
 * @fileoverview Version fetching utilities for JSR packages.
 *
 * Provides the `JsrVersionProvider` class which fetches the latest
 * available versions of packages from the JSR registry.
 *
 * @module @lockness/upgrade/version_fetcher
 *
 * @example
 * ```typescript
 * import { createVersionProvider } from '@lockness/upgrade'
 *
 * const provider = createVersionProvider()
 * const version = await provider.getLatestVersion('@lockness/contract')
 * console.log(`Latest version: ${version}`)
 * ```
 */

import type { VersionProvider } from './types.ts'

// =============================================================================
// Constants
// =============================================================================

/** Base URL for the JSR registry API */
const JSR_BASE_URL = 'https://jsr.io' as const

/** Default timeout for API requests in milliseconds */
const DEFAULT_TIMEOUT_MS = 5000 as const

// =============================================================================
// Types
// =============================================================================

/**
 * Response structure from JSR package metadata endpoint.
 * @internal
 */
interface JsrPackageMetadata {
    /** The latest published version */
    readonly latest: string
    /** All available versions */
    readonly versions?: Record<string, unknown>
}

// =============================================================================
// JsrVersionProvider Class
// =============================================================================

/**
 * Fetches latest package versions from the JSR registry.
 *
 * This provider queries the JSR API to determine the latest available
 * version of a package. It includes timeout handling to prevent
 * hanging on slow network connections.
 *
 * @example
 * ```typescript
 * const provider = new JsrVersionProvider()
 * const version = await provider.getLatestVersion('@lockness/contract')
 * console.log(version) // '0.2.0'
 * ```
 */
export class JsrVersionProvider implements VersionProvider {
    /** Base URL for JSR API requests */
    private readonly baseUrl: string = JSR_BASE_URL

    /** Request timeout in milliseconds */
    private readonly timeout: number = DEFAULT_TIMEOUT_MS

    /**
     * Fetch the latest available version of a package from JSR.
     *
     * @param packageName - Full package name (e.g., "@lockness/contract")
     * @returns Promise resolving to the latest version string
     * @throws {Error} If the request times out
     * @throws {Error} If the package is not found or API returns an error
     *
     * @example
     * ```typescript
     * const provider = new JsrVersionProvider()
     *
     * try {
     *     const version = await provider.getLatestVersion('@lockness/contract')
     *     console.log(`Latest: ${version}`)
     * } catch (error) {
     *     console.error('Failed to fetch version:', error.message)
     * }
     * ```
     */
    async getLatestVersion(packageName: string): Promise<string> {
        const scope = packageName.split('/')[0].replace('@', '')
        const name = packageName.split('/')[1]
        const url = `${this.baseUrl}/@${scope}/${name}/meta.json`

        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), this.timeout)

            const response = await fetch(url, {
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch version for ${packageName}: ${response.statusText}`,
                )
            }

            const data: JsrPackageMetadata = await response.json()
            return data.latest
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(
                        `Timeout fetching version for ${packageName}`,
                    )
                }
                throw new Error(
                    `Failed to fetch version for ${packageName}: ${error.message}`,
                )
            }
            throw error
        }
    }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a version provider instance for fetching package versions.
 *
 * This factory function returns a `JsrVersionProvider` which queries
 * the JSR registry for the latest package versions.
 *
 * @returns A new `VersionProvider` instance
 *
 * @example
 * ```typescript
 * import { createVersionProvider } from '@lockness/upgrade'
 *
 * const provider = createVersionProvider()
 * const version = await provider.getLatestVersion('@lockness/contract')
 * ```
 */
export function createVersionProvider(): VersionProvider {
    return new JsrVersionProvider()
}
