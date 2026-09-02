# Tasks: Break the `@lockness/ui` ↔ `@lockness/markdown` circular dependency

**Input**: `.specnaut/specs/017-break-ui-markdown-cycle/plan.md` (the only design document)
**Branch**: `017-break-ui-markdown-cycle` · **Issue**: #127 · **Category**: `refactor`
**Tests**: YES — the acceptance criteria require `deno check/lint/test` green, and SC-002 (styled output unchanged) needs a parity net. TDD per constitution.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 = P1 (markdown standalone), US2 = P2 (styled output unchanged), US3 = P3 (zero cycles)

## 🔒 Decision-table homes carried forward (plan §5)

| Decision | Home a task MUST NOT duplicate |
| :--- | :--- |
| Edge direction (one-way `ui → markdown`) | `deps.policy.jsonc` only — never a second "rule" in `AGENTS.md` Pitfalls |
| Plain default rendering (no ui) | ONE plain-HTML map object in `packages/markdown/renderer.tsx` |
| Styled rendering | ONE ui map in `packages/ui` (relocated `defaultComponents`) |
| What is overridable | `packages/markdown/types.ts` `ComponentOverrides` (incl. the 5 new table fields) |
| URI-scheme sanitisation (future #148) | engine/parser — never a component map (plan §6 invariant) |

---

## Phase 1: Setup

- [x] T001 Confirm baseline: run `deno task deps:analyze` and record the current `⏳ markdown → ui — see #127` cycle line, and `deno task test` green, so the before/after is anchored. No file change.

## Phase 2: Foundational (blocks all stories)

- [x] T002 [P] Extend `ComponentOverrides` in `packages/markdown/types.ts` with **5 additive optional fields** for the table structural primitives — `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (each `FC<{ children: unknown; class?: string }>`, `TableCell`/`TableHead` also `align?`). Existing fields unchanged. Full JSDoc on each.
- [x] T003 Add JSDoc to `ComponentOverrides.CodeBlock` in `packages/markdown/types.ts` stating the trust invariant verbatim (plan §6 / security S-2): **"`html` is highlighter-generated, escaped output only — never render caller-supplied HTML raw."**

## Phase 3: US1 (P1) — `@lockness/markdown` renders standalone, no `@lockness/ui`

**Independent test**: importing `@lockness/markdown` alone renders valid JSX and `deno info` shows no `@lockness/ui` node.

- [x] T004 [US1] Write failing test `packages/markdown/tests/plain_defaults_test.ts`: `renderMarkdown('# H\n\npara\n\n\`\`\`ts\ncode\n\`\`\`\n\n| a |\n|---|\n| b |')` returns a tree of **plain HTML** elements (`h1`, `p`, `pre`/`code`, `table`/`thead`/`tbody`/`th`/`td`) with NO `@lockness/ui` import in the module graph.
- [x] T005 [US1] Write failing test in the same file for **SC-005 / FR-003a**: the plain default `CodeBlock` renders escaped `children` text and does NOT emit a raw-HTML sink even when a `html` field is present (assert output contains the escaped code, not `dangerouslySetInnerHTML`).
- [x] T006 [US1] In `packages/markdown/renderer.tsx`, replace the ui-based `defaultComponents` with a **plain-HTML default map** (16 keys: 11 element renderers + 5 table primitives), per FR-003. Plain `CodeBlock` renders escaped text only, never forwards `html` (FR-003a). Plain `Link`/`Image` forward `href`/`src` verbatim (FR-003b parity — no scheme stripping here). Route `renderTableContent`'s five leaf wrappers through `components.*` — the header/body **grouping** logic (`isHeaderRow`, head-vs-cell selection) stays in the engine (arch audit Q2 nuance).
- [x] T007 [US1] Remove the `import { … } from '@lockness/ui/components'` line from `packages/markdown/renderer.tsx` (FR-001). Verify no other `packages/markdown/**/*.ts*` source file imports `@lockness/ui`.
- [x] T008 [US1] Remove `@lockness/ui` (and any now-unimported `clsx` / `tailwind-merge`) from `packages/markdown/deno.json` `imports` (FR-007a). Do NOT hand-edit `deno.lock` — let the gate regenerate.
- [x] T009 [US1] Make T004/T005 pass; run `deno check packages/markdown/**/*.ts*` and confirm `git grep -n "from '@lockness/ui" -- 'packages/markdown/**/*.ts*'` is empty (FR-001 acceptance).

## Phase 4: US2 (P2) — styled output byte-for-byte unchanged, via `@lockness/ui`

**Independent test**: the docs site and blog produce the same `@lockness/ui` component tree as before.

- [x] T010 [US2] Write a **parity/snapshot test** `packages/ui/tests/markdown_components_test.ts` capturing the ui-styled render of a representative doc (headings, code block, blockquote, table, link, list) — asserts the ui component tree (`Title`, `HighlightedCodeBlock`, `Alert`, `UITable`, …) is produced. This is the SC-002 net; author it against the relocated map.
- [x] T011 [US2] Create the styled component map in `@lockness/ui` (e.g. `packages/ui/markdown_components.tsx`) — the **relocated** `defaultComponents` JSX, moved not rewritten, now including the 5 table-primitive entries (`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` → the ui table components). Full JSDoc; re-state the `CodeBlock.html` trust invariant.
- [x] T012 [US2] Add styled `renderMarkdown` / `renderMarkdownWithoutTitle` wrappers in `@lockness/ui` that pre-bind the styled map and delegate to `@lockness/markdown`'s engine (`MarkdownContent` / the parser). Full JSDoc with `@example`. (Q1 → Option A.)
- [x] T013 [US2] Export the styled map + wrappers from `@lockness/ui`'s `mod.ts` (public surface via `mod.ts` per constitution).
- [x] T014 [US2] Rewire the **three** styled call sites to import from `@lockness/ui`: `app/controller/docs_controller.tsx`, `app/view/pages/blog/render.tsx` (both: `renderMarkdownWithoutTitle` import origin `@lockness/markdown` → `@lockness/ui`), and `packages/ui/docs_renderer.tsx` (`createDocsSection` uses the local/ui styled path — the single wiring point shielding all 34 `examples.tsx`).
- [x] T015 [US2] Make T010 pass; visually/DOM-confirm docs + blog output is unchanged (SC-002).

## Phase 5: US3 (P3) — the guard reports zero cycles

**Independent test**: `deno task deps:analyze` prints no cycles with an empty `knownCycles`.

- [x] T016 [US3] Edit `deps.policy.jsonc` (FR-007): remove the `knownCycles` #127 entry (leave `knownCycles: []`), reduce `packages.markdown.allow` to `["hono"]`, and rewrite the comment above `packages.ui` to describe the resolved one-way `ui → markdown` edge (`ui.allow` stays `["hono", "markdown"]`).
- [x] T017 [US3] Run `deno task deps:analyze` — assert zero cycles and no declaration drift (SC-001/SC-003).

## Phase 6: Docs & polish (cross-cutting)

- [x] T018 [P] Rewrite the hand-written **Pitfalls** prose in `packages/markdown/AGENTS.md` and `packages/ui/AGENTS.md` to describe the resolved one-way direction instead of the cycle (FR-008). Update the stale "renders Markdown using `@lockness/ui`" framing in `packages/markdown/README.md` and `packages/markdown/docs/DOCS.md` prose (arch audit Q1 side-edits).
- [x] T019 Regenerate the `<!-- generated:deps -->` tables in both briefs: `deno task agents:brief`. Commit the brief regeneration as a **separate `chore(...)` commit** (one category per commit).
- [x] T020 Add a changelog / release-notes line marking `@lockness/markdown`'s default-output flip (styled → plain HTML) as a **breaking change** for external JSR consumers (arch audit LOW-1 / plan §8).
- [x] T021 Run the full pre-completion gate (FR-009): `deno fmt && deno lint && deno check <changed files> && deno task test`, then `deno task deps:analyze`. All green before declaring done.

---

## Dependencies & order

- **T002/T003** (types) block the map work (T006, T011) — the extended contract must exist first.
- **US1 (T004–T009)** and **US2 map creation (T010–T013)** can proceed in parallel once types land; **T014** (rewire) depends on T012/T013 existing.
- **US3 (T016–T017)** must run **after** T007 (the source import is actually gone) or `deps:analyze` still sees the edge.
- **T018–T021** are last (docs reflect the final state; the gate is the final act).

## Parallel opportunities

- T002 ‖ T010 (test authoring, different files).
- T006 (markdown map) ‖ T011 (ui map) — different packages, both gated only on T002.
- T018 (docs) parallel with T016 (policy), different files.

## MVP / suggested increment

MVP is the whole refactor — the cycle is not "broken" until all three stories land together (removing one edge without wiring the other side breaks the styled path). US1 + US2 + US3 ship as one `refactor` commit; T019's brief regeneration is a trailing `chore`; T020 the changelog `docs`.
