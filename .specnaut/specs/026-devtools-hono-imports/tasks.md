# Tasks: Rewrite type-only `hono` imports in devtools to `@lockness/hono`

**Input**: `.specnaut/specs/026-devtools-hono-imports/plan.md` (the only design doc)
**Linked issue**: #160
**Tests**: This is a **behaviour-preserving refactor** (plan §7, FR-007). No new
behaviour to test-drive; the regression guard is the **existing** devtools suite
(SC-004) plus the SC-001 grep gate. No test is added or removed — one test *file*
has an import specifier changed (FR-004), which the suite itself verifies by
still compiling and passing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no dependency on an incomplete task)
- **[Story]**: US1 / US2 (from plan §2)

## 🔒 Decision-table homes carried forward (plan §5)

- **Which specifier devtools uses for Hono** → the four `import … from
  '@lockness/hono'` statements. **Only home.** No surviving `from 'hono'` in
  devtools source/tests.
- **What `@lockness/hono` resolves to** → one pinned `jsr:@lockness/hono@^0.2.0`
  in `packages/devtools/deno.json imports`, shared by the `"hono"` alias (JSX)
  and the new `"@lockness/hono"` key. **The two keys never diverge**
  (tooling-enforced by `scripts/bump.ts:116`).
- **Which module JSX compiles against** → `jsxImportSource: "hono"` (unchanged).

---

## Phase 1: Setup

_No new files, deps, or fixtures. This feature edits four existing files
(`middleware.ts`, `mod.ts`, `dashboard.tsx`, `tests/debug_panels.test.ts`) and
one manifest (`deno.json`). No setup phase._

---

## Phase 2: Foundational — declare the dependency (blocks the source edits)

The `"@lockness/hono"` import-map key must exist before source imports reference
it, or `deno check` fails to resolve the new specifier.

- [X] T001 In `packages/devtools/deno.json` `imports`, add
  `"@lockness/hono": "jsr:@lockness/hono@^0.2.0"` (fully qualified + pinned).
  **Retain** the existing `"hono"` alias and `jsxImportSource: "hono"` unchanged
  (plan FR-005, FR-006; decision-table Row 2/Row 3). Do not touch `deno.lock` by
  hand — if resolution needs it, run `deno cache`. (plan FR-005/006)

---

## Phase 3: US1 — the spelling matches the rule (P1)

**Independent test**: `grep -rn "from 'hono'" packages/devtools/ --include='*.ts'
--include='*.tsx'` returns 0 hits; `deno check` on all four files passes.

- [X] T002 [P] [US1] In `packages/devtools/middleware.ts:18`, change
  `import type { Context, MiddlewareHandler } from 'hono'` →
  `from '@lockness/hono'`. `import type` keyword preserved; no other line edited.
  (plan FR-001, FR-007)
- [X] T003 [P] [US1] In `packages/devtools/mod.ts:45`, change
  `import type { Hono } from 'hono'` → `from '@lockness/hono'`. Type-only; no
  other line edited. (plan FR-002, FR-007)
- [X] T004 [P] [US1] In `packages/devtools/dashboard.tsx:9`, change
  `import type { Context } from 'hono'` → `from '@lockness/hono'`. Type-only; no
  other line edited; JSX still resolves via the retained `"hono"` alias. (plan
  FR-003, FR-007)
- [X] T005 [P] [US1] In `packages/devtools/tests/debug_panels.test.ts:9`, change
  `import { Hono } from 'hono'` → `from '@lockness/hono'`. **Value** import (the
  `Hono` class is constructed) — no `import type`. The bridge re-exports `Hono`
  as a value via `export * from 'hono'`. No test logic edited. (plan FR-004,
  Q1-RESOLVED, FR-007)

---

## Phase 4: US2 — the dependency is declarable (P2)

_Delivered by T001; US2's acceptance is that the pinned `@lockness/hono`
declaration exists and the dependency graph accepts it._

- [X] T006 [US2] Verify `deno task deps:analyze` passes for `@lockness/devtools`
  with `@lockness/hono` now declared (plan SC-003). If the analyzer objects to
  the retained dual `"hono"`/`"@lockness/hono"` alias, record it as a finding
  (plan R3) — do not silently drop the `"hono"` alias (breaks JSX). No further
  production change expected.

---

## Phase 5: Polish & pre-completion gate

- [X] T007 Confirm FR-007 held: `git diff` touches only import lines in the four
  source/test files plus the one `deno.json` key — no non-import line, no export
  surface, no panel/collector/gate behaviour changed. Confirm SC-001:
  `grep -rn "from 'hono'" packages/devtools/ --include='*.ts' --include='*.tsx'`
  returns 0.
- [X] T008 Run the full gate: `deno fmt && deno lint && deno check
  packages/devtools/middleware.ts packages/devtools/mod.ts
  packages/devtools/dashboard.tsx packages/devtools/tests/debug_panels.test.ts
  && deno task test`. Fix any red; do not declare done with red checks (hard rule
  #5). (plan SC-002, SC-004)

---

## Dependencies & order

- Phase 2 (T001, the declaration) **blocks** US1 (T002–T005 reference the new
  specifier) — `deno check` cannot resolve it otherwise.
- US1: T002, T003, T004, T005 are **[P]** — four independent files.
- US2: T006 verifies the graph; depends on T001.
- T007, T008 last.

## MVP

Phase 2 + US1 (T001–T005) is the shippable core: it removes every direct `hono`
import from devtools. US2 (T006) and Polish (T007–T008) verify the graph and the
gate.

## Task count

8 tasks — Foundational 1, US1 4, US2 1, Polish 2.
