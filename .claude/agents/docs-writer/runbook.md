# docs-writer runbook

## Purpose recap

Documentation everywhere in lock-step with the code. No drift.

## Documentation tree

### Root docs (`docs/`)

Cross-cutting topics. See `AGENTS.md` Documentation Index for the full table.
Examples:

- `docs/architecture.md`
- `docs/getting-started.md`
- `docs/testing.md`
- `docs/deployment.md`
- `docs/compilation.md`
- `docs/STUBS.md`

### Per-package docs (`packages/<name>/`)

- `packages/<name>/README.md` — package summary, install, basic usage.
- `packages/<name>/docs/DOCS.md` — full user-facing reference.

### UI component docs (`packages/ui/components/<Component>/`)

- `packages/ui/components/<Component>/DOCS.md` — props, examples, usage.
- `packages/ui/components/<Component>/examples.tsx` — runnable JSX examples that
  the demo pages import.

### LLM-optimized docs (`public/`)

Plain-text, LLM-friendly format. Used by tools that ingest docs at scale.

- `public/llms/full.txt` — aggregated overview.
- `public/llms/<topic>.txt` — topic-specific bites.
- `public/docs/llms/<page>.txt` — per-doc-page LLM version.
- `public/ui/llms/<component>.txt` — per-UI-component LLM version.

### JSX doc pages (`app/view/pages/`)

- `app/view/pages/docs/<slug>.tsx` — uses `DocsLayout` from
  `app/view/layouts/docs_layout.tsx`.
- `app/view/pages/ui/<component>.tsx` — uses `PageUiLayout` from
  `app/view/layouts/ui_layout.tsx`.

### Sidebar nav

- `app/view/layouts/docs_layout.tsx` — sidebar for `/docs/*` pages.
- `app/view/components/ui-sidebar.tsx` — sidebar for `/ui/*` pages.

When adding a new doc page, add an entry to the appropriate sidebar's
`navSections` array.

### Stub mapping (`docs/STUBS.md`)

Maps source files to the stubs that mirror them. When a public-API source
changes, the corresponding stub should change too — flag the stub update to the
developer; you don't write `.stub` files yourself, but you DO update the mapping
doc.

## Workflow when documenting a new feature

1. Read the issue + design doc + the developer's diff.
2. Identify all targets that need updates:
   - Root doc? (cross-cutting only).
   - Package README? Package DOCS.md? (always for new package APIs).
   - UI component DOCS.md + examples.tsx? (UI-only).
   - LLM .txt files for any of the above.
   - JSX doc page + sidebar entry.
3. Update each target with consistent terminology and code examples.
4. Verify no dead links (path references all resolve).
5. Run `deno fmt` on any `.tsx` files you touched.

## Conventions

- Code examples must be runnable as-is (no pseudo-code in user-facing docs).
- Use the same import paths users will use (`jsr:@lockness/...`).
- Headings: ATX style (`#`, `##`), no leading whitespace.
- Tables: GitHub-flavored Markdown. Keep them narrow enough to render in the JSX
  layouts.
- Examples in DOCS.md should match `examples.tsx` literally where possible —
  copy-paste consistency is the goal.

## Gotchas

- The legacy task template at `.tasks/.template.md` references `GEMINI.md`. This
  is a holdover from Google Anti-Gravity. Use `AGENTS.md` instead. When you
  encounter `GEMINI.md` references in any doc, fix to `AGENTS.md`.
- Sidebar nav entries are typed (TypeScript). A typo in a `name` field silently
  breaks the link — verify by running the dev server when adding pages.
- LLM `.txt` files are not auto-generated — you write and update them by hand.

## References

- `AGENTS.md` (Documentation Index table is the canonical map)
- `docs/STUBS.md`
- `.tasks/.template.md` (Documentation Updates Checklist section — useful
  reference even though `.tasks/` is being phased out)
- `AGENTS.md`
