/**
 * @fileoverview How an application — and the framework's own middleware —
 * reaches the OpenTelemetry meter: {@link getMeter}, the one home of that
 * route.
 *
 * A Lockness package that measures something does not record it itself: it
 * hands the application a value through a seam, and the application records
 * it on a meter obtained here (ADR 012). The instrument names, units,
 * attributes and bucket boundaries live in `docs/observability-and-crypto.md`
 * § Framework instruments, never in code.
 *
 * @module @lockness/telemetry/meter
 * @since 0.4.0
 */

import { type Meter, metrics } from '@opentelemetry/api'

export type { Meter }

/**
 * Get the OpenTelemetry meter named `name`, from whatever meter provider is
 * installed.
 *
 * With `OTEL_DENO` unset Deno installs no provider, so this returns the
 * OpenTelemetry API's **no-op meter**: every instrument it creates records
 * nothing, at negligible cost, and never throws. An application needs no
 * `OTEL_DENO` check of its own.
 *
 * @param name - The meter's name, usually the recording package or
 *   application.
 * @returns The meter, or the no-op meter when no provider is installed.
 * @example
 * ```typescript
 * import { getMeter } from '@lockness/telemetry'
 *
 * const meter = getMeter('my-app')
 * const jobs = meter.createCounter('my_app.jobs', { unit: '{job}' })
 * jobs.add(1, { 'my_app.job.kind': 'mail' })
 * ```
 */
export function getMeter(name: string): Meter {
    return metrics.getMeter(name)
}
