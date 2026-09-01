# Tasks: Cookie absolute-lifetime cap + per-session revocation (#143)

**Input**: `.specnaut/specs/011-cookie-absolute-lifetime/plan.md` (the one design document)
**Branch**: `011-cookie-absolute-lifetime`

**Tests**: REQUIRED (TDD). The success criteria ARE the security controls; a failing test comes first
for each. Two controls are only meaningful under adversarial tests: SC-001 must **re-seal across the
boundary** (a clock-only test passes against the inert mechanism), and SC-010 must **inject a KV
error** (a KV-up test passes against a fail-open bug).

**Organization**: by user story. Ordering is deliberate — the shared `IssuedIdentity`/richer-open
seam (Phase 2) precedes both halves; the cap (US1) precedes revocation (US2) which precedes the auth
wiring (US3) which is what makes revocation functional end-to-end.

## Format: `[ID] [P?] [Story] Description`

- Decision-table / §13 homes are named inline; a task may not spell a rule anywhere but its home.

---

## Phase 1: Setup

- [ ] T001 Confirm no new dependency is needed: `crypto.getRandomValues`/`crypto.subtle` are globals already used in `cookie.ts`; `@std/testing` (FakeTime) and `@std/assert` are already declared. No `deno.json` change.

## Phase 2: Foundational (the shared seam — blocks US1 and US2)

- [ ] T002 Add `IssuedIdentity { iat: number; jti: string }` to `packages/session/drivers/cookie.ts` (or a small local type) — the first-issuance identity preserved across re-seals (plan §13). One value object, not two parallel `iat`/`jti` stashes (Architecture F4).
- [ ] T003 Introduce an internal richer-return helper in `cookie.ts` so `open()` can **surface** `{ data, iat, exp, jti }` without changing the public `open(secret, value, absoluteLifetime?)` signature (still returns `SessionData | null`; ~25 existing call sites compile unchanged). This is the seam the cap check (US1) and the revocation check (US2) both read (Architecture F3 — `open()` stays pure, no I/O).
- [ ] T004 [P] Add a `#issued?: IssuedIdentity` field to `CookieSessionDriver`; `read()` stashes it from the richer open; `seal(secret, data, lifetime, issued?)` takes it as one arg. Pure plumbing; behaviour unchanged until US1/US2 use it.

## Phase 3: US1 — the absolute cap (P1, security)

**Goal**: a re-sealed session ages out at `iat + absoluteLifetime` (plan FR-001..FR-004).
**Independent test**: re-seal across the boundary → refused; within → accepted; missing iat → refused.

- [ ] T005 [US1] Failing test in `packages/session/tests/cookie_absolute_lifetime.test.ts` (FakeTime): a session **re-sealed on each tick** (feed each re-sealed cookie back into `open()`) is refused once `now - iat > absoluteLifetime` (SC-001 — a clock-only test is forbidden); a session within the cap is accepted (SC-002); a payload with missing/non-number `iat` is refused (SC-003).
- [ ] T006 [US1] Implement `iat` preservation: `seal()` reuses `#issued.iat` for an already-issued session, mints fresh for a new one; `regenerate()` resets, a new session mints (plan FR-004, home: `cookie.ts` + `#issued`). Without this the cap is inert (Security F1).
- [ ] T007 [US1] Implement the cap + `iat`-present gate in the open path: refuse when `typeof absoluteLifetime === 'number'` (NOT truthiness — `0` must not disable it) and `now - iat > absoluteLifetime`, or `iat` missing/non-number (plan FR-001/FR-002/FR-003). New `Rejection` member `'absolute-expired'` (log-only, plan FR-006). Home: the open path; `read()` passes `this.config.absoluteLifetime`.

## Phase 4: US2 — per-session revocation store (P1, security)

**Goal**: a revoked jti is refused, fail-closed (plan §13, FR-010..FR-014).
**Independent test**: revoked jti → refused; KV error → refused (fail-closed); jti ≥128-bit stable across re-seals.

