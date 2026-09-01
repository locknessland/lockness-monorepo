# Plan: Cookie session absolute lifetime cap

**Branch**: `011-cookie-absolute-lifetime` | **Date**: 2026-09-01 | **Backlog item**:
[#143 — Cookie sessions have no absolute lifetime and cannot be revoked](https://github.com/locknessland/lockness-monorepo/issues/143)

**This is the feature's one planning document.** Read whole by whoever implements it.

---

## 1. Why this exists

A cookie session today can live forever. `seal()` writes `iat` (issued-at) and
`exp` (expiry) into the AES-GCM ciphertext, but `open()` checks **only** `exp`
(`cookie.ts:366`), and every `write()` mints a fresh `exp` from `Date.now()`. So
a session refreshed on each request never ages out — an attacker who captures a
valid cookie refreshes it forever. Logout (`destroy()`) deletes only the
client's copy and revokes nothing.

#137 already did the expensive half: it moved `exp` **inside** the ciphertext,
which is what makes expiry binding at all (the `maxAge` cookie attribute is a
browser hint an attacker discards).

**A correction the security audit forced before any code (see §11, Finding 1):**
the issue's premise — *"the cap is measured from the sealed `iat`, which no write
changes"* — is **factually wrong about the code**. `seal()` sets
`iat: Math.floor(Date.now()/1000)` on **every** call (`cookie.ts:281`), and
`SessionStore.save()` re-seals whenever the session is dirty (`store.ts:123`).
So a refreshed session advances `iat` too, and `now - iat` never grows — a cap
that only reads the sealed `iat` would be **inert against the exact attack #143
targets**. The cap therefore requires a second, essential piece: the
**first-issuance `iat` must be preserved across re-seals**. That is still cheap
and needs **no wire-format change** (`iat` is already sealed) and **no
`SessionDriver`-interface or `SessionStore` change** — because the cookie driver
is **constructed per request** and the *same instance* handles `read()` then
`write()`, so it stashes the `iat` it opened and reuses it when it re-seals.

Revocation — server-side invalidation of an already-issued cookie — is the other
half, and it is **not** cheap: it introduces server-side storage to a stateless
driver. **Decided at Stop 1 (2026-09-01): revocation IS in scope for this
feature, per-session and Deno-KV-backed** (the user's call, overriding the
issue's own "split it out" guidance). The design is §13; because it is a new
security-sensitive subsystem the original two audits explicitly excluded, it gets
its **own** audit pass before any code (§10/§11 record both passes).

**A consequence stated plainly:** with revocation on, the cookie driver is no
longer purely stateless — `open()` performs a per-request KV lookup and the
process holds a KV handle. That is the cost the user accepted to get revocation
on the cookie transport; the absolute-cap half remains usable with revocation
off (both are independently opt-in).

## 2. User scenarios

### US1 — a re-sealed session ages out at the hard ceiling (P1, security)

**Given** a cookie session first issued at `iat`, absolute lifetime `A` configured
**When** the session is written (re-sealed) on requests past `iat + A`
**Then** `open()` refuses it — because the driver **preserves the original
`iat`** across those re-seals, `now - iat` does grow past `A` and the cap fires.
(The test MUST re-seal the cookie repeatedly and feed each re-sealed cookie back
in, not merely advance a clock against one fixed cookie — a clock-only test would
pass even against the inert mechanism. Security F1 / SC-001.)

### US2 — a session within the ceiling is accepted (P1)

**Given** a session first issued at `iat`, now < `iat + A`, within its idle `exp`
**When** `open()` reads it
**Then** it is accepted — the cap refuses only past the ceiling; it does not
shorten the idle window.

### US3 — an `iat`-less or non-positive-cap payload cannot bypass the cap (P2, security)

**Given** the cap is enforced (`absoluteLifetime` is a positive number) and a
sealed payload whose `iat` is missing or not a number
**When** `open()` reads it
**Then** it is refused — a sealed-but-unchecked field is a false assurance. And
the cap is gated on `typeof absoluteLifetime === 'number'`, **not truthiness**,
so `absoluteLifetime: 0` does not silently disable it (Security F3).

### Edge cases

- `absoluteLifetime === undefined` → cap **off**; `open()` behaves exactly as
  today. **This is the only off-state** — normalisation rejects `<= 0` rather
  than treating it as off (fail-closed on misconfig, Security F3).
- A **new** session (no valid cookie presented, or `open()` refused) → the
  driver mints a fresh `iat`; the absolute clock starts now.
- `regenerate()` (login / fixation rotation) → resets the stashed `iat`, so a
  fresh authenticated session starts a fresh absolute clock.
- Clock skew: the cap uses the same `Math.floor(Date.now()/1000)` epoch-second
  basis as the existing `exp` check — no new time source.

## 3. Requirements

- **FR-001**: `open()` refuses a payload when the cap is enforced and
  `now - iat` exceeds the configured absolute lifetime, **independently of
  `exp`**. Home: `cookie.ts` `open()` path.
- **FR-002**: When the cap is enforced, `open()` refuses a payload whose `iat`
  is missing or not a number. Home: `cookie.ts` `open()` path.
- **FR-003**: The cap is enforced **iff `typeof absoluteLifetime === 'number'`**
  (never truthiness — `0` must not silently disable it); normalisation rejects a
  non-positive `absoluteLifetime`. Home: `open()` gate + `helpers.ts`
  normalisation. (Security F3.)
- **FR-004**: **The first-issuance `iat` is preserved across re-seals.** The
  cookie driver stashes the `iat` it reads when opening a valid cookie, and
  `seal()` reuses it on the next `write()` for that already-issued session; a
  **new** session (nothing valid opened) mints a fresh `iat`; `regenerate()`
  resets the stash. Home: `cookie.ts` — the per-request driver instance field +
  `seal()`'s new `issuedAt?` parameter. **Without this the cap is inert**
  (Security F1). No `SessionDriver`-interface or `SessionStore` change.
- **FR-005**: A config field `absoluteLifetime` (seconds) carries the ceiling,
  threaded through: `SessionConfig` in `packages/session/types.ts`; the core
  input `SessionConfig` in **`packages/core/kernel/kernel_decorators.ts`**; and
  the normalisation in `packages/core/kernel/bootstrap/helpers.ts` — **both** the
  `NormalizedSessionConfig` interface (`:61`) **and** the `normalizeSessionConfig`
  return object (`:163`) (omit either and the field is silently dropped for every
  kernel app — the single likeliest plumbing break). `packages/session/config.ts`
  and `middleware.ts` need **no change**: the field rides their existing
  `{ ...spread }` generically (Architecture MED2/MED3). The driver's `read()`
  passes `this.config.absoluteLifetime` to the open path.
- **FR-006**: The refusal uses a distinct `refuse('absolute-expired')` reason
  (not a reused `'expired'`), so an operator can tell an idle-timeout from a
  hard-cap eviction **in logs only** (`refuse()` logs server-side and returns
  `null`; the client sees only an unauthenticated session — no leak). Home:
  `cookie.ts` `Rejection` union.
- **FR-007**: `packages/session/docs/DOCS.md` documents, beside `lifetime`: that
  `lifetime` is the **idle** window and `absoluteLifetime` the **hard ceiling**
  (opt-in, undefined = off, recommended value per Q1); and, at the cookie-driver
  choice point, the residual security posture — (a) logout does **not** revoke on
  this driver, (b) the cap bounds **maximum** not immediate exposure (a cookie
  stolen and used within the window authenticates as the victim), (c) operators
  needing revocation or theft-within-window mitigation use a server-side driver
  (`memory`/`deno-kv`/`redis`) (Security F4). And that the cap bounds the
  **session cookie only**, not the remember-me credential (FR-009).
- **FR-008**: The revocation decision is **recorded on issue #143** either way.
  If "no" (recommended), DOCS.md states the trade-off (FR-007). If "yes", it
  becomes its **own** issue and is NOT built here (Q2).
- **FR-009**: The plan and DOCS.md state that the cap bounds the **session
  cookie only**. `@lockness/auth`'s remember-me credential
  (`session_guard.ts:225-265`) is a separate, `open()`-bypassing, revocable-but-
  unbounded-renewable token; "auth gains the cap for free" is **false** for it. A
  remember-me absolute cap is out of this feature's scope; note it as a possible
  follow-up (Security F2).

**Revocation (in scope per Stop 1 — see §13 for the full design):**

- **FR-010**: `seal()` embeds a unique per-session `jti` (a CSPRNG nonce) in the
  sealed plaintext `{ d, iat, exp, jti }`. It is **preserved across re-seals**
  exactly like `iat` (FR-004) — a re-seal of one issued session keeps its `jti`;
  a new session or a `regenerate()` mints a fresh one. Additive to the sealed
  JSON — **no `WIRE_VERSION` bump**.
- **FR-011**: A Deno-KV-backed revocation set records revoked `jti`s. `open()`
  refuses a cookie whose `jti` is in the set (`refuse('revoked')`). `destroy()`
  adds the current session's `jti` to the set. Home: a `RevocationStore` inside
  `@lockness/session`, injected into the cookie driver.
- **FR-012**: A revocation entry's KV TTL is the session's **remaining absolute
  life** (`iat + absoluteLifetime - now`), so the set self-prunes and cannot grow
  unbounded. **Revocation therefore requires `absoluteLifetime` to be set** — an
  unbounded cookie has no finite retention for its revocation entry. This
  coupling is enforced in normalisation: enabling revocation without
  `absoluteLifetime` is a configuration error, refused at boot (fail-closed).
- **FR-013**: A cookie with **no `jti`** (issued before this feature) cannot be
  revoked — `open()` treats a missing `jti` as "not revoked" (it is still subject
  to the absolute cap and idle `exp`). This is stated in DOCS.md; it is a
  transitional property, not a bypass (an attacker cannot mint a `jti`-less
  GCM-valid cookie).
- **FR-014**: Revocation is **opt-in** (`revocation: true`, default off) **and
  requires `absoluteLifetime`** (FR-012 — its retention horizon; enabling it
  without the cap is refused at boot). With it off, the driver holds no store
  reference and `read()`/`destroy()` do no KV work — the driver stays stateless.
  Home: the session config + normalisation.

## 4. Success criteria

- **SC-001**: A session **re-sealed** (written) on every request is refused once
  `now - iat` passes the absolute lifetime — proven with a fake clock **and by
  feeding each re-sealed cookie back into `open()`**, so the test fails against
  the inert (iat-re-minted) mechanism (Security F1).
- **SC-002**: A session within both the idle window and the absolute cap is
  accepted; its preserved `iat` does not shorten the idle window.
- **SC-003**: A sealed payload with a missing/non-number `iat` is refused when
  the cap is enforced.
- **SC-004**: With `absoluteLifetime` unset, behaviour is byte-for-byte current
  behaviour — no session invalidated on upgrade.
- **SC-005**: A **non-default** configured `absoluteLifetime` threads from kernel
  config all the way to `open()` (guards the silent-drop at `NormalizedSessionConfig`),
  and `absoluteLifetime: 0` does **not** silently disable the cap.
- **SC-006** (revocation): After `destroy()` on a session, its cookie — replayed
  verbatim — is refused by `open()` (`refuse('revoked')`), proving logout revokes
  even a captured copy. Proven against a fake/in-memory KV.
- **SC-007** (revocation): A `jti` preserved across re-seals means a session
  revoked at any point stays revoked through every later re-sealed cookie (the
  attacker cannot shed the revocation by triggering a re-seal).
- **SC-008** (revocation): Enabling revocation without `absoluteLifetime` is
  refused at boot (fail-closed, FR-012); with revocation off, `open()`/`destroy()`
  perform no KV work (the driver stays stateless, FR-014).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| A cookie session is refused once `now - iat` exceeds the absolute lifetime | `cookie.ts` `open()` path | a second check in `read()`, the auth guard, or middleware; a `maxAge`/cookie-attribute check (never the boundary) |
| **The first-issuance `iat` is stable across re-seals** (stash on open, reuse on seal) | `cookie.ts` — per-request driver instance field + `seal(…, issuedAt?)` | re-minting `iat` on every `seal()` (the inert default — Security F1); carrying `iat` in `SessionStore` or the `SessionDriver` interface (an unnecessary cross-cutting change) |
| `iat` must be present and numeric, and the cap gated on `typeof === 'number'` (not truthiness) | `cookie.ts` `open()` path | trusting `seal()` always writes it; a `0`-as-off truthiness check (Security F3) |
| The `absoluteLifetime` value, its default, and rejecting `<= 0` | normalisation in `core` `helpers.ts` (`normalizeSessionConfig`) — **kernel path only** | a second default in `session/config.ts` (§8 says: no change there under opt-in); a hard-coded value in `open()` |
| A session is refused if its `jti` is in the revocation set | `cookie.ts` `open()` (after decrypt, beside the cap check) | a revocation check in the auth guard or middleware; trusting the cookie's absence |
| The `jti` is stable across re-seals, fresh on new/regenerate | `cookie.ts` — the per-request driver stash + `seal(…, jti?)` (same mechanism as `iat`, FR-004) | minting a fresh `jti` per write (lets an attacker shed revocation — SC-007) |
| Where revoked `jti`s live and their retention (TTL = remaining absolute life) | `RevocationStore` (Deno KV) in `@lockness/session`, injected into the driver | a second store in the driver; an unbounded set (no TTL); a KV read duplicated in `read()` and `open()` |
| Revocation requires `absoluteLifetime` (bounded retention) | normalisation in `core` `helpers.ts` (boot refusal) | letting revocation run with no cap (unbounded KV growth) |

**On `absoluteLifetime >= lifetime`:** this is a **usability note, not a homed
invariant** (Architecture MED1). `normalizeSessionConfig` runs on the kernel path
only; direct `configureSession`/`sessionMiddleware` and per-mount overrides reach
the driver via a generic spread that never calls it. Enforcement is safe
regardless (a cap below the idle window merely evicts *earlier* — benign), so the
plan does not pretend a clamp holds everywhere. DOCS.md notes "a cap below the
idle window simply evicts sooner."

**Binding on the implementer.** A decision may not move out of its home without
this plan being amended first.

## 6. Technical context

- **Language / runtime**: Deno, native TypeScript. JSR-only deps. **No
  wire-format change**: `WIRE_VERSION` (`cookie.ts:41`) untouched — `iat` is
  already sealed.
- **The mechanism, precisely**: `open()` gains an `absoluteLifetime?` param and
  surfaces the sealed `iat` to the driver's `read()` (via an internal
  richer-return helper; the public `open()` signature stays `SessionData | null`
  + the new optional param, so its ~25 existing test call sites compile
  unchanged). `read()` stashes the `iat`. `seal()` gains an `issuedAt?` param;
  `write()` passes the stashed `iat` so a re-seal preserves the first issuance.
  `regenerate()` clears the stash. **No `SessionStore` change, no `SessionDriver`
  interface change** — the per-request cookie driver instance carries the `iat`
  from `read` to `write` within the one request.
- **Testing**: `Deno.test` + `FakeTime` (`@std/testing/time`, already used) so
  the cap is tested without wall-clock waits; the test **re-seals** across the
  boundary (SC-001).
- **Config threading (edit set — verified against the code)**: 5 files edited —
  `session/types.ts`, `core/kernel/kernel_decorators.ts`,
  `core/kernel/bootstrap/helpers.ts` (**two edits**: interface + return),
  `cookie.ts`, `DOCS.md`. `session/config.ts` and `middleware.ts` are in the
  data-flow but edited **nowhere** (generic spread) (Architecture MED2/MED3).

### Domain Model (from #143, authoritative)

- **Bounded context**: `session`.
- **Vocabulary**: **Idle lifetime** (`lifetime` — refreshed every write);
  **Absolute lifetime** (`absoluteLifetime` — since first issuance, never
  refreshed); **Sealed payload** (`{ d, iat, exp }`, AES-GCM + AAD);
  **Revocation** (server-side invalidation — deferred).
- **Aggregate root**: `CookieSessionDriver` — owns the seal/open lifecycle **and
  the first-issuance `iat` for the request**.
- **Value objects**: `SealedPayload(d, iat, exp)` — `iat <= exp`, epoch seconds,
  inside the ciphertext; `SessionConfig(…, absoluteLifetime, …)`.
- **Invariants**: refused once `now - iat > absoluteLifetime`; **`iat` is stable
  across re-seals of one issued session**; `iat` written and read by the same
  path; `maxAge` is never the boundary.
- **Out of scope (domain)**: `auth` session-guard **primary** path consumes
  `open()` and gains the cap — but the **remember-me** path does not (FR-009);
  `core` bootstrap carries the field, owns no policy.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| No direct `hono` import | PASS |
| JSR-only deps | PASS — no new dep. |
| No `any` in exported APIs | PASS — `absoluteLifetime?: number`, `open(…, absoluteLifetime?)`, `seal(…, issuedAt?)` all typed. |
| Tailwind v4 | N/A |
| Pre-completion gate | PASS — at implement. |
| No manual `deno.lock` edit | PASS. |
| JSDoc on public APIs | PASS — `open`/`seal` new params, the config field, and the `destroy()`/`regenerate()` no-op docs (already honest) extended to reference the cap + recorded revocation decision. |
| MVC layering | PASS — driver + config normalisation. |
| No silent catches | PASS — refusals are explicit `refuse(...)` returns. |
| Commit discipline | PASS. |

No violations → no Complexity Tracking entry.

## 8. Surface impact

**Internal + one new optional config field. No breaking change (Q1 = opt-in).**

- `packages/session/drivers/cookie.ts` — `open()` gains `absoluteLifetime?` + the
  cap/`iat` checks + surfacing `iat`; `seal()` gains `issuedAt?`; the driver
  stashes `iat` on `read()`, reuses it on `write()`, clears it on `regenerate()`;
  a new `Rejection` member `'absolute-expired'`; `destroy()`/`regenerate()` JSDoc
  extended.
- `packages/session/types.ts` — `SessionConfig.absoluteLifetime?: number`.
- `packages/core/kernel/kernel_decorators.ts` — input `SessionConfig` gains the
  field **(corrected path — not `bootstrap/kernel_decorators.ts`)** (Arch MED2).
- `packages/core/kernel/bootstrap/helpers.ts` — **two edits**: `NormalizedSessionConfig`
  interface **and** `normalizeSessionConfig` return; apply the default (opt-in →
  pass through, `undefined` when unset) and reject `<= 0`.
- `packages/session/config.ts`, `packages/session/middleware.ts` — **no change**
  (generic spread) (Arch MED3).
- `packages/session/docs/DOCS.md` — the field, idle-vs-ceiling, the residual
  posture (F4), the remember-me caveat (F2/FR-009), the revocation trade-off (F8).
- **No front-end surface** → no artifacts. **No wire-format change.**

## 9. Risks

- **R1 — turning the cap on by default logs existing users out.** Mitigation:
  Q1 = opt-in (`undefined` = off), documented recommended value.
- **R2 — the cap ships inert.** The whole feature's value depends on FR-004
  (preserve `iat`). Mitigation: SC-001 re-seals across the boundary; a clock-only
  test is explicitly forbidden.
- **R3 — the field silently drops at `NormalizedSessionConfig`.** Mitigation:
  SC-005 tests a non-default value reaching `open()` end-to-end.
- **R4 — scope creep into revocation or remember-me.** Mitigation: Q2 records the
  revocation decision; FR-009 scopes out remember-me with a follow-up note. This
  branch ships only the session-cookie cap.
- **R5 — `regenerate()` iat reset vs preservation.** A login should start a fresh
  absolute clock; an ordinary refresh should not. Mitigation: stash reused on
  `write()`, cleared on `regenerate()` — the two paths are distinct.

## 10. Architecture audit

_`architect-expert` on this plan, 2026-09-01, before any code. **No CRITICAL/
HIGH.** 3 MEDIUM + 2 LOW — all folded._

| Finding | Sev | Disposition |
| :--- | :--- | :--- |
| §5 homed the `>= lifetime` clamp/default in `normalizeSessionConfig`, but direct-middleware and per-mount config paths bypass it (kernel path only) | MED | **Plan changed.** Reclassified `>= lifetime` to a **usability note** (§5), not a homed invariant; Q1 locked opt-in removes the default-value home entirely. Enforcement is path-independent (rides the spread into `open()`). |
| FR/§8 cited `packages/core/kernel/bootstrap/kernel_decorators.ts` — wrong; it is `packages/core/kernel/kernel_decorators.ts` | MED | **Plan changed.** Path corrected in FR-005 and §8. |
| §8 told `config.ts` to apply a default that §5 forbids (two-home risk inside the plan) | MED | **Plan changed.** §8 now states `config.ts`/`middleware.ts` need **no change** under opt-in; the field rides the generic spread. |
| The field threads through three parallel `SessionConfig` shapes — pre-existing shotgun-surgery, one field worse (deliberate boundary, not introduced here) | LOW | **Noted, no change.** `NormalizedSessionConfig` is the deliberate narrow boundary (core must not import `session/types.ts`); a future `Pick<>` derivation is the escalation if it grows again. |
| Distinct `refuse('absolute-expired')` and an optional `open()` param are both correct | LOW | **Confirmed.** Kept (FR-006); param optional so ~25 call sites compile unchanged. |

## 11. Security audit

_`security-expert` on this plan, 2026-09-01, before any code. **No CRITICAL.**
1 HIGH + 2 MEDIUM + 1 LOW — all folded. Kept separate from §10._

| Finding | Sev | Disposition |
| :--- | :--- | :--- |
| **The cap is inert**: `seal()` re-mints `iat` on every dirty write (`cookie.ts:281` via `store.ts:123`), so a refreshed session's `now - iat` never grows — the cap never fires on the exact "refreshed forever" attack. The issue's own premise ("`iat` which no write changes") is false; SC-001 could not pass under the original FR set, and a clock-only test would pass **falsely**. | HIGH | **Plan reshaped.** Added **FR-004** (preserve first-issuance `iat` across re-seals via the per-request driver + `seal(…, issuedAt?)`); corrected §1/§5/§6/§8 to say the change touches seal/open/read/write, not "one comparison"; SC-001 now **re-seals** across the boundary and forbids a clock-only test. Still no wire-format / interface / store change. |
| "auth gains the cap for free" is incomplete — the remember-me credential bypasses `open()`, re-mints the session, and is itself unbounded-renewable (30-day, `session_guard.ts:225-265`) | MED | **Plan changed.** **FR-009** + §6 + DOCS.md state the cap bounds the **session cookie only**; remember-me is a separate revocable-but-unbounded token; a remember-me cap is a possible follow-up (out of scope). |
| The off-sentinel is unspecified — a truthiness check silently disables the cap at `absoluteLifetime: 0` (fail-open) | MED | **Plan changed.** **FR-003**: cap gated on `typeof === 'number'`, only `undefined` = off, normalisation rejects `<= 0`; SC-005 asserts `0` does not disable it. |
| The within-window residual is under-stated — a stolen cookie authenticates until the cap and logout does not revoke | LOW | **Plan changed.** **FR-007** requires DOCS.md to state (a) logout does not revoke here, (b) the cap bounds maximum not immediate exposure, (c) use a server-side driver for revocation / theft-within-window. |

**Confirmed right by the audit (not re-litigated):** FR-002 fail-closed
direction; the refusal reason is server-log-only (no client leak); `iat` is
GCM-authenticated so it cannot be attacker-forged; deferring revocation is a
defensible stateless-driver posture **provided the residual is documented**.

## 12. Open questions

**RESOLVED at Stop 1 (2026-09-01):**
- **Q1 → opt-in, docs recommend 7 days.** The cap is `undefined` = off; DOCS.md
  recommends `absoluteLifetime: 604800` (7 days) for operators who enable it.
- **Q2 → build revocation now, per-session, Deno-KV-backed** (§13). Overrides the
  issue's "split it out" guidance; the design gets its own audit pass (§10/§11).
- **Q3 (revocation mechanism) → per-session `jti` + KV revocation set**, not
  per-user "revoke everywhere" and not a pluggable multi-backend store.

**Q1 — the absolute-lifetime default and on/off semantics. Recommended: opt-in
(`absoluteLifetime` undefined = no cap), with a documented recommended value.**
Both audits converge on opt-in: architecture because it removes the default-value
two-home problem entirely (`undefined` is the natural absence of an optional
field, so there is nothing to home on two config paths); security/R1 because a
framework upgrade must not silently invalidate live sessions. The remaining
genuine product choice is the **recommended value** the docs suggest (e.g. 24h or
7 days). Resolved at Stop 1.

**Q2 — is revocation in scope for the stateless cookie driver? Recommended: No,
recorded on #143.** A stateless driver has no record to invalidate; operators
needing revocation use a server-side driver, and DOCS.md states the trade-off. If
"yes", it becomes its **own** issue and is not built here.

_Assumptions taken (one line each — correct me if wrong):_

- Field named `absoluteLifetime`; the enforced-off state is `undefined` only.
- `regenerate()` (login) resets the absolute clock; an ordinary refresh preserves it.
- A distinct `refuse('absolute-expired')` reason (log-only) over reusing `'expired'`.

## 13. Revocation design (in scope per Stop 1, full build)

Per-session, Deno-KV-backed, wired end-to-end through logout. Rewritten to fold
both revocation-pass audits (2 HIGH + 2 HIGH, MEDIUMs, LOWs — see §10/§11).

### The identity carried across re-seals: `IssuedIdentity`

`iat` and `jti` are one concept — **first-issuance identity, preserved across
re-seals, reset on `regenerate()`** — so they travel as one value object
`IssuedIdentity { iat: number; jti: string }`, not two parallel stashes and two
parallel `seal()` params (Architecture F4). The per-request cookie driver holds
one `#issued?: IssuedIdentity`; `seal(secret, data, lifetime, issued?)` takes it
as one argument. `jti` is **≥128 bits from `crypto.getRandomValues`** (the source
`seal()` already uses for salt/IV), never `Math.random`/a counter/UUIDv1/a hash
of user data — a weak jti would collide across sessions and revoke the wrong one
(Security F5).

### Mechanism (corrected homes)

1. **Mint / preserve / reset.** `seal()` mints a fresh `IssuedIdentity` for a
   **new** session and embeds `{ d, iat, exp, jti }` in the sealed plaintext
   (additive JSON — no `WIRE_VERSION` bump). The driver preserves `#issued`
   across re-seals; `regenerate()` **revokes the old jti then resets** `#issued`
   (rotation genuinely invalidates the old); a valid-but-`jti`-less pre-feature
   cookie **acquires a jti on its next re-seal** (mint-on-first-reseal — no prior
   revocation to shed, Security F7).
2. **`open()` stays pure; `read()` decides revocation.** `open()` is a
   deterministic offline crypto function — it does the decrypt, the cap check,
   and **surfaces** the `jti` (via the same richer-return helper the cap uses),
   but performs **no I/O**. The driver's `read()` (which owns I/O and holds the
   store) calls `store.isRevoked(jti)` and returns null on a hit (Architecture
   F3). §5 row 5 is corrected accordingly — the revocation decision is homed in
   `read()`, not `open()`.
