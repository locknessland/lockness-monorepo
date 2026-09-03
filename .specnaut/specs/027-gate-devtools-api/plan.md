# Plan: Gate the devtools data & mutation routes behind authorization

**Issue:** [#161](https://github.com/locknessland/lockness-monorepo/issues/161)
· **Branch:** `027-gate-devtools-api` · **Package:** `@lockness/devtools`

---

## 1. Why this exists

`enableDevtools()` registers four routes that read or mutate the devtools
collector, and **none of them is gated beyond `devtoolsActive()`**:

| Route | Exposure |
| :--- | :--- |
| `GET  /_devtools` | Renders the dashboard — every captured request, session, log, query |
| `GET  /_devtools/api/data` | JSON dump of the entire collector |
| `GET  /_devtools/api/component-tree/:name` | Component dependency graph (source paths) |
| `POST /_devtools/clear` | **Mutates** — wipes the collector |

On any host where devtools is active (a shared dev box, a staging deploy that
kept `LOCKNESS_DEVTOOLS=1`, a compiled binary), an unauthenticated caller reads
captured request data. #149 added redaction, and that redaction is currently the
**sole** control between an anonymous caller and captured data. This feature
adds the access control that redaction was never meant to be, making redaction
defence-in-depth. Surfaced by #149 security-expert INFO **S5**.

"Dev-only" is a deployment convention, not an access control — the endpoint is
reachable wherever the process listens on a non-loopback interface.

## 2. User scenarios

Actor: **the operator** running an app with devtools active (a developer, or an
ops engineer on a shared/staging host). Actor: **an unauthenticated caller** on
the network.

### US1 — Local developer keeps zero-config access (P1)

- **Given** devtools is active and the developer browses from the same machine
  (loopback) over a live `Deno.serve`,
- **When** they open `/_devtools` or fetch `/_devtools/api/data`,
- **Then** they get the dashboard/data with no credentials — the default
  developer loop is unchanged.
- **Caveat (R5):** under `deno compile` or when the peer is undetectable, the
  gate cannot confirm loopback, so the default denies. A compiled dev binary
  therefore needs a token/`authorize` even locally. Stated plainly, not hidden.

### US2 — Remote unauthenticated caller is denied (P1)

- **Given** devtools is active on a host reachable over the network, and no
  credential is configured,
- **When** a caller from a non-loopback address (or any request carrying a
  forwarding header — see US4) requests any of the four routes,
- **Then** they receive `401`, **no collector data is returned**, and **no
  mutation occurs**.

### US3 — Operator opens remote access deliberately (P2)

- **Given** the operator sets a devtools token (or an `authorize` callback),
- **When** a caller presents the matching credential (or the callback returns
  true),
- **Then** the routes serve normally from any host; a caller with a wrong/absent
  credential still gets `401`.

### US4 — Proxied host does not silently trust remote callers (P1)

- **Given** devtools is active behind a reverse proxy / LB (the peer is the
  proxy, typically loopback) and no credential is configured,
- **When** a request arrives carrying a forwarding header (`X-Forwarded-For` /
  `Forwarded` / `X-Real-If`),
- **Then** loopback trust is **revoked** for that request and it is denied — a
  hop means the peer is not the client, so peer-IP cannot be trusted. Forwarding
  headers are never read to *grant* access, only to *revoke* the loopback default.

### Edge cases

- **DNS rebinding** — a malicious page rebound to `127.0.0.1` in the victim's
  browser makes same-hostname requests the peer-IP predicate would allow.
  Mitigated by Host-header validation against a localhost allowlist (FR-011).
- **CSRF on `/clear`** — peer-IP trust has no ambient credential to bind, so a
  cross-site `fetch` could wipe the collector. Closed by the same loopback
  hardening + the deny-by-default posture (Q1) / token requirement.
- **Credential comparison** must be constant-time (no early-exit compare).
- **`authorize` callback returns a Promise / throws** — must be awaited and
  caught; a non-awaited Promise is always truthy and would grant everyone.
- **Gate throws / peer undetectable** — fail **closed** (deny).

## 3. Requirements

- **FR-001** — Every route registered inside `enableDevtools()`
  (`packages/devtools/mod.ts`) under the base path — the dashboard, `/api/data`,
  `/api/component-tree/:name`, `/clear`, and any route added there later — is
  protected by a single authorization gate. The set is defined as "every route
  under the base-path group", not an enumeration, so a future route inherits the
  gate (fail-closed by default).
- **FR-002** — Default posture when neither a token nor an `authorize` callback
  is configured (**decided, Q1 → harden loopback-trust**): a request from a
  **loopback** peer is allowed and a request from a **non-loopback** peer is
  denied, with the FR-011 hardening always applied (a forwarding header revokes
  loopback trust; the `Host` is validated against a localhost allowlist).
- **FR-003** — When a devtools token is configured (via `config.token` or the
  `LOCKNESS_DEVTOOLS_TOKEN` env var), every gated route requires a matching
  `Authorization: Bearer <token>`; a request with the correct token is allowed
  from any host, one without is denied. A configured token is **not** bypassed by
  the loopback default.
- **FR-004** — When an `authorize?: (c: Context) => boolean | Promise<boolean>`
  callback is configured, it is the decider (see FR-009 precedence); it is the
  escape hatch by which an application wires its **own** auth (`@lockness/auth`,
  a session check, an IP allowlist) without devtools importing it.
- **FR-005** — A denied request returns `401` with no collector data in the body
  and causes no mutation. The gate fails **closed** on any internal error, on an
  undetectable peer, and on a throwing/rejecting `authorize` callback.
- **FR-006** — Token comparison is constant-time, performed **inside**
  `authorizeDevtools` (not by a separate `bearerAuth` middleware — see §5 Row 2
  / audit F3), via a timing-safe primitive.
- **FR-007** — The gate adds **no new package dependency edge** to
  `@lockness/devtools` (no `@lockness/auth`, no `@lockness/core`). It is built
  from `@lockness/hono` primitives, **extending the bridge with a runtime Deno
  `getConnInfo` re-export** — an additive change to `packages/hono/mod.ts`, since
  that helper is **not** on the bridge surface today (only the `GetConnInfo`
  *type* is). This adds no workspace edge (`hono`'s allow-list stays `[]`;
  `getConnInfo` resolves to the external `hono/deno`).
- **FR-008** — The gate is documented (`packages/devtools/docs/DOCS.md` +
  README): the default posture, `token`, `authorize`, the proxy caveat, and
  token hardening — a CSPRNG-generated 128-bit+ token, no per-attempt lockout (so
  token entropy is the only barrier), and a warning that an `authorize` callback
  must not trust a spoofable header (`X-Forwarded-For` et al.) to grant.
- **FR-009** — Evaluation order (the single decider composes the mechanisms):
  **`authorize` (if configured) decides; else a configured `token` is required;
  else the default posture (FR-002 + FR-011) applies.** A configured `authorize`
  supersedes the token and the loopback default; a configured token supersedes
  the loopback default.
- **FR-010** — `authorizeDevtools` **awaits** the `authorize` callback and wraps
  it (and the `getConnInfo` read) in a `try/catch` that **denies and logs** at
  WARN (via `collector.addLog` / console) — no silent catch, no fail-open Promise.
- **FR-011** — Loopback hardening, applied under the default posture regardless
  of Q1's choice: (a) any request carrying a forwarding header has loopback trust
  revoked and is denied unless credentialed (US4) — the set spans the standard
  headers (`X-Forwarded-For` / `Forwarded` / `X-Real-IP`) **and** the proprietary
  client-IP headers common proxies/CDNs emit (`CF-Connecting-IP`,
  `True-Client-IP`, `X-Client-IP`, `X-Cluster-Client-IP`, `Fastly-Client-IP`,
  `Fly-Client-IP`, `X-Forwarded`, `X-Original-Forwarded-For`), so a same-host
  proxy that forwards only its own header still revokes trust; (b) the `Host`
  header is validated against a localhost allowlist to blunt DNS rebinding.

## 4. Success criteria

- **SC-001** — On an active-devtools host, an HTTP request to **each of the four
  routes** (the dashboard `/_devtools` explicitly included) from a non-loopback
  peer with no configured credential receives `401` and returns zero collector
  fields. *(witness: integration test)*
- **SC-002** — A loopback request with no configured credential still succeeds,
  simulated by injecting a Deno-conninfo-shaped env into
  `app.request(path, init, env)` (the developer loop, US1). *(witness:
  integration test)*
- **SC-003** — With a token configured, a request bearing the correct Bearer
  credential succeeds and one bearing a wrong/absent credential receives `401`,
  from any host. *(witness: integration test)*
- **SC-004** — A request carrying `X-Forwarded-For` (proxied) with no credential
  is denied even when the peer is loopback (US4), and a request whose `Host` is
  not in the localhost allowlist is denied (DNS-rebinding). *(witness:
  integration test)*
- **SC-005** — An `authorize` callback that throws or returns a rejected Promise
  yields `401`, not access (FR-010). *(witness: integration test)*
- **SC-006** — `deno task deps:analyze` reports no new edge for `devtools`; its
  allow-list is unchanged. *(witness: gate)*
- **SC-007** — Pre-completion gate green (`deno fmt && deno lint && deno check &&
  deno task test`), including the updated `debug_panels.test.ts`. *(witness:
  gate)*

## 5. 🔒 Decision table

Binding on the implementer: a decision may not move out of its home without this
table being amended first. A review finding that a decision has two homes is a
plan violation.

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which routes are gated (the collector-facing set) | `packages/devtools/mod.ts` — the gate middleware is applied to the base path group inside `enableDevtools()`, registered as **both** `app.use(basePath, gate)` **and** `app.use(basePath + '/*', gate)` so the bare `/_devtools` dashboard is covered | A per-route `if (!authorized)` check in any handler; gating only `/_devtools/*` and leaving the exact `/_devtools` dashboard open |
| Whether a request is authorized (the single decision point) | `packages/devtools/gate.ts` — one new `authorizeDevtools(c, cfg)` returning a boolean | A credential/loopback check inlined in `mod.ts`, `middleware.ts`, or a handler; a `bearerAuth` middleware deciding + emitting its own 401 in parallel with `authorizeDevtools` |
| How the mechanisms compose (evaluation order) | `packages/devtools/gate.ts` — `authorize` › `token` › default posture (FR-009), resolved once inside `authorizeDevtools` | Ordering logic placed at the call site in `mod.ts`; a fourth mechanism landing its precedence in a handler |
| What "trusted by default" means (loopback + forwarding-header revocation + Host allowlist) | `packages/devtools/gate.ts` — the loopback predicate and FR-011 hardening live beside `authorizeDevtools` | A second host/IP/header test in `mod.ts` or in the dashboard renderer |
| Where the devtools token is read from | `packages/devtools/gate.ts` — `config.token ?? Deno.env.get('LOCKNESS_DEVTOOLS_TOKEN')`, resolved once | `Deno.env.get('LOCKNESS_DEVTOOLS_TOKEN')` read again in `mod.ts` or a handler |
| The denial-response shape (401, empty body) | `packages/devtools/mod.ts` — the one gate middleware emits it once for every deny path | `bearerAuth` emitting one 401 shape while the loopback/`authorize` path emits a different one |
| That the collector may activate at all (pre-existing) | `packages/devtools/gate.ts` — `devtoolsActive()` | (unchanged — the new gate composes with it) |

**Note — one decider, several askers.** `devtoolsActive()` (may devtools run at
all) and `authorizeDevtools()` (may *this caller* reach the collector) are two
distinct decisions and both live in `gate.ts`. `mod.ts` and `middleware.ts`
*ask*; they do not *decide*. The token compare is done **inside**
`authorizeDevtools` (FR-006) rather than by `bearerAuth`, so there is exactly one
decider and exactly one 401 shape.

## 6. Technical context

- **Language/runtime:** Deno, TypeScript, Hono (via `@lockness/hono`).
- **Package:** `@lockness/devtools` (implementation tier; allow-list
  `hono`, `contract`, `events`, `session` — **unchanged by this feature**,
  confirmed against `deps.policy.jsonc:54-57`).
- **Testing:** `Deno.test` + `app.request(path, init, env)` in
  `packages/devtools/tests/`. Loopback vs. remote is simulated by controlling the
  Deno-conninfo-shaped `env` the gate reads. The **7 existing `enableDevtools`
  call sites in `debug_panels.test.ts`** expect open access and must be updated to
  inject loopback conn-info (or a token) — in-scope work (audit F5).
- **Production call site:** `packages/core/kernel/bootstrap/steps/devtools.ts:49`
  is the only non-test caller of `enableDevtools`; every route change flows
  through it (blast radius: 1 production site, 4 routes).
- **Constraint (hard rule #1):** no direct `hono` import — conn-info and auth
  primitives come through `@lockness/hono`; the bridge gains a runtime
  `getConnInfo` re-export (FR-007).
- **Constraint (hard rule #3):** no `any` in exported APIs — `authorize` is
  typed `(c: Context) => boolean | Promise<boolean>`.

### Domain model

- **Bounded context:** devtools (dev-only observability).
- **Vocabulary:** *collector* (in-memory data store); *activation gate*
  (`devtoolsActive` — may devtools run); *authorization* (`authorizeDevtools` —
  may this caller reach it, new); *credential* (the devtools token); *loopback*
  (peer `127.0.0.0/8` / `::1` with no forwarding header and an allowlisted Host);
  *authorize callback* (operator escape hatch).
- **Value objects:** the resolved gate configuration (token, authorize,
  posture) derived once from `DevtoolsConfig` + env.
- **Invariants:** (1) no gated route serves collector data or mutates without
  passing `authorizeDevtools`; (2) the gate fails closed (error, undetectable
  peer, throwing callback); (3) devtools adds no package dependency edge;
  (4) redaction (#149) is untouched; (5) exactly one decider and one 401 shape.
- **Out of scope:** the redaction pipeline, the dashboard UI, the debug bar
  injection, per-panel authorization.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| #1 No direct `hono` import | PASS — Hono primitives via `@lockness/hono`; bridge extended with `getConnInfo` |
| #2 JSR-only specifiers | PASS — no new dependency; env-based token needs none |
| #3 No `any` in exported APIs | PASS — `authorize` fully typed; token is `string` |
| #4 Tailwind v4 syntax | N/A — no CSS in this change |
| #5 Pre-completion gate | PASS — SC-007 |
| #6 No manual `deno.lock` edit | PASS — no dependency change |
| #7 JSDoc on public APIs | PASS — new config fields + bridge export get full JSDoc |
| #8 MVC layering | PASS — gate is middleware/policy; no DB, no controller fattening |
| #9 Commit discipline | PASS — `feat(161)` (bridge `getConnInfo` + gate + config + updated tests), `docs(161)` (DOCS/README/AGENTS). Two categories, two commits |
| TDD (methodology) | PASS — failing deny/allow route tests first, then the gate |
| No silent catches | PASS — FR-010: the gate's catch denies **and** logs at WARN |

### Complexity tracking

None. One new function and its application; no invariant removed, no tier
crossed. The bridge `getConnInfo` re-export is additive.

## 8. Surface impact

| Surface | Impact |
| :--- | :--- |
| `@lockness/devtools` public API | `DevtoolsConfig` gains `token?` and `authorize?` (additive, optional — no breaking change). `authorizeDevtools` stays **internal** (unexported) unless a consumer needs it. |
| `@lockness/hono` public API | **+1 runtime re-export** — the Deno `getConnInfo` (additive; the type is already exported). |
| HTTP surface | The four `/_devtools*` routes change from open to gated. Behaviour change for any **remote** or **proxied** caller; loopback dev flow unchanged by default (under live `Deno.serve`). |
| Env surface | New optional env var `LOCKNESS_DEVTOOLS_TOKEN`. |
| Tests | `packages/devtools/tests/debug_panels.test.ts` — 7 `enableDevtools` call sites updated to inject loopback conn-info / token. |

No front-end surface is built (no new UI, no components) — the dashboard route is
gated at the HTTP layer, not redesigned.

### Documentation (this feature)

- `packages/devtools/docs/DOCS.md` — a "Securing the devtools endpoints" section
  (default posture, `token`, `authorize`, proxy caveat, token hardening — FR-008).
- `packages/devtools/README.md` — a short pointer to the above.
- `packages/devtools/AGENTS.md` — Pitfalls note that endpoints are gated;
  regenerate generated blocks with `deno task agents:brief`.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **R1 — Proxy defeats loopback trust** (peer = proxy = loopback, so a remote caller reads as local). | FR-011(a): a forwarding header revokes loopback trust → deny unless credentialed. Q1's deny-by-default option removes the risk entirely. Documented; `token`/`authorize` is the correct control for any proxied deploy. |
| **R2 — Breaking the zero-config dashboard.** | Default trusts loopback under live `Deno.serve` (US1); remote/proxied is the newly-denied path. (Removed if Q1 → deny-by-default.) |
| **R3 — Timing oracle on the token.** | Constant-time compare inside `authorizeDevtools` (FR-006). |
| **R4 — Gate missed on a future route.** | Gate the base-path group (both exact + `/*`), single home (Row 1); FR-001 defines the set as "every route under the group", not an enumeration. |
| **R5 — `getConnInfo` undetectable under `deno compile` / `app.request()`.** | Undetectable peer ⇒ not loopback ⇒ deny (fail closed). US1 caveat: a compiled dev binary needs a token/`authorize` even locally — stated, not hidden. |
| **R6 — `authorize` callback fails open** (non-awaited Promise is truthy; a throw bypasses). | FR-010: awaited + try/catch that denies and logs; SC-005 witnesses it. |
| **R7 — DNS rebinding / CSRF on the loopback default.** | FR-011(b): Host-header allowlist; deny-by-default (Q1) closes it fully. |

## 10. Architecture audit

`architect-expert`, pre-code, on `plan.md`. **Verdict: pass-with-notes**
(needs_followup) — 0 CRITICAL, 0 HIGH, 5 MEDIUM, 1 LOW, 1 INFO. The design is
fundamentally sound: correct decider separation (`mod.ts` wires, `gate.ts`
decides), correct dependency inversion via the `authorize` callback, and **no new
workspace edge** (confirmed against `deps.policy.jsonc:54-57`). All findings were
folded into the plan:

| # | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| F1 | MED | "base path group" wording risks leaving the bare `GET /_devtools` dashboard ungated (Hono `/*` doesn't match the exact path) | **Fixed** — §5 Row 1 now requires both `app.use(basePath, …)` and `app.use(basePath+'/*', …)`; SC-001 names "each of the four" incl. the dashboard |
| F2 | MED | FR-007 falsely claimed `getConnInfo` is already on the bridge surface | **Fixed** — verified empirically ABSENT; FR-007 reworded to add the additive re-export; §8 lists it |
| F3 | MED | `bearerAuth` (a middleware that decides + emits its own 401) contradicts Row 2's single decider | **Fixed** — FR-006 does the constant-time compare **inside** `authorizeDevtools`; `bearerAuth` dropped as decider; one 401 shape (§5 Row 6) |
| F4 | MED | No home for how the three mechanisms compose (evaluation order) | **Fixed** — FR-009 + a new §5 row; precedence `authorize › token › default` |
| F5 | MED | Loopback-allow unverifiable under `app.request()`/compile; 7 existing tests break | **Fixed** — SC-002 injects conn-info env; R5/US1 state the compile caveat; §6/§8 list the `debug_panels.test.ts` updates as in-scope |
| F-L | LOW | FR-001 enumerated the set while Row 1 used a group | **Fixed** — FR-001 now defines the set as "every route under the group" |
| F-I | INFO | `authorize: (c: Context)` widens hono coupling into the exported type; stray `mod.ts:197` debug `console.log` behind the gate | **Accepted** — the coupling is already permitted; the `console.log` cleanup is a small in-scope Boy-Scout removal |

## 11. Security audit

`security-expert`, pre-code, on `plan.md`. **Verdict: fail** (advisory — the user
decides at the stop) — 0 CRITICAL, 1 HIGH, 1 MEDIUM, 2 LOW, 1 INFO. The route-set
and single-decider design were **affirmed correct** (all four gated incl. the
dashboard and the `/clear` mutation). Findings folded in:

| # | Sev | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| S1 | HIGH | Loopback-IP is not a safe default: fails **open behind a reverse proxy** (peer = proxy = loopback → the exact "staging kept `LOCKNESS_DEVTOOLS=1`" scenario), and is DNS-rebinding/CSRF-reachable for local devs | **Raised to the user as Q1** (default posture) + hardened regardless: FR-011 (forwarding-header revokes trust; Host allowlist), US4, SC-004. The seat recommends deny-by-default |
| S2 | MED | `authorize` callback must be awaited and its throw/rejection caught, or the gate fails open (a Promise is always truthy) | **Fixed** — FR-010; SC-005 |
| S3 | LOW | Group gate must match the bare base path (same as arch F1) | **Fixed** — §5 Row 1; SC-001 |
| S4 | LOW | Token hardening + callback guidance for the docs (CSPRNG 128-bit token, no lockout, don't trust XFF to grant) | **Fixed** — folded into FR-008 |
| S5 | INFO | (a) token+authorize precedence unspecified; (b) claimed `getConnInfo` already on the bridge | **(a) Fixed** — FR-009 precedence. **(b) Corrected** — the seat's "moot" note was wrong; `getConnInfo` is empirically ABSENT from the bridge (only the type is exported), so the additive re-export IS needed (see arch F2) |

## 12. Open questions

| Question | The settled decision | Date |
| :--- | :--- | :--- |
| Q1 — Default posture when neither token nor `authorize` is configured (the security HIGH, S1) | **Harden loopback-trust** — loopback allowed, non-loopback denied, with FR-011 always on (forwarding-header revokes trust; Host allowlist). Preserves the zero-config localhost dashboard while closing the proxy fail-open and DNS-rebinding/CSRF paths the audit named; a header-stripping misconfigured proxy is covered by docs mandating a token. Chosen over deny-by-default (the security seat's pick) for DX; the residual is bounded and documented. | 2026-09-03 |

### Decided without asking

- **Gate mechanism = a devtools token (Bearer, constant-time compared inside
  `authorizeDevtools`) + an optional `authorize` callback**, built from
  `@lockness/hono` primitives. Importing `@lockness/auth` is rejected: it is a
  peer implementation package outside devtools' allow-list (a new tier edge and
  heavyweight coupling), and the devtools routes are raw Hono handlers, not
  decorator controllers, so the `@AuthRequired()` pipeline does not apply here.
  The `authorize` callback is the seam by which an app wires its own auth. *(Both
  audits affirmed this.)*
- **All four routes are gated, not only `/api/data`** as the AC literally names —
  gating only `/api/data` while the dashboard HTML renders the same data is
  theatre; both audits affirmed gating the whole group. *(Was Q3; closed.)*
- **Precedence `authorize › token › default`** (FR-009).
- **The bridge gains a runtime Deno `getConnInfo` re-export** (FR-007) — verified
  ABSENT from the surface today.
- **Token source = `config.token ?? LOCKNESS_DEVTOOLS_TOKEN`** — consistent with
  the existing env-driven `devtoolsActive()` gate.
- **Redaction (#149) is untouched** — remains defence-in-depth (issue out of
  scope).
