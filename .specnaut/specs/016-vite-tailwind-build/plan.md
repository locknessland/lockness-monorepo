# Plan — Compile Tailwind v4 utilities in the `@lockness/vite` production build (#156)

**Feature dir:** `.specnaut/specs/016-vite-tailwind-build/` · **Branch:** `016-vite-tailwind-build` · **Linked issue:** #156
**Package:** `@lockness/vite` · **Epic:** #64 (closed — this is the last tracked follow-up)

## 1. Why this exists

`vite build` today emits the Tailwind **theme + preflight** but **not the compiled utilities**.
Vite's default CSS handling bundles `app/view/assets/app.css` (which is just `@import "tailwindcss";`)
as-is; it never runs the Tailwind v4 engine that expands `@tailwind utilities` against the project's
source. Result: a production bundle where `class="flex gap-4"` produces no CSS. The dev watcher is
fine — it already shells the Tailwind CLI (`createCssCollector` → `TAILWIND_CLI`) — so **the gap is
production-build-only**. It went unnoticed because the #115 demo uses zero utility classes.

Measured today: `deno task build` in `packages/vite/demo/` produces a hashed `app-*.css` under
`public/assets/` containing preflight but no utility rules.

## 2. User scenarios

**P1 — a utility class renders in production (the whole feature).**
- **Given** a Lockness app wired with `lockness({ app })` whose views use Tailwind utility classes,
  **When** the developer runs `vite build`, **Then** the hashed CSS asset under `outDir` contains the
  compiled utility rules for the classes actually used, **And** `viteAssets()` links that same hashed
  file from the manifest.

**P2 — dev and production agree.**
- **Given** the same source, **When** compared, **Then** a utility visible under `deno task dev`
  (already working) is also present in the `vite build` output. No dev-only utilities.

**Edge cases:** no utility classes used → build still succeeds, CSS contains theme+preflight only (no
regression); Tailwind engine fails at build → build fails loudly (no silent empty CSS); CSS asset must
still be discoverable by the existing manifest-by-entry `viteAssets()` lookup (a standalone emitted
asset that the manifest does not tie to the client entry is a regression, not a fix).

## 3. Requirements

- **FR-001** During `vite build`, the Tailwind v4 engine MUST run so `@tailwind utilities` are
  expanded against project source into the client CSS.
