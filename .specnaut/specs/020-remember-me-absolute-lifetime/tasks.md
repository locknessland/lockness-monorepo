# Tasks: Remember-me credential absolute lifetime

**Input**: `.specnaut/specs/020-remember-me-absolute-lifetime/plan.md` (the one design document)
**Prerequisites**: plan.md — approved at stop 1 (2026-09-02), OQ-1/2/3 settled.
**Tests**: REQUIRED — FR-007 mandates TDD, each behavioural test **negative-tested** (must fail
against the pre-fix code before the implementation lands).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no dependency on an incomplete task)
- **[Story]**: US1–US4 from plan.md §2
- Every 🔒 task names the decision-table home it touches (plan.md §5); no second spelling.

---

## Phase 1: Setup

No new project structure, dependencies, or scaffolding — additive change to `@lockness/auth` and
`@lockness/auth-provider`. Skip.

## Phase 2: Foundational (blocks all stories)

- [x] T001 [P] Add optional `firstIssuedAt?: Date` to `RememberMeToken` in `packages/auth/types.ts`, with JSDoc: the origin instant, immutable across renewals, distinct from `expiresAt`/`createdAt`.
- [x] T002 [P] Add optional `rememberMeAbsoluteLifetime?: number` to `SessionGuardOptions` in `packages/auth/types.ts`, with JSDoc: seconds; unset ⇒ off; `≤ 0` rejected.
- [x] T003 🔒 Change the `recycleRememberToken` port to take the whole token — `recycleRememberToken(user, token: RememberMeToken, expiresIn): Promise<RememberMeToken>` — in the `SessionWithRememberMeProviderContract` interface (`packages/auth/types.ts`) and the abstract in `packages/auth-provider/base/session_provider_base.ts`. JSDoc states the bare-copy duty: `new.firstIssuedAt = token.firstIssuedAt`. (§5 clock-preservation persistence home; Preserve Whole Object per OQ-1.)
- [x] T004 🔒 Normalize `rememberMeAbsoluteLifetime` in `SessionGuard` `#options` in `packages/auth/guards/session_guard.ts`: gate on `typeof === 'number'`, reject `≤ 0`/`NaN`, `undefined` ⇒ off (fail-closed, not truthy). Adjust the `Required<SessionGuardOptions>` `#options` shape to carry the off-sentinel. (§5 FR-003 home; arch A4.)

## Phase 3: US1 — a renewed token ages out at the hard ceiling (P1) 🎯 MVP

**Goal**: a remember-me credential first issued at `T` with cap `A` is refused at/after `T + A`
regardless of renewal count. **Independent test**: drive N renewals across simulated time, feed each
renewed token back in, assert refusal at `T + A`.

