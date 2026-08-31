# ADR 001 — Dependency integrity and per-package agent knowledge

**Status:** Proposed **Date:** 2026-08-31 **Owner:** Kevin **Supersedes:**
nothing **Affects:** `scripts/deps_analyzer.ts`, `.github/workflows/test.yml`,
`packages/container/`, every `packages/*/AGENTS.md`

---

## 1. Problem statement

`deno task deps:analyze` prints `✅ No circular dependencies detected` and exits
0. It is measuring a graph that does not exist. `parsePackage()` in
`scripts/deps_analyzer.ts` reads each package's own `deno.json` `imports` map
and nothing else — it never opens a source file.
`packages/drizzle/install.ts:21` statically imports `@lockness/cli`;
`packages/drizzle/deno.json` declares only `@std/path`, `drizzle-orm` and
`postgres`. The analyzer therefore records drizzle as having zero `@lockness`
dependencies, and `docs/dependencies.md` — which it generates — says so in
print.

The guard is also absent from CI (`.github/workflows/test.yml` runs lint, check,
fmt, test — `deps:analyze` appears nowhere under `.github/`), and the fmt step
runs `deno fmt` rather than `deno fmt --check`, so it reformats the runner's
checkout and can never fail.

The real graph is currently acyclic, so nothing is on fire. What is broken is
the instrument: a regression that introduces a genuine cycle would be reported
as green, in CI and locally, with a checkmark.

Separately, the framework's tiering (foundation → implementation →
orchestration) exists only as prose, and prose has already drifted:
`packages/scheduler/AGENTS.md` states the package imports "**Nothing else** — no
`hono`, and never `@lockness/core`", which is true today only because nobody has
broken it. And `.claude/CLAUDE.md` advertises the container as offering
"circular-dependency detection", which it does not.

---

## 2. What I verified, and one correction

| Fact                                                | Verdict        | Note                                                                                                                                                                               |
| :-------------------------------------------------- | :------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Guard reads only `deno.json` imports             | **Confirmed**  | `scripts/deps_analyzer.ts:29-69`. Mechanism correction below.                                                                                                                      |
| 2. Real graph currently acyclic                     | **Confirmed**  | Every `@lockness/core` / `@lockness/drizzle` hit in `packages/cli/mod.ts` and `packages/scheduler/*.ts` is inside a JSDoc `@example`. Real edges are few and clean.                |
| 3. Guard not in CI, `deno fmt` not `--check`        | **Confirmed**  | `.github/workflows/test.yml:39-40`.                                                                                                                                                |
| 4. Container has no cycle detection                 | **Confirmed**  | `packages/container/errors.ts` exports only `ServiceNotFoundError`. But the framing needs adjusting — see §6.                                                                      |
| 5. Layering documented, unenforced                  | **Confirmed**  | —                                                                                                                                                                                  |
| 6. Every package has an `AGENTS.md`, uneven quality | **Confirmed**  | `packages/scheduler/AGENTS.md` is the target quality; `packages/queue/AGENTS.md` is the floor.                                                                                     |
| 7. Agent-memory convention exists                   | **Confirmed**  | `.claude/agents/product-owner/memory/` — frontmatter + `[[wikilinks]]` + a curated index.                                                                                          |
| **JSR breakage for consumers**                      | **Unverified** | Plausible, not established. jsr.io and api.jsr.io both return 403 to this environment, and `deno.lock` contains no `jsr:@lockness/*` entries at all. Decisive 5-minute test in §8. |

**Correction to Fact 1's mechanism.** The undeclared imports are not resolved by
the root import map. Root `deno.jsonc` `imports` maps only `@lockness/core`,
`contract`, `drizzle`, `ui` — and maps them to `jsr:` specifiers.
`@lockness/cli` is absent. Resolution comes from **Deno workspace member
resolution by package `name`**, which shadows the `jsr:` mappings entirely
(hence zero `@lockness` entries in `deno.lock`). This matters: workspace-member
resolution is a resolution context that a JSR consumer does not have, which is
precisely why the drift is invisible in-repo and why the JSR question in §8 is
worth settling rather than assuming.

**A second correction, to the tooling premise.** A line-anchored regex over
source is not a viable parser here. `packages/core/mod.ts:209` and `:219` close
a multi-line `export { … } from '@lockness/scheduler'` clause — the specifier
sits on a line beginning with `}`. `packages/container/types.ts:13` uses
`import('@lockness/contract').Constructor<T>` in _type position_. Both are real
edges a naive scanner reports wrong in opposite directions.

---

## 3. Goals

1. `deps:analyze` measures the graph that actually executes, and fails CI when
   it regresses.
