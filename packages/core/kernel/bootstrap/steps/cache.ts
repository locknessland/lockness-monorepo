/**
 * @fileoverview Cache configuration bootstrap step.
 *
 * Configures cache system if enabled in the kernel.
 *
 * @module @lockness/core/kernel/bootstrap/steps/cache
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import {
    normalizeCacheConfig,
    type NormalizedCacheConfig,
    tryImportOptionalPackage,
} from '../helpers.ts'

/**
 * Cache configuration step.
 *
 * Order: 120 (infrastructure setup)
 *
 * Responsibilities:
 * - Import @lockness/cache if cache is configured
 * - Normalize cache configuration
 * - Configure cache manager
 * - Skip gracefully if package not installed
 */
export const cacheStep: BootstrapStep = {
    id: 'cache',
    order: 120,

    async run(context) {
        if (!context.config.cache) {
            return
        }

        const cacheModule = await tryImportOptionalPackage<{
            configureCache: (config: NormalizedCacheConfig) => void
        }>(
            '@lockness/cache',
            'cache',
        )

        if (!cacheModule) {
            return
        }

        const { configureCache } = cacheModule

        // Normalize configuration
        const cacheConfig = normalizeCacheConfig(context.config.cache)

        // Configure cache manager
        configureCache(cacheConfig)
    },
}
