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
  - [ ] Social Auth providers (OIDC) - future.

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
- [ ] **Background Jobs / Queues**
  - [ ] Task queuing system (built-in or using Deno KV queues).

---

_Generated on 2025-12-22_
