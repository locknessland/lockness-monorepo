/**
 * @fileoverview Cache configuration bootstrap step.
 *
 * Configures cache system if enabled in the kernel.
 *
 * @module @lockness/core/kernel/bootstrap/steps/cache
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { normalizeCacheConfig, type NormalizedCacheConfig } from '../helpers.ts'
import {
    defaultImportModule,
    loadConfiguredPackage,
} from '../optional_packages.ts'

/**
 * Cache configuration step.
 *
 * Order: 120 (infrastructure setup)
 *
 * Responsibilities:
 * - Import @lockness/cache if cache is configured
 * - Normalize cache configuration
 * - Configure cache manager
 * - Refuse the boot if `cache` is set and the package does not resolve
 */
export const cacheStep: BootstrapStep = {
    id: 'cache',
    order: 120,

    async run(context) {
        const setting = context.config.cache
        const cacheModule = await loadConfiguredPackage<{
            configureCache: (config: NormalizedCacheConfig) => void
        }>(
            context.config,
            'cache',
            context.importModule ?? defaultImportModule,
        )
        // `!setting` narrows the type only: the loader already returned null
        // for an unset key, having imported nothing.
        if (!cacheModule || !setting) {
            return
        }

        const { configureCache } = cacheModule

        // Normalize configuration
        const cacheConfig = normalizeCacheConfig(setting)

        // Configure cache manager
        configureCache(cacheConfig)
    },
}
