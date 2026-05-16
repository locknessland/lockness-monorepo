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

## Source of truth for tasks

The backlog source of truth is **GitHub Project #1** of `locknessland/lockness`
(https://github.com/orgs/locknessland/projects/1/views/1). Reads/writes go
through the `/backlog` skill or the SpecFlow product-owner agent — both share
the same `gh` CLI backend (config in `.specflow/backlog-config.yml`). The legacy
`.tasks/` folder has been removed.

## Agents, skills, and workflows

Specialist sub-agents live in `.claude/agents/<name>.md`. Some carry a runbook
at `.claude/agents/<name>/runbook.md` with procedures specific to their role.

Two complementary workflows coexist:

- **`/orchestrate`** — Lockness multi-agent dispatch (product-owner → architect
  → developer → qa-tester → code-reviewer, with docs-writer / devops-sre in
  parallel when relevant). Use for backlog issues that map to our team layout.
  Skill at `.claude/skills/orchestrate/SKILL.md`.
- **`/specflow specify "<feature>"`** — SpecFlow chained pipeline (clarify →
  plan → tasks → analyze → implement → review → merge). Use for greenfield
  features needing a written spec + plan + tasks tree before implementation.
  Skill at `.claude/skills/specflow/SKILL.md`.

New specifications live under `.specflow/specs/<feature>/`. Project principles
for the SpecFlow pipeline live in `.specflow/memory/constitution.md` — it
complements (it does not replace) the hard rules above.

## Optional Claude Code integrations

Set up if useful to your workflow.

- **Periodic maintenance** — `/loop 1h` runs `.claude/loop.md` every hour. The
  bundled default delegates to `/specflow groom`. See
  https://code.claude.com/docs/fr/scheduled-tasks.
- **Goal-directed sessions** — `/goal <condition>` keeps turns running until a
  fast model judges the condition met. See https://code.claude.com/docs/fr/goal.
- **Multi-session dispatch (`claude agents`)** — terminal UI listing background
  Claude sessions; spawns agents with isolated git worktrees under
  `.claude/worktrees/`. Requires Claude Code v2.1.139+. See
  https://code.claude.com/docs/fr/agent-view.
- **Async notifications** — install Telegram / Discord / iMessage channel
  plugins for long-task pings. See https://code.claude.com/docs/fr/channels.
- **Headless / CI** — `claude -p "<prompt>"` runs non-interactively. SpecFlow
  ships `.claude/scripts/dispatch-agent.sh <agent-name> "<prompt>"` which
  auto-derives `--allowedTools` from agent frontmatter. See
  https://code.claude.com/docs/fr/headless.
- **Deep links** — `claude-cli://open?repo=<owner>/<repo>&q=<prompt>` opens a
  fresh session pre-filled. See https://code.claude.com/docs/fr/deep-links.
- **MCP servers** — connect external tools via `.mcp.json`. See
  https://code.claude.com/docs/fr/mcp.
