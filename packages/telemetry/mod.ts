/**
 * @fileoverview `@lockness/telemetry` — OpenTelemetry span enrichment + framework
 * metrics for Lockness, on Deno's built-in OTel.
 *
 * Optional and soft-loaded by `@lockness/core` (like devtools). The app opts in
 * at runtime with `OTEL_DENO=1` and points `OTEL_EXPORTER_OTLP_ENDPOINT` at its
 * backend; the framework ships **no exporter and no SDK** — only
 * `@opentelemetry/api` (a hard-rule-#2 exception: there is no JSR equivalent of
 * the vendor-neutral OTel API). With `OTEL_DENO` unset the middleware no-ops.
 *
 * @module @lockness/telemetry
 *
 * @example
 * ```typescript
 * // core installs it automatically when the package is present; or manually:
 * import { telemetryMiddleware } from '@lockness/telemetry'
 * app.use(telemetryMiddleware())
 * ```
 */

export {
    type AttributeValue,
    buildAttributes,
    toRecordedException,
} from './attributes.ts'
export { telemetryMiddleware } from './middleware.ts'