3. **Fail CLOSED, strong consistency.** A KV error in `isRevoked()` makes
   `read()` **refuse** (return null) — matching the existing decrypt/JSON catches
   — never treat-as-not-revoked (Security F2, the fail-open trap). The read is
   **strongly consistent** (Deno KV default); an `eventual` optimisation is
   forbidden — a lagging replica is a logout-bypass window (Security F3). A
   failed `revoke()` **propagates**, never best-effort-swallows — a logout that
   silently fails to revoke is worse than one that errors (Security F2 write
   path).
4. **`destroy()` revokes and does NOT re-seal.** The trap (Architecture F2):
   `store.destroy()` sets `dirty`, so `save()` would re-seal **after**
   `driver.destroy()`. So `driver.destroy()` **revokes the current jti and emits
   a cookie *deletion*, and the driver marks itself closed so a trailing
   `write()` in the same request is suppressed** (no re-seal of a
   just-revoked/just-deleted session). This removes the "born-revoked cookie" and
   the "reset-the-stash-for-symmetry → live session after logout" footguns. The
   invariant is explicit: **`destroy()` suppresses the trailing re-seal;
   `regenerate()` resets `#issued` after revoking the old jti.** They are NOT
   symmetric.

### Store lifecycle — memoized in the registry, injected by reference

