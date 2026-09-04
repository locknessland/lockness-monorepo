# Lockness - Fullstack MVC Framework for Deno

> **One file, two names.** `.claude/CLAUDE.md` is a symlink to this file
> (`AGENTS.md`). Edit either path and you edit the same bytes — so never apply
> the same change "to both", or the second pass re-matches an anchor the first
> already replaced and duplicates the block.

Lockness JS is a fullstack Web framework with a focus on ergonomics and speed.
It provides a clean and stable API to build Web apps and microservices.

## 🎯 Project Objective

Provide a robust and structured development experience, similar to **Laravel**,
**AdonisJS**, or **Symfony**, while leveraging the modernity and speed of Deno.
Users interact exclusively with `@lockness/core`, which re-exports all necessary
Hono functionalities.

## 🚀 Philosophy

- **Solid Foundation**: Uses HonoJS under the hood, fully integrated within
  `@lockness/core`
- **Minimal Core**: Only essentials (DI + Hono). Optional features imported
  explicitly
- **Modular Architecture**: Choose what you need - lightweight APIs or
  full-featured web apps
- **MVC Architecture**: Clear structure separating business logic, data, and
  display
- **Inspiration**: Heavily inspired by Laravel and AdonisJS
- **Deno First**: Native TypeScript, no `node_modules`, TC39 Stage 3 decorators

## 🛠 Target Features

- **Expressive Routing**: Based on Hono but adapted for MVC
- **Controllers**: Class-based with decorators (`@Controller`, `@Get`, `@Post`)
- **Middleware Support**: Class-based with `@Middleware`, `@ComposeMiddleware`
- **Dependency Injection**: IoC container with `@Service` and `@Inject`
- **View Engine (JSX)**: Native JSX via Hono runtime
- **Authentication**: `@AuthRequired()`, `@AuthOptional()`, `@AuthGuard()`
- **ORM Integration**: Drizzle ORM with PostgreSQL
- **Production Ready**: Compile to standalone binaries with `deno compile`

