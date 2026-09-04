# Plan — PKCE (S256) for the socialite OAuth flow (#243)

Child of security epic **#164** (fail-closed framework defaults), split from
**#169** (which shipped OAuth `state` login-CSRF via an HttpOnly double-submit
cookie). This is #164's last open child.

## 1. Why this exists

`packages/socialite/mod.ts` runs the authorization-code OAuth flow but does not
send a PKCE challenge. PKCE (RFC 7636, S256) binds the authorization request to
the token exchange, defending against authorization-code injection and
interception. The socialite drivers are **confidential** clients (`getTokens`
sends `client_secret`), so PKCE here is **additive defence-in-depth** layered on
top of the #169 `state` defence — recommended by the 2026-09-04 security audit
(M3) and split out because provider support varies and it needs a per-provider
capability path.

## 2. User scenarios

**P1 — a login is PKCE-protected end to end.**
- **Given** an app calls `socialite('google').redirect()`, **When** the redirect
  is built, **Then** the response carries `code_challenge` +
  `code_challenge_method=S256` in the auth URL and a short-lived HttpOnly cookie
  holding the matching `code_verifier`.
- **Given** the provider calls back with a code and the verifier cookie is
  present, **When** `user(c)` runs, **Then** the token exchange includes
  `code_verifier` and succeeds.

**P2 — a provider that rejects PKCE is unaffected.**
- **Given** a driver declaring `usesPkce = false`, **When** it runs
  `redirect()`/`user()`, **Then** behaviour is byte-identical to before this
  change — no challenge, no verifier cookie, no `code_verifier`.

