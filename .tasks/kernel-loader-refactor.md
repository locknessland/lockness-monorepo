# Technical Task: Kernel Loader Refactor (Bootstrap Steps)

## 📋 Task Overview

Refactor the kernel loader to reduce complexity and improve maintainability. The
current createApp implementation in packages/core/kernel/loader.ts is monolithic
(~373 lines), mixes multiple responsibilities, and duplicates error handling
patterns for optional packages. Introduce a bootstrap step pipeline that
isolates concerns, standardizes optional dependency loading, and makes behavior
easier to extend and test.

## 🎯 Objectives

1. **Simplify Boot Pipeline**: Split createApp into discrete bootstrap steps
   (database, session, cache, devtools, middleware, boot hooks, listener
   discovery, events, app init, devtools route collection).
2. **Reduce Duplication**: Centralize optional package import/guard logic and
   shared error handling.
3. **Improve Testability**: Make each step testable in isolation with clear
   inputs/outputs.
4. **Maintain Backwards Behavior**: Preserve existing runtime behavior and
   configuration semantics (no breaking changes).
5. **Document Architecture**: Add JSDoc for new public types and helpers, and
   update any relevant docs if public APIs are added.

## 📁 Affected File Paths

### Core Files to Modify

- /packages/core/kernel/loader.ts - Replace monolithic createApp with a step
  orchestrator; delegate to step implementations.
- /packages/core/kernel/kernel_decorators.ts - Ensure any new metadata types
  remain consistent (if needed).

### Framework Files to Extend

- /packages/core/mod.ts - Export any new public bootstrap types/helpers (if
  exposed).
- /packages/core/types.ts - Add any shared types used by bootstrap steps (if
  required).

### New Files to Create

- /packages/core/kernel/bootstrap/types.ts - BootstrapStep interface and context
  types.
- /packages/core/kernel/bootstrap/registry.ts - Step registration and ordering.
- /packages/core/kernel/bootstrap/helpers.ts - Optional import helpers and
  shared error handling.
- /packages/core/kernel/bootstrap/steps/database.ts - Database init step.
- /packages/core/kernel/bootstrap/steps/session.ts - Session init step.
- /packages/core/kernel/bootstrap/steps/cache.ts - Cache init step.
- /packages/core/kernel/bootstrap/steps/devtools.ts - Devtools enable step.
- /packages/core/kernel/bootstrap/steps/middleware.ts - Global middleware step.
- /packages/core/kernel/bootstrap/steps/boot_hooks.ts - Boot hooks step.
- /packages/core/kernel/bootstrap/steps/middlewares_discovery.ts - Named
  middleware discovery step.
- /packages/core/kernel/bootstrap/steps/listeners.ts - Listener discovery and
  explicit registration step.
- /packages/core/kernel/bootstrap/steps/events.ts - KernelBooted emission step.
- /packages/core/kernel/bootstrap/steps/app_init.ts - App init step.
- /packages/core/kernel/bootstrap/steps/devtools_routes.ts - Devtools route
  collection step.

### Test Files

- /packages/core/tests/kernel.test.ts - Update or extend to validate boot step
  behavior and ordering.
- /packages/core/tests/bootstrap_steps.test.ts - New unit tests for helper and
  step logic (if added).

### Documentation Files to Update

> ⚠️ Important: Follow the architecture and conventions documented in AGENTS.md
> (not GEMINI.md in this repo).

#### Core Documentation

- /docs/architecture.md - Document bootstrap step pipeline (if new public API).
- /README.md - Update if user-facing API changes (optional).

#### User Documentation (Package Docs)

- /packages/core/docs/kernel.md - Add a section describing bootstrap steps and
  extension points (if exposed).

#### Stub Templates

- No stub changes expected.

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: createApp mixes configuration parsing, optional imports,
  boot hooks, event listeners, devtools, and app init in one function.
- **Solution**: Split into isolated BootstrapStep modules with a shared context.

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Adding a new boot step requires modifying createApp.
- **Solution**: Use a registry of steps so new steps can be added without
  changing the orchestrator.

**3. Liskov Substitution Principle (LSP)**

- **Current Problem**: No clear abstraction to substitute or mock steps.
- **Solution**: Define a BootstrapStep interface to allow alternate step
  implementations in tests.

**4. Interface Segregation Principle (ISP)**

- **Current Problem**: No interface boundaries; everything depends on concrete
  createApp behavior.
- **Solution**: Narrow step interfaces (run(context)) and helper utilities.

**5. Dependency Inversion Principle (DIP)**

- **Current Problem**: createApp directly imports optional packages with
  duplicate guards.
- **Solution**: Provide helper functions that encapsulate optional imports and
  standardize error handling.

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- Repeated try/catch with identical "Cannot resolve" guards.
- Repeated optional config normalization (session, cache, database URL).
- Similar logging patterns for optional packages.

**Solution:**

- Central helper for optional imports and error classification.
- Shared config normalization functions for optional packages.

### 📝 JSDoc Documentation Standards

All new public interfaces and helpers must include JSDoc with examples.

### 🔒 TypeScript Type Safety Standards

