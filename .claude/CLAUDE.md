# Lockness — Project rules for all agents

The full project documentation index is in [/AGENTS.md](../AGENTS.md). Read it
when you need package layout, architecture overview, or doc pointers.

## Hard rules every agent must respect

These rules apply to **every** sub-agent and to the main session. Violations are
blockers, not preferences.

1. **No direct `hono` import.** Always import from `@lockness/core`. Lockness
   re-exports the Hono APIs it supports, on a pinned version. Direct imports
   break compatibility.
2. **JSR-only imports for Lockness and stdlib.** Use `jsr:@lockness/...` and
   `jsr:@std/...`. Avoid `npm:` specifiers unless a package is JSR-unavailable
   AND the use case justifies it (document the why in a code comment).
3. **No `any` in exported APIs.** Use `unknown` + type guards when a type is
   genuinely uncertain. Exception requires a
   `// deno-lint-ignore no-explicit-any` comment with justification.
4. **Tailwind v4 CSS-variable syntax.** Use `bg-(--my-var)` (parentheses), NOT
   `bg-[--my-var]` (brackets). Brackets are for arbitrary literal values like
   `px-[0.75rem]`, not for variable references.
5. **Pre-completion gate on every code change.** Before declaring a code task
   done, run `deno fmt && deno lint && deno check <files> && deno task test`. If
   any step fails, fix and re-run — do not declare done with red checks.
6. **Never modify `deno.lock` manually.** It is generated. If a dependency
   change requires it, run the relevant `deno cache` or `deno task` command.
7. **JSDoc on public APIs.** Every exported class, method, function, interface,
   and type carries a description, `@param`, `@returns`, `@throws`, and
   `@example` where applicable. File-level `@fileoverview` and `@module` tags on
   public modules.
8. **MVC layering.** Controllers stay thin (delegate to services). Services
   contain business logic. Models/repositories handle persistence. No direct DB
   queries in controllers.
9. **Commit discipline — one category per commit, flat history.** Commit your
   own work proactively as soon as a coherent chunk lands; do not let unrelated
   changes pile up uncommitted. Each commit covers a single category
   (Conventional Commits: `feat` / `fix` / `chore` / `docs` / `refactor` /
   `test` / `build` / `ci` / `style` / `perf`). If a session produced changes
   spanning multiple categories, split into multiple commits — never bundle
   "feat + chore + docs" into one. Linear history only (no merge commits when
   fast-forward is possible).

## Source of truth for tasks

The backlog source of truth is **GitHub Project #1** of `locknessland/lockness`
(https://github.com/orgs/locknessland/projects/1/views/1). Reads/writes go
through the `/backlog` skill or the Specnaut product-owner agent — both share
the same `gh` CLI backend (config in `.specnaut/backlog-config.yml`). The legacy
`.tasks/` folder has been removed.

## Agents, skills, and workflows

Specialist sub-agents live in `.claude/agents/<name>.md`. Some carry a runbook
at `.claude/agents/<name>/runbook.md` with procedures specific to their role.

Two complementary workflows coexist:

- **`/orchestrate`** — Lockness multi-agent dispatch (product-owner → architect
  → developer → qa-tester → code-reviewer, with docs-writer / devops-sre in
  parallel when relevant). Use for backlog issues that map to our team layout.
  Skill at `.claude/skills/orchestrate/SKILL.md`.
- **`/specnaut plan "<feature>"`** — Specnaut chained pipeline: **plan → tasks →
  implement → review → merge** (five phases, not nine). Use for greenfield
  features needing a written plan + tasks tree before implementation. Skill at
  `.claude/skills/specnaut/SKILL.md`.

Specnaut v3 facts worth knowing before you invoke it:

- **Discovery, specification and clarification all happen inside `plan`.** There
  is no `specify`, `clarify`, `brainstorm`, `checklist` or `list-skills` phase —
  invoking one of those names prints the phase index and stops.
- **`analyze` was replaced, not moved.** Its job is now a binding decision table
  inside `plan.md` plus two plan audits (`architect-expert` + `security-expert`)
  dispatched in parallel _before any code exists_.
- **A feature produces exactly two artefacts**: `plan.md` and `tasks.md`.
- **`--manual` is the only surviving flag.** `--once`, `--continue`, `--lite`
  and `--full` are gone; re-entry is inferred from which artefacts exist.
- **There are exactly two stops**: the end of `plan`, and the `review` verdict.
- **`merge` does not open a PR by default** — it fast-forwards the base locally
  and squashes by scope. A PR is opt-in via `--pr`.

New specifications live under `.specnaut/specs/<feature>/`. Project principles
for the Specnaut pipeline live in `.specnaut/memory/constitution.md` — it
complements (it does not replace) the hard rules above.

Spec directories written before the v3 migration are **historical records**, not
live rules. `plan` reads them without failing; do not rewrite them.

## Optional Claude Code integrations

Set up if useful to your workflow.

- **Periodic maintenance** — `/loop 1h` runs `.claude/loop.md` every hour. The
  bundled default delegates to `/specnaut groom`. See
  https://code.claude.com/docs/fr/scheduled-tasks.
- **Goal-directed sessions** — `/goal <condition>` keeps turns running until a
  fast model judges the condition met. See https://code.claude.com/docs/fr/goal.
- **Multi-session dispatch (`claude agents`)** — terminal UI listing background
  Claude sessions; spawns agents with isolated git worktrees under
  `.claude/worktrees/`. Requires Claude Code v2.1.139+. See
  https://code.claude.com/docs/fr/agent-view.
- **Async notifications** — install Telegram / Discord / iMessage channel
  plugins for long-task pings. See https://code.claude.com/docs/fr/channels.
- **Headless / CI** — `claude -p "<prompt>"` runs non-interactively. Specnaut
  ships `.claude/scripts/dispatch-agent.sh <agent-name> "<prompt>"` which
  auto-derives `--allowedTools` from agent frontmatter. See
  https://code.claude.com/docs/fr/headless.
- **Deep links** — `claude-cli://open?repo=<owner>/<repo>&q=<prompt>` opens a
  fresh session pre-filled. See https://code.claude.com/docs/fr/deep-links.
- **MCP servers** — connect external tools via `.mcp.json`. See
  https://code.claude.com/docs/fr/mcp.