The `RevocationStore` (a port in `@lockness/session`: `isRevoked(jti)`,
`revoke(jti, ttlSeconds)`, Deno-KV adapter keyed `['session-revoked', jti]`) is
**memoized in `registry.ts`** — single-flight open + disposable-drain **on the
store**, mirroring `deno_kv.ts` but on the store, not the driver — and **injected
by reference** into each per-request `CookieSessionDriver`. This is the whole
point of Architecture F1: the cookie driver stays per-request and holds only a
*reference* to a process-shared store, so it never opens a handle per request
(the #138 leak). `createDriver` / the registry cookie branch gain the store
argument.

### Retention

`revoke(jti, ttl)` sets `ttl = iat + absoluteLifetime - now` (from the preserved
`iat`), so the entry expires exactly when the cap fires — self-pruning, no
unbounded growth. **Revocation therefore requires `absoluteLifetime`**: enabling
revocation without it is refused at boot (fail-closed normalisation). To avoid
the "raise the cap later → revoked cookie resurrected" edge (Security F6), the
TTL is computed from a **fixed maximum** (`absoluteLifetime` at revoke time,
floored to never shorten below the cookie's own sealed `exp` horizon), and DOCS
notes that lowering the cap is safe while raising it does not re-horizon existing
entries.

### End-to-end logout wiring (crosses into `@lockness/auth`)

The decisive fix (Security F1): `session_guard.logout()`
(`session_guard.ts:391`) today calls `session.forget()`, which never reaches
`driver.destroy()`. **`logout()` is rewired to call `session.destroy()`**, so the
current jti is revoked. `logout()` also **always** invalidates the remember-me
token (dropping the `if (this.viaRemember && user)` gate at `session_guard.ts:394`)
so a session logout cannot leave a captured remember-me cookie live (Security F4).

### What this still does NOT do (documented, not silently over-claimed)

- **No per-user "log out everywhere" / password-change eviction** (ASVS 7.4.2) —
  revocation is per-session `jti`; DOCS states, operator-facing, that recovering
  a compromised account does not by itself evict existing sessions.
- **Remember-me re-mint**: after the F4 fix a session logout kills the token, but
  the remember-me credential remains a separate mechanism; DOCS states the cap +
  revocation bound the session cookie and the (now logout-invalidated) remember
  token, not any future re-issued credential.
- **Theft-within-window**: a cookie stolen and replayed before logout
  authenticates until logout or the cap — bounded and now logout-terminable, not
  eliminated.

### Surface added by the full revocation build (folds into §8)

- **NEW** `packages/session/drivers/revocation_store.ts` — the port + Deno-KV
  adapter (single-flight open, disposable).
- `packages/session/drivers/registry.ts` — memoize the store, inject into the
  cookie branch.
- `packages/session/drivers/mod.ts` — `createDriver` gains the store param.
- `packages/session/mod.ts` — export `RevocationStore` type.
- `packages/session/drivers/cookie.ts` — `IssuedIdentity`, jti mint/preserve/reset,
  `open()` surfaces jti, `read()` does the fail-closed strong-consistency check,
  `destroy()` revokes + suppresses re-seal, `regenerate()` revokes old + resets,
  new `Rejection` member `'revoked'`.
- `packages/session/store.ts` — `forget()`-vs-`destroy()` is unchanged, but the
  auth guard now calls `destroy()`; confirm `store.destroy()` reaches
  `driver.destroy()`.
- `packages/auth/guards/session_guard.ts` — `logout()` → `session.destroy()` +
  always invalidate the remember-me token.
- `packages/session/config.ts` / `middleware.ts` — a `revocation` opt-in flag
  rides the generic spread (no logic change beyond reading it).
- `packages/session/docs/DOCS.md` + `packages/auth/docs/DOCS.md` — the residuals.

### Added success criteria

- **SC-009 (end-to-end)**: driving `SessionGuard.logout()` (not a unit test of
  `destroy()`) and replaying the captured pre-logout cookie → refused. This is
  the SC that would have caught Security F1.
- **SC-010 (fail-closed)**: with a `RevocationStore` whose KV read throws,
  `open()`/`read()` **refuses** the cookie (never authenticates); a `revoke()`
  whose write throws **propagates** from `destroy()`.
- **SC-011 (remember-me)**: after `logout()`, the remember-me token is
  invalidated server-side (a replayed remember cookie does not re-establish a
  session).

## 14. Revocation audit dispositions

### Architecture (revocation pass) — 2 HIGH, 2 MED, 1 LOW

| Finding | Sev | Disposition |
| :--- | :--- | :--- |
| Store lifecycle unspecified — R7 pointed the per-request driver at deno_kv's memoized pattern (→ #138 leak); edit-set missing revocation_store.ts/registry.ts/drivers/mod.ts | HIGH | **Fixed** — store memoized in `registry.ts`, injected by reference (§13); §8 edit-set corrected. |
| `destroy()`→`write()` re-seals with the revoked jti; stash-reset asymmetry vs `regenerate()` unstated → latent logout bypass | HIGH | **Fixed** — `destroy()` revokes + **suppresses the trailing re-seal** (emits deletion); the destroy-vs-regenerate invariant is explicit (§13 step 4). |
| Revocation decision homed in the pure free function `open()` (no store) | MED | **Fixed** — `open()` stays pure and surfaces `jti`; `read()` owns the `isRevoked` call (§13 step 2, §5 row 5 corrected). |
| `iat`+`jti` double-stash = Data Clump in formation | MED | **Fixed** — one `IssuedIdentity { iat, jti }` value object; `seal()` takes it as one arg (§13). |
| "independently opt-in" false given the `absoluteLifetime` precondition | LOW | **Fixed** — language corrected; revocation requires the cap (§13 retention, FR-012). |

### Security (revocation pass) — 2 HIGH, 2 MED, 3 LOW

| Finding | Sev | Disposition |
| :--- | :--- | :--- |
| **F1** Revocation not wired to logout — `guard.logout()` calls `forget()`, never `destroy()`; SC-006 false end-to-end | HIGH | **Fixed** — `logout()` rewired to `session.destroy()` (§13 wiring); **SC-009** drives `logout()` end-to-end. |
| **F2** KV check fail direction unpinned — naive default fail-**open** (read) / silent no-op (write) | HIGH | **Fixed** — pinned **fail-closed** on read (KV error → refuse) and write (error propagates); **SC-010** injects a KV error. |
| **F3** `isRevoked()` must be strongly consistent (replica-lag bypass) | MED | **Fixed** — strong consistency pinned, eventual-read forbidden (§13 step 3). |
| **F4** Over-claims durable logout; remember-me bypasses `open()` and re-mints | MED | **Fixed** — `logout()` always invalidates the remember token; residual documented; **SC-011**. |
| **F5** jti entropy/length unpinned; must never be logged | LOW | **Fixed** — ≥128-bit `crypto.getRandomValues`; jti kept out of every log line (§13). |
| **F6** Raising `absoluteLifetime` resurrects revoked cookies | LOW | **Fixed** — TTL from a fixed maximum; DOCS notes lower-safe / raise-does-not-re-horizon (§13 retention). |
| **F7** jti-less re-seal behaviour underspecified | LOW | **Fixed** — mint-on-first-reseal (§13 step 1). |
