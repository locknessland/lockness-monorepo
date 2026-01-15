# Technical Task: Move Validation to @lockness/validator

## 📋 Task Overview

Currently, `@lockness/core` includes a `@Validate` decorator that uses Zod for
request validation. Following the principle of a minimal core (routing + DI
only), this validation logic should live in `@lockness/validator` instead.

**Problem:** Core package has validation logic (Zod-specific), making it heavier
than necessary for API-only projects.

**Solution:** Move all validation code from `@lockness/core` to
`@lockness/validator`, making validation opt-in. This follows the same pattern
as `@lockness/hono` wrapping Hono - the validator package wraps Zod.

## 🎯 Objectives

1. **Lean Core**: Remove Zod dependency from `@lockness/core` to keep it minimal
   (routing + DI only)
2. **Package Boundaries**: Clearly separate core framework concerns (routing/DI)
   from validation concerns
3. **Bundle Size Reduction**: Reduce core bundle by ~50KB by removing Zod
   dependency
4. **Unified Validation Package**: Make `@lockness/validator` the complete
   validation solution (custom rules + Zod decorator wrapper)
5. **Future Flexibility**: Wrap Zod in `@lockness/validator` so the framework
   could potentially swap the underlying engine later without breaking the API

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/core/mod.ts` - Remove `validation.ts` export
- `/packages/core/deno.json` - Remove `validation.ts` from publish config
- `/packages/core/README.md` - Remove `@Validate` from decorators list, add note
  about `@lockness/validator`

### Core Files to Delete

- `/packages/core/validation.ts` - Move to validator package as
  `zod-decorator.ts`

### Framework Files to Extend

- `/packages/validator/mod.ts` - Export Zod decorator alongside custom
  validation
- `/packages/validator/deno.json` - Add dependencies: `@hono/zod-validator`,
  `hono`, `zod`
- `/packages/hono/deno.json` - Remove `@hono/zod-validator` dependency (moved to
  validator)

### New Files to Create

- `/packages/validator/zod-decorator.ts` - Zod validation decorator (migrated
  from core)

### Files to Delete

- `/packages/hono/zod-validator.ts` - No longer needed (dependency moved to
  validator)

### Test Files

- `/packages/core/tests/validation.test.ts` - Move to
  `/packages/validator/tests/zod-decorator.test.ts`
- `/packages/validator/tests/zod-decorator.test.ts` - Test `@Validate` decorator
  in validator package

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/README.md` - Update validation examples (line 633: change import from core
  to validator)
- `/GEMINI.md` - Update validation section (line 584, 594: change imports)
- `/packages/core/README.md` - Remove `@Validate` from decorators, add migration
  note
- `/packages/validator/README.md` - Add section about `@Validate` decorator

#### User Documentation (Web)

- `/app/view/pages/docs/content/validation.md` - Update imports (line 42:
  `@lockness/validator` instead of core)

#### LLM Documentation

- `/public/llms/validation.txt` - Update imports throughout (lines 12, 72)
- `/public/llms/getting-started.txt` - Update imports (line 148)
- `/public/llms/full.txt` - Update validation section (line 215)

#### Stub Templates

> 📝 **Reminder**: Check [STUBS.md](../STUBS.md) for stub mapping

- `/packages/drizzle/stubs/controller.stub` - Update import (line 1: add
  `@lockness/validator` import)
- `/packages/cli/stubs/auth/auth_controller.stub` - Update import (line 1: split
  core and validator imports)
- `/packages/init/stubs/init/README.md.stub` - Update validation examples
  (line 320)

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: `@lockness/core` handles both framework concerns
  (routing, DI) AND validation strategy (Zod)
- **Solution**: Separate validation into `@lockness/validator` package
  ```typescript
  // Core: Only framework concerns
  @lockness/core → Routing, DI, Decorators, Lifecycle

  // Validator: Only validation concerns
  @lockness/validator → Custom rules, Zod decorator, Business logic validation
  ```

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Core is tightly coupled to Zod implementation
- **Solution**: `@lockness/validator` acts as an abstraction layer (wrapper)
  around Zod, allowing the framework to potentially replace the underlying
  validation engine without breaking user code
  ```typescript
  // @lockness/validator wraps Zod today
  // Tomorrow it could wrap VineJS or a custom engine
  // User API stays the same:
  import { Validate } from '@lockness/validator'

  @Validate('json', schema)  // Works regardless of underlying engine
  ```

