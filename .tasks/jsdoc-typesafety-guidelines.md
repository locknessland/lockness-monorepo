# Technical Task: Enforce JSDoc Documentation and TypeScript Type Safety Standards

## 📋 Task Overview

Establish and enforce comprehensive documentation and type safety standards
across the Lockness framework. This task aims to improve code quality, developer
experience, and maintainability by requiring JSDoc comments on all public APIs
and eliminating `any` types wherever possible.

**Why this matters:**

- **IDE Support**: JSDoc enables IntelliSense, autocomplete, and inline
  documentation
- **Type Safety**: Strong typing catches errors at compile time, not runtime
- **Onboarding**: New developers can understand code faster with documentation
- **Maintenance**: Well-documented code is easier to refactor and extend
- **LLM Assistance**: AI tools work better with well-typed, documented code

## 🎯 Objectives

1. **Documentation Coverage**: Add JSDoc to all public exports (classes,
   functions, types, interfaces)
2. **Type Safety**: Eliminate `any` types and replace with proper TypeScript
   types
3. **Consistency**: Establish patterns that all contributors must follow
4. **Tooling**: Configure linting rules to enforce these standards
5. **Examples**: Provide clear examples in documentation for all public APIs

## 📁 Affected File Paths

### Core Package Files to Audit

- `/packages/core/*.ts` - All core module files
- `/packages/hono/*.ts` - Hono integration files
- `/packages/drizzle/*.ts` - Database ORM files
- `/packages/auth/*.ts` - Authentication module
- `/packages/validator/*.ts` - Validation module
- `/packages/session/*.ts` - Session management
- `/packages/cache/*.ts` - Caching layer
- `/packages/queue/*.ts` - Queue system
- `/packages/mail/*.ts` - Mail system
- `/packages/storage/*.ts` - File storage
- `/packages/events/*.ts` - Event system
- `/packages/logger/*.ts` - Logging system

### Documentation Files to Update

- `/GEMINI.md` - Add JSDoc/TypeSafety section
- `/docs/CONTRIBUTING.md` - Add documentation standards (create if needed)
- `/packages/*/README.md` - Add examples with proper types

## 🏗️ Architecture Principles

### JSDoc Standards

**1. File-Level Documentation**

Every TypeScript file should start with a file-level JSDoc comment:

````typescript
/**
 * @fileoverview Brief description of the module's purpose.
 *
 * Detailed explanation of what this module provides, its responsibilities,
 * and how it fits into the larger architecture.
 *
 * @example
 * ```typescript
 * import { FeatureName } from '@lockness/package'
 *
 * const instance = new FeatureName()
 * ```
 *
 * @module
 */
````

**2. Class Documentation**

````typescript
/**
 * Brief one-line description of the class.
 *
 * Longer description explaining the class's purpose, when to use it,
 * and any important behavior or constraints.
 *
 * @example
 * ```typescript
 * const service = new UserService(repository)
 * const user = await service.findById(1)
 * ```
 *
 * @see {@link RelatedClass} for related functionality
 * @since 1.0.0
 */
export class UserService {
    // ...
}
````

**3. Method Documentation**

````typescript
/**
 * Brief description of what the method does.
 *
 * Longer description if needed, explaining behavior, side effects,
 * or important considerations.
 *
 * @param id - The unique identifier of the user
 * @param options - Optional configuration for the query
 * @returns The user object if found, null otherwise
 * @throws {NotFoundError} When user doesn't exist and throwOnNotFound is true
 *
 * @example
 * ```typescript
 * const user = await service.findById(123)
 * if (user) {
 *   console.log(user.email)
 * }
 * ```
 */
async findById(id: number, options?: FindOptions): Promise<User | null> {
    // ...
}
````

**4. Interface and Type Documentation**

````typescript
/**
 * Configuration options for the cache service.
 *
 * @example
 * ```typescript
 * const config: CacheConfig = {
 *   driver: 'redis',
 *   ttl: 3600,
 *   prefix: 'app:'
 * }
 * ```
 */
export interface CacheConfig {
    /** The cache driver to use (redis, memory, file) */
    readonly driver: CacheDriver

    /** Time-to-live in seconds for cached items */
    readonly ttl: number

    /** Prefix for all cache keys */
    readonly prefix?: string
}
````

**5. Function Documentation**

````typescript
/**
 * Creates a middleware handler from a middleware class.
 *
 * @param middlewareClass - The middleware class to instantiate
 * @param container - The dependency injection container
 * @returns A Hono-compatible middleware handler
 *
 * @example
 * ```typescript
 * const handler = createMiddlewareHandler(AuthMiddleware, container)
 * app.use('/*', handler)
 * ```
 */
