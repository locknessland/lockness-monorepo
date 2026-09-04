# @lockness/telemetry

OpenTelemetry span enrichment + framework metrics for Lockness, built on
**Deno's built-in OpenTelemetry**. Optional — `@lockness/core` soft-loads it and
installs the middleware automatically when the package is present.

The framework ships **no exporter and no SDK** — only `@opentelemetry/api`. You
opt in at runtime:

```bash
OTEL_DENO=1 OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 deno task start
```

With `OTEL_DENO` unset the middleware **no-ops** (the OTel API's no-op
provider), at negligible cost — so it is safe to leave installed in every
environment.

## What it emits

- A **child span** per request, nested under Deno's built-in HTTP server span,
  tagged with the matched **route pattern** (`/verify/:id`) and method — **never
  resolved param values, bodies, headers, or cookies** (they carry secrets like
  signed-URL signatures). Exceptions are recorded redacted (no stack, no
  credential-bearing message).
- A **request counter** (`lockness.http.server.requests`) by route.

Deno's built-in OTel already provides HTTP server spans and server metrics; this
package adds the framework-level enrichment on top.
