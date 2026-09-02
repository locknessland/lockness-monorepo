# Tasks — Compile Tailwind v4 utilities in the `@lockness/vite` production build (#156)

**Branch:** `016-vite-tailwind-build` · **Plan:** `plan.md` · **Engine:** Option C (shared `compileCss()` seam + build-gated `load` hook).

One feature, one `feat` commit + one `docs` commit (constitution §9). Story P1 is the whole feature; P2 (dev/prod parity) is verified, not built.

## Phase 1 — Setup

- [X] T01 Confirm the build path empirically **before** coding: run `deno task build` in `packages/vite/demo/`, capture the current hashed CSS under `public/assets/`, and record that it contains preflight but no utility rule (the baseline the fix must flip). No code.

## Phase 2 — Foundational (the `compileCss()` seam — decision-table home for FR-001/FR-004)

- [X] T02 [P1] Extract a **`compileCss(config): Promise<string>`** seam in `packages/vite/src/plugins/css.ts` that runs the `TAILWIND_CLI` argv (via `buildTailwindArgs` → `Deno.Command`, argv-array, temp file, `finally` cleanup) and **THROWS** on a failed run (no `console.error + return`). This is the single home for "which engine runs" (§5 row 1) **and** "how a failure is surfaced" (§5 new row / FR-004). Export it from `src/mod.ts` (additive public surface, §8).
- [X] T03 [P1] Re-express `createCssCollector.rebuild()` on top of `compileCss()`: keep its **dev** log-and-continue fallback (watcher stays up) by catching the throw *there only*. Dev behaviour byte-unchanged (FR-003). Update `css_test.ts` for the seam.

## Phase 3 — User Story P1: a utility class renders in production

**Goal:** `vite build` emits compiled utilities into the manifest-linked CSS. **Independent test:** built CSS contains a known utility rule (SC-002).

- [X] T04 [P1] Add a build-gated plugin (in `css.ts` or `src/plugins/build_css.ts`) with `apply: 'build'` and a **`load` hook** (or `enforce: 'pre'` transform) matching the **absolute-resolved** `cssInput` id (resolve `DEFAULTS.cssInput`/config against root — NOT a literal `id === cssInput`, A-arch F4); it returns `await compileCss(config)` as the module content so Vite's `vite:css` hashes it under the client entry (§5 row 3 / FR-002). Full JSDoc.
- [X] T05 [P1] Wire the plugin into `lockness()`'s array in `src/lockness.ts` (6→7 plugins), sharing the one resolved config. Fix the exact-array assertion in `tests/build_test.ts` (add the name; prefer a membership assertion, A-arch F6).
- [X] T06 [P1] Ensure **one** compile per build: dev-gate `cssPlugin.buildStart`'s `rebuild()` (or drop its build-time run) so the CLI runs once at build via the new hook, not twice (A-arch F3). Assert in a test where practical.
- [X] T07 [P1] Demo proof (FR-005): add a visible utility class to `packages/vite/demo/app/view/home.tsx` (e.g. `class="flex gap-4"`). Extend `tests/e2e_smoke_test.ts` (real `vite build --configLoader native`) to assert the compiled rule for that class is present in the built CSS (SC-001/SC-002), and that a no-utility build still succeeds (SC-003).

## Phase 4 — Polish & docs

- [X] T08 [docs] Remove the "Known limitation" section from `docs/vite.md` (lines ~158-166) and the "Remaining CSS note" from `packages/vite/demo/README.md` (lines ~54-59); narrow any residual note to the now-true state (FR-006/SC-004). Separate `docs` commit.
- [X] T09 Run the full gate on the touched files: `deno fmt && deno lint && deno check packages/vite/**/*.ts && deno task test`. Regenerate `packages/vite/AGENTS.md` brief if the public surface line changed (`deno task agents:brief`).

## Dependencies

`T01 → T02 → T03 → T04 → {T05, T06} → T07 → T08 → T09`. T02 is the blocking foundation (the seam); T05 and T06 are parallel after T04.

## MVP

T02–T05 + T07 deliver the feature (utilities compile, proven by the e2e assertion). T06 (single-compile) and T08 (docs) complete it.

## Decision-table homes carried forward

- FR-001 engine/invocation → **`compileCss()` seam** (T02), not a re-spelled argv.
- FR-004 fail-loud → the **seam throws** (T02); dev wraps (T03).
- FR-002 manifest → **`load` hook on abs-resolved `cssInput`** (T04), never `emitFile`.
- one-compile-per-build → **dev-gate `buildStart`** (T06).