**3. Dependency Inversion Principle (DIP)**

- **Current Problem**: Core depends on concrete Zod implementation
- **Solution**: Core depends on abstractions (metadata), validator provides
  concrete implementation
  ```typescript
  // Core reads metadata (agnostic)
  const validators = constructor._validators?.[methodName] || []

  // Validator sets metadata (Zod-specific)
  constructor._validators[methodName] = [{ target, schema }]
  ```

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- Validation logic exists only in core (no duplication yet)
- Moving to validator creates single source of truth for ALL validation

**Solution:**

- `@lockness/validator` becomes the unified validation package
- Custom validation rules + Zod decorators in one place
- No duplication between packages

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User Application Layer                  │  ← Controllers use @Validate from @lockness/validator
├─────────────────────────────────────────┤
│  Framework API Layer (@lockness/core)   │  ← Core provides routing/DI (NO validation)
├─────────────────────────────────────────┤
│  Validation Layer (@lockness/validator) │  ← Optional: Zod decorator + Custom rules
├─────────────────────────────────────────┤
│  Hono Bridge Layer (@lockness/hono)     │  ← Pure Hono re-exports (NO @hono/zod-validator)
└─────────────────────────────────────────┘
```

**Key Constraints:**

- Core MUST NOT depend on validation packages
- Core MUST NOT import Zod types
- Validator MAY depend on core types (Context, etc.)
- Hono bridge MUST be validation-agnostic

## 🎨 Proposed API Design

### Target User-Facing API (Simple Version)

```typescript
// API-only project (no validation)
import { Controller, Post } from '@lockness/core'

@Controller('/users')
class UserController {
    @Post()
    create(c: Context) {
        return c.json({ ok: true })
    }
}
```

### Target User-Facing API (With Validation)

```typescript
// Project with Zod validation
import { Controller, Post } from '@lockness/core'
import { Validate } from '@lockness/validator'
import { z } from 'zod'

const schema = z.object({ email: z.string().email() })

