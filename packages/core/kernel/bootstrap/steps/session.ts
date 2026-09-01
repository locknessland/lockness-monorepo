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
    devSessionKey,
    isProduction,
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
 * - **Refuse to boot** when the cookie driver has no usable key in production
 * - Supply a per-process random key outside production
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
            assertUsableSecret: (
                secret: string | undefined,
                source: 'config' | 'app-key' | 'generated',
            ) => Uint8Array
            generateAppKey: () => string
        }>(
            '@lockness/session',
            'session',
        )

        if (!sessionModule) {
            return
        }

        const { assertUsableSecret, configureSession, generateAppKey } =
            sessionModule

        const sessionConfig = normalizeSessionConfig(context.config.session)

        // Where the operator would go to fix it: the kernel config if they set
        // one there, otherwise the environment.
        // Where the operator would go to fix it. Reassigned when the
        // development fallback supplies the key, so a later failure does not
        // send them to an APP_KEY they never set.
        let resolvedFrom: 'config' | 'app-key' | 'generated' =
            typeof context.config.session === 'object' &&
                context.config.session.secret
                ? 'config'
                : 'app-key'

        // The one place that can decide this, and therefore the only place that
        // does.
        //
        // It needs two things at once: the resolved secret, and the environment.
        // `@lockness/session` has the first and cannot have the second — a
        // library must not ask whether it is in production — and
        // `sessionMiddleware()` has neither at the time the kernel calls it, in
        // a field initialiser that runs before this step. Putting the gate there
        // would throw for every application in development; leaving it to
        // `createDriver` would make it a 500 per request instead of a refusal to
        // start.
        //
        // Only the cookie driver needs a secret. Memory, Deno KV and Redis put a
        // random session id in the cookie and the data in a store, so requiring
        // one there would break working configurations to protect nothing.
        if (sessionConfig.driver === 'cookie' && !sessionConfig.secret) {
            if (isProduction()) {
                // Throws. `runBootstrapSteps` does not catch, so this ends the
                // boot — which is the point: the alternative is serving
                // forgeable cookies behind a warning nobody reads.
                assertUsableSecret(undefined, resolvedFrom)
            }

            sessionConfig.secret = devSessionKey(generateAppKey)
            resolvedFrom = 'generated'
            console.warn(
                '⚠️  No APP_KEY set — using a random key for this process only. ' +
                    'Sessions will not survive a restart. Set APP_KEY to keep them.',
            )
        }

        if (sessionConfig.driver === 'cookie') {
            assertUsableSecret(sessionConfig.secret, resolvedFrom)
        }

        configureSession(sessionConfig)
    },
}
