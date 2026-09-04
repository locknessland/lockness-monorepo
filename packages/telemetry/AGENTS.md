# `@lockness/telemetry` — agent brief

OpenTelemetry span enrichment + framework metrics on Deno's built-in OTel.
Optional and soft-loaded by `@lockness/core`. Depends on
`npm:@opentelemetry/api` (the one npm exception: no JSR equivalent of the
vendor-neutral OTel API).

## Invariants

- **The dependency contract below is binding.** Importing anything outside it
  fails `deno task deps:analyze`.
- **Attributes are a name/shape allow-list — never resolved param values.** The
  matched route **pattern** (`c.req.routePath`), method, status only.
  `c.req.path` (resolved) and query values carry secrets (signed-URL signatures,
  tokens) and must never become attributes.
- **Exceptions are redacted.** Record via `toRecordedException` (name + a
  `renderError` message, **no stack**) — a raw `span.recordException(err)` ships
  credential-bearing messages/stacks to the trace backend.
- **No exporter, no SDK.** Only `@opentelemetry/api`; the app opts in with
  `OTEL_DENO=1` and its own OTLP endpoint. The middleware no-ops (API no-op
  provider) when `OTEL_DENO` is unset — install it in every environment.
- **No direct `hono` import.** Types come through `@lockness/hono`.

## Dependency contract

<!-- generated:deps -->
<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->
<!-- /generated:surface -->

## Where to work

- `attributes.ts` — `buildAttributes` (allow-list), `toRecordedException`
  (redaction).
- `middleware.ts` — `telemetryMiddleware` (the per-request child span +
  counter).
- `mod.ts` — the barrel.
- Soft-loaded by `packages/core/kernel/bootstrap/steps/telemetry.ts`.

## Pitfalls

- Do not add an OTLP exporter or SDK here — that is the app's choice.
- Do not set `c.req.path` or any query/header/cookie as a span attribute.
- Do not call `span.recordException(err)` directly — go through
  `toRecordedException`.
