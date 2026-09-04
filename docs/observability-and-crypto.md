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
