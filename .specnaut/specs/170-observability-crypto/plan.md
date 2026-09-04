# Plan: Observability + crypto helpers

**Branch**: `170-observability-crypto` | **Date**: 2026-09-04 | **Backlog item**: [#221 — Observability + crypto helpers](https://github.com/locknessland/lockness-monorepo/issues/221) (epic; children [#222](https://github.com/locknessland/lockness-monorepo/issues/222), [#223](https://github.com/locknessland/lockness-monorepo/issues/223), [#224](https://github.com/locknessland/lockness-monorepo/issues/224))

**This is the epic's one planning document** — one decision table, one stop, covering all three children.

---

## 1. Why this exists

Competitive gaps #12–#14. Lockness has a dev debug bar but **no production observability** — no OpenTelemetry traces/metrics to debug a running deployment or drive SLOs. It has session-internal AES-GCM and password PBKDF2 but **no general `Crypt`/`Hash` facade** an app can call to encrypt or hash arbitrary data — every app that needs it reaches for `crypto.subtle` by hand. *(The genuine convergence candidates onto the new package are three: `session/secret.ts` key material, `session/drivers/cookie_seal.ts` AES-GCM, `auth/password.ts` PBKDF2. The SHA-256 uses in `redis/memo.ts`, `socialite/mod.ts`, and `auth-provider` are **coincidental similarity** — a connection fingerprint, a PKCE S256 challenge, a fast token-hash — not encryption or password hashing, and must NOT be forced onto a 600k-PBKDF2 `Hash`; architecture A-F3.)* And there is **no signed/temporary URL** primitive, so email-verification / unsubscribe / share links are hand-rolled per app. Laravel ships Telescope/Pulse (obs), Crypt/Hash, and signed routes; Lockness ships none.

## 2. User scenarios

### US1 — Trace a request in production (P1)

**Given** an app running with `OTEL_DENO=1` and an OTLP endpoint
**When** a request is handled
**Then** a per-request span carries framework attributes (matched route name, controller/method), nested under Deno's built-in HTTP server span, and framework metrics are exported — with **no secrets** in any attribute.

### US2 — Encrypt / hash arbitrary data (P1)

**Given** an app with an `APP_KEY`
**When** it calls `Crypt.encrypt(data)` / `Crypt.decrypt(...)` or `Hash.make(value)` / `Hash.check(value, hash)`
**Then** it gets authenticated AES-256-GCM encryption and a password-grade one-way hash, without touching WebCrypto directly.

### US3 — Issue and verify a signed URL (P1)

**Given** a named route
**When** the app calls `signedUrl('verify-email', { id }, { expiresIn: 3600 })`
**Then** it gets a tamper-proof, expiring URL; a `signed` verify middleware on that route rejects a tampered or expired link (403) and accepts a valid one.

### Edge cases

- `APP_KEY` absent in production → `Crypt`/sign refuse to operate (fail closed), never a silent weak key.
- A signed URL with the `signature` param stripped → rejected (missing signature is not a pass).
- A signed URL whose `expires` is in the past → rejected as expired, before the handler runs.
- `OTEL_DENO` unset → the tracing middleware is a no-op against the API's no-op provider (zero output, negligible cost), never an error.
- Ciphertext tampered (GCM tag mismatch) → `decrypt` returns null / throws a typed error, never partial plaintext.

## 3. Requirements

- **FR-001**: A `Crypt` facade encrypts/decrypts arbitrary UTF-8 strings (and JSON-serialisable values) with **AES-256-GCM**, a key derived from `APP_KEY` via **HKDF-SHA-256 with a fresh per-call salt** carried in the wire format (each derived key encrypts exactly one message — removes the ~2³² random-IV birthday bound, mirroring `cookie_seal.ts` fully) and a domain-separation `info` distinct from the session cookie's. The wire format is version-prefixed and the **version prefix is fed as GCM `additionalData` (AAD)**, not merely prepended (so a future `v2` is not a downgrade). Tampering fails the GCM tag; no partial plaintext is returned (WebCrypto verifies the tag atomically). *(hardened per security S5)*
- **FR-002**: A `Hash` facade provides `make(value)` / `check(value, hash)` / `needsRehash(hash)` — a **password-grade one-way hash (PBKDF2-SHA-256, ≥600k iterations)** with a **random per-hash salt and NO `APP_KEY` pepper** (mirrors `auth/password.ts`; a key-derived pepper would make key rotation a data-loss migration and cannot live in the self-describing string). Self-describing PHC-like output, timing-safe verify. *(hardened per security S9)*
- **FR-003**: An HMAC sign/verify primitive (`sign(message)` / `verify(message, sig)`, HMAC-SHA-256, timing-safe) whose key is derived from `APP_KEY` via **HKDF-SHA-256 with its own `info` distinct from Crypt's and the session cookie's** (a single-homed registry of `info` labels prevents collision). Used by signed URLs. *(hardened per security S6)*
- **FR-004**: `APP_KEY` key-material validation is **single-homed in `@lockness/contract`** (`resolveKeyMaterial`) — the true foundation both `@lockness/crypto` and `@lockness/session` import — validating `base64:` + 32 bytes **and rejecting the framework's known-placeholder keys and degenerate (all-same-byte) keys** (the full rule set `session/secret.ts` enforces, so a session-less app using only `Crypt`/`sign` cannot run on a public placeholder key). `session/secret.ts` delegates to it in this epic. Fail-closed is single-homed on one **`isProduction`** decision: the ephemeral dev key is used **only on an explicit non-production signal**; an unset/ambiguous `APP_ENV` resolves to production (fails closed). *(hardened per security S3 + S7, architecture A-F1)*
- **FR-005**: A `signedUrl(name, params?, options?)` generator builds a URL for a **named route** (via `route()`), made absolute against `APP_URL` (**scheme+host from config, never a request `Host` header**), with an `expires` timestamp when requested and a `signature` HMAC over a **canonical byte-string** produced by one shared `canonicalise()` function. The canonical form: query params **sorted by key**, **duplicate params forbidden** (rejected, not silently split), the full URL **minus only the `signature` param** (any appended param invalidates), encoded to survive Hono's `tryDecodeURI` on `c.req.path` so generation and verification see identical bytes. *(hardened per security S1)*
- **FR-006**: A `signed` verify middleware (`@DeclareMiddleware('signed')`) recomputes the HMAC via the **same `canonicalise()`** (imported, never re-derived), compares timing-safely, checks `expires`, and rejects a tampered/absent/expired signature — and any signature-decode failure — with a **generic 403 before the handler runs** (no computed HMAC, no discriminating reason that becomes an oracle). *(hardened per security S1 + S10)*
- **FR-007**: OpenTelemetry: a global tracing middleware starts a **child span** per request (nested under Deno's built-in server span), tagging framework attributes drawn from a **name/shape allow-list** — the matched route **pattern** (`/verify/:id`, **never the resolved param values**), `controller.method`, `mount`, HTTP method, status. **No resolved param values, request bodies, headers, cookies, or query values** become attributes (they carry this epic's own signed-URL signatures and tokens). Exceptions are recorded through **`renderError`** (type + redacted message, **no stack trace exported by default**), never raw `span.recordException` (which would ship credential-bearing messages — confirms [#261](https://github.com/locknessland/lockness-monorepo/issues/261)). Framework **metrics** (per-route request counter, controller-resolution histogram) are emitted. It **no-ops cleanly** when `OTEL_DENO` is unset. *(hardened per security S2 + S4)*
- **FR-008**: The framework ships **no OTLP exporter and no OTel SDK** — only `@opentelemetry/api`; the app opts in with `OTEL_DENO=1` + `OTEL_EXPORTER_OTLP_ENDPOINT`. The one `npm:` dependency (`@opentelemetry/api`) carries an inline hard-rule-#2 justification (no JSR equivalent of the vendor-neutral API). `@lockness/telemetry`'s own dependency edges (`contract`, `hono` — type imports for the middleware) are declared in its `deno.json` and `deps.policy.jsonc`. *(dep edges per architecture A-F2)*
- **FR-008a**: Signed URLs are **bearer credentials in a URL** — they land in browser history, `Referer`, and logs. The docs state this, recommend short TTLs, and note that **single-use requires an app-side consumed-flag/nonce** (out of framework scope). The telemetry attribute/exception rules (FR-007) keep these signatures/tokens out of the trace store. *(security S8)*
- **FR-009**: Every new exported symbol carries JSDoc (#7); no `any` in exported signatures (#3); JSR-bare specifiers in source, pinned in `deno.json` (#2); no direct `hono` import (#1 — go through `@lockness/core`/`@lockness/hono`).

## 4. Success criteria

- **SC-001**: `Crypt.decrypt(Crypt.encrypt(x)) === x`; a single-byte flip in the ciphertext makes `decrypt` fail (no plaintext). Two encryptions of the same input differ (random IV).
- **SC-002**: `Hash.check(v, Hash.make(v))` is true; `check(wrong, hash)` is false; verify is timing-safe (no early return on length/first-byte).
- **SC-003**: A `signedUrl` verifies valid; and each of these fails verification: flipping any character of the path/params/expiry, removing the `signature`, **reordering query params**, a **duplicate `expires`**, an **appended extra param**, and an **encoding round-trip** (the URL as Hono decodes `c.req.path`). An expired URL fails before the handler.
- **SC-004**: With `OTEL_DENO=1` a request produces a framework child span carrying the route name and no secret attribute; with `OTEL_DENO` unset the middleware emits nothing and adds negligible latency.
- **SC-005**: Full gate green (`deno fmt && deno lint && deno check && deno task test && deno task deps:analyze && deno task agents:brief --check && deno task publish:check`).
- **SC-006**: In production, a missing `APP_KEY` makes `Crypt`/sign refuse (fail closed); an **unset/ambiguous `APP_ENV` with a missing key also fails closed** (resolves to production); and a **known-placeholder or degenerate `APP_KEY` is rejected** even for a session-less app — all proven by tests.
- **SC-007**: A traced request records **no resolved param value** as a span attribute (only the route pattern + framework names), and an exception raised mid-request does not ship its raw message/stack to the span — proven by a test asserting a planted secret is absent. *(security S2/S4)*

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| `APP_KEY` → 32-byte key material (validate `base64:`+32, reject known-placeholder + degenerate keys) | **`packages/contract/crypto_key.ts` (`resolveKeyMaterial`)** — the true foundation both crypto and session import | A second validator in `crypto/key.ts` that is weaker than session's (accepts a placeholder key); `session/secret.ts` keeping its own copy (it delegates to contract's in this epic) |
| The `isProduction` fail-closed decision (dev-ephemeral key only on explicit non-prod) | the existing single home core/session already use (`environment.ts`) | `crypto` deciding "is prod" its own way; an unset `APP_ENV` resolving to non-production |
| Symmetric encrypt/decrypt (AES-256-GCM + HKDF, random IV, versioned wire) | `packages/crypto/crypt.ts` (`Crypt`) | `packages/session/drivers/cookie_seal.ts` (session-internal; convergence is a follow-up); a controller calling `crypto.subtle` directly |
| One-way hash (PBKDF2-SHA-256, make/check/needsRehash) | `packages/crypto/hash.ts` (`Hash`) | `packages/auth/password.ts` PBKDF2 (password-specific; dedup is a follow-up — Q1); an app hashing by hand |
| HMAC sign/verify (SHA-256, timing-safe) | `packages/crypto/sign.ts` | A second HMAC in core's signed-URL code |
| Signed-URL **generation** (route()+APP_URL+expires+signature) | `packages/core/routing/signed_url.ts` (`signedUrl`) | A controller assembling the URL + calling sign itself |
| Signed-URL **verification** (recompute + timing-safe + expiry) | `packages/core/http/signed_url_middleware.ts` (`@DeclareMiddleware('signed')`) | A per-route handler re-checking the signature |
| What the signature covers (full URL minus the `signature` param) | `packages/core/routing/signed_url.ts` (one canonicalisation fn, shared by gen + verify) | Generation signing one string shape and verification recomputing a different one — the classic signed-URL bypass |
| OTel request-span enrichment + framework metrics | `packages/telemetry/middleware.ts` (soft-loaded by core, like devtools) | A second span started in core's request path; metrics defined twice |
| The OTel dependency | `packages/telemetry/deno.json` → `npm:@opentelemetry/api` (justified) | An OTLP exporter or SDK shipped from the framework |
| Span attribute allow-list — **names/shapes only** (route **pattern** `/verify/:id`, `controller.method`, `mount`, method, status; **never resolved param values**, bodies, headers, cookies) | `packages/telemetry/attributes.ts` (one builder) | Setting resolved param **values** (which carry signed-URL signatures/tokens), `authorization`, body, or cookies as attributes |
| Span exception recording (redacted, no stack) | `packages/telemetry/middleware.ts` via `renderError` from `@lockness/contract` | A raw `span.recordException(err)` shipping `exception.message` + stacktrace to the backend |

## 6. Technical context

**Language/Version**: Deno / TypeScript. OTel via Deno's **built-in** OpenTelemetry (stable ≥ Deno 2.4; app opts in with `OTEL_DENO=1`) + `npm:@opentelemetry/api@^1.9`. Crypto via WebCrypto (`crypto.subtle`) — no external crypto dep.
**Primary Dependencies**: new `@lockness/crypto` (WebCrypto + `@std/encoding`), new `@lockness/telemetry` (`npm:@opentelemetry/api`), `@lockness/core` (signed URLs, gains a `crypto` edge).
**Storage**: none.
**Testing**: `Deno.test`. Crypt/Hash/sign are pure WebCrypto — unit-testable with a fixed test key. Signed URLs testable with a fixed key. OTel middleware tested for no-op-when-disabled + attribute allow-list (the span-emission path uses the API's no-op provider in tests).
**Target Platform**: Deno server; `deno compile` supported — **confirm built-in OTel survives compilation** on the pinned Deno version (Q/risk).
**Project Type**: framework libraries.
**Constraints**: strict acyclic DAG; hard rules #1–#9; `npm:` justified inline (#2).
**Scale/Scope**: three children; two new packages (`crypto` foundation, `telemetry` optional) + core (signed URLs).

### Domain model

- **Bounded context**: application-level cryptography (encrypt / hash / sign) and request observability.
- **Vocabulary**: *Crypt* (reversible AES-GCM), *Hash* (one-way PBKDF2), *sign/verify* (HMAC), *key material* (APP_KEY → bytes), *signed URL* (URL + expiry + HMAC), *span* (a traced unit), *attribute* (span metadata, secret-free).
- **Entities**: none.
- **Value objects**: key material (32 bytes), a ciphertext envelope, a hash string, a signed URL, a span attribute set.
- **Invariants**: a random IV per encryption; GCM authentication (no partial plaintext); timing-safe comparisons for hash/HMAC; the signature covers the exact bytes verification recomputes; no secret ever becomes a span attribute; missing `APP_KEY` fails closed in production.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 no direct hono | pass | telemetry middleware types via `@lockness/hono`/contract, not raw hono; `@hono/otel` rejected for this reason |
| #2 JSR-only, justified npm | pass | `@opentelemetry/api` is the single `npm:` (no JSR equivalent) — justified inline; crypto uses WebCrypto + `@std/encoding` |
| #3 no `any` | pass | typed facades; `unknown` + guards at the JSON boundary |
| #4 Tailwind | pass (N/A) | no UI |
| #5 gate | pass | full gate per child |
| #6 deno.lock | pass | regenerated by deno |
| #7 JSDoc | pass | FR-009 |
| #8 MVC | pass | crypto/telemetry are infrastructure; no DB in controllers |
| #9 commits | pass | one per child + `chore(deps)` for each new edge/package |
| DDD | pass | crypto is pure; telemetry is an adapter over the OTel API |
| Domain Model gate | pass | §6 |

### Complexity tracking

Two new packages in one epic is the notable cost. Justified: `crypto` is foundation-tier, security-sensitive, and reused by three children (and later by session/auth); `telemetry` is optional so `@opentelemetry/api` is never forced on an app that doesn't opt in. Putting either in `core` was considered and rejected (§12).

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/crypto` (NEW, foundation) | yes | `Crypt`, `Hash`, `sign`/`verify`, key material |
| `@lockness/telemetry` (NEW, optional) | yes | Tracing middleware + framework metrics + attribute allow-list; `npm:@opentelemetry/api` |
| `@lockness/core` | yes | `signedUrl` generator + `signed` verify middleware; soft-loads `telemetry`; gains a `crypto` edge; re-exports `Crypt`/`Hash`/`signedUrl` |
| `@lockness/contract` | yes | New `resolveKeyMaterial` (`crypto_key.ts`) — the single-home APP_KEY validator both `crypto` and `session` import (security S3 / A-F1) |
| `@lockness/session` | yes (small) | `secret.ts` delegates its key validation to `contract`'s `resolveKeyMaterial` (converges the duplicate this epic, not a follow-up) |
| `deps.policy.jsonc` | yes | add `crypto` (foundation, `allow: ["contract"]`), `telemetry` (implementation, **`allow: ["contract","hono"]`** type-imports — A-F2); `core.allow += crypto`, `core.soft += telemetry` — a `chore(deps)` commit |
| `config/` | maybe | app may document `APP_KEY`, `OTEL_DENO`, `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `@lockness/session` / `@lockness/auth` | no | their existing crypto is unchanged; convergence onto `@lockness/crypto` is a follow-up, not this epic |
| Docs | yes | observability + crypto + signed-URLs doc |

### Documentation (this feature)

```text
.specnaut/specs/170-observability-crypto/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Signed-URL canonicalisation mismatch (gen signs X, verify recomputes Y) → bypass or false-reject | One shared canonicalisation function used by both gen and verify (§5); SC-003 flips every component |
| A secret leaks into a span attribute | An explicit attribute allow-list builder (§5); FR-007 forbids body/headers/cookies; audit checks it |
| `APP_KEY` weak/absent → weak crypto | FR-004 fails closed in production; SC-006 proves it |
| IV reuse in AES-GCM (catastrophic) | Random 96-bit IV per `encrypt` call, never derived from data; SC-001 checks two encryptions differ |
| Crypto duplication (crypto vs session/auth) drifts | The new package is the single home; session/auth convergence filed as follow-ups; the plan does not fork the logic, it adds the shared home |
| Built-in OTel does not survive `deno compile` | Verified at implement; if it fails, the app-wired-SDK path (research #2) is the documented fallback — does not change the framework surface |
| Two new packages inflate the workspace | Each maps to a distinct child + tier; `core`-only was rejected for the reasons in §12 |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Verdict: **needs_followup** — 0 critical/high, 3 MEDIUM, 2 LOW. The two-new-packages + `@lockness/crypto`-as-foundation calls were **explicitly cleared** (3 present consumers + the redis-in-#217 precedent; no cycle).*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A-F1 | MEDIUM — §5 "single home" for APP_KEY material not delivered; FR-004 (`base64:`+32) could accept a key `session/secret.ts` rejects | **Plan changed.** Validator single-homed in `@lockness/contract` (`resolveKeyMaterial`), rejecting placeholder + degenerate keys; `session/secret.ts` delegates to it this epic (§8, FR-004). Merges with security S3 |
| A-F2 | MEDIUM — `@lockness/telemetry`'s own `contract`/`hono` edges undeclared in §8 → `deps:analyze` would fail | **Plan changed.** §8 now declares `telemetry` `allow: ["contract","hono"]` in the same `chore(deps)` commit |
| A-F3 | MEDIUM — §1's "three ad-hoc SHA-256 copies" miscounted as convergence targets (they are coincidental; unifying token-hash onto 600k-PBKDF2 = self-DoS) | **Plan changed.** §1 corrected: 3 real candidates (`secret.ts`/`cookie_seal.ts`/`password.ts`); the SHA-256 sites recorded as out-of-scope coincidental similarity |
| A-F4 | LOW — "converge later" is debt until filed | **Accepted** — the session/auth convergence follow-ups are filed at merge and cited in §12 (secret.ts converges *this* epic; cookie_seal/password are the follow-ups) |
| A-F5 | LOW — `OTEL_DENO` unset → silent no-op reads as broken | **Accepted** — the observability doc leads with the `OTEL_DENO=1` + endpoint precondition and the no-op-when-unset behaviour |

**Verdict**: **needs_followup** → folded. Covered decision-table completeness, home correctness (new crypto package + optional telemetry both confirmed right; core→crypto no cycle), a counted blast radius (1 new static edge + 1 soft edge, 2 new package entries, 3 real convergence candidates), and three-cycles-out findings.

## 11. Security audit

*Findings from the `security-expert` (load-bearing for this crypto epic) run against THIS document, in parallel. Verdict: **fail** — 0 critical, 4 HIGH, 5 MEDIUM, 1 LOW. All folded as spec-tightening before any code — the wire-format / canonicalisation decisions are cheap now and impossible-to-fix after they ship.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | **HIGH** — signed-URL canonical byte-string unspecified → forgeable on the unauthenticated bypass surface | **Plan changed.** FR-005/006: one shared `canonicalise()` (sorted params, duplicates forbidden, appended-invalidates, Hono-decode-safe, host from `APP_URL`), timing-safe, fail-closed 403 on decode error; SC-003 adds reorder/duplicate/appended/encoding cases |
| S2 | **HIGH** — span attribute allow-list permitted resolved param **values** → ships this epic's own signatures/tokens to the trace backend | **Plan changed.** FR-007: allow-list is names/shapes only — route **pattern**, not resolved values; SC-007 asserts no param value appears |
| S3 | **HIGH** — a second APP_KEY validator weaker than `session/secret.ts` → session-less app runs `Crypt` on a public placeholder key | **Plan changed.** Validator single-homed in `@lockness/contract`, rejecting placeholder + degenerate keys (FR-004, §8). Merges with architecture A-F1 |
| S4 | **HIGH** — `span.recordException` ships credential-bearing error messages (confirms [#261](https://github.com/locknessland/lockness-monorepo/issues/261)) | **Plan changed.** FR-007: exceptions recorded via `renderError` (type + redacted message, no stack); inherits and references #261 |
| S5 | MEDIUM — Crypt wire format: random-IV 2³² GCM bound | **Plan changed.** FR-001: fresh per-call HKDF salt in the wire (each key encrypts one message) + version prefix as GCM AAD |
| S6 | MEDIUM — HMAC signer key not domain-separated | **Plan changed.** FR-003: HKDF with a distinct `info`; single-homed `info`-label registry |
| S7 | MEDIUM — ephemeral dev-key could run in prod on ambiguous env | **Plan changed.** FR-004: dev key only on explicit non-prod; unset/ambiguous → production (fail closed); SC-006 extended |
| S8 | MEDIUM — signed URLs are bearer credentials; replay-within-TTL | **Plan changed.** FR-008a: documented bearer/replay semantics, short TTLs, single-use = app-side nonce (out of scope) |
| S9 | MEDIUM — FR-004 "Hash salting" via APP_KEY breaks rotation | **Plan changed.** FR-002: `Hash` mirrors `password.ts` — random per-hash salt, **no `APP_KEY` pepper** |
| S10 | LOW — rejection responses must stay generic (no oracle) | **Plan changed.** FR-006: generic 403, no computed HMAC; Crypt typed error carries no key/ciphertext |

**Verdict**: **fail** → resolved in-plan. The four HIGH (canonicalisation, span param values, weak key validator, exception message leak) are the migration-vs-edit asymmetries the plan-time audit exists to catch; all are now spec, closed before code.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — Hash semantics + auth dedup.** Password-grade PBKDF2 facade; auth dedup now or follow-up? | **Semantics RESOLVED by security S9** → password-grade PBKDF2, random salt, **no `APP_KEY` pepper** (mirrors `password.ts`). **Auth dedup = FOLLOW-UP** (user, 2026-09-04): `#223` ships `Crypt`/`Hash`/`sign` in `@lockness/crypto`; `auth/password.ts` converges onto `crypto.Hash` in a filed follow-up — keeps this (already large) epic bounded. | 2026-09-04 |
| **Q2 — crypto home.** | **RESOLVED by both audits → new `@lockness/crypto` foundation package.** Architecture cleared it as justified (3 present consumers + the redis-in-#217 precedent), not speculative generality; no cycle (`core→crypto→contract` stays a DAG). | 2026-09-04 |
| **Q3 — OTel home + approach.** | **RESOLVED by architecture audit → new `@lockness/telemetry` optional package**, soft-loaded by core (the `tryImportOptionalPackage`/devtools precedent), `npm:@opentelemetry/api` only, leaning on Deno's built-in OTel (app opts in with `OTEL_DENO=1`). | 2026-09-04 |

### Decided without asking

- **`deno compile` + built-in OTel** (Q-ish): accept the built-in path; verify survival under `deno compile` at implement; if it fails, the documented fallback is the app-wired SDK — the framework surface is unchanged either way.
- **Signed URLs live in `@lockness/core`** (not crypto): generation needs `route()`/`namedRoutes`/`APP_URL` (all in core) and the middleware needs the request; only the HMAC primitive lives in `crypto`.
- **AES-256-GCM + HKDF, random IV, version-prefixed wire** — mirrors the proven `cookie_seal.ts` construction rather than inventing one; domain-separation `info` distinct from the session cookie's.
- **The framework emits no OTLP exporter** — the app owns the backend (epic "no hosted backend" out-of-scope aligns).
- **Child dependency order**: #223 crypto (`@lockness/crypto` + the `contract` key-validator) → #224 signed URLs (core, needs crypto's HMAC) → #222 OTel (`@lockness/telemetry`, independent, last). *(#222 could go first as it's independent, but crypto is the foundational dependency of #224, so crypto leads.)*
- **Convergence follow-ups (architecture A-F4)**: `session/secret.ts` delegates to `contract`'s `resolveKeyMaterial` **in this epic** (kills the key-validator duplication). `cookie_seal.ts` → `Crypt` and `auth/password.ts` → `Hash` convergence are **filed follow-ups** at merge, not this epic. The three SHA-256 sites (`redis`/`socialite`/`auth-provider`) are **out of scope** — coincidental similarity, never to be unified onto `Hash` (A-F3).
