# Agentic ownership map

> **What this is.** A single answer to "for a change in _this_ area, which agent
> owns it and which skill drives the workflow?" The per-agent definitions in
> `.claude/agents/*.md` answer from the agent's side; this map answers from the
> code's side. When they disagree, the agent definition wins and this file is
> corrected in the same change.

## How to read it

- **Code area** — where the change lands, by path.
- **Owning agent** — the specialist to dispatch (definition in
  `.claude/agents/<name>.md`).
- **Driving skill / workflow** — the entry point that orchestrates the work.

A single package change is usually best served by **`package-expert`**
dispatched with the package named in the prompt — it loads that package's
`AGENTS.md` brief and its `deps.policy` boundary and stays inside it. Reach for
a role agent (`developer`, `architect`, …) when the work is role-shaped rather
than package-shaped, or crosses several packages.

## Area → agent → skill

| Code area                                                              | Owning agent                                                 | Driving skill / workflow                                   |
| :--------------------------------------------------------------------- | :----------------------------------------------------------- | :--------------------------------------------------------- |
| `packages/<pkg>/` source (one package)                                 | `package-expert` (name the package)                          | `/specnaut implement` · `/orchestrate`                     |
| Cross-package feature / new package                                    | `developer` + `architect`                                    | `/specnaut plan → … → merge`                               |
| `app/` template (controllers, services, models, kernel)                | `developer`                                                  | `/specnaut implement`                                      |
| Architecture / dependency-graph decisions                              | `architect` (design) · `architect-expert` (review/audit)     | `/specnaut plan` · `/specnaut audit architecture`          |
| Security-sensitive code (auth, session, socialite, storage, validator) | `security-expert`                                            | `/specnaut review` · `/specnaut audit security`            |
| Performance-sensitive paths                                            | `performance-expert`                                         | `/specnaut audit performance`                              |
| Tests (unit)                                                           | `developer` (writes) · `test-reviewer` (reviews)             | `/specnaut implement` · `/specnaut review`                 |
| Integration / e2e / acceptance validation                              | `qa-tester`                                                  | `/orchestrate` · `/specnaut implement`                     |
| `docs/`, `packages/*/docs/`, `packages/*/README.md`, `STUBS.md`        | `docs-writer`                                                | invoked alongside the code change                          |
| `.github/workflows/`, `scripts/bump*.ts`, `Dockerfile`, release/deploy | `devops-sre`                                                 | `/ship` · `/specnaut tag-version` · `release-version`      |
| Dependency manifests (`deno.json`, `deps.policy.jsonc`)                | `dependency-expert`                                          | `/specnaut audit dependencies`                             |
| UI components (`packages/ui/`), JSX surfaces                           | `developer` + `ui-ux-designer` (design system)               | `/specnaut implement` (UI follows `mobile-first-contract`) |
| Front-end accessibility                                                | `accessibility-expert`                                       | `/specnaut audit accessibility`                            |
| Backlog (GitHub Project #2)                                            | `product-owner`                                              | `/board`                                                   |
| Multi-agent delivery of a backlog item                                 | `workflow-manager`                                           | `/orchestrate`                                             |
| Pre-merge quality gate                                                 | `review-coordinator` (fans out code/security/test reviewers) | `/specnaut review`                                         |
| Git operations (commit split, push, gate)                              | —                                                            | `/git`                                                     |
| Questions about Specnaut itself                                        | `specnaut-guide`                                             | —                                                          |

## Cross-cutting skills (every area)

- **`response-style-contract`** — how every answer is shaped. In force on every
  turn.
- **`/git`** — the single home of the commit-category rules and the
  pre-completion gate.
- **`deno-expert`** — Deno-specific review and best-practice knowledge; consult
  it wherever Deno code is written or judged.

## The hard rules apply to every agent

Every agent and the main session obey the framework
[hard rules](../.claude/CLAUDE.md#-hard-rules-every-agent-must-respect): no
direct `hono` import, JSR-only specifiers, no `any` in exported APIs, Tailwind
v4 CSS-variable syntax, the pre-completion gate, no hand-edited `deno.lock`,
JSDoc on public APIs (enforced for module `@fileoverview` by
`deno task docs:coverage`), MVC layering, and one-category-per-commit.

## Keeping this map honest

This map is project-owned and hand-maintained. When an agent's responsibilities
change in `.claude/agents/`, update the matching row here in the same change.
Agent and skill _definitions_ under `.claude/` and `.specnaut/` are managed by
the Specnaut CLI; improvements to them are raised as proposals through
`specnaut upgrade`, not edited in place.