> Framework-wide rules (no direct `hono` import, JSR-only specifiers, Tailwind
> v4 CSS-variable syntax, pre-completion gate, etc.) are the
> [hard rules](#-hard-rules-every-agent-must-respect) below.

---

## ⚖️ Hard rules every agent must respect

These rules apply to **every** sub-agent and to the main session. Violations are
blockers, not preferences.

1. **No direct `hono` import.** Always import from `@lockness/core`. Lockness
   re-exports the Hono APIs it supports, on a pinned version. Direct imports
   break compatibility.
2. **JSR-only dependencies, declared per package.** Dependencies come from JSR,
   not npm and not a URL registry. Avoid `npm:` specifiers unless a package is
   JSR-unavailable AND the use case justifies it (document the why in a code
   comment).

   The rule is about the **registry**, not the spelling. In source, write the
   **bare** specifier (`from '@lockness/cli'`, `from '@std/path'`); in the
   importing package's own `deno.json`, declare it **fully qualified and
   pinned** (`"@lockness/cli": "jsr:@lockness/cli@^0.2.0"`). Inside the
   workspace a bare specifier resolves by workspace member _name_, so an
   undeclared import works locally and ships a package a consumer cannot
   resolve. `deno task deps:analyze` and `deno task publish:check` enforce it.
   See [releasing.md](docs/releasing.md).
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

---

## 🛤️ Agents, skills, and workflows

Specialist sub-agents live in `.claude/agents/<name>.md`. Some carry a runbook
at `.claude/agents/<name>/runbook.md` with procedures specific to their role.

`package-expert` is the one seat scoped to a single package rather than a role.
Dispatch it with the package named in the prompt; it loads that package's
`AGENTS.md` and dependency contract and stays inside the boundary. There is one
definition, not 27 — package knowledge lives in each `packages/<pkg>/AGENTS.md`,
versioned beside the code, while role knowledge stays in
`.claude/agents/<role>/memory/`.

Two skills own the mechanics that sit either side of those workflows:

- **`/git`** — the single entry point for git operations: a pre-flight that
  classifies the working tree by path, the one-category-per-commit rule, scoped
  parallel reviews over a diff, and push behind the full gate. It is the only
  home of the gate definition and the recurring-failure playbooks. Skill at
  `.claude/skills/git/SKILL.md`.
- **`/ship`** — release the framework. Owns no procedure: it delegates to
  `/git push`, `/specnaut tag-version` and `/specnaut release-version`, and
  holds the standing decisions — why versioning is lockstep, and why a JSR
  publish needs the user's explicit consent every single time. Skill at
  `.claude/skills/ship/SKILL.md`.

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

---

## 📋 Source of truth for tasks

The backlog source of truth is **GitHub Project #2** of
`locknessland/lockness-monorepo`
(https://github.com/orgs/locknessland/projects/2/views/1). Reads/writes go
through the `/board` skill or the Specnaut product-owner agent — both share the
same `gh` CLI backend (config in `.specnaut/backlog-config.yml`). The legacy
`.tasks/` folder has been removed.

---

## 📚 Documentation Index

The documentation is organized across several locations. When you need details,
refer to these files:

### Root Documentation (`docs/`)

| Topic                                                           | Description                      |
| --------------------------------------------------------------- | -------------------------------- |
| [architecture.md](docs/architecture.md)                         | Package system & layered design  |
| [getting-started.md](docs/getting-started.md)                   | Quick start tutorial             |
| [installation.md](docs/installation.md)                         | Installation guide               |
| [lifecycle-events.md](docs/lifecycle-events.md)                 | Framework Lifecycle Events       |
| [middleware.md](docs/middleware.md)                             | Middleware patterns              |
| [models.md](docs/models.md)                                     | Database models with Drizzle     |
| [multi-db-and-factories.md](docs/multi-db-and-factories.md)     | Multi-DB drivers + factories     |
| [notifications.md](docs/notifications.md)                       | Multi-channel notifications      |
| [observability-and-crypto.md](docs/observability-and-crypto.md) | OTel + Crypt/Hash + signed URLs  |
| [pagination-and-resources.md](docs/pagination-and-resources.md) | Pagination + API Resources       |
| [testing.md](docs/testing.md)                                   | Testing best practices           |
| [deployment.md](docs/deployment.md)                             | Production deployment            |
| [releasing.md](docs/releasing.md)                               | Release model and JSR publishing |
| [compilation.md](docs/compilation.md)                           | Binary compilation               |
| [nessy.md](docs/nessy.md)                                       | Nessy CLI wrapper                |
| [packages.md](docs/packages.md)                                 | Package management               |
| [contribution.md](docs/contribution.md)                         | Contributing guide               |
| [dependencies.md](docs/dependencies.md)                         | Dependency graph                 |
| [agentic-ownership.md](docs/agentic-ownership.md)               | Code area → agent → skill map    |
| [STUBS.md](docs/STUBS.md)                                       | Stub synchronization             |
| [ui-components-documentation.md](docs/ui-components.md)         | UI components overview           |
| [vite.md](docs/vite.md)                                         | Vite integration guide           |

### Per-package agent briefs (`packages/*/AGENTS.md`)

Each package carries an `AGENTS.md` — role, public surface, dependency edges in
both directions, where to work, and known pitfalls. These are written for an
agent about to change the package; the `README.md` beside each one is the
user-facing doc.

**Foundation — imported by everything, importing nothing**

- [`@lockness/contract`](packages/contract/AGENTS.md) — Shared types, decorator
  declarations, and `safeForLog`, the log encoder every layer needs and only the
  foundation can offer — `core` imports `events`, so the encoder cannot live in
  `core` if the emitter is to reach it. Almost no runtime code, and still the
  cycle-breaker.
- [`@lockness/hono`](packages/hono/AGENTS.md) — The pinned Hono re-export layer.
  Internal; hard rule #1 exists because of it.
- [`@lockness/container`](packages/container/AGENTS.md) — IoC container —
  `@Service`, `@Inject`, lifetimes. Injection is lazy, so services may hold each
  other; only a constructor cycle is a fault, and it raises
  `CircularDependencyError`.

**Framework**

- [`@lockness/core`](packages/core/AGENTS.md) — The framework. The only package
  a user application imports directly.
- [`@lockness/cli`](packages/cli/AGENTS.md) — The command system behind
  `./nessy`, plus the `make:*` stub tree.
- [`@lockness/events`](packages/events/AGENTS.md) — Class-based events,
  dispatcher, listener discovery, test doubles.
- [`@lockness/init`](packages/init/AGENTS.md) — Project scaffolding —
  `lockness init` and the stub tree every new app starts from.

**Identity and request state**

- [`@lockness/auth`](packages/auth/AGENTS.md) — Guards decide how identity is
  proven; the authenticator binds them to providers.
- [`@lockness/auth-provider`](packages/auth-provider/AGENTS.md) — ORM-agnostic
  user providers for `@lockness/auth` (base / drizzle / kysely).
- [`@lockness/session`](packages/session/AGENTS.md) — Session management across
  cookie, memory, Deno KV and Redis drivers.
- [`@lockness/socialite`](packages/socialite/AGENTS.md) — OAuth2 / OIDC social
  authentication with normalised user payloads.
- [`@lockness/validator`](packages/validator/AGENTS.md) — Rules, async
  validation, sanitisers and a Zod decorator bridge.

**Data**

- [`@lockness/drizzle`](packages/drizzle/AGENTS.md) — Drizzle ORM integration
  for PostgreSQL — `Database` service, `db:*` commands, stubs.

**Infrastructure services**

- [`@lockness/cache`](packages/cache/AGENTS.md) — Multi-driver cache with
  tagging. Loaded optionally by core at boot.
- [`@lockness/queue`](packages/queue/AGENTS.md) — Background job processing with
  multiple drivers.
- [`@lockness/scheduler`](packages/scheduler/AGENTS.md) — Cron-based task
  scheduling — `@Schedule`, presets, retries, graceful stop.
- [`@lockness/storage`](packages/storage/AGENTS.md) — File storage over local
  and cloud drivers.
- [`@lockness/mail`](packages/mail/AGENTS.md) — Email sending with pluggable
  drivers and a fluent message builder.
- [`@lockness/logger`](packages/logger/AGENTS.md) — Structured logging — levels,
  transports, formatters, metadata.
- [`@lockness/sse`](packages/sse/AGENTS.md) — Server-Sent Events: channels,
  connection manager, wire formatter.

**View layer**

- [`@lockness/ui`](packages/ui/AGENTS.md) — The component library — 90 files,
  Hono JSX and Tailwind v4.
- [`@lockness/markdown`](packages/markdown/AGENTS.md) — Markdown rendered to JSX
  through `@lockness/ui` components.
- [`@lockness/inertia`](packages/inertia/AGENTS.md) — Inertia.js server adapter
  — partial reloads, shared props, the response protocol.

**Tooling and developer experience**

- [`@lockness/devtools`](packages/devtools/AGENTS.md) — The debug bar and
  dashboard at `/_devtools`. Dev-only.
- [`@lockness/openapi`](packages/openapi/AGENTS.md) — Generates an OpenAPI 3.0
  document from route metadata.
- [`@lockness/upgrade`](packages/upgrade/AGENTS.md) — Rewrites a project's
  `@lockness/*` specifiers to the latest published versions.
- [`@lockness/deprecation-contracts`](packages/deprecation-contracts/AGENTS.md)
  — A convention for raising, collecting and rendering deprecation notices.
- [`@lockness/vite`](packages/vite/AGENTS.md) — Deno-native Vite integration —
  dev-server bridge (`App.fetch()` by injection), Deno specifier resolver, and a
  manifest-aware asset helper. Standalone and opt-in (epic #64).

### Package Documentation (`packages/*/docs/`)

| Package                                                                           | Description             |
| --------------------------------------------------------------------------------- | ----------------------- |
| [core/docs/kernel.md](packages/core/docs/kernel.md)                               | Kernel configuration    |
| [core/docs/kernel-decorator.md](packages/core/docs/kernel-decorator.md)           | @Kernel decorator       |
| [core/docs/routing.md](packages/core/docs/routing.md)                             | Routing system          |
| [core/docs/middleware.md](packages/core/docs/middleware.md)                       | Core middleware         |
| [core/docs/mount-points.md](packages/core/docs/mount-points.md)                   | Multi-mount routing     |
| [core/docs/throttling.md](packages/core/docs/throttling.md)                       | Rate limiting           |
| [core/docs/compose.md](packages/core/docs/compose.md)                             | Middleware composition  |
| [core/docs/error-handling.md](packages/core/docs/error-handling.md)               | Error handling system   |
| [core/docs/components.md](packages/core/docs/components.md)                       | JSX components          |
| [core/docs/ssg.md](packages/core/docs/ssg.md)                                     | Static site generation  |
| [auth/docs/DOCS.md](packages/auth/docs/DOCS.md)                                   | Authentication system   |
| [session/docs/DOCS.md](packages/session/docs/DOCS.md)                             | Session management      |
| [cache/docs/DOCS.md](packages/cache/docs/DOCS.md)                                 | Caching system          |
| [queue/docs/DOCS.md](packages/queue/docs/DOCS.md)                                 | Background jobs         |
| [scheduler/docs/DOCS.md](packages/scheduler/docs/DOCS.md)                         | Cron task scheduling    |
| [mail/docs/DOCS.md](packages/mail/docs/DOCS.md)                                   | Email sending           |
| [storage/docs/DOCS.md](packages/storage/docs/DOCS.md)                             | File storage            |
| [validator/docs/DOCS.md](packages/validator/docs/DOCS.md)                         | Request validation      |
| [socialite/docs/DOCS.md](packages/socialite/docs/DOCS.md)                         | OAuth providers         |
| [inertia/docs/DOCS.md](packages/inertia/docs/DOCS.md)                             | Inertia.js adapter      |
| [drizzle/docs/DOCS.md](packages/drizzle/docs/DOCS.md)                             | Drizzle ORM integration |
| [cli/docs/DOCS.md](packages/cli/docs/DOCS.md)                                     | CLI commands            |
| [init/docs/DOCS.md](packages/init/docs/DOCS.md)                                   | Project scaffolding     |
| [container/docs/DOCS.md](packages/container/docs/DOCS.md)                         | Dependency injection    |
| [events/docs/DOCS.md](packages/events/docs/DOCS.md)                               | Event system            |
| [devtools/docs/DOCS.md](packages/devtools/docs/DOCS.md)                           | Development toolbar     |
| [deprecation-contracts/docs/DOCS.md](packages/deprecation-contracts/docs/DOCS.md) | Deprecation system      |
| [ui/docs/DOCS.md](packages/ui/docs/DOCS.md)                                       | UI components library   |

### UI Component Documentation (`packages/ui/components/*/DOCS.md`)

Each UI component has its own documentation:

| Component                                                       | Description           |
| --------------------------------------------------------------- | --------------------- |
| [Accordion/DOCS.md](packages/ui/components/Accordion/DOCS.md)   | Collapsible sections  |
| [Alert/DOCS.md](packages/ui/components/Alert/DOCS.md)           | Alert messages        |
| [Badge/DOCS.md](packages/ui/components/Badge/DOCS.md)           | Status badges         |
| [Breadcrumb/DOCS.md](packages/ui/components/Breadcrumb/DOCS.md) | Navigation breadcrumb |
| [Button/DOCS.md](packages/ui/components/Button/DOCS.md)         | Button variants       |
| [Card/DOCS.md](packages/ui/components/Card/DOCS.md)             | Content containers    |
| [Chart/DOCS.md](packages/ui/components/Chart/DOCS.md)           | Chart components      |
| [Checkbox/DOCS.md](packages/ui/components/Checkbox/DOCS.md)     | Form checkbox         |
| [CodeBlock/DOCS.md](packages/ui/components/CodeBlock/DOCS.md)   | Code display          |
| [Gallery/DOCS.md](packages/ui/components/Gallery/DOCS.md)       | Image gallery         |
| [Hero/DOCS.md](packages/ui/components/Hero/DOCS.md)             | Hero sections         |
| [Input/DOCS.md](packages/ui/components/Input/DOCS.md)           | Form inputs           |
| [Modal/DOCS.md](packages/ui/components/Modal/DOCS.md)           | Modal dialogs         |
| [Navbar/DOCS.md](packages/ui/components/Navbar/DOCS.md)         | Navigation bar        |
| [Pagination/DOCS.md](packages/ui/components/Pagination/DOCS.md) | Pagination controls   |
| [Pricing/DOCS.md](packages/ui/components/Pricing/DOCS.md)       | Pricing sections      |
| [Progress/DOCS.md](packages/ui/components/Progress/DOCS.md)     | Progress bars         |
| [RootLayout/DOCS.md](packages/ui/components/RootLayout/DOCS.md) | Base HTML layout      |
| [SearchBar/DOCS.md](packages/ui/components/SearchBar/DOCS.md)   | Search input          |
| [Sidebar/DOCS.md](packages/ui/components/Sidebar/DOCS.md)       | Sidebar navigation    |
| [Switch/DOCS.md](packages/ui/components/Switch/DOCS.md)         | Toggle switch         |
| [Table/DOCS.md](packages/ui/components/Table/DOCS.md)           | Data tables           |
| [Tabs/DOCS.md](packages/ui/components/Tabs/DOCS.md)             | Tab navigation        |
| [Textarea/DOCS.md](packages/ui/components/Textarea/DOCS.md)     | Form textarea         |

---

## 🛠 Architectural Highlights

### Declarative Kernel Configuration

Lockness uses a declarative `@Kernel` decorator for application configuration.
See [kernel-decorator.md](packages/core/docs/kernel-decorator.md) for full
documentation.

**Key decorators:**

- `@Kernel(config)`: Database, session, devtools, controllers configuration
- `@DeclareGlobalMiddleware()`: Marks global middleware stack
- `@OnBoot({ priority })`: Lifecycle hooks during startup
- `createApp(KernelClass)`: Bootstraps from decorated kernel

### Externalized Configuration

Configuration lives in `config/` directory. See
[architecture.md](docs/architecture.md).

```text
config/
├── mod.ts          # Central export
├── app.ts          # App settings
├── database.ts     # Database connection
├── session.ts      # Session management
├── compile.ts      # Binary compilation
└── i18n.ts         # Internationalization
```

### Dependency Injection

Built-in Service Container with `@Service()` and `@Inject()`. See
[container/docs/DOCS.md](packages/container/docs/DOCS.md).

**JSX configuration** in `deno.json`:

```json
"compilerOptions": {
    "jsx": "precompile",
    "jsxImportSource": "@lockness/core"
}
```

### Core Architecture

The framework follows SOLID principles with domain-driven organization:

- **HTTP Domain** (`http/`): MiddlewareResolver, StaticFileServer,
  ServerListener
- **Routing Domain** (`routing/`): ControllerDiscovery, RouteRegistry,
  MountManager
- **Exceptions Domain** (`exceptions/`): ErrorHandlerRegistry
- **View Domain** (`view/`): JSX runtime and components

See [architecture.md](docs/architecture.md) for detailed package structure.

### Modular Package System

**Core Package** (`@lockness/core`):

- Framework fundamentals (App, decorators, routing)
- Dependency Injection system
- Complete Hono re-export
- JSX runtime

**Optional Packages** (import as needed):

- `@lockness/session` - Session management
- `@lockness/queue` - Background job processing
- `@lockness/scheduler` - Cron-based task scheduling
- `@lockness/cache` - Caching system
- `@lockness/mail` - Email sending
- `@lockness/storage` - File storage
- `@lockness/auth` - Authentication
- `@lockness/socialite` - OAuth providers
- `@lockness/inertia` - Inertia.js adapter
- `@lockness/ui` - UI components library

### Dependency Architecture

Strict acyclic dependency graph (DAG):

**Foundation Layer:**

- `@lockness/contract` - Core contracts (zero dependencies)
- `@lockness/hono` - Hono bridge (zero dependencies)

**Implementation Layer:**

- `@lockness/container` - DI container
- Feature packages (`auth`, `session`, `cache`, etc.)

**Orchestration Layer:**

- `@lockness/core` - Main orchestrator re-exporting everything

Run `deno task deps:analyze` to verify the graph. See
[dependencies.md](docs/dependencies.md).

---

## 🔧 Key Features

### Routing & Controllers

Named routes, automatic route generation, multi-mount patterns (i18n, API
versioning). See:

- [routing.md](packages/core/docs/routing.md)
- [mount-points.md](packages/core/docs/mount-points.md)
- [throttling.md](packages/core/docs/throttling.md)

### Middleware

Composition, class-based, named registration. See:

- [middleware.md](docs/middleware.md)
- [compose.md](packages/core/docs/compose.md)

### Authentication

Multi-guard system (Session, Token, Basic), decorators, user providers. See:

- [auth/docs/DOCS.md](packages/auth/docs/DOCS.md)

### Session Management

Multiple drivers (cookie, deno-kv, memory). See:

- [session/docs/DOCS.md](packages/session/docs/DOCS.md)

### Database & ORM

Drizzle ORM integration with migrations, seeders, validation. See:

- [drizzle/docs/DOCS.md](packages/drizzle/docs/DOCS.md)
- [models.md](docs/models.md)

### Error Handling

Auto-discovery, custom error pages, formatted console output. See:

- [error-handling.md](packages/core/docs/error-handling.md)

### Lifecycle Events

Boot/request/response/shutdown hooks with priority ordering. See:

- [lifecycle-events.md](docs/lifecycle-events.md)

### Caching

Decorator-based response caching, multiple drivers. See:

- [cache/docs/DOCS.md](packages/cache/docs/DOCS.md)

### Background Jobs

Queue system with Deno KV driver. See:

- [queue/docs/DOCS.md](packages/queue/docs/DOCS.md)

### Mail System

Fluent API, multiple drivers (console, SMTP, Resend). See:

- [mail/docs/DOCS.md](packages/mail/docs/DOCS.md)

### Social Authentication

OAuth2 with Google, GitHub, Discord. See:

- [socialite/docs/DOCS.md](packages/socialite/docs/DOCS.md)

### UI Components

CLI tooling, copied to project (shadcn/ui style). See:

- [ui/docs/DOCS.md](packages/ui/docs/DOCS.md)
- Component-specific docs in `packages/ui/components/*/DOCS.md`

### Deprecation Contracts

Evolution management with Devtools integration. See:

- [deprecation-contracts/docs/DOCS.md](packages/deprecation-contracts/docs/DOCS.md)

---

## 📂 Repository Structure

```text
.
├── packages/              # 📦 Modular Framework Libraries
│   ├── core/              # Core Web & DI logic
│   ├── cli/               # CLI Command Engine
│   ├── drizzle/           # Drizzle ORM Extension
│   ├── ui/                # UI Components
│   └── ...                # Other packages
├── config/                # ⚙️ Configuration Files
├── app/                   # 🚀 Framework Template (Boilerplate)
│   ├── auth/              # Auth providers & guards
│   ├── controller/        # HTTP Controllers
│   ├── middleware/        # Custom middlewares
│   ├── model/             # Database Models
│   ├── service/           # Business Logic
│   └── kernel.tsx         # App Initialization
├── docs/                  # Documentation (Markdown)
├── scripts/               # Build & Internal Scripts
├── main.ts                # Entry point
├── cli.ts                 # CLI Entry point
└── deno.json              # Config & Aliases
```

---

## 🎨 Tailwind CSS v4 — Quick Reference

Hard rule #4 above: parentheses for CSS variables, brackets for literal values.

| Purpose            | Syntax                    | Example                   |
| ------------------ | ------------------------- | ------------------------- |
| CSS Variable       | `utility-(--var-name)`    | `bg-(--primary)`          |
| Arbitrary Value    | `utility-[value]`         | `px-[0.75rem]`            |
| Font-size Variable | `text-[length:--var]`     | `text-[length:--text-sm]` |
| Color with Opacity | `utility-(--var)/opacity` | `bg-(--primary)/50`       |

---

## ⚙️ Development Workflow

The pre-completion quality gate
(`deno fmt && deno lint && deno check && deno task test`) is hard rule #5 above.

### Dev mode (multi-terminal)

```bash
# Terminal 1 — CSS watcher
deno task css:watch

# Terminal 2 — Dev server
deno task dev
```

### Common CLI commands

```bash
deno task cli init                    # Scaffold new project
deno task cli make:controller <Name>  # Create controller
deno task cli make:model <Name> -a    # Create model with all
deno task cli make:middleware <Name>  # Create middleware
deno task cli db:migrate              # Apply migrations
deno task cli router:list             # List all routes
deno task cli tinker                  # Interactive REPL
```

Full command reference: [nessy.md](docs/nessy.md). Workspace/package commands:
[packages.md](docs/packages.md). Stub mappings: [STUBS.md](docs/STUBS.md).
Version bumping: `deno task bump <version>` — details in
[packages.md](docs/packages.md).

---

## 🧪 Testing, 🚀 Deployment, 🐳 Docker, 🔄 Upgrading

These topics live in their dedicated docs — AGENTS.md does not duplicate the
detail:

- **Testing** (FakeTime, in-memory mocks, coverage):
  [testing.md](docs/testing.md)
- **Deployment** (Deno Deploy, standalone binary, direct exec, Docker):
  [deployment.md](docs/deployment.md)
- **Binary compilation** (`deno task compile`, asset management):
  [compilation.md](docs/compilation.md)
- **Upgrading** (`jsr:@lockness/upgrade`): see
  [installation.md](docs/installation.md) and
  [contribution.md](docs/contribution.md)

---

## 🌊 Contributing

Full guidelines in [contribution.md](docs/contribution.md). High-level
reminders:

- Public APIs go through `mod.ts`
- Don't manually add `@lockness/*` to root imports — workspaces handle it
- Register new libraries in the workspace array
- Use `deno task bump <version>` for releases
- Repo:
  [locknessland/lockness-monorepo](https://github.com/locknessland/lockness-monorepo)

---

## 🔌 Optional Claude Code integrations

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

<!-- --- Specnaut: chain-stops --- -->

## The Specnaut chain has exactly two stops

_Owned by Specnaut — this section is not a placeholder to fill in. Edit the rest
freely._

`plan → tasks → implement → review → merge`. It stops at exactly two points, and
no third:

1. **The end of `plan`** — the architecture is presented with the alternatives
   that were rejected, both audits' findings are presented separately, and the
   open questions are asked.
2. **The review verdict** — which _is_ the merge request. There is no separate
   pre-merge stop.

Every other boundary is crossed by **invoking the next phase yourself, in the
same turn** — your own next action, never a command printed for someone to
paste:

| Boundary                            | What happens                              |
| :---------------------------------- | :---------------------------------------- |
| last question answered → `tasks`    | invoked in the same turn                  |
| breakdown committed → `implement`   | invoked in the same turn                  |
| gates green, tree frozen → `review` | invoked in the same turn                  |
| `review` returns findings           | **STOP** — triage, then the merge request |

None of these is a reason to stop, and each one gets used as one:

| The excuse                                   | Why it is not a reason                                                                   |
| :------------------------------------------- | :--------------------------------------------------------------------------------------- |
| "That's a lot of tasks — confirm first?"     | The size was known when the chain started.                                               |
| "MVP only, or the whole thing?"              | The plan states both. The MVP is a checkpoint inside the full path, not a fork to offer. |
| "This is where the real code gets written."  | Yes. That is the point of the chain.                                                     |
| "The audits found a lot — re-confirm scope?" | They were folded into the plan, and the plan was approved.                               |
| "They've been checkpointing each step."      | Answering a question is not a request to be asked another one.                           |

**Genuinely blocked is not the same as stopped.** If something truly blocks part
of the work, say what is blocked in one or two sentences, implement everything
that is not blocked, and name the remainder. Stopping with nothing built is
reserved for the case where proceeding under any assumption would be unsafe or
would make the work useless if wrong. "I would like confirmation" is not that
case.

**Only a CRITICAL or HIGH finding buys another fix cycle**; MEDIUM and LOW go to
the backlog and the branch ships. Those cycles run inside the second stop —
don't ask again between each one.

`merge` is never automatic. It is asked for — **unless the user already said to
merge**, in which case that is their instruction and it is followed without a
second confirmation.

<!-- --- End Specnaut: chain-stops --- -->

<!-- --- Specnaut: ui-defaults --- -->

## UI defaults

_Owned by Specnaut — this section is not a placeholder to fill in. Edit the rest
freely._

**Any UI you build — web or native — follows the `mobile-first-contract`
skill.** Read it; never restate it here. It is a **default, not a mandate**: a
project whose target surface is genuinely narrower says so once, in
`.specnaut/memory/constitution.md`, and is not asked again.

<!-- --- End Specnaut: ui-defaults --- -->

<!-- --- Specnaut: response-style --- -->

## Response style

_Owned by Specnaut — this section is not a placeholder to fill in. Edit the rest
freely._

**How you answer — brevity, visual order, how a question is put, and what a
badge colour means — follows the `response-style-contract` skill.** Read it;
never restate it here. It is in force on **every** turn, not only when a skill
or an agent is involved.

<!-- --- End Specnaut: response-style --- -->
