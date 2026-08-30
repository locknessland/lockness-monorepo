# architect runbook

## Purpose recap

Cheap-to-throw-away technical design before the developer codes. One issue = one
design doc. Markdown only.

## Design doc template

Save to `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md`:

```markdown
# <Feature> — Design

**Status:** Draft for review **Date:** YYYY-MM-DD **Issue:** #<num> **Owner:**
<name>

## 1. Problem statement

<2–4 paragraphs: what's broken/missing, who's affected, why now>

## 2. Goals

1. <bullet>
2. <bullet>

## 3. Non-goals

- <out-of-scope item>

## 4. Architecture

<topology, key components, data flow, error handling>

## 5. Decisions

<key choices with the alternative considered + why this one>

## 6. Pre-requisites & blockers

<other issues that must ship first; permissions; tooling>

## 7. Validation criteria

<how we'll know this works when implemented>

## 8. Risks

| Risk | Mitigation |
| ---- | ---------- |
| ...  | ...        |
```

## Patterns to enforce

- **SOLID**: each new class/module has a single, narrow responsibility.
  Open/closed where extension is anticipated. Dependency inversion at package
  boundaries.
- **Layered architecture**: respect Lockness's layering (Foundation →
  Implementation → Orchestration). Foundation packages have zero deps on feature
  packages.
- **Acyclic deps**: run `deno task deps:analyze` (or read
  `docs/dependencies.md`) before adding a new package edge.
- **Package boundaries**: features go in `packages/<name>/`. Cross-package
  imports use the workspace alias.

## When to skip an architect pass

Trivial tasks where no design call is needed:

- Pure typo or doc fix.
- Version bump (`deno task bump`).
- Mechanical rename guided by a clear signal (e.g. "rename method X to Y
  everywhere").
- Stub regeneration after a CLI change.

If unsure, do a 5-line "mini-design" pointing the developer at the right files
instead of a full doc.

## Conventions

- One design doc per issue (don't combine).
- Keep the doc focused — under 400 lines is the target. Longer = sign that the
  issue should be split.
- Always include `Out of scope` — it sets the bar for what the developer will
  NOT do.

## Gotchas

- Don't write `.ts`/`.tsx` files. Reading them is fine.
- Don't propose a design that breaks the dependency DAG without flagging it
  explicitly in the Decisions section.
- Don't reuse a design doc between issues — start fresh each time, even if
  topics overlap.

## References

- `docs/architecture.md`
- `docs/dependencies.md`
- `docs/contribution.md`
- `AGENTS.md` (Documentation Index)
- `AGENTS.md`
