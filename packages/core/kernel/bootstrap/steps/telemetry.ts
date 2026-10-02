/**
 * @fileoverview Telemetry enablement bootstrap step.
 *
 * Loads `@lockness/telemetry` and installs its tracing middleware early in the
 * request chain **when the kernel sets `telemetry: true`** (#505). Presence in
 * the import map no longer turns tracing on: core imports an optional package
 * only when the kernel names it, and a set key whose package does not resolve
 * refuses the boot. Installed in **every** environment (not dev-only like
 * devtools): tracing is a production concern, and the middleware no-ops cleanly
 * when `OTEL_DENO` is unset, so there is nothing else to gate.
 *
 * @module @lockness/core/kernel/bootstrap/steps/telemetry
 * @since 0.2.1
 */

import type { BootstrapStep } from '../types.ts'
import {
    defaultImportModule,
    loadConfiguredPackage,
} from '../optional_packages.ts'
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

        const telemetryModule = await loadConfiguredPackage<{
            telemetryMiddleware: () => MiddlewareHandler
        }>(
            context.config,
            'telemetry',
            context.importModule ?? defaultImportModule,
        )

        if (!telemetryModule) {
            return
        }

        context.app.getHono().use(telemetryModule.telemetryMiddleware())
    },
}
