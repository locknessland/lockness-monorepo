# Lockness - Fullstack MVC Framework for Deno

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
> v4 CSS-variable syntax, pre-completion gate, etc.) live in
> [.claude/CLAUDE.md](.claude/CLAUDE.md).

---

## 🛤️ Workflows: Specflow + Orchestrate

Lockness uses two complementary workflows. Pick the one that fits the task.

- **`/specflow specify "<feature>"`** — chained pipeline (clarify → plan → tasks
  → analyze → implement → review → merge). Use for greenfield features needing a
  written spec + plan + tasks tree before implementation. New specifications
  live under `.specflow/specs/<feature>/`. The SpecFlow constitution is
  `.specflow/memory/constitution.md`.
- **`/orchestrate`** — Lockness multi-agent dispatch (product-owner → architect
  → developer → qa-tester → code-reviewer, with docs-writer / devops-sre in
  parallel). Use for backlog issues that map cleanly to our team layout. Skill
  at `.claude/skills/orchestrate/SKILL.md`.

Backlog source of truth: GitHub Project #1 (`locknessland/lockness`). Managed
via the `/backlog` skill or the `product-owner` agent.

---

## 📚 Documentation Index

The documentation is organized across several locations. When you need details,
refer to these files:

### Root Documentation (`docs/`)

| Topic                                                                 | Description                     |
| --------------------------------------------------------------------- | ------------------------------- |
| [architecture.md](docs/architecture.md)                               | Package system & layered design |
| [getting-started.md](docs/getting-started.md)                         | Quick start tutorial            |
| [installation.md](docs/installation.md)                               | Installation guide              |
| [lifecycle-events.md](docs/lifecycle-events.md)                       | Framework Lifecycle Events      |
| [middleware.md](docs/middleware.md)                                   | Middleware patterns             |
| [models.md](docs/models.md)                                           | Database models with Drizzle    |
| [testing.md](docs/testing.md)                                         | Testing best practices          |
| [deployment.md](docs/deployment.md)                                   | Production deployment           |
| [compilation.md](docs/compilation.md)                                 | Binary compilation              |
| [nessy.md](docs/nessy.md)                                             | Nessy CLI wrapper               |
| [packages.md](docs/packages.md)                                       | Package management              |
| [contribution.md](docs/contribution.md)                               | Contributing guide              |
| [dependencies.md](docs/dependencies.md)                               | Dependency graph                |
| [STUBS.md](docs/STUBS.md)                                             | Stub synchronization            |
| [ui-components-documentation.md](docs/ui-components-documentation.md) | UI components overview          |

### Package Documentation (`packages/*/docs/`)

| Package                                                                           | Description             |
| --------------------------------------------------------------------------------- | ----------------------- |
| [core/docs/kernel.md](packages/core/docs/kernel.md)                               | Kernel configuration    |
| [core/docs/kernel-decorator.md](packages/core/docs/kernel-decorator.md)           | @Kernel decorator       |
| [core/docs/routing.md](packages/core/docs/routing.md)                             | Routing system          |
| [core/docs/middleware.md](packages/core/docs/middleware.md)                       | Core middleware         |
| [core/docs/mount-points.md](packages/core/docs/mount-points.md)                   | Multi-mount routing     |
| [core/docs/compose.md](packages/core/docs/compose.md)                             | Middleware composition  |
| [core/docs/error-handling.md](packages/core/docs/error-handling.md)               | Error handling system   |
| [core/docs/components.md](packages/core/docs/components.md)                       | JSX components          |
| [auth/docs/DOCS.md](packages/auth/docs/DOCS.md)                                   | Authentication system   |
| [session/docs/DOCS.md](packages/session/docs/DOCS.md)                             | Session management      |
| [cache/docs/DOCS.md](packages/cache/docs/DOCS.md)                                 | Caching system          |
| [queue/docs/DOCS.md](packages/queue/docs/DOCS.md)                                 | Background jobs         |
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

The hard rule lives in [.claude/CLAUDE.md](.claude/CLAUDE.md) (rule #4):
parentheses for CSS variables, brackets for literal values.

| Purpose            | Syntax                    | Example                   |
| ------------------ | ------------------------- | ------------------------- |
| CSS Variable       | `utility-(--var-name)`    | `bg-(--primary)`          |
| Arbitrary Value    | `utility-[value]`         | `px-[0.75rem]`            |
| Font-size Variable | `text-[length:--var]`     | `text-[length:--text-sm]` |
| Color with Opacity | `utility-(--var)/opacity` | `bg-(--primary)/50`       |

---

## ⚙️ Development Workflow

The pre-completion quality gate
(`deno fmt && deno lint && deno check && deno
task test`) is enforced by
[.claude/CLAUDE.md](.claude/CLAUDE.md) rule #5.

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
- Repo: [locknessland/lockness](https://github.com/locknessland/lockness)

<!-- --- Specnaut: chain-stops --- -->
## The Specnaut chain has exactly two stops

*Owned by Specnaut — this section is not a placeholder to fill in. Edit the rest freely.*

`plan → tasks → implement → review → merge`. It stops at exactly two points, and no third:

1. **The end of `plan`** — the architecture is presented with the alternatives that were rejected,
   both audits' findings are presented separately, and the open questions are asked one at a time.
2. **The review verdict** — which *is* the merge request. There is no separate pre-merge stop.

Every other boundary is crossed by **invoking the next phase yourself, in the same turn** — your own
next action, never a command printed for someone to paste:

| Boundary | What happens |
| :--- | :--- |
| last question answered → `tasks` | invoked in the same turn |
| breakdown committed → `implement` | invoked in the same turn |
| gates green, tree frozen → `review` | invoked in the same turn |
| `review` returns findings | **STOP** — triage, then the merge request |

None of these is a reason to stop, and each one gets used as one:

| The excuse | Why it is not a reason |
| :--- | :--- |
| "That's a lot of tasks — confirm first?" | The size was known when the chain started. |
| "MVP only, or the whole thing?" | The plan states both. The MVP is a checkpoint inside the full path, not a fork to offer. |
| "This is where the real code gets written." | Yes. That is the point of the chain. |
| "The audits found a lot — re-confirm scope?" | They were folded into the plan, and the plan was approved. |
| "They've been checkpointing each step." | Answering a question is not a request to be asked another one. |

**Genuinely blocked is not the same as stopped.** If something truly blocks part of the work, say
what is blocked in one or two sentences, implement everything that is not blocked, and name the
remainder. Stopping with nothing built is reserved for the case where proceeding under any
assumption would be unsafe or would make the work useless if wrong. "I would like confirmation" is
not that case.

**Only a CRITICAL or HIGH finding buys another fix cycle**; MEDIUM and LOW go to the backlog and the
branch ships. Those cycles run inside the second stop — don't ask again between each one.

`merge` is never automatic. It is asked for — **unless the user already said to merge**, in which
case that is their instruction and it is followed without a second confirmation.
<!-- --- End Specnaut: chain-stops --- -->
