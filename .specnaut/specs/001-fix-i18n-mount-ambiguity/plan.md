# Plan: Make i18n routing robust to mount-point ambiguity

**Branch**: `001-fix-i18n-mount-ambiguity` | **Date**: 2026-08-24 | **Backlog item**:
[#95 — Make i18n routing robust to mount-point ambiguity](https://github.com/locknessland/lockness/issues/95)

**This is the feature's one planning document.**

---

## 1. Why this exists

The i18n mount pattern `/:langId/:countryId` matches **any** two leading path segments. Every
request with three-or-more segments and no matching root route is handed to `i18nMiddleware`, which
reads the segments as a locale, fails validation, and returns `c.notFound()`.

Reproduced locally against Hono 4.11.1 with the app's real middleware shape:

```
/.well-known/appspecific/com.chrome.devtools.json  -> 404   i18n-mw fired: langId=.well-known countryId=appspecific
/apple-touch-icon/precomposed/x.png                -> 404   i18n-mw fired: langId=apple-touch-icon countryId=precomposed
```

Chrome DevTools probes `/.well-known/appspecific/com.chrome.devtools.json` on **every** page load
with the inspector open. Each probe is logged as an i18n validation failure. The cost is threefold:

- **System requests break** — a path that should reach its own handler (or a plain framework 404)
  is intercepted by a middleware that has no business seeing it.
- **Production logs are polluted** with error stacks whose `langId` is `.well-known` — noise that
  hides real locale failures.
- **The mount is a silent catch-all.** Any future top-level route added by a user is shadowed by
  the locale mount the moment it has two segments.

`packages/core/docs/mount-points.md:262-264` currently claims registration order protects static
paths. That claim is **false for middleware-bearing mounts** and is corrected by this feature: root
routes are matched first only when a root route *exists*. When none does, the mount middleware
still runs.

## 2. User scenarios

### US1 — A system path is never seen by the locale middleware (P1)

**Given** an app with the i18n mount configured
**When** a request arrives for `/.well-known/appspecific/com.chrome.devtools.json`
**Then** `i18nMiddleware` does not execute, and the response is that path's own handler's response,
or the framework's own 404 — never an i18n-middleware 404.

### US2 — Valid locale routes keep working (P1)

**Given** the same app
**When** a request arrives for `/fr/ca/users`
**Then** `i18nMiddleware` executes, `langId`/`countryId`/`localeKey` are set, and the controller
responds exactly as before.

### US3 — A developer configures a locale mount without re-deriving the regex (P2)

**Given** a developer wiring `mountPointConfig`
**When** they declare their supported languages and countries once
**Then** the constrained mount pattern is derived from that declaration — they never hand-write a
regex, and cannot produce the unanchored-alternation defect described in section 9.

### US5 — The locale home page keeps its locale (P1)

**Given** the same app
**When** a request arrives for `/fr/ca` — the locale *root*, with no trailing segment
**Then** the home page renders **with** `localeKey === 'fr-ca'`, exactly as it does today.
This is not automatic: see FR-009 and finding A10.

### US4 — Root access is unchanged (P3)

**Given** the same app
**When** a request arrives for `/users`
**Then** the middleware does not run and `langId` is `undefined`, as today.

### Edge cases

- **Two-segment non-locale paths** (`/foo/bar`) — **measured, not assumed** (A4). Today they are
  404'd *by the middleware*, which currently masks the fact that `rootHono.route(pattern, inner)`
  would otherwise serve them the root route. Under the exact-locale constraint they 404 at the
  router. Under a generic `[a-z]{2}` constraint they return **200 and the home page** — see A10.
- **The locale root** (`/fr/ca`, no trailing segment) — the constraint changes which Hono router
  compiles the pattern, and `<pattern>/*` stops matching zero trailing segments. Locale context is
  silently lost unless FR-009 is implemented.
- **Uppercase locales** (`/FR/CA/users`) — 404 today (validator rejects), 404 after (router does
  not match). Same observable outcome, different origin.
- **Syntactically valid but unsupported locale** (`/zz/zz/users`) — after the change the router
  does not match, so this falls through to the framework 404 instead of the middleware's.
- **A locale code that is a substring of a longer segment** — see finding in section 9; this is the
  trap that makes the naive alternation wrong.
- **Locale lists edited at runtime** — out of scope; the pattern is built once at boot.

## 3. Requirements

- **FR-001**: The mount pattern MUST constrain `langId` and `countryId` to the exact set of
  configured codes, so that a path segment outside that set does not match the mount.
- **FR-002**: The generated constraint MUST be anchored per-segment. An alternation MUST be
  emitted inside a non-capturing group `(?:…)`; a bare `a|b|c` is a defect (section 9, A1).
- **FR-003**: `mount_pattern.ts` MUST **validate positively, then escape** — escaping alone is
  insufficient. Hono extracts brace groups with `path.replace(/\{[^}]+\}/g, …)`
  (`dist/utils/url.js:15`, `dist/router/reg-exp-router/trie.js:10`), and `[^}]+` is **not
  escape-aware**: a backslash-escaped `\}` still contains `}` and terminates the group early.
  Verified against 4.11.1 — a code containing `}` followed by `/` corrupts the route table and
  throws `TypeError: undefined is not iterable`. The helper MUST therefore reject any code not
  matching a strict allowlist (`/^[A-Za-z0-9-]{1,8}$/`), throwing at boot with the offending index,
  and escape the survivors as belt-and-braces. The JSDoc MUST record *why* escaping alone is
  unsafe, or the next maintainer deletes the allowlist as redundant (S3).
- **FR-003b**: The helper MUST cap list length (≤256) and **throw, not truncate**. It MUST document
  its input as **trusted build-time configuration** (S4).
- **FR-004**: The set of valid language and country codes MUST have exactly one home. The routing
  pattern MUST be derived from it, never restated.
- **FR-005**: `i18nMiddleware` MUST NOT be the decider of locale validity once the router decides
  it. Its residual check is an assertion (see Q2), not a second decision.
- **FR-006**: **Every** occurrence of the literal unconstrained pattern in shipped stubs, JSDoc
  `@example` blocks, READMEs and docs MUST be updated to the constrained form or explicitly
  annotated as deliberately-unconstrained. The set is enumerated by
  `git grep -n ":langId" -- '*.ts' '*.tsx' '*.md' '*.stub'`, excluding `.specnaut/specs/`.
  **The `*.stub` glob is load-bearing** — `@lockness/init` scaffolding is the highest-propagation
  surface and an `--include='*.ts'` search cannot see it (A2).
  Measured at time of writing: **37 hits across 14 files**, partitioned as
  - **20 in-scope sites** to change — 17 docs/examples/config + **3 in 2 `.stub` files**
    (`packages/init/stubs/init/config/routing.ts.stub:49` and `:72`, the latter a commented-out
    paste-ready config; `packages/init/stubs/init/app/kernel.ts.stub:165`)
  - **12 deliberately retained** — every `/:langId/:countryId` in
    `packages/core/tests/mount_points.test.ts`, which pins the unconstrained pattern on purpose
    (section 12)
  - **5 out of scope** — 3 ordinary code comments (`app/kernel.ts:85`,
    `packages/core/routing/mount_manager.ts:25`, `app/controller/demo_controller.tsx:22`), the live
    config value, and view display data

  The retained set is an **allow-list**: `tasks.md` turns FR-006 into a checkable exit condition
  against it, not a grep that can never reach zero (A3).
- **FR-007**: The **parenthetical** at `packages/core/docs/mount-points.md:263-264` — "*which would
  match `langId="css"`, `countryId="app.css"`*" — MUST be corrected. It is wrong about the
  mechanism in both directions: the mount *middleware* cannot match a two-segment path at all,
  while the mount *route* can. The surrounding static-files claim at `:250-262` is **defensible and
  MUST NOT be rewritten** — `serveStatic` is registered on `rootHono` before `mountManager.setup()`
  and short-circuits a real file. The rule to state instead: registration order protects a path
  only when an earlier handler actually *responds*; `serveStatic` calling `next()` on a miss hands
  the path straight to the mount (A5). The stale what-comment at `mount_manager.ts:25` MUST be
  fixed or deleted in the same pass.
- **FR-008**: A unit test MUST assert that a `.well-known` path does not execute the mount
  middleware, by observing the middleware, not only the status code — a status-only assertion
  passes for the wrong reason (both the buggy and fixed versions return 404). The test MUST also
  cover a **two-segment** miss (`/css/missing.css`), which reaches the middleware today (S7), and
  the **mount root** (`/fr/ca`), which must execute it (FR-009).
- **FR-009**: The locale **root** URL (`<pattern>` with no trailing segment) MUST continue to carry
  locale context. Adding a constraint changes Hono's router selection so that `<pattern>/*` no
  longer matches zero trailing segments; the mount middleware MUST therefore be registered on
  **both** `<pattern>` and `<pattern>/*`. Verified: without this, `/fr/ca` returns 200 with
  `localeKey === undefined` (A10).
- **FR-010**: A two-segment path that is not a locale MUST NOT resolve to the application's root
  route. This is a real exposure created by `MountManager.setup()`'s unconditional
  `rootHono.route(pattern, internalHono)`, currently masked by the middleware's 404 (A4).
- **FR-011**: The `@example` blocks corrected under FR-006 MUST also be corrected from
  `mountPoints: [ … ]` (plural, an array) to `mountPoint: { … }` (singular) — the plural key does
  not exist on `AppConfig` (`packages/core/types.ts:43`). Measured: **7 occurrences** across
  `packages/core/app.ts:107` and `:430`, `packages/core/README.md:402`/`:447`/`:470`,
  `packages/core/docs/kernel-decorator.md:402`, `app/middleware/i18n_middleware.ts:13`. Shipping a
  "corrected" example that still documents a non-existent API is not a correction (A9).
- **FR-012**: Log fields MUST be encoded before being written. `app/middleware/logger_middleware.ts`
  and `packages/core/exceptions/formatter.ts` interpolate `c.req.path` raw, and Hono's `getPath`
  applies `tryDecodeURI`, which decodes `%0A`/`%0D`/`%1B` — so a crafted path injects real newlines
  and terminal escapes into the log. This is live today and independent of this feature, but SC-001
  is about log quality, so removing one noisy *source* while the *sink* stays unencoded is a
  half-fix. Strip C0 controls and `\x1b`, and pass values as separate `console.log` arguments
  rather than interpolating (S6). **If this is judged out of scope, it MUST leave as a linked
  backlog item, not as silence.**

- **FR-013**: `MountManager` MUST emit a **warning** at boot when a mount pattern contains an
  unconstrained param (`:name` with no `{…}` suffix) **and** a middleware is attached — the shape
  that makes the mount a catch-all gate. The message MUST name the offending pattern and the
  constrained form. It **warns, it does not throw**: throwing would break every existing user of
  `mountPoint` at boot (see "Decided without asking"). This closes A6 — core stops shipping a
  default that contradicts its own invariant.
- **FR-014**: `MountManager` MUST **probe-compile** the mount route at boot, so an unsupported
  pattern shape fails at startup with a named error instead of as a first-request 500. Verified:
  under an explicit `RegExpRouter`, a constrained mount plus a root route throws
  `UnsupportedPathError` from `reg-exp-router/router.js:47` **on the first request**, not at boot
  (S5). The probe MUST also settle section 6's retracted performance claim by making router
  fallback observable rather than silent.
## 4. Success criteria

- **SC-001**: Opening the app with Chrome DevTools attached produces zero locale-validation log
  entries.
- **SC-002**: Every URL a visitor can reach today under a supported locale still resolves to the
  same page **in the same language** — including the locale root (`/fr/ca`). A status-code-only
  check is insufficient: the measured regression in A10 keeps the 200 and loses the language.
- **SC-003**: A developer adding a new supported language edits one file, and the URL space accepts
  it without any other edit.
- **SC-004**: A reader of the mount-point documentation can state, correctly, which paths the mount
  middleware will and will not see.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which language and country codes this app supports | `config/i18n.ts` (`validLanguages`, `validCountries`) | An alternation literal in `config/routing.ts`; a `[a-z]{2}` shorthand anywhere; a hard-coded list in a test or a doc example; a second list in `app/middleware/i18n_middleware.ts` |
| How a list of codes becomes a safe Hono param constraint (the `(?:…)` grouping and metacharacter escaping) | `packages/core/routing/mount_pattern.ts` | Any inline `` `{${codes.join('|')}}` `` template literal; a hand-written regex in `config/routing.ts` or in any doc example |
| What a locale-prefixed URL looks like — *the composition of rows 1 and 2, and the only place they meet* | `config/routing.ts:mountPointConfig.pattern` (**built**, never a literal) | A second pattern literal in `app/kernel.ts`; a pattern string in `app/view/pages/demo/mount_points.tsx`; JSDoc `@example` blocks that get copy-pasted into user projects; the `.stub` files in `packages/init/` |
| Whether a given request carries a locale | `config/routing.ts:mountPointConfig.pattern` — **the string decides which requests are admitted**; `packages/core/routing/mount_manager.ts` only applies it | A second code list anywhere; a `[a-z]{2}` shorthand; any component *widening* admission. **`i18nMiddleware`'s `c.notFound()` is NOT a duplicate** — settled at the stop (Q2, 2026-08-24). It cannot admit anything the pattern rejected, only refuse what the pattern already admitted, so it is a fail-closed assertion downstream of the decision, not a second decider. Replacing it with `next()` would set an attacker-controlled `localeKey` into every downstream controller |
| Whether a mount pattern is allowed to be unconstrained at all, and what the framework does about it | `packages/core/routing/mount_manager.ts` (FR-013, FR-014) | A second warning emitted from `app.ts`'s bootstrap steps; a lint rule restating the same condition; a doc that says "always constrain" without the code enforcing it. **Decided in-scope at the stop (Q3)** — before that answer this row had no owner, which was A6's point |

**One decider, one fail-closed assertion.** The router decides *admission*. `i18nMiddleware` cannot
widen that — it can only refuse — so its residual check is an assertion downstream of the decision,
not a rival to it. A locale reaching it is by construction valid; if one does not, that is an
internal invariant violation, logged at ERROR **and refused** (Q2, 2026-08-24).

*Amended after the review gate.* An earlier draft of this row named the `c.notFound()` itself as the
duplication. The review seats split on it — the code seat read it as the forbidden second decider,
the security seat as the only thing preventing a fail-open. Both were reasoning from that draft. The
row above is the corrected statement: **widening** admission would duplicate the decision; refusing
does not. The code was already what Q2 settled; this row is what was behind.

## 6. Technical context

**Language/Version**: TypeScript on Deno (see root `deno.json`)
**Primary Dependencies**: `npm:hono@4.11.1`, consumed only via `@lockness/core` / `@lockness/hono`
**Storage**: N/A
**Testing**: `Deno.test` — `packages/core/tests/mount_points.test.ts`, plus a new
`packages/core/tests/mount_pattern.test.ts`
**Target Platform**: Deno server (Deno Deploy, standalone binary, Docker)
**Project Type**: web framework (monorepo of JSR packages) + demo app
**Performance Goals**: **measured after FR-014 (T025), and the retraction is lifted.** Both the
constrained and the unconstrained mount settle on `TrieRouter` under `SmartRouter` — there is no
silent downgrade. The constrained pattern is **~3× cheaper** on non-locale paths: 20 000 matches of
`/.well-known/appspecific/x.json` take **3.9 ms** constrained vs **12.1 ms** unconstrained, because
the router rejects early instead of matching and building a middleware chain
**Constraints**: no new dependency; no change to the public `MountPoint` interface shape.
**The constraint is `SmartRouter`-dependent** — under an explicit
`new Hono({ router: new RegExpRouter() })`, a constrained mount plus a root route throws
`UnsupportedPathError` on the **first request**, not at boot (S5). **Re-assessed during
implementation: that condition is currently unreachable from Lockness.** `App` constructs its own
`Hono` and `@lockness/hono` re-exports no router, so there is no supported way for a user to select
`RegExpRouter`. FR-014's probe-compile is therefore insurance against a future router-selection
feature, not a fix for a reachable crash — and it is documented as such rather than covered by a
negative test that could not fail
**Scale/Scope**: 5 languages × 5 countries today; the generated pattern grows linearly and stays
well inside any practical regex size

### Domain model

- **Bounded context**: HTTP routing / URL-space composition. It touches i18n only through the
  *code lists*; nothing about translation, formatting or content negotiation enters here.
- **Vocabulary**:
  - *mount point* — a URL prefix pattern under which the whole app is mounted a second time
  - *locale segment* — one path segment that is expected to be a language or country code
  - *constraint* — the Hono `:param{regex}` suffix that narrows what a segment may be
  - *asker* / *decider* — a component that reads a rule vs. the one component that establishes it
- **Entities**: none. No identity is created or persisted by this feature.
- **Value objects**:
  - `LanguageCode`, `CountryCode` — already exist in `config/i18n.ts`
  - `MountPattern` — a string; immutable, derived, built once at boot
- **Invariants**:
  - A request reaching `i18nMiddleware` has `langId ∈ validLanguages` and
    `countryId ∈ validCountries`.
  - The mount pattern is a pure function of the two code lists — same lists, same pattern.
  - Root-mounted routes are unaffected by the mount pattern in all cases.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| 1 — No direct `hono` import | pass | New code imports from `@lockness/core`; `mount_pattern.ts` lives in core and needs no Hono import at all — it emits a string. |
| 2 — JSR-only specifiers | pass | No new dependency. |
| 3 — No `any` in exported APIs | pass | Signature is `(codes: readonly string[]) => string`. |
| 4 — Tailwind v4 CSS-variable syntax | pass | Not applicable — no styling change. |
| 5 — Pre-completion gate | pass | `deno fmt && deno lint && deno check && deno task test` before done. |
| 6 — Never edit `deno.lock` | pass | No dependency change. |
| 7 — JSDoc on public APIs | pass | `mount_pattern.ts` is exported from core → full JSDoc with `@example`, and the `(?:…)` rationale recorded there. |
| 8 — MVC layering | pass | Routing/config concern only; no controller, service or repository touched. |
| 9 — Commit discipline | pass | Split: `fix` (pattern + middleware), `test` (new tests), `docs` (mount-points.md + README + examples). Three commits, not one. |
| TDD (developer agent) | pass | FR-008's observing test is written first and must fail against `main`. |
| DDD layering | pass | Pure function, no I/O. |
| Domain Model gate | pass | Section 6 above. |
| Boy Scout with escalation | **pass, with a deliberate exception** | The false claim at `mount-points.md:263-264` is in-scope (FR-007). The core-level warning and boot probe-compile would normally be **escalated** under this principle; at the stop the user chose to keep both in #95 (Q3). Recorded as a conscious scope decision, not an oversight — see Complexity tracking and the re-sizing risk. |
| SOLID / DRY / KISS / YAGNI | pass, with note | See Complexity tracking. |
| No silent catches | pass | Q2 exists precisely so the residual check does not become a silent 404. |

### Complexity tracking

**YAGNI tension, accepted — on counted evidence.** Introducing
`packages/core/routing/mount_pattern.ts` is more than the one-line pattern edit that would close
the issue. Two measurements justify it, and the second is the load-bearing one:

1. The naive one-liner is *wrong* in a way that is invisible in review — A1 shows the unanchored
   alternation silently mis-captures `langId="de"` out of `com.chrome.devtools.json`. That argues
   for *a* helper.
0. **Scope, widened at the stop.** Q3 was answered "both hardenings in #95", against the
   recommendation to escalate them. The consequence is stated rather than absorbed: #95 stops being
   "the `.well-known` bug" and becomes "mount-point hardening". FR-013 and FR-014 change
   `MountManager`'s behaviour for **every** consumer of `mountPoint`, so they carry their own tests
   and their own row in the decision table. The Size on the backlog item should move S → M.

2. **Why the helper is exported from core while the constraint stays in app config**: of the 14
   tests in `packages/core/tests/mount_points.test.ts`, **11 hard-code `/:langId/:countryId` as an
   input**. If the constraint became core's *default*, **1 fails outright**
   (`:226` asserts **400** with `{error:'Unsupported language'}` for `/de/de/users`; under any
   narrower core default the router rejects first and the answer becomes 404) and **2 more stay
   green for the wrong reason** (`:194` and `:260` expect middleware-issued 404s that would become
   router-issued 404s — exactly the failure mode FR-008 exists to prevent, already latent in the
   suite). Core exports the *builder* so core's *defaults* need not change and those 11
   pattern-pinning tests stay honest (A8).

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/core` public API | yes | One new exported helper (`mount_pattern.ts`), re-exported from `mod.ts`. Additive — no existing signature changes. |
| `MountPoint` interface (`packages/core/types.ts`) | no | `pattern: string` already accepts a constrained pattern. Verified empirically. |
| `MountManager` (`packages/core/routing/mount_manager.ts`) | **yes — behaviour change** | FR-009 (dual middleware registration), FR-013 (boot warning on unconstrained param + middleware), FR-014 (boot probe-compile). The first is a fix; the last two are new framework behaviour that fires for **every existing user of `mountPoint`**, not only this app. |
| Demo app config (`config/routing.ts`, `config/i18n.ts`) | yes | Pattern becomes derived instead of literal. |
| Demo app middleware (`app/middleware/i18n_middleware.ts`) | yes | Validity check demoted from decider to asker (Q2). |
| Demo app views (`app/view/pages/demo/mount_points.tsx`, `app/controller/demo_controller.tsx`) | yes | Displayed pattern string only — no layout, no styling. |
| `@lockness/init` scaffolding (`packages/init/stubs/init/config/routing.ts.stub`, `packages/init/stubs/init/app/kernel.ts.stub`) | yes | 3 sites, one of them a commented-out paste-ready `mountPointConfig`. **Every new Lockness project starts here** — highest-leverage propagation path for the defect (A2). |
| Docs (`packages/core/docs/mount-points.md`, `packages/core/README.md`, `packages/core/docs/kernel-decorator.md`, JSDoc `@example` in `app.ts`, `kernel_decorators.ts`) | yes | Constrained form becomes the shown default; the false ordering claim is corrected. |
| Existing tests (`packages/core/tests/mount_points.test.ts`) | yes | Kept green as-is — they pin the *unconstrained* pattern deliberately, which stays supported. New coverage is added alongside, not by rewriting them. |
| HTTP contract for end users | yes, narrowing | `/zz/zz/*` and other non-locale three-segment paths change 404-origin, not 404-status. No 2xx route changes. |

### Documentation (this feature)

```text
.specnaut/specs/001-fix-i18n-mount-ambiguity/
├── plan.md    # This file — the whole plan
└── tasks.md   # tasks output, derived from THIS file once approved
```

### Visual Prototyping with Claude Artifacts

The project has a front-end surface (`.tsx` views under `app/view/`), so this section is present.
**Nothing here is worth prototyping.** The only view touched (`app/view/pages/demo/mount_points.tsx`)
changes a displayed pattern string; there is no new screen, state or interaction. No artifact.

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| **The naive alternation is silently wrong** (found, see A1 below) | `mount_pattern.ts` emits `(?:…)`, and a unit test asserts the DevTools path does not match. |
| A status-only test passes for the wrong reason — buggy and fixed both return 404 | FR-008 requires the test to observe *middleware execution*, not the status code. |
| A user's supported-code list contains a regex metacharacter and breaks the pattern | FR-003 escaping, with a test covering it. |
| Locale lists and pattern drift apart | FR-004 + decision-table row 1: the pattern is derived, never restated. |
| Shipped `@example` blocks keep teaching the unsafe pattern, so user projects inherit the bug | FR-006 enumerates the occurrences by search, not by example. |
| Narrowing the mount changes behaviour for a path someone relies on | No 2xx route changes — only paths that already 404 change which component 404s them. |
| A future edit removes the constraint and the middleware no longer catches it (Q2 decided as "delete") | Q2's recommended answer keeps a logged assertion precisely to avoid this. |
| **The fix silently de-localises the locale home page** — `/fr/ca` keeps its 200 and loses `localeKey` | FR-009 (dual registration) + SC-002 measures language, not status. Measured, not predicted (A10). |
| **Answering Q1 "generic `[a-z]{2}`" opens a duplicate-content leak** — `/zz/zz` and `/ui/kv` return 200 + the home page, crawler-indexable, middleware never running | FR-010, and Q1's recommendation is the exact-locale alternation. This is why Q1 is a correctness question, not a preference (A10). |
| FR-006 is checked with a grep that cannot see `.stub` files, so the scaffolding keeps teaching the bug to every new project | FR-006's command now globs `*.stub`, and the retained set is an explicit allow-list (A2, A3). |
| **A downstream app puts tenant scoping in `mountPoint.middleware`; the fix silently stops that gate covering the tenant root** | FR-009 makes the gate cover every path the mount route serves; FR-008 asserts it at the mount root. This is the High finding (S1). |
| **Demoting the middleware's `c.notFound()` to a non-denying log** would let any future loosening of the pattern serve the whole app under arbitrary prefixes — duplicate content, and path-keyed cache poisoning on any shared cache | Q2 is answered **log *and* deny**; the residual check stays fail-closed (S2). |
| A locale code containing `}` corrupts Hono's route table into a boot/dispatch crash | FR-003 validates positively against an allowlist before escaping, throwing at boot with the offending index (S3). |
| A future feature loads locale lists from a DB or env var, turning a trusted config input into a boot-time injection sink | FR-003b states the trust contract and caps length; section 12 records that this change **re-triggers the security audit** (S4). |
| A user selecting `RegExpRouter` explicitly gets `UnsupportedPathError` on first request rather than at boot | Documented in section 6; boot-time probe-compilation folded into Q3 (S5). |
| SC-001 claims clean logs while the log sink still decodes `%0A`/`%1B` from the raw path | FR-012 — and descoping it must produce a linked backlog item, not silence (S6). |
| **FR-013's warning fires for every existing `mountPoint` user on upgrade**, including people whose unconstrained mount is deliberate | It warns, never throws; it fires only when a middleware is *also* attached (the gate shape); the message names the constrained form so the fix is one edit. Revisit if it proves noisy. |
| **The widened scope turns a Size-S bug fix into a framework behaviour change**, and #95's estimate no longer reflects the work | Recorded here and surfaced to the product-owner for re-sizing (S→M) rather than left to be discovered at review. |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed.*
**Verdict: fail** — 3 High. All three are defects in this plan's *enumeration and edge-case
reasoning*; the central core/app split was audited and judged correct.

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | *(pre-audit, measured while grounding the plan)* An unanchored alternation `:langId{en\|fr\|es\|de\|ja}` compiles into Hono's RegExpRouter without a group boundary and mis-matches. Measured: `/.well-known/appspecific/com.chrome.devtools.json` **executes the middleware** with `langId="de"`, captured out of `devtools`. The obvious fix is silently broken. | Plan changed — FR-002 requires `(?:…)` grouping, and the finding is carried into `mount_pattern.ts`'s JSDoc so it cannot be un-learned. |
| A2 | **High.** FR-006's enumeration command was blind to the artefact FR-006 names first: `--include='*.ts'` cannot match `.stub`. 3 hits in 2 files were invisible — including `routing.ts.stub:72`, a commented-out paste-ready `mountPointConfig`. 65 `.stub` files exist; this is the `@lockness/init` surface every new project starts from. | Plan changed — FR-006 now globs `*.stub`; `packages/init/` added to the section 8 surface table. **Independently re-measured: confirmed, 3 hits / 2 files.** |
| A3 | **High.** FR-006's "34 hits across 13 files" was wrong and measured the wrong set: really **34 / 12**, and only 17 of the 34 fell inside FR-006's own stated categories (12 were deliberately-retained test lines, 3 ordinary comments). A requirement whose whole job is enumeration overstated by 14 and understated by 3 at once. | Plan changed — FR-006 carries the partitioned count (20 in-scope / 12 retained / 5 out of scope) and an explicit allow-list. **Independently re-measured: 34/12 confirmed, 37/14 with `*.stub`.** |
| A4 | **High.** Section 2's claim that two-segment paths are "already safe" covered the middleware only, ignoring `MountManager.setup()`'s unconditional `rootHono.route(pattern, internalHono)`. Predicted: `/foo/bar` serves the home page with HTTP 200. Flagged by the auditor as an unverified prediction. | **Measured, and the prediction is refuted as stated — then confirmed elsewhere.** Today `/foo/bar` → **404**, because the middleware fires first and masks the route. The exposure is real but latent, and it *opens* the moment the router narrows without narrowing to the exact locale set: under `[a-z]{2}`, `/zz/zz` and `/ui/kv` → **200 + home page, middleware never running**. Plan changed — FR-010 added, edge case rewritten, and the finding moved into Q1 as decisive evidence. |
| A5 | **Medium.** FR-007 instructed a rewrite of a *true* statement. `mount-points.md:250-262`'s static-file claim is defensible (`serveStatic` registers on `rootHono` before `mountManager.setup()`). The false text is only the parenthetical at `:263-264`, wrong about the mechanism in both directions. | Plan changed — FR-007 now names the parenthetical, states the real rule (order protects only when an earlier handler *responds*; `serveStatic` calling `next()` hands the path on), and protects `:250-262` from rewrite. |
| A6 | **Medium.** "Two askers, one decider" holds only while `config/routing.ts` derives from `config/i18n.ts`. `i18nMiddleware` is exported and reachable from any user-written `MountPoint` — including the unconstrained one **the framework still ships as its documented default**. For that caller the "impossible" input is ordinary user input, and `introduce-assertion`'s contract says assert is the wrong instrument. | Plan changed — fifth decision-table row added ("whether a mount pattern may be unconstrained → `mount_manager.ts`", Q3). Q2's recommendation is fixed as **assert-and-log, still return 404** — never assert-and-throw. |
| A7 | **Low.** Decision-table rows 3 and 4 named a derivation site and a mechanism, not a home — so neither could be checked by "did anything else state this?", the table's only purpose. | Plan changed — row 3 restated as the composition of rows 1+2; row 4 given the concrete home `config/routing.ts:mountPointConfig.pattern`. |
| A8 | **Low.** The YAGNI justification was honest but under-argued: it made a DRY argument where a counted one was available. 11 of 14 tests pin the pattern; under a core-level default **1 fails outright** (`:226`, 400→404) and **2 stay green for the wrong reason** (`:194`, `:260`). | Plan changed — that count is now the Complexity-tracking justification, with the consequence stated: core exports the *builder* so core's *defaults* need not move. |
| A9 | **Low.** Every `@example` FR-006 touches is stale in a second way: 7 blocks show `mountPoints: [ … ]` (plural, array) against a real `AppConfig` with `mountPoint?: MountPoint` (singular). Editing them without noticing ships a "corrected" example documenting a non-existent API. | Plan changed — FR-011 added. **Independently re-measured: 7 occurrences confirmed.** |
| A10 | **High — found by this session's verification of A4, not by either audit.** Adding *any* constraint changes which Hono router compiles the pattern, and `<pattern>/*` stops matching zero trailing segments. Measured: the locale root `/fr/ca` goes from `localeKey='fr-ca'` to **`localeKey=undefined` while still returning 200** — the home page silently renders in the wrong language, and SC-002 as originally written would have passed. | Plan changed — FR-009 (register the middleware on both `<pattern>` and `<pattern>/*`) and SC-002 rewritten to measure language, not status. **Fix verified: dual registration restores `fr-ca` while every other guarantee holds.** |

**Verdict**: **fail**, and the plan was amended rather than defended — 3 High, 2 Medium, 3 Low from the
auditor, plus A10 from verifying its top finding. **Coverage**: the decision table against
FR-001–FR-008 (no missing rule; two rows named a non-file home); the core-vs-app split against
`speculative-generality` and a counted test impact; blast radius **counted, not estimated**, and
then independently re-counted by this session; the "two askers, one decider" claim against
`introduce-assertion`; constitution conformance (no MVC/DDD contradiction — the feature is
routing/config only, and `mount_pattern.ts` is a pure string function with no I/O and no Hono
import). **Not covered by the auditor**: it did not execute the routing probe behind A4 — its
harness aborted on a missing root `deno.json` — so A4 arrived as a prediction; this session ran
that probe, which refuted A4 as stated and surfaced A10. Q1's three constraint shapes were not
evaluated against Hono's compilation beyond A1 by the auditor; this session has now measured all
three (see Q1).

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel with the architecture
audit. Kept separate on purpose — the architect asks whether a rule has one home, the security seat
asks whether that home is reachable by someone who should not reach it.*
**Verdict: fail** — 1 High, 4 Medium, 2 Low. Every claim below was executed against the vendored
Hono 4.11.1 in `node_modules/.deno/hono@4.11.1`, not recalled.

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | **High — the fix opens a gate-coverage gap at the mount root.** `MountManager` registers the middleware at `` `${pattern}/*` `` but the route at `pattern`. With an unconstrained param Hono's tail wildcard is `(?:\|/.*)`, so `/*` matches the empty tail and `/fr/ca` runs the middleware; **with the constraint it stops matching**. The router admits the request on a path the mount's gate does not cover. Here that is a wrong-locale page; in a downstream app it is a **middleware bypass at the tenant root** — and `config/routing.ts:4` advertises mount points for exactly that ("i18n, multi-tenancy"). CWE-693, OWASP A01:2025. | Plan changed — FR-009 (register on **both** `pattern` and `` `${pattern}/*` ``) and FR-008 extended to assert the mount root. **This is the same defect this session found independently as A10**, arrived at from the opposite direction: A10 measured the lost locale, S1 named it a gate bypass. The security framing is the one that matters — the impact is not "wrong language", it is "the gate does not cover every admitted path". |
| S2 | **Medium — Q2 as written turns the last gate into a fail-open.** An assertion that logs and calls `next()` is the fail-open shape. The middleware is **load-bearing today**: verified, with the current pattern and a non-rejecting middleware, `/css/app.css` serves the app home page and `/zz/zz/users` serves `/users` — the entire app is aliased under *any* two-segment prefix, and only `c.notFound()` at `i18n_middleware.ts:38` prevents it. | Plan changed — Q2's recommendation is fixed as **log at error *and* deny**: `console.error(…)` then `return c.notFound()`. Section 5 now records that the residual check is a **fail-closed** assertion: the decider moved, the denial did not. This independently converges with A6 from the architecture side. |
| S3 | **Medium — FR-003's "escape metacharacters" is not sufficient.** Hono extracts brace groups with `/\{[^}]+\}/g`, which is not escape-aware: an escaped `\}` still contains `}` and closes the group early. Verified: a code containing `}` then `/` corrupts the route table into `TypeError: undefined is not iterable`. No fail-*open* breakout was constructible in the shapes tested — a raw `/` failed closed — so the confirmed consequence is availability, not routing takeover. But escaping is the wrong control and the plan leaned on it. | Plan changed — FR-003 rewritten to **validate positively, then escape**, with a strict `/^[A-Za-z0-9-]{1,8}$/` allowlist that throws at boot naming the offending index, and a JSDoc note on *why*, so the allowlist is not later deleted as redundant. |
| S4 | **Medium — the new public helper ships without a trust contract or input bound.** The lists are **not attacker-influenced today** (`config/i18n.ts:15,20`, `as const`, no env/DB/request path into them — grepped). But `mount_pattern.ts` is exported from `@lockness/core`, so its input trust level is whatever a third party passes, and the plan set no cap. | Plan changed — FR-003b: input documented as **trusted build-time configuration**, length capped at 256, throwing not truncating. Section 12 records that loading locale lists from a DB or env var **re-triggers this audit**. **ReDoS assessed and cleared**: the emitted `^(?:lit1\|lit2\|…)$` is a flat alternation of escaped literals, no nested or overlapping quantifiers — linear in path length × list length — *provided* the allowlist stops a code contributing a quantifier. |
| S5 | **Low — the constrained pattern crashes on first dispatch under a non-Smart router.** Verified: with an explicit `RegExpRouter`, the constrained mount plus a root route throws `UnsupportedPathError` at the **first request**, not at boot. Lockness's default `SmartRouter` absorbs it by falling back to `TrieRouter` — which also makes the plan's "strictly cheaper" claim unverified. | Plan changed — section 6 records the `SmartRouter` dependency and retracts the performance claim. Boot-time probe-compilation folded into Q3. |
| S6 | **Medium — the feature's own premise is left half-fixed, and the log sink is unencoded.** `logger_middleware.ts:15,20` and `exceptions/formatter.ts:71,79,85-86` write `c.req.path` raw, and Hono's `getPath` applies `tryDecodeURI`, which **does** decode `%0A`/`%0D`/`%1B`. A request to `/%0a…` injects a real newline; `%1b` injects a terminal escape. Live today, independent of this feature — but SC-001 is a claim about log quality, so removing one noisy *source* while the sink stays unencoded is a half-fix. OWASP A09:2025. | Plan changed — FR-012 added, with an explicit instruction that descoping it must produce a **linked backlog item, not silence**. On the specific question asked: **Q2's assertion is not a flooding vector** — once the router constrains the segments, no HTTP input can make it fire. It *would* be an injection vector if it logged raw params, since `c.req.param()` returns percent-decoded values; FR-012 constrains it to a fixed message plus already-validated values. |
| S7 | **Low — section 2 stated a false premise FR-008's test would have inherited.** "`/css/app.css` — already safe … needs three segments. Unchanged." **Verified false**: today that path executes the middleware with `langId="css"`, `countryId="app.css"`. It only *looks* safe because `StaticFileServer` registers at `/*` on `rootHono` before the mount (`app.ts:458` then `:461`) and serves the file first — a request for a *missing* two-segment asset falls straight through. | Plan changed — the edge case was already rewritten from the A4 measurement; FR-007 now extends to `mount-points.md`'s "Static Files" section (the protection is *static-registered-first*, not segment count) and FR-008 covers a two-segment miss. |

**Verdict**: **fail** — one High and four Medium, all cheap in `plan.md` today and expensive after
release, because S1 and S3 are contract changes to a shipped public framework primitive.
**Coverage, stated so the clean parts are worth what they cost**: verified against Hono 4.11.1
itself that brace-group extraction is not escape-aware and what the failure actually does; that the
generated alternation carries **no ReDoS** exposure; that the code lists are **config-only and not
attacker-influenced today**; that **nothing downstream treats `langId`/`countryId`/`localeKey` as an
authorization or trust signal** — the only readers are `app/controller/demo_controller.tsx:46-47,59-60`
and `app/view/pages/demo/mount_points.tsx:72-73,304-306`, all presentation with `?? LOCALES['en-us']`
fallbacks; no session, tenant, cache key, query or persistence derives from them; that **`staticDir`
exposure is unchanged** by this feature (static already receives every path) — `denoServeStatic`'s
own traversal handling was **not** audited and is not altered here; and that the **framework 404 is
byte-identical to the middleware's**, both resolving to `exceptions/registrator.ts:40-46` — no new
body, header or meaningful timing leak. **On account takeover: nothing** — no locale value reaches
authentication, authorization, a tenant scope, a DB key, a cache key or an interpolated query
anywhere in this repo. The only cross-account exposure this feature could create is S1's gate gap in
a *downstream* app that puts tenant scoping in `mountPoint.middleware` — which is why S1 is High.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| Q1 — Which constraint shape: **exact-locale alternation** (recommended), generic `[a-z]{2}`, or an explicit `exclude` list on `MountPoint`? All three now measured — see the table below. | **Grouped exact-locale alternation `(?:en\|fr\|es\|de\|ja)`, derived from `config/i18n.ts`, together with FR-009's dual registration.** The generic `[a-z]{2}` form is rejected on measurement, not taste — it opens the duplicate-content leak (A10). The `exclude` list from the issue body is rejected as an open-ended set that fixes neither S1 nor the two-segment exposure. | 2026-08-24 |
| Q2 — Once the router decides validity, what does `i18nMiddleware`'s existing check become: **assert-and-log but still return 404** (recommended, per A6), deleted, or left as-is? | **Log at ERROR and still deny.** The decider moves to the router; the denial stays where it is. The residual check is a **fail-closed** assertion, not a fail-open log — an invalid locale arriving despite the router is an invariant violation, and it is traced *and* refused. Per FR-012 the log line is a **fixed message**: never `c.req.path`, never a raw param, since `c.req.param()` returns percent-decoded values. | 2026-08-24 |
| Q3 — Should `@lockness/core` warn at boot when a mount pattern uses unconstrained params (A6 says its own default is the live counter-example), or is that a separate backlog item? | **Both hardenings land in #95** — the boot warning *and* the boot probe-compile. Chosen over the recommendation to escalate them, and recorded as such: this closes A6 completely (core stops shipping a default that contradicts its own invariant) at the cost of turning a Size-S bug fix into a framework behaviour change. See FR-013 / FR-014, the fifth decision-table row, and the re-sizing note below. | 2026-08-24 |

**Q1, measured.** All three shapes were run against the real `MountManager.setup()` shape:

| Shape | `/.well-known/…devtools.json` | `/zz/zz` | `/fr/ca` (locale root) | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| unconstrained (today) | **middleware fires**, `langId=".well-known"` → 404 | 404 via middleware | 200, `localeKey=fr-ca` | the bug |
| bare alternation `{en\|fr\|…}` | **middleware fires**, `langId="de"` from `devtools` → 404 | 404 | 200 | **silently broken** (A1) |
| generic `{[a-z]{2}}` | clean, no middleware | **200 + home page** | 200 | **opens a duplicate-content leak** (A10) |
| grouped alternation `{(?:en\|fr\|…)}` + FR-009 | clean, no middleware | 404 | 200, `localeKey=fr-ca` | **recommended** |

Only the last row satisfies every requirement. Q1 is therefore a correctness question, not a
preference — the `exclude`-list alternative from the issue body remains available but solves a
narrower problem (it enumerates what to skip; the alternation enumerates what to accept, which is
the smaller and safer set to maintain).

### Decided without asking

- **Uppercase locales stay unsupported.** `/FR/CA/users` returns 404 today (the validator rejects
  it) and returns 404 after (the router does not match it). No observable change, so no question.
- **No redirect-to-default-locale.** `i18n_middleware.ts` carries a commented-out redirect
  alternative; this feature does not activate it. Changing 404 into a redirect is a product
  decision, unrelated to the ambiguity bug.
- **`MountPoint.pattern` stays a `string`.** A structured `{ params: {...} }` shape was considered
  and dropped — the interface already accepts what is needed, and widening a public type to express
  something a helper can build is cost without benefit.
- **Existing `mount_points.test.ts` cases are not rewritten.** They pin the unconstrained pattern,
  which remains a legal thing for a user to write. Narrowing them would test the demo app's choice
  under the guise of testing the framework.
- **The pattern is built once at boot**, not per request. The code lists are module constants.
- **FR-013 warns, it does not throw.** Q3 settled that the boot check exists; it did not settle its
  severity. Throwing would break every existing `mountPoint` user on upgrade for a condition that
  is legal — an unconstrained mount is a valid thing to write. A warning that names the constrained
  form makes the fix one edit.
- **FR-013 fires only when a middleware is also attached.** An unconstrained mount with no
  middleware is a routing choice; an unconstrained mount *with* a gate is the catch-all shape that
  produced this bug. Warning on the former would be noise.
- **FR-013 ships without an opt-out flag.** The warning disappears the moment the pattern is
  constrained, which is the intended remedy. A suppression flag can be added if it proves noisy —
  adding one now would be a knob nobody has asked for.
- **FR-014 throws.** A pattern the router cannot compile is not a legal configuration, so failing
  at startup with a named error is strictly better than a 500 on the first request.
