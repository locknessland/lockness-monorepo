# Tasks: Observability + crypto helpers (epic #221)

**Plan**: [plan.md](./plan.md) | **Branch**: `170-observability-crypto` | **Epic**: #221

**Epic loop unit = one child = one commit.** Three children in dependency order; commit scope carries
`T01`..`T03`. `T00N` inside a child = internal TDD steps → one commit per child. A trailing
`docs(...)` commit (no T-ordinal) carries the observability+crypto doc. The `contract` key-validator +
`@lockness/crypto` land inside T01 (the foundational child). `chore(deps)` commits for each new edge.

TDD mandatory. Fast gate per child; full gate + review at the end of `implement`. Decision-table homes
(plan §5) binding. **Security spec is load-bearing** — the SC-001..SC-007 + FR hardening are the point.

---

## Child T01 — #223 Crypt / Hash facade (+ the contract key-validator)

**Goal**: `@lockness/crypto` (foundation) with `Crypt` (AES-256-GCM, per-call HKDF salt, AAD), `Hash`
(PBKDF2 600k, random salt, no pepper), `sign`/`verify` (HMAC, distinct HKDF info). APP_KEY validation
single-homed in `@lockness/contract` (rejects placeholder/degenerate; fail-closed via one `isProduction`).
**Independent test**: encrypt/decrypt round-trip + tamper-fails (SC-001); hash make/check timing-safe
(SC-002); sign/verify; missing/placeholder/degenerate key fails closed incl. ambiguous env (SC-006).

