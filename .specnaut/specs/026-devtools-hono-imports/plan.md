# Plan: Rewrite type-only `hono` imports in devtools to `@lockness/hono`

**Linked issue**: #160
**Branch**: `026-devtools-hono-imports`
**Kind**: refactor (source-spelling only, no behaviour change)

---

## 1. Why this exists

Hard rule #1 (mirrored in the constitution) forbids importing `hono` directly —
every consumer imports the pinned bridge `@lockness/hono` (or `@lockness/core`).
`@lockness/devtools` still carries **three** type-only `from 'hono'` import
statements plus **one runtime** one in its test file. The runtime hazard is
already contained: `packages/devtools/deno.json` aliases the bare specifier
`"hono"` → `jsr:@lockness/hono@^0.2.0`, so the imports already resolve to the
bridge. This is therefore a **cosmetic / consistency** fix — it aligns the
source spelling with the hard rule and stops the pattern being copied into new
devtools code. Surfaced by the #149 architect audit.

**Measurement**: `grep -rn "from 'hono'" packages/devtools/` returns 4 hits
today (3 type-only source, 1 runtime test); the feature is done when it returns
**0** (excluding `EXAMPLES.md`, see §12 D3).

## 2. User scenarios

Actor: a Lockness contributor writing or reviewing devtools code.

- **P1 — the spelling matches the rule.** Given a contributor greps devtools for
  direct `hono` imports / When they run `grep "from 'hono'" packages/devtools/`
  / Then they find none in source or tests, so nothing wrong is there to copy.
- **P2 — the dependency is declarable.** Given devtools is published to JSR /
  When a consumer resolves it / Then `@lockness/hono` is a declared, pinned
  dependency in `packages/devtools/deno.json`, not only reachable through the
  `"hono"` alias.

Edge cases:
- **JSX still resolves.** `dashboard.tsx` renders JSX under
  `jsxImportSource: "hono"`; the injected `hono/jsx-runtime` import must keep
  resolving after the change.
- **`Hono` value export.** The test file imports `Hono` as a **value** (`new
  Hono()`), not a type — the bridge must re-export it as a value (it does, via
  `export * from 'hono'`).

## 3. Requirements

- **FR-001** — `packages/devtools/middleware.ts` imports `Context` and
  `MiddlewareHandler` from `@lockness/hono`, not `hono`.
- **FR-002** — `packages/devtools/mod.ts` imports `Hono` (type) from
  `@lockness/hono`, not `hono`.
- **FR-003** — `packages/devtools/dashboard.tsx` imports `Context` from
  `@lockness/hono`, not `hono`.
- **FR-004** — `packages/devtools/tests/debug_panels.test.ts` imports the `Hono`
  value from `@lockness/hono`, not `hono` (folded in — see §12 D1).
- **FR-005** — `packages/devtools/deno.json` declares `@lockness/hono` fully
  qualified and pinned (`"@lockness/hono": "jsr:@lockness/hono@^0.2.0"`).
- **FR-006** — the existing `"hono"` alias and `jsxImportSource: "hono"` are
  **retained** unchanged (required for JSX runtime resolution and consistent
  with every peer framework package — see §12 D2).
- **FR-007** — no runtime behaviour change: no non-import line is edited, no
  export surface changes, the collector/panel/gate behaviour is untouched.

## 4. Success criteria

- **SC-001** — `grep -rn "from 'hono'" packages/devtools/ --include='*.ts'
  --include='*.tsx'` returns **0** hits (source + tests; `EXAMPLES.md` excluded
  per §12 D3).
- **SC-002** — the pre-completion gate is green: `deno fmt && deno lint && deno
  check` on the four touched files **and** `deno task test`.
- **SC-003** — `deno task deps:analyze` (dependency-graph / declared-import
  check) passes for `@lockness/devtools` with `@lockness/hono` now declared.
- **SC-004** — the full devtools test suite passes unchanged in count (no test
  added or removed; only an import specifier changes).

## 5. 🔒 The decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Which specifier devtools uses for Hono types/values | the four `import … from '@lockness/hono'` statements (middleware.ts, mod.ts, dashboard.tsx, tests/debug_panels.test.ts) | any surviving `from 'hono'` in devtools source/tests; a second alias mapping some other bare name to the bridge |
| What `@lockness/hono` resolves to for devtools | `packages/devtools/deno.json` `imports` — one pinned `jsr:@lockness/hono@^0.2.0`, shared by both the `"hono"` alias (JSX) and the new `"@lockness/hono"` key | a divergent pin between the two keys (they must point at the **same** version string) |
| Which module JSX compiles against | `jsxImportSource: "hono"` in `packages/devtools/deno.json` `compilerOptions` (unchanged) | changing it to `"@lockness/hono"` in devtools alone, diverging from core/ui/markdown |