export function createMiddlewareHandler(
    middlewareClass: MiddlewareClass,
    container: Container,
): MiddlewareHandler {
    // ...
}
````

### TypeScript Type Safety Standards

**1. Avoid `any` - Use Proper Types**

❌ **Bad:**

```typescript
function processData(data: any): any {
    return data.value
}
```

✅ **Good:**

```typescript
interface DataPayload {
    readonly value: string
    readonly metadata?: Record<string, unknown>
}

function processData(data: DataPayload): string {
    return data.value
}
```

**2. Use `unknown` Instead of `any` for External Data**

❌ **Bad:**

```typescript
async function fetchData(): Promise<any> {
    const response = await fetch(url)
    return response.json()
}
```

✅ **Good:**

```typescript
interface ApiResponse {
    readonly data: User[]
    readonly total: number
}

async function fetchData(): Promise<ApiResponse> {
    const response = await fetch(url)
    const json: unknown = await response.json()
    return validateApiResponse(json) // Type guard
}
```

**3. Use Type Guards for Runtime Validation**

```typescript
/**
 * Type guard to check if a value is a valid User object.
 *
 * @param value - The value to check
 * @returns True if value is a valid User
 */
function isUser(value: unknown): value is User {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        'email' in value &&
        typeof (value as User).id === 'number' &&
        typeof (value as User).email === 'string'
    )
}
```

**4. Use `readonly` for Immutable Properties**

```typescript
interface UserDTO {
    readonly id: number
    readonly email: string
    readonly createdAt: Date
}

// For arrays that shouldn't be mutated
interface PaginatedResult<T> {
    readonly items: readonly T[]
    readonly total: number
    readonly page: number
}
```

**5. Use Const Assertions for Literal Types**

```typescript
/** Supported HTTP methods for routing */
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const

/** HTTP method type derived from the constant */
type HttpMethod = typeof HTTP_METHODS[number]
```

**6. Use Generics for Reusable Code**

```typescript
/**
 * Repository interface for CRUD operations.
 *
 * @typeParam T - The entity type
 * @typeParam ID - The identifier type (defaults to number)
 */
export interface Repository<T, ID = number> {
    findById(id: ID): Promise<T | null>
    findAll(): Promise<readonly T[]>
    create(data: Omit<T, 'id'>): Promise<T>
    update(id: ID, data: Partial<T>): Promise<T>
    delete(id: ID): Promise<boolean>
}
```

**7. Use Discriminated Unions for State**

```typescript
/**
 * Result type for operations that can fail.
 *
 * @typeParam T - The success value type
 * @typeParam E - The error type (defaults to Error)
 */
type Result<T, E = Error> =
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: E }

// Usage
function divide(a: number, b: number): Result<number, string> {
    if (b === 0) {
        return { success: false, error: 'Division by zero' }
    }
    return { success: true, data: a / b }
}
```

**8. Explicit Return Types for Public APIs**

❌ **Bad:**

```typescript
export function createUser(data: CreateUserDTO) {
    return userRepository.create(data)
}
```

✅ **Good:**

```typescript
export function createUser(data: CreateUserDTO): Promise<User> {
    return userRepository.create(data)
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Audit Existing Code

**Step 1.1: Identify Files Without JSDoc**

Run a search for files missing file-level documentation:

```bash
# Find TypeScript files without @fileoverview or @module
grep -rL "@fileoverview\|@module" packages/*/src/*.ts
```

**Step 1.2: Identify `any` Usage**

```bash
# Find all occurrences of 'any' type
grep -rn ": any\|<any>\|as any" packages/
```

**Step 1.3: Create Tracking List**

Create a checklist of files that need improvement, prioritizing:

1. Public API files (mod.ts, types.ts)
2. Core functionality files
3. Utility and helper files

### Phase 2: Add Deno Lint Rules

**Step 2.1: Update deno.jsonc**

```jsonc
{
    "lint": {
        "rules": {
            "tags": ["recommended"],
            "include": [
                "explicit-function-return-type",
                "no-explicit-any"
            ],
            "exclude": []
        }
    }
}
```

### Phase 3: Improve Core Package

**Step 3.1: Add File-Level JSDoc to All Files**

Each file must have:

- `@fileoverview` with clear description
- `@example` showing basic usage
- `@module` tag

**Step 3.2: Document All Exports**

Every exported item must have:

- Brief description (first line)
- Detailed explanation if complex
- `@param` for all parameters
- `@returns` for return values
- `@throws` for exceptions
- `@example` with working code

**Step 3.3: Replace `any` Types**

For each `any` occurrence:

1. Identify what the actual type should be
2. Create interface/type if needed
3. Add type guard if runtime validation needed
4. Use `unknown` + type guard for external data

### Phase 4: Create Type Utility Library

**Step 4.1: Create Common Types File**

File: `/packages/core/type_utils.ts`

```typescript
/**
 * @fileoverview Common TypeScript utility types for the Lockness framework.
 *
 * This module provides reusable type utilities that promote type safety
 * and reduce boilerplate across the codebase.
 *
 * @module
 */

