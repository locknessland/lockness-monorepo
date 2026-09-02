# Tasks: Per-user session revocation

**Input**: `.specnaut/specs/021-per-user-session-revocation/plan.md` (approved at stop 1, 2026-09-02).
**Tests**: REQUIRED — FR-009 mandates TDD, each behavioural test **negative-tested** (fails against
the pre-fix code).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no dependency on an incomplete task)
- **[Story]**: US1 (log out everywhere) / US2 (log out others) / US3 (credential-change eviction)
- Every 🔒 task names its decision-table home (plan §5); no second spelling.

---

## Phase 1: Setup

No new scaffolding — additive change across `@lockness/session`, `@lockness/auth`, `@lockness/core`,
`@lockness/auth-provider`. Skip.

## Phase 2: Foundational (blocks all stories)

- [x] T001 🔒 Extend the `RevocationStore` port + `KvRevocationStore` in `packages/session/drivers/revocation_store.ts`: `revokeUser(sub, ttlSeconds)` and `userRevokedSince(sub): Promise<number | null>` (epoch-**seconds**), keyed `['session-user-revoked', sub]`, fail-closed / propagate like `revoke`/`isRevoked`. (§5 row 5.)
- [x] T002 🔒 Do **not** export `revokeUser`/`userRevokedSince` from `packages/session/mod.ts`; export only the `RevocationStore` type as today. Update the ~5 typed doubles in `packages/session/tests/cookie_revocation.test.ts` to stub the two new methods. (§5 row 5; security S3.)
- [x] T003 🔒 Add optional `sub` to the sealed envelope in `packages/session/drivers/cookie.ts`: `seal()` embeds `sub` in `{ d, iat, exp, jti, sub }` (additive JSON, no `WIRE_VERSION` bump); `open()`/`openSealed()` surface it on `OpenedPayload`; preserved across re-seals via the driver's `#issued`/`#subject`, **reset on `regenerate()`**. (§5 row 1 support; FR-003.)
- [x] T004 🔒 Add subject plumbing: optional `SessionDriver.setSubject?(sub)` on the `SessionDriver` port (`packages/session/types.ts`), implemented **only** by `CookieSessionDriver` (stashes `#subject` for the next `seal()`); `Session.setSubject(id)` on the `Session` port + `SessionStore` (`packages/session/store.ts`) delegating to `driver.setSubject?.()`. (§5 row 4; FR-005; arch A4.)
- [x] T005 🔒 In `packages/session/drivers/cookie.ts` remove the `absoluteLifetime ?? lifetime` fallback in `#revocationTtl()` — the epoch (and per-session) entry TTL is `absoluteLifetime` only; the `@lockness/core` gate guarantees it is set. Confirm `normalizeSessionConfig` (`packages/core/kernel/bootstrap/helpers.ts:172`) already refuses `revocation && !absoluteLifetime` and that per-user rides it. (§5 row 7; FR-008; security S1.)
- [x] T006 🔒 Add `deleteAllRememberTokens(user)` to `SessionWithRememberMeProviderContract` (`packages/auth/types.ts`) + the abstract base (`packages/auth-provider/base/session_provider_base.ts`) and concrete `drizzle`/`kysely`/`app/auth/user_provider.ts` (drop every remember-me token for the user). (OQ-1; FR-007.)

## Phase 3: US1 — log out everywhere (P1) 🎯 MVP

**Goal**: one operation evicts every session of a user (this device included, same-second included) and
invalidates their remember-me tokens. **Independent test**: another device's pre-eviction session is
refused; the acting session is refused; a captured remember-me cookie cannot re-mint.

- [x] T007 [US1] Write failing tests in `packages/session/tests/user_revocation.test.ts`: a session with `sub` and `iat` before the user's epoch is refused by `read()` (strict `<`); `iat == epoch` and a `sub`-less cookie are unaffected; a store error refuses (fail-closed). Use an in-memory `RevocationStore` double + FakeTime. MUST fail pre-fix. (SC-001/004/005.)
- [x] T008 [US1] 🔒 Implement the per-user check in `CookieSessionDriver.read()` (`packages/session/drivers/cookie.ts`): when `revocation` on, the cookie carries `sub`, and `iat < userRevokedSince(sub)` → `refuse`; a thrown `userRevokedSince` → `refuse` (fail-closed), beside the existing `jti` check. (§5 row 1; FR-002.)
- [x] T009 [US1] 🔒 Set `sub` on every session establisher in `packages/auth/guards/session_guard.ts`, **after** each `regenerate()`, via `session.setSubject(user.id)`: `login`, `loginById`, `#authenticateViaRememberToken`, `authenticateAsClient`. Assert `sub === d[sessionKeyName]`. (§5 rows 2/3; FR-004; arch A2/A3/A5.)
- [x] T010 [US1] Write failing guard tests in `packages/auth/tests/user_revocation.test.ts`: a remember-me-authenticated session carries a `sub` and is evicted; `logoutEverywhere` refuses the acting session (incl. same-second) and deletes the user's remember-me tokens so a captured cookie cannot re-mint. MUST fail pre-fix. (SC-003/006.)
- [x] T011 [US1] 🔒 Implement `logoutEverywhere()` in `session_guard.ts`, scoped to `this.user.id` (throw if unauthenticated): `store.revokeUser(now)` + revoke the acting session's `jti` (via `session.destroy()`/driver) + `provider.deleteAllRememberTokens(user)`. (§5 row 6; FR-006; security S4.)

