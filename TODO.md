# 📝 Lockness JS - Roadmap & TODO

## 🚀 High Priority (Next Steps)
- [x] **ORM Integration (Drizzle)**
    - [x] Setup Drizzle ORM core integration.
    - [x] Create a `DatabaseService` for DI.
    - [x] Implement `make:model` and `make:migration` in Ace CLI.
    - [x] Add `db:migrate` and `db:seed` commands. (Note: db:push is implemented)
- [ ] **Database Advanced**
    - [ ] Real `db:migrate` (running SQL files) vs `db:push`.
    - [ ] Seeders implementation.


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
- [ ] **Vite Integration**
    - [ ] Seamless frontend building with Vite.
    - [ ] `asset()` helper for versioned assets.
- [ ] **Layout & Component Helpers**
    - [ ] Improved JSX base components.

## 📡 Services
- [ ] **Mail System**
    - [ ] Expressive API for sending emails.
    - [ ] Drivers for SMTP, Resend, Postmark.
- [ ] **Background Jobs / Queues**
    - [ ] Task queuing system (built-in or using Deno KV queues).

---
*Generated on 2025-12-22*