- [ ] T008 [US2] NEW `packages/session/tests/fake_revocation_store.ts` + failing tests in `packages/session/tests/cookie_revocation.test.ts`: a revoked jti is refused (SC-006 at the driver level); a jti is preserved across re-seals so revocation can't be shed (SC-007); a store whose read throws makes `read()` **refuse** (SC-010 fail-closed); a store whose `revoke()` throws **propagates** from `destroy()`.
- [ ] T009 [US2] NEW `packages/session/drivers/revocation_store.ts` — the `RevocationStore` port (`isRevoked(jti): Promise<boolean>`, `revoke(jti, ttlSeconds): Promise<void>`) + a Deno-KV adapter keyed `['session-revoked', jti]`, **strong consistency** reads (eventual forbidden — Security F3), single-flight open + disposable (the `deno_kv.ts` pattern, on the store). Home: this file.
- [ ] T010 [US2] Mint the jti as **≥128 bits from `crypto.getRandomValues`** in `seal()` for a new session (plan §13, Security F5); never log it (keep it out of every `refuse`/summary line). jti-less pre-feature cookie → mint on first re-seal (Security F7).
- [ ] T011 [US2] Wire the revocation **decision** into `read()` (NOT `open()` — Architecture F3): after a successful open, if `jti` present and `store.isRevoked(jti)` → refuse `'revoked'`; a KV error → refuse (fail-closed, Security F2). Home: `cookie.ts` `read()`.
- [ ] T012 [US2] `destroy()`: revoke the current `#issued.jti` with `ttl = iat + absoluteLifetime - now` (fixed-max so raising the cap can't resurrect — Security F6), emit a cookie **deletion**, and **suppress the trailing re-seal** in the same request (the `destroy()`→`save()`→`write()` trap — Architecture F2). `regenerate()`: revoke the old jti **then** reset `#issued` (the two are NOT symmetric — plan §13 step 4).
- [ ] T013 [US2] Memoize the `RevocationStore` in `packages/session/drivers/registry.ts` (single-flight + disposable **on the store**), inject it **by reference** into the per-request cookie branch; `createDriver` (`drivers/mod.ts`) gains the store param (Architecture F1 — the driver never opens a per-request handle). Export the `RevocationStore` type from `packages/session/mod.ts`.

## Phase 5: US3 — end-to-end logout wiring (P1, security — makes revocation functional)

**Goal**: `SessionGuard.logout()` actually revokes (Security F1 — the decisive fix).
**Independent test**: driving `logout()` then replaying the captured cookie → refused.

- [ ] T014 [US3] Failing end-to-end test (in `@lockness/auth` tests): `SessionGuard.logout()` → replay the pre-logout session cookie → refused (SC-009); after logout the remember-me token is invalidated (SC-011).
- [ ] T015 [US3] Rewire `packages/auth/guards/session_guard.ts` `logout()` to call `session.destroy()` (reaching `driver.destroy()`→revoke), not only `forget()` (Security F1); and **always** invalidate the remember-me token — drop the `if (this.viaRemember && user)` gate at `:394` (Security F4). Confirm `store.destroy()` reaches `driver.destroy()`.

## Phase 6: Config threading & boot gate (blocks correct behaviour of US1/US2)

- [ ] T016 Failing test: a **non-default** `absoluteLifetime` from kernel config reaches `open()` (SC-005), `absoluteLifetime: 0` does not disable the cap, and enabling `revocation` without `absoluteLifetime` is **refused at boot** (SC-008).
- [ ] T017 Thread `absoluteLifetime?` and `revocation?` through: `packages/session/types.ts` `SessionConfig`; `packages/core/kernel/kernel_decorators.ts` input `SessionConfig` (**corrected path** — Architecture MED2); `packages/core/kernel/bootstrap/helpers.ts` — **both** `NormalizedSessionConfig` (`:61`) **and** the `normalizeSessionConfig` return (`:163`) (the silent-drop point), applying opt-in pass-through, rejecting `absoluteLifetime <= 0`, and refusing `revocation` without `absoluteLifetime`. `packages/session/config.ts`/`middleware.ts` need **no logic change** (generic spread — Architecture MED3).

## Phase 7: Docs & polish

- [ ] T018 [P] `packages/session/docs/DOCS.md`: `lifetime` = idle window, `absoluteLifetime` = hard ceiling (opt-in, undefined=off, **recommend 604800 / 7 days**); revocation opt-in requires the cap; the residuals — logout revokes the session cookie (and now the remember token) but not future re-issued credentials; per-user "log out everywhere"/password-change eviction NOT covered; theft-within-window bounded not eliminated; a cap below the idle window evicts sooner; lower-safe/raise-does-not-re-horizon (plan FR-007, Security F4/F6).
- [ ] T019 [P] `packages/auth/docs/DOCS.md`: `logout()` now revokes the session and the remember-me token.
- [ ] T020 [P] JSDoc: `open()`/`seal()` new params, `RevocationStore`, `destroy()`/`regenerate()` (no longer no-ops under revocation), the config fields. Hard rule #7.
- [ ] T021 Full gate: `deno fmt && deno lint && deno check <touched> && deno task test` green (hard rule #5). `deno task agents:brief` if a package surface changed.

---

## Dependencies & execution order

```
Phase 1 → Phase 2 (T002→T003→T004: the shared seam)
   → Phase 3 US1 cap (T005→T006→T007)
   → Phase 4 US2 store (T008→T009→T010→T011→T012→T013)
   → Phase 5 US3 auth wiring (T014→T015)   ← makes revocation functional (Security F1)
   → Phase 6 config/boot (T016→T017)
      → Phase 7 docs/polish (T018-T020 [P]) → T021 gate
```

- **Security ordering**: US1's `iat` preservation (T006) underpins US2's TTL (T012); US3 (T015) is what makes SC-006 true end-to-end — revocation is not "done" until the logout wiring lands.
- **Fail-closed is not optional**: T011/T008 pin it; a fail-open KV check ships a non-functional control (Security F2).

## Parallel opportunities

- Phase 2: T004 ∥ (after T002/T003).
- Phase 7: T018 ∥ T019 ∥ T020, then T021 alone.

## MVP scope

US1 (cap, T005-T007) is a shippable increment on its own. US2+US3 (revocation, end-to-end) is the
second increment the user ruled in — the two together are the full #143 build.

## Format validation

All 21 tasks carry a checkbox, sequential ID, and story label where required; exact file paths named.
