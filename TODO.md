# 📝 Lockness JS - Roadmap & TODO

## 🚀 High Priority (Next Steps)

- [x] **ORM Integration (Drizzle)**
  - [x] Setup Drizzle ORM core integration.
  - [x] Create a `Database` service for DI.
  - [x] Implement Ace commands (`db:generate`, `db:migrate`, `db:push`,
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
- [x] **CLI (Ace) Enhancements**
  - [x] Support for user-defined commands in `src/command/` with `@Command`
        decorator.
  - [x] `ace tinker` (REPL) for application interaction.

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
  - [ ] `make:crud <name>` command to scaffold model, controller, repository,
        service, views, and routes in one command.
- [ ] **Error Pages**
  - [ ] Styled error pages for 404, 500, and other HTTP errors.
  - [ ] Dev mode: detailed stack trace, request context, and suggestions.
  - [ ] Prod mode: clean user-friendly error pages.
- [ ] **Smart Stub Generation**
  - [ ] Auto-import common dependencies in generated files (Container, Context,
        decorators).
  - [ ] Detect related files and suggest imports (e.g., model for repository).
- [ ] **API Documentation (Swagger/OpenAPI)**
  - [ ] `@ApiDoc` decorator for documenting routes.
  - [ ] Auto-generate OpenAPI spec from controllers.
  - [ ] `ace docs:generate` command to output `openapi.json`.
  - [ ] Built-in Swagger UI route (`/docs`).

## 🧰 Devtools

- [ ] **Debug Toolbar** (`@lockness/devtools`)
  - [ ] Separate library, enabled in dev mode only.
  - [ ] Web dashboard accessible at `/__devtools`.
  - [ ] Panels: Routes, Logs, SQL Queries, Sessions, Queue, Mail, Performance.
  - [ ] Request inspector with timing breakdown.

## ⚛️ Inertia.js Integration

- [ ] **Inertia Adapter** (`@lockness/inertia`)
  - [ ] Server-side adapter for Hono/Lockness.
  - [ ] `inertia()` helper to render React components from controllers.
  - [ ] Automatic props serialization and shared data.
  - [ ] Support for lazy props and partial reloads.
- [ ] **React Frontend**
  - [ ] Vite plugin configuration for Inertia + React.
  - [ ] `createInertiaApp()` setup with SSR support.
  - [ ] `Link`, `Head`, `useForm` components.
- [ ] **Starter Kit**
  - [ ] `inertia` starter kit with React, Tailwind, auth scaffolding.
  - [ ] `ace init --kit=inertia` command.

## 🎁 Starter Kits

- [ ] **Official Starter Kits** (like AdonisJS)
  - [ ] `web` - Full-stack with SSR views, sessions, auth.
  - [ ] `api` - REST API with JWT auth, CORS, rate limiting.
  - [ ] `slim` - Minimal setup, no auth, no views.
  - [ ] Init command integration: `ace init --kit=api`.

---

_Generated on 2025-12-22_