- Avoid any in new files.
- Use explicit return types for public helpers and steps.
- Prefer readonly arrays and readonly properties for step lists.

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User Application Layer                  │  ← Kernel class and config
├─────────────────────────────────────────┤
│  Framework API Layer                     │  ← createApp + bootstrap API
├─────────────────────────────────────────┤
│  Core Implementation Layer               │  ← step runner + helpers
├─────────────────────────────────────────┤
│  Feature Package Layer                   │  ← optional packages (drizzle,
│                                           session, cache, devtools, events)
└─────────────────────────────────────────┘
```

**Key Constraints:**

- Preserve existing behavior and defaults.
- Optional packages must remain optional and fail gracefully.
- No runtime dependency on packages not configured by the app.

## 🎨 Proposed API Design

### Target User-Facing API (Simple Version)

No change to user-facing API. createApp(KernelClass) remains the entry point.

### Target User-Facing API (Advanced Version)

Optional (if desired later):

```typescript
import { createApp, registerBootstrapStep } from '@lockness/core'

registerBootstrapStep(customStep)
```

Only add this if a public extension point is required; otherwise keep internal.

## 📝 Detailed Implementation Steps

### Phase 1: Bootstrap Infrastructure

**Step 1.1: Define Types and Context**

File: /packages/core/kernel/bootstrap/types.ts

- Define BootstrapStep interface: id, order, run(context).
- Define BootstrapContext containing config, kernel instance, app, and helpers.

**Step 1.2: Step Registry and Runner**

File: /packages/core/kernel/bootstrap/registry.ts

- Provide default steps in order.
- Provide runner that executes steps sequentially.

**Step 1.3: Optional Import Helpers**

File: /packages/core/kernel/bootstrap/helpers.ts

- Centralize optional import with standardized warning and error handling.
- Helpers for normalizeSessionConfig, normalizeCacheConfig, etc.

### Phase 2: Step Implementations

**Step 2.1: Implement Steps**

Files:

- /packages/core/kernel/bootstrap/steps/database.ts
- /packages/core/kernel/bootstrap/steps/session.ts
- /packages/core/kernel/bootstrap/steps/cache.ts
- /packages/core/kernel/bootstrap/steps/devtools.ts
- /packages/core/kernel/bootstrap/steps/middleware.ts
- /packages/core/kernel/bootstrap/steps/boot_hooks.ts
- /packages/core/kernel/bootstrap/steps/middlewares_discovery.ts
- /packages/core/kernel/bootstrap/steps/listeners.ts
- /packages/core/kernel/bootstrap/steps/events.ts
- /packages/core/kernel/bootstrap/steps/app_init.ts
- /packages/core/kernel/bootstrap/steps/devtools_routes.ts

Each step should be isolated, use helpers, and be safe when optional packages
are missing.

**Step 2.2: Replace createApp with Orchestrator**

File: /packages/core/kernel/loader.ts

- Keep the public signature and JSDoc.
- Build the BootstrapContext.
- Run steps via registry/runner.

### Phase 3: Tests and Validation

**Step 3.1: Unit Tests for Helpers/Steps**

File: /packages/core/tests/bootstrap_steps.test.ts

- Test helper error handling for optional imports.
- Test step ordering and skipping behavior.

**Step 3.2: Update Kernel Tests**

File: /packages/core/tests/kernel.test.ts

- Ensure behavior unchanged (existing 22 tests must continue to pass).
- Add tests for new step-specific behavior if needed.

## 🔄 Migration Guide

### For Existing Users

**Before (Current Implementation):**

```typescript
const app = await createApp(AppKernel)
```

**After (New Implementation):**

```typescript
const app = await createApp(AppKernel)
```

### Breaking Changes

- None expected.

### Deprecation Strategy

- None required.

## 📚 Documentation Updates Checklist

### Core Documentation

- [x] Update /docs/architecture.md if bootstrap steps are public.
- [x] Update /packages/core/docs/kernel.md with step pipeline details.

### User Documentation (Package Docs)

- [ ] Add examples if public extension points are added.

### LLM Documentation

- [ ] Not required unless public API changes.

### Stub Templates

- [ ] Not required.

### README Files

- [ ] Update only if public API changes.

## 🧪 Testing Strategy

### Unit Tests

- [x] Test optional import helper behavior (missing package, unexpected error).
- [x] Test config normalization helpers.
- [x] Test step ordering and skip conditions.

### Integration Tests

- [x] Ensure existing kernel.test.ts continues to pass.

### Manual Testing

- [ ] Run a minimal app with database/session/cache/devtools enabled.

## 🔍 Quality Checks

- deno check packages/core/kernel/loader.ts
  packages/core/kernel/bootstrap/**/*.ts
- deno lint packages/core/kernel/loader.ts
  packages/core/kernel/bootstrap/**/*.ts
- deno test packages/core/tests/kernel.test.ts

## ✅ Definition of Done

- [x] createApp is a thin orchestrator with step runner.
- [x] All steps are isolated with minimal shared logic.
- [x] Optional imports are centralized and consistent.
- [x] Existing tests pass; new tests cover helpers/steps.
- [ ] No behavior regressions.

## 🔗 Related Tasks

- None yet.

## 📅 Timeline

- **Start Date**: 2026-02-07
- **Estimated Completion**: 2026-02-10
- **Actual Completion**: [YYYY-MM-DD]

## 📝 Notes

- Current createApp has repeated try/catch for optional packages and multiple
  responsibilities in one function.
- Kernel tests (packages/core/tests/kernel.test.ts) currently pass (22 tests).
- Keep runtime behavior identical; refactor only.