**Note on the two aliases.** After this change `packages/devtools/deno.json`
holds both `"hono"` and `"@lockness/hono"` mapping to the identical
`jsr:@lockness/hono@^0.2.0`. The pin string therefore **appears twice** — Deno
import maps admit no reference syntax, so the duplication is format-forced, and
**both keys are load-bearing**: `"hono"` is required by `jsxImportSource`,
`"@lockness/hono"` by FR-005 — neither is removable. The invariant the table
binds is that **the two keys never diverge**, and it is tooling-enforced, not
hoped: `scripts/bump.ts:116` selects imports by
`key.startsWith('@lockness/') || value.includes('jsr:@lockness/')`, whose value
branch matches the `"hono"` key too, so `deno task bump` rewrites both in
lockstep. This reproduces the layout already shipped in `@lockness/ui` (dual
alias → same pin, `jsxImportSource: "hono"`, `import type { FC } from
'@lockness/hono'`).

## 6. Technical context

- **Language/runtime**: Deno, TypeScript, TC39 decorators. No new deps.
- **Testing**: `deno test -A tests/` (devtools task), plus the monorepo
  `deno task test` and `deno task deps:analyze`.
- **Constraint**: type-only edits for FR-001..003 (the `import type` keyword is
  preserved); FR-004 is a value import (`Hono` is constructed).
- **No domain model** — this feature introduces no entities, value objects, or
  invariants. It changes import specifiers only.

## 7. Constitution check

| Principle | Verdict |
| :--- | :--- |
| #1 No direct `hono` import | ✅ this feature **enforces** it in devtools |
| #2 JSR-only, declared per package | ✅ adds the missing pinned `@lockness/hono` declaration (FR-005) |
| #3 No `any` in exported APIs | ✅ no type surface changes |
| #4 Tailwind v4 syntax | n/a — no CSS |
| #5 Pre-completion gate | ✅ SC-002 |
| #6 Never hand-edit `deno.lock` | ✅ if the lockfile needs regenerating, via `deno cache`, not by hand |
| #7 JSDoc on public APIs | ✅ no API added/changed; existing JSDoc untouched |
| #8 MVC layering | n/a |
| #9 One category per commit | ✅ single `refactor(160):` commit (source + deno.json + test import are one refactor category) |
| No silent catches | n/a — no catch touched |
| TDD | see §9 R1 — TDD's "failing test first" is satisfied by SC-001's grep gate + the existing suite acting as the regression guard; no new behaviour to test-drive |

No violations. No Complexity Tracking entry needed.

## 8. Surface impact

- **Public API surface**: none. `@lockness/devtools` exports are unchanged.
- **Client surfaces**: none. No HTTP route, no panel, no CLI command changes.
- **Interface contracts exposed**: none new.
- **No front-end surface is added or changed** — `dashboard.tsx` is edited at
  its import line only; no component, markup, or style changes. No
  `## Visual Prototyping with Claude Artifacts` subsection applies.

## 9. Risks

- **R1 — a type the code uses is not re-exported by the bridge.** Mitigation:
  verified before planning — `@lockness/hono` re-exports `Context`,
  `MiddlewareHandler` and `Hono` via `export * from 'hono'` (→ `npm:hono@4.11.1`),
  and `packages/ui` already imports types (`FC`) from the bridge. The gate
  (`deno check`) is the backstop: a missing export fails type-checking loudly.
- **R2 — JSX stops resolving** if the `"hono"` alias is dropped. Mitigation:
  FR-006 retains it; `jsxImportSource: "hono"` is untouched.
- **R3 — `deno task deps:analyze` flags the retained `"hono"` alias** as a
  non-canonical name. Mitigation: the alias already exists and passes today;
  adding `"@lockness/hono"` only makes the graph stricter-compliant, not less.
  If the analyzer objects to the dual alias, that is a finding to record, not a
  silent removal that breaks JSX.

## 10. Architecture audit

**Verdict: clean (pass).** `architect-expert`, plan-time, read-only. Coverage:
decision-table completeness (all 7 FRs), all three homes, the full 5-file blast
radius, and three-cycle forward risk. Open `domain:devtools` items #160/#161 read.

| Q | Answer |
| :--- | :--- |
| Decision table complete? | Yes, no missing row. FR-001..004 → Row 1; FR-005+FR-006(pin/alias) → Row 2; FR-006(jsxImportSource) → Row 3. FR-007 is a negative invariant, correctly an acceptance guard (SC-004) not a row. |
| Each home right? | Yes, all three. Dependency direction points inward to a foundation package; the change strengthens hard rule #1. Layout matches the shipped `@lockness/ui` peer exactly (dual alias, `jsxImportSource: "hono"`, type imports from the bridge, 10+ sites). |
| Blast radius (counted)? | **5 files: 4 import edits + 1 deno.json key.** Grep of `packages/devtools/` returns exactly the 4 hits the plan lists (0 double-quote, 0 other forms); `"@lockness/hono"` confirmed absent from deno.json today. **Nothing missed.** `EXAMPLES.md:265` correctly scoped out. |
| Three cycles out? | Almost nothing, and documented. A future reviewer may re-litigate the retained `"hono"` alias — pre-empted by Row 3 + D2 + R3. Pin drift is guarded by `bump.ts:116`. No new abstraction/coupling introduced. |

