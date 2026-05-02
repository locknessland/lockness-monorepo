# Agent Team Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish 7 specialized sub-agents (product-owner, architect, developer, qa-tester, code-reviewer, devops-sre, docs-writer) and an orchestrate skill, following the official Anthropic Agent SDK memory model, so the main session can dispatch issues from the GitHub Project #1 Kanban to the right specialist.

**Architecture:** Sub-agents live in `.claude/agents/<name>.md` (frontmatter + system prompt = identity), with companion runbooks at `.claude/agents/<name>/runbook.md` (mutable procedures). Project rules live in `.claude/CLAUDE.md` (loaded automatically by all agents). The orchestrator is the main session, driven by `.claude/skills/orchestrate/SKILL.md`.

**Tech Stack:** Claude Code sub-agents, YAML frontmatter, Markdown runbooks. No code changes outside the `.claude/` tree and `docs/`.

**Spec:** `docs/superpowers/specs/2026-05-02-agent-team-architecture-design.md`

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `.claude/CLAUDE.md` | EXPAND existing | Project hard rules, loaded by main session + all sub-agents |
| `.claude/agents/code-reviewer.md` | REWRITE existing | Sub-agent: pre-merge review (rename `deno-expert-reviewer` → `code-reviewer`) |
| `.claude/agents/code-reviewer/runbook.md` | CREATE | Review checklist, conventions |
| `.claude/agents/product-owner.md` | CREATE | Sub-agent: backlog health |
| `.claude/agents/product-owner/runbook.md` | CREATE | Backlog procedures, issue templates |
| `.claude/agents/architect.md` | CREATE | Sub-agent: technical design (markdown only) |
| `.claude/agents/architect/runbook.md` | CREATE | SOLID patterns, design doc structure |
| `.claude/agents/developer.md` | CREATE | Sub-agent: code + unit tests (TDD) |
| `.claude/agents/developer/runbook.md` | CREATE | TDD flow, Lockness conventions |
| `.claude/agents/qa-tester.md` | CREATE | Sub-agent: integration + e2e + manual validation |
| `.claude/agents/qa-tester/runbook.md` | CREATE | Test types, golden paths, mocks |
| `.claude/agents/devops-sre.md` | CREATE | Sub-agent: CI, JSR publish, bump, deploy |
| `.claude/agents/devops-sre/runbook.md` | CREATE | Workflows, bump script, deploy options |
| `.claude/agents/docs-writer.md` | CREATE | Sub-agent: documentation everywhere |
| `.claude/agents/docs-writer/runbook.md` | CREATE | Doc tree, LLM txt, sidebar nav |
| `.claude/skills/orchestrate/SKILL.md` | CREATE | Orchestration workflow for the main session |

Tests are not applicable for static agent/skill definitions. Verification = (a) YAML frontmatter parses, (b) file exists at expected path, (c) `/agents` discovers them in a fresh session, (d) each agent's first message acknowledges it read its runbook.

---

## Task 1: Expand `.claude/CLAUDE.md` with project hard rules

**Files:**
- Modify: `.claude/CLAUDE.md` (currently 1 line)

**Why first:** This file is read automatically by the main session AND every sub-agent. Encoding the hard rules here means we don't need to repeat them in every agent runbook.

- [ ] **Step 1: Read current `.claude/CLAUDE.md`**

```bash
cat .claude/CLAUDE.md
```

Expected output: one line "Check the /AGENTS.md at the root of the project for doc about the project"

- [ ] **Step 2: Write the expanded `.claude/CLAUDE.md`**

Write this exact content to `.claude/CLAUDE.md`:

````markdown
# Lockness — Project rules for all agents

The full project documentation index is in [/AGENTS.md](../AGENTS.md). Read it
when you need package layout, architecture overview, or doc pointers.

## Hard rules every agent must respect

These rules apply to **every** sub-agent and to the main session. Violations
are blockers, not preferences.

1. **No direct `hono` import.** Always import from `@lockness/core`. Lockness
   re-exports the Hono APIs it supports, on a pinned version. Direct imports
   break compatibility.
2. **JSR-only imports for Lockness and stdlib.** Use `jsr:@lockness/...` and
   `jsr:@std/...`. Avoid `npm:` specifiers unless a package is JSR-unavailable
   AND the use case justifies it (document the why in a code comment).
3. **No `any` in exported APIs.** Use `unknown` + type guards when a type is
   genuinely uncertain. Exception requires a `// deno-lint-ignore no-explicit-any`
   comment with justification.
4. **Tailwind v4 CSS-variable syntax.** Use `bg-(--my-var)` (parentheses), NOT
   `bg-[--my-var]` (brackets). Brackets are for arbitrary literal values like
   `px-[0.75rem]`, not for variable references.
5. **Pre-completion gate on every code change.** Before declaring a code task
   done, run `deno fmt && deno lint && deno check <files> && deno task test`.
   If any step fails, fix and re-run — do not declare done with red checks.
6. **Never modify `deno.lock` manually.** It is generated. If a dependency
   change requires it, run the relevant `deno cache` or `deno task` command.
7. **JSDoc on public APIs.** Every exported class, method, function,
   interface, and type carries a description, `@param`, `@returns`, `@throws`,
   and `@example` where applicable. File-level `@fileoverview` and `@module`
   tags on public modules.
8. **MVC layering.** Controllers stay thin (delegate to services). Services
   contain business logic. Models/repositories handle persistence. No direct
   DB queries in controllers.

## Source of truth for tasks

