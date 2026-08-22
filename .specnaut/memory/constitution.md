# Lockness — Project Constitution

> Invariants of the Lockness framework. Specnaut commands and review agents read
> this at every step. The **hard rules** are mirrored in
> [.claude/CLAUDE.md](../../.claude/CLAUDE.md) (always loaded into agent
> contexts). The doc index lives in [AGENTS.md](../../AGENTS.md).

## Hard rules (mirrored from CLAUDE.md)

These are blockers, not preferences. Violations are FAIL findings in every
review.

1. **No direct `hono` import.** Always import from `@lockness/core`.
2. **JSR-only specifiers** for `@lockness/*` and `@std/*`. `npm:` only when
   JSR-unavailable AND justified inline.
3. **No `any` in exported APIs.** Use `unknown` + type guards.
4. **Tailwind v4 CSS-variable syntax.** Parentheses for variables
   (`bg-(--var)`), brackets only for literal values (`px-[0.75rem]`).
5. **Pre-completion gate.**
   `deno fmt && deno lint && deno check <files> &&
   deno task test` must be
   green before declaring done.
6. **Never modify `deno.lock` manually.** It is generated.
7. **JSDoc on every public API** (description, `@param`, `@returns`, `@throws`,
   `@example` where applicable; file-level `@fileoverview` and `@module` on
   public modules).
8. **MVC layering.** Controllers thin (delegate to services). Services hold
   business logic. Models / repositories handle persistence. No direct DB
   queries in controllers.
9. **Commit discipline.** Commit own work proactively. One category per commit
   (Conventional Commits — `feat` / `fix` / `chore` / `docs` / `refactor` /
   `test` / `build` / `ci` / `style` / `perf`). Split mixed-category changes
   into multiple commits. Linear history only (fast-forward, no merge commits
   when avoidable). Atomicity beats brevity: 4 small focused commits beat 1
   sprawling one.

## Engineering methodology

- **TDD is non-negotiable** for the `developer` agent — failing test first,
  minimal code to pass, then refactor.
- **Domain-Driven Design** — pure domain (no I/O), application layer (use cases
  / ports), infrastructure layer (adapters), presentation layer talks only to
  use cases.
- **Domain Model gate** — every `plan.md` or PO brief contains a `## Domain
  Model` block (bounded context, vocabulary, entities, value objects,
  invariants, out of scope). Developer refuses to implement without it.
- **Boy Scout Rule with escalation** — small in-scope cleanups inline; large
  cleanups surfaced as tech-debt tickets via the PO intake protocol.
- **SOLID / DRY / KISS / YAGNI** — apply universally. DRY only for _semantic_
  duplication.
- **No silent catches.** Every `catch` logs at ERROR/WARN or re-throws.

## Architecture layers (Lockness MVC)

- **Controller** (`packages/*/controller/`, `app/controller/`) — class-based
  with decorators (`@Controller`, `@Get`, `@Post`). Thin: parse input, invoke
  service, return response.
- **Service** (`packages/*/service/`, `app/service/`) — business logic. Pure
  where possible. Repositories injected via DI.
- **Repository / Model** (`packages/*/repository/`, `app/model/`) — Drizzle ORM
  queries. Models are domain entities; repositories are the data access port.
- **Middleware** (`packages/*/middleware/`, `app/middleware/`) — class-based
  with `@Middleware`, `@ComposeMiddleware`.
- **Auth** (`@lockness/auth`) — guard-based (`@AuthRequired()`,
  `@AuthOptional()`, `@AuthGuard()`).
- **View** (`packages/*/view/`, `app/view/`) — JSX via Hono runtime;
  `@lockness/core` re-exports.

## Back-end patterns

- **Dependency injection** — IoC container via `@Service()` and `@Inject()`
  (`@lockness/container`).
- **Kernel decorator** — declarative app config (`@Kernel(config)`,
  `@DeclareGlobalMiddleware()`, `@OnBoot({ priority })`).
