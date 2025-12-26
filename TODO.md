# 📝 Lockness JS - Roadmap & TODO

## 🚀 High Priority (Next Steps)

- [x] **ORM Integration (Drizzle)**
  - [x] Setup Drizzle ORM core integration.
  - [x] Create a `Database` service for DI.
  - [x] Implement Cli commands (`db:generate`, `db:migrate`, `db:push`,
        `db:studio`).
- [x] **Database Advanced**
  - [x] Seeders implementation (`db:seed`, `make:seeder`).
  - [x] `make:model` command with flags (`-r` repository, `-s` seeder, `-c`
        controller, `-a` all).

## 🛠 Framework Core

- [x] **Enhanced Validation**
  - [x] `@Validate(schema)` decorator for automatic request validation.
  - [x] Centralized error handling for validation errors.
- [x] **Middleware Improvements**
  - [x] Global middleware support (`globalMiddlewares` in kernel).
  - [x] Named middleware (e.g., `@Use('auth')` with registry in kernel).
- [x] **CLI Enhancements**
  - [x] Support for user-defined commands in `src/command/` with `@Command`
        decorator.
  - [x] `cli tinker` (REPL) for application interaction.

## 🔒 Security & Auth

- [x] **Session Management**
  - [x] Cookie-based session store.
  - [x] Drivers for Memory / Deno KV.
- [x] **Authentication System**
  - [x] `@Auth` and `@Guest` decorators/guards.
  - [x] Built-in Auth guard for login/logout logic.
  - [x] Password hashing with Web Crypto (PBKDF2).
  - [x] `make:auth` command to scaffold auth controller + provider.
  - [x] Social Auth providers (OAuth2) - Google, GitHub, Discord.

## 🌐 Frontend & Assets

- [x] **Vite Integration**
  - [x] Seamless frontend building with Vite.
  - [x] `asset()` helper for versioned assets.
- [x] **Layout & Component Helpers**
  - [x] Improved JSX base components.

## 📡 Services

- [x] **Mail System**
  - [x] Expressive fluent API for sending emails.
  - [x] Drivers for Console, Memory, SMTP, Resend.
- [x] **Background Jobs / Queues**
  - [x] Job interface and `@Queueable` decorator.
  - [x] Drivers for Memory and Deno KV.
  - [x] `dispatch()` API with delay and queue options.
  - [x] `queue:work` and `queue:clear` commands.
  - [x] `make:job` scaffolding command.

## 🎯 Developer Experience (DX)

- [x] **CLI & Debug Tools**
  - [x] `router:list` command to display all routes with methods, paths,
        controller actions, and middlewares.
  - [x] `make:crud <name>` command to scaffold model, controller, repository,
        service, views, and routes in one command.
- [x] **Error Pages**
  - [x] Styled error pages for 404, 500, and other HTTP errors.
  - [x] Dev mode: detailed stack trace, request context, and suggestions.
  - [x] Prod mode: clean user-friendly error pages.
- [ ] **Smart Stub Generation**
  - [ ] Auto-import common dependencies in generated files (Container, Context,
        decorators).
  - [ ] Detect related files and suggest imports (e.g., model for repository).
- [x] **API Documentation (Swagger/OpenAPI)**
  - [x] `@ApiDoc` decorator for documenting routes.
  - [x] Auto-generate OpenAPI spec from controllers.
  - [x] `cli docs:generate` command to output `openapi.json`.
  - [x] Built-in Swagger UI route (`/docs`).

## 🧰 Devtools

- [x] **Debug Toolbar** (`@lockness/devtools`)
  - [x] Separate library, enabled in dev mode only.
  - [x] Web dashboard accessible at `/_devtools`.
  - [x] Panels: Routes, Logs, SQL Queries, Sessions, Queue, Mail, Performance.
  - [x] Request inspector with timing breakdown.
  - [x] Symfony-style debug toolbar injected in HTML responses.
  - [x] Configurable with `DEBUG_BAR` environment variable.
  - [x] Full JSX components with Hono JSX.
  - [x] Comprehensive tests and documentation.

## ⚛️ Frontend Architecture

**Note**: Après exploration (déc. 2024), les approches Islands/SPA/Inertia
nécessitent:

- Des outils de bundling lourds (Vite, esbuild) → contre la philosophie "full
  Deno"
- `deno bundle` qui reste expérimental et instable
- Complexité de transpilation TypeScript → JavaScript pour le client

**Décision**: Lockness reste sur du **SSR classique avec Hono JSX** pour le
moment. C'est simple, performant, et 100% Deno natif.

### Futures options possibles (quand la stack Deno sera plus mature):

- [ ] **Option 1: Islands Architecture** (quand `deno bundle` stable)
  - Revisiter quand `deno bundle` sort de l'expérimental
  - SSR + hydration partielle côté client
- [ ] **Option 2: HTMX Integration** (léger, SSR-first)
  - Helper `htmx()` pour activer HTMX sur les routes
  - Pas de bundling nécessaire, juste un CDN script
  - Parfait pour interactivité légère
- [ ] **Option 3: Alpine.js helpers** (petites interactions)
  - Composants JSX avec attributs Alpine
  - Pas de build step, juste du HTML enrichi

**Alternative actuelle**: Pour une SPA moderne, monter un frontend séparé
(Next.js, Remix, SvelteKit) qui consomme une API Lockness REST/GraphQL.

## 🎁 Starter Kits

- [ ] **Official Starter Kits** (like AdonisJS)
  - [ ] `web` - Full-stack with SSR views, sessions, auth.
  - [ ] `api` - REST API with JWT auth, CORS, rate limiting.
  - [ ] `slim` - Minimal setup, no auth, no views.
  - [ ] Init command integration: `cli init --kit=api`.

---

_Generated on 2025-12-22_