**Findings: none (no CRITICAL/HIGH/MEDIUM/LOW).** Two INFO notes:
- **INFO-1** — §5's original "single home … referenced under two keys" wording
  was loose: the pin literally appears **twice** (format-forced; import maps have
  no reference). The *invariant* is genuine and tooling-enforced by
  `scripts/bump.ts:116` (value-match branch syncs both keys), reproducing the
  shipped `@lockness/ui` layout. **§5 reworded accordingly.** Not a design change.
- **INFO-2** — independently confirmed issue #160's "Out of scope" is factually
  wrong (the test file's `import { Hono }` is a runtime value import); plan D1
  already folds it in. Confirm D1 at STOP 1; the issue text is stale, not the plan.

`CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 0`. No design change required.

## 11. Security audit

**Verdict: clean (pass).** `security-expert`, plan-time, read-only. Coverage:
`plan.md` in full, plus source verification of `packages/devtools/deno.json`,
`packages/hono/deno.json`, `packages/hono/mod.ts`, and all four `from 'hono'`
hits. Open `domain:devtools` items #160/#161 read.

| Q | Answer |
| :--- | :--- |
| New input surface? | None. Four import-specifier lines only; FR-007 forbids non-import edits. |
| Authz change? | None. `middleware.ts` touched at its import line only, no gate/logic touched. #161 (unauth `/_devtools/api/data`) is pre-existing and correctly scoped out. |
| Reachable bytes / does the swap change what devtools links against? | No — verified at source. Both `'hono'` and `'@lockness/hono'` already map to the identical `jsr:@lockness/hono@^0.2.0` pin (byte-identical resolution). A named/type-only import pulls only `Context`/`MiddlewareHandler`/`Hono`; the bridge's `export * from 'hono'` re-exports only core hono (not the sensitive `hono/jwt`/`hono/csrf`/… submodules, which need the bridge's explicit named re-exports devtools does not import). Worst case of an `export *` collision is a loud `deno check` failure (R1 backstop), never a silent substitution. |
| Cross-account impact? | Nothing. No query, identifier, or response body added or altered; reachability identical before/after. |

**Findings: none.** Two INFO notes for the record:
- **INFO-1** — the added `@lockness/hono` caret declaration (FR-005) is **not** a
  supply-chain finding: internal package we publish and control, committed
  lockfile pins the transitive tree, same pin the `"hono"` alias already
  resolves. (OWASP A03:2025 / supply-chain KB §"When it is NOT a finding".)
- **INFO-2** — the audit independently confirmed the issue's "Out of scope"
  text is factually wrong (a runtime `Hono` import exists in the test file);
  the plan already catches this in D1. No conclusion in #160/#161 is wrong.

`CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 0`. No security-driven plan change required.

## 12. Open questions & decisions

**Decisions taken (informed guesses — one line each):**

- **D1** — Fold the runtime test-file import (`debug_panels.test.ts:9`) into
  scope. The issue's ACs list only the three type-only files and its "Out of
  scope" wrongly claims "there are none here"; leaving a known hard-rule-#1
  violation in the very package this refactor targets would be incoherent, and
  it is the same one-line fix. **This is the one item genuinely worth the user's
  veto — raised at STOP 1.**
- **D2** — Keep `jsxImportSource: "hono"` and the `"hono"` alias. Changing them
  in devtools alone would diverge from core/ui/markdown and risk JSX resolution;
  jsxImportSource is a compiler directive, not an `import` statement, so it is
  outside hard rule #1's literal scope.
- **D3** — Leave `EXAMPLES.md:265` (`from 'hono/cors'`) out of scope. It is
  documentation teaching an import pattern, not a source import; correcting
  example-code import conventions is a separate docs-consistency concern, not
  this refactor. Noted for a future docs sweep.
- **D4** — One `refactor(160):` commit. The source edits, the `deno.json`
  declaration, and the test import are a single refactor category (constitution
  #9); they are not splittable into feat/docs/test without fragmenting one
  atomic change.

**Open questions — settled at STOP 1:**

- **Q1 (RESOLVED 2026-09-03 — "fold it in")** — the runtime test-file import
  (`debug_panels.test.ts:9`) is folded into #160 (FR-004). All four direct
  `hono` imports in devtools are fixed; zero hard-rule-#1 violations remain. The
  issue's "Out of scope" text is stale and is superseded by this decision.
