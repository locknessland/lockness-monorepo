# Observability & crypto

Lockness ships application cryptography (`@lockness/crypto`), signed/temporary
URLs (in `@lockness/core`), and OpenTelemetry tracing (`@lockness/telemetry`).
All are imported from `@lockness/core`.

- [App key](#app-key)
- [Crypt — encrypt / decrypt](#crypt--encrypt--decrypt)
- [Hash — one-way hashing](#hash--one-way-hashing)
- [Signed / temporary URLs](#signed--temporary-urls)
- [OpenTelemetry](#opentelemetry)

---

## App key

All crypto reads `APP_KEY` (form `base64:<32 random bytes>`). Generate one:

```bash
deno task cli key:generate   # prints APP_KEY=base64:...
```

In **production** a missing/invalid `APP_KEY` **fails closed** (crypto refuses
to run). In **explicit development** a per-process ephemeral key is used —
encrypted data and signed URLs then do not survive a restart, so set `APP_KEY`
for stable behaviour. The validator is single-homed in `@lockness/contract`; it
rejects the framework's shipped placeholder keys and degenerate keys.

## Crypt — encrypt / decrypt

Authenticated AES-256-GCM. Each call uses a fresh salt + IV; a tampered token
decrypts to `null` (never partial plaintext).

```ts
import { Crypt } from '@lockness/core'

const token = await Crypt.encrypt(JSON.stringify({ userId: 1 }))
const plain = await Crypt.decrypt(token) // string | null
if (plain === null) { /* tampered, wrong key, or malformed */ }
```

## Hash — one-way hashing

Password-grade PBKDF2-SHA-256 (≥600k iterations, random per-hash salt,
self-describing output). For arbitrary secrets — API keys, tokens.

```ts
import { Hash } from '@lockness/core'

const stored = await Hash.make(apiKey)
const ok = await Hash.check(candidate, stored)
if (Hash.needsRehash(stored)) { /* re-hash on next successful check */ }
```

## Signed / temporary URLs

A tamper-proof, optionally expiring URL for a named route, plus a `signed`
verify middleware.

```ts
import { signedUrl } from '@lockness/core'

// Generation — signs origin + path + every query param (incl. expires).
const url = await signedUrl('verify-email', { id: 42 }, { expiresIn: 3600 })
```

```ts
// Verification — reject a tampered/absent/expired signature with a 403.
@Get('/verify/:id')
@UseMiddleware('signed')
verify(c: Context) {
    return c.text('verified')
}
```

The origin is taken from `APP_URL` (never the request `Host` header). The
signature covers the origin, the path, and every query parameter except
`signature`; any change — reordering aside, which is canonicalised — invalidates
it.

> **Signed URLs are bearer credentials in a URL.** They land in browser history,
> `Referer` headers, and logs. Use **short TTLs**, and for single-use links add
> your own app-side consumed-flag / nonce (the framework does not track use).

## OpenTelemetry

`@lockness/telemetry` builds on **Deno's built-in OpenTelemetry**. Opt in at
runtime:

```bash
OTEL_DENO=1 OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 deno task start
```

With `OTEL_DENO` **unset**, the tracing middleware **no-ops** — so nothing is
emitted and there is negligible cost (this is why you see no spans until you set
the flag). When enabled, every request gets a framework child span tagged with
the matched route **pattern** (`/verify/:id`, never resolved values) and method,
nested under Deno's built-in HTTP server span, plus a request counter. The
framework ships no exporter or SDK — the app points
`OTEL_EXPORTER_OTLP_ENDPOINT` at its own backend.

### Framework instruments

**The one list of every instrument name, kind, unit, attribute and bucket
boundary Lockness uses.** Code and other docs link here rather than naming an
instrument themselves. A package that measures something hands the value to the
application through a seam, and the application records it on a meter from
`getMeter` ([ADR 012](adr/012-measurements-reach-the-app-through-a-seam.md)).

| Instrument                        | Kind      | Unit        | Recorded value                 | Recorded by                    |
| :-------------------------------- | :-------- | :---------- | :----------------------------- | :----------------------------- |
| `lockness.http.server.requests`   | counter   | —           | `1` per request                | `telemetryMiddleware`          |
| `lockness.realtime.pass.duration` | histogram | `s`         | `PassSample.durationMs / 1000` | the application (recipe below) |
| `lockness.realtime.pass.pages`    | histogram | `{page}`    | `PassSample.pages`             | the application (recipe below) |
| `lockness.realtime.pass.attempts` | counter   | `{attempt}` | `PassSample.attempts`          | the application (recipe below) |
| `lockness.realtime.pass.failures` | counter   | `{failure}` | `PassSample.failures`          | the application (recipe below) |

- **`lockness.http.server.requests`** carries `http.route`, the matched route
  pattern.
- **All four `lockness.realtime.pass.*` instruments** carry the same three
  attributes, taken from the Redis realtime driver's `PassSample`:
  - `lockness.realtime.pass.kind` — `sweep` or `revocation` (`PassSample.pass`);
  - `lockness.realtime.pass.trigger` — `timer`, `reconnect` or
    `reconnect-retry`;
  - `lockness.realtime.pass.outcome` — `ok` or `failed`. What `ok` promises, and
    what it does not, is defined once, on `PassSample.outcome` in
    `packages/realtime/drivers/redis.ts`.

  At most 8 combinations exist, whatever the fleet size: the sweep's trigger is
  always `timer` (2 outcomes), and the revocation pass takes all three triggers
  (3 × 2 outcomes) — 2 + 6.
- **The two counters are added to only when the sample carries counts**
  (`sample.failures !== undefined`): every sweep sample does, and a revocation
  sample does when its re-check reported a tally (#384). What an attempt and a
  failure are, per pass, is defined once, on `PassSample.attempts` and
  `PassSample.failures`.
- **Explicit bucket boundaries**, passed as `advice.explicitBucketBoundaries`:
  - `lockness.realtime.pass.duration`, in seconds:
    `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60`. The range
    covers ADR 009's revisit trigger (a revocation pass above 10% of a 10 s
    interval — `reconcileIntervalMs`'s default — 1 s) and ADR 008's (a sweep
    longer than the liveness TTL).
  - `lockness.realtime.pass.pages`: `1, 2, 5, 10, 20, 50, 100, 200, 500, 1000`.

#### Recipe: the realtime pass instruments

`RedisBroadcastDriver.onPassComplete` hands the application one sample per
completed ghost sweep and revocation pass. Forward it to the two histograms and
the two counters:

```typescript
import { getMeter } from '@lockness/telemetry'
import type { PassSample, RedisBroadcastDriver } from '@lockness/realtime'

export function recordRealtimePasses(driver: RedisBroadcastDriver): void {
    const meter = getMeter('my-app')
    const duration = meter.createHistogram('lockness.realtime.pass.duration', {
        unit: 's',
        description: 'How long one realtime background pass took.',
        advice: {
            explicitBucketBoundaries: [
                0.005,
                0.01,
                0.025,
                0.05,
                0.1,
                0.25,
                0.5,
                1,
                2.5,
                5,
                10,
                30,
                60,
            ],
        },
    })
    const pages = meter.createHistogram('lockness.realtime.pass.pages', {
        unit: '{page}',
        description: 'How many pages one realtime background pass read.',
        advice: {
            explicitBucketBoundaries: [
                1,
                2,
                5,
                10,
                20,
                50,
                100,
                200,
                500,
                1000,
            ],
        },
    })
    const attempts = meter.createCounter('lockness.realtime.pass.attempts', {
        unit: '{attempt}',
        description: 'How many units one realtime background pass attempted.',
    })
    const failures = meter.createCounter('lockness.realtime.pass.failures', {
        unit: '{failure}',
        description: 'How many units one realtime background pass failed.',
    })
    driver.onPassComplete((sample: PassSample) => {
        const attributes = {
            'lockness.realtime.pass.kind': sample.pass,
            'lockness.realtime.pass.trigger': sample.trigger,
            'lockness.realtime.pass.outcome': sample.outcome,
        }
        duration.record(sample.durationMs / 1000, attributes)
        pages.record(sample.pages, attributes)
        if (sample.failures !== undefined) {
            attempts.add(sample.attempts ?? 0, attributes)
            failures.add(sample.failures, attributes)
        }
    })
}
```

**Alert on the rate of `lockness.realtime.pass.failures`**, summed across the
fleet, not only on the revocation deadline's WARNs. The deadline is
per-instance: a failing revocation whose client reconnects to another instance
on every interval never breaks one instance's window, so no deadline fires
anywhere, and a steady failure rate is the only signal that sees it
([ADR 012](adr/012-measurements-reach-the-app-through-a-seam.md) §5, item 9).

The sample keeps milliseconds; the recipe converts to seconds. With `OTEL_DENO`
unset, `getMeter` returns the no-op meter and the handler records nothing.
