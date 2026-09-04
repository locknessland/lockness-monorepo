/**
 * @fileoverview Telemetry enablement bootstrap step.
 *
 * Soft-loads `@lockness/telemetry` and installs its tracing middleware early in
 * the request chain when the package is present. Installed in **every**
 * environment (not dev-only like devtools): tracing is a production concern, and
 * the middleware no-ops cleanly when `OTEL_DENO` is unset, so there is nothing
 * to gate.
 *
 * @module @lockness/core/kernel/bootstrap/steps/telemetry
 * @since 0.2.1
 */

import type { BootstrapStep } from '../types.ts'
import { tryImportOptionalPackage } from '../helpers.ts'
import type { MiddlewareHandler } from '@lockness/hono'

/**
 * Telemetry enablement step.
 *
 * Order: 200 (after app creation, before devtools/middleware — so the span wraps
 * the whole request).
 */
export const telemetryStep: BootstrapStep = {
    id: 'telemetry',
    order: 200,

    async run(context) {
        if (!context.app) {
            throw new Error('App instance not created')
        }

        const telemetryModule = await tryImportOptionalPackage<{
            telemetryMiddleware: () => MiddlewareHandler
        }>(
            '@lockness/telemetry',
            'telemetry',
        )

        if (!telemetryModule) {
            return
        }

        context.app.getHono().use(telemetryModule.telemetryMiddleware())
    },
}
