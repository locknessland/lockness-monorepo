/**
 * @fileoverview Session configuration bootstrap step.
 *
 * Configures session management if enabled in the kernel.
 *
 * @module @lockness/core/kernel/bootstrap/steps/session
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import {
    type NormalizedSessionConfig,
    normalizeSessionConfig,
    tryImportOptionalPackage,
} from '../helpers.ts'

/**
 * Session configuration step.
 *
 * Order: 110 (infrastructure setup)
 *
 * Responsibilities:
 * - Import @lockness/session if session is configured
 * - Normalize session configuration
 * - Configure session manager
 * - Skip gracefully if package not installed
 */
export const sessionStep: BootstrapStep = {
    id: 'session',
    order: 110,

    async run(context) {
        if (!context.config.session) {
            return
        }

        const sessionModule = await tryImportOptionalPackage<{
            configureSession: (config: NormalizedSessionConfig) => void
        }>(
            '@lockness/session',
            'session',
        )

        if (!sessionModule) {
            return
        }

        const { configureSession } = sessionModule

        // Normalize configuration
        const sessionConfig = normalizeSessionConfig(context.config.session)

        // Configure session manager
        configureSession(sessionConfig)
    },
}
