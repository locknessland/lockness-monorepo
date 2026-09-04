# Tasks — PKCE (S256) for the socialite OAuth flow (#243)

Derived from the approved `plan.md`. Single feature, child of epic **#164** →
**one commit** on this branch: `feat(T01): … (#243)` with an `Epic: #164`
trailer. TDD (FR-007). All work is in `packages/socialite/`.

The 🔒 decision-table homes are binding: verifier → `generatePkceVerifier()`;
challenge → `pkceChallenge()`; cookie name → `OAUTH_VERIFIER_COOKIE`; challenge
injection → `redirect()` (never `getAuthUrl`); verifier at exchange →
`getTokens`; capability → `usesPkce`; fail-closed → `user()`; single-use →
`user()`.

## Phase 1 — Setup

- [ ] T001 Add `@std/crypto` and `@std/encoding` (pinned, JSR) to
  `packages/socialite/deno.json` imports.

## Phase 2 — Foundational (blocking prerequisites)

- [ ] T002 Add the PKCE primitives to `packages/socialite/mod.ts`: the
  `OAUTH_VERIFIER_COOKIE` / `OAUTH_VERIFIER_TTL` constants; `generatePkceVerifier()`
  (base64url-unpadded of 32 `crypto.getRandomValues` bytes); `pkceChallenge(v)`
  (`import { crypto } from '@std/crypto'` → `crypto.subtle.digestSync('SHA-256',
  new TextEncoder().encode(v))` → `encodeBase64Url`); `buildPkceCookie(v)`
  mirroring `buildStateCookie` with the `__Host-` prefix when Secure.
- [ ] T003 Add `protected usesPkce = true` to `BaseOAuth2Driver` (FR-004, Q1).

## Phase 3 — US1: a login is PKCE-protected end to end (P1) 🎯 MVP

**Independent test:** `redirect()` emits `code_challenge_method=S256` + a verifier
cookie whose value independently S256-hashes to the challenge; `user()` sends
`code_verifier` and clears the cookie.

- [ ] T004 [US1] TDD `redirect()`: when `usesPkce`, mint a verifier, append
  `code_challenge` + `code_challenge_method=S256` to the URL returned by
  `getAuthUrl(state)` (injection lives HERE, not in `getAuthUrl` — FR-002), and
  set the verifier cookie via `Headers.append('Set-Cookie', …)` alongside the
  state cookie. Tests in `tests/pkce.test.ts`: round-trip against an
  **independent** base64url-unpadded SHA-256 of the verifier string; assert the
  verifier carries no `=` padding (SC-001).
- [ ] T005 [US1] TDD `getTokens(code, codeVerifier?)` (base): include
  `code_verifier` in the token body when present (FR-003). Assert the exchange
  body carries `code_verifier` (SC-002).
- [ ] T006 [US1] TDD `user()`: read the verifier cookie; pass it to `getTokens`;
  on a `usesPkce` driver with a code but **no** verifier cookie, throw
  (FR-006) — and never echo the verifier in the message (FR-009); on success and
  on the throw path, clear the verifier cookie via `c.header('Set-Cookie', …
  Max-Age=0)` (FR-008). Tests for the fail-closed throw and the clear-on-use.

## Phase 4 — US2: a PKCE-disabled provider is unaffected (P2)

**Independent test:** a `usesPkce = false` driver's redirect/token output is
byte-identical to pre-PKCE.

- [ ] T007 [US2] TDD the off-path in `tests/pkce.test.ts`: a driver with
  `usesPkce = false` emits no `code_challenge`, sets no verifier cookie, and its
  token exchange sends no `code_verifier` (SC-003).

## Phase 5 — Polish & cross-cutting

- [ ] T008 JSDoc on every changed/added public member (hard rule #7); note in the
  driver docs that PKCE is a `BaseOAuth2Driver` feature and a custom `getTokens`
  override must forward `codeVerifier` (§6 contract).
- [ ] T009 Fast gate: `deno fmt && deno lint && deno check packages/socialite/**/*.ts
  && deno test -A packages/socialite/` + `deno task deps:analyze` green.

## Dependencies & order

```
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009
```

T002/T003 are foundational (all stories need them). US1 (T004–T006) is the MVP.
US2 (T007) reuses the same helpers. One commit for the whole child (#243).

## Notes

- **MVP** = US1 (T001–T006): PKCE actually protects the bundled flows.
- The single behavioural change ships default-ON for Google/GitHub/Discord (Q1).
- No workspace-edge change; `@std/*` are external deps (deps.policy untouched).