**Edge cases:** verifier cookie absent at callback on a PKCE driver (fail closed,
FR-006); two Set-Cookie headers (state + verifier) on one redirect response;
the Google `getAuthUrl` override must still carry the challenge (guaranteed by
FR-002's design — injection is in `redirect()`, not `getAuthUrl`); concurrent
same-browser flows share the cookie (accepted, FR-008 bounds it).

## 3. Requirements

- **FR-001** — A named `generatePkceVerifier()` helper mints a `code_verifier` =
  base64url-unpadded of 32 CSPRNG bytes (`crypto.getRandomValues`) → 43 chars in
  RFC 7636 §4.1's unreserved set. `redirect()` stores it in a short-lived
  HttpOnly cookie via `buildPkceCookie()`, mirroring the state cookie's posture
  (Path=/, `Max-Age = OAUTH_VERIFIER_TTL ≈ 600`, HttpOnly, SameSite=Lax, Secure
  unless explicitly development). The cookie uses the **`__Host-` prefix** when
  Secure is set (`__Host-lockness_pkce_verifier`), falling back to the
  unprefixed name only on the explicit-development non-Secure path. Its name is
  the single constant `OAUTH_VERIFIER_COOKIE`.
- **FR-002** — `redirect()` computes `code_challenge` =
  BASE64URL-UNPADDED(SHA-256(**ASCII of the verifier string**)) via
  `pkceChallenge(verifier)` and **appends** `code_challenge` +
  `code_challenge_method=S256` to the URL returned by `getAuthUrl(state)`. The
  injection lives in the non-overridable `redirect()`, **not** in `getAuthUrl` —
  so no driver override (present or future) can strip the challenge (audit
  ARCH-1 / SEC-1). `getAuthUrl`'s signature is therefore **unchanged**.
- **FR-003** — `user()` reads the verifier cookie and passes it to
  `getTokens(code, codeVerifier?)`, which includes `code_verifier` in the token
  body. The three bundled drivers do not override `getTokens`, so this is
  non-bypassable for shipped code; a **custom** driver overriding `getTokens`
  must forward `codeVerifier` (documented in §6).
- **FR-004** — PKCE is gated by a per-provider capability `usesPkce` (a
  `protected` field on `BaseOAuth2Driver`, default **true**). A driver setting it
  `false` emits no challenge, sets no verifier cookie, and its token exchange is
  unchanged.
- **FR-005** — `redirect()` stays **synchronous** (`: Response`); `pkceChallenge`
  imports `{ crypto } from '@std/crypto'` and calls
  `crypto.subtle.digestSync('SHA-256', …)` (the sync digest lives only on the
  `@std/crypto` export, not the platform global). The `SocialiteDriver` interface
  and `redirect()`/`user()` signatures do not change shape.
- **FR-006** — When a driver has `usesPkce` true and a code is present at callback
  but the verifier cookie is **absent**, `user()` fails closed (throws) rather
  than exchanging without a verifier.
- **FR-007** — Tests cover: the challenge/verifier round-trip against an
  **independently** computed base64url-unpadded SHA-256 of the verifier string
  (not the helper re-run), asserting the verifier carries no `=` padding; the
  token-exchange parameter (`getTokens` sends `code_verifier`); the capability
  off-path (no challenge, no cookie); and the FR-006 fail-closed throw.
- **FR-008** — *(Accepted decision — not implemented as clear-on-use.)* `user()`
  resolves a `SocialUser` and does not build the response, so it has no reliable
  path to expire the verifier cookie (a caller may return a response `user()`
  never sees). The verifier's single-use is therefore bounded by its short
  `Max-Age` and the provider's single-use authorization code — the **same
  accepted posture as the #169 state cookie**, which is likewise not cleared.
  This is the accepted-decision option the security audit offered for SEC-2.
- **FR-009** — The `code_verifier` value appears **only** in the token-exchange
  body: it is never logged and never interpolated into the FR-006 throw message
  (mirroring the existing state-mismatch error, which does not echo its value).

## 4. Success criteria

- **SC-001** — A `redirect()` from a PKCE driver yields an auth URL with
  `code_challenge_method=S256` and a verifier cookie whose value, hashed by an
  **independent** base64url-unpadded SHA-256 of the string, equals the challenge.
- **SC-002** — A callback `user()` on a PKCE driver sends `code_verifier` in the
  token request body.
- **SC-003** — A `usesPkce = false` driver produces byte-identical
  redirect/token behaviour to before this change.
- **SC-004** — `redirect()` remains synchronous (no `await` at call sites).

## 5. 🔒 The decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| A verifier is minted (43-char base64url, 256-bit CSPRNG, unreserved set) | `generatePkceVerifier()` in `mod.ts` (mirrors `generateState()`) | a second inline `getRandomValues`/encode in `redirect()` or a driver |
| The verifier is stored in an HttpOnly cookie | `buildPkceCookie()` + `redirect()` in `mod.ts` | a cookie built inline elsewhere |
| The verifier cookie **name/TTL** | the `OAUTH_VERIFIER_COOKIE` / `OAUTH_VERIFIER_TTL` constants | a literal cookie name in `user()` or the builder |
| The S256 challenge is derived from the verifier | `pkceChallenge(verifier)` in `mod.ts` (sync `@std/crypto` digest) | an inline digest in `redirect()` or a driver |
| The challenge is added to the auth URL | `redirect()` appends it to `getAuthUrl`'s result | any `getAuthUrl` implementation adding `code_challenge` itself |
| The verifier is added to the token exchange | `getTokens(code, verifier?)` in the base driver | a second body assembly in `user()`; a custom override silently dropping it |
| Whether a provider does PKCE | the `usesPkce` flag on the driver | a provider-name list checked in `redirect()`/`user()`; an env toggle read twice |
| A missing verifier at callback fails closed | the verifier check in `user()` (FR-006) | a silent no-PKCE fallback anywhere in the exchange |

## 6. Technical context

**Language/Runtime:** TypeScript on Deno. **Package:** `@lockness/socialite`.
**New deps (JSR):** `@std/crypto` (`digestSync`) and `@std/encoding`
(`encodeBase64Url`), declared in `packages/socialite/deno.json`. Both external
JSR deps, not `@lockness/*` → **no new workspace edge**, deps.policy unchanged.

**Capability scope:** `usesPkce` is a `BaseOAuth2Driver` feature, **not** on the
exported `SocialiteDriver` interface — a consumer implementing that interface
directly owns `redirect()`/`user()` wholesale and their own PKCE (audit ARCH-5).
A **custom driver that overrides `getTokens`** must forward `codeVerifier`, or
its PKCE token binding is silently absent (audit SEC-1 residual); this is a
documented contract, not enforced by the type system.

**Future note (audit ARCH-4):** a third auth/token optional param (nonce, PAR,
`response_mode`) is the trigger to Introduce Parameter Object; two positional
optionals stay for now.

**Domain:** no business entities. PKCE is two value-shapes — a secret
`code_verifier` (cookie-borne) and its public `code_challenge` (URL-borne).
**Invariant:** `challenge == BASE64URL-UNPADDED(SHA-256(ASCII(verifier)))`; the
verifier never leaves the HttpOnly cookie except in the token body (FR-009).

**Rejected alternative (challenge home):** inject the challenge in `getAuthUrl`
(base + Google override, via a shared helper). Rejected — `getAuthUrl` is the
documented extension point; an override that forgets the helper would ship a
verifier with no challenge and **not** fail closed (audit ARCH-1). Injecting in
`redirect()` removes the obligation entirely.
**Rejected alternative (sync):** make `redirect()` async to use the global async
`crypto.subtle.digest`. Rejected — breaks the public `redirect(): Response`
signature, the interface, and every `return socialite(x).redirect()` call site
(0 forced by the chosen design; ~4 by this one), for no security gain.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | ✅ uses the existing alias; PKCE adds none |
| JSR-only deps, declared per package | ✅ `@std/crypto` + `@std/encoding` pinned in `socialite/deno.json` |
| No `any` in exported APIs | ✅ helpers internal; concrete types |
| JSDoc on public APIs | ✅ changed methods keep/extend JSDoc |
| Fail-closed defaults | ✅ FR-004 default-ON, FR-006 throws, FR-008 single-use |
| Never modify `deno.lock` by hand | ✅ regenerated via `deno cache` if needed |

No violations → no Complexity Tracking entries.

## 8. Surface impact

- **`packages/socialite/mod.ts`** — the only runtime surface. **Signature
  changes: one** — `getTokens(code, codeVerifier?)` (optional arg →
  backward-compatible). `getAuthUrl`, `redirect()`, `user()` signatures and the
  `SocialiteDriver` interface are **unchanged**. Blast radius (counted): 0 forced
  production call-site edits; ~4 test files gain assertions; Google is the only
  `getAuthUrl` override (unaffected by design); no bundled `getTokens` override.
- **`packages/socialite/deno.json`** — two new JSR imports.
- No FE surface (server-side OAuth adapter) → no artifacts section, no a11y gate.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| A bundled provider rejects `code_challenge` | All three support S256 today; `usesPkce=false` is an instant per-driver off-switch |
| Custom `getTokens` override drops the verifier | Documented contract (§6); bundled drivers don't override it; `client_secret` remains the primary guard |
| S256 encoding footgun (hash raw bytes / padded) | FR-002 pins ASCII-string input + unpadded; SC-001 asserts against an independent computation |
| Verifier cookie injection (subdomain/network) | `__Host-` prefix + HttpOnly + Secure(prod) + SameSite=Lax + FR-008 single-use; #169 `state` blocks the pairing half |
| Two Set-Cookie headers collapsed to one | `Headers.append`, asserted in tests |

## 10. Architecture audit
*`architect-expert` against this plan — verdict: fail (1 HIGH, 2 MEDIUM, 4 LOW). All folded.*

| # | Finding | Resolution |
| :--- | :--- | :--- |
| ARCH-1 (HIGH) | `pkceAuthParams()` in `getAuthUrl` is an unenforced call obligation — a `usesPkce=true` driver overriding `getAuthUrl` (the documented extension point) silently ships no challenge and does not fail closed | **Plan changed** — FR-002 now injects the challenge in the non-overridable `redirect()` (append to `getAuthUrl`'s URL); `getAuthUrl` signature unchanged; no override can strip it |
| ARCH-2 (MED) | FR-001's verifier-generation rule had no home (inline in `redirect()`), asymmetric with `generateState()` | **Plan changed** — named `generatePkceVerifier()` helper + decision-table row 1 |
| ARCH-3 (MED) | Verifier cookie name/TTL is a key shared by writer and reader with no named home | **Plan changed** — `OAUTH_VERIFIER_COOKIE`/`OAUTH_VERIFIER_TTL` constants + decision-table row 3 |
| ARCH-4 (LOW) | Optional-positional params trend toward a long list | **Recorded** — §6 future note: third param → Introduce Parameter Object |
| ARCH-5 (LOW) | `usesPkce` is on the base class, not the `SocialiteDriver` interface | **Recorded** — §6 states PKCE is a `BaseOAuth2Driver` feature; direct interface implementers own their flow |
| ARCH-6 (LOW) | Verifier cookie never cleared after use | **Accepted decision** (FR-008) — `user()` returns a user, not a response, so it cannot reliably clear the cookie; single-use is bounded by Max-Age + the provider's single-use code, matching the #169 state cookie |

## 11. Security audit
*`security-expert` against this plan — verdict: needs_followup (1 MEDIUM, 4 LOW), no CRITICAL/HIGH. All folded. Framing: confidential clients (client_secret present) → PKCE is additive defence-in-depth, so PKCE-specific gaps top out at MEDIUM.*

| # | Finding | Resolution |
| :--- | :--- | :--- |
| SEC-1 (MED) | External drivers inherit `usesPkce=true` but a custom `getAuthUrl`/`getTokens` override can silently ship no PKCE while FR-006 stays quiet (cookie present) — the one exchange-without-verifier path | **Plan changed** — challenge injection moved to `redirect()` (FR-002) closes the `getAuthUrl` half entirely; the `getTokens` half is documented as a custom-override contract (§6, §9) with `client_secret` as the standing primary guard |
| SEC-2 (LOW) | Verifier cookie not cleared on use; lingers ≤600s, concurrent flows collide | **Accepted decision** (FR-008) — `user()` returns a user, not a response, so it cannot reliably clear the cookie; single-use is bounded by Max-Age + the provider's single-use code, matching the #169 state-cookie posture (the audit's sanctioned alternative to clearing) |
| SEC-3 (LOW) | Verifier cookie not `__Host-` prefixed | **Plan changed** — FR-001 uses `__Host-` when Secure |
| SEC-4 (LOW) | SC-001 round-trip would be tautological; the S256 encoding footgun could ship | **Plan changed** — FR-002/FR-007/SC-001 pin ASCII-string input, unpadded base64url, and an independent test computation |
| SEC-5 (LOW) | Plan never forbade logging/echoing the verifier | **Plan changed** — FR-009 |

Both audits confirmed the crypto (256-bit CSPRNG, S256, approved hash), the
server-side unforgeable capability, and that the drop-the-cookie downgrade is
closed by FR-006. Both recommend Q1 = default-ON.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — PKCE default: opt-out (`usesPkce=true`, on for all bundled providers — recommended by both audits, fail-closed posture) or opt-in (off unless a provider enables it)?** | **Opt-out — `usesPkce = true`.** Secure-by-default, matching epic #164's fail-closed posture; all three bundled providers support S256. A custom/legacy driver disables PKCE with `usesPkce = false`. | 2026-09-04 |
