---
description: "Dependency-ordered breakdown for 001-fix-i18n-mount-ambiguity"
---

# Tasks: Make i18n routing robust to mount-point ambiguity

**Input**: `.specnaut/specs/001-fix-i18n-mount-ambiguity/plan.md` (the feature's one planning
document — approved at the plan stop, 2026-08-24)
**Backlog item**: [#95](https://github.com/locknessland/lockness/issues/95)
**Branch**: `001-fix-i18n-mount-ambiguity`

**Tests**: **REQUIRED, and written first.** The constitution makes TDD non-negotiable for the
`developer` agent — failing test first, minimal code to pass, then refactor. Every test task below
precedes the implementation task it covers.

**Organization**: grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable (different files, no dependency on an incomplete task)
- **[Story]**: the user story this serves (US1…US5); Setup / Foundational / Polish carry none

## 🔒 Decision-table homes — binding on every task below

A task may not put a decision anywhere but its named home. Amend `plan.md` section 5 first if one
must move; a review finding that a decision has two homes is a **plan violation, not a style
opinion**.

| The decision | Its only home |
| :--- | :--- |
| Which language/country codes this app supports | `config/i18n.ts` |
| How a code list becomes a safe Hono constraint (`(?:…)` grouping + escaping + allowlist) | `packages/core/routing/mount_pattern.ts` |
| What a locale-prefixed URL looks like | `config/routing.ts:mountPointConfig.pattern` (**built**, never a literal) |
| Whether a given request carries a locale | `config/routing.ts:mountPointConfig.pattern` — the string decides; `mount_manager.ts` only applies it |
| Whether a mount pattern may be unconstrained, and what the framework does about it | `packages/core/routing/mount_manager.ts` |

---

## Phase 1: Setup

**Purpose**: pin the current behaviour so every later change is measured against it, not against
memory.

- [X] T001 Record the baseline: run `deno task test` and save the pass/fail counts to the PR
      description. The suite must be green **before** any edit — a pre-existing failure attributed
      to this branch costs a review cycle.
- [X] T002 [P] Create `packages/core/tests/mount_pattern.test.ts` (empty file with the standard
      `@std/assert` import) so Phase 2's test tasks have a home.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the pattern builder. **Every** user story depends on it.

**⚠️ No user story work begins until this phase is complete.**

- [X] T003 [P] Write failing test in `packages/core/tests/mount_pattern.test.ts`: the builder emits
      a **non-capturing group** — assert the output for `['en','fr']` contains `(?:en|fr)` and NOT a
      bare `en|fr`. This is the A1 defect; the test exists so it cannot be un-learned. (FR-002)
- [X] T004 [P] Write failing test in `packages/core/tests/mount_pattern.test.ts`: the builder
      **throws** on a code containing a regex metacharacter or outside `/^[A-Za-z0-9-]{1,8}$/`, and
      the error names the offending index. Cover `}`, `}/`, `|`, `(`, `.`, `*`, an empty string, and
      a 9-character code. (FR-003)
- [X] T005 [P] Write failing test in `packages/core/tests/mount_pattern.test.ts`: the builder
      **throws** (never truncates) on a list longer than 256 entries, and on an empty list. (FR-003b)
- [X] T006 Implement `packages/core/routing/mount_pattern.ts` — a pure function
      `(codes: readonly string[]) => string`, no I/O, **no Hono import**. Validate positively
      against the allowlist, throw naming the offending index, then escape survivors, then emit
      `(?:a|b|c)`. Full JSDoc: `@param`, `@returns`, `@throws`, `@example`, plus a
      `@remarks` recording **why escaping alone is unsafe** — Hono extracts brace groups with
      `/\{[^}]+\}/g` (`dist/utils/url.js:15`, `dist/router/reg-exp-router/trie.js:10`) which is not
      escape-aware, so an escaped `\}` still closes the group. Without that note the next maintainer
      deletes the allowlist as redundant. Document the input as **trusted build-time
      configuration**. (FR-002, FR-003, FR-003b — home: `mount_pattern.ts`)
- [X] T007 Export the helper from `packages/core/mod.ts`. Additive only — no existing signature
      changes.
- [X] T008 Run `deno fmt && deno lint && deno check packages/core/routing/mount_pattern.ts && deno task test`. T003–T005 must now pass.

**Checkpoint**: the builder exists, is exported, and is proven against A1 and S3.

---

## Phase 3: User Story 1 — A system path is never seen by the locale middleware (P1) 🎯 MVP

**Goal**: `/.well-known/appspecific/com.chrome.devtools.json` stops reaching `i18nMiddleware`.

**Independent Test**: with DevTools attached, zero locale-validation log entries; the path returns
its own handler's response or a framework 404, never an i18n-middleware 404.

- [X] T009 [US1] Write failing test in `packages/core/tests/mount_points.test.ts`: a `.well-known`
      path **does not execute** the mount middleware. Assert on an observed execution flag, **not on
      the status code** — both the buggy and the fixed version return 404, so a status-only
      assertion passes for the wrong reason. (FR-008)
- [X] T010 [P] [US1] Write failing test, same file: a **two-segment miss** (`/css/missing.css`) does
      not execute the mount middleware. It does today — `StaticFileServer` only masks it when the
      file exists. (FR-008, S7)
- [X] T011 [P] [US1] Write failing test, same file: a two-segment non-locale path (`/foo/bar`) does
      **not** resolve to the application's root route. This exposure is real but currently masked by
      the middleware's 404; it opens the moment the router narrows. (FR-010)
- [X] T012 [US1] Build the pattern in `config/routing.ts` from `config/i18n.ts`'s `validLanguages` /
      `validCountries` via the Phase-2 helper. **No alternation literal in this file** — the codes
      have exactly one home. (FR-001, FR-004 — homes: `config/i18n.ts`, `config/routing.ts`)
- [X] T013 [US1] Run the gate. T009–T011 pass.

**Checkpoint**: the reported bug is fixed and proven by observation, not by status code.

---

## Phase 4: User Story 2 — Valid locale routes keep working (P1)

**Goal**: no 2xx route changes. Only paths that already 404 change which component 404s them.

**Independent Test**: every URL reachable today under a supported locale still resolves to the same
page in the same language.

- [X] T014 [US2] Write test in `packages/core/tests/mount_points.test.ts`: `/fr/ca/users` executes
      the middleware and sets `langId`/`countryId`/`localeKey`. (FR-001)
- [X] T015 [P] [US2] Write test, same file: a syntactically valid but **unsupported** locale
      (`/zz/zz/users`) returns 404 and does not reach the middleware.
- [X] T016 [P] [US2] Verify the 12 existing `/:langId/:countryId` lines in
      `packages/core/tests/mount_points.test.ts` still pass **unmodified**. They pin the
      unconstrained pattern deliberately — it stays a legal thing for a user to write. Do not
      rewrite them; if one fails, the change leaked into core's defaults and that is the bug.

**Checkpoint**: no regression on the happy path, and core's defaults provably did not move.

---

## Phase 5: User Story 5 — The locale home page keeps its locale (P1)

**Goal**: close A10 / S1 — the gate must cover **every** path the mount route serves.

**Independent Test**: `/fr/ca` returns 200 **with** `localeKey === 'fr-ca'`.

**Why this is its own story**: the fix in Phase 3 *causes* this regression. Adding a constraint
changes which Hono router compiles the pattern, and `<pattern>/*` stops matching zero trailing
segments. The page keeps its 200 and silently loses its language.

- [X] T017 [US5] Write failing test in `packages/core/tests/mount_points.test.ts`: the **mount root**
      (`/fr/ca`, no trailing segment) executes the mount middleware and carries
      `localeKey === 'fr-ca'`. Assert the context value, not the status. (FR-008, FR-009)
- [X] T018 [US5] In `packages/core/routing/mount_manager.ts`, register the mount middleware on
      **both** `pattern` and `` `${pattern}/*` ``. Prefer deriving the middleware path from the route
      path so the two cannot diverge again. (FR-009 — home: `mount_manager.ts`)
- [X] T019 [US5] Run the gate. T017 passes and Phase 3–4 stay green.

**Checkpoint**: every path the mount route admits also runs the mount gate. In a downstream app that
puts tenant scoping in `mountPoint.middleware`, this is the difference between a gate and a bypass.

---

## Phase 6: Framework hardening (from Q3 — in scope by explicit decision)

**Purpose**: stop core shipping a default that contradicts its own invariant (A6), and turn S5's
first-request 500 into a named boot failure.

**Scope note**: answered at the plan stop against the recommendation to escalate. These change
`MountManager` behaviour for **every** consumer of `mountPoint`, not just this app — hence their own
tests and their own decision-table row.

- [X] T020 [P] Write failing test in `packages/core/tests/mount_points.test.ts`: a mount with an
      unconstrained param **and** a middleware attached emits a boot **warning** naming the offending
      pattern and the constrained form. (FR-013)
- [X] T021 [P] Write failing test, same file: an unconstrained mount with **no** middleware emits
      **no** warning — an unconstrained mount is a legal routing choice; only the gate shape is the
      finding. (FR-013)
- [X] T022 [P] Write failing test, same file: an unsupported pattern shape **throws at boot** with a
      named error, not on the first request. (FR-014)
- [X] T023 Implement FR-013 in `packages/core/routing/mount_manager.ts` — warn, never throw.
      Throwing would break every existing `mountPoint` user on upgrade for a condition that is
      legal. No opt-out flag: the warning disappears when the pattern is constrained.
      (FR-013 — home: `mount_manager.ts`)
- [X] T024 Implement FR-014 in `packages/core/routing/mount_manager.ts` — probe-compile the mount
      route at boot and throw a named error on failure. Verified failure mode: under an explicit
      `RegExpRouter`, a constrained mount plus a root route throws `UnsupportedPathError` from
      `reg-exp-router/router.js:47` **on the first request**. (FR-014 — home: `mount_manager.ts`)
- [X] T025 Re-measure the retracted performance claim now that router fallback is observable, and
      correct `plan.md` section 6 with what was actually measured. The code is the present; a
      document is a claim about the past. (S5)
- [X] T026 Run the gate. T020–T022 pass; the whole suite stays green.

**Checkpoint**: the framework no longer teaches, by default, the shape that caused this bug.

---

## Phase 7: User Story 3 — A developer configures a locale mount without re-deriving the regex (P2)

**Goal**: the constrained form becomes what the framework *shows*, everywhere it shows anything.

**Independent Test**: a developer declares supported codes once and never hand-writes a regex; no
shipped example teaches the unsafe pattern.

**Enumeration is by SEARCH, not by example** — `git grep -n ":langId" -- '*.ts' '*.tsx' '*.md' '*.stub'`
excluding `.specnaut/specs/`. The `*.stub` glob is load-bearing: an `--include='*.ts'` search cannot
see `@lockness/init`, which is where every new project starts.

- [X] T027 [US3] Update the 2 `.stub` sites — `packages/init/stubs/init/config/routing.ts.stub:49`
      (an `@example`) and `:72` (a **commented-out, paste-ready `mountPointConfig`**), and
      `packages/init/stubs/init/app/kernel.ts.stub:165`. Highest-leverage propagation path in the
      repo. (FR-006, A2)
- [X] T028 [P] [US3] Update the shipped `@example` blocks in `packages/core/app.ts:107` and `:430`,
      `packages/core/kernel/kernel_decorators.ts:250`, and
      `app/middleware/i18n_middleware.ts:14`. (FR-006)
- [X] T029 [P] [US3] In the **same edit** as T027–T028, correct `mountPoints: [ … ]` (plural, an
      array) to `mountPoint: { … }` (singular) — the plural key does not exist on `AppConfig`
      (`packages/core/types.ts:43`). 7 occurrences: `packages/core/app.ts:107`/`:430`,
      `packages/core/README.md:402`/`:447`/`:470`,
      `packages/core/docs/kernel-decorator.md:402`, `app/middleware/i18n_middleware.ts:13`. Shipping
      a "corrected" example that still documents a non-existent API is not a correction.
      (FR-011, A9)
- [X] T030 [P] [US3] Update `packages/core/README.md` and `packages/core/docs/mount-points.md`
      examples to the constrained form. (FR-006)
- [X] T031 [P] [US3] Update the demo surfaces that display the pattern —
      `app/view/pages/demo/mount_points.tsx` and `app/controller/demo_controller.tsx`. Displayed
      string only; no layout, no styling, no artifact. (FR-006)
- [X] T032 [US3] Re-run the enumeration and reconcile against the **allow-list**: 20 in-scope sites
      changed; the 12 `/:langId/:countryId` lines in `packages/core/tests/mount_points.test.ts`
      deliberately retained; 5 out of scope (3 code comments, the live config value, view display
      data). FR-006 is satisfied when the search matches this partition — **not** when it returns
      zero, which it never will. (FR-006, A3)

**Checkpoint**: nothing the framework ships teaches the defect.

---

## Phase 8: User Story 4 — Root access is unchanged (P3)

- [X] T033 [US4] Write test in `packages/core/tests/mount_points.test.ts`: `/users` does not execute
      the middleware and `langId` is `undefined`. Guards against a fix that accidentally makes the
      mount unconditional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T034 [P] Correct the **parenthetical** at `packages/core/docs/mount-points.md:263-264` — "*which
      would match `langId="css"`, `countryId="app.css"`*" — which is wrong in both directions: the
      mount *middleware* cannot match a two-segment path, while the mount *route* can. **Do not
      rewrite `:250-262`**: that static-files claim is defensible, since `serveStatic` registers on
      `rootHono` before `mountManager.setup()` and short-circuits a real file. State the real rule:
      registration order protects a path only when an earlier handler actually *responds*;
      `serveStatic` calling `next()` on a miss hands the path straight to the mount. (FR-007, A5, S7)
- [X] T035 [P] Fix or delete the stale what-comment at `packages/core/routing/mount_manager.ts:25`,
      which asserts a guarantee the code does not give. (FR-007, A4)
- [X] T036 Demote `app/middleware/i18n_middleware.ts`'s validity check from decider to **fail-closed
      asker**: `console.error(…)` **and** `return c.notFound()`. Never log `c.req.path` or a raw
      param — `c.req.param()` returns percent-decoded values. Fixed message only. Remove the
      commented-out redirect alternative or leave it explicitly labelled out of scope.
      (FR-005, FR-012, Q2 — home: the *decision* is `config/routing.ts`; this file only asks)
- [X] T037 [P] Encode log fields before writing in `app/middleware/logger_middleware.ts:15,20` and
      `packages/core/exceptions/formatter.ts:71,79,85-86`. Both interpolate `c.req.path` raw, and
      Hono's `getPath` applies `tryDecodeURI`, which decodes `%0A`/`%0D`/`%1B` — so a crafted path
      injects real newlines and terminal escapes. Strip C0 controls and `\x1b`; pass values as
      separate `console.log` arguments rather than interpolating. Live today and independent of this
      feature, but SC-001 is a claim about log quality. **If descoped, it leaves as a linked backlog
      item — not as silence.** (FR-012, S6)
- [ ] T038 **Not done — deliberately surfaced, not executed.** Ask the product-owner to re-size #95 **S → M**. Q3 turned a bug fix into a `MountManager`
      behaviour change; the estimate no longer reflects the work. Surfacing it here beats
      discovering it at review.
- [X] T039 Final gate: `deno fmt && deno lint && deno check <changed files> && deno task test`.
      Compare against T001's baseline — same pass count plus the new tests, zero failures.
- [X] T040 Commit by category, never bundled: `fix(95):` for `mount_pattern.ts` + `mount_manager.ts`
      + `config/` + `i18n_middleware.ts`; `test(95):` for the new tests; `docs(95):` for the docs,
      READMEs, stubs and `@example` blocks. Constitution rule 9 — one category per commit, and
      atomicity beats brevity.

---

## Dependencies

```
Phase 1 (Setup)
   └─> Phase 2 (Foundational — the builder)   ⚠️ blocks everything
          ├─> Phase 3  US1 (P1) 🎯 MVP
          │      └─> Phase 4  US2 (P1)   regression guard for US1
          │             └─> Phase 5  US5 (P1)   fixes what US1 breaks
          ├─> Phase 6  Framework hardening (Q3)   independent of US1-US5
          └─> Phase 7  US3 (P2)   independent once the builder exists
                 └─> Phase 8  US4 (P3)
                        └─> Phase 9  Polish
```

**The one ordering that is not negotiable**: Phase 5 must not be deferred past Phase 3. Phase 3 is
what introduces the regression Phase 5 fixes, and the regression is **silent** — the page keeps its
200. Shipping Phase 3 without Phase 5 ships a locale-less home page and, in a downstream app, a gate
that does not cover the mount root.

## Parallel opportunities

- **Phase 2**: T003, T004, T005 — three independent test cases, one file, written together.
- **Phase 3**: T010 and T011 run alongside T009.
- **Phase 6**: T020, T021, T022 are independent of each other and of Phases 3–5.
- **Phase 7**: T028, T029, T030, T031 touch disjoint files. T027 goes first — the `.stub` sites are
  the ones most likely to be missed.
- **Phase 9**: T034, T035, T037 are disjoint.

## Independent test criteria

| Story | Verified by |
| :--- | :--- |
| US1 | The middleware is **observed** not to run for `.well-known` and for a two-segment miss. Never by status code alone. |
| US2 | `/fr/ca/users` still sets `localeKey`; the 12 retained test lines pass **unmodified**. |
| US5 | `/fr/ca` returns 200 **and** `localeKey === 'fr-ca'`. |
| US3 | The enumeration matches the allow-list partition, `*.stub` included. |
| US4 | `/users` leaves `langId` undefined. |

## Implementation strategy

**MVP = Phase 1 → 2 → 3.** That closes #95 as reported: DevTools stops generating locale-validation
noise.

**But the MVP is a checkpoint, not a delivery.** Phase 5 is mandatory before this branch ships —
Phase 3 introduces a silent regression that Phase 5 repairs, and "silent" is precisely why it cannot
be left for a follow-up. Phases 6–9 complete the scope approved at the plan stop.

**Task count**: 40 across 9 phases — 3 Setup/Foundational test tasks, 12 implementation tasks,
11 test tasks, 14 documentation / enumeration / hygiene tasks.
