# Bump comment preservation — Design

**Status:** Draft for review **Date:** 2026-05-02 **Issue:** #94 **Owner:**
devops-sre (script-owner per `.claude/agents/devops-sre/runbook.md`)

## 1. Problem statement

`scripts/bump.ts` currently parses the root `deno.jsonc` with `@std/jsonc`'s
`parse`, then writes the result back through `JSON.stringify(config, null, 4)`.
That round-trip throws away every comment in the file and reflows whatever
formatting the parser collapses (trailing newlines, key order is preserved by
chance only because we mutate in place). Maintainers have to hand-restore the
descriptive comments after every release, which is friction-prone and easy to
forget — releases ship with stripped configs.

The per-package `packages/<name>/deno.json` files do not have this problem. They
are plain JSON by convention (verified across `core`, `cache`, `events`, and
others — none contains a comment), so `JSON.parse` / `JSON.stringify` behaves
identically to a comment-preserving editor for them. The bug is narrowly scoped
to the root `deno.jsonc` rewrite path.

Fix is small but the choice of tool matters: we want a JSR-friendly,
edits-with-comments approach so the next "add a `// why we pin foo` comment"
contributor doesn't get punished by the next bump.

## 2. Goals

1. Bumping the version no longer removes comments or reformats unrelated
   structure in `deno.jsonc`. Byte-for-byte preservation outside the touched
   `version` and Lockness `imports.*` values.
2. Per-package `packages/*/deno.json` updates keep working (no regressions).
3. New behaviour is fixture-tested so future refactors can't silently regress
   it.
4. The script's `@fileoverview` comment block documents the editing strategy.

## 3. Non-goals

- Migrating `deno.jsonc` to a different format.
- Adding new bump features (changelog, prerelease tags, git tagging, dry-run
  flag — none of those are in the issue scope).
- Refactoring stub-file rewriting (`updateStubFile`) — the existing regex pass
  on `.stub` files is fine; stubs are not config files and have no comment
  contract.
- Touching the release pipeline or `deno publish` flow.

## 4. Architecture

### 4.1 Strategy: CST-based edit via `@david/jsonc-morph`

Use `jsr:@david/jsonc-morph` for the `deno.jsonc` rewrite path. It is
JSR-published, zero runtime deps, authored by a Deno-core maintainer
(`dsherret`), and exposes exactly the API we need:

```ts
import { parse } from '@david/jsonc-morph'

const root = parse(await Deno.readTextFile(ROOT_CONFIG_PATH))
const obj = root.asObjectOrThrow()

obj.getOrThrow('version').setValue(newVersion)

const imports = obj.get('imports')?.asObject()
imports?.properties().forEach((prop) => {
    const key = prop.name.value()
    const valNode = prop.value
    if (!valNode || !valNode.isStringLit()) return
    const current = valNode.asStringLitOrThrow().value()
    if (!isLocknessImport(key, current)) return
    const updated = updateImportVersion(current, newVersion)
    if (updated && updated !== current) valNode.setValue(updated)
})

await Deno.writeTextFile(ROOT_CONFIG_PATH, root.toString())
```

(Exact method names per `@david/jsonc-morph@0.3.3` doc — devops-sre to confirm
against `jsr.io/@david/jsonc-morph/doc` at implementation time; the surface is
stable.)

`root.toString()` re-emits the source with only the touched leaf tokens
replaced. Comments, whitespace, key order, trailing newline — all untouched.

### 4.2 Module layout

Single file. Add a tiny private helper `updateRootJsonc(text, newVersion)`
inside `scripts/bump.ts` that takes the source text and returns the rewritten
text (pure function, no I/O). The existing `updateRootConfig` becomes a thin
wrapper that handles the read/write. This split is the only structural change —
no new file. Justification:

- The pure helper makes the snapshot test trivial (feed text, assert text).
- Splitting into `scripts/jsonc_edit.ts` would add a module for one consumer;
  YAGNI per the runbook's "single, narrow responsibility" guidance reads as one
  helper, not one file.
- Keeps the diff small and the cognitive footprint of `scripts/bump.ts`
  comparable to today.

### 4.3 Per-package update path

`updatePackage` stays on `JSON.parse` / `JSON.stringify`. Rationale:
`packages/*/deno.json` files have no comments by repo convention, and Deno's own
`deno publish` workflow assumes plain JSON for package configs. Forcing the
heavier CST path everywhere would buy nothing and add a parse cost per package.
Note this decision in the script header so a future contributor who wants to add
a comment to a package config gets the right signal (add a doc test that asserts
package configs are comment-free, or migrate that one path too — out of scope
here).

### 4.4 Error handling

`@david/jsonc-morph` throws on malformed input. Wrap the root rewrite in a
try/catch that mirrors `updatePackage`'s `UpdateResult` shape so the existing
console-output contract is preserved. If the root file fails to parse, abort
with a non-zero exit (today it would crash anyway).

## 5. Decisions