2. Every real edge is declared in the owning package's own `deno.json`.
3. The tier policy is machine-readable and has exactly one home.
4. Every `packages/*/AGENTS.md` follows one schema written for a coding agent,
   not a human evaluating the library.
5. The container's advertised behaviour matches its actual behaviour.

## 4. Non-goals

- Breaking any current edge. The graph is fine; only the instrument changes.
- Constructor injection or container lifetimes. Out of scope.
- Rewriting `docs/dependencies.md` by hand — it stays generated.
- Any new runtime dependency edge. This ADR adds zero.

---

## 5. Architecture

### 5.1 The edge taxonomy is the whole design

The reason a single tool cannot do this is that this repo contains five kinds of
`@lockness → @lockness` reference, and they need different verdicts:

| Class             | Example                                                                                                                         | Seen by `deno info`? | Cycle verdict                |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------ | :------------------- | :--------------------------- |
| `runtime`         | `packages/drizzle/install.ts:21` — `import { addPackage } from '@lockness/cli'`                                                 | Yes                  | **error**                    |
| `type`            | `packages/openapi/cli_commands.ts:1` — `import type { Cli }`                                                                    | Yes, flagged as type | **warn** (erases, but binds) |
| `dynamic-literal` | `packages/cli/commands/queue_commands.ts:97` — `await import('@lockness/queue')`                                                | Yes, flagged dynamic | **error**                    |
| `soft` (declared) | `packages/core/kernel/bootstrap/steps/database.ts:36` — the specifier is a **string argument** to `tryImportOptionalPackage(…)` | **No — invisible**   | allowed, must be declared    |
| `test` / `stub`   | `packages/core/tests/schedule_discovery.test.ts:11`; `packages/cli/stubs/**`                                                    | Only if pointed at   | **warn** / ignore            |

The `soft` row is the load-bearing one. Core reaches `drizzle`, `cache`,
`session` and `events` through `tryImportOptionalPackage('<literal>', …)` — the
specifier never appears inside an `import()` expression, so **no static tool
will ever see these edges**, and they are exactly the tier-violating ones (an
orchestration package reaching a feature package). They cannot be parsed. They
must be _declared_.