- **FR-002** The compiled utilities MUST land in the **same hashed CSS asset the manifest ties to the
  client entry**, so `viteAssets()` (manifest-by-entry) resolves them unchanged. No new asset lookup path.
  **Precondition:** `cssInput` is reachable from the client entry (the demo's `client.ts` imports it); an
  entry that never imports the CSS has no entry→css manifest edge to compile into.
- **FR-003** Dev behaviour (Tailwind CLI watcher, #111) MUST be unchanged — this feature touches the
  build path only.
- **FR-004** A build-time Tailwind failure MUST **throw and fail the build** with a diagnostic. The
  build hook MUST NOT reuse `createCssCollector.rebuild()`'s log-and-return on failure (that would ship
  an empty/stale bundle) — it either throws directly or wraps a rebuild variant that surfaces the error.
- **FR-005** The demo MUST gain a visible utility class that proves compilation end-to-end, asserted by
  a test.
- **FR-006** The "Known limitation / Remaining CSS note" MUST be removed from `docs/vite.md` and
  `packages/vite/demo/README.md` once FR-001 holds.

## 4. Success criteria

- **SC-001** After `vite build` on a project using `class="…"` utilities, the hashed CSS asset
  referenced by the manifest for the client entry contains the corresponding compiled rules.
- **SC-002** The e2e build test asserts a known utility rule string is present in the built CSS.
- **SC-003** A project using no utilities still builds green (theme+preflight only).
- **SC-004** Neither `docs/vite.md` nor the demo README mentions a Tailwind-utilities build limitation.

## 5. 🔒 The decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| **Which Tailwind engine runs, and its invocation** (FR-001) | a single **`compileCss()` seam** in `src/plugins/css.ts` wrapping the `TAILWIND_CLI` argv (`src/shared.ts`); **both** the dev collector and the build hook route through it | a second `@tailwindcss/cli` argv, or a `@tailwindcss/vite`/`@tailwindcss/postcss` engine added *alongside* the seam — two engines is the defect. NB: the const alone pins the *spelling*, not the engine *count*; the seam is what makes a second engine have to displace it (A-arch F2) |
| **Where the build reads the CSS entry** (FR-001/002) | `src/shared.ts` — `DEFAULTS.cssInput` | a re-spelled `app/view/assets/app.css` literal in the new build-CSS plugin |
| **How compiled CSS reaches the manifest** (FR-002) | a build-gated **`load` hook (or `enforce:'pre'` transform)** matching the **absolute-resolved** `cssInput` id returns compiled CSS as that module's content, so Vite's own `vite:css` hashes it under the client entry (as today) | a standalone `this.emitFile({type:'asset'})` that bypasses the entry link (rejected Option B — `viteAssets()` would miss it); OR a literal `id === DEFAULTS.cssInput` compare, which never fires because the hook id is absolute (A-arch F4) |
| **Build-vs-dev application of the engine** | the new plugin declares `apply: 'build'` (never registered in `serve`); dev keeps the CLI watcher | a `Deno.env`/`command === 'build'` in-hook re-check duplicating the dev-vs-prod arbiter that already lives on `ManifestReader.mode()` |
| **How a Tailwind failure is surfaced** (FR-004) | the `compileCss()` seam **throws** on a failed run; the *dev collector* wraps it with a log-and-continue fallback (watcher stays up), the *build hook* calls it raw so the build fails | reusing `createCssCollector.rebuild()`'s `console.error + return` on the build path — a default indistinguishable from success (A-arch F1 / A-sec INFO-3) |

## 6. Technical context

- **Language/runtime:** TypeScript on Deno; Vite 8 loaded via `--configLoader native` (#154).
- **Package:** `@lockness/vite`. New code: a build-only CSS plugin, wired into `lockness()`'s array.
- **Existing assets to reuse:** `createCssCollector` / `buildTailwindArgs` (`src/plugins/css.ts`) already
  run `TAILWIND_CLI` to a temp file and return compiled CSS — the same engine, in dev.
- **Constraint:** hard rule #2 — `vite` is already this package's ONE sanctioned `npm:` specifier;
  adding a second npm plugin (`@tailwindcss/vite`) widens that exception and must be justified.
- **Scale:** build-time, one CSS compile per build. Negligible.

**Domain Model** — Bounded context: **build**. Vocabulary: *cssInput* (the `@import "tailwindcss"`
entry), *client entry* (what Vite bundles), *manifest entry* (the entry→asset map `viteAssets` reads),
*Tailwind engine* (the oxide compiler, reached via the CLI). Invariant: **exactly one Tailwind engine**
across dev and build. Value object: the `TAILWIND_CLI` argv. No persisted entities.

## 7. Constitution check

| # | Principle | Verdict |
| :-- | :-- | :-- |
| 1 | No direct `hono` import | N/A |
| 2 | JSR-only / justified npm | **Recommended path adds NO npm dep** (reuses `@tailwindcss/cli`). The rejected Option A would add `@tailwindcss/vite` — widening the exception; documented if chosen. |
| 3 | No `any` in exported APIs | Honoured — plugin typed against Vite's `Plugin`. |
| 4 | Tailwind v4 parentheses syntax | The demo's proof utility uses a plain utility (`flex`/`gap-4`); if a var is used, parentheses. |
| 5 | Pre-completion gate | Runs before done. |
| 6 | No manual `deno.lock` | Any dep change goes through `deno cache`. |
| 7 | JSDoc on public APIs | New plugin factory gets full JSDoc. |
| 8 | MVC layering | N/A (build tooling). |
| 9 | Commit discipline | one `feat` (plugin+wiring+test), one `docs` (note removal), one `chore(backlog)` at close. |

No violations → no Complexity Tracking entry.

## 8. Surface impact

- **`src/plugins/css.ts`** (or a new `src/plugins/build_css.ts`) — the build-time compile plugin.
- **`src/lockness.ts`** — add the plugin to the composed array (build-gated, so dev is untouched).
- **`packages/vite/demo/`** — a view gains a utility class; a build test asserts it in the output.
- **`docs/vite.md`, `packages/vite/demo/README.md`** — remove the limitation note.
- **Interface contract:** `lockness()`'s return type (`Plugin[]`) is unchanged. **Public surface DOES change**
  (correcting the earlier claim, A-arch F5): extracting the `compileCss()` seam and adding the build plugin
  touch the exported `createCssCollector` / `cssPlugin` / `CssCollector` in `mod.ts`. The extraction is
  additive (a new exported `compileCss`); the collector keeps its shape, gaining the seam underneath.
- No front-end product surface (this is framework build tooling) → no artifacts prototyping subsection.

## 9. Risks

- **R-1 — the build hook must produce compiled CSS *before* Vite hashes it, exactly once, and fail loud.**
  Mitigation: a build-gated `load` hook (abs-resolved `cssInput`) returns the `compileCss()` seam output
  so Vite's normal CSS→manifest emit is unchanged; `cssPlugin.buildStart`'s rebuild is dev-gated so the
  CLI runs once per build (A-arch F3); the seam throws on failure (A-arch F1). Verified by SC-001/SC-002.
- **R-2 — content detection.** The engine must scan `app/**` to know which utilities to emit; the CLI
  does cwd-based detection (as in dev). Mitigation: run with project root as cwd, same as the watcher.
- **R-3 — (Option A only) `@tailwindcss/vite` may not resolve under `--configLoader native`** — it hit
  `ERR_MODULE_NOT_FOUND` during #154. Mitigation: recommended path avoids the plugin entirely.
- **R-4 — subprocess in a build hook** (spawn CLI to temp file). Mitigation: reuse the proven
  `createCssCollector` code; clean up the temp file in `finally` (already done there).

## 10. Architecture audit

`architect-expert` on the plan — **VERDICT: fail (1 HIGH, 4 MEDIUM, 2 LOW), all folded into this plan
before `tasks`.** The core bet is confirmed: **Option C keeps the manifest-by-entry lookup intact** —
`client.ts` imports `cssInput`, Vite records the hashed output under the entry's `css[]`, and Option C
only rewrites that module's *content*, never the import graph (unlike rejected Option B). Findings:

| # | Sev | Finding | Resolution in this plan |
| :-- | :-- | :-- | :-- |
| F1 | **HIGH** | FR-004 (fail loud) had no §5 home, and the mandated reuse of `rebuild()` does `console.error + return` → silent empty CSS on a green build. | **New §5 row** "How a Tailwind failure is surfaced": the `compileCss()` seam **throws**; dev wraps with log-and-continue, build calls raw. FR-004 sharpened. (A-sec INFO-3 confirms.) |
| F2 | MED | "One engine" is not enforceable at the `TAILWIND_CLI` const (pins spelling, not engine count). | **§5 row 1 re-homed** to a single `compileCss()` seam both dev and build route through — a 2nd engine must displace it. |
| F3 | MED | `cssPlugin.buildStart` already calls `rebuild()` during `vite build` today (output discarded) → a naive build plugin = **two** CLI compiles per build. | **Resolved (§8/R-1):** the one compile moves into the build-gated `load` hook; `cssPlugin`'s `buildStart` rebuild is **dev-gated** so build compiles exactly once. |
| F4 | MED | Hook unpinned + `cssInput` is project-relative while a Vite hook `id` is absolute → a literal compare silently no-ops on non-default paths. | **§5 row 3 pinned:** `load` hook (or `enforce:'pre'`), match on **absolute-resolved** `cssInput`. |
| F5 | MED | §8 claimed "no public API change" but routing FR-004 through the collector changes the public surface. | **§8 corrected:** additive `compileCss` export; collector keeps shape. |
| F6 | LOW | `build_test.ts` asserts the exact 6-name plugin array → breaks on the 7th. | Budgeted in `tasks` (one-line edit; consider membership assertion). |
| F7 | LOW | Manifest link is preconditioned on the client entry importing `cssInput`. | **Stated in FR-002.** |


## 11. Security audit

`security-expert` on the plan — **VERDICT: PASS, 0 findings.** No reachable attack surface: the new
build hook reuses an **argv-array subprocess** (`new Deno.Command(args[0], {args})`, no shell), whose
program name is the constant `TAILWIND_CLI[0]='deno'` and whose only variable args are developer build
config (`cssInput`) and an OS temp path (`Deno.makeTempFile`, `0600`, cleaned in `finally`). No request
path, no privilege boundary, no server-side secret can reach the client CSS (Tailwind scans static
`app/**` source, never `.env`/DB/runtime data). Recommended Option C is **also** the supply-chain-correct
call — it adds no npm dep vs Option A's `@tailwindcss/vite`.

Three INFO / defence-in-depth notes recorded (none blocking):
- **INFO-1** — `TAILWIND_CLI` uses `deno run -A` (all perms) for the build subprocess. Pre-existing (dev
  watcher already does this), build-scoped not production. Tightening later is a one-line change to the
  single-homed `TAILWIND_CLI` value object → **backlog as optional hardening.**
- **INFO-2** — `buildTailwindArgs` doesn't guard a path operand beginning with `-` from being read as a
  flag. Not exploitable (locally-controlled values); optional `--` argv terminator → **backlog / inline.**
- **INFO-3 (→ absorbed into the plan)** — `createCssCollector.rebuild()` **logs-and-returns** on a failed
  Tailwind run rather than throwing. Reused verbatim on the build path that would ship an empty/stale CSS
  bundle, contradicting **FR-004** and the §2 "fail loudly" edge case. **Plan updated:** the build hook
  MUST throw on Tailwind failure (fail the build), not reuse `rebuild()`'s log-and-return — see FR-004
  and R-1. This is the one plan change the security audit produced.

## 12. Open questions

_Answered at STOP 1 and recorded here as dated decisions._

- **Q1 — which build engine → DECIDED 2026-09-02: Option C.** Reuse the existing `@tailwindcss/cli`
  via a shared `compileCss()` seam + a build-gated `load` hook. No new npm dep, no Deno-resolution
  risk, dev/prod parity by construction; favoured by both audits. Option A (`@tailwindcss/vite`) and
  Option B (`emitFile`) rejected as above.

### Decisions taken without asking (informed by code / standing rules)

- The compiled CSS must reach the manifest **through the existing client-entry import**, not a new
  emit path — because `viteAssets()` is manifest-by-entry and a standalone asset would be invisible.
- Dev path stays exactly as-is; this feature is build-only.
