# Plan: Per-user session revocation

**Branch**: `021-per-user-session-revocation` | **Date**: 2026-09-02 | **Backlog item**:
[#147 — Per-user session revocation (log out everywhere / password-change eviction)](https://github.com/locknessland/lockness-monorepo/issues/147)

**This is the feature's one planning document.** Read whole by whoever implements it.

---

## 1. Why this exists

[#143](https://github.com/locknessland/lockness-monorepo/issues/143) (spec
`011-cookie-absolute-lifetime`) shipped **per-session** revocation: the cookie driver's `read()`
checks the session's 128-bit `jti` against a Deno-KV set and refuses a revoked cookie, fail-closed and
strongly consistent. It invalidates **one** session at a time.

It has **no user-wide path**. A password change, an account-recovery flow, or a "log out everywhere"
action cannot evict a user's *other* live sessions — ASVS **7.4.2** requires exactly that. #147 adds
the missing dimension.

**The mechanism.** Per-user revocation cannot enumerate an unbounded set of stateless cookies, so it
uses an **eviction epoch**: one per-user timestamp meaning "sessions issued before this instant are
dead". A session already carries a first-issuance instant — #143's `iat`, preserved across re-seals,
reset on `regenerate()`. The check: a session is refused when its `iat` predates its subject's
eviction epoch. One KV write evicts every prior session; the acting session survives by rotating to a
fresh `iat`.

**What the session must carry: a subject.** The epoch is keyed by *whom the session belongs to*. The
cookie's sealed plaintext is `{ d, iat, exp, jti }`; there is no principal to key on. The session
layer therefore holds an **opaque principal token** `sub`, embedded in the sealed plaintext beside
`jti`. **The session layer never interprets `sub`** — it treats it exactly as it treats the opaque
`jti` (architecture F6). This is a real, named **bounded-context concession**: `sub` is a foreign
reference into the identity context, unlike the session-lifecycle metadata `iat`/`jti`/`exp`. It is
*not* a layer violation — `@lockness/session` imports nothing from `@lockness/auth` and reads `sub` as
an opaque string — but the concession is stated here rather than dressed up as "a standard claim". The
auth guard *populates* `sub`; the session layer *stores and enforces against* it.

## 2. User scenarios

### US1 — log out everywhere evicts every session, this one included (P1, security)

**Given** a user with sessions on several devices, revocation enabled
**When** "log out everywhere" fires
**Then** one write sets the eviction epoch = now; every session with an older `iat` is refused,
**and the acting session is killed deterministically** (its `jti` is revoked too, so it dies even if
issued in the same wall-clock second — SC-003), **and the user's remember-me tokens are invalidated**
so a captured remember-me cookie cannot re-mint a fresh session (security F2).

### US2 — log out others keeps the acting session alive (P1, security)

**Given** "log out other devices"
**When** the epoch is set to now
**Then** the acting session **rotates** (`regenerate()` → fresh `iat`, then re-asserts its `sub`) and
survives; every other session (older `iat`) is refused; other devices' remember-me tokens are
invalidated while the acting device's is preserved.

### US3 — a credential change evicts existing sessions (P1, security, ASVS 7.4.2)

**Given** a password change or account-recovery completes
**When** the flow calls the guard eviction (recovery wants US1 semantics)
**Then** the user's pre-change sessions **and** remember-me tokens are invalidated — a recovered
account does not leave the attacker's session, nor a remember-me cookie that re-mints one, live.

### Edge cases

- **A session with no `sub`** (a pre-`#147` cookie): no per-user check — bounded by the cap + per-session
  revocation. Every session *established after this feature* carries a `sub` (FR-004 covers every
  establisher), so the residual is only cookies minted before deploy, which age out at the cap.
- **Store outage on the per-user check**: refuse (fail-closed), never authenticate.
- **`iat == epoch`** (same second): survives the epoch check (strict `<`), which is why US1 *also*
  revokes the acting `jti` — otherwise a same-second session would outlive "log out everywhere" (F4).
- **Raising `absoluteLifetime` later**: the epoch entry TTL is a fixed `absoluteLifetime` window from
  revoke time (never `?? lifetime`), so a widened cap cannot resurrect an evicted session (F1/#143 F6).

## 3. Requirements

- **FR-001** — `RevocationStore` gains `revokeUser(sub, ttlSeconds)` (records the subject's eviction
  epoch as **epoch-seconds**, matching `iat`) and `userRevokedSince(sub)` (returns that epoch-second or
  null). Both fail-closed / propagate exactly like `revoke`/`isRevoked`. **Neither is exported from
  `packages/session/mod.ts`** — they are internal to `@lockness/session` (security F3).
- **FR-002** — The cookie driver's `read()` refuses a session when `revocation` is on, the cookie
  carries a `sub`, and its `iat` is **strictly less than** `userRevokedSince(sub)`. A store error here
  refuses (fail-closed); the read is strongly consistent.
- **FR-003** — The sealed envelope carries an optional `sub`: `seal()` embeds it, `open()` surfaces it,
  preserved across re-seals and **reset on `regenerate()`** — riding `IssuedIdentity`'s machinery, no
  `WIRE_VERSION` bump (additive JSON).
- **FR-004** — The auth guard sets the subject via `session.setSubject(id)` **after** every
  session-continuing `regenerate()`, on **every** session-establishing path: `login`, `loginById`,
  **the remember-me recycle path `#authenticateViaRememberToken`**, and `authenticateAsClient` (test
  parity). Set-before-regenerate would be wiped by the reset (architecture F3). **Invariant:
  `sub === d[sessionKeyName]`** — the same id authentication keys on, so the eviction check and
  authentication never key off divergent identities (architecture F5).
- **FR-005** — `session.setSubject(id)` reaches the cookie driver via an **optional**
  `SessionDriver.setSubject?(sub)` (mirroring the existing optional `gc?`/`close?`); only the cookie
  driver implements it, so the memory/deno-kv/redis drivers are untouched (architecture F4).
- **FR-006** — The guard exposes **`logoutEverywhere()`** and **`logoutOthers()`**, each scoped to the
  authenticated `this.user.id` and throwing if unauthenticated (never evicting an undefined subject —
  security F3):
  - `logoutEverywhere()`: `revokeUser(now)` + revoke the acting session's `jti` (per-session, #143) +
    invalidate the user's remember-me tokens. The acting session dies.
  - `logoutOthers()`: `revokeUser(now)`, then `regenerate()` (fresh `iat`), then **re-assert `sub`** on
    the survivor (architecture F3); invalidate other devices' remember-me tokens, keep the acting one.
- **FR-007** — Eviction invalidates the user's **remember-me tokens** so a captured remember-me cookie
  cannot re-mint a post-eviction session (its recycle would carry a fresh `iat > epoch` and survive —
  security F2). Requires a provider capability to drop a user's remember-me tokens (see OQ-1).
- **FR-008** — Per-user revocation rides the **existing** boot precondition: `@lockness/core`
  `normalizeSessionConfig` already throws when `revocation && absoluteLifetime === undefined`
  (`packages/core/kernel/bootstrap/helpers.ts:172`). Per-user revocation reuses the `revocation` flag,
  so it is already gated. The epoch entry's TTL is `absoluteLifetime` **only** — the
  `absoluteLifetime ?? lifetime` fallback in `#revocationTtl()` is removed for the epoch (and the
  pre-existing per-session TTL tightened in the same change) so a `configureSession` bypass cannot
  produce a short-lived, resurrectable entry (security F1).
- **FR-009** — Tests (each **negative-tested**): a user-wide eviction refuses a previously valid
  session from another device; `logoutEverywhere` kills the acting session (same-second included) while
  `logoutOthers` spares it; a `sub`-less cookie is unaffected; a store outage refuses; the epoch check
  is strict at `iat == epoch`; a remember-me-authenticated session carries a `sub` and IS evicted; a
  captured remember-me token cannot re-mint after eviction; the public surface exposes no raw
  subject-taking revoke.

## 4. Success criteria

- **SC-001** — After a user-wide eviction, a pre-eviction session on another device is refused next
  request; the eviction is a single store write regardless of session count.
- **SC-002** — `logoutOthers()` leaves the acting session authenticated next request; every other
  pre-eviction session is refused.
- **SC-003** — `logoutEverywhere()` refuses the acting session next request, **including** one issued
  in the same second as the eviction.
- **SC-004** — A store read error during the per-user check refuses the session (fail-closed).
- **SC-005** — A `sub`-less cookie authenticates unchanged; per-user revocation is inert without
  `absoluteLifetime` (refused at boot by the existing core gate, not silently off).
- **SC-006** — After eviction, a captured remember-me cookie cannot re-establish a session (its token
  is invalidated); a remember-me-authenticated session carries a `sub` and is evicted like any other.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| "A session issued before its subject's eviction epoch is refused." | `packages/session/drivers/cookie.ts` → `read()` (beside the #143 per-session check) | A check in `open()` (pure, no I/O — #143 Arch F3), or in the auth guard's `authenticate()`. |
| "The subject a session belongs to, `sub === d[sessionKeyName]`." | Set once via `session.setSubject()` by the guard, **after** every `regenerate()`, on every establisher (`session_guard.ts`) | The driver sniffing `d[auth_*]`; two writers of `sub`; a `sub` that diverges from the authenticated principal. |
| "`sub` is (re)asserted after every session-continuing `regenerate()`." | The guard establishers (`login`/`loginById`/remember-me recycle/`authenticateAsClient`) | Relying on `IssuedIdentity` preservation (it is reset on regenerate); a set-before-regenerate order. |
| "`sub` crosses from the session store to the cookie's `seal()`." | Optional `SessionDriver.setSubject?(sub)`, cookie-only (`packages/session/drivers/cookie.ts` + the `SessionDriver` port) | A `write()` signature change touching all four drivers; hoisting `sub` out of the sealed `d`. |
| "The eviction epoch for a subject (epoch-seconds)." | `packages/session/drivers/revocation_store.ts` → `revokeUser`/`userRevokedSince`, keyed `['session-user-revoked', sub]`, **not exported** | A second per-user key scheme; the epoch computed anywhere but the store; exposing raw `revokeUser` to app code. |
| "Evict all of a user's sessions + remember-me tokens (everywhere vs others)." | `packages/auth/guards/session_guard.ts` → `logoutEverywhere()`/`logoutOthers()`, scoped to `this.user.id` | Raw `revokeUser` from app code bypassing the survival/rotation + token-invalidation rules; the survival logic spelled twice. |
| "Per-user revocation requires `absoluteLifetime`." | **`@lockness/core`** `normalizeSessionConfig` (the existing #143 throw), reused via the shared `revocation` flag | A second boot check in `session/config.ts`; a `?? lifetime` TTL fallback that survives the gate. |
| "A credential-change flow must call the eviction." | Framework home = the guard eviction API; **caller responsibility** (the app's password-change/recovery flow) is out of framework scope, documented (ASVS 7.4.2). | The framework silently assuming a flow fired it. |

**Binding on the implementer.** Enforcement in two places, the survival rule spelled twice, or a `sub`
that diverges from `d[sessionKeyName]` is a **plan violation, not a style note**.

## 6. Technical context

- **Language / runtime**: TypeScript on Deno; Deno KV (strong consistency); JSR-only specifiers.
- **Packages touched**: `@lockness/session` (`revocation_store.ts`, `cookie.ts`, envelope `sub`,
  `store.ts` + `Session`/`SessionDriver` ports, `mod.ts` — export `sub`/`setSubject` but **not**
  `revokeUser`), `@lockness/auth` (`session_guard.ts` — `setSubject` on every establisher, the two
  eviction methods, remember-me token invalidation), **`@lockness/core`** (`normalizeSessionConfig` —
  the precondition already lives here; confirm the reuse and tighten the TTL fallback), and
  `@lockness/auth-provider` / the remember-me provider contract (a "drop a user's remember-me tokens"
  capability — OQ-1).
- **Builds on #143**: reuses `IssuedIdentity`, the re-seal preserve/reset machinery, the
  memoized-store-by-reference lifecycle (`registry.ts`), and the fail-closed / strong-consistency
  contract. A new *dimension* on an existing subsystem, not a new subsystem.
- **Testing**: `Deno.test` with an in-memory `RevocationStore` double (the +2 methods ripple to ~5
  existing doubles in `cookie_revocation.test.ts` — a build-verified mechanical edit), the cookie
  `open`/`seal` helpers, and FakeTime for epoch/`iat`/same-second ordering. Follows
  `packages/session/tests/cookie_revocation.test.ts` and `cookie_absolute_lifetime.test.ts`.

### Domain model

- **Bounded context**: session lifecycle (`@lockness/session`) owns the *mechanism* — an opaque `sub`,
  the eviction epoch, read-time enforcement; identity/auth (`@lockness/auth`) owns the *policy* — who
  the subject is, when to evict, and the remember-me interaction.
- **Value object**: `sub` — an opaque principal token, immutable across re-seals, reset on
  `regenerate()` and re-asserted by the establisher; the session layer never interprets it.
- **Entity**: the per-subject **eviction epoch** — identity `sub`, value the last eviction second.
- **Invariant**: a session authenticates only while `iat ≥ userRevokedSince(sub)` (when `sub` present)
  **and** it passes the `jti` check **and** it is within the cap; and `sub === d[sessionKeyName]`.
- **Out of scope**: per-session `jti` revocation itself (#143); a UI for naming/listing devices;
  per-user revocation on the non-cookie drivers (they hold server-side records — delete them instead,
  §9 R3); remember-me *absolute lifetime* (#146, shipped) — but remember-me *token invalidation on
  eviction* IS in scope here (FR-007).

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | Driver uses `@lockness/hono`. |
| JSR-only specifiers | pass | No new deps; Deno KV is built-in. |
| No `any` in exported APIs | pass | New surface is `string`/`number`; test doubles keep the lint-ignore pattern. |
| JSDoc on public APIs | pass | New store methods, `sub`, `setSubject`, the two guard methods, incl. `@throws` for fail-closed/unauthenticated paths. |
| No silent catches | pass | The per-user check's catch refuses via the existing rejection reporter; writes propagate. |
| MVC layering | pass | Mechanism in session, policy in auth; the `sub` concession is named, not hidden (§1). |
| TDD | pass | FR-009 writes failing tests first, each negative-tested. |
| Commit discipline | pass | Split: `feat(session)`, `feat(auth)`, `fix(core)` (TTL/precondition tighten), `test`, `docs`. |

### Complexity tracking

`sub` in the sealed envelope is additive JSON (no `WIRE_VERSION` bump). The remember-me token
mass-invalidation (FR-007) may add a provider-contract method (OQ-1) — recorded, not hidden. No
principle violated.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/session` `RevocationStore` port + KV adapter | yes | `revokeUser`/`userRevokedSince` (new, **not exported**); ripples to ~5 test doubles. |
| `packages/session/drivers/cookie.ts` | yes | `sub` in `seal`/`open`, preserved/reset with `IssuedIdentity`; per-user check in `read()`; `setSubject?`; `#revocationTtl()` no longer `?? lifetime`. |
| `packages/session/store.ts` + `Session`/`SessionDriver` ports | yes | `setSubject(id)` on `Session` (1 impl); optional `setSubject?` on `SessionDriver` (cookie only). |
| **`@lockness/core`** `normalizeSessionConfig` | yes | Confirm the existing precondition covers per-user; tighten the revocation TTL fallback. |
| `packages/auth/guards/session_guard.ts` | yes | `setSubject` after every `regenerate()`; `logoutEverywhere`/`logoutOthers`; remember-me token invalidation. |
| remember-me provider contract (`@lockness/auth-provider`) | yes (OQ-1) | A capability to drop a user's remember-me tokens. |
| HTTP / cookie wire format | no | Still one AES-GCM cookie; `sub` rides inside. |
| Non-cookie session drivers | no | Untouched (optional driver method; out of scope §9 R3). |

### Documentation (this feature)

- `packages/session/docs/DOCS.md` — the eviction epoch, the `absoluteLifetime` precondition, fail-closed
  semantics, the raise-the-cap caveat.
- `packages/auth/docs/DOCS.md` — `logoutEverywhere()`/`logoutOthers()`, the remember-me invalidation,
  and the credential-change / recovery guidance (ASVS 7.4.2) — replacing #143's "does NOT do per-user
  eviction" residual.

No front-end surface — no artifacts.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **R1 — capless revocation resurrects an evicted session** (the epoch entry expires before a capless session does). | The `@lockness/core` gate already refuses `revocation && !absoluteLifetime` (FR-008); the epoch TTL is `absoluteLifetime` only (no `?? lifetime`), closing the `configureSession` bypass. |
| **R2 — a session established without a `sub` escapes eviction.** | FR-004 sets `sub` on **every** establisher incl. the remember-me path; the only residual is pre-deploy cookies, bounded by the cap. |
| **R3 — only the cookie driver is covered.** | Server-side drivers evict by deleting records — a different mechanism, out of scope; documented. |
| **R4 — `logoutOthers` ordering.** | Epoch **first**, then `regenerate()`, then re-assert `sub`; a test asserts the survivor lives and an older session dies. |
| **R5 — same-second `logoutEverywhere`.** | Strict `<` on the epoch **plus** revoking the acting `jti` kills the acting session deterministically regardless of second granularity; boundary tests both ways. |
| **R6 — remember-me re-mint after eviction** (fresh `iat > epoch` survives). | Eviction invalidates the user's remember-me tokens (FR-007), so the captured cookie has no token to recycle. |
| **R7 — `revokeUser`/`userRevokedSince` reachable by app code** → force-logout DoS + cross-user eviction-timestamp oracle. | Not exported from `mod.ts`; reachable only via the guard, scoped to `this.user.id`; a negative test asserts the public surface exposes no raw subject-taking revoke. |

## 10. Architecture audit

`architect-expert` on this plan — verdict **fail** (3 HIGH, 3 MEDIUM, 2 LOW). Coverage: §5 table
completeness, the OQ-1/2/3 homes, and the seal/open + port + config blast radius across `session`,
`auth`, and `core`. OQ-1/2/3 recommendations **confirmed sound** (with F6's concession). Kept separate
from §11.

| # | Finding (sev) | What was done |
| :--- | :--- | :--- |
| A1 | **HIGH** — FR-007 precondition homed in the wrong package: it lives in `@lockness/core` `normalizeSessionConfig`, not `session/config.ts`; §6 omitted `@lockness/core`. | **Plan changed.** FR-008 retargets the home to `@lockness/core` (the existing throw is reused); §6/§8 add `@lockness/core`; §5 row 7 corrected. |
| A2 | **HIGH** — the remember-me recycle path establishes a session with no `sub` and escapes eviction (reopens ASVS 7.4.2). | **Plan changed.** FR-004 now covers every `regenerate()`-ing establisher incl. remember-me + `authenticateAsClient`; SC-006 + an FR-009 test added. |
| A3 | **HIGH** — `sub` reset-on-regenerate ordering unpinned: set-before-regenerate loses it on login; the `logoutOthers` survivor loses it after its regenerate. | **Plan changed.** New §5 row 3 (`sub` re-asserted after every regenerate); FR-004 pins set-**after**-regenerate; FR-006 re-asserts `sub` on the `logoutOthers` survivor; tests added. |
| A4 | **MEDIUM** — the store→driver plumbing for `sub` was unspecified and could collapse into the forbidden `d`-sniffing. | **Plan changed.** FR-005 + §5 row 4: an optional `SessionDriver.setSubject?(sub)`, cookie-only. |
| A5 | **MEDIUM** — two homes for "the subject": `authenticate()` keys `d[sessionKeyName]`, the per-user check keys `sub`. | **Plan changed.** FR-004 pins the invariant `sub === d[sessionKeyName]`; §5 row 2's duplication clause names divergence; a test asserts equality. |
| A6 | **MEDIUM** — OQ-1's bounded-context concession over-cleaned ("not a leak"). | **Plan changed.** §1 now names the concession plainly (session holds an *opaque principal token*, never interprets `sub`); recommendation kept. |
| A7 | **LOW** — FR-006 (credential-change eviction) had no enforcement home. | **Plan changed.** §5 row 8: framework home = the guard API; the app flow calling it is caller responsibility, documented. |
| A8 | **LOW** — `RevocationStore` +2 methods ripple to the adapter + ~5 doubles (counted cost, not a smell). | **Accepted, recorded** in §6/§8 as a build-verified mechanical edit. |

## 11. Security audit

`security-expert` on this plan — verdict **fail** (2 HIGH, 2 MEDIUM). Coverage: the eviction surface,
`sub` provenance (confirmed unforgeable — sealed, server-set), authorization scoping, and cross-user
disclosure. Fail-closed on the per-user check and `sub` non-forgeability **confirmed sound**. Kept
separate from §10.

| # | Finding (sev) | What was done |
| :--- | :--- | :--- |
| S1 | **HIGH** — FR-007's "reuse #143's precondition" premise: no gate in `session/config.ts`, and `#revocationTtl()` falls back `absoluteLifetime ?? lifetime` → capless revocation resurrects. | **Plan changed** (partly reconciled with A1): the boot gate **does** exist in `@lockness/core` (verified helpers.ts:172), so the primary path is closed; the residual `configureSession` bypass + `?? lifetime` fallback are closed by FR-008 (epoch TTL = `absoluteLifetime` only, and the per-session TTL tightened in the same `fix(core)`/session change). Net severity of the residual: MEDIUM, folded. |
| S2 | **HIGH** — remember-me escape: the recycle path yields a `sub`-less, fresh-`iat` session, and `logoutEverywhere`/`Others` never invalidate remember-me tokens → post-reset bypass. | **Plan changed.** FR-004 sets `sub` on the remember-me path; FR-006/FR-007 invalidate the user's remember-me tokens on eviction; SC-006 + tests added. The remember-me token-drop capability is **OQ-1** (a provider-contract addition). |
| S3 | **MEDIUM** — `revokeUser`/`userRevokedSince` take an arbitrary subject; the "don't expose" was prose, and §8 listed `mod.ts` export. | **Plan changed.** FR-001 marks them **not exported**; FR-006 scopes eviction to `this.user.id` and throws if unauthenticated; §9 R7 + an FR-009 negative test (no raw subject-taking revoke on the public surface). |
| S4 | **MEDIUM** — epoch unit unpinned (`iat` is epoch-seconds); strict `<` lets a same-second `logoutEverywhere` acting session survive (contradicts SC-003). | **Plan changed.** FR-001 pins epoch-**seconds**; FR-006 has `logoutEverywhere` also revoke the acting `jti` so it dies deterministically; SC-003 + same-second boundary tests both ways. |

## 12. Open questions

The two audits **confirmed OQ-1/2/3's original recommendations** (enforcement in `read()` with an
opaque `sub`; `setSubject` on the port + an optional cookie-only driver method; reuse the `revocation`
flag). Those are recorded as settled below. The audits surfaced **one genuinely new decision** — the
remember-me token-invalidation scope — which is the only thing that changes the work materially, so it
is the question for the stop.

| Question | Answer | Date |
| :--- | :--- | :--- |
| OQ-1 — Remember-me token invalidation on eviction (security S2 / FR-007). | **Settled: (a) add `deleteAllRememberTokens(user)` to `SessionWithRememberMeProviderContract`**, called from the guard eviction. A provider-contract addition (base + drizzle + kysely + the `app/` scaffold + the test doubles implement it); the complete fix, closing the ASVS 7.4.2 bypass rather than deferring it. Rejected: a second per-user remember-me epoch subsystem (more surface), and deferring (ships the gap the feature exists to close). | 2026-09-02 |
| OQ-2 — Enforcement home (was OQ-1). | **Settled by both audits: session `read()` + an opaque `sub` claim.** The auth-guard alternative must reinvent an `iat` it cannot see; unsound. Concession named in §1. | 2026-09-02 (audit-confirmed) |
| OQ-3 — Subject API (was OQ-2). | **Settled: `session.setSubject()` on the `Session` port + an optional `SessionDriver.setSubject?()`, cookie-only.** The reserved-key-in-`d` alternative is the `d`-sniffing §5 row 2 forbids. | 2026-09-02 (audit-confirmed) |
| OQ-4 — Opt-in flag (was OQ-3). | **Settled: reuse the existing `revocation` flag.** A separate `userRevocation` flag needs its own core gate + store-injection gate for no gain. | 2026-09-02 (audit-confirmed) |

### Decided without asking

- **Eviction is the guard's public surface** (`logoutEverywhere`/`logoutOthers`), scoped to
  `this.user.id`, throwing if unauthenticated — not raw store access.
- **"Log out others" = epoch → regenerate → re-assert `sub`**, reusing #143's `regenerate()`.
- **Epoch keyed on `iat` in epoch-seconds**; strict `<`; `logoutEverywhere` also revokes the acting
  `jti`.
- **Cookie driver only** for the session dimension, mirroring #143.
- **The `#revocationTtl` `?? lifetime` fallback is removed** (defence-in-depth for the `configureSession`
  bypass), tightening the pre-existing #143 behaviour in the same change rather than filing it.