`packages/cli/package_loader.ts:68` (`await import(fullPackageName)`, name read
from a user app's `lockness.packages`) is genuinely unanalysable and is excluded
by design.

### 5.2 One script, three checks

Replace the graph source in `scripts/deps_analyzer.ts`; keep its markdown
generator.

| Check                    | Source                                                                                                                      | Fails on                                                              |
| :----------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **A. Cycles**            | `deno info --json` per package over entry points = `exports` values ∪ `tests/**/*.test.ts`, union the declared `soft` edges | any cycle among `runtime` ∪ `dynamic-literal` ∪ declared `soft` edges |
| **B. Declaration drift** | edges from A vs. the package's own `deno.json` `imports`                                                                    | any real edge not declared by its owner                               |
| **C. Tier policy**       | edges from A vs. `deps.policy.jsonc`                                                                                        | any edge whose target is not in the source's allowlist                |

`deno info --json` gives resolved specifiers plus per-dependency `type` /
`dynamic` flags, which is exactly the taxonomy above minus the `soft` row. It
also gets multi-line export clauses and type-position imports right for free.

### 5.3 The policy file

One home, machine-read, repo root: **`deps.policy.jsonc`**.

```jsonc
{
    "tiers": { "foundation": 0, "implementation": 1, "orchestration": 2 },
    "packages": {
        "contract": { "tier": "foundation", "allow": [] },
        "hono": { "tier": "foundation", "allow": [] },
        "container": { "tier": "foundation", "allow": ["contract"] },
        "scheduler": {
            "tier": "implementation",
            "allow": ["contract", "container"]
        },
        "core": {
            "tier": "orchestration",
            "allow": [
                "contract",
                "hono",
                "container",
                "events",
                "scheduler",
                "deprecation-contracts"
            ],
            "soft": ["drizzle", "cache", "session", "events"]
        }
    }
}
```

`allow` is the exhaustive set of static edges. `soft` is the exhaustive set of
`tryImportOptionalPackage` targets — declaring them here is what makes the
invisible edges visible to check A, and what stops someone quietly adding a
sixth. `docs/dependencies.md` remains the **generated output**; this file is the
**hand-written input**. The prose tier list in `.claude/CLAUDE.md` is replaced
by a pointer to it.

### 5.4 CI

Add to `.github/workflows/test.yml`, and change `deno fmt` → `deno fmt --check`
in the same commit (that one is a two-character fix for a step that currently
cannot fail).

---

## 6. Decisions

### D1 — Graph from `deno info --json` + a declared soft-edge list

| Rejected                         | Why                                                                                                                                                                                                                                                     |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep reading `deno.json` imports | That is the bug.                                                                                                                                                                                                                                        |
| Hand-rolled regex/AST scanner    | Regex demonstrably wrong on `packages/core/mod.ts:209` (multi-line clause) and `packages/container/types.ts:13` (type-position import). An AST pass would work but re-implements what `deno info` already ships, and still cannot see the `soft` edges. |
| `deno info` alone                | Blind to the four `tryImportOptionalPackage` edges — the ones most likely to violate tiering.                                                                                                                                                           |
| Declared list alone              | Declarations rot silently; that is the current failure mode with a different file name.                                                                                                                                                                 |

### D2 — Declaration drift is an error, not a warning

Independent of the JSR question, an undeclared dependency means the package's
manifest lies about what it needs, and check C cannot be trusted if check B is
soft. Cost is one line per package. Roll out warn-only for one PR to size the
fix, then flip to error in the same week — not "eventually".

### D3 — Tier policy in `deps.policy.jsonc` at repo root

| Rejected                                    | Why                                                                                                                                                                   |
| :------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A custom key in each `packages/*/deno.json` | 27 homes, no global view, and it cannot express "who may import **me**" — the direction that actually protects `contract`.                                            |
| Prose in `.claude/CLAUDE.md`                | Already drifted (`packages/scheduler/AGENTS.md` asserts an invariant nothing checks).                                                                                 |
| Extend `docs/dependencies.md`               | It is generated output. Making it also an input guarantees the generator overwrites the policy.                                                                       |
| Reuse `lockness.packages` in `deno.jsonc`   | Different concept — it is the _end-user app's_ installed optional packages, consumed by `packages/cli/package_loader.ts`. Overloading it conflates app and framework. |

### D4 — Add the container guard, and fix the false claim regardless

The claim is false, but the framing needs care. `container.get()`
(`packages/container/container.ts:60-67`) constructs via `new token()` with **no
constructor injection at all**, and `@Inject`
(`packages/container/decorators.ts:96-105`, `:113-125`) installs a **lazy,
cached property getter**. So a service cycle `A → B → A` does **not** blow up: B
is constructed only when the property is first _read_. The decorator's own JSDoc
says this is deliberate — "avoiding circular dependency issues" — and that
sentence is almost certainly where CLAUDE.md's claim came from.

The honest statement is: **lazy injection tolerates cycles; it does not detect
them.** The one case that still breaks is a constructor that eagerly reads an
injected property whose graph loops back — which yields
`RangeError: Maximum call stack size exceeded` and names nothing.

Recommendation: add a resolution-stack guard on the **construction path only**
(the `new token()` branch), throwing `CircularDependencyError` with the token
chain. ~20 lines plus an error class. It is worth it not because cycles are
common but because the failure it replaces is unnameable, and it fires in _user
application_ service graphs, which no amount of package-level static analysis
can reach. Rejected: leaving it out and relying on static analysis — wrong
layer, different graph. Rejected: a guard on the lazy getter path — the cycle is
not on the stack there, and the laziness is the feature.

Either way, `.claude/CLAUDE.md`'s container bullet changes from
"circular-dependency detection" to the accurate wording. That edit ships even if
the guard does not.

### D5 — One parameterised `package-expert`, not 27 agents

| Rejected                                  | Why                                                                                                                                                                                                                             |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 27 agent definitions in `.claude/agents/` | 27 near-identical files to drift. Worse, every definition's `description` is loaded for dispatch selection — 27 interchangeable descriptions degrade routing for the seats that matter (`architect`, `developer`, `qa-tester`). |
| Claude Code **agent teams**               | Confirmed constraint: team config is deleted at session end and teammates carry no persistent memory. Correct mechanism for parallel work, wrong one for durable knowledge.                                                     |
| No per-package agent at all               | Loses the win. `packages/scheduler/AGENTS.md`'s pitfalls (the `2^31 - 1` `setTimeout` overflow, leaked timers not failing `Deno.test`) are exactly the knowledge that gets rediscovered expensively.                            |

One durable `.claude/agents/package-expert.md` that takes a package name, reads
`packages/<name>/AGENTS.md` + `deps.policy.jsonc` + `mod.ts`, and works inside
that boundary.

### D6 — Per-package knowledge lives in the repo, in `AGENTS.md`, and nowhere else

| Rejected                                | Why                                                                                                                                                                                                                                                                                                |
| :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/agents/<pkg>/memory/`          | Separates the fact from the code it describes — renaming or deleting a package orphans it silently. `.claude/` is also Specnaut-managed territory (`deno fmt` already excludes it; `specnaut upgrade` has clobbered files there before). And reviewers do not read `.claude/` during a package PR. |
| `packages/<pkg>/.agent/memory/` + index | A second home per package, plus 27 index files to prune. The whole value of `AGENTS.md` is that there is one file to open.                                                                                                                                                                         |

Clean split, one rule: **role knowledge** (how the PO uses `gh`) stays in
`.claude/agents/<role>/memory/`. **Package knowledge** goes in
`packages/<pkg>/AGENTS.md`, versioned, reviewed in the PR that caused it,
deleted with the package. If a package's brief exceeds ~120 lines, split to
`packages/<pkg>/docs/` — do not add a memory dir.

---

## 7. The `AGENTS.md` schema

What a README does not carry, and a coding agent needs: what must stay true,
what it must not import, where each decision lives, and which mistakes have
already been paid for. `packages/scheduler/AGENTS.md` is roughly this already —
formalise it.

```markdown
# @lockness/<name> — agent brief

<2–4 sentences: what it does and the two or three constraints that shape it (UTC
only, in-process only, no HTTP surface). Not a feature list.>

## Invariants

<Statements that must stay true, each with the failure if broken. "Times are UTC
only — a local-time expression silently fires at the wrong hour.">

## Dependency contract

| Direction | Packages | | Imports (static) | … | | Imports (soft, via
tryImportOptionalPackage) | … | | Imported by | … | | **Must never import** | …
and why |
<Must match deps.policy.jsonc. CI check C is the enforcement.>

## Public surface

| Export | What it is |
<Only what mod.ts exports. Anything else is internal and free to change.>

## Where to work

| Change | File | <Intent → path. The single highest-value section: it is what
stops an agent grepping 90 files.>

## Pitfalls

<Each: mechanism, when measured, what it cost. No generic advice. "setTimeout
overflows above 2^31-1 ms — Deno clamps to 1 ms and a yearly task fires in a
tight loop. Measured 2.9.6. timer_registry.ts caps at 24 days.">

## Tests

<Entry points, fakes to use, what is deliberately untested.>

## Before you call it done

<Package-specific gate beyond the framework-wide one.>
```

Two rules: **Pitfalls entries carry a mechanism and a date** — an entry that
could have been guessed does not belong. **Dependency contract is generated-
checkable** — CI check C reads the policy file, and a mismatch between the brief
and the policy is a docs bug to fix, not prose to trust.

---

## 8. Pre-requisites and open questions

1. **Settle the JSR question before D2 is justified on JSR grounds** (it is
   already justified on manifest-honesty grounds). Two commands, no guessing:
   - `cd packages/drizzle && deno publish --dry-run` — does it warn or error on
     the undeclared `@lockness/cli`?
   - In a temp dir **outside** the workspace: `deno check` a file containing
     `import 'jsr:@lockness/drizzle@0.2.0/install'`. If that resolves,
     `@lockness/cli` is reachable for consumers and the JSR risk is nil; if it
     fails, `@lockness/drizzle@0.2.0` is **already broken on JSR today** and
     this becomes a bug ticket, not an ADR item. I could not run this: jsr.io
     and api.jsr.io return 403 here, and `deno.lock` has no `jsr:@lockness/*`
     entries because workspace members shadow the `jsr:` mappings in root
     `deno.jsonc`.
2. **Enumerate the `soft` edges exhaustively** before writing the policy file —
   `rg 'tryImportOptionalPackage' packages/` currently shows `database`,
   `cache`, `session`, `events` bootstrap steps. Missing one turns check C into
   a false failure on day one.
3. **Sequencing.** The CI wiring and the `deno fmt --check` fix are independent
   of everything else and should ship first — they are small and they make every
   later step verifiable.

## 9. Out of scope

Constructor injection; container lifetimes/scopes; splitting `@lockness/core`;
publishing changes; rewriting the 27 briefs in one pass (schema first, then a
brief per PR that touches its package).

## 10. Risks

| Risk                                                                     | Mitigation                                                                                                                    |
| :----------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| `deno info --json` output shape changes across Deno versions             | Pin the parse to `dependencies[].code.specifier` / `.type`; one integration test with a fixture.                              |
| Check C fires false positives from missed `soft` edges                   | Pre-requisite 2. Ship C warn-only for one PR.                                                                                 |
| 27 briefs rewritten to schema, then rot again                            | Dependency contract section is CI-checked; the rest is reviewed in the PR that changes the package.                           |
| The container guard changes behaviour for an app relying on a live cycle | Guard fires only on the eager-constructor path, which today produces a stack overflow — no working code depends on it.        |
| `deps.policy.jsonc` becomes a rubber stamp people widen to go green      | Policy edits are a `chore(deps)` commit of their own, reviewed on their own — never bundled with the change that needed them. |
