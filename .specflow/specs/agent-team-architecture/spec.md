# Lockness Agent Team Architecture — Design

**Status:** Draft for review **Date:** 2026-05-02 **Owner:** Kevin **Scope:**
Sub-project 1 of 6 — Agent Team Architecture only. **Out of scope:** Backlog
skill repointing (sub-project 2), `.tasks/` migration (sub-project 3), Deno
skills installation (sub-project 4), hooks/channels/scheduled-tasks/MCP wiring
(sub-project 5), PO memory bootstrap (sub-project 6).

## 1. Problem statement

The Lockness project (Deno fullstack MVC framework, monorepo, ~25 packages) was
previously developed with Google Anti-Gravity. Kevin is moving to Claude Code to
work agentically. The current agentic setup is broken:

- 4 of 5 agent files in `.claude/agents/` are empty (1 line each).
- Only `code-reviewer.md` has content, and it's misnamed (its `name:` field is
  `deno-expert-reviewer`).
- The `.claude/skills/backlog/SKILL.md` exists but points to `mkrlabs/specflow`
  Project #4 — wrong repo (this project is `locknessland/lockness`).
- Tasks are tracked in 15 markdown files in `.tasks/` — Kevin wants the GitHub
  Project #1 Kanban (https://github.com/orgs/locknessland/projects/1/views/1) to
  become the single source of truth.
- No hooks, no scheduled tasks, no channels, no per-agent memory convention.

This spec defines the agent team architecture (8 specialized agents) following
the official Anthropic Agent SDK conventions. The other concerns are explicitly
deferred to later sub-projects.

## 2. Goals

1. Define **7 specialized sub-agents** + **1 main-session orchestrator**
   (encoded as a skill, not a sub-agent — see §7), each with a single,
   non-overlapping responsibility.
2. Use the official Anthropic memory model (`.claude/CLAUDE.md` +
   `.claude/agents/<name>.md` + per-agent runbooks) — no custom memory store.
3. Make agent definitions versioned, reviewable, and improvable by the team.
4. Encode the project's hard conventions (Deno, JSR, Lockness MVC, Tailwind v4,
   no direct Hono import) where every agent will see them — i.e. in
   `.claude/CLAUDE.md` and per-agent runbooks.
5. Avoid the experimental `agent-teams` feature and the fragile `channels`
   preview for this sub-project. Use the stable sub-agents pattern.

## 3. Non-goals

- Not building any GitHub Action, CI hook, Discord/Telegram channel, or
  scheduled task in this sub-project.
- Not migrating `.tasks/` content yet.
- Not installing Deno skills yet.
- Not initializing PO memory with backlog content yet.

## 4. Architecture

### 4.1 Topology

The orchestrator is **the main session**, not a sub-agent. This is a hard SDK
constraint: sub-agents cannot spawn other sub-agents. The 7 specialists are
sub-agents invoked via the `Agent` tool.

```
┌──────────────────────────────────────────────────────────────┐
│  Main session = orchestrator                                  │
│  Started via `claude` (no --agent flag) in this repo          │
│  Reads `.claude/CLAUDE.md` + `~/.claude/CLAUDE.md` automatic │
│  Has Agent tool restricted to the 7 sub-agents below         │
└──┬─────────┬─────────┬──────────┬─────────┬─────────┬────────┘
   ▼         ▼         ▼          ▼         ▼         ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐ ┌─────┐ ┌─────────┐ ┌────────┐
│ p-o  │ │ arch │ │ dev  │ │qa-tester │ │ rev │ │ devops  │ │ docs   │
│sonnet│ │ opus │ │sonnet│ │  sonnet  │ │ opus│ │ -sre    │ │ -writer│
│      │ │      │ │      │ │          │ │     │ │ sonnet  │ │ sonnet │
└──────┘ └──────┘ └──────┘ └──────────┘ └─────┘ └─────────┘ └────────┘
```

### 4.2 Agent responsibilities (single responsibility per agent)