| #  | Decision                                                    | Alternative                                             | Why                                                                                                                                                                                                                          |
| -- | ----------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 | Use `@david/jsonc-morph` for root JSONC edits               | Targeted regex on `"version"` + `"@lockness/..."` lines | Regex is fragile (multi-line strings, escaped quotes, future formatting drift); CST is correctness-by-construction. Cost is one tiny zero-dep JSR package.                                                                   |
| D2 | Use `@david/jsonc-morph`, not `@felipecrs/jsonc-weaver`     | Other JSR JSONC editors                                 | Both are credible. `jsonc-morph` is authored by a Deno team member (`dsherret`), zero runtime deps, broad runtime compat (deno/node/bun/workerd/browser), already has 2 dependents. Lower lock-in risk.                      |
| D3 | Keep package update path on `JSON.parse`/`JSON.stringify`   | Apply CST everywhere                                    | Package configs are plain JSON; the CST detour saves nothing and slows the loop.                                                                                                                                             |
| D4 | Single file, with one extracted pure helper                 | New `scripts/jsonc_edit.ts` module                      | One internal caller; extracting just for the test is over-modularization. Pure helper is enough.                                                                                                                             |
| D5 | Fixture-based snapshot test, not a stringly-typed assertion | Inline-string assertion or full golden-file replacement | A real fixture (a `.jsonc` with a varied set of comments — leading, trailing, between keys, JSDoc-style block) gives a meaningful regression target. Snapshot vs. expected file with `assertEquals` on the rewritten string. |
| D6 | Script remains `scripts/bump.ts` ownership of devops-sre    | Hand to developer                                       | Per `.claude/agents/devops-sre/runbook.md`, `scripts/bump.ts` is a release-tooling script under devops-sre. Not a feature change.                                                                                            |

### Dependency-graph impact

- New JSR dependency: `jsr:@david/jsonc-morph@^0.3.0` (or current at
  implementation time) added to root `deno.jsonc` `imports` and used only by
  `scripts/bump.ts`. Zero edges into `packages/*` — does not perturb the
  Lockness DAG. `docs/dependencies.md` does not need to be updated.

## 6. Pre-requisites & blockers

- None. `@std/jsonc` is already pinned and remains in use for read-only parses
  elsewhere if any (none currently outside `bump.ts`, but no removal needed).
- `deno.lock` will refresh on first `deno cache scripts/bump.ts` after the
  import is added — must NOT be hand-edited (rule #6 in `.claude/CLAUDE.md`).

## 7. Validation criteria

The bump task is done when ALL of the following pass:

1. `tests/bump.test.ts` gains a fixture-based test that:
   - Reads `tests/fixtures/bump/deno.jsonc.input` (a deliberately comment-rich,
     formatting-quirky JSONC).
   - Calls the new pure helper with `newVersion = "9.9.9"`.
   - Asserts the result equals `tests/fixtures/bump/deno.jsonc.expected`.
   - The expected file differs from the input ONLY in the `version` field and
     the `@lockness/*` import versions — every comment, blank line, and
     non-Lockness import is byte-identical.
2. A second test case bumps a fixture that has no Lockness imports and asserts
   only `version` changes; comments preserved.
3. Smoke test (manual or scripted in the test): run the live bump script against
   a temp copy of the real root `deno.jsonc` to a throw-away version, diff
   against original — only `version` and `@lockness/*` lines differ. Cover at
   least `core`, `cache`, `events` package files in the same run.
4. `deno fmt && deno lint && deno check scripts/bump.ts tests/bump.test.ts &&
   deno task test`
   all green (CLAUDE.md rule #5).
5. The script's `@fileoverview` block documents the comment-preservation
   strategy and names the parser used.

## 8. Risks

| Risk                                                                                                  | Mitigation                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@david/jsonc-morph` API shifts (`0.x`) and breaks the script.                                        | Pin with caret `^0.3.0`. The fixture test catches any regression on a future cache refresh. Package has 2 dependents and is by Sherret — low churn risk.                                                                             |
| `root.toString()` introduces a subtle formatting diff (e.g. quote style on a string we did not edit). | Fixture test asserts byte-for-byte equality on untouched regions. If the parser ever rewrites untouched tokens, the test fails loudly.                                                                                               |
| `setValue` on a string-literal node reformats the literal (e.g. unquotes if it can).                  | Test the `^0.x.y` import shape explicitly in the fixture. Worst case, fall back to constructing the literal with the same quote style by reading the original token text.                                                            |
| `@std/jsonc` `parse` was a peer dep — removing it breaks an unrelated import elsewhere.               | `parse` from `@std/jsonc` is used only inside `bump.ts` (verified by `Grep`); the new helper replaces both call sites. Keep the `@std/jsonc` import in root for any future read-only consumer; do not remove it from root `imports`. |
| Fixture file gets reformatted by `deno fmt`.                                                          | Place fixtures under `tests/fixtures/bump/` and add the path to the root `fmt.exclude` block to keep the byte-for-byte contract.                                                                                                     |

## 9. Files devops-sre will likely touch

- `/Users/kevin/Sites/lockness/scripts/bump.ts` — replace `updateRootConfig`'s
  rewrite path; add pure helper; update `@fileoverview`.
- `/Users/kevin/Sites/lockness/tests/bump.test.ts` — add fixture-based tests for
  the new helper.
- `/Users/kevin/Sites/lockness/tests/fixtures/bump/deno.jsonc.input` — new.
- `/Users/kevin/Sites/lockness/tests/fixtures/bump/deno.jsonc.expected` — new.
- `/Users/kevin/Sites/lockness/tests/fixtures/bump/deno.jsonc.no-imports.input`
  — new (second test case).
- `/Users/kevin/Sites/lockness/tests/fixtures/bump/deno.jsonc.no-imports.expected`
  — new.
- `/Users/kevin/Sites/lockness/deno.jsonc` — add `@david/jsonc-morph` to
  `imports`; add `tests/fixtures/bump/` to `fmt.exclude` and `lint.exclude`.
- `/Users/kevin/Sites/lockness/deno.lock` — regenerated automatically by
  `deno cache`; do NOT hand-edit.
