# 📝 Lockness JS - Roadmap & TODO

## 🚀 High Priority (Next Steps)

- [x] **ORM Integration (Drizzle)**
  - [x] Setup Drizzle ORM core integration.
  - [x] Create a `Database` service for DI.
  - [x] Implement Ace commands (`db:generate`, `db:migrate`, `db:push`,
        `db:studio`).
- [x] **Database Advanced**
  - [x] Seeders implementation (`db:seed`, `make:seeder`).
  - [ ] `make:model` command with repository stub.

## 🛠 Framework Core

- [ ] **Enhanced Validation**
  - [ ] `@Validate(schema)` decorator for automatic request validation.
  - [ ] Centralized error handling for validation errors.
- [ ] **Middleware Improvements**
  - [ ] Global middleware support.
  - [ ] Named middleware (e.g., `middleware('auth')`).
- [ ] **CLI (Ace) Enhancements**
  - [ ] Support for user-defined commands in `src/command/`.
  - [ ] `ace tinker` (REPL) for application interaction.

## 🔒 Security & Auth

- [ ] **Session Management**
  - [ ] Cookie-based session store.
  - [ ] Drivers for Redis / Deno KV.
- [ ] **Authentication System**
  - [ ] `@UseAuth` decorator/guard.
  - [ ] Built-in Auth service for login/register logic.
  - [ ] Social Auth providers (OIDC).

## 🌐 Frontend & Assets

- [x] **Vite Integration**
  - [x] Seamless frontend building with Vite.
  - [x] `asset()` helper for versioned assets.
- [x] **Layout & Component Helpers**
  - [x] Improved JSX base components.

## 📡 Services

- [ ] **Mail System**
  - [ ] Expressive API for sending emails.
  - [ ] Drivers for SMTP, Resend, Postmark.
- [ ] **Background Jobs / Queues**
  - [ ] Task queuing system (built-in or using Deno KV queues).

---

_Generated on 2025-12-22_
