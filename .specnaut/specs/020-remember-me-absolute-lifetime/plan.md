# Plan: Remember-me credential absolute lifetime

**Branch**: `020-remember-me-absolute-lifetime` | **Date**: 2026-09-02 | **Backlog item**:
[#146 — Remember-me credential has no absolute lifetime](https://github.com/locknessland/lockness-monorepo/issues/146)

**This is the feature's one planning document.** Read whole by whoever implements it.

---

## 1. Why this exists

[#143](https://github.com/locknessland/lockness-monorepo/issues/143) (spec
`011-cookie-absolute-lifetime`) bounded the **session cookie**: an opt-in absolute-lifetime
cap plus per-session revocation. It left the credential that can re-mint a session — the
**remember-me token** — unbounded. `SessionGuard.#authenticateViaRememberToken`
(`packages/auth/guards/session_guard.ts:225`) verifies the cookie's token, then immediately
**recycles** it (`recycleRememberToken`, `:254`) into a fresh token with a fresh expiry, on
**every** use. A rolling 30-day window with no ceiling: an attacker who captures a live
remember-me cookie refreshes it indefinitely and it never ages out on its own. This is the
#143 defect one credential over — the cookie is now bounded, the long-lived credential that
re-mints it is not.

**The same correction #143 forced, forced again here.** #143's audit found the issue's
premise factually wrong: a naive cap that reads the token's own "created" timestamp is
**inert**, because the renewal path mints a fresh timestamp every time, so `now - created`
never grows. The identical trap exists here: `recycleRememberToken` is implemented as
delete-old + `createRememberToken` (`drizzle_session_provider.ts:209-212`), and
`createRememberToken` sets `createdAt: new Date()` (`:154`). So a cap measured from
`createdAt` would never fire. **The cap therefore has two inseparable halves**: (a) a
**first-issuance timestamp preserved across renewals**, and (b) an enforcement point that
reads it. Neither works without the other — this is the section-5 decision table's whole job.

**Scope reality the issue's location line understates.** The issue names
`session_guard.ts` and labels `domain:session`, but the credential spans two packages:
`@lockness/auth` owns the guard (where the cap is *decided*), and `@lockness/auth-provider`
owns the token record and its renewal (where the first-issuance clock is *preserved*). The
in-repo providers (`base` / `drizzle` / `kysely`) are **placeholder stubs** — `verifyRememberToken`
returns `null`, `recycleRememberToken` is delete+create — **and the shipped app scaffold
`app/auth/user_provider.ts` has its own concrete create+recycle pair** (`:78`, `:110`) that new
apps copy. Real persistence is the consumer subclass's. What this feature ships and tests
end-to-end is the **guard-side cap** and the **token/provider contract**; consumer persistence
is delivered as a documented contract requirement plus the in-repo reference paths carrying the
clock forward (§9 R3).

## 2. User scenarios

### US1 — a renewed remember-me token ages out at the hard ceiling (P1, security)

**Given** a remember-me credential first issued at `T`, absolute lifetime `A` configured on the guard
**When** the credential is used (and thus renewed) repeatedly past `T + A`
**Then** the guard refuses it — because the first-issuance timestamp is **preserved across every
renewal**, `now - firstIssuedAt` grows past `A` and the cap fires. (The test MUST drive several
renewals across simulated time and feed each renewed token back in, not advance a clock against one
fixed token — a clock-only test would pass over the exact defect, because the unfixed renewal resets
the clock.)

### US2 — a capped-out credential is removed, not merely rejected (P1, security)

**Given** a remember-me token past its absolute lifetime
**When** the guard refuses it
**Then** the persisted token is deleted (`deleteRememberToken`) and the remember-me cookie cleared,
so a captured copy cannot be retried — the same teardown the invalid-token path already performs
(`session_guard.ts:246-248`).

### US3 — a legacy token (no first-issuance timestamp) acquires a real ceiling, not a rolling one (P1, security)

**Given** a remember-me credential issued before this feature (`firstIssuedAt` absent)
**When** it is first renewed under the new code
**Then** the renewal **freezes** the clock at the old token's `createdAt` (mint-on-first-recycle),
so from that point `now - firstIssuedAt` grows and the cap fires — a legacy stolen token does **not**
refresh forever. (A naive `createdAt` fallback that re-derives on each renewal would be inert; the
test MUST drive a `firstIssuedAt`-absent token across renewals and prove the clock does not reset.)

### US4 — the cap is invisible when unconfigured (P2)

**Given** no `rememberMeAbsoluteLifetime` set (the default)
**When** a remember-me token is used at any age
**Then** behaviour is exactly today's: verify → renew → authenticate, no age check, no regression.

### Edge cases

- **Cap set, `expiresAt` already past**: the existing verify path rejects it first; the cap never
  runs. The two bounds are independent and both refuse.
- **`rememberMeAbsoluteLifetime: 0`**: MUST NOT silently disable the cap (fail-open). `0`/negative is
  a rejected misconfiguration; only `undefined` means off (FR-003).
- **Cap check vs. renewal order**: the cap MUST be evaluated *before* the token is recycled and
  *before* any session is minted — a stale token must be refused, never refreshed then measured
  against its new clock.

## 3. Requirements

- **FR-001** — `SessionGuard` refuses a remember-me token whose age from its first-issuance timestamp
  exceeds `rememberMeAbsoluteLifetime`, when that option is set. Enforced in
  `#authenticateViaRememberToken`, **before** recycling and before any `session.set`/`regenerate`.
- **FR-002** — On a cap refusal, the guard deletes the persisted token via
  `provider.deleteRememberToken(user, token.identifier)` and clears the remember-me cookie, then
  fails authentication (returns `null`). Reuses the invalid-token teardown (`session_guard.ts:246-248`).
- **FR-003** — The cap is **off by default** and fail-closed on misconfig: the check runs **iff**
  `typeof rememberMeAbsoluteLifetime === 'number'`; `undefined` ⇒ off; `≤ 0`/`NaN` is rejected at
  normalization (never silently "off"). Mirrors #143 SC-005 / its §11 F3.
- **FR-004** — `RememberMeToken` carries an **optional** first-issuance timestamp `firstIssuedAt: Date`,
  distinct from `expiresAt`. The guard reads it for the cap, falling back to `createdAt` **only** on a
  legitimately-absent legacy value (see FR-005b).
- **FR-005** — `recycleRememberToken` **preserves** the first-issuance timestamp onto the renewed
  token, via **Preserve Whole Object** (OQ-1, settled): the port becomes
  `recycleRememberToken(user, token: RememberMeToken, expiresIn)`, the guard passes the **whole
  verified token** it already holds, and the provider's sole new duty is a **bare copy**
  (`new.firstIssuedAt = token.firstIssuedAt`) — it never re-derives, never re-reads, never delegates
  the origin to `createRememberToken` (which mints `now`). Renewal never advances the clock.
- **FR-005b** — The freeze/fallback **policy lives in one home, the guard.** Before calling recycle,
  the guard resolves the origin onto the token it passes: `token.firstIssuedAt ??= token.createdAt`.
  So a legacy token (`firstIssuedAt` absent) is frozen at its `createdAt` on first recycle, and every
  provider stays a dumb bare-copy — the `??` is not scattered across N providers. The resolve is
  **unconditional** (not gated on the cap being set), so enabling the cap later does not hand every
  live token a fresh full window. **Caveat (documented):** because today's recycle already reset
  `createdAt` on each pre-upgrade renewal, a legacy token's frozen origin anchors to its **last
  renewal**, not true birth — a real, finite ceiling (S1 closed, never immortal), but approximate.
- **FR-006** — The cap value is configured in `SessionGuardOptions`, alongside `rememberMeTokensAge`
  (unit: seconds, matching the existing option), converted to ms at the comparison (see OQ-2).
- **FR-007** — Tests cover, each **negative-tested** (must fail against pre-fix code): the cap fires
  past the ceiling across renewals with a preserved `firstIssuedAt` (US1); a `firstIssuedAt`-**absent**
  token across renewals whose clock does **not** reset (US3, guards against the inert fallback); a
  capped-out token deleted and its cookie cleared (US2); the cap inert when unset and **not** disabled
  by `0` (US4/FR-003); the shipped `app/auth/user_provider.ts` recycle preserves the clock.

## 4. Success criteria

- **SC-001** — With cap `A` set, a remember-me credential first issued at `T` authenticates before
  `T + A` and is refused at/after `T + A`, **regardless of how many times it was renewed** in between.
- **SC-002** — A cap-refused credential is removed server-side and its cookie cleared, so an immediate
  replay of the same cookie is also refused, and no session is minted on the refused request.
- **SC-003** — With the cap unset, remember-me authentication is byte-for-byte today's behaviour; with
  the cap set to `0`, the cap is **not** disabled (config is rejected, not treated as off).
- **SC-004** — The absolute clock survives renewal: N renewals across the window do not extend the
  ceiling by one second, **including** a token that began with no `firstIssuedAt`.
- **SC-005** — After a recycle, the persisted new token carries the **original** `firstIssuedAt`
  (or the frozen legacy `createdAt`), never a fresh one.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| "A remember-me token older than the configured maximum is refused." | `packages/auth/guards/session_guard.ts` → `#authenticateViaRememberToken` (the one path every remember-me auth flows through) | A second age check inside a provider's `verifyRememberToken`/`recycleRememberToken`, or in request middleware. |
| "A cap-refused token is deleted server-side and its cookie cleared." (FR-002/US2) | `packages/auth/guards/session_guard.ts` → the cap branch, reusing the invalid-token teardown (`:246-248`) | A cookie-only clear with no server-side delete; or pushing the delete into a provider. |
| "The absolute clock is set once at first issuance and never reset by renewal." (persistence) | `recycleRememberToken` **bare-copies** `new.firstIssuedAt = token.firstIssuedAt` in the concrete providers (`packages/auth-provider/drizzle`, `packages/auth-provider/kysely`, **`app/auth/user_provider.ts`**) | `createRememberToken` minting `firstIssuedAt = now` on the recycle path; a provider re-deriving via `?? createdAt` (that policy is the guard's, not the provider's). |
| "The origin/freeze policy — resolve `firstIssuedAt ??= createdAt`, unconditionally." (FR-005b) | `packages/auth/guards/session_guard.ts` → `#authenticateViaRememberToken`, once, before recycle | The `??` fallback spelled inside each provider's recycle; a per-request re-derivation that re-anchors every renewal → inert. |
| "The cap is off unless a numeric value is configured." (FR-003) | `SessionGuardOptions.rememberMeAbsoluteLifetime` normalized in the guard `#options` (`typeof === 'number'`, reject `≤ 0`) | A truthiness gate that treats `0` as off; a default value set anywhere that turns it on implicitly. |

**Binding on the implementer.** No decision moves out of its home without this plan being amended
first. A review finding that the cap is enforced in two places, or that the clock is reset on
renewal, is a **plan violation, not a style note**.

## 6. Technical context

- **Language / runtime**: TypeScript on Deno, TC39 decorators. JSR-only specifiers.
- **Packages touched**: `@lockness/auth` (guard + `RememberMeToken` / `SessionGuardOptions` types +
  the `recycleRememberToken` contract signature), `@lockness/auth-provider` (`drizzle`/`kysely`
  recycle), and the shipped `app/auth/user_provider.ts` reference provider.
- **Testing**: `Deno.test` with mock providers, following
  `packages/auth/tests/session_logout_revocation.test.ts` (the #143 sibling) and `tests/mocks.ts`.
  Time is driven by constructing tokens with explicit `firstIssuedAt`/`createdAt`, not a wall clock.
- **Additive where it can be, not everywhere.** The **type-field** additions (`firstIssuedAt?`,
  `rememberMeAbsoluteLifetime?`) are additive and non-breaking. The **recycle preservation** is
  **not** purely additive: `recycleRememberToken` cannot preserve a value its signature never
  receives (architecture A1). Resolving that changes the provider contract — see OQ-1 and §8.

### Domain model

- **Bounded context**: authentication (guard) + credential persistence (auth-provider).
- **Entity**: `RememberMeToken` — identity is `identifier`. A renewal produces a *new* entity in a
  chain; the chain shares one origin.
- **Value object**: `firstIssuedAt` — the chain's origin instant, immutable across every renewal.
- **Invariant**: `firstIssuedAt` is fixed at first creation (or frozen from `createdAt` on first
  recycle for legacy) and never advanced by renewal. The credential is valid only while
  `now - firstIssuedAt ≤ rememberMeAbsoluteLifetime` (when set) **and** `now ≤ expiresAt`. The two
  bounds are independent; either refuses.
- **Out of scope**: per-user / user-wide remember-me revocation (#147, its own follow-up); the
  session cookie's own cap and `jti` revocation (shipped in #143); the pre-existing `expiresIn` unit
  bug (§9 R1).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | Guard imports cookie helpers from `@lockness/hono`. |
| JSR-only specifiers | pass | No new dependencies. |
| No `any` in exported APIs | pass | New surface is `Date`/`number`/`RememberMeToken`; test mocks keep the existing `no-explicit-any` lint-ignore pattern, not exported. |
| JSDoc on public APIs | pass | New option, new field, and the changed recycle contract get full JSDoc. |
| No silent catches | pass | No new catches; the cap path fails via the existing route. |
| MVC layering | pass | Guard = auth layer, provider = persistence port. |
| TDD | pass | FR-007 writes failing tests first; each negative-tested against pre-fix code. |
| Commit discipline | pass | `feat(auth)` types+guard+contract, `feat(auth-provider)` recycle, `test(auth)`, `docs(auth)`. The recycle-signature change (OQ-1) enlarges the `feat(auth-provider)` commit — noted, not a violation. |

### Complexity tracking

The `recycleRememberToken` signature change (OQ-1, if taken) is a breaking change to the
`SessionWithRememberMeProviderContract` port. Justification: preservation is impossible through the
current signature (A1); the package surface is pre-1.0 and the remember-me provider methods are
stub-level in-repo. Recorded here rather than hidden as "additive."

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/auth` public types | yes | `SessionGuardOptions.rememberMeAbsoluteLifetime?` (new, optional); `RememberMeToken.firstIssuedAt?` (new, optional); `recycleRememberToken` signature (OQ-1 — pass whole token). |
| `SessionGuard` behaviour | yes | New pre-recycle, pre-session cap check in `#authenticateViaRememberToken`; passes the verified token to recycle. |
| `@lockness/auth-provider` | yes | `drizzle` + `kysely` `create`/`recycleRememberToken` set/preserve `firstIssuedAt`; contract JSDoc states the requirement. |
| `app/auth/user_provider.ts` (shipped scaffold) | yes | Its concrete `create`/`recycle` preserve `firstIssuedAt`, so new apps ship the correct reference. |
| `@lockness/session` | no | The session cookie cap (#143) is unchanged. |
| HTTP / cookie wire format | no | The remember-me cookie still carries only the opaque token value. |
| CLI / migrations | no | No schema migration shipped in-repo (consumer owns the token table). |

### Documentation (this feature)

- `packages/auth/docs/DOCS.md` — remember-me section: the new cap option, default-off + reject-`0`
  semantics, the consumer-provider requirement to preserve `firstIssuedAt` across recycle, and
  (security FINDING 3) that the cap bounds the **re-mint window** of the credential, **not** the
  lifetime of a session it already established — the remember cap and the #143 session cap **compose,
  they do not nest**; and that a credential issued **before** this feature is capped from its **last
  renewal** rather than true first issuance (the legacy approximation, FR-005b caveat).

No front-end surface is touched — no artifacts, no visual prototyping.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **R1 — pre-existing unit bug** in `drizzle`/`kysely` `createRememberToken`: `new Date(Date.now() + expiresIn)` treats seconds as ms (`app/` uses `× 1000`). | Out of scope (a separate defect); flag to the PO. The cap uses `firstIssuedAt` vs `now` in ms with an explicit `× 1000` on the seconds config, so it does **not** inherit the bug. |
| **R2 — adding a required field breaks consumers.** | `firstIssuedAt` is **optional**; absent ⇒ frozen-from-`createdAt` on first recycle. Nothing a consumer ships fails to compile on the field. |
| **R3 — a consumer provider that doesn't preserve `firstIssuedAt` on recycle** reduces the cap to a rolling window. | Documented contract requirement in the `recycleRememberToken` JSDoc and `DOCS.md`; the in-repo `drizzle`/`kysely`/`app/` recycle carry it forward as the reference. The reference is unit-inconsistent until R1 is fixed (arch A5) — the `firstIssuedAt` math is specified independently so it is not modelled on the buggy line. The guard cannot force consumer persistence — the honest boundary, stated. |
| **R4 — cap checked after recycle/session-mint** would measure the fresh clock and never fire. | FR-001/edge-case pins the order: check **before** recycle and before `session.set`/`regenerate`. A test asserts refusal with the pre-recycle token and no session minted. |

## 10. Architecture audit

`architect-expert` on this plan — verdict **fail** (1 HIGH, 3 MEDIUM, 1 LOW). Coverage: §5 table,
FR-001..007, and the recycle/create/option blast radius across `auth`, `auth-provider`, `app/`, and
tests. Guard-side enforcement home affirmed correct.

| # | Finding (sev) | What was done |
| :--- | :--- | :--- |
| A1 | **HIGH** — FR-005 preservation has no mechanism: `recycleRememberToken(user, tokenId, expiresIn)` never receives the old token and delegates to `createRememberToken` (no `firstIssuedAt` slot, mints `createdAt: new Date()`); the "additive, optional-field-only" claim in §6 is false for recycle *behaviour*. | **Plan changed.** FR-005 now pins the mechanism (pass the whole verified token to recycle — Preserve Whole Object), raised as **OQ-1** for the user's veto since it breaks the provider contract; §6/§8/§7-complexity now admit the signature change and its edit set; **SC-005** added (persisted new token carries the original `firstIssuedAt`). |
| A2 | **MEDIUM** — §5 omits the P1 FR-002 teardown decision (delete + clear cookie), which has a real duplication risk. | **Plan changed.** Added the teardown row to §5, homed in the guard reusing `:246-248`, with cookie-only-clear / provider-side-delete named as duplication. |
| A3 | **MEDIUM** — preservation home enumeration is wrong: `base` is `abstract` (nothing to preserve), and the shipped `app/auth/user_provider.ts` concrete recycle was omitted — it will silently degrade the cap in the exact file new apps copy. | **Plan changed.** §5/§6/§8 drop `base` from the home set and add `app/auth/user_provider.ts`; FR-007 now tests the template's recycle. |
| A4 | **MEDIUM** — optional off-by-default collides with `Required<SessionGuardOptions>`; off-sentinel unpinned (truthiness would let `0` disable the cap, fail-open). | **Plan changed.** FR-003 pins `typeof === 'number'`, `undefined` = off, reject `≤ 0`; SC-003 asserts `0` does not disable; §5 row 5 homes it in the `#options` normalization. |
| A5 | **LOW** — R3's "reference implementation" inherits the R1 seconds-as-ms divergence (`drizzle`/`kysely` vs `app/`'s `× 1000`). | **Plan changed.** R3 now notes the reference is unit-inconsistent until R1; the `firstIssuedAt` math is specified with its own explicit `× 1000`. |

## 11. Security audit

`security-expert` on this plan — verdict **needs_followup** (1 MEDIUM, 2 LOW). Coverage: the cookie →
`verifyRememberToken` → cap → recycle path, `firstIssuedAt` provenance, the config gate, and
cross-account reach. Core cap-before-recycle mechanism, `firstIssuedAt` non-forgeability, and the
US2 teardown all **confirmed sound**; no cross-account/IDOR path (every write scoped to the verified
token). Kept separate from §10.

| # | Finding (sev) | What was done |
| :--- | :--- | :--- |
| S1 | **MEDIUM** — the fallback-to-`createdAt` clock **resets on every renewal** (recycle re-mints `createdAt`), so the cap is **inert for legacy tokens** — my §2 claim that legacy tokens "still acquire a ceiling" is false and FR-007's tests (all with explicit `firstIssuedAt`) would never catch it. CWE-613 / OWASP A07 / ASVS V7.4.1. | **Plan changed.** Added **FR-005b** (freeze `firstIssuedAt = old.firstIssuedAt ?? old.createdAt` on first recycle — mint-on-first-recycle, per #143's iat-preserve), **US3** as a P1 scenario, and an FR-007 negative test driving a `firstIssuedAt`-absent token across renewals. Resolution converges with **OQ-1/OQ-3** (recycle must see the old token). |
| S2 | **LOW** — cap gate not pinned to `typeof === 'number'`; `rememberMeAbsoluteLifetime: 0` risks fail-open (the same trap as #143 §11 F3). | **Plan changed.** Same fix as A4 — FR-003 + SC-003. |
| S3 | **LOW** — residual: the cap bounds token **re-mint**, not the lifetime of a session it already minted (which carries its own #143 clock); left unstated it is a false assurance. | **Plan changed.** §8 DOCS line: the remember cap and the #143 session cap **compose, do not nest**. |

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| OQ-1 — Recycle mechanism (arch A1). | **Preserve Whole Object**: `recycleRememberToken(user, token, expiresIn)`; the guard passes the token it already holds, the provider bare-copies `firstIssuedAt`. Rejected: re-read the row (needless I/O, unenforceable, untestable with the in-repo stubs) and a naked `origin: Date` 4th param (the port breaks anyway pre-1.0, so "non-breaking" buys nothing; the whole object carries the *next* preserved field for free — the same lesson #143 banked collapsing `iat`+`jti` into `IssuedIdentity`). Architect's call, user deferred to it. | 2026-09-02 |
| OQ-2 — Config home. | **`SessionGuardOptions.rememberMeAbsoluteLifetime`**, beside `rememberMeTokensAge`. The cap's only reader is the guard, so that is its home. Rejected: `SessionConfig` — it leaks an `@lockness/auth` policy into `@lockness/session` (a context that never consumes it) and re-introduces the `normalizeSessionConfig` silent-drop plumbing #143's audit flagged. The issue's "configured alongside" is met by a DOCS cross-reference, not co-location. | 2026-09-02 |
| OQ-3 — Legacy tokens (`firstIssuedAt` absent). | **Freeze at `createdAt` on first recycle**, resolved **unconditionally** in the guard (FR-005b). Closes S1 (else legacy credentials are immortal). Caveat recorded: the frozen origin anchors to the token's **last pre-upgrade renewal** (recycle already reset `createdAt`), not true birth — finite but approximate; documented, not over-claimed. Composes cleanly with OQ-1 (PWO is what makes the freeze single-homed). | 2026-09-02 |

### Decided without asking

- **Cap enforced in the guard, not the provider** — the single path all remember-me auth flows
  through; providers are consumer-implemented (can't enforce there). Rejected: a check in
  `verifyRememberToken` — it would live in N consumer subclasses, the duplication the table forbids.
- **Add an explicit `firstIssuedAt` field** (vs. overloading `createdAt`) — both audits assume it;
  `createdAt` is ORM-auto-set on insert and fights preservation. Optional, so non-breaking on the field.
- **Cap unit = seconds**, matching `rememberMeTokensAge`; converted to ms at the comparison.
- **No token-table migration shipped** — the in-repo providers are stubs; the consumer owns the schema.