- **Lifecycle events** — boot, request, response, shutdown hooks with priority
  ordering (see [docs/lifecycle-events.md](../../docs/lifecycle-events.md)).
- **Error handling** — auto-discovery, custom error pages, formatted console
  output (see
  [packages/core/docs/error-handling.md](../../packages/core/docs/error-handling.md)).
- **Caching** — decorator-based response caching (`@Cached`), multiple drivers.
- **Sessions** — multiple drivers (cookie, deno-kv, memory, redis).
- **Queues** — Deno KV driver for background jobs.

## Front-end patterns

- **JSX** — `@lockness/core` provides the JSX runtime
  (`jsxImportSource: "@lockness/core"` in `deno.json`).
- **Tailwind v4** — utilities-first; CSS variables use parentheses syntax (rule
  #4).
- **UI components** — shadcn-style: copied into project via CLI, lives in
  `packages/ui/components/<Component>/mod.tsx`. Each component has a `DOCS.md`
  and `examples.tsx`.

## Testing

- **Unit tests** — owned by `developer`. `Deno.test` in `packages/*/tests/` or
  `<root>/tests/`.
- **Integration / e2e / manual** — owned by `qa-tester`. Validates issue
  acceptance criteria.
- **FakeTime, in-memory mocks** — see [docs/testing.md](../../docs/testing.md).
- **Coverage** — `deno task test:coverage`.

## Release & deploy

- **JSR publishing** — driven by `release: published` on GitHub. The
  `publish.yml` workflow publishes the tagged commit.
- **Version bumping** — `deno task bump <X.Y.Z>` (or `--major` / `--minor` /
  `--patch`). Atomic across the monorepo.
- **Deployment paths** — Deno Deploy (recommended), standalone binary
  (`deno task compile`), Docker.
- **Devops-sre agent** — owns workflows, bumping, JSR publishing, Docker,
  deployment.

## Backlog & process

- **Source of truth** — GitHub Project #1 of `locknessland/lockness`.
- **No local Markdown mirror.** No `.specnaut/backlog/` task files.
- **Classification gate** — every item exits with Size, Priority, Issue Type,
  and ≥1 classifying label (see `product-owner` agent).
- **Status workflow** — Backlog → Ready → In progress → In review → Done.
- **Two-step close on GitHub** — `move.sh <num> Done` BEFORE
  `gh issue close <num>`.

## When to use which workflow

- **`/specnaut plan "<feature>"`** — greenfield feature requiring the
  plan → tasks → implement → review → merge chain. Complexity ≥ 8 story
  points, new entities, new user flows, API contract design. Discovery,
  specification and clarification happen inside `plan`; there is no separate
  `specify` or `clarify` phase.
- **`/orchestrate`** — backlog issue with clear scope (≤ 5 story points, bug
  fix, refactor, small enhancement, docs, tooling).
- **Direct developer dispatch** — trivial: one-file rename, lint fix, config
  bump.

## File layout

- **Code** — `packages/*/`, `app/`, `scripts/`, `config/`.
- **Docs** — `docs/`, `packages/*/docs/`, `packages/ui/components/*/DOCS.md`.
- **Specs** — `.specnaut/specs/<feature>/`. A v3 feature produces exactly two
  artefacts: `plan.md` and `tasks.md`. Directories created before the v3
  migration also contain `spec.md`, `research.md`, `data-model.md`,
  `quickstart.md`, `contracts/` or `checklists/` — those are historical
  records and are not rewritten.
- **Constitution** — this file (`.specnaut/memory/constitution.md`).
- **Agents** — `.claude/agents/<name>.md` (+ optional
  `.claude/agents/<name>/runbook.md`).
- **Skills** — `.claude/skills/<name>/SKILL.md`.
- **Hard rules / Claude entry-point** — `.claude/CLAUDE.md`.