- [X] T001 [US2] Add `resolveKeyMaterial` to `@lockness/contract` (`crypto_key.ts`): validate `base64:`+32, reject the known-placeholder list + degenerate keys, fail closed on ambiguous env via the existing `isProduction` (`environment.ts`). Re-export from contract; tests. Have `packages/session/secret.ts` delegate to it (wrap in `SessionSecretError`), keeping session tests green.
- [X] T002 [US2] `chore(deps)`: new `crypto` package entry (foundation, `allow: ["contract"]`) in `deps.policy.jsonc`; `packages/crypto/deno.json` (imports `@lockness/contract`, `@std/encoding`); `core.allow += crypto`. Verify `deno task deps:analyze`. **Own commit** before T01's feat.
- [X] T003 [US2] Write failing tests `packages/crypto/tests/{crypt,hash,sign}.test.ts`: `Crypt.decrypt(encrypt(x))===x`; a flipped ciphertext byte → fail (no plaintext); two encryptions differ (per-call salt); AAD version bound. `Hash.make/check/needsRehash` timing-safe, random salt (two hashes of same input differ), no APP_KEY dependence. `sign/verify` HMAC timing-safe, wrong sig fails.
- [X] T004 [US2] Create `packages/crypto/{key.ts→re-export contract,crypt.ts,hash.ts,sign.ts,mod.ts}`: HKDF-SHA-256 derivation with a single-homed `info`-label registry (Crypt/sign/… distinct, none equal the session cookie's `lockness/session/cookie/v1`); mirror `cookie_seal.ts` construction. No `any`; JSDoc. `deno.json`, `README.md`, `AGENTS.md`.
- [X] T005 [US2] Fast gate for contract/session/crypto; commit `feat(T01): Crypt/Hash/sign facade in @lockness/crypto + contract key-validator (#223)` + `Epic: #221`.

## Child T02 — #224 signed / temporary route URLs (depends on T01)

**Goal**: `signedUrl` generator + `signed` verify middleware in core, using `crypto.sign` and one shared
`canonicalise()`. **Independent test**: valid verifies; reorder/duplicate/appended/encoding/stripped-sig/
expired all fail (SC-003); generic 403.

- [X] T006 [US3] `chore(deps)` if needed: confirm `core.allow` includes `crypto` (from T02 of #221 deps) — it was added in T002; no further edge. (Skip commit if already present.)
- [X] T007 [US3] Write failing tests `packages/core/tests/signed_url.test.ts`: a `signedUrl('name',{id},{expiresIn})` verifies; each mutation fails — flip a char, **reorder query params**, **duplicate `expires`**, **append a param**, **strip `signature`**, **expired**, and the **Hono-decoded-path** round-trip; 403 body is generic (no HMAC echo).
- [X] T008 [US3] Create `packages/core/routing/signed_url.ts`: `canonicalise(url)` (sorted params, duplicates rejected, minus `signature`, host from `APP_URL` config, Hono-decode-safe) + `signedUrl(name, params?, {expiresIn?|expiresAt?})` using `route()`+`APP_URL`+`crypto.sign`. Export via `core/mod.ts`.
- [X] T009 [US3] Create `packages/core/http/signed_url_middleware.ts`: `@DeclareMiddleware('signed')` — recompute via the SAME `canonicalise()`, timing-safe compare (`crypto.verify`), expiry check, generic 403 before handler; fail-closed on decode error. Register the middleware name.
- [X] T010 [US3] Fast gate for core; commit `feat(T02): signed/temporary route URLs + verify middleware (#224)` + `Epic: #221`.

## Child T03 — #222 OpenTelemetry tracing + metrics (independent; last)

**Goal**: `@lockness/telemetry` (optional, soft-loaded by core like devtools) — a request-span enrichment
middleware (attribute allow-list: route **pattern**, never param values; exceptions via `renderError`,
no stack) + framework metrics; `npm:@opentelemetry/api`; no-ops when `OTEL_DENO` unset.
**Independent test**: attribute builder emits only allow-listed names (no param value — SC-007); exception
recording is redacted; middleware no-ops with the API's no-op provider (no OTEL_DENO).

- [X] T011 [US1] `chore(deps)`: new `telemetry` package entry (implementation, `allow: ["contract","hono"]`) in `deps.policy.jsonc`; `packages/telemetry/deno.json` (`npm:@opentelemetry/api` with inline hard-rule-#2 justification comment); `core.soft += telemetry`. Verify `deno task deps:analyze`. **Own commit** before T03's feat.
- [X] T012 [US1] Write failing tests `packages/telemetry/tests/{attributes,middleware}.test.ts`: `buildAttributes(ctx)` returns only route pattern / controller.method / mount / method / status — **no resolved param values** (plant a token, assert absent, SC-007); exception recording routes through `renderError` (plant a secret in a message, assert redacted); the middleware is a no-op (no throw, no span export) when `OTEL_DENO` is unset (no-op provider).
- [X] T013 [US1] Create `packages/telemetry/{attributes.ts,middleware.ts,mod.ts}`: the allow-list attribute builder + the tracing middleware (`tracer.startActiveSpan`, child of Deno's server span, framework metrics via `meter.createCounter/Histogram`), exceptions via `renderError`. `deno.json`, `README.md`, `AGENTS.md`.
- [X] T014 [US1] Soft-load in core: a bootstrap step (mirroring `steps/devtools.ts`) that `tryImportOptionalPackage('@lockness/telemetry')` and installs the middleware early in the chain when present. Test the wiring (present → installed; absent → skipped).
- [X] T015 [US1] Fast gate for telemetry + core; commit `feat(T03): OpenTelemetry span enrichment + metrics in @lockness/telemetry (#222)` + `Epic: #221`.

## Trailing docs (non-child)

- [X] T016 Write `docs/observability-and-crypto.md`: Crypt/Hash/sign usage; signed URLs (generation + `signed` middleware, bearer/replay/short-TTL note — S8); OTel setup **leading with `OTEL_DENO=1` + `OTEL_EXPORTER_OTLP_ENDPOINT`** and the no-op-when-unset behaviour (A-F5); APP_KEY generation/validation. Doc index. Commit `docs(#221): document observability + crypto helpers` + `Epic: #221`.

---

## Dependencies

```
T01 (#223 crypto + contract validator) ──▶ T02 (#224 signed URLs, needs crypto.sign) ──▶ docs
                                        └──▶ T03 (#222 OTel, independent)
```

- T01 leads (crypto is #224's foundation; the contract validator resolves security S3).
- T02 needs T01's `sign`. T03 is independent (could parallel) but the loop commits sequentially.

## Implementation strategy

**MVP = T01 + T02** (crypto facade + signed URLs — the security-critical core). T03 (OTel) completes the
epic. All ship in this branch; children close at merge. Follow-ups (auth/password → crypto.Hash,
cookie_seal → Crypt convergence) filed at merge.
