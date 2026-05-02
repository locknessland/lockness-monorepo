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