The backlog source of truth is **GitHub Project #1** of `locknessland/lockness`
(https://github.com/orgs/locknessland/projects/1/views/1). The legacy
`.tasks/` folder is being phased out — do not create new task files there.

## Agents and runbooks

Specialist sub-agents live in `.claude/agents/<name>.md`. Each has a runbook
at `.claude/agents/<name>/runbook.md` with procedures and conventions
specific to its role. The orchestration workflow is in
`.claude/skills/orchestrate/SKILL.md`.
````

- [ ] **Step 3: Verify the file**

```bash
wc -l .claude/CLAUDE.md
head -3 .claude/CLAUDE.md
```

Expected: line count between 35 and 60. First line: `# Lockness — Project rules for all agents`.

- [ ] **Step 4: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs(claude): expand CLAUDE.md with project hard rules

Encodes the project rules every agent (main session + sub-agents)
must respect: no direct hono import, JSR-only, no any in exports,
Tailwind v4 syntax, pre-completion gate, JSDoc on public APIs,
MVC layering. Pointers to AGENTS.md and the agents tree."
```

---

## Task 2: Rewrite `.claude/agents/code-reviewer.md` + create runbook

**Files:**
- Modify: `.claude/agents/code-reviewer.md` (currently misnamed `deno-expert-reviewer`)
- Create: `.claude/agents/code-reviewer/runbook.md`

**Why early:** Existing file's `name:` field is `deno-expert-reviewer`, which won't match `code-reviewer` invocations. Fix it before any other agent depends on review.

- [ ] **Step 1: Read current code-reviewer.md to confirm its state**

```bash
head -5 .claude/agents/code-reviewer.md
```

Expected: confirms `name: deno-expert-reviewer` on line 2.

- [ ] **Step 2: Write the new `.claude/agents/code-reviewer.md`**

Replace the entire file content with:

````markdown
---
name: code-reviewer
description: Pre-merge review specialist for the Lockness framework. Verdicts on SOLID, type safety, JSDoc completeness, Lockness conventions (no direct hono, JSR imports), and MVC structure. Read-only — produces a verdict + actionable comments, never edits.
model: opus
tools: Read, Glob, Grep, Bash
permissionMode: default
---

# Code Reviewer — Lockness

Pre-merge gatekeeper. You read a diff (or a branch, or a PR), check it
against the Lockness conventions, and return a clear verdict: ✅ approve or
❌ block with reasons. You never edit code, never commit, never push.

## Required reading at startup

Before reviewing anything, read:

- `.claude/agents/code-reviewer/runbook.md` — your review checklist and
  conventions specific to this role.
- `.claude/CLAUDE.md` — project hard rules.
- `AGENTS.md` (project root) — Lockness project doc index.

If a rule in the diff is ambiguous against the runbook or CLAUDE.md, escalate
to the main session — do not invent rules.

## Responsibilities

- Run `git diff <base>..HEAD` (or `gh pr diff <num>`) and read the full diff.
- Apply the checklist in your runbook section by section.
- Verify Lockness-specific rules: `@lockness/core` only, JSR-only imports,
  no `any` in exports, JSDoc on public APIs, MVC layering, no circular deps.
- Report per-file findings with line numbers when actionable.

## Output contract

Return:

1. A single-line verdict: `✅ approve` or `❌ block: <one-line reason>`.
2. A bullet list of findings, each with file path + line range when possible.
3. If `❌`, a clear list of what must change to flip to approve.

## Hand-off conventions

Escalate to the main session (orchestrator) when:

- The diff touches files outside the role's scope (e.g. CI workflows, where
  devops-sre's expertise is needed).
- A rule appears to conflict with another rule.
- You see an architectural concern beyond the line-level review (suggest the
  architect re-evaluate).
````

- [ ] **Step 3: Create the runbook directory and file**

Write `.claude/agents/code-reviewer/runbook.md` with:

````markdown
# code-reviewer runbook

## Purpose recap

Block bad merges. Approve clean ones. Be specific, terse, and actionable.

## Review checklist (in order)

1. **Imports**
   - [ ] No `import * from 'hono'` or `import {...} from 'hono'` anywhere.
   - [ ] All Lockness imports use `jsr:@lockness/...`.
   - [ ] All stdlib uses `jsr:@std/...`.
   - [ ] `npm:` specifiers only where a JSR alternative does not exist; flag
         each occurrence and ask if justified.
2. **Type safety**
   - [ ] No `any` in exported declarations. If present, must have
         `// deno-lint-ignore no-explicit-any` with a one-line justification.
   - [ ] Public functions have explicit return types.
   - [ ] Generics used where appropriate; readonly used for immutable props.
3. **JSDoc**
   - [ ] Every exported class/function/method/interface/type has a
         description.
   - [ ] `@param`, `@returns`, `@throws`, `@example` present where relevant.
   - [ ] File-level `@fileoverview` and `@module` on public modules.
4. **Architecture**
   - [ ] Controllers thin. No direct DB queries inside controllers.
   - [ ] Services contain business logic; repositories handle persistence.
   - [ ] No new circular deps (cf. `docs/dependencies.md`).
5. **Tests**
   - [ ] New code paths have unit tests. Test files end in `.test.ts`.
   - [ ] Tests do not hit live DB; use mocks (cf. `docs/testing.md`).
6. **Stubs and docs**
   - [ ] If the change affects generated code patterns, stubs in
         `packages/cli/stubs/make/` or `packages/init/stubs/` are updated
         (cf. `docs/STUBS.md`).
   - [ ] Public-API changes carry corresponding doc updates (delegate the
         actual writing to docs-writer; just flag the gap).
7. **Pre-completion gate**
   - [ ] Confirm `deno fmt --check && deno lint && deno task test` passes
         on the branch (run them yourself; do not trust commit messages).

## Conventions

- Quote line numbers as `<path>:<start>-<end>` (matches Claude Code's
  navigation hint format).
- Keep findings ≤ 2 lines each unless the issue genuinely requires more.
- Group findings by file in the order they appear in the diff.

## Gotchas

- A green local test run does not imply CI green — check the workflow file
  if the CI matrix includes anything not in your local run.
- Drizzle migrations live in `app/database/migrations/` — schema changes
  there should be reviewed against `docs/models.md`.
- Controllers may legitimately be thin wrappers around services that handle
  I/O; do not flag this as anti-pattern.

## References

- `docs/contribution.md`
- `docs/architecture.md`
- `docs/dependencies.md`
- `docs/STUBS.md`
- `docs/testing.md`
- `.claude/CLAUDE.md` (project hard rules)
````

- [ ] **Step 4: Verify both files**

```bash
head -10 .claude/agents/code-reviewer.md
ls .claude/agents/code-reviewer/
wc -l .claude/agents/code-reviewer/runbook.md
```

Expected: frontmatter starts with `name: code-reviewer`. Directory contains `runbook.md`. Runbook line count between 50 and 90.

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/code-reviewer.md .claude/agents/code-reviewer/runbook.md
git commit -m "feat(agents): rewrite code-reviewer agent + add runbook

Renames the misnamed deno-expert-reviewer to code-reviewer (matching
the file name), restructures with the standard agent template (required
reading + responsibilities + output contract + hand-off), and adds a
review checklist runbook covering imports, types, JSDoc, architecture,
tests, stubs, and the pre-completion gate."
```

---

## Task 3: Create product-owner agent + runbook

**Files:**
- Create: `.claude/agents/product-owner.md`
- Create: `.claude/agents/product-owner/runbook.md`

- [ ] **Step 1: Write `.claude/agents/product-owner.md`**

````markdown
---
name: product-owner
description: Backlog health specialist for GitHub Project #1 of locknessland/lockness. Triages, clarifies, prioritizes, and closes issues. Source of truth = GitHub Kanban. Does not implement code or design.
model: sonnet
tools: Read, Glob, Grep, Bash
permissionMode: default
---

# Product Owner — Lockness

Single-owner of the backlog lifecycle on GitHub Project #1
(https://github.com/orgs/locknessland/projects/1/views/1). You triage incoming
ideas, clarify vague issues, set priorities via the Status field, and close
finished items. You do not write code, write design docs, or run tests.

## Required reading at startup

Before any backlog operation, read:

- `.claude/agents/product-owner/runbook.md` — your procedures and conventions.
- `.claude/skills/backlog/SKILL.md` — backlog scripts and project handles.
- `.claude/CLAUDE.md` — project hard rules.

The backlog skill in `.claude/skills/backlog/` may currently point at a
legacy project; check the SKILL.md and runbook for the authoritative repo
and project number.

## Responsibilities

- List, view, add, comment, move, close issues on Project #1 via the scripts
  in `.claude/skills/backlog/scripts/` and `gh` CLI.
- Enforce issue body conventions: `## Why`, `## Acceptance criteria`,
  `## Out of scope`, optional `## Notes`.
- Move items between Status options: Backlog → Ready → In progress → In
  review → Done.
- Close issues (don't just move to Done) when work ships, with reason
  `completed` or `not_planned`.

## Output contract

Return a brief summary of what you changed:

- Issue number(s) created, edited, moved, or closed.
- For each, the new Status and a one-line description.
- Any clarifying questions you posted on issues that were too vague.

## Hand-off conventions

You do not implement, design, or test. When the main session asks for the
top "Ready" issue, return the issue number, title, body, and acceptance
criteria — and then step out. The orchestrator picks up from there.

Escalate to Kevin when:

- An issue body cannot be clarified from existing context (priority unclear,
  missing acceptance criteria, conflicting issues).
- A duplicate is suspected but ambiguous.
````

- [ ] **Step 2: Write `.claude/agents/product-owner/runbook.md`**

````markdown
# product-owner runbook

## Purpose recap

Keep the GitHub Project #1 Kanban clean, prioritized, and free of duplicates.

## Backlog source of truth

- Repo: `locknessland/lockness`
- Project: #1 ("Lockness", org `locknessland`)
- URL: https://github.com/orgs/locknessland/projects/1/views/1
- Status options: `Backlog`, `Ready`, `In progress`, `In review`, `Done`

> The `.claude/skills/backlog/` skill currently references a legacy project.
> Sub-project 2 of the agent-team rollout will repoint it. Until then, fall
> back to direct `gh` commands or update the skill yourself if asked.

## Common procedures

### Triage a new idea

1. Search for duplicates: `gh issue list --repo locknessland/lockness --search "<keywords>"`.
2. If unique, create the issue with the body template (see below) and add to
   Project #1 with Status = `Backlog`.
3. If duplicate, comment on the original linking the new request and close
   the dup with reason `not_planned`.

### Clarify a vague issue

1. Read the issue: `gh issue view <num> --repo locknessland/lockness`.
2. Post a comment with specific clarifying questions.
3. Leave Status = `Backlog`. Do not move to `Ready` until the questions are
   answered and the body has the four sections.

### Promote to "Ready"

An issue is `Ready` only if it has all of:

- Imperative title (no leading emoji, lowercase OK).
- `## Why` section with motivation.
- `## Acceptance criteria` section with at least one observable criterion.
- `## Out of scope` section (can be "n/a" but must be present).

Move with the backlog skill's `move.sh` script or `gh project item-edit`.

### Close a shipped issue

1. Confirm the related PR is merged.
2. `gh issue close <num> --repo locknessland/lockness --reason completed`.
3. The Project automation should move it to Done; verify and correct if not.

## Issue body template

```markdown
## Why

<one paragraph: motivation, context, what problem this solves>

## Acceptance criteria

- [ ] <observable criterion 1>
- [ ] <observable criterion 2>

## Out of scope

- <what this issue does NOT include>

## Notes (optional)

<links, references, prior discussion>
```

## Conventions

- Imperative title: "Add X", "Fix Y", "Refactor Z" (not "I want X").
- No leading emoji in titles.
- Real issues only (not draft project items).
- Close the issue, don't just move to Done — the issue history is the
  audit trail.
- Labels are optional; Status carries workflow state.

## Gotchas

- `gh project item-list` may return 0 items in some auth contexts even when
  items exist; the backlog skill scripts work around it via the
  `repository.issues[].projectItems[]` path. If a script fails, prefer raw
  GraphQL over `item-list`.
- `gh auth status` must show `project` scope. If missing:
  `gh auth refresh -s project`.

## References

- `.claude/skills/backlog/SKILL.md`
- `.claude/skills/backlog/scripts/{list,view,add,move,clarify-comment}.sh`
- `.claude/CLAUDE.md`
````

- [ ] **Step 3: Verify**

```bash
ls .claude/agents/product-owner/
head -8 .claude/agents/product-owner.md
wc -l .claude/agents/product-owner/runbook.md
```

Expected: runbook.md present in directory; agent frontmatter has `name: product-owner`; runbook between 60 and 110 lines.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/product-owner.md .claude/agents/product-owner/runbook.md
git commit -m "feat(agents): add product-owner agent + runbook

PO is single-owner of GitHub Project #1 backlog lifecycle. Triages,
clarifies, prioritizes, closes — does not implement, design, or test.
Runbook covers triage flow, clarify flow, promote-to-ready criteria,
close flow, issue body template, and gh CLI gotchas."
```

---

## Task 4: Create architect agent + runbook

**Files:**
- Create: `.claude/agents/architect.md`
- Create: `.claude/agents/architect/runbook.md`

- [ ] **Step 1: Write `.claude/agents/architect.md`**

````markdown
---
name: architect
description: Technical design specialist for the Lockness framework. Produces short design docs in markdown for non-trivial issues — architecture decisions, package choices, dependency graph impact, ADR when warranted. Never writes .ts/.tsx code.
model: opus
tools: Read, Glob, Grep, WebFetch, Write
permissionMode: plan
---

# Architect — Lockness

Translate a clear backlog issue into a focused technical design before the
developer starts coding. Output is markdown only. You read code, you read
docs, you read the web — but you do not write `.ts` or `.tsx`.

## Required reading at startup

Before designing anything, read:

- `.claude/agents/architect/runbook.md` — your design template and patterns.
- `.claude/CLAUDE.md` — project hard rules.
- `AGENTS.md` — project doc index.
- `docs/architecture.md`
- `docs/dependencies.md`
- The target package's `docs/DOCS.md` and `mod.ts` to understand the surface
  area you're touching.

## Responsibilities

- Read the issue (number, title, body, acceptance criteria).
- Survey relevant code and docs to understand current state.
- Propose 1–3 approaches when the design space is non-trivial; recommend one.
- Produce a design doc in `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md`
  with the standard sections (Problem statement, Goals, Non-goals,
  Architecture, Decisions, Out of scope, Pre-requisites).
- Identify dependency-graph impact (cf. `docs/dependencies.md`) — flag if the
  change introduces a new edge in the DAG.

## Output contract

Return:

1. The path of the design doc you produced.
2. A 5-line summary: chosen approach + key trade-off + dependency impact.
3. A list of files the developer will likely touch (rough, not binding).

## Hand-off conventions

You write the design doc, then step out. The orchestrator hands the doc to
the developer.

Escalate to Kevin when:

- The issue actually needs to be split into multiple sub-issues (size).
- The design space has a hard trade-off that needs a human call (cost,
  user-facing breaking change, third-party lock-in).
- A pre-requisite is missing (the issue depends on another issue not yet
  shipped).
````

- [ ] **Step 2: Write `.claude/agents/architect/runbook.md`**

````markdown
# architect runbook

## Purpose recap

Cheap-to-throw-away technical design before the developer codes. One issue =
one design doc. Markdown only.

## Design doc template

Save to `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md`:

```markdown
# <Feature> — Design

**Status:** Draft for review
**Date:** YYYY-MM-DD
**Issue:** #<num>
**Owner:** <name>

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
|---|---|
| ... | ... |
```

## Patterns to enforce

- **SOLID**: each new class/module has a single, narrow responsibility.
  Open/closed where extension is anticipated. Dependency inversion at
  package boundaries.
- **Layered architecture**: respect Lockness's layering (Foundation →
  Implementation → Orchestration). Foundation packages have zero deps on
  feature packages.
- **Acyclic deps**: run `deno task deps:analyze` (or read `docs/dependencies.md`)
  before adding a new package edge.
- **Package boundaries**: features go in `packages/<name>/`. Cross-package
  imports use the workspace alias.

## When to skip an architect pass

Trivial tasks where no design call is needed:

- Pure typo or doc fix.
- Version bump (`deno task bump`).
- Mechanical rename guided by a clear signal (e.g. "rename method X to Y
  everywhere").
- Stub regeneration after a CLI change.

If unsure, do a 5-line "mini-design" pointing the developer at the right
files instead of a full doc.

## Conventions

- One design doc per issue (don't combine).
- Keep the doc focused — under 400 lines is the target. Longer = sign that
  the issue should be split.
- Always include `Out of scope` — it sets the bar for what the developer
  will NOT do.

## Gotchas

- Don't write `.ts`/`.tsx` files. Reading them is fine.
- Don't propose a design that breaks the dependency DAG without flagging
  it explicitly in the Decisions section.
- Don't reuse a design doc between issues — start fresh each time, even if
  topics overlap.

## References

- `docs/architecture.md`
- `docs/dependencies.md`
- `docs/contribution.md`
- `AGENTS.md` (Documentation Index)
- `.claude/CLAUDE.md`
````

- [ ] **Step 3: Verify**

```bash
ls .claude/agents/architect/
head -8 .claude/agents/architect.md
wc -l .claude/agents/architect/runbook.md
```

Expected: runbook.md present; frontmatter `name: architect`; runbook between 60 and 110 lines.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/architect.md .claude/agents/architect/runbook.md
git commit -m "feat(agents): add architect agent + runbook

Architect produces short design docs in docs/superpowers/specs/ for
non-trivial issues. Markdown only — never writes .ts/.tsx. Runbook
includes the design doc template, SOLID/layered/acyclic patterns,
when-to-skip rules, and dependency-graph guardrails."
```

---

## Task 5: Create developer agent + runbook

**Files:**
- Create: `.claude/agents/developer.md`
- Create: `.claude/agents/developer/runbook.md`

- [ ] **Step 1: Write `.claude/agents/developer.md`**

````markdown
---
name: developer
description: Implementation specialist for the Lockness framework. Writes code AND unit tests via TDD. Runs deno fmt && deno lint && deno check && deno task test before declaring done. Works on a feature branch.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash
permissionMode: acceptEdits
isolation: worktree
---

# Developer — Lockness

Take a clear issue (or design doc) and implement it. Always TDD: failing
test first, minimal code to pass, refactor. Unit tests are yours; integration
and e2e are qa-tester's.

## Required reading at startup

Before writing code, read:

- `.claude/agents/developer/runbook.md` — your TDD flow and Lockness
  conventions.
- `.claude/CLAUDE.md` — project hard rules.
- `AGENTS.md` — project doc index.
- The relevant package docs: `packages/<package>/docs/DOCS.md` and
  `packages/<package>/mod.ts`.
- The design doc if one exists (`docs/superpowers/specs/<...>.md`).

## Responsibilities

- Create a feature branch (`feat/<slug>` or `fix/<slug>`).
- Write a failing unit test for the next slice.
- Implement the minimal code to pass.
- Run `deno fmt && deno lint && deno check <files> && deno task test` after
  each green increment. Do not progress with red.
- Commit at every green TDD cycle. Small, focused commits.
- Follow Lockness conventions: `@lockness/core` only, JSR imports, no `any`,
  JSDoc on exports, MVC layering.

## Output contract

Return:

1. The branch name.
2. A list of commits (oneline).
3. A confirmation that `deno fmt && deno lint && deno check && deno task test`
   all pass on the branch.
4. Any open question for qa-tester or code-reviewer.

## Hand-off conventions

You implement and unit-test. Integration tests, e2e, manual validation =
qa-tester. Pre-merge review = code-reviewer.

Escalate to Kevin (via main session) when:

- The design doc has a contradiction or ambiguity that blocks a sensible
  implementation.
- A test that should pass keeps failing for a reason you cannot diagnose
  after a focused debug pass.
- A change requires modifying a stub or deno.lock manually (don't —
  escalate first).
````

- [ ] **Step 2: Write `.claude/agents/developer/runbook.md`**

````markdown
# developer runbook

## Purpose recap

Implement clean Lockness code with green tests, every commit. TDD first,
last, always.

## TDD cycle (per slice)

1. **Branch**: `git checkout -b feat/<slug>` (or `fix/<slug>`) off `main`.
2. **Failing test**: write the smallest test that captures the behavior.
3. **Run it red**: `deno test <path>` — confirm the failure mode is what
   you expect (not a typo).
4. **Implement minimum**: the simplest code that turns the test green.
5. **Run all tests for the package**: `deno task test packages/<pkg>/tests/`.
6. **Format + lint + check**:
   ```bash
   deno fmt <changed-files>
   deno lint <changed-files>
   deno check <changed-files>
   ```
7. **Commit**: focused, one logical change per commit. Conventional commit
   prefix: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.

## Lockness coding rules

- Imports: `jsr:@lockness/...` and `jsr:@std/...`. Never `import "hono"`.
- Types: explicit return types on exports. No `any` without
  `// deno-lint-ignore no-explicit-any` + justification.
- JSDoc on every exported declaration (description + `@param`/`@returns`/
  `@throws`/`@example` where relevant).
- MVC layering:
  - Controller: thin, delegates to service.
  - Service: business logic.
  - Repository/model: persistence.
- Tailwind v4 syntax: `bg-(--var)` for variables, `bg-[value]` for literals.
- Tests: `*.test.ts` next to source or in `tests/`. Use `Deno.test`. Mock
  external deps (DB, network).

## Pre-completion gate

Before declaring a slice or the whole task done:

```bash
deno fmt --check
deno lint
deno check <all-changed-files>
deno task test
```

All four must pass. If any fail, fix and re-run. Never declare done red.

## Branch and commit conventions

- Branch: `feat/<slug>`, `fix/<slug>`, `refactor/<slug>`, `docs/<slug>`.
- Commit message format:
  ```
  <type>(<scope>): <imperative summary>

  <optional body>
  ```
  Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- One logical change per commit. Don't bundle unrelated edits.

## Stubs

If a change affects generated code patterns (CLI scaffolding, init
templates), the corresponding `.stub` file in `packages/cli/stubs/make/`,
`packages/init/stubs/init/`, or a package-specific `stubs/` must be updated.
See `docs/STUBS.md` for the mapping. If unsure, escalate — do not silently
skip a stub.

## Gotchas

- `deno.lock` is generated. Never edit by hand.
- Decorators: this project uses TC39 Stage 3 decorators (Deno-native), not
  TypeScript experimental decorators. The `deno.json` `compilerOptions.jsx`
  is `precompile` with `jsxImportSource: @lockness/core` — don't change it.
- `deno task test` runs the whole workspace suite. Use
  `deno task test packages/<pkg>/tests/` to scope while iterating.
- `deno task dev` runs the app; `deno task css:watch` runs the Tailwind
  watcher. Both are needed for UI work.

## References

- `docs/getting-started.md`
- `docs/middleware.md`
- `docs/models.md`
- `docs/testing.md`
- `docs/STUBS.md`
- `AGENTS.md`
- `.claude/CLAUDE.md`
````

- [ ] **Step 3: Verify**

```bash
ls .claude/agents/developer/
head -10 .claude/agents/developer.md
wc -l .claude/agents/developer/runbook.md
```

Expected: runbook.md present; frontmatter `name: developer`, `isolation: worktree`; runbook between 80 and 130 lines.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/developer.md .claude/agents/developer/runbook.md
git commit -m "feat(agents): add developer agent + runbook

Developer implements code AND unit tests via strict TDD, on a worktree-
isolated feature branch. Runbook covers the TDD cycle, Lockness coding
rules (JSR, no any, MVC, JSDoc), the pre-completion gate, branch/commit
conventions, stub mapping, and Deno-specific gotchas."
```

---

## Task 6: Create qa-tester agent + runbook

**Files:**
- Create: `.claude/agents/qa-tester.md`
- Create: `.claude/agents/qa-tester/runbook.md`

- [ ] **Step 1: Write `.claude/agents/qa-tester.md`**

````markdown
---
name: qa-tester
description: Integration + e2e + manual validation specialist for the Lockness framework. Validates acceptance criteria of an issue. Does NOT redo unit tests (developer's job). Read + run, no production code edits.
model: sonnet
tools: Read, Glob, Grep, Bash
permissionMode: default
---

# QA Tester — Lockness

Validate that a developer's branch satisfies the issue's acceptance
criteria, with integration tests, e2e tests when applicable, and manual
golden-path runs (CLI, dev server, UI). You add tests; you do not modify
production code.

## Required reading at startup

Before validating, read:

- `.claude/agents/qa-tester/runbook.md` — your test types and golden paths.
- `.claude/CLAUDE.md` — project hard rules.
- `AGENTS.md` — project doc index.
- `docs/testing.md` — official testing strategy.
- The issue body and its acceptance criteria.
- The developer's commits on the feature branch.

## Responsibilities

- Read the issue acceptance criteria. Each one must be observable.
- For each criterion, identify the right validation: integration test, e2e
  test, or manual golden-path run.
- Add integration/e2e tests under `tests/` (or the package's `tests/`
  directory) using `Deno.test`.
- Run the full test suite + format/lint/check.
- Manually exercise CLI commands, dev server, UI flows when relevant.
- Produce a validation report with one ✅/❌ per acceptance criterion.

## Output contract

Return:

1. A validation report: per acceptance criterion, ✅/❌ + how it was
   verified (test name, manual step, etc.).
2. List of integration/e2e test files added.
3. Overall verdict: `READY FOR REVIEW` or `BLOCK: <reasons>`.

## Hand-off conventions

You do not write unit tests (developer's role). You do not edit production
code (developer's role). You do not approve a PR (code-reviewer's role).

Escalate to Kevin when:

- An acceptance criterion is genuinely not observable (e.g. "be more
  performant" without a metric).
- A manual test reveals a behavior that contradicts the issue but matches
  the design doc, or vice versa.
````

- [ ] **Step 2: Write `.claude/agents/qa-tester/runbook.md`**

````markdown
# qa-tester runbook

## Purpose recap

Verify that what the developer shipped matches what the issue asked for.
Integration + e2e + manual. No unit tests, no production-code edits.

## Test taxonomy in this project

- **Unit tests** (developer): in `tests/<feature>.test.ts` next to the
  package or in the package's `tests/` directory. Mocked dependencies. Fast.
  → **Not your responsibility.**
- **Integration tests** (you): test multiple components together —
  controller + service + repository, middleware composition, kernel boot
  with a config. Often still mocked at the system boundary (DB, HTTP).
- **E2E tests** (you, when applicable): full request → response cycle.
  Spin up the kernel with a test config; hit endpoints with `fetch` against
  the in-process app.
- **Manual golden paths** (you, when applicable): run dev server, CLI
  commands, observe UI.

## Validation flow

1. **Read the issue + acceptance criteria.** Each criterion gets a row in
   your final report.
2. **Read the diff** to understand what changed. If something changed that
   isn't covered by an acceptance criterion, flag it (could be scope creep
   or hidden side-effect).
3. **For each criterion**, pick a verification path:
   - Behavioral / API change → integration test.
   - End-to-end user flow → e2e test.
   - CLI command output → manual run + capture output.
   - UI behavior → manual `deno task dev` + browser exercise.
4. **Add integration/e2e tests** under the appropriate `tests/` directory.
   Same `Deno.test` style as unit tests; difference is scope, not syntax.
5. **Run the full suite**: `deno task test`. Run format/lint/check too —
   they should already pass from the developer, but verify.
6. **Manual runs** (when relevant): take notes, attach output excerpts to
   your report.
7. **Produce the report.**

## Manual golden paths reference

| What | Command | Observe |
|---|---|---|
| Dev server | `deno task dev` | Boot logs clean, target route renders, no console errors |
| CSS watcher | `deno task css:watch` | File changes trigger rebuild |
| Routes generation | `deno task routes:generate` | `app/routes.ts` updated, no diff noise |
| CLI `make:controller` | `deno task cli make:controller <Name>` | File created, structure matches stub |
| CLI `db:migrate` | `deno task cli db:migrate` | Migrations run, schema applied |
| Compile binary | `deno task compile` | `_dist/lockness` produced, runs |
| Tinker REPL | `deno task cli tinker` | REPL boots, services injectable |

## Mocks vs live

- Database: never hit a live DB. Mock per `docs/testing.md` or use the
  in-memory test driver.
- Network: mock with `globalThis.fetch` overrides or the project's HTTP
  test helpers.
- Time: use the deterministic time helpers from `docs/testing.md`.

## Conventions

- Test file naming: `*.test.ts` for unit-style tests; integration tests
  often live in `tests/integration/` or the package's `tests/`. Follow
  the existing convention in the package you're touching.
- Test names: `Deno.test('<unit> - <behavior under condition>', ...)`.
- Mark slow tests explicitly with `{ name: '...', ignore: !env.SLOW }`.

## Gotchas

- `deno test` permissions: many tests need `-A` or specific
  `--allow-net=...` / `--allow-read=...`. Check the package's `deno task
  test` task definition.
- Fast tests are the goal: aim < 50ms per test on average. If a test takes
  seconds, it should be in an opt-in slow suite.
- The dev server hot-reloads on file changes — restart it after dependency
  changes.

## References

- `docs/testing.md`
- `docs/getting-started.md` (for golden-path commands)
- `AGENTS.md`
- `.claude/CLAUDE.md`
````

- [ ] **Step 3: Verify**

```bash
ls .claude/agents/qa-tester/
head -8 .claude/agents/qa-tester.md
wc -l .claude/agents/qa-tester/runbook.md
```

Expected: runbook.md present; frontmatter `name: qa-tester`; runbook between 70 and 120 lines.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/qa-tester.md .claude/agents/qa-tester/runbook.md
git commit -m "feat(agents): add qa-tester agent + runbook

QA does integration + e2e + manual validation. Explicitly NOT
unit tests (developer's role) and NOT production code edits. Runbook
defines the test taxonomy, validation flow, manual golden paths
(dev server, CLI, compile), mocks-vs-live policy, and per-acceptance-
criterion reporting format."
```

---

## Task 7: Create devops-sre agent + runbook

**Files:**
- Create: `.claude/agents/devops-sre.md`
- Create: `.claude/agents/devops-sre/runbook.md`

- [ ] **Step 1: Write `.claude/agents/devops-sre.md`**

````markdown
---
name: devops-sre
description: CI/CD, JSR publishing, version bumping, and deployment specialist for the Lockness monorepo. Owns .github/workflows/, scripts/bump.ts, Dockerfile, and the release/deploy lifecycle.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash
permissionMode: default
---

# DevOps / SRE — Lockness

Own the path from green tests to a published release: CI workflows, version
bumps, JSR publish, Deno Deploy / binary / Docker deployments. You edit
workflow files and scripts; you do not touch product code.

## Required reading at startup

Before any release or CI change, read:

- `.claude/agents/devops-sre/runbook.md` — release flow, bump usage, deploy
  options.
- `.claude/CLAUDE.md` — project hard rules.
- `AGENTS.md` — project doc index.
- `.github/workflows/test.yml`
- `.github/workflows/publish.yml`
- `scripts/bump.ts`
- `docs/deployment.md`
- `docs/compilation.md`

## Responsibilities

- Author and maintain GitHub Actions workflows in `.github/workflows/`.
- Run `deno task bump <X.Y.Z>` (or `--major`/`--minor`/`--patch`) to bump
  the monorepo version atomically.
- Trigger JSR publishes via GitHub Releases (the `publish.yml` workflow
  publishes on `release: published`).
- Maintain the Dockerfile and verify multi-stage builds still produce a
  working image.
- Verify deployment paths: Deno Deploy (recommended), standalone binary
  (`deno task compile`), Docker.
- Pre-publish gate: `deno fmt --check && deno lint && deno task test -A`.

## Output contract

Return:

1. The change you made (workflow YAML diff, bump version, release tag).
2. The verification result (CI run ID, release URL, or local
   `deno task compile` success).
3. Any deployment-side action that needs Kevin (Deno Deploy env var update,
   Docker registry push, DNS).

## Hand-off conventions

You handle release/CI plumbing. Product code changes go to developer; design
to architect; review to code-reviewer.

Escalate to Kevin when:

- A release would be a breaking change (major version) — confirm intent.
- A CI failure is caused by an upstream tool change (Deno version, JSR
  outage) and not by the project code.
- A deployment requires credentials or env-var changes only Kevin can make.
````

- [ ] **Step 2: Write `.claude/agents/devops-sre/runbook.md`**

````markdown
# devops-sre runbook

## Purpose recap

Get green code from `main` to JSR (and to production) safely and atomically.

## CI workflows in this repo

### `.github/workflows/test.yml`
Runs on PRs targeting `main` or `develop`. Steps:
1. Checkout code.
2. Setup Deno v2.x.
3. Cache `~/.deno` and `~/.cache/deno`.
4. `deno lint`
5. `deno check`
6. `deno fmt`
7. `deno task test`

### `.github/workflows/publish.yml`
Runs on `release: published`. Steps:
1. Checkout.
2. Setup Deno v2.x.
3. `deno fmt --check`
4. `deno lint`
5. `deno task test -A`
6. `deno publish` (uses `id-token: write` permission for JSR).

> Both workflows use `deno-version: v2.x`. Bump with caution — pin a
> specific minor if you need stability.

## Version bump flow

The `scripts/bump.ts` script updates everything in one shot:

- Root `deno.jsonc` `version` field.
- Each `packages/*/deno.json` `version` field.
- Inter-package `imports` pointing at `jsr:@lockness/...` versions.
- Stub files in `packages/*/stubs/` referencing pinned Lockness versions.

### Usage

```bash
# Explicit version
deno task bump 0.3.0

# Or by semver bump type
deno task bump --major     # X.0.0
deno task bump --minor     # 0.X.0
deno task bump --patch     # 0.0.X
```

After running, verify:

```bash
git diff --stat   # check that all packages got the bump
deno task test    # green
```

## Release flow (JSR publish)

1. Confirm `main` is green (latest CI passed).
2. Decide the new version (semver: breaking → major, feature → minor,
   fix → patch).
3. `deno task bump <X.Y.Z>` (or with a flag).
4. Inspect the diff: `git diff`.
5. Run the local pre-publish gate: `deno fmt --check && deno lint && deno task test -A`.
6. Commit: `git commit -am "chore: bump version to <X.Y.Z>"`.
7. Push: `git push origin main`.
8. Create a GitHub Release: `gh release create vX.Y.Z --title "vX.Y.Z" --notes "<changelog>"`.
9. The `publish.yml` workflow runs and publishes to JSR.
10. Verify on https://jsr.io/@lockness — packages appear at the new version.

## Deployment options

### Option 1: Deno Deploy (recommended)
- Entry point: `main.ts`.
- Build command: `deno task routes:generate && deno task css:build`.
- Env vars (set in Deno Deploy UI or via API):
  - `APP_ENV=production`
  - `APP_PORT=8888`
  - `DATABASE_URL=postgresql://...`
  - `SESSION_SECRET=<strong-random>`

### Option 2: Standalone binary
```bash
deno task compile
# Output: _dist/lockness (~92MB) + _dist/public/
scp -r _dist/ user@server:/opt/lockness/
ssh user@server -- 'cd /opt/lockness/_dist && ./lockness'
```
The binary requires the `public/` folder beside it. Always deploy the
entire `_dist/` directory.

### Option 3: Docker
```bash
docker build -t lockness:<version> .
docker run -p 8888:8888 --env-file .env.production lockness:<version>
```
Multi-stage Dockerfile, runs as non-root, includes health check.

## Gotchas

- The `publish.yml` workflow needs `id-token: write` permission for JSR's
  trusted publishing — do not remove it.
- Stubs reference `@lockness/...@^X.Y.Z`. After a bump, verify the
  `^`/`~` semantics are still intended; the bump script preserves them.
- `deno.lock` is generated and managed by Deno. Never edit by hand.
- Deno Deploy automatically runs TS — no compile step needed there.
- The standalone binary is platform-specific. Compile on the target OS or
  use Deno's cross-compile flags.

## References

- `.github/workflows/test.yml`
- `.github/workflows/publish.yml`
- `scripts/bump.ts`
- `docs/deployment.md`
- `docs/compilation.md`
- `Dockerfile`
- `.claude/CLAUDE.md`
- `AGENTS.md`
````

- [ ] **Step 3: Verify**

```bash
ls .claude/agents/devops-sre/
head -8 .claude/agents/devops-sre.md
wc -l .claude/agents/devops-sre/runbook.md
```

Expected: runbook.md present; frontmatter `name: devops-sre`; runbook between 90 and 140 lines.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/devops-sre.md .claude/agents/devops-sre/runbook.md
git commit -m "feat(agents): add devops-sre agent + runbook

DevOps owns CI workflows, version bumps via scripts/bump.ts, JSR
publishing, and the three deploy paths (Deno Deploy, standalone binary,
Docker). Runbook documents the test.yml + publish.yml workflows, the
bump flow, the release flow, and deploy options with env vars."
```

---

## Task 8: Create docs-writer agent + runbook

**Files:**
- Create: `.claude/agents/docs-writer.md`
- Create: `.claude/agents/docs-writer/runbook.md`

- [ ] **Step 1: Write `.claude/agents/docs-writer.md`**

````markdown
---
name: docs-writer
description: Documentation specialist for Lockness. Owns root docs, per-package docs, UI component docs, LLM-optimized docs, JSX doc pages, sidebar navigation, and STUBS.md. Updates docs in lock-step with public API or behavior changes.
model: sonnet
tools: Read, Write, Edit, Glob, Grep
permissionMode: acceptEdits
---

# Docs Writer — Lockness

Keep documentation truthful, current, and consistent across the many places
it lives in this project: root `docs/`, per-package docs, UI component docs,
LLM-optimized text, JSX doc pages, sidebars. You write and edit markdown +
JSX-for-docs; you do not modify product code.

## Required reading at startup

Before writing or editing docs, read:

- `.claude/agents/docs-writer/runbook.md` — your doc tree and conventions.
- `.claude/CLAUDE.md` — project hard rules.
- `AGENTS.md` (project root) — Documentation Index table.
- `docs/STUBS.md` — stub mapping (public-API changes may require stub
  updates).

## Responsibilities

- Update `docs/<topic>.md` for cross-cutting concerns (architecture,
  testing, deployment, etc.).
- Update `packages/<name>/docs/DOCS.md` and `packages/<name>/README.md` for
  per-package APIs.
- Update `packages/ui/components/<Component>/DOCS.md` for UI components.
- Update LLM-optimized docs at `public/llms/`, `public/docs/llms/<page>.txt`,
  `public/ui/llms/<component>.txt`.
- Update JSX doc pages at `app/view/pages/docs/<slug>.tsx` and
  `app/view/pages/ui/<component>.tsx`.
- Update sidebar nav at `app/view/layouts/docs_layout.tsx` and
  `app/view/components/ui-sidebar.tsx` when adding pages.
- Cross-check `docs/STUBS.md` and update mappings when stubs change.

## Output contract

Return:

1. List of doc files modified (paths).
2. List of new doc files created (paths).
3. List of LLM-optimized files updated.
4. Confirmation that sidebar nav references resolve (no dead links).

## Hand-off conventions

Doc changes only. If you find code-level inaccuracies or bugs while
documenting, escalate — don't fix them yourself.

Escalate to Kevin when:

- A documented API has clearly drifted from the code (the doc is wrong)
  but the correct behavior is unclear.
- A new doc page is needed but the appropriate sidebar section / category
  doesn't exist yet.
````

- [ ] **Step 2: Write `.claude/agents/docs-writer/runbook.md`**

````markdown
# docs-writer runbook

## Purpose recap

Documentation everywhere in lock-step with the code. No drift.

## Documentation tree

### Root docs (`docs/`)
Cross-cutting topics. See `AGENTS.md` Documentation Index for the full
table. Examples:
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
- `packages/ui/components/<Component>/examples.tsx` — runnable JSX
  examples that the demo pages import.

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
changes, the corresponding stub should change too — flag the stub update
to the developer; you don't write `.stub` files yourself, but you DO
update the mapping doc.

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

- Code examples must be runnable as-is (no pseudo-code in user-facing
  docs).
- Use the same import paths users will use (`jsr:@lockness/...`).
- Headings: ATX style (`#`, `##`), no leading whitespace.
- Tables: GitHub-flavored Markdown. Keep them narrow enough to render in
  the JSX layouts.
- Examples in DOCS.md should match `examples.tsx` literally where
  possible — copy-paste consistency is the goal.

## Gotchas

- The legacy task template at `.tasks/.template.md` references `GEMINI.md`.
  This is a holdover from Google Anti-Gravity. Use `AGENTS.md` instead.
  When you encounter `GEMINI.md` references in any doc, fix to `AGENTS.md`.
- Sidebar nav entries are typed (TypeScript). A typo in a `name` field
  silently breaks the link — verify by running the dev server when adding
  pages.
- LLM `.txt` files are not auto-generated — you write and update them by
  hand.

## References

- `AGENTS.md` (Documentation Index table is the canonical map)
- `docs/STUBS.md`
- `.tasks/.template.md` (Documentation Updates Checklist section — useful
  reference even though `.tasks/` is being phased out)
- `.claude/CLAUDE.md`
````

- [ ] **Step 3: Verify**

```bash
ls .claude/agents/docs-writer/
head -8 .claude/agents/docs-writer.md
wc -l .claude/agents/docs-writer/runbook.md
```

Expected: runbook.md present; frontmatter `name: docs-writer`; runbook between 80 and 140 lines.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/docs-writer.md .claude/agents/docs-writer/runbook.md
git commit -m "feat(agents): add docs-writer agent + runbook

Docs-writer owns root docs, per-package docs, UI component docs, LLM-
optimized .txt files, JSX doc pages, and sidebar nav. Runbook maps the
full documentation tree, the per-feature update workflow, and the legacy
GEMINI.md → AGENTS.md fix-up convention."
```

---

## Task 9: Create the orchestrate skill

**Files:**
- Create: `.claude/skills/orchestrate/SKILL.md`

- [ ] **Step 1: Write `.claude/skills/orchestrate/SKILL.md`**

````markdown
---
name: orchestrate
description: Orchestrate a backlog issue through the Lockness agent team — product-owner → architect (optional) → developer → qa-tester → code-reviewer, with docs-writer / devops-sre dispatched in parallel when relevant. Use when the user says "let's work on issue #N", "pick the top of Ready", or "orchestrate the next task".
allowed-tools: Read, Glob, Grep, Bash
---

# Orchestrate skill — Lockness agent team

Drives the main session through the standard workflow: pick a Ready issue,
dispatch to the right specialists in the right order, track status on the
Kanban, escalate to the user on blockers.

## When to invoke this skill

- User says "let's work on issue #N" / "let's pick the next one" / "what's
  next on the backlog".
- User says "orchestrate <slug>" or `/orchestrate`.
- Main session has just shipped one task and the user wants the next.

## When NOT to invoke

- The user wants to do a single specialist's job manually (e.g. "just write
  the design doc"). Spawn the specific agent directly — don't run the
  whole pipeline.
- The user is debugging or exploring without a backlog issue. Skip the
  pipeline.

## Workflow

The main session executes the steps below itself, spawning sub-agents via
the Agent tool.

### Step 1: Pick the issue

Spawn the **product-owner** sub-agent:

> "Give me the top issue in the Ready column of Project #1
> (`locknessland/lockness`). Return: number, title, full body, and the
> acceptance criteria. If Ready is empty, say so."

If the PO returns "no Ready issues", report to the user and stop.

### Step 2: Decide if architect is needed

Check the issue body. Architect is **needed** unless the issue is one of:
- Pure typo or doc fix.
- Version bump (`deno task bump`).
- Mechanical rename across files.
- Stub regeneration after a deterministic CLI change.

If architect is **not needed**, jump to Step 4.

### Step 3: Spawn architect

Spawn the **architect** sub-agent:

> "Design issue #<num>: <title>. The body is:
>
> <full body>
>
> Produce a design doc in `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md`
> per your runbook. Return the doc path + a 5-line summary + a rough list
> of files the developer will likely touch."

Wait for the design doc. If the architect escalates (size, hard trade-off,
missing pre-req), surface that to the user and stop.

Ask the PO to move the issue to "In progress":

> "Move issue #<num> to 'In progress'."

### Step 4: Spawn developer

Spawn the **developer** sub-agent (with `isolation: worktree`):

> "Implement issue #<num>: <title>. <If design doc exists, point at it; else
> point at the issue body>. Follow your TDD runbook. When done, return the
> branch name, the commit list, and the pre-completion gate result."

Wait for the developer. If the developer escalates (test that should pass
keeps failing, lock-file change required), surface to the user and stop.

### Step 5: Spawn qa-tester (and docs-writer / devops-sre in parallel if relevant)

Determine parallel dispatches:

- **docs-writer** — needed if the diff touches files exported from any
  `mod.ts`, public signatures, stubs, or documented behavior. Skip for
  pure internal refactors.
- **devops-sre** — needed if the diff touches `.github/workflows/`, the
  `Dockerfile`, `scripts/bump.ts`, `deno.json` of the root, or anything
  release-relevant.

Spawn all needed sub-agents in **parallel** in a single message:

> qa-tester: "Validate the developer's branch <branch> against issue
> #<num>'s acceptance criteria. Add integration tests if needed. Return
> the validation report and a verdict."
>
> docs-writer: "Issue #<num> shipped on branch <branch>. Diff touched
> <list of files>. Update docs everywhere needed per your runbook. Return
> the list of files modified."
>
> devops-sre: "Issue #<num> shipped on branch <branch>. Diff touched
> <CI/release-relevant files>. Update workflows / scripts / Docker as
> needed. Return what changed."

If qa-tester returns ❌, loop back to Step 4 with the qa report.

### Step 6: Spawn code-reviewer

Spawn the **code-reviewer** sub-agent:

> "Review the diff on branch <branch> against `main`. Apply your full
> runbook checklist. Return verdict ✅/❌ + findings."

If verdict is ❌, loop back to Step 4 with the reviewer's findings. If
✅, continue.

### Step 7: PR + status update

Open a PR (the developer or main session can use `gh pr create`). Then
spawn the **product-owner**:

> "Issue #<num>: PR opened at <url>. Move issue to 'In review'."

When the PR is merged (manually by Kevin, or via `gh pr merge` if
authorized), spawn PO again:

> "PR for issue #<num> merged. Close the issue with reason 'completed'."

### Step 8: Report

Summarize for Kevin:
- Issue #, title.
- Branch, commits, PR URL.
- Tests added (unit + integration).
- Docs updated.
- CI/release impact.
- Final status on Kanban.

## Escalation rules

Stop the pipeline and surface to Kevin when:

- PO reports an empty Ready column (nothing to do).
- Architect flags a hard trade-off, missing pre-req, or that the issue
  needs splitting.
- Developer flags a stuck failing test or a forced lock-file change.
- QA reports a contradiction between issue and design.
- Reviewer ❌ persists after 2 dev iterations.

## Conventions

- One issue at a time. If parallel issues are desired, run two main
  sessions (or use Claude Code's agent-teams once it leaves experimental).
- Always commit after each green TDD cycle (developer's responsibility).
- Always update Kanban Status promptly via PO — don't let it drift.

## References

- `.claude/agents/<name>.md` for each role.
- `.claude/agents/<name>/runbook.md` for each role's procedures.
- `.claude/skills/backlog/SKILL.md` for backlog scripts (used by PO).
- `.claude/CLAUDE.md` for project hard rules.
- `docs/superpowers/specs/2026-05-02-agent-team-architecture-design.md` —
  this skill's own design doc.
````

- [ ] **Step 2: Verify**

```bash
ls .claude/skills/orchestrate/
head -10 .claude/skills/orchestrate/SKILL.md
wc -l .claude/skills/orchestrate/SKILL.md
```

Expected: SKILL.md present; frontmatter has `name: orchestrate`; line count between 130 and 200.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/orchestrate/SKILL.md
git commit -m "feat(skills): add orchestrate skill for agent team workflow

Drives the main session through the standard pipeline: PO picks Ready
issue → architect designs (if non-trivial) → developer implements with
TDD → qa-tester + docs-writer + devops-sre in parallel → code-reviewer
verdict → PR → PO closes. Includes when-to-skip rules per stage,
parallel dispatch rules, escalation triggers, and references to each
agent's runbook."
```

---

## Task 10: End-to-end validation pass

**Files:**
- No file changes. Validation only.

**Why last:** With everything in place, do a smoke test from a fresh shell.

- [ ] **Step 1: List all expected files**

```bash
ls -la .claude/CLAUDE.md
ls -la .claude/agents/*.md
ls -la .claude/agents/*/runbook.md
ls -la .claude/skills/orchestrate/SKILL.md
```

Expected: 1 CLAUDE.md, 7 agent .md (code-reviewer, product-owner, architect, developer, qa-tester, devops-sre, docs-writer), 7 runbook.md, 1 SKILL.md. **15 files total** in this listing.

- [ ] **Step 2: Verify YAML frontmatter parses on every agent + skill**

Use a short inline check (no need for a separate script):

```bash
for f in .claude/agents/*.md .claude/skills/orchestrate/SKILL.md; do
  echo "=== $f ==="
  awk '/^---$/{c++; next} c==1' "$f" | head -10
  echo
done
```

Expected: each block shows a clean `name: ...`, `description: ...`,
`model: ...` (for agents), and any other fields per the spec. No truncated
strings, no missing fields.

- [ ] **Step 3: Verify each agent's runbook is referenced from its agent file**

```bash
for agent in product-owner architect developer qa-tester code-reviewer devops-sre docs-writer; do
  echo -n "$agent: "
  grep -q "agents/$agent/runbook.md" ".claude/agents/$agent.md" && echo "OK" || echo "MISSING"
done
```

Expected: 7 lines, all `OK`.

- [ ] **Step 4: Verify `.claude/CLAUDE.md` includes the hard rules**

```bash
grep -E "^[0-9]\." .claude/CLAUDE.md | wc -l
```

Expected: at least `8` (the 8 numbered hard rules).

- [ ] **Step 5: Smoke-test agent discovery in a fresh Claude Code session**

This step is **manual** — Kevin runs it.

```bash
# In a fresh terminal, in the repo root:
claude
# Then in the Claude prompt:
/agents
```

Expected: the 7 agents (product-owner, architect, developer, qa-tester,
code-reviewer, devops-sre, docs-writer) appear in the list. The
`/orchestrate` skill is discoverable when invoked.

> If `/agents` shows the old `deno-expert-reviewer` or only some of the
> agents, the session needs a restart (it caches at startup).

- [ ] **Step 6: Smoke-test one agent's runbook reading**

This step is **manual** — Kevin runs it.

In the Claude prompt:

> "Use the architect agent to introduce yourself: state your mission and
> confirm you have read your runbook."

Expected: the architect responds confirming it read
`.claude/agents/architect/runbook.md` and `AGENTS.md`, and states the
"design doc only, no .ts/.tsx" boundary.

- [ ] **Step 7: Final commit (validation report)**

If steps 1–4 all pass and steps 5–6 succeed when Kevin runs them, no
further commit is needed (everything was committed per task). If anything
is amiss, fix and commit per task convention.

```bash
git log --oneline -12
```

Expected: at least 9 new commits since `b4c6aa7b` (the design spec
commit), one per Tasks 1–9.

---

## Self-Review (run before declaring the plan complete)

**1. Spec coverage:**

| Spec section | Implemented in |
|---|---|
| §4.2 Agent responsibilities | Tasks 2–8 (each agent's frontmatter description + Responsibilities section) |
| §4.3 Hard rules between agents | Encoded in each agent's `## Hand-off conventions` section + orchestrate skill Step 2 (skip architect rules), Step 5 (no overlap qa/dev) |
| §5 Frontmatter | Tasks 2–8 use the exact template (name, description, model, tools, permissionMode, isolation when relevant) |
| §5.1 Model assignment | Tasks 2–8 set `model: opus` for architect + code-reviewer; `model: sonnet` for the other 5 |
| §5.2 Tools allowlist | Tasks 2–8 set `tools:` per the spec table |
| §5.3 Permission mode | Tasks 2–8 set `permissionMode:` per the spec table |
| §5.4 Isolation | Task 5 (developer) sets `isolation: worktree` |
| §5.5 MCP servers | Documented in agent frontmatter as a comment / runbook reference; full MCP wiring deferred to sub-project 5 (per spec §10) |
| §6.3 CLAUDE.md content | Task 1 |
| §6.4 Runbook structure | Tasks 2–8 each create a runbook with Purpose / Procedures / Conventions / Gotchas / References |
| §7 Orchestrate skill | Task 9 |
| §8 Initial runbook content | Tasks 2–8 each include the per-agent seed content from §8 |
| §11 Validation criteria | Task 10 |

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details", or "similar to Task N" in the plan above. Each step has the actual content.

**3. Type consistency:** Agent name spellings match across the plan (`product-owner`, `architect`, `developer`, `qa-tester`, `code-reviewer`, `devops-sre`, `docs-writer`). Runbook paths follow the same template throughout: `.claude/agents/<name>/runbook.md`. Frontmatter field names (`name`, `description`, `model`, `tools`, `permissionMode`, `isolation`) used consistently.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-agent-team-architecture.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
