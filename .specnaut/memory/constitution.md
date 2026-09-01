# Lockness — Project Constitution

> Invariants of the Lockness framework. Specnaut commands and review agents read
> this at every step. The **hard rules** are mirrored in
> [AGENTS.md](../../AGENTS.md) (always loaded into agent
> contexts). The doc index lives in [AGENTS.md](../../AGENTS.md).

## Hard rules (mirrored from AGENTS.md)

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
- **Domain Model gate** — every `plan.md` or PO brief contains a
  `## Domain
  Model` block (bounded context, vocabulary, entities, value
  objects, invariants, out of scope). Developer refuses to implement without it.
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

- **Source of truth** — GitHub Project #2 of `locknessland/lockness-monorepo`.
- **No local Markdown mirror.** No `.specnaut/backlog/` task files.
- **Classification gate** — every item exits with Size, Priority, Issue Type,
  and ≥1 classifying label (see `product-owner` agent).
- **Status workflow** — Backlog → Ready → In progress → In review → Done.
- **Closing on GitHub is ONE step, not two.** Project #2 runs an "Auto-close
  issue" workflow, so `move.sh <num> Done` **is** the close and a following
  `gh issue close` returns "already closed". Measured 2026-08-31 on #122: the
  move at 16:52:02 closed it. The automation is asynchronous — a re-read
  immediately after the move can still report OPEN, and settled ~8 s later, so a
  close verified too quickly reads as a false negative. Prefer `move.sh`, which
  leaves no Status drift.
- **Audits read the open backlog first.** Before an audit seat (plan audit or
  review) reports a finding, it reads the open items for the bounded contexts it
  touches (`gh issue list --state open --label domain:<context>`). A finding
  that already has an item is reported as `confirms #N` with only what is new;
  one whose stated conclusion the evidence disproves is reported as a
  correction, explicitly. Measured 2026-09-01: the #137 plan audits re-found two
  defects the #136 audits had already filed as #138 and #139. Procedure in
  `.claude/skills/specnaut/phases/plan-audits.md`; PO-side backstop in
  `.claude/agents/product-owner/runbook.md`.
- **A disproven assessment is corrected, not erased.** When evidence overturns
  what an issue asserts, the body records that the original assessment was
  disproven, with the date and the evidence. The next reader needs to know the
  reasoning failed, not merely that the conclusion changed.

## When to use which workflow

- **`/specnaut plan "<feature>"`** — greenfield feature requiring the plan →
  tasks → implement → review → merge chain. Complexity ≥ 8 story points, new
  entities, new user flows, API contract design. Discovery, specification and
  clarification happen inside `plan`; there is no separate `specify` or
  `clarify` phase.
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
  `quickstart.md`, `contracts/` or `checklists/` — those are historical records
  and are not rewritten.
- **Constitution** — this file (`.specnaut/memory/constitution.md`).
- **Agents** — `.claude/agents/<name>.md` (+ optional
  `.claude/agents/<name>/runbook.md`).
- **Skills** — `.claude/skills/<name>/SKILL.md`.
- **Hard rules / Claude entry-point** — `AGENTS.md`.
