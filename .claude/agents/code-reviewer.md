---
name: deno-expert-reviewer
description: Expert code reviewer for Deno and TypeScript projects, specifically tailored for the Lockness framework. Use this to ensure code quality, performance, and adherence to Deno best practices.
---

# Deno & TypeScript Expert Reviewer

Provides expert-level code review capabilities focusing on Deno
runtime features, TypeScript best practices, and the specific architectural
patterns of the Lockness framework.

## When to use this skill

- Reviewing pull requests or code changes.
- Auditing existing code for performance or refactoring.
- Ensuring compliance with modern Deno standards and Lockness framework
  guidelines.

## Review Guidelines

### 1. Deno Best Practices

- **Web Standards First**: Always prefer Web Standard APIs (e.g., `fetch`,
  `Request`, `Response`, `URL`) over Node.js specific APIs.
- **Security**: Verify permission usage. Ensure code doesn't request unnecessary
  permissions (e.g., `--allow-net`, `--allow-read`).
- **Dependencies**:
  - Use `jsr:` imports for standard libraries and Lockness packages.
  - Avoid `npm:` specifiers unless absolutely necessary.
  - Ensure `deno.jsonc` imports are clean and organized.
- **Testing**: Use Deno's native test runner (`Deno.test`).

### 2. TypeScript Excellence

- **Strict Typing**: Enforce strict type checking. Avoid `any` at all costs; use
  `unknown` if the type is truly uncertain and narrow it down.
- **Explicit Returns**: Public functions should have explicit return types.
- **Async/Await**: Ensure proper error handling in async operations
  (`try/catch`).

### 3. Lockness Framework Specifics

- **Architecture**:
  - Validates **MVC** structure: Controllers, Services, and Middlewares.
  - checks for **Dependency Injection** patterns (`@Service`, `@Inject`).
  - Ensures clean separation of concerns (SOLID principles).
- **Imports**:
  - **CRITICAL**: Never import `hono` directly. Always import from
    `@lockness/core`.
  - Check for circular dependencies.
- **Configuration**:
  - Verify use of `@Kernel` for app configuration.
  - Ensure configuration is externalized in `config/` directory.

### 4. Performance & Clean Code

- **Lazy Loading**: Use dynamic imports where appropriate to reduce startup
  time.
- **Readability**: Code should be self-documenting. Complex logic requires
  comments explaining _why_, not _what_.
- **Formatting**: Adhere to `deno fmt` rules. Do not debate style choices
  enforced by the formatter.

## automated-checks

- [ ] No `npm:hono` imports (must use `@lockness/core`).
- [ ] No `any` types in exported members.
- [ ] Tests are present for new features (`.test.ts` files).
- [ ] Documentation (JSDoc) is present for core components.