/**
 * Makes all properties of T deeply readonly.
 */
export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]>
        : T[P]
}

/**
 * Extracts the resolved type from a Promise.
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T

/**
 * Makes specific properties of T required.
 */
export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>

/**
 * Makes specific properties of T optional.
 */
export type OptionalKeys<T, K extends keyof T> =
    & Omit<T, K>
    & Partial<Pick<T, K>>

/**
 * Constructor type for dependency injection.
 */
export type Constructor<T = unknown> = new (...args: unknown[]) => T

/**
 * Async function type.
 */
export type AsyncFunction<TArgs extends unknown[], TReturn> = (
    ...args: TArgs
) => Promise<TReturn>
```

## 🔍 Quality Checks

### Linting for JSDoc

```bash
# Check that all exports have JSDoc (custom script needed)
deno run --allow-read scripts/check_jsdoc.ts packages/core/

# Standard lint check
deno lint packages/core/
```

### Type Checking

```bash
# Strict type check - should pass with no errors
deno check packages/core/**/*.ts

# Check specific package
deno check packages/auth/**/*.ts
```

### Testing

```bash
# Run all tests to ensure types don't break functionality
deno test -A packages/core/tests/
```

## ✅ Definition of Done

### Per-File Checklist

- [ ] File-level JSDoc with `@fileoverview`
- [ ] All exported classes documented
- [ ] All exported functions documented
- [ ] All exported interfaces/types documented
- [ ] All public methods documented
- [ ] No `any` types (or justified with `deno-lint-ignore`)
- [ ] Explicit return types on public APIs
- [ ] `readonly` used for immutable properties
- [ ] Examples provided for complex APIs

### Project-Wide Checklist

- [ ] Deno lint passes with no warnings
- [ ] Deno check passes with no errors
- [ ] All tests pass
- [ ] GEMINI.md updated with JSDoc/Type Safety section
- [ ] Contributing guide created/updated

## 📚 JSDoc Tags Reference

| Tag             | Usage                    | Example                                    |
| --------------- | ------------------------ | ------------------------------------------ |
| `@fileoverview` | File-level description   | `@fileoverview User authentication module` |
| `@module`       | Marks file as module     | `@module`                                  |
| `@param`        | Parameter description    | `@param name - The user's name`            |
| `@returns`      | Return value description | `@returns The created user`                |
| `@throws`       | Exception documentation  | `@throws {NotFoundError} When not found`   |
| `@example`      | Code example             | `@example \`\`\`ts ... \`\`\``             |
| `@see`          | Cross-reference          | `@see {@link OtherClass}`                  |
| `@since`        | Version introduced       | `@since 1.0.0`                             |
| `@deprecated`   | Deprecation notice       | `@deprecated Use newMethod instead`        |
| `@typeParam`    | Generic type parameter   | `@typeParam T - The entity type`           |
| `@internal`     | Not part of public API   | `@internal`                                |
| `@readonly`     | Read-only property       | `@readonly`                                |
| `@default`      | Default value            | `@default 'memory'`                        |

## 📝 Notes

### When to Use `// deno-lint-ignore no-explicit-any`

Only use when absolutely necessary:

1. **Third-party library interop** - When external types don't exist
2. **TC39 Decorators** - When TypeScript's decorator types are insufficient
3. **Dynamic object construction** - Complex metaprogramming scenarios

Always add a comment explaining why:

```typescript
// deno-lint-ignore no-explicit-any -- Required for TC39 decorator context.this typing
context.addInitializer(function (this: any) {
    // ...
})
```

### Performance Considerations

- Type checking adds compile-time overhead (acceptable trade-off)
- JSDoc is stripped in production builds
- Generic types have no runtime cost

### IDE Benefits

With proper JSDoc and types:

- **Hover documentation** - See docs without leaving code
- **Parameter hints** - Know what to pass
- **Autocomplete** - Discover available methods
- **Error detection** - Catch mistakes before running
- **Refactoring** - Safe rename and move operations

---

_Created: 2026-01-20_ _Last updated: 2026-01-20_
