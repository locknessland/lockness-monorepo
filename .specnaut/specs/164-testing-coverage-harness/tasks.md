---
description: "Epic breakdown — fill coverage gaps & ship a shared testing harness (#179)"
---

# Tasks: Fill coverage gaps & ship a shared testing harness (epic #179)

**Input**: `plan.md` in this directory. **This is an epic** — the breakdown is the child list in dependency order; each child is **one commit** on the epic branch `164-testing-coverage-harness`, carrying its own issue number and an `Epic: #179` trailer (`phases/epic-commits.md`). The fast gate runs after each child; the last child's review is the single stop before the flat epic merge.

**Tests**: the deliverable of most children *is* tests; TDD applies where a child ships production code (#180's seams, #185's helpers).

## Dependency order (MVP first)

```
#185 harness ──▶ #181 contract ──▶ #180 drizzle(+seams)
      │                                   │
      └──────────▶ #182, #183, #184 (use the harness) ──▶ #186 docs+rename (last)
```

`#185` lands first so the later test children can adopt `testClient`. `#186` (rename + docs) lands last to avoid churn mid-epic.

---

## Child #185 — @lockness/testing (internal, unpublished) 🎯 MVP

- [ ] T001 Scaffold `packages/testing/` — `deno.json` (name `@lockness/testing`, exports `./mod.ts`, deps declared from JSR: auth, session, drizzle, hono, contract, @std/assert; **no publish** — excluded from the publish set), `mod.ts` (`@fileoverview`/`@module`, "test-only" banner), `README.md`, `AGENTS.md`.
- [ ] T002 Register in the workspace: add `packages/testing` to `deno.jsonc` `workspace`; add its `deps.policy.jsonc` entry (allow: auth, session, drizzle, hono, contract).
- [ ] T003 [P] TDD `testClient(app)` wrapping `app.request` (get/post/json helpers, header/cookie support) in `packages/testing/http_client.ts` + `tests/`.
- [ ] T004 [P] TDD `actingAs(user)` — sets identity **only on the test client's request context** (never mints a session/token), plus common in-memory fakes, in `packages/testing/acting_as.ts` + `tests/`.
- [ ] T005 [P] TDD DB assertions (e.g. `assertRowExists`) against a fake connection in `packages/testing/db_assertions.ts` + `tests/`.
- [ ] T006 Export the public surface from `mod.ts`; `deno task deps:analyze` green (no cycle); fast gate.

## Child #181 — re-export contract tests for hono + core

- [ ] T007 Generate a committed baseline snapshot of `@lockness/hono` `mod.ts` export surface (names + kinds) via SEARCH; store under `packages/hono/tests/`.
- [ ] T008 TDD `packages/hono/tests/reexport_contract.test.ts` — diff the live surface against the baseline; a dropped/renamed/retyped export fails. Spike: deleting one export goes red (SC-001).
- [ ] T009 Same for `@lockness/core` in `packages/core/tests/reexport_contract.test.ts` (baseline + diff). Fast gate.

## Child #180 — drizzle db:* + install (three seams)

- [ ] T010 Refactor `registerDrizzleCommands` (`packages/drizzle/cli_commands.ts`) to inject three ports: the existing `Database` connection, a **command-runner** port (wrapping `new Deno.Command`), and a **seeder-loader** port (replacing `db:seed`'s dynamic import). Keep default production wiring intact.
- [ ] T011 TDD the six shell-out commands (`db:generate/migrate/push/studio/status/fresh`) by **asserting the constructed `drizzle-kit` argv** via a fake command-runner — never executing. `db:check` via fake connection; `db:seed` via fake seeder-loader.
- [ ] T012 TDD `install.ts` coverage. Hermetic — synthetic credentials only, sanitizers on. Fast gate.

## Child #182 — auth-provider providers (fail-closed)

- [ ] T013 TDD base + drizzle + kysely providers, asserting **deny paths** for every kind (basic-auth unknown/mismatch; token invalid/expired/revoked → null; session unknown → null) and that the insecure `plain === hash` default is overridden. Use `@lockness/testing` fakes. Fast gate.

## Child #183 — openapi doc generation

- [ ] T014 TDD `packages/openapi/generator.ts` against route-metadata fixtures; assert the emitted OpenAPI document shape. Fast gate.

## Child #184 — ui stateful components

- [ ] T015 TDD the stateful components — Modal, Tabs, Accordion, Pagination, Table — in `packages/ui/tests/`, using `@lockness/testing` where useful. Fast gate.

## Child #186 — docs + rename (last)

- [ ] T016 `git mv` the 13 `_test.ts` → `.test.ts` (vite 10, markdown 2, container 1); grep for stray `_test.ts` references; `deno task test` + coverage globs green.
- [ ] T017 Expand `docs/testing.md`: naming, FakeTime, sanitizer + mock policy, the `@lockness/testing` HTTP-client helper, synthetic-credentials-only fixtures, and that `@lockness/testing` is test-only. Fast gate. *(docs commit)*

---

## Notes

- **Decision-table homes** (plan §5) are binding: matcher/union/actingAs-injection/fake-DB seams each have one home; a task may not spell one twice.
- **Not owned here** (follow-ups): migrating the ~20 existing hand-rolled `app.request` sites to `testClient` (A3); hardening `defaultVerifyPassword` (→ #164 line).
- Each child ends with the **fast** gate; the **full** gate runs once before the epic merge.
