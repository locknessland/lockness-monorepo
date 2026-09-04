# Plan: Internal cohesion refactors

**Branch**: `166-internal-cohesion` | **Date**: 2026-09-04 | **Backlog item**:
[#225 — Internal cohesion refactors](https://github.com/locknessland/lockness-monorepo/issues/225)

**This is the feature's one planning document.** It is not greenfield: it is the
direct execution of the approved architecture audit
[`docs/specnaut/audits/2026-09-04-architecture.md`](../../../docs/specnaut/audits/2026-09-04-architecture.md),
whose five Medium findings became epic #225 and its thirteen children (#226–#238).
The audit is the design; this document binds it into a decision table and an
invariant contract for the refactor.

---

## 1. Why this exists

The 2026-09-04 architecture audit found the dependency DAG genuinely acyclic and
the layers free of violations — **every** remaining finding is file-level
cohesion (divergent change / large file), none structural. Five files braid
unrelated reasons-to-change into one module, so a change to any one concern edits
and re-tests code that has nothing to do with it:

| File | LOC | Braided concerns |
| :--- | ---: | :--- |
| `packages/contract/routing/decorators.ts` | 930 | 5 unrelated decorator families in a zero-dep foundation file everything imports |
| `packages/cli/commands/make_commands.ts` | 896 | every `make:*` scaffolder in one module |
| `packages/session/drivers/cookie.ts` | 866 | crypto seal/open + driver class + module-scoped mutable rejection tracker |
| `packages/{validator,events,storage,queue,logger,mail}/mod.ts` | 547–760 | full implementation living in the public-surface barrel |
| `packages/ui/mod.ts` | 945 | a large literal component `REGISTRY` braided with `add`/`list` CLI logic |

## 2. User scenarios

The "user" is a framework maintainer changing one concern.

### US1 — change one decorator family without touching the others (P1)

**Given** the routing decorators are split by concern
**When** a maintainer edits the throttle decorator
**Then** only `throttle_decorators.ts` changes; route/middleware/cache/static
modules and their tests are untouched, and the public import surface
(`@lockness/contract`) is byte-identical.

### US2 — add a `make:*` command without re-testing the others (P2)

**Given** each scaffolder is its own file behind a registration index
**When** a maintainer adds or edits one command
**Then** only that command's file and the index change.

### US3 — read a package's public surface from its `mod.ts` alone (P2)

**Given** `mod.ts` is a thin barrel
**When** a maintainer opens `validator/mod.ts` (or events/storage/queue/logger/mail)
**Then** they see re-exports, not implementation, and the implementation lives in
named modules.

## 3. Requirements

- **FR-001** Each large/divergent file is split along reasons-to-change into
  cohesive modules, with the original path kept as a thin re-export barrel.
- **FR-002** **No behavior change.** Every existing test passes unchanged; no test
  is weakened to accommodate a move.
- **FR-003** **Public surface intact.** Every name previously exported from a
  touched barrel is still exported from the same specifier, unchanged in type.
- **FR-004** **DAG intact.** `deno task deps:analyze` reports the same graph; no
  new cross-package edge, no new cycle.
- **FR-005** The "mod.ts is a barrel" rule is documented in the contribution
  guide (#234).
- **FR-006** The cookie driver's module-scoped mutable rejection reporter becomes
  instance-owned state (#236); the `resetRejectionReporter()` test-reset export —
  the tell of a hidden singleton — is removed or made unnecessary.
- **FR-007** The UI `REGISTRY` is emitted by `scripts/generate_ui_registry.ts`
  into a generated module and imported, not inlined (#237/#238).

## 4. Success criteria

- **SC-001** `deno fmt && deno lint && deno check && deno task test` green on the
  whole workspace after every child.
- **SC-002** `deno task deps:analyze` diff-clean against `main`.
- **SC-003** No touched barrel loses an export (verified by `deno check` of the
  package's own consumers + the surface remaining importable).
- **SC-004** Every split file drops below the audit's cohesion concern; no target
  module re-braids two of the original concerns.

## 5. The binding decision table

The 🔒 homes are binding. Injection of a concern into a new module never changes
where the concern is *imported from* (the barrel), only where it is *defined*.

| # | Child | Source file | Target modules (defined) | Barrel (re-exports) |
| :--- | :--- | :--- | :--- | :--- |
| #226 | route verbs | `contract/routing/decorators.ts` | `route_decorators.ts` | `decorators.ts` |
| #227 | middleware binding | ″ | `middleware_decorators.ts` | ″ |
| #228 | cache/throttle/static | ″ | `cache_decorators.ts`, `throttle_decorators.ts`, `static_decorator.ts` | ″ |
| #229 | barrel | ″ | — | `decorators.ts` → pure re-export |
| #230 | shared shape | `cli/commands/make_commands.ts` | `make/types.ts` (`MakeCommand`), `make/index.ts` (registry) | `make_commands.ts` |
| #231 | one file per command | ″ | `make/<name>.ts` per `make:*` | `make_commands.ts` |
| #232 | validator split | `validator/mod.ts` | `rules/`, `sanitisers/` | `mod.ts` |
| #233 | barrel-ise impl | `{queue,storage,mail,logger,events}/mod.ts` | named impl modules per package | each `mod.ts` |
| #234 | doc the rule | — | `docs/contribution.md` | — |
| #235 | cookie crypto | `session/drivers/cookie.ts` | `cookie_seal.ts` | `cookie.ts` |
| #236 | rejection reporter | ″ | instance field on `CookieSessionDriver` | ″ |
| #237 | generate registry | `ui/mod.ts` | `registry.generated.ts` (via `scripts/generate_ui_registry.ts`) | — |
| #238 | ui barrel/shell | `ui/mod.ts` | imports generated registry | `mod.ts` = CLI shell |

## 6. Constitution & hard-rules check

- Hard rule #1 (no direct `hono`), #2 (JSR-only, bare in source): a move never
  introduces a new import path; specifiers are copied verbatim to the new module.
- Hard rule #3 (no `any` in exported APIs): the audit's LOW `registerCoreCommands(cli: any)`
  is **out of scope** here (a code-reviewer concern, not a cohesion split).
- Hard rule #5 (pre-completion gate): run per child before its commit.
- Hard rule #7 (JSDoc on public APIs): moved public members carry their JSDoc with
  them; the barrel keeps `@module`/re-export docs.
- Hard rule #8 (MVC layering): unaffected — no layer crossing is introduced.

## 7. Public surfaces touched

`@lockness/contract` (decorators barrel), `@lockness/cli` (make commands),
`@lockness/validator`, `@lockness/events`, `@lockness/storage`, `@lockness/queue`,
`@lockness/logger`, `@lockness/mail` (each `mod.ts`), `@lockness/session`
(cookie driver — internal, not a barrel export), `@lockness/ui` (CLI + registry).
In every case the *external* surface is held constant by FR-003.

## 8. Risks & mitigations

| Risk | Mitigation |
| :--- | :--- |
| A move silently drops an export | `deno check` the whole workspace + FR-003 export-parity check per barrel |
| A move introduces a cross-package edge | `deno task deps:analyze` diff-clean (SC-002) |
| Cookie reporter instance-migration changes observable reset behavior | keep the same rejection-reporting output; migrate tests to the instance seam, do not delete the assertions (#236) |
| UI generated registry drifts from inline one | generate once, diff the generated output against the previous inline literal before deleting it (#237) |
| Circular import via a new intra-package module | new modules depend inward only (types ← impl ← barrel), never barrel ← impl |

## 9. Plan audits

This plan needs no fresh architect/security audit pair: it **is** the execution of
the architecture audit dated 2026-09-04, whose verdict ("architecture holds up
well … every remaining finding is file-level cohesion, none structural") is the
approved design. Security surface is unchanged by definition (FR-002/FR-003) — no
new input, authz, or crypto path is introduced; #235 *moves* existing seal/open
crypto without altering it, and #236 changes only where reporter state lives, not
what it reports.

## 10. Sequencing

Groups are independent across packages and can land in any order; within a group,
follow the DAG in `tasks.md`. Each child is **one commit** on this branch carrying
an `Epic: #225` trailer; the epic merges **flat** (not squashed) so each child's
commit survives, and closes its children on merge.

## 11. Out of scope

The audit's exempt files: `core/app.ts` (composition root), `auth/types.ts` and
`devtools/types.ts` (pure types), cohesive `ui/components/*/mod.tsx`. The LOW
findings (`registerCoreCommands(cli: any)`, `Deno.exit` in the server adapter)
stay in the backlog as separate type-safety items.

## 12. Open questions

None. The decision table is fully determined by the audit's fix sketches; Q&A
happened when the audit was accepted and the epic was groomed.