@Controller('/users')
class UserController {
    @Post()
    @Validate('json', schema)
    create(c: Context) {
        const data = c.req.valid('json')
        return c.json(data)
    }
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Move Validation to @lockness/validator

**Step 1.1: Create zod-decorator.ts in validator package**

File: `/packages/validator/zod-decorator.ts`

````typescript
// deno-lint-ignore-file no-explicit-any
import { zValidator } from '@hono/zod-validator'
import type { Context } from 'hono'
import type { ZodSchema } from 'zod'

/**
 * Validation error response structure
 */
export interface ValidationErrorResponse {
    success: false
    message: string
    errors: Record<string, string[] | undefined>
}

/**
 * Custom error handler for validation errors
 * Override this to customize the error response format
 */
export type ValidationErrorHandler = (
    errors: Record<string, string[] | undefined>,
    c: any,
) => Response | Promise<Response>

let globalValidationErrorHandler: ValidationErrorHandler = (errors, c) => {
    return c.json(
        {
            success: false,
            message: 'Validation failed',
            errors,
        } satisfies ValidationErrorResponse,
        400,
    )
}

/**
 * Set a custom global validation error handler
 */
export function setValidationErrorHandler(
    handler: ValidationErrorHandler,
): void {
    globalValidationErrorHandler = handler
}

type ValidationTargets = {
    json: any
    form: any
    query: any
    param: any
    header: any
    cookie: any
}

/**
 * Decorator to validate request data using Zod
 *
 * @param target The part of the request to validate ('json', 'query', 'param', 'header', 'cookie', 'form')
 * @param schema The Zod schema to validate against
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 * import { Validate } from '@lockness/validator'
 *
 * const CreateUserSchema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8),
 * })
 *
 * @Controller('/users')
 * class UserController {
 *   @Post()
 *   @Validate('json', CreateUserSchema)
 *   create(c: Context) {
 *     const data = c.req.valid('json')
 *     // data is typed as { email: string, password: string }
 *   }
 * }
 * ```
 */
export function Validate(
    target: keyof ValidationTargets,
    schema: ZodSchema,
): any {
    return function (
        _classTarget: any,
        context: ClassMethodDecoratorContext,
    ) {
        const methodName = String(context.name)
        let initialized = false
        context.addInitializer(function (this: any) {
            if (!initialized) {
                initialized = true
                const constructor = this.constructor
                if (!constructor._validators) constructor._validators = {}

                if (!constructor._validators[methodName]) {
                    constructor._validators[methodName] = []
                }

                // Store validation config
                constructor._validators[methodName].push({
                    target,
                    schema,
                    middleware: zValidator(
                        target,
                        schema,
                        (result: any, c: Context) => {
                            if (!result.success) {
                                // Format Zod errors for response
                                const errors: Record<string, string[]> = {}
                                result.error.issues.forEach((issue: any) => {
                                    const path = issue.path.join('.') || 'root'
                                    if (!errors[path]) errors[path] = []
                                    errors[path].push(issue.message)
                                })

                                return globalValidationErrorHandler(errors, c)
                            }
                        },
                    ),
                })
            }
        })
    }
}
````

**Step 1.2: Update validator package exports**

File: `/packages/validator/mod.ts`

```typescript
/**
 * Lockness Validator System
 *
 * Advanced validation with custom rules, async validation, and sanitization.
 * Also includes Zod decorator for controller validation.
 */

// Custom validation system (existing)
export * from './validator.ts'

// Zod decorator for controller validation (new)
export {
    setValidationErrorHandler,
    Validate,
    type ValidationErrorHandler,
    type ValidationErrorResponse,
} from './zod-decorator.ts'
```

**Step 1.3: Update validator package dependencies**

File: `/packages/validator/deno.json`

```json
{
    "name": "@lockness/validator",
    "version": "0.1.22",
    "license": "MIT",
    "exports": "./mod.ts",
    "tasks": {
        "test": "deno test -A tests/",
        "test:watch": "deno test -A --watch tests/"
    },
    "publish": {
        "include": [
            "mod.ts",
            "zod-decorator.ts",
            "deno.json",
            "README.md"
        ],
        "exclude": [
            "tests/"
        ]
    },
    "imports": {
        "@std/assert": "jsr:@std/assert@1",
        "@hono/zod-validator": "npm:@hono/zod-validator@0.7.6",
        "hono": "npm:hono@4.11.1",
        "zod": "npm:zod@^3.22.0"
    },
    "description": "Advanced validation system with 30+ built-in validators, async validation, sanitizers, and Zod decorator for controllers"
}
```

**Step 1.4: Move test file**

Move `/packages/core/tests/validation.test.ts` →
`/packages/validator/tests/zod-decorator.test.ts`

Update imports in test file:

```typescript
import { Validate } from '../mod.ts'
// Rest of test stays the same
```

### Phase 2: Remove Validation from @lockness/core

**Step 2.1: Remove validation.ts export**

File: `/packages/core/mod.ts`

Remove line:

```typescript
export * from './validation.ts'
```

**Step 2.2: Update core deno.json**

File: `/packages/core/deno.json`

Remove `"validation.ts"` from publish include list.

**Step 2.3: Delete validation.ts**

Delete file: `/packages/core/validation.ts`

**Step 2.4: Update core README**

File: `/packages/core/README.md`

Update decorators section:

```markdown
### Decorators

- `@Controller(path)`: Declares a class as a controller.
- `@Get(path, options)`: Registers a GET route.
- `@Post(path, options)`: Registers a POST route.
- `@Put(path, options)`: Registers a PUT route.
- `@Patch(path, options)`: Registers a PATCH route.
- `@Delete(path, options)`: Registers a DELETE route.
- `@Use(middleware)`: Applies middleware to a class or method.
- `@Service()`: Declares a class as a service.
- `@Inject(class)`: Injects a service into a property.

> **Note**: For request validation, use `@Validate` from `@lockness/validator`
```

### Phase 3: Clean up @lockness/hono

**Step 3.1: Remove @hono/zod-validator dependency**

File: `/packages/hono/deno.json`

Remove line from imports:

```json
"@hono/zod-validator": "npm:@hono/zod-validator@0.7.6"
```

**Step 3.2: Delete zod-validator.ts re-export**

Delete file: `/packages/hono/zod-validator.ts`

Remove from exports in `/packages/hono/deno.json`:

```json
"./zod-validator": "./zod-validator.ts"
```

### Phase 4: Update Documentation

**Step 4.1: Update root README**

File: `/README.md` (around line 633)

Change:

```typescript
import { Context, Controller, Post, Validate } from '@lockness/core'
```

To:

```typescript
import { Context, Controller, Post } from '@lockness/core'
import { Validate } from '@lockness/validator'
```

**Step 4.2: Update GEMINI.md**

File: `/GEMINI.md` (lines 584, 594)

Same import change as above.

**Step 4.3: Update web docs**

File: `/app/view/pages/docs/content/validation.md`

Same import change as above.

**Step 4.4: Update LLM docs**

Files:

- `/public/llms/validation.txt`
- `/public/llms/getting-started.txt`
- `/public/llms/full.txt`

Same import change for all examples.

**Step 4.5: Update stubs**

Files:

- `/packages/drizzle/stubs/controller.stub`
- `/packages/cli/stubs/auth/auth_controller.stub`
- `/packages/init/stubs/init/README.md.stub`

Change imports to split core and validator:

```typescript
import { Controller, Delete, Get, Inject, Post, Put } from 'lockness/core'
import { Validate } from 'lockness/validator'
```

## 🔄 Migration (Monorepo Only)

Since Lockness is still in development with no external users, migration only
affects the root monorepo project.

**Change required in monorepo:**

```typescript
// Before
import { Controller, Post, Validate } from '@lockness/core'

// After
import { Controller, Post } from '@lockness/core'
import { Validate } from '@lockness/validator'
```

**Files to update in monorepo:**

- Any controller using `@Validate` (update imports)
- Root `deno.jsonc` (already has `@lockness/validator` in imports)

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Update `/GEMINI.md` with new architecture (validation optional)
- [ ] Update `/README.md` validation examples (split imports)
- [ ] Update `/packages/core/README.md` (remove `@Validate`, add migration note)
- [ ] Update `/packages/validator/README.md` (add Zod decorator section)

### User Documentation (Web Docs)

- [ ] Update `/app/view/pages/docs/content/validation.md` (split imports)
- [ ] Add troubleshooting section for migration
- [ ] Add "Why is validation separate?" FAQ section

### LLM Documentation

- [ ] Update `/public/llms/validation.txt` (all examples)
- [ ] Update `/public/llms/getting-started.txt` (imports)
- [ ] Update `/public/llms/full.txt` (validation section)

### Stub Templates

- [ ] Update `/packages/cli/stubs/make/controller.stub` (if exists)
- [ ] Update `/packages/drizzle/stubs/controller.stub` (split imports)
- [ ] Update `/packages/cli/stubs/auth/auth_controller.stub` (split imports)
- [ ] Update `/packages/init/stubs/init/README.md.stub` (examples)
- [ ] Test stub generation: `deno task cli make:controller TestController`

### README Files

- [ ] Update `/packages/validator/README.md` (add decorator section)
- [ ] Update `/packages/core/README.md` (remove validation)
- [ ] Update root `/README.md` (split imports in examples)

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test `@Validate` decorator in validator package
- [ ] Test `setValidationErrorHandler` custom error formatting
- [ ] Test all validation targets (json, query, param, header, cookie, form)
- [ ] Test Zod error formatting
- [ ] Test multiple `@Validate` decorators on same method

### Integration Tests

- [ ] Test controller with `@Validate` from validator package
- [ ] Test that core works without validator installed
- [ ] Test custom validation error handler in full app
- [ ] Test generated stubs (controller, auth controller)

### Manual Testing

- [ ] Create new project: `deno task init`
- [ ] Generate controller: `deno task cli make:controller TestController`
- [ ] Verify imports are split (core + validator)
- [ ] Test validation works in dev mode
- [ ] Test validation works in production build

## 🔍 Quality Checks

> ⚠️ **Critical**: Run quality checks on **modified files only** before marking
> the task as complete.

### Type Checking

```bash
# Check validator package
deno check packages/validator/mod.ts
deno check packages/validator/zod-decorator.ts

# Check core package (ensure no Zod types)
deno check packages/core/mod.ts

# Check hono package
deno check packages/hono/mod.ts
```

**What it checks:**

- Validator package type correctness
- Core has no Zod type dependencies
- Import resolution works

### Linting

```bash
# Lint validator package
deno lint packages/validator/

# Lint core package
deno lint packages/core/

# Lint hono package
deno lint packages/hono/
```

**What it checks:**

- No unused imports
- Code quality issues
- Consistent style

### Test Suite

```bash
# Run validator tests
deno test packages/validator/tests/

# Run core tests (ensure validation tests removed)
deno test packages/core/tests/

# Run all tests
deno task test
```

**What it checks:**

- Zod decorator works in validator package
- Core tests still pass without validation.test.ts
- No regressions (all 5250+ tests pass)

### Combined Check (Recommended)

```bash
# Run all checks
deno check packages/core/mod.ts packages/validator/mod.ts packages/hono/mod.ts && \
deno lint packages/core/ packages/validator/ packages/hono/ && \
deno task test
```

**Before marking task complete:**

- ✅ `deno check` passes with no type errors
- ✅ `deno lint` passes with no warnings
- ✅ `deno test` passes (5250+ tests, 100% success rate)
- ✅ Core has no Zod imports (verified with grep)

## ✅ Definition of Done

- [ ] All implementation steps completed (Phases 1-4)
- [ ] `@lockness/validator` exports `@Validate` decorator
- [ ] `@lockness/core` has zero validation code
- [ ] `@lockness/hono` has no `@hono/zod-validator` dependency
- [ ] validation.test.ts moved to validator package
- [ ] All tests passing
- [ ] Documentation updated (README, GEMINI, web docs, LLM docs)
- [ ] Stub templates updated (controller, auth, drizzle)
- [ ] ✅ **Quality checks passed**
  - [ ] `deno check` passes on all modified packages
  - [ ] `deno lint` passes on all modified packages
  - [ ] `deno test` passes (100% success)
  - [ ] `grep -r "from 'zod'" packages/core/` returns nothing
- [ ] Manual testing completed (init, make:controller, dev mode)

## 🔗 Related Tasks

- Related to "Unify framework API" (current PR #23)
- Future consideration: If needed, swap Zod for VineJS or custom engine inside
  `@lockness/validator` (same public API)

## 📅 Timeline

- **Start Date**: 2026-01-15
- **Estimated Completion**: 2026-01-15 (same day, ~3.5 hours)
- **Actual Completion**: [TBD]

**Breakdown:**

- Phase 1 (Move to validator): 1 hour
- Phase 2 (Remove from core): 30 minutes
- Phase 3 (Clean up hono): 15 minutes
- Phase 4 (Update docs/stubs): 1 hour
- Testing & validation: 45 minutes

## 📝 Notes

### Design Decisions

- **Why move to validator, not create new package?**
  - Keeps validation concerns unified in one place
  - `@lockness/validator` already has custom validation rules
  - Adding Zod decorator makes it the complete validation solution

- **Why wrap Zod instead of exposing it directly?**
  - Same pattern as `@lockness/hono` wrapping `npm:hono`
  - Allows framework to swap underlying engine later (e.g., VineJS)
  - User API stays stable: `import { Validate } from '@lockness/validator'`

- **Why remove @hono/zod-validator from hono package?**
  - Hono bridge should be pure framework re-exports
  - Zod is validation concern, belongs in validator package

### Architecture Pattern

This follows the same internal abstraction pattern used elsewhere:

```
@lockness/core     → uses → @lockness/hono     → wraps → npm:hono
@lockness/validator → uses → @hono/zod-validator → wraps → npm:zod
```

Both bridges isolate external dependencies, enabling future swaps without
breaking the public API.

---

_Task created: 2026-01-15_ _Last updated: 2026-01-15_
