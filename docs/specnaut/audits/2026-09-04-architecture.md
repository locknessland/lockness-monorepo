# Architecture audit — 2026-09-04

## Summary

- **Total findings: 5** (Critical: 0 · High: 0 · Medium: 5 · Low: 4 → Out of
  scope)
- **Codebase scope:** ~682 authored source files (515 `.ts` + 167 `.tsx`) across
  28 published packages, plus an `app/` template, `config/`, `scripts/`, and 207
  test files. Deno + TypeScript workspace monorepo.
- **Severity floor:** medium
- **Layer convention detected:** hexagonal-ish package DAG (foundation
  `contract`/`hono` → implementation → orchestration `core`), enforced by
  `deps.policy.jsonc` + `deno task deps:analyze`; `core` further splits into
  internal domain folders (`http/`, `routing/`, `exceptions/`, `view/`,
  `kernel/`).

**Overall verdict:** The architecture holds up well as a modern framework
foundation — the dependency DAG is genuinely acyclic, the soft-edge
(optional-package) contract is honored, and the inner layers are free of layer
violations, cycles, and implicit globals; every remaining finding is file-level
cohesion (divergent change / large file), none structural.

**Verified clean:**

- **Layer violations** — no inner-to-outer imports. Every apparent upward edge
  (`cli→core`, `devtools→core`, `vite→core`) resolved to test-string literals,
  JSDoc/comments, or the `vite/demo/` consumer app.
- **Circular dependencies** — `deps.policy.jsonc` `knownCycles` is empty;
  `core`'s edges to optional packages are all comments or dynamic
  `tryImportOptionalPackage('@lockness/…')` string arguments (soft edges), never
  static imports.
- **Ports/adapters & bounded-context** — the soft-edge mechanism is a correct
  ports-and-adapters seam.
- **Implicit globals in inner layers** — `contract` and `container` contain zero
  `Deno.*`/`process.*`/`globalThis.*`. `core`'s ~91 `Deno.*` uses sit in
  adapter-role folders (HTTP listener, FS controller-scan, custom-handler file
  lookup) — the adapter exemption applies.

---

## Critical

_None._

## High

_None._

## Medium

### 1. `packages/contract/routing/decorators.ts:1` — Divergent Change: five unrelated decorator families in one foundation file (930 LOC)

This zero-dependency foundation file declares routing verbs, middleware binding,
response caching, static-file serving, and throttling. Each evolves for a
different reason yet collides in one file that everything downstream imports.

- **Fix sketch:** Extract one module per concern family (`route_decorators.ts`,
  `middleware_decorators.ts`, `cache_decorators.ts`, `throttle_decorators.ts`,
  `static_decorator.ts`) and keep `decorators.ts` a thin re-export barrel. Split
  along reasons-to-change, not line count.

### 2. `packages/cli/commands/make_commands.ts:1` — Divergent Change / Large File: all `make:*` scaffolders in one file (896 LOC)

Every code-generation command lives in one module, so altering any single stub
type edits and re-tests the same file.

- **Fix sketch:** Give each `make:*` command its own file implementing a shared
  command interface, with a small registration index.

### 3. `packages/session/drivers/cookie.ts:123` — Large Class + module-level mutable rejection reporter (866 LOC, 3.5× the next driver)

Braids three responsibilities: crypto seal/open, the `CookieSessionDriver`
class, and a module-scoped mutable rejection tracker whose
`resetRejectionReporter()` test-reset export is the tell that hidden singleton
state exists.

- **Fix sketch:** Extract the crypto seal/open into a `cookie_seal.ts` value
  module and lift the rejection tracker into an injectable reporter object owned
  by the driver instance instead of module scope.

### 4. Implementation-in-`mod.ts` pattern — several packages carry their full public implementation in the barrel file (aggregate)

`validator/mod.ts` (742 LOC), `events/mod.ts` (760), `storage/mod.ts` (644),
`queue/mod.ts` (620), `logger/mod.ts` (556), `mail/mod.ts` (547) place the whole
implementation in `mod.ts` — inconsistent with `core`, `auth`, `session`, which
split into folders.

- **Fix sketch:** Move rules/sanitisers/drivers into named modules and reduce
  each `mod.ts` to re-exports. Treat `mod.ts` as the public-surface barrel only.

### 5. `packages/ui/mod.ts:70` — hardcoded component `REGISTRY` data table braided with `add`/`list` CLI logic (945 LOC)

The UI CLI entry point embeds a large literal `REGISTRY` inline with command
logic, even though `scripts/generate_ui_registry.ts` exists to produce it — easy
to drift from the components on disk.

- **Fix sketch:** Have the generator emit the registry to a dedicated
  `registry.generated.ts`, import it into `mod.ts`, and leave `mod.ts` as the
  CLI shell.

**Dismissed (exempt):** `core/app.ts` (676 LOC) is the
composition-root/bootstrap facade — churn is its job. `auth/types.ts` (756) and
`devtools/types.ts` are pure type declarations. The large
`ui/components/*/mod.tsx` files are cohesive single components.

---

## Out of scope

- **`registerCoreCommands(cli: any)` in `packages/core/mod.ts:227`** — `any` in
  an exported API breaches hard rule #3; a type-safety/code-reviewer concern
  rather than an architecture-boundary one. LOW.
- **Naming / public-surface consistency** — the barrel-vs-folder split
  (Finding 4) is the only divergence; otherwise conventions are uniform. LOW.
- **Anemic domain model** — not applicable: infrastructure framework with no
  business domain of its own.
- **Deep nesting** — spot-checks clean; not exhaustively measured (no complexity
  tool under the read-only contract).
- **Test isolation** — not deeply audited; the `resetRejectionReporter()` hook
  (Finding 3) is the one order-dependence signal observed.
- **`Deno.exit(1)` in `packages/core/http/server.ts:165`** — confined to the
  address-in-use fatal path in the server-listener adapter. Noted, LOW.

---

## Proposed backlog

### Epic A — Split the routing/decorator foundation by reason-to-change

- **Extract route-verb decorators into `route_decorators.ts`** — _(S)_
- **Extract middleware-binding decorators into `middleware_decorators.ts`** —
  _(S)_
- **Extract cross-cutting feature decorators (`cache_decorators.ts`,
  `throttle_decorators.ts`, `static_decorator.ts`)** — _(M)_
- **Reduce `contract/routing/decorators.ts` to a re-export barrel** — _(S)_

### Epic B — One file per CLI scaffolder

- **Define a shared `MakeCommand` interface and registration index** — _(S)_
- **Move each `make:*` command into its own file** — _(M)_

### Epic C — Normalise package public surfaces to thin barrels

- **Split `validator/mod.ts` into `rules/` + `sanitisers/` re-exported by a
  barrel** — _(M)_
- **Split `queue/`, `storage/`, `mail/`, `logger/`, `events/` implementation out
  of their `mod.ts`** — _(L)_
- **Document the "mod.ts is a barrel" rule in the contribution guide** — _(S)_

### Epic D — Harden the cookie session driver

- **Extract cookie seal/open crypto into `cookie_seal.ts`** — _(S)_
- **Move the rejection reporter from module scope onto the driver instance** —
  _(M)_

### Epic E — Generate the UI component registry

- **Emit `REGISTRY` to a generated data module via
  `scripts/generate_ui_registry.ts`** — _(M)_
- **Reduce `ui/mod.ts` to the CLI shell importing the generated registry** —
  _(S)_
