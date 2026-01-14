# Technical Task: Unify Framework API by Re-exporting Hono from Core

## 📋 Task Overview

To enhance developer experience and simplify the public API, this task will make
all functionalities from the `@lockness/hono` package available directly through
`@lockness/core`. Currently, developers need to import from two separate
packages (`@lockness/core` for framework features and `@lockness/hono` for web
middleware), which creates confusion and boilerplate.

By re-exporting everything from `@lockness/core`, we establish it as the single,
unified entry point for the framework, while `@lockness/hono` serves its role as
an internal, shared dependency that bridges to the underlying Hono npm packages.

**Architecture Goal:**

```
Developer → @lockness/core → @lockness/hono → npm:hono
```

## 🎯 Objectives

1. **Unify Public API**: Re-export all 61 exports from `@lockness/hono` through
   `@lockness/core`.
2. **Simplify Imports**: Enable developers to import framework features and web
   middleware from a single package: `@lockness/core`.
3. **Clarify Package Roles**: Position `@lockness/core` as the primary public
   API and `@lockness/hono` as an internal infrastructure package.
4. **Update Documentation**: Modify all relevant documentation (READMEs, web
   docs) to reflect the new, simplified import strategy.
5. **Ensure Stability**: Validate that the change introduces no regressions by
   running the full test suite.

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/core/mod.ts` - Add `export * from '@lockness/hono'` to re-export
  all functionalities.
- `/packages/core/deno.json` - Ensure `@lockness/hono` is correctly listed as a
  dependency.

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/packages/core/README.md` - Update all code examples to use the unified
  import from `@lockness/core`.
- `/packages/hono/README.md` - Add a prominent note clarifying that it is an
  internal package and developers should use `@lockness/core`.
- `/GEMINI.md` - Update the architecture diagram and principles to reflect this
  new API layering.

#### User Documentation (Web)

- `/app/view/pages/docs/content/getting-started.md` - Update the initial setup
  and usage examples.
- `/app/view/pages/docs/content/middleware.md` - Update examples to import
  middleware from `@lockness/core`.

## 🏗️ Architecture Principles

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- Developers repeatedly import from both `@lockness/core` and `@lockness/hono`
  in the same file.

**Solution:**

- By re-exporting, we create a single source for all framework-related imports,
  eliminating the need for multiple import statements and simplifying the
  developer's mental model.

### Layered Architecture

This change reinforces our layered architecture:

```
┌─────────────────────────────────────────┐
│  User Application Layer                 │  ← Imports only from @lockness/core
├─────────────────────────────────────────┤
│  Framework API Layer (@lockness/core)   │  ← The single public API. Abstracts Hono away.
├─────────────────────────────────────────┤
│  Internal Bridge Layer (@lockness/hono) │  ← Manages Hono versions, bridges JSR-npm.
├─────────────────────────────────────────┤
│  External Dependency (npm:hono)         │  ← The underlying web framework.
└─────────────────────────────────────────┘
```

**Key Constraints:**

- `@lockness/hono` remains a vital internal package for managing npm
  dependencies for JSR and for use by other framework packages
  (`@lockness/auth`, `@lockness/session`). It should not be removed.
- The public API of `@lockness/core` should be expanded, not broken.

## 🎨 Proposed API Design

### Target User-Facing API

The goal is to transform the developer experience from this:

**Before:**

```typescript
import { Controller, Get, LocklessApp } from '@lockness/core'
import { basicAuth, cors, logger } from '@lockness/hono' // <-- Second import needed
```

To this:

**After (Simple, Unified):**

```typescript
// One single import for everything
import {
    basicAuth,
    Controller,
    cors,
    Get,
    LocklessApp,
    logger,
} from '@lockness/core'
```

## 📝 Detailed Implementation Steps

### Phase 1: Core Integration

**Step 1.1: Re-export Hono from Core**

File: `/packages/core/mod.ts`

```typescript
// ... existing exports at the top

/**
 * Re-export all functionalities from @lockness/hono to provide a single
 * entry point for the framework.
 */
export * from '@lockness/hono'

// ... existing exports at the bottom
export * from './app.ts'
export * from './auth.ts'
export * from './components.tsx'
// ... etc.
```

**Step 1.2: Verify Dependency**

File: `/packages/core/deno.json`

Ensure the `imports` section correctly references `@lockness/hono`.

```json
// ...
"imports": {
    "@std/path": "jsr:@std/path@^1.0.0",
    "@std/assert": "jsr:@std/assert@1",
    "@std/testing/bdd": "jsr:@std/testing@^1.0.0",
    "@std/expect": "jsr:@std/expect@^1.0.0",
    "hono": "jsr:@lockness/hono@^0.1.21" // This should already be here
},
// ...
```

### Phase 2: Documentation Update

**Step 2.1: Update Core README**

File: `/packages/core/README.md`

Search for all code examples and update them to reflect the new unified import
style. Remove any mention of importing directly from `@lockness/hono`.

**Step 2.2: Add Note to Hono README**

File: `/packages/hono/README.md`

Add a note at the top of the file:

```markdown
> **Note for Developers**: This is an internal infrastructure package for the
> Lockness framework. For application development, please use the unified
> **`@lockness/core`** package, which provides all these functionalities and
> more.
```

**Step 2.3: Update Web Docs**

Files: `/app/view/pages/docs/content/*.md`

Review key documentation pages like "Getting Started" and "Middleware" and
update the code examples to use imports from `@lockness/core` only.

## 🔄 Migration Guide

This is a non-breaking, additive change. No migration is strictly necessary for
existing users, but they can refactor for a cleaner codebase.

### For Existing Users

**Before (Still works, but verbose):**

```typescript
import { LocklessApp } from '@lockness/core'
import { logger } from '@lockness/hono'

const app = new LocklessApp()
app.use('*', logger())
```

**After (Recommended):**

```typescript
import { LocklessApp, logger } from '@lockness/core'

const app = new LocklessApp()
app.use('*', logger())
```

### Breaking Changes

- None. This change is fully backward-compatible.

## 🧪 Testing Strategy

### Integration Tests

- Run the entire test suite for the workspace (`deno task test`). Since other
  packages and the main application rely on `@lockness/core`, this will serve as
  a comprehensive integration test to ensure no regressions have been
  introduced.

### Manual Testing

- Create a new, temporary file and attempt to import various Hono middlewares
  (`cors`, `jwt`, `jsxRenderer`) and types (`Context`) directly from
  `@lockness/core` to ensure they are resolved correctly by the TypeScript
  server.

## ✅ Definition of Done

- [ ] `packages/core/mod.ts` is updated to re-export from `@lockness/hono`.
- [ ] All documentation (`README.md`, web docs) is updated with the new import
      strategy.
- [ ] A note is added to `packages/hono/README.md` clarifying its internal role.
- [ ] All existing tests pass without any changes.
- [ ] Manual import checks confirm that Hono exports are available through
      `@lockness/core`.
- [ ] The change is committed with a clear message explaining the "why".