## Phase 4: US2 — log out others (P1)

**Goal**: same eviction, but the acting session survives. **Independent test**: acting session still
authenticates next request; another device is refused; the acting device's remember-me is preserved.

- [x] T012 [US2] Write failing test in `packages/auth/tests/user_revocation.test.ts`: after `logoutOthers`, the acting session authenticates next request while an older session is refused; a subsequent `logoutEverywhere` still evicts the survivor (proves `sub` was re-asserted). MUST fail pre-fix. (SC-002.)
- [x] T013 [US2] 🔒 Implement `logoutOthers()` in `session_guard.ts`: `revokeUser(now)` → `session.regenerate()` (fresh `iat`) → re-assert `sub` on the survivor; `deleteAllRememberTokens(user)` then re-issue the acting device's remember-me token when one was present. (§5 rows 3/6; FR-006; arch A3.)

## Phase 5: US3 — credential-change eviction (P1, ASVS 7.4.2)

**Goal**: a password-change / recovery flow evicts the user's pre-change sessions and remember-me
tokens. **Independent test**: a session valid before the change is refused after the flow calls the
guard eviction.

- [x] T014 [US3] Write a test in `packages/auth/tests/user_revocation.test.ts` exercising the recovery pattern: authenticate on device B, then call `logoutEverywhere()` (the recovery flow's choice) on device A, then device B is refused and B's remember-me cannot re-mint. (SC-006.) Implementation is T011 — this pins the ASVS 7.4.2 scenario end-to-end.

## Phase 6: Cross-cutting negative tests

- [x] T015 [P] Write a test asserting the public surface exposes **no** raw subject-taking revoke: `packages/session/mod.ts` re-exports do not include `revokeUser`/`userRevokedSince`; the guard eviction throws when called unauthenticated. (§9 R7; security S3.)

## Phase 7: Polish & docs

- [x] T016 [P] `packages/session/docs/DOCS.md` — the eviction epoch, the `absoluteLifetime` precondition, fail-closed semantics, the raise-the-cap caveat. (plan §8.)
- [x] T017 [P] `packages/auth/docs/DOCS.md` — `logoutEverywhere()`/`logoutOthers()`, remember-me invalidation, credential-change / recovery guidance (ASVS 7.4.2); replace #143's "does NOT do per-user eviction" residual.
- [x] T018 Run the pre-completion gate: `deno fmt && deno lint && deno check <changed> && deno task test`. All green before done. (Hard rule #5.)

---

## Dependencies & order

- **Phase 2 (T001–T006)** blocks everything: store methods, envelope `sub`, driver plumbing, TTL/gate,
  provider method.
- **US1 (T007–T011)** is the MVP; the read() check + `sub`-on-establishers + `logoutEverywhere`.
- **US2 (T012–T013)** depends on US1 (`logoutEverywhere` shape + `sub` re-assert).
- **US3 (T014)** depends on T011.
- **Cross-cutting (T015)** depends on T001–T002. **Polish (T016–T018)** last.

## Parallel opportunities

- T001 ‖ T003 ‖ T006 (different packages/files).
- T016 ‖ T017 (docs, different files) once code is stable.

## MVP

**US1 (T001–T011)** — log out everywhere, the ASVS-7.4.2 core. US2/US3 extend it (survival, credential
flows); T015 hardens the surface.

## Decision-table carry-forward (plan §5)

| Home | Tasks |
| :--- | :--- |
| Per-user check — `cookie.ts` `read()` | T008 |
| Subject set after regenerate — guard establishers | T009 |
| `sub` re-assert after regenerate | T009/T013 |
| `sub` store→driver plumbing — optional `setSubject?` | T004 |
| Eviction epoch — `revocation_store.ts`, not exported | T001/T002 |
| Eviction + remember-me — `logoutEverywhere`/`logoutOthers` | T011/T013 |
| Precondition — `@lockness/core` gate + TTL tighten | T005 |
