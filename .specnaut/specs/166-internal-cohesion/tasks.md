# Tasks — Internal cohesion refactors (epic #225)

Derived from the approved `plan.md` (which executes the 2026-09-04 architecture
audit). Each child = **one commit** on branch `166-internal-cohesion`:
`refactor(<scope>): … (#NNN)` with an `Epic: #225` trailer. Flat merge.

**Invariant on every task (FR-002/003/004):** no behavior change, public surface
byte-identical, DAG diff-clean. Existing tests are the safety net — a green
`deno task test` for the touched package(s) is the proof each move preserved
behavior; add a targeted test only where a *new* seam appears (#236 reporter).

## Group A — routing/decorator foundation (`@lockness/contract`)

- [ ] **T-A1 (#226)** Extract route-verb decorators → `contract/routing/route_decorators.ts`.
- [ ] **T-A2 (#227)** Extract middleware-binding decorators → `middleware_decorators.ts`.
- [ ] **T-A3 (#228)** Extract cache/throttle/static → `cache_decorators.ts`,
  `throttle_decorators.ts`, `static_decorator.ts`.
- [ ] **T-A4 (#229)** Reduce `decorators.ts` to a pure re-export barrel.

## Group B — CLI scaffolders (`@lockness/cli`)

- [ ] **T-B1 (#230)** Define `MakeCommand` interface + registration index under `commands/make/`.
- [ ] **T-B2 (#231)** Move each `make:*` command into its own file; `make_commands.ts` becomes the barrel.

## Group C — thin barrels

- [ ] **T-C1 (#232)** Split `validator/mod.ts` into `rules/` + `sanitisers/`, barrel re-exports.
- [ ] **T-C2 (#233)** Split `{queue,storage,mail,logger,events}/mod.ts` implementation into named modules.
- [ ] **T-C3 (#234)** Document the "mod.ts is a barrel" rule in `docs/contribution.md`.

## Group D — cookie session driver (`@lockness/session`)

- [ ] **T-D1 (#235)** Extract cookie seal/open crypto → `drivers/cookie_seal.ts` value module.
- [ ] **T-D2 (#236)** Lift the module-scoped rejection reporter onto the driver instance;
  remove `resetRejectionReporter()`; migrate tests to the instance seam.

## Group E — UI registry (`@lockness/ui`)

- [ ] **T-E1 (#237)** Have `scripts/generate_ui_registry.ts` emit `registry.generated.ts`;
  diff the generated output against the inline literal before deleting it.
- [ ] **T-E2 (#238)** Reduce `ui/mod.ts` to the CLI shell importing the generated registry.

## Dependencies & order

```
A1 → A2 → A3 → A4        (A4 barrel last)
B1 → B2                  (B2 barrel last)
C1 ; C2 ; C3             (independent)
D1 → D2
E1 → E2
```

Groups are cross-package independent. Per-child gate before commit:
`deno fmt && deno lint && deno check <touched> && deno test -A <package>` +
`deno task deps:analyze`. Full-workspace gate before the review handoff.