| Agent             | Mission unique                                                                                                                                                                                                                                                                                               | Output                                                                                             | Skip-able?                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **product-owner** | Garde la santé du backlog GitHub Project #1 (triage, clarification, priorisation, fermeture). Lit/écrit issues.                                                                                                                                                                                              | Issues bien formées avec `## Why / ## Acceptance criteria / ## Out of scope`, statut Kanban à jour | Jamais                                                                                                                                                                |
| **architect**     | Design technique d'une issue : décisions d'archi, choix de packages, ADR si nécessaire. **Ne code pas — markdown only.**                                                                                                                                                                                     | Spec courte dans `docs/superpowers/specs/<date>-<slug>-design.md`                                  | Sur tâches triviales (typo, doc fix, version bump simple)                                                                                                             |
| **developer**     | Implémente le code de la spec. Écrit **aussi** les tests unitaires (TDD). Run `deno fmt && deno lint && deno check && deno task test`.                                                                                                                                                                       | Commits sur une branche feature, suite de tests verte                                              | Jamais sur tâche code                                                                                                                                                 |
| **qa-tester**     | Tests d'intégration et e2e (au-delà du unitaire), valide les acceptance criteria de l'issue, joue les golden paths CLI/UI manuellement quand pertinent.                                                                                                                                                      | Rapport de validation + tests d'intégration ajoutés                                                | Quand l'issue n'a aucune acceptance criterion observable (pure refacto interne sans changement de comportement, doc-only, version bump pur)                           |
| **code-reviewer** | Review pré-merge : SOLID, types stricts (`no any`), conventions Lockness (pas d'`hono` direct, JSR imports), JSDoc public APIs, structure MVC. **Verdict bloquant ou approbation.**                                                                                                                          | Verdict ✅/❌ + commentaires actionnables, ou commentaires sur PR via `gh pr review`               | Jamais                                                                                                                                                                |
| **devops-sre**    | CI/CD, JSR publish, version bump (`scripts/bump.ts`), deploy (Deno Deploy / binary / Docker), workflows `.github/workflows/*.yml`.                                                                                                                                                                           | Workflow modifié, version bumpée, release                                                          | Sur tâches sans impact CI/release                                                                                                                                     |
| **docs-writer**   | Documentation cohérente partout : `docs/`, `packages/*/docs/DOCS.md`, `packages/*/README.md`, `packages/ui/components/*/DOCS.md`, `public/llms/`, `public/docs/llms/`, `public/ui/llms/`, sidebar nav (`app/view/layouts/docs_layout.tsx`, `app/view/components/ui-sidebar.tsx`), JSX doc pages, `STUBS.md`. | Docs à jour, LLM txt à jour, sidebar nav à jour                                                    | Quand le diff ne touche aucun fichier exporté via `mod.ts`, aucune signature publique, aucun stub, et aucun comportement documenté (purement interne / refacto privé) |

### 4.3 Hard rules between agents

- The **developer writes unit tests** (TDD principle: same mental flow as
  writing the code). The **qa-tester does not redo unit tests** — only
  integration/e2e/behavioral validation.
- The **architect never touches `.ts` or `.tsx`**. Output is always markdown in
  `docs/superpowers/specs/`.
- The **orchestrator never resolves technical problems itself** — if it blocks,
  it escalates to Kevin.
- **No agent spawns another agent** (SDK constraint anyway). The orchestrator
  (main session) is the only spawner.

## 5. Agent file format (official Anthropic frontmatter)

Each `.claude/agents/<name>.md` follows this template:

```markdown
---
name: <agent-name> # lowercase, hyphenated
description: <one-sentence purpose, used by orchestrator to pick this agent>
model: sonnet | opus # see §5.1
tools: <comma-separated allowlist> # see §5.2
permissionMode: default | plan | acceptEdits # see §5.3
isolation: worktree # only for agents that mutate code (developer)
mcpServers: github # only when needed
---

# <Agent display name>

<Mission statement (1 paragraph max)>

## Required reading at startup

Before any work, read:

- `.claude/agents/<name>/runbook.md` — your runbook (procedures, conventions,
  gotchas)
- `AGENTS.md` (project root) — Lockness project doc index

## Responsibilities

<Bullet list, derived from §4.2 of the design>

## Output contract

<What you must return when done — e.g. file paths modified, verdict, summary>

## Hand-off conventions

<When to escalate, who to escalate to (always the main session / orchestrator)>
```

### 5.1 Model assignment

| Agent         | Model    | Justification                                                       |
| ------------- | -------- | ------------------------------------------------------------------- |
| product-owner | `sonnet` | Triage rapide, structuration d'issues — pas de raisonnement profond |
| architect     | `opus`   | Raisonnement design Deno/TS, dependency DAG, choix de patterns      |
| developer     | `sonnet` | TDD est mécanique, sonnet écrit du Deno/TS très bien                |
| qa-tester     | `sonnet` | Validation + écriture tests intégration                             |
| code-reviewer | `opus`   | Analyse fine SOLID, types, edge cases                               |
| devops-sre    | `sonnet` | Edits ciblés YAML/scripts, raisonnement borné                       |
| docs-writer   | `sonnet` | Rédaction docs, transformation contenu                              |

### 5.2 Tools allowlist per agent

| Agent         | Tools                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| product-owner | `Read, Bash(gh issue:*), Bash(gh project:*), Bash(.claude/skills/backlog/scripts/*.sh), Bash(jq:*), Bash(column:*), Bash(sort:*)`       |
| architect     | `Read, Glob, Grep, WebFetch, Write` (scoped by convention to `docs/superpowers/specs/**`)                                               |
| developer     | `Read, Write, Edit, Glob, Grep, Bash(deno:*), Bash(git:*)`                                                                              |
| qa-tester     | `Read, Glob, Grep, Bash(deno test:*), Bash(deno check:*), Bash(deno fmt:*), Bash(deno lint:*), Bash(deno task:*)`                       |
| code-reviewer | `Read, Glob, Grep, Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(gh pr view:*), Bash(gh pr diff:*)`                         |
| devops-sre    | `Read, Edit, Bash(deno task:*), Bash(deno publish:*), Bash(gh workflow:*), Bash(gh release:*), Bash(docker:*), Bash(scripts/bump.ts:*)` |
| docs-writer   | `Read, Write, Edit, Glob, Grep`                                                                                                         |

> **Note on syntax** — The fine-grained `Bash(<command>:*)` patterns above
> describe the **intent**. Two enforcement paths exist in Claude Code: (a)
> directly in the agent's `tools:` frontmatter when the version supports
> granular Bash patterns, or (b) via `.claude/settings.json` permission rules
> scoped per-agent. The writing-plans phase will pick one consistent path based
> on the installed Claude Code version. If neither path supports the granularity
> below, the agent's `tools:` field falls back to broad allowlisting
> (`Read, Write, Edit, Bash, ...`) and the granularity is documented in the
> agent's runbook as a self-policed rule.

### 5.3 Permission mode per agent

| Agent         | permissionMode | Why                                                                 |
| ------------- | -------------- | ------------------------------------------------------------------- |
| product-owner | `default`      | Mutates GitHub state — safer to confirm                             |
| architect     | `plan`         | Read-mostly, but can write design docs in `docs/superpowers/specs/` |
| developer     | `acceptEdits`  | Productivity for code edits in worktree                             |
| qa-tester     | `default`      | Read + run tests, no mutations                                      |
| code-reviewer | `default`      | Read-only, no edits                                                 |
| devops-sre    | `default`      | Touches CI/release — must confirm                                   |
| docs-writer   | `acceptEdits`  | Doc edits in known scope                                            |

### 5.4 Isolation

Only the `developer` agent uses `isolation: worktree` so that parallel
implementation work doesn't clobber the main checkout. Other agents work in the
parent's working directory.

### 5.5 MCP servers per agent

| Agent         | mcpServers | Why                                                     |
| ------------- | ---------- | ------------------------------------------------------- |
| product-owner | `github`   | Reads/writes issues, project items, status fields       |
| devops-sre    | `github`   | Workflow runs, releases, branch protection              |
| (others)      | —          | None needed — `gh` CLI through Bash covers ad-hoc cases |

The `github` MCP server is project-shared (declared in `.mcp.json` in
sub-project 5). Until then, `gh` CLI through `Bash(gh ...)` is the fallback and
remains usable for both these agents.

## 6. Memory model (official Anthropic pattern)

### 6.1 Layered memory

| Layer              | File                               | Loaded by                                                | Purpose                                                                                                 |
| ------------------ | ---------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| User-level         | `~/.claude/CLAUDE.md`              | All sessions across all projects                         | Kevin's personal preferences (terse responses, French/English mixing, etc.) — not modified by this spec |
| Project-level      | `.claude/CLAUDE.md`                | Main session + all sub-agents in this repo               | **Hard project conventions** (see §6.3)                                                                 |
| Per-agent identity | `.claude/agents/<name>.md`         | When the orchestrator spawns the agent                   | The system prompt = the agent's persistent identity                                                     |
| Per-agent runbook  | `.claude/agents/<name>/runbook.md` | Read by the agent at startup (instructed in §5 template) | Procedures, gotchas, evolving knowledge                                                                 |

No custom store, no `~/.claude/projects/.../memory/agents/<name>/` tree.
Anthropic-official only.

### 6.2 Why this works

- **Versioned in git** → reviewable, shareable, improvable.
- **Identity vs evolving knowledge** are separated: `.md` (immutable identity,
  edited via PR) vs `runbook.md` (mutable, edited frequently as the agent
  learns).
- **No drift** with Anthropic's own conventions → forward-compatible with future
  SDK features.

### 6.3 Project-level `CLAUDE.md` content

The current `.claude/CLAUDE.md` is one line. It will be expanded to embed the
**hard rules every agent must respect**, kept short to avoid context bloat:

- Pointer to `AGENTS.md` (already there).
- Hard rules (1 line each): no direct `hono` import (use `@lockness/core`);
  JSR-only imports; no `npm:` specifiers unless necessary; Tailwind v4
  CSS-variable syntax (`bg-(--var)` not `bg-[--var]`); always run
  `deno fmt && deno lint` before completing; never modify `deno.lock` manually.
- Pointer to the directory of agent runbooks:
  `.claude/agents/<name>/runbook.md`.

Target length: under 60 lines.

### 6.4 Per-agent runbook content (skeleton)

Each `runbook.md` contains:

1. **Purpose recap** (1 paragraph).
2. **Procedures** (numbered steps for common tasks).
3. **Conventions** (project-specific rules the agent enforces).
4. **Gotchas / known pitfalls** (the agent's accumulated learnings).
5. **References** (links to relevant `docs/`, `packages/*/docs/`, scripts).

Initial runbook content per agent is specified in §8 below.

## 7. Orchestration via the main session

The orchestrator is **not a sub-agent**. There is no
`.claude/agents/orchestrator.md`. Instead:

- A skill `.claude/skills/orchestrate/SKILL.md` (created in this sub-project)
  describes the workflow the main session should run when Kevin says "let's work
  on issue #N" or "pick the top of the Ready column".
- The main session reads `.claude/CLAUDE.md` (project rules) and
  `~/.claude/CLAUDE.md` (Kevin's prefs) automatically. The orchestrate skill
  adds the workflow logic.

### 7.1 Default workflow encoded in the skill

```
1. Main session asks PO: "give me the top issue in Ready, with full body and acceptance criteria".
2. Decide: is this trivial (typo, version bump, doc fix)?
   YES → skip architect, go to step 4.
   NO  → step 3.
3. Spawn architect with the issue body. Get back a design doc path.
4. Spawn developer with (issue body | design doc path). Wait for branch + green tests.
5. Spawn qa-tester with the same issue. Wait for validation report.
6. Spawn code-reviewer with the diff. Wait for verdict.
   If ❌ → loop back to step 4 with reviewer feedback.
   If ✅ → step 7.
7. Ask PO to move issue to "In review" or "Done" depending on PR state.
8. If docs/CI/release impact: spawn docs-writer / devops-sre as needed (parallel to step 5-7 when independent).
```

### 7.2 Why a skill, not an agent

- A skill is **invocable by the main session itself** (the human or the LLM
  driving). An agent definition would only matter if we needed an _isolated
  context_ for orchestration, which we don't — orchestration is the main
  session's job.
- Skills can be invoked by name (`/orchestrate <issue-num>`) without spawning a
  new context.
- Aligns with the official guidance: "skills = reusable procedures, agents =
  isolated specialists".

## 8. Initial runbook content per agent

Each runbook starts as a focused doc (200–500 lines max). Here's the seed
content per agent — fully written in the implementation phase, sketched here for
scope clarity.

### 8.1 product-owner runbook

- Backlog source of truth: GitHub Project #1 (`locknessland/lockness`).
- Status options: Backlog / Ready / In progress / In review / Done.
- Issue body template: `## Why`, `## Acceptance criteria`, `## Out of scope`,
  optional `## Notes`.
- Scripts:
  `.claude/skills/backlog/scripts/{list,view,add,move,clarify-comment}.sh`.
- Conventions: imperative title, no leading emoji, real issues (not drafts).
- Hand-off: when issue is "Ready", main session can pick it up; PO is no longer
  involved until status changes.
- Pointer: `.claude/skills/backlog/SKILL.md` for full backlog conventions.

> NB: actual repo / project-number / scripts will be repointed in **sub-project
> 2**. The runbook will reference whatever is correct after that work.

### 8.2 architect runbook

- Output: design doc in `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md`.
- Required sections: Problem statement, Goals, Non-goals, Architecture,
  Decisions, Out of scope, Pre-requisites.
- Patterns to enforce: SOLID, dependency DAG (cf. `docs/dependencies.md`),
  package boundaries (`docs/architecture.md`).
- Forbidden: writing any `.ts`/`.tsx` file. Reading them is fine.
- References: `docs/architecture.md`, `docs/dependencies.md`, `AGENTS.md`.

### 8.3 developer runbook

- Workflow: TDD — write failing test, implement, run tests, refactor.
- Pre-completion checks:
  `deno fmt && deno lint && deno check <files> && deno task test`.
- Conventions: `@lockness/core` only (never `hono` direct), JSR imports,
  Tailwind v4 syntax, no `any`, JSDoc on exports.
- MVC layout: `app/{controller,middleware,service,model,view,...}/`.
- Branch naming: `feat/<slug>` or `fix/<slug>`.
- References: `docs/getting-started.md`, `docs/middleware.md`, `docs/models.md`,
  `docs/testing.md`.

### 8.4 qa-tester runbook

- Scope: integration + e2e + manual golden paths. **Not unit tests** (developer
  writes those).
- Mocks: do not hit live DB; use in-memory mocks per `docs/testing.md`.
- Manual paths: dev server (`deno task dev`), CSS watcher
  (`deno task css:watch`), CLI commands (`deno task cli ...`).
- Output: validation report (✅/❌ per acceptance criterion) + integration test
  files added to `tests/`.
- References: `docs/testing.md`.

### 8.5 code-reviewer runbook

- This will be a **rewrite** of the current misnamed `code-reviewer.md` (today
  named `deno-expert-reviewer`).
- Checklist: SOLID, no `any` in exports, JSDoc on public APIs, no `hono` direct
  import, JSR imports, no circular deps, MVC respected, tests present.
- Output: verdict `✅ approve` / `❌ block: <reasons>` + line-specific comments.
- Read-only: no edits, no commits.
- References: `docs/contribution.md`, `docs/STUBS.md`.

### 8.6 devops-sre runbook

- Workflows: `.github/workflows/test.yml` (PR tests),
  `.github/workflows/publish.yml` (JSR on release published).
- Bump script: `scripts/bump.ts` — semver, updates root `deno.jsonc`, all
  `packages/*/deno.json`, all stubs. Usage: `deno task bump <X.Y.Z>` or
  `deno task bump --major|--minor|--patch`.
- Deploy options: Deno Deploy (recommended), standalone binary
  (`deno task compile`), Docker (Dockerfile in repo).
- Pre-publish gate: `deno fmt --check && deno lint && deno task test -A`.
- References: `docs/deployment.md`, `docs/compilation.md`, `.github/workflows/`,
  `scripts/bump.ts`.

### 8.7 docs-writer runbook

- Targets:
  - Root project docs: `docs/*.md` (architecture, getting-started, deployment,
    etc.).
  - Per-package docs: `packages/*/docs/DOCS.md` and `packages/*/README.md`.
  - UI component docs: `packages/ui/components/*/DOCS.md`.
  - LLM-optimized docs: `public/llms/`, `public/docs/llms/<page>.txt`,
    `public/ui/llms/<component>.txt`.
  - JSX doc pages: `app/view/pages/docs/<slug>.tsx`,
    `app/view/pages/ui/<component>.tsx`.
  - Sidebar nav: `app/view/layouts/docs_layout.tsx`,
    `app/view/components/ui-sidebar.tsx`.
  - Stubs: `STUBS.md` mapping must stay in sync.
- Conventions: matches the structure described in `.tasks/.template.md`
  (Documentation Updates Checklist section) but with `AGENTS.md` substituted for
  `GEMINI.md`.
- References: `AGENTS.md` (Documentation Index table), `docs/STUBS.md`.

## 9. Implementation steps (high-level)

The detailed plan is the next deliverable (writing-plans skill). Here is the
high-level flow that the plan will expand:

1. Expand `.claude/CLAUDE.md` with project rules (§6.3).
2. Create `.claude/agents/<name>.md` for the 7 sub-agents (per §5 template, with
   §5.1–5.3 metadata).
3. Create `.claude/agents/<name>/runbook.md` for the 7 sub-agents (per §8 seed
   content).
4. Rewrite `.claude/agents/code-reviewer.md` (currently misnamed
   `deno-expert-reviewer`).
5. Create `.claude/skills/orchestrate/SKILL.md` (per §7).
6. Validate: from a fresh main session, ensure each agent can be invoked via the
   Agent tool, and each agent reads its runbook on startup.

## 10. Pre-requisites & blockers

- Directory `docs/superpowers/specs/` did not exist — created during this spec's
  authoring.
- `gh auth status` must show `project` scope (the PO needs it). If absent:
  `gh auth refresh -s project`. — This is a **runtime** check, not a build-time
  blocker for this spec.
- Sub-project 2 (backlog skill repointing) will produce the correct project node
  IDs / status field IDs that the PO runbook references. Until that lands, the
  PO runbook references stay generic ("project #1 of `locknessland/lockness`")
  and will be tightened later.

## 11. Validation criteria for this sub-project

- All 7 agent files exist with non-empty bodies and valid frontmatter.
- All 7 runbook files exist.
- `.claude/CLAUDE.md` contains the project rules from §6.3.
- `.claude/skills/orchestrate/SKILL.md` exists.
- A fresh `claude` session in this repo can:
  - `/agents` lists all 7 agents.
  - Spawning each agent via the Agent tool returns a sane "I am X, here's my
    mission" response.
  - The orchestrate skill is discoverable via `/orchestrate`.

## 12. Risks

| Risk                                                             | Mitigation                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Per-agent runbooks drift from project reality                    | Reviewed in PRs, evolved in PRs; ownership = whoever last touched the agent's domain      |
| `tools` allowlist too narrow → agent blocked at runtime          | Start with the lists in §5.2; loosen via PR with explicit reasoning                       |
| Two agents disagree on responsibility (e.g. dev vs qa on a test) | §4.3 Hard rules are the tie-breaker; if still ambiguous, escalate to Kevin                |
| Agent file format changes in a future Claude Code release        | Frontmatter is fully spec'd in §5; pin a Claude Code version range in CLAUDE.md if needed |

## 13. Open questions for follow-up sub-projects

- Sub-project 5 will decide on hooks (`PostToolUse` auto-fmt? `SessionStart`
  re-injection of sprint state? `Stop` Discord webhook?).
- Sub-project 5 will decide on `/loop` vs GitHub Actions for recurring backlog
  triage.
- Sub-project 4 will decide whether Deno skills from `denoland/skills` should be
  installed at the project level (`.claude/skills/`) or user level
  (`~/.claude/skills/`).
