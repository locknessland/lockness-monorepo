# Plan: Fill coverage gaps & ship a shared testing harness (epic #179)

**Branch**: `164-testing-coverage-harness` | **Date**: 2026-09-04 | **Backlog item**: [#179 — Fill coverage gaps and ship a shared testing harness](https://github.com/locknessland/lockness-monorepo/issues/179)

**This is the epic's one planning document** — it covers all seven children. One decision table, one stop. Children: [#180 drizzle](https://github.com/locknessland/lockness-monorepo/issues/180), [#181 re-export contract](https://github.com/locknessland/lockness-monorepo/issues/181), [#182 auth-provider](https://github.com/locknessland/lockness-monorepo/issues/182), [#183 openapi](https://github.com/locknessland/lockness-monorepo/issues/183), [#184 ui](https://github.com/locknessland/lockness-monorepo/issues/184), [#185 @lockness/testing](https://github.com/locknessland/lockness-monorepo/issues/185), [#186 docs + rename](https://github.com/locknessland/lockness-monorepo/issues/186).

---

## 1. Why this exists

The framework audit found the test estate uneven: the **data layer is entirely untested** (drizzle — `cli_commands.ts` 691 LOC + `install.ts` 312 LOC, 0 tests), security-relevant and public-facing packages are thin (auth-provider 11/1, openapi 7/1, ui 91/17), **no test guards the pinned re-export surface** hard rule #1 depends on (hono 22 files/0 tests), and there is **no shared test-support package** — 20 test files (79 occurrences) hand-roll the HTTP client and `@std/testing/mock` is unused. Naming drift (`_test.ts` vs the `.test.ts` mandate) breaks glob-based coverage accounting in 3 packages. The standard exists on paper; this epic makes it real and easy to follow.

## 2. User scenarios

The "user" here is a **framework contributor / maintainer** writing or trusting tests.

### US1 — the pinned re-export surface is guarded (P1) — #181
**Given** `@lockness/hono` re-exports a pinned Hono surface (hard rule #1)
**When** a Hono bump drops, renames, or retypes an export
**Then** a contract test fails in CI — not a downstream consumer later. Same for `@lockness/core`'s public surface.

### US2 — the data layer is tested hermetically (P1) — #180
**Given** `db:*` commands and `install.ts`
**When** the suite runs
**Then** they are exercised against an in-memory/fake connection, with no real database and no network — the suite stays hermetic.

### US3 — a shared testing harness exists (P1) — #185
**Given** a contributor writing an HTTP test
**When** they need a client, common fakes, `actingAs`, or DB assertions
**Then** one JSR-declared `@lockness/testing` package provides them, instead of hand-rolling `app.request`.

### US4 — thin packages gain meaningful tests (P2) — #182, #183, #184
identity providers (base/drizzle/kysely), OpenAPI document generation, and the stateful UI components (Modal, Tabs, Accordion, Pagination, Table) gain tests.

### US5 — the conventions are documented and drift is resolved (P2) — #186
`docs/testing.md` codifies naming, FakeTime, sanitizer and mock policy, and the HTTP-client helper; the `_test.ts` files in vite / markdown / container are renamed to `.test.ts`.

### Edge cases
- A re-export whose **type** changed but name did not (#181 must assert types, not just names).
- A `db:*` command that shells out or opens a real connection (#180 must inject a fake, not hit a DB).
- Renaming `_test.ts` must preserve git history (`git mv`) and update any path references / coverage globs.

## 3. Requirements

- **FR-001** (#181): A contract test guards the export surface of `@lockness/hono` and `@lockness/core` via a **committed baseline snapshot diffed against the live surface** (A7): the baseline is generated once by SEARCH over the package's `mod.ts` (not a hand-listed sample), committed, then each run diffs the live surface against it — a **dropped** export fails (a live enumeration alone cannot see what is gone). A legitimate change updates the baseline in the same commit.
- **FR-002** (#181): The contract test asserts each guarded export's **kind** (function / class / value) so a type-shape regression is caught, to the extent the runtime allows.
- **FR-003** (#180): `db:*` commands are tested hermetically — no test opens a real database, spawns a real process, or hits the network (sanitizers stay on). This needs **three seams** in `registerDrizzleCommands`, because a fake connection alone covers only `db:check` (A2): (a) the already-injectable `Database` connection (used by `db:check`); (b) a **command-runner port** wrapping `new Deno.Command` — the six shell-out commands (`db:generate/migrate/push/studio/status/fresh` via `runDrizzleKit`) are tested by **asserting the constructed `drizzle-kit` argv**, never executing it; (c) a **seeder-loader port** replacing `db:seed`'s `import(file://${Deno.cwd()}/…)`. Adding these seams is in #180's scope (its own commit). **Fixtures use synthetic/placeholder credentials and connection strings only — never a real secret** (S3); the pre-commit secret scan is the backstop.
- **FR-004** (#180): `install.ts` is covered.
- **FR-005** (#185): A new **`@lockness/testing`** workspace package ships (an **internal, unpublished** member — Q1): an HTTP test client wrapping `app.request`, common in-memory fakes, an `actingAs(user)` helper, and DB assertions. Its own dependencies are declared from JSR (hard rule #2), JSDoc'd, **no `any`** in exported helpers. It is excluded from the publish set (`publish:check`/`bump` leave never-published members untouched).
- **FR-006** (#185): `@lockness/testing` stays **outside the runtime DAG** — no runtime consumer imports it outside `tests/`. This is guaranteed by `scripts/deps_analyzer.ts`, which excludes `tests/` dirs and `*_test.ts`/`*.test.ts` from the measured graph (verified), so a `tests/`-only import creates **no measured edge** and needs **no** consumer `allow` edit. **The harness's own deps are whatever its helpers require** — measured to be `@lockness/auth` + `@lockness/session` (for `actingAs`/identity), `@lockness/drizzle` (for DB assertions), `@lockness/hono` (app type) and `@lockness/contract` (A1: `@lockness/contract` exposes **no** auth/session/identity types, so hono+contract alone cannot carry FR-005). Its single `deps.policy.jsonc` entry lists that allow-set; `deno task deps:analyze` stays green (no cycle — consumers touch it only from `tests/`).
- **FR-012** (#185, from security S1 + Q1): `@lockness/testing` is **internal and unpublished**, so it never reaches a consumer's runtime — the auth-bypass-shipping risk is moot. As hygiene (and because it is used across the monorepo's own tests), `actingAs(user)` still sets identity **only on the test client's request context**, never minting a session/token the production auth stack would accept and never writing to a real session/user store; the in-memory fakes are plain fakes wired only where a test injects them. `mod.ts` and `docs/testing.md` mark the package **test-only**.
- **FR-007** (#182): base + drizzle + kysely providers are tested, and the **deny paths of every provider kind are asserted (fail-closed identity), not just the happy path** (S2): basic-auth — unknown user → `null`, credential mismatch → `verifyPassword` false; token — invalid → `null`, expired → `null`, revoked/deleted → `null`; session — unknown session → `null`. Tests must also assert the insecure `plain === hash` default of `BasicAuthProviderBase.defaultVerifyPassword` is meant to be **overridden** (never codify it as correct). Aligns with the #164 fail-closed line.
- **FR-008** (#183): OpenAPI generation is tested against route-metadata fixtures; the emitted document shape is asserted.
- **FR-009** (#184): the stateful UI components (Modal, Tabs, Accordion, Pagination, Table) gain tests.
- **FR-010** (#186): `docs/testing.md` codifies naming, FakeTime, sanitizer policy, mock policy, the HTTP-client helper, the **synthetic-credentials-only** fixture rule (S3), and that `@lockness/testing` is **test-only** (S1/FR-012).
- **FR-011** (#186): every `_test.ts` under `packages/` is renamed to `.test.ts` via `git mv` for **convention consistency** with the `.test.ts` mandate (A6: not a fix for broken coverage accounting — `coverage_floor.ts` already matches both spellings and `deno test` discovers both; there is nothing broken, only inconsistent). Measured set (A5): **13 files — vite 10, markdown 2, container 1** (`git ls-files 'packages/**/*_test.ts'`); the template under `.claude/skills/` is out of scope.

## 4. Success criteria

- **SC-001**: A deliberately dropped `@lockness/hono` export makes the suite fail — via the committed baseline diff (FR-001), demonstrable by a local spike.
- **SC-002**: The drizzle and auth-provider suites run green with sanitizers on and no network — verifiable by `deno test --trace-leaks` staying clean.
- **SC-003**: A contributor writes an HTTP test using `@lockness/testing` in ≤ 3 lines instead of hand-rolling `app.request`.
- **SC-004**: `git ls-files 'packages/**/*_test.ts'` returns nothing after #186.
- **SC-005**: `deno task deps:analyze` stays green (no cycle from the new package).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The guarded re-export surface of `@lockness/hono` / `@lockness/core` | The contract test's snapshot in `packages/hono/tests/` and `packages/core/tests/`, derived by SEARCH over `mod.ts` | A second hand-maintained list of exports anywhere |
| How a `db:*` test gets its I/O (fake connection + command-runner + seeder-loader ports, never real) | The three injected ports in `registerDrizzleCommands` (`packages/drizzle/cli_commands.ts`), fed fakes in `packages/drizzle/tests/` | A real pg connection, a real `Deno.Command`, a real dynamic import, or a second fake elsewhere |
| The HTTP test client (wrapping `app.request`) | `packages/testing/` — one `testClient()` helper; **new** tests use it, existing sites migrate opportunistically (A3: a full migration of the measured 20 files / 79 occurrences is not owned by any child — it is a follow-up, not an epic AC) | A second `testClient` spelling; a new test re-hand-rolling `app.request` |
| `@lockness/testing`'s place in the dependency graph (test-only, no cycle) | `packages/testing/deno.json` imports + `deps.policy.jsonc` | A runtime package importing `@lockness/testing` outside `tests/` |
| How `actingAs` injects identity (test client request context only — never a real session/token) | `packages/testing/` — the `actingAs`/`testClient` implementation | Minting a real session or token, or writing to a real session/user store, anywhere in the helper |
| The test-file naming convention (`.test.ts`) | `docs/testing.md` (the written rule) + zero `_test.ts` files under `packages/` | A `_test.ts` file surviving, or a second naming note elsewhere |

## 6. Technical context

**Language/Version**: TypeScript on Deno, matching the workspace.
**Primary Dependencies**: `@std/assert`, `@std/testing` (FakeTime, mock), `@lockness/hono` (app type for the client), `@lockness/contract`.
**Storage**: fakes only — no real DB in tests (FR-003).
**Testing**: `deno test` (+ `--trace-leaks`), TDD where the deliverable is production code; for pure test-authoring children the test *is* the deliverable.
**Project Type**: library / test-tooling.
**Scale/Scope**: one new package (`@lockness/testing`), tests added to 5 packages, contract tests in 2, a docs file, and a 13→0 `_test.ts` rename across 3 packages.

### Domain model

- **Bounded context**: test tooling / quality — cross-cutting, no business domain.
- **New entities**: none in the business sense. `@lockness/testing` exposes **helpers/value-shapes**: `testClient(app)`, in-memory fakes, `actingAs(user)`, DB assertions — utilities, not domain entities.
- **Invariants**: tests are hermetic (no network/real DB); `@lockness/testing` is test-only and acyclic; there is one home for the HTTP client and one for the re-export snapshot.
- **Out of scope**: the coverage **gate** itself (shipped already: `scripts/coverage_floor.ts` + CI); new product features.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | `@lockness/testing` uses the app type from `@lockness/hono`/`@lockness/core`, not `hono`. |
| JSR-only specifiers | pass | New package declares deps as `jsr:` (FR-006). |
| No `any` in exported APIs | pass | FR-005. |
| Pre-completion gate | pass | Full gate per child. |
| Never edit `deno.lock` manually | pass | `deno cache`/task regenerates it when the new package is added. |
| JSDoc on public APIs | pass | FR-005. |
| MVC layering | n/a | Test tooling. |
| Commit discipline | pass | One commit per child on the epic branch (`phases/epic-commits.md`). |
| No `any` / no silent catch | pass | Helpers surface errors. |

### Complexity tracking
No violations. The one genuinely new surface — `@lockness/testing` — is justified by 20 hand-rolled client files (79 occurrences) (FR-005/US3), not speculative.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| New `@lockness/testing` package | yes | New workspace member; public helpers via `mod.ts`. |
| `deno.json` workspace array + `deps.policy.jsonc` | yes | Register the new package. |
| `packages/{drizzle,auth-provider,openapi,ui}/tests/` | yes | New test files. |
| `packages/{hono,core}/tests/` | yes | Re-export contract tests. |
| `docs/testing.md` | yes | Conventions expanded (separate `docs` commit). |
| `packages/{vite,markdown,container}/tests/` | yes | `_test.ts` → `.test.ts` renames (separate commit). |
| Runtime/product code | no | Tests + one test-only package + docs only. |

### Documentation (this feature)

```text
.specnaut/specs/164-testing-coverage-harness/
├── plan.md    # This file — the whole epic
└── tasks.md   # the child list in dependency order
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| `@lockness/testing` creates a dependency cycle | FR-006 + `deno task deps:analyze` in the gate; depend only on foundation packages, import only from `tests/`. |
| Contract test is brittle (churns on every legit export add) | Snapshot the surface; a legit change updates the snapshot in the same commit — the test's job is to make the change *visible*, not to freeze it. |
| Hermetic drizzle testing forces a real connection | Inject a fake connection; if `cli_commands.ts` cannot take one without a refactor, that refactor is in-scope for #180 (its own commit) and noted, not worked around with a live DB. |
| Epic is large — partial delivery | MVP = #185 (harness) → #181 (contract) → #180 (drizzle); the harness lands first so #182/#183/#184 can use it. Each child ships independently. |
| `git mv` rename misses a path reference | After #186, grep for `_test.ts` references in configs/scripts; `deno task test` + coverage globs prove it. |
| Published `@lockness/testing` misused in a consumer's production runtime | FR-012 — `actingAs` injects only into the test client's request context, never mints a real credential, so it is inert against a real auth stack; docs mark it test-only. |

## 10. Architecture audit
*Findings from the `architect-expert` run against THIS document, before any code existed.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 (HIGH) | FR-006 fixed the harness deps at hono+contract, but `actingAs`/DB assertions need auth/session/drizzle — `@lockness/contract` exposes no identity types | **Plan changed** — FR-006 + domain-model + decided-list now state the harness's own deps are what its helpers need (auth, session, drizzle, hono, contract); the test-only-DAG mechanism (verified against `deps_analyzer.ts`) is unchanged and correct. |
| A2 (HIGH) | #180's fake-connection seam covers only `db:check`; six commands shell out via `Deno.Command`, `db:seed` dynamic-imports — a fake connection is inert for them | **Plan changed** — FR-003 + decision row 2 + risk row now require **three seams** (connection, command-runner port, seeder-loader port); shell-out commands are tested by asserting the constructed `drizzle-kit` argv, not executing it. |
| A3 (MEDIUM) | Decision row 3's "one home" for the HTTP client is delivered by no child — the ~20 existing hand-rolled sites are never migrated | **Plan changed** — row 3 downgraded: new tests use `testClient`, existing sites migrate opportunistically; a full migration (20 files / 79 occ) is a follow-up, not an epic AC. |
| A4 (MEDIUM) | "JSR-declared" conflates hard-rule #2 (deps from JSR) with the decision to *publish*; publish binds lockstep versioning + JSR-consent + per-package docs forever | **→ Open question Q1** — publish `@lockness/testing` (downstream value) vs internal-only unpublished workspace member (lighter, and makes the S1 bypass risk moot). |
| A5 (LOW) | Blast-radius counts inconsistent (14 vs measured 13 `_test.ts`; "30" vs measured 20 files/79 occ) | **Plan changed** — counts replaced with the measured ones (13 rename; 20/79 hand-rolled), with the commands cited. |
| A6 (LOW) | Rename justification ("breaks coverage accounting") is unsubstantiated — `coverage_floor.ts` matches both spellings | **Plan changed** — FR-011 reworded to "convention consistency", drops the broken-accounting claim. |
| A7 (LOW) | SC-001 (a dropped export must fail) is unreachable by a live enumeration over `mod.ts` | **Plan changed** — FR-001 + SC-001 now specify a **committed baseline snapshot diffed** against the live surface. |

**Verdict**: fail → all 7 folded (A1/A2 into the plan; A4 raised as Q1; A3/A5/A6/A7 corrected). The central FR-006 test-only-DAG mechanism was **verified correct** against `deps_analyzer.ts`; the re-export test home and the rename target set (vite/markdown/container, template excluded) are right. Coverage: plan §§3–5, 8–9, the 7 child issues, `deps_analyzer.ts`, `deps.policy.jsonc`, `deno.jsonc`, `coverage_floor.ts`, `drizzle/cli_commands.ts`, `contract/mod.ts`.

## 11. Security audit
*Findings from the `security-expert` run against THIS document, in parallel.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 (MEDIUM) | `@lockness/testing`'s `actingAs`/fakes become an auth-bypass primitive if published and imported at runtime; `deps:analyze` only guards the framework's own graph, not a consumer app | **Plan changed (Q1 → internal-only)** — the package is **unpublished**, so it never reaches a consumer runtime and the risk is designed out. FR-012 still keeps `actingAs` request-context-only as hygiene; `mod.ts`/docs mark it test-only. |
| S2 (MEDIUM) | FR-007 required deny paths for basic-auth only; a fail-open regression in the token/session provider (`verifyToken` returning a user for an invalid/expired/revoked token) would pass CI | **Plan changed** — FR-007 now requires deny-path assertions for **all three** provider kinds (token invalid/expired/revoked → null, session unknown → null, plus basic-auth), and asserting the insecure `plain === hash` default is meant to be overridden. |
| S3 (LOW) | The plan did not forbid a real secret/connection string in a fixture | **Plan changed** — FR-003 + FR-010 mandate synthetic/placeholder credentials only; pre-commit secret scan is the backstop. |

**INFO (recorded, no action here):** `BasicAuthProviderBase.defaultVerifyPassword` does a timing-unsafe `plain === hash` — existing runtime code, correctly labelled "not for production" and out of this test-only epic's scope; a proper hardening belongs to the #164 fail-closed line. #182's tests assert it is overridden, not that it is correct (FR-007).

**Verdict**: needs_followup → S1/S2/S3 folded. No CRITICAL/HIGH; sound for test tooling. Coverage: the `@lockness/testing` capability surface, auth-provider deny paths, and fixture secret hygiene; UI (#184) / OpenAPI (#183) carry no security surface.

## 12. Open questions
*Asked at the stop that ends the plan phase.*

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — Publish `@lockness/testing`, or keep it internal-only? (arch A4 + security S1)** | **Internal-only (unpublished workspace member).** Lighter (no lockstep/JSR-consent/per-package-docs burden); the auth-bypass-shipping risk is moot since it never reaches a consumer. Delivers the audit's F7 goal (the framework's own hand-rolled clients). Downstream publishing can be a later decision once the API stabilises. | 2026-09-04 |

### Decided without asking

- **`@lockness/testing` is imported only from `tests/`, kept out of the runtime DAG by `deps_analyzer.ts`'s test exclusion** — its own deps are whatever its helpers need (measured: auth, session, drizzle, hono, contract; **not** hono+contract alone — contract has no identity types). `deps:analyze` guards the no-cycle guarantee. (A1.)
- **MVP order = #185 → #181 → #180, then #182/#183/#184, then #186** — the harness lands first so the later test children can adopt it; the rename/docs land last to avoid churn mid-epic.
- **The re-export contract test snapshots the surface** rather than freezing a hand-list — a legitimate export change updates the snapshot in its own commit; the test exists to make the change visible.
- **Hermetic-only DB testing** — a fake connection, never a real DB; if a `db:*` command resists injection, the minimal refactor to accept one is in scope for #180.