- [x] T005 [US1] Write the failing test in `packages/auth/tests/remember_absolute_lifetime.test.ts`: a token with a preserved `firstIssuedAt` renewed repeatedly is refused once `now - firstIssuedAt > A`; authenticates before. Use a mock provider (per `tests/session_logout_revocation.test.ts` + `tests/mocks.ts`) whose `recycleRememberToken` bare-copies `token.firstIssuedAt`. MUST fail against current guard (no cap). (SC-001/SC-004.)
- [x] T006 [US1] 🔒 Implement the cap in `#authenticateViaRememberToken` (`packages/auth/guards/session_guard.ts`): after `verifyRememberToken`, resolve `origin = token.firstIssuedAt ?? token.createdAt`, and if the cap is set and `now - origin > A`, refuse — **before** `recycleRememberToken` and before `session.set`/`regenerate`. Pass the whole verified token to `recycleRememberToken`. (§5 cap-enforcement home + FR-005b origin home.)
- [x] T007 [US1] 🔒 Make `createRememberToken` set `firstIssuedAt` (= its `createdAt`) and `recycleRememberToken` bare-copy `token.firstIssuedAt` onto the new token, in `packages/auth-provider/drizzle/drizzle_session_provider.ts`, `packages/auth-provider/kysely/kysely_session_provider.ts`, and `app/auth/user_provider.ts`. No `??` in the provider (that policy is the guard's). (§5 persistence home; arch A3 — includes the shipped `app/` scaffold.)

## Phase 4: US2 — a capped-out credential is removed, not merely rejected (P1)

**Goal**: on cap refusal the token is deleted server-side and the cookie cleared; a replay is refused
and no session is minted. **Independent test**: over-cap token → `deleteRememberToken` called, cookie
deleted, `authenticate()` throws, no session write.

- [x] T008 [US2] Write the failing test in `packages/auth/tests/remember_absolute_lifetime.test.ts`: an over-cap refusal calls `provider.deleteRememberToken(user, token.identifier)`, deletes the remember cookie, mints no session, and a same-cookie replay is refused. MUST fail pre-fix. (SC-002.)
- [x] T009 [US2] 🔒 In the cap-refusal branch (`session_guard.ts`), reuse the invalid-token teardown (`:246-248`) plus the server-side `deleteRememberToken`, then return `null`. (§5 teardown home; arch A2.)

## Phase 5: US3 — a legacy token acquires a real (approximate) ceiling (P1)

**Goal**: a token with no `firstIssuedAt` is frozen at `createdAt` on first recycle and thereafter
ages out; the clock does not reset per renewal. **Independent test**: `firstIssuedAt`-absent token
across N renewals, effective clock does not roll forward.

- [x] T010 [US3] Write the failing test in `packages/auth/tests/remember_absolute_lifetime.test.ts`: a `firstIssuedAt`-**absent** token, after first recycle, carries a frozen origin (= original `createdAt`); across further renewals the cap still fires at `origin + A`. MUST fail against a naive per-request `createdAt` fallback. (SC-004 legacy arm.)
- [x] T011 [US3] 🔒 Verify the freeze is single-homed: the guard resolves `firstIssuedAt ??= createdAt` **unconditionally** before recycle (already in T006), and the `app/auth/user_provider.ts` recycle bare-copies it (from T007). Add a test asserting the shipped template's recycle preserves the origin. (§5 FR-005b origin home; SC-005.)

## Phase 6: US4 — the cap is invisible when unconfigured, fail-closed on 0 (P2)

**Goal**: unset ⇒ today's behaviour; `0` ⇒ rejected, never silently off.

- [x] T012 [US4] Write the test in `packages/auth/tests/remember_absolute_lifetime.test.ts`: with `rememberMeAbsoluteLifetime` unset, an old token authenticates (no regression); with `0`, construction rejects/normalizes to off-is-refused per FR-003, and `0` does not disable an otherwise-capped guard. (SC-003.) Implementation is T004.

## Phase 7: Polish & cross-cutting

- [x] T013 [P] Update `packages/auth/docs/DOCS.md` remember-me section: the cap option, default-off + reject-`0`, the consumer-provider requirement to bare-copy `firstIssuedAt` on recycle, that the remember cap and the #143 session cap **compose (not nest)**, and the legacy approximation (capped from last renewal, not true birth). (plan §8.)
- [x] T014 Run the pre-completion gate: `deno fmt && deno lint && deno check <changed files> && deno task test`. All green before declaring done. (Hard rule #5.)

---

## Dependencies & order

- **Phase 2 (T001–T004)** blocks everything: types, port signature, and option normalization.
- **US1 (T005–T007)** is the MVP and unblocks US2/US3 (both build on the cap branch + preservation).
- **US2 (T008–T009)** depends on the US1 cap branch existing.
- **US3 (T010–T011)** depends on T006 (origin resolution) + T007 (provider bare-copy).
- **US4 (T012)** depends only on T004.
- **Polish (T013–T014)** last.

## Parallel opportunities

- T001 ‖ T002 (same file, different fields — sequence if edit-conflict).
- T007's three providers are parallel edits (different files).
- T013 (docs) ‖ the test tasks once code is stable.

## MVP

**US1 (T001–T007)** — the cap fires across renewals. Everything else hardens it (teardown, legacy,
fail-closed, docs).

## Decision-table carry-forward (plan §5)

| Home | Tasks |
| :--- | :--- |
| Cap enforced — `session_guard.ts` `#authenticateViaRememberToken` | T006 |
| Teardown — same guard branch, reuse `:246-248` | T009 |
| Clock persistence (bare-copy) — drizzle / kysely / `app/` recycle | T007 |
| Origin/freeze policy — guard resolves `firstIssuedAt ??= createdAt` | T006/T011 |
| Off/fail-closed — `#options` normalization | T004 |
