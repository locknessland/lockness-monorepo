# Technical Task: Enhance Auth Guard API with Fluent Context and Decorator Injection

## 📋 Task Overview

Currently, accessing authentication guards in controllers requires verbose type
casting and inline imports:

```typescript
@Post('/logout')
async logout(c: Context) {
    const auth = getAuth(c)
    const guard = auth.use('web') as import('@lockness/auth').SessionGuard<
        true,
        import('../auth/user_provider.ts').UserProvider
    >
    await guard.logout()
    return c.redirect('/auth/login')
}
```

This pattern has several problems:

- **Verbose**: 4 lines just to get the guard instance
- **Inline imports**: Pollutes the code with long import statements
- **Repetitive**: Same pattern repeated across multiple controller methods
- **Not type-safe**: Relies on manual type casting

**Goal**: Provide an elegant, fluent API for guard access inspired by NestJS
guards, while staying compatible with TC39 Stage 3 decorators (no
`reflect-metadata` dependency).

## 🎯 Objectives

1. **Fluent Context API**: Add `c.auth.*` for simple cases (95% of use cases)
2. **Decorator Injection**: Add `@InjectGuard()` for complex scenarios
3. **Type Safety**: Full TypeScript inference without manual casting
4. **Zero Dependencies**: No `reflect-metadata` or experimental features
5. **Clean Migration**: Refactor existing auth controller to use new API

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/auth/middleware/auth_middleware.ts` - Enhance to expose `c.auth.*`
  API
- `/packages/auth/decorators.ts` - Add `@InjectGuard()` decorator
- `/packages/auth/mod.ts` - Export new decorators and types
- `/packages/auth/types.ts` - Add `AuthContext` interface

### Framework Files to Extend

- `/packages/core/types.ts` - Extend `Context` interface via module augmentation

### Documentation Files to Update

#### Core Documentation

- `/GEMINI.md` - Add "Enhanced Auth Guard API" section explaining the new
  patterns
- `/README.md` - Update authentication section with new API examples
- `/packages/auth/README.md` - Complete API reference with all three approaches

#### User Documentation (Web)

- `/app/view/pages/docs/content/authentication.md` - Update with new fluent API
  examples
- Consider adding examples for each approach (Context API vs Decorator vs
  Manual)

#### LLM Documentation

- `/public/llms/authentication.txt` - Update with concise examples of all three
  patterns
- `/public/llms/full.txt` - Add section on guard access patterns

### Example Files to Update

- `/app/controller/auth_controller.tsx` - Refactor to use new fluent API

## 🏗️ Architecture Principles

### Why No reflect-metadata?

**Critical Understanding**: Lockness uses **TC39 Stage 3 decorators** (standard
JavaScript decorators), NOT TypeScript's legacy experimental decorators.

| Feature                  | Legacy Decorators              | TC39 Stage 3 Decorators     |
| ------------------------ | ------------------------------ | --------------------------- |
| **reflect-metadata**     | ✅ Required                    | ❌ Not needed               |
| **Parameter decorators** | ✅ Native support              | ❌ Not in spec              |
| **Metadata API**         | `Reflect.metadata()`           | Context API / WeakMaps      |
| **Support**              | TypeScript only                | Deno 2+, Node 22+, Browsers |
| **Config flag**          | `experimentalDecorators: true` | No flag needed              |

**TC39 Stage 3 Supported Decorators**:

- ✅ Class decorators
- ✅ Method decorators
- ✅ Field decorators (accessor)
- ✅ Getter/Setter decorators
- ❌ **Parameter decorators** (not in spec!)

**Why this matters**:

- We cannot use `@Guard() guard: SessionGuard` parameter decorators (they don't
  exist in TC39 spec)
- We don't need `reflect-metadata` library (TC39 decorators have built-in
  context API)
- We use **method decorators** that wrap the original function to inject
  parameters

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: Controller methods are responsible for both guard
  retrieval and business logic
- **Solution**: Separate guard access from business logic via Context API
  ```typescript
  // Before: Mixed concerns
  async logout(c: Context) {
      const auth = getAuth(c)
      const guard = auth.use('web') as SessionGuard // Guard retrieval
      await guard.logout() // Business logic
  }

  // After: Separated concerns
  async logout(c: Context) {
      await c.auth.logout() // Pure business logic
  }
  ```

**2. Open/Closed Principle (OCP)**

- **Solution**: New guard types can be added without modifying controller code
  ```typescript
  // Easy to extend with new guards
  @InjectGuard('oauth')
  async oauthLogin(c: Context, guard: OAuthGuard) {
      // Works with any guard type
  }
  ```

**3. Interface Segregation Principle (ISP)**

- **Solution**: Three different interfaces for different complexity levels
  - Simple: `c.auth.*` (fluent API)
  - Medium: `@InjectGuard()` (single guard injection)
  - Complex: Manual `getAuth(c).use()` (full control)

**4. Dependency Inversion Principle (DIP)**

- **Solution**: Controllers depend on abstractions (Context API) not concrete
  guard implementations

### DRY Principle

**Current Duplication:**

- Pattern `getAuth(c).use('web') as SessionGuard<...>` repeated in every method
- Type casting repeated with long import paths
- Same 3-4 lines of boilerplate code

**Solution:**

- Context API: One-time setup in middleware, zero boilerplate in controllers
- Decorator: Reusable pattern for guard injection
- Type helpers: Centralized type aliases

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  Controller Layer                        │  ← c.auth.logout()
├─────────────────────────────────────────┤
│  Context API Layer                       │  ← c.auth.* (enriched by middleware)
├─────────────────────────────────────────┤
│  Auth Middleware Layer                   │  ← Enriches context with guards
├─────────────────────────────────────────┤
│  Auth Manager Layer                      │  ← getAuth(c), manages guards
├─────────────────────────────────────────┤
│  Guard Implementation Layer              │  ← SessionGuard, TokenGuard, etc.
└─────────────────────────────────────────┘
```

**Key Constraints:**

- Context enrichment happens once per request in middleware
- Controllers never directly instantiate guards
- Type safety preserved through module augmentation

## 🎨 Proposed API Design

### Approach 1: Context Enhancement (95% of cases - Recommended)

```typescript
@Controller('/auth')
export class AuthController {
    @Post('/logout')
    @Use('auth')
    async logout(c: Context) {
        await c.auth.logout() // ✨ One line, type-safe, zero boilerplate
        return c.redirect('/auth/login')
    }

    @Get('/profile')
    @Use('auth')
    profile(c: Context) {
        const user = c.auth.user // Direct access to authenticated user
        return c.html(<ProfilePage user={user} />)
    }

    @Post('/register')
    @Use('auth')
    async register(c: Context) {
        const body = await c.req.parseBody()
        // ...create user...

        await c.auth.loginById(user.id) // Auto-login after registration
        return c.redirect('/dashboard')
    }
}
```

**Benefits**:

- Zero boilerplate
- Type-safe through `declare module`
- Fluent, readable API
- No decorator overhead

**Use when**:

- Single guard per route
- Simple auth operations
- Standard login/logout flows

### Approach 2: Decorator Injection (5% of cases - Advanced)

```typescript
import { InjectGuard } from '@lockness/auth'
import type { SessionGuard } from '@lockness/auth'
import type { UserProvider } from '../auth/user_provider.ts'

type WebGuard = SessionGuard<true, UserProvider>

@Controller('/auth')
export class AuthController {
    @Post('/complex')
    @InjectGuard('web')
    async complexAuth(c: Context, guard: WebGuard) {
        // guard is automatically injected as 2nd parameter
        const isValid = await guard.attempt(credentials)

        if (isValid) {
            await guard.login(email, password, remember)
        }

        return c.json({ success: isValid })
    }
}
```

**Benefits**:

- Explicit guard instance
- Type-safe with type alias
- No manual casting
- Testable (easy to mock guard parameter)

**Use when**:

- Need direct guard instance
- Complex guard operations not in Context API
- Testing with mocked guards

### Approach 3: Manual Access (Rare - Full Control)

```typescript
@Controller('/auth')
export class AuthController {
    @Post('/multi-guard')
    async multiGuard(c: Context) {
        const auth = getAuth(c)

        // Access multiple guards
        const webGuard = auth.use('web') as SessionGuard<true, UserProvider>
        const apiGuard = auth.use('api') as TokenGuard
        const oauthGuard = auth.use('oauth') as OAuthGuard

        // Complex logic with multiple guards
        if (c.req.header('Authorization')) {
            return await apiGuard.attempt()
        } else if (c.req.query('provider')) {
            return await oauthGuard.redirect()
        } else {
            return await webGuard.check()
        }
    }
}
```

**Use when**:

- Multiple guards in single method
- Dynamic guard selection at runtime
- Custom guard types not in standard API

## 📝 Detailed Implementation Steps

### Phase 1: Extend Context Interface

**Step 1.1: Create AuthContext Type**

File: `/packages/auth/types.ts`

```typescript
/**
 * Auth Context API
 *
 * Provides a fluent interface for authentication operations.
 * Automatically available on Context when @Use('auth') middleware is applied.
 */
export interface AuthContext<TUser = any> {
    /**
     * Currently authenticated user (null if not authenticated)
     */
    user: TUser | null

    /**
     * Check if user is authenticated
     */
    check(): boolean

    /**
     * Login user with credentials
     *
     * @param email - User email
     * @param password - User password
     * @param remember - Whether to persist session (default: false)
     */
    login(email: string, password: string, remember?: boolean): Promise<void>

    /**
     * Login user by ID
     *
     * @param id - User ID
     */
    loginById(id: number | string): Promise<void>

    /**
     * Logout current user
     */
    logout(): Promise<void>

    /**
     * Get the underlying guard instance
     * Use this for advanced operations not covered by the fluent API
     */
    guard(): any
}
```

**Step 1.2: Augment Core Context**

File: `/packages/auth/types.ts` (continued)

````typescript
/**
 * Augment @lockness/core Context with auth property
 *
 * This makes c.auth.* available in all controllers when @Use('auth') is applied.
 */
declare module '@lockness/core' {
    interface Context {
        /**
         * Authentication context (available when @Use('auth') middleware is applied)
         *
         * @example
         * ```typescript
         * @Post('/logout')
         * @Use('auth')
         * async logout(c: Context) {
         *     await c.auth.logout()
         *     return c.redirect('/login')
         * }
         * ```
         */
        auth: AuthContext
    }
}
````

### Phase 2: Enhance Auth Middleware

**Step 2.1: Modify Auth Middleware**

File: `/packages/auth/middleware/auth_middleware.ts`

```typescript
import type { Context, Next } from '@lockness/core'
import { getAuth } from '../helpers.ts'
import type { AuthContext } from '../types.ts'

export function createAuthMiddleware(guardName: string = 'web') {
    return async (c: Context, next: Next) => {
        const authManager = getAuth(c)
        const guard = authManager.use(guardName)

        // Enrich context with fluent auth API
        const authContext: AuthContext = {
            user: authManager.user,

            check: () => authManager.check(),

            login: async (
                email: string,
                password: string,
                remember = false,
            ) => {
                return await guard.login(email, password, remember)
            },

            loginById: async (id: number | string) => {
                return await guard.loginById(id)
            },

            logout: async () => {
                return await guard.logout()
            },

            guard: () => guard,
        }

        // Set on context
        c.set('auth', authContext)

        await next()
    }
}

/**
 * Auth middleware factory
 *
 * @param guardName - Name of guard to use (default: 'web')
 * @param redirectTo - URL to redirect if not authenticated
 */
export function authMiddleware(
    guardName: string = 'web',
    redirectTo?: string,
) {
    return async (c: Context, next: Next) => {
        // First, enrich context
        await createAuthMiddleware(guardName)(c, next)

        // Then check authentication if redirectTo is provided
        if (redirectTo) {
            const authManager = getAuth(c)
            if (!authManager.check()) {
                return c.redirect(redirectTo)
            }
        }
    }
}
```

### Phase 3: Create @InjectGuard Decorator

**Step 3.1: Implement Method Decorator**

File: `/packages/auth/decorators.ts`

````typescript
import type { Context } from '@lockness/core'
import { getAuth } from './helpers.ts'

/**
 * Inject guard as second parameter to controller method
 *
 * This decorator wraps the original method and automatically injects
 * the specified guard instance as the second parameter.
 *
 * **Important**: This is a METHOD decorator, not a parameter decorator.
 * TC39 Stage 3 decorators do not support parameter decorators.
 *
 * @param guardName - Name of guard to inject (default: 'web')
 *
 * @example
 * ```typescript
 * type WebGuard = SessionGuard<true, UserProvider>
 *
 * @Post('/logout')
 * @InjectGuard('web')
 * async logout(c: Context, guard: WebGuard) {
 *     await guard.logout()
 *     return c.redirect('/login')
 * }
 * ```
 */
export function InjectGuard(guardName: string = 'web') {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor,
    ) {
        const originalMethod = descriptor.value

        if (typeof originalMethod !== 'function') {
            throw new Error(
                `@InjectGuard can only be applied to methods, not to ${typeof originalMethod}`,
            )
        }

        // Wrap the original method
        descriptor.value = async function (c: Context, ...args: any[]) {
            // Get auth manager and guard
            const auth = getAuth(c)
            const guard = auth.use(guardName)

            // Call original method with context and guard as first two parameters
            return await originalMethod.call(this, c, guard, ...args)
        }

        return descriptor
    }
}

/**
 * Export for backward compatibility
 * @deprecated Use @Use('auth') with c.auth.* API instead
 */
export { InjectGuard as Guard }
````

**Step 3.2: Add Type Helper**

File: `/packages/auth/types.ts` (add to existing file)

````typescript
/**
 * Type helper for SessionGuard with typed UserProvider
 *
 * @example
 * ```typescript
 * import type { UserProvider } from '../auth/user_provider.ts'
 *
 * type WebGuard = TypedSessionGuard<UserProvider>
 *
 * @InjectGuard('web')
 * async logout(c: Context, guard: WebGuard) {
 *     // guard is fully typed
 * }
 * ```
 */
export type TypedSessionGuard<TProvider> = SessionGuard<true, TProvider>
````

### Phase 4: Update Exports

**Step 4.1: Update Package Exports**

File: `/packages/auth/mod.ts`

```typescript
// Existing exports
export * from './types.ts'
export * from './guards/index.ts'
export * from './providers/index.ts'
export * from './middleware/index.ts'
export * from './helpers.ts'
export * from './errors.ts'

// New exports
export { Guard, InjectGuard } from './decorators.ts'
export type { AuthContext, TypedSessionGuard } from './types.ts'
```

### Phase 5: Update Core Package

**Step 5.1: Re-export Auth Decorators**

File: `/packages/core/mod.ts`

```typescript
// Existing auth exports
export {
    Auth,
    configureAuth,
    getAuth,
    Guest,
    hashPassword,
    verifyPassword,
} from '@lockness/auth'

// New auth exports
export { InjectGuard } from '@lockness/auth'
export type { AuthContext, TypedSessionGuard } from '@lockness/auth'
```

### Phase 6: Refactor Example Controller

**Step 6.1: Update AuthController**

File: `/app/controller/auth_controller.tsx`

```typescript
/**
 * Authentication Controller
 *
 * Demonstrates three approaches to guard access:
 * 1. Context API (c.auth.*) - Recommended for most cases
 * 2. Decorator injection (@InjectGuard) - For complex scenarios
 * 3. Manual access (getAuth(c).use()) - For multiple guards
 */

import { Context, Controller, Get, Post, Use } from '@lockness/core'
import { getAuth, InjectGuard } from '@lockness/auth'
import type { SessionGuard } from '@lockness/auth'
import type { UserProvider } from '../auth/user_provider.ts'
import { hashPassword } from '@lockness/core'
import { UserRepository } from '@repository/user_repository.ts'
import { LoginPage } from '@view/pages/auth/login.tsx'
import { RegisterPage } from '@view/pages/auth/register.tsx'
import { ProfilePage } from '@view/pages/auth/profile.tsx'
import { AuthErrorPage } from '@view/pages/auth/error.tsx'

type WebGuard = SessionGuard<true, UserProvider>

@Controller('/auth')
export class AuthController {
    /**
     * Show login page
     */
    @Get('/login', { name: 'auth.login' })
    showLogin(c: Context) {
        return c.html(<LoginPage />)
    }

    /**
     * Handle login (Approach 1: Context API)
     */
    @Post('/login', { name: 'auth.login.submit' })
    @Use('auth')
    async login(c: Context) {
        const body = await c.req.parseBody()
        const email = body.email as string
        const password = body.password as string
        const remember = body.remember === '1'

        try {
            await c.auth.login(email, password, remember) // ✨ Clean!
            return c.redirect('/auth/profile')
        } catch (error) {
            return c.html(
                <AuthErrorPage
                    title='Login Failed'
                    message={(error as Error).message}
                    backUrl='/auth/login'
                    backText='Try again'
                />,
                401,
            )
        }
    }

    /**
     * Show registration page
     */
    @Get('/register', { name: 'auth.register' })
    showRegister(c: Context) {
        return c.html(<RegisterPage />)
    }

    /**
     * Handle registration (Approach 1: Context API)
     */
    @Post('/register', { name: 'auth.register.submit' })
    @Use('auth')
    async register(c: Context) {
        const body = await c.req.parseBody()
        const name = body.name as string
        const email = body.email as string
        const password = body.password as string

        const userRepo = new UserRepository()

        try {
            // Create user
            const hashedPassword = await hashPassword(password)
            const user = await userRepo.create({
                name,
                email,
                password: hashedPassword,
            })

            // Auto-login after registration using Context API
            await c.auth.loginById(user.id) // ✨ Clean!

            return c.redirect('/auth/profile')
        } catch (error) {
            return c.html(
                <AuthErrorPage
                    title='Registration Failed'
                    message={(error as Error).message}
                    backUrl='/auth/register'
                    backText='Try again'
                />,
                400,
            )
        }
    }

    /**
     * Protected profile page (Approach 1: Context API)
     */
    @Get('/profile', { name: 'auth.profile' })
    @Use('auth')
    profile(c: Context) {
        const user = c.auth.user // ✨ Direct access

        return c.html(<ProfilePage user={user} />)
    }

    /**
     * Handle logout (Approach 1: Context API)
     */
    @Post('/logout', { name: 'auth.logout' })
    @Use('auth')
    async logout(c: Context) {
        await c.auth.logout() // ✨ One line!
        return c.redirect('/auth/login')
    }

    /**
     * Example: Decorator injection (Approach 2)
     * Use when you need direct guard access for complex operations
     */
    @Post('/logout-with-decorator', { name: 'auth.logout.decorator' })
    @InjectGuard('web')
    async logoutWithDecorator(c: Context, guard: WebGuard) {
        // guard is injected as 2nd parameter, fully typed
        await guard.logout()
        return c.redirect('/auth/login')
    }

    /**
     * Example: Manual multi-guard access (Approach 3)
     * Use only when you need multiple guards in one method
     */
    @Post('/multi-auth')
    async multiAuth(c: Context) {
        const auth = getAuth(c)

        // Determine which guard to use based on request
        if (c.req.header('Authorization')) {
            const apiGuard = auth.use('api')
            return await apiGuard.attempt()
        } else {
            const webGuard = auth.use('web') as WebGuard
            return await webGuard.check()
        }
    }
}
```

**Key Changes from Old Implementation:**

1. ✅ Added `@Use('auth')` to all auth methods
2. ✅ Replaced verbose `getAuth(c).use('web') as SessionGuard<...>` with
   `c.auth.*`
3. ✅ Removed inline `import()` statements
4. ✅ Added type alias `type WebGuard = SessionGuard<true, UserProvider>` at top
5. ✅ Kept one complex example showing `@InjectGuard()` decorator usage

## 🔄 Migration Guide

### For Existing Users

**Breaking Changes** ⚠️

This refactoring simplifies the auth API but requires updating existing
controller code.

**Before (Old Verbose Pattern):**

```typescript
@Post('/logout')
async logout(c: Context) {
    const auth = getAuth(c)
    const guard = auth.use('web') as SessionGuard<true, UserProvider>
    await guard.logout()
    return c.redirect('/auth/login')
}
```

**After (New Clean Pattern):**

```typescript
@Post('/logout')
@Use('auth')
async logout(c: Context) {
    await c.auth.logout()
    return c.redirect('/auth/login')
}
```

**Migration Steps:**

1. Add `@Use('auth')` decorator to methods using guards
2. Replace `getAuth(c).use('web')` with `c.auth.*` methods
3. Remove manual type casting
4. Remove inline `import()` statements

### Choosing the Right Approach

| Scenario                        | Recommended Approach                  |
| ------------------------------- | ------------------------------------- |
| Simple login/logout             | ✅ Context API (`c.auth.*`)           |
| Check authentication            | ✅ Context API (`c.auth.check()`)     |
| Auto-login after registration   | ✅ Context API (`c.auth.loginById()`) |
| Need guard instance for testing | ⚠️ Decorator (`@InjectGuard()`)       |
| Complex guard operations        | ⚠️ Decorator (`@InjectGuard()`)       |
| Multiple guards in one method   | ❌ Manual (`getAuth(c).use()`)        |
| Dynamic guard selection         | ❌ Manual (`getAuth(c).use()`)        |

### Breaking Changes

**API Changes:**

1. ⚠️ **Auth middleware enhancement**: The `@Use('auth')` middleware now
   enriches `c.auth.*` - controllers must use this instead of manual
   `getAuth(c).use()`
2. ⚠️ **Type imports**: Remove inline `import('@lockness/auth').SessionGuard` -
   use type aliases instead
3. ⚠️ **Guard access**: Direct guard access via `getAuth(c).use()` should be
   replaced with `c.auth.*` for simple cases

**Migration Effort**: Low - Mostly find-and-replace operations with cleaner
resulting code.

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Update `/GEMINI.md` - Add "Enhanced Auth Guard API" section
  - Explain the three approaches
  - Document why no reflect-metadata is needed
  - TC39 Stage 3 decorators explanation
  - Code examples for each approach

- [ ] Update `/README.md` - Authentication section
  - Replace old verbose examples with Context API
  - Add comparison table of three approaches
  - Link to full auth documentation

- [ ] Update `/packages/auth/README.md` - Complete API reference
  - Document `AuthContext` interface
  - Document `@InjectGuard()` decorator
  - Document type helpers (`TypedSessionGuard`)
  - Migration guide with before/after examples
  - Testing guide (mocking `c.auth` vs guard parameter)

### User Documentation (Web Docs)

- [ ] Update `/app/view/pages/docs/content/authentication.md`
  - Replace all verbose guard access with Context API
  - Add section "Choosing the Right Approach"
  - Add troubleshooting section (common mistakes)
  - Add testing section with examples

### LLM Documentation

- [ ] Update `/public/llms/authentication.txt`
  - Add concise examples of all three patterns
  - Include when to use each approach
  - Keep it under 200 lines (LLM-optimized)

- [ ] Update `/public/llms/full.txt`
  - Add "Auth Guard Access Patterns" section
  - Brief overview with code snippets

### Code Examples

- [ ] Update `/app/controller/auth_controller.tsx` - Refactor with new API
- [ ] Add comments explaining each approach (as shown in Phase 6)

## 🧪 Testing Strategy

### Unit Tests

**Test 1: Context API**

File: `/packages/auth/tests/context_api.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { createMockContext } from '@lockness/testing'
import { createAuthMiddleware } from '../middleware/auth_middleware.ts'

Deno.test('AuthContext - logout method available', async () => {
    const c = createMockContext()
    const middleware = createAuthMiddleware('web')

    await middleware(c, async () => {})

    assertExists(c.get('auth'))
    assertExists(c.get('auth').logout)
    assertEquals(typeof c.get('auth').logout, 'function')
})

Deno.test('AuthContext - user property available', async () => {
    const c = createMockContext()
    const middleware = createAuthMiddleware('web')

    await middleware(c, async () => {})

    const auth = c.get('auth')
    assertEquals(auth.user, null) // Not authenticated
})
```

**Test 2: InjectGuard Decorator**

File: `/packages/auth/tests/inject_guard.test.ts`

```typescript
import { assertEquals, assertSpyCall, spy } from '@std/testing'
import { InjectGuard } from '../decorators.ts'
import { createMockContext } from '@lockness/testing'

Deno.test('InjectGuard - injects guard as second parameter', async () => {
    class TestController {
        @InjectGuard('web')
        async testMethod(c: Context, guard: any) {
            return { guard }
        }
    }

    const controller = new TestController()
    const c = createMockContext()

    const result = await controller.testMethod(c, null as any)

    assertExists(result.guard)
})

Deno.test('InjectGuard - preserves method context (this)', async () => {
    class TestController {
        name = 'TestController'

        @InjectGuard('web')
        async testMethod(c: Context, guard: any) {
            return this.name
        }
    }

    const controller = new TestController()
    const c = createMockContext()

    const result = await controller.testMethod(c, null as any)

    assertEquals(result, 'TestController')
})
```

### Integration Tests

**Test 3: Full Auth Flow**

File: `/packages/auth/tests/integration.test.ts`

```typescript
import { assertEquals } from '@std/assert'
import { App } from '@lockness/core'
import { configureAuth, createAuthMiddleware } from '@lockness/auth'

Deno.test('Integration - c.auth.login works end-to-end', async () => {
    const app = new App()

    // Configure auth
    configureAuth({/* config */})

    app.useMiddleware(createAuthMiddleware())

    // Test controller using c.auth API
    // ... create request, assert response
})
```

### Manual Testing

- [ ] Test Context API in dev mode (`deno task dev`)
  - Login via `c.auth.login()`
  - Logout via `c.auth.logout()`
  - Access `c.auth.user` in protected routes

- [ ] Test decorator injection
  - Create controller method with `@InjectGuard()`
  - Verify guard parameter is injected
  - Verify TypeScript types work correctly

- [ ] Test all refactored auth methods
  - Login via `c.auth.login()`
  - Logout via `c.auth.logout()`
  - Registration auto-login via `c.auth.loginById()`
  - Profile page access via `c.auth.user`

- [ ] Test compiled binary (`deno task compile`)
  - Verify no runtime errors with decorators
  - Verify auth flow works in production mode

## ✅ Definition of Done

- [ ] `AuthContext` interface created in `/packages/auth/types.ts`
- [ ] Context augmentation added with `declare module '@lockness/core'`
- [ ] Auth middleware enhanced to expose `c.auth.*` API
- [ ] `@InjectGuard()` decorator implemented
- [ ] Type helper `TypedSessionGuard<T>` created
- [ ] Exports updated in `/packages/auth/mod.ts` and `/packages/core/mod.ts`
- [ ] Example `AuthController` refactored with all three approaches
- [ ] All tests passing (unit + integration)
- [ ] GEMINI.md updated with new section
- [ ] README.md authentication section updated
- [ ] packages/auth/README.md has complete API reference
- [ ] Web docs updated (`authentication.md`)
- [ ] LLM docs updated (`authentication.txt`, `full.txt`)
- [ ] Manual testing completed (dev mode, compiled binary)
- [ ] Migration guide documented with clear before/after examples
- [ ] TypeScript types work correctly (no manual casting needed)
- [ ] Code formatted and linted

## 📊 Success Metrics

**Before:**

```typescript
// 4 lines of boilerplate per guard access
const auth = getAuth(c)
const guard = auth.use('web') as import('@lockness/auth').SessionGuard<
    true,
    import('../auth/user_provider.ts').UserProvider
>
await guard.logout()
```

**After (Context API):**

```typescript
// 1 line, zero boilerplate
await c.auth.logout()
```

**After (Decorator):**

```typescript
// Type-safe parameter injection
@InjectGuard('web')
async logout(c: Context, guard: WebGuard) {
    await guard.logout()
}
```

**Improvements:**

- **75% less code** for simple guard access
- **100% type-safe** without manual casting
- **Zero dependencies** (no reflect-metadata)
- **3 approaches** for different complexity levels
- **Backward compatible** (existing code unchanged)

## 🔗 Related Tasks

- [ ] Consider adding similar pattern for other injectable services (Database,
      Cache, etc.)
- [ ] Explore automatic context enrichment for other middleware

## 📝 Notes

### Why Three Approaches?

**Context API (`c.auth.*`)** - The 80/20 rule

- Covers 95% of authentication use cases
- Zero boilerplate, maximum readability
- Best developer experience

**Decorator Injection (`@InjectGuard()`)** - The explicit option

- For when you need the actual guard instance
- Better for testing (easy to mock parameters)
- Clear what's being injected

**Manual Access** - The escape hatch

- For complex scenarios (multiple guards, dynamic selection)
- Full control when needed
- Backward compatible with existing code

### TC39 Decorators Limitations

**Why we can't use parameter decorators:**

TC39 Stage 3 spec only includes:

- Class decorators
- Method decorators
- Field decorators (accessor)
- Getter/Setter decorators

**Parameter decorators are NOT in the spec** because:

1. They're harder to implement efficiently
2. They have runtime performance implications
3. They can be worked around with method decorators (as we do)

**Our workaround**: Use method decorator that wraps the function and injects
parameters. This is the same pattern used by modern frameworks like Hono, Fresh,
and Oak.

### Testing Strategy

**Mocking Context API:**

```typescript
const mockAuth = {
    user: mockUser,
    logout: spy(),
    login: spy(),
}
c.set('auth', mockAuth)

await controller.logout(c)
assertSpyCalled(mockAuth.logout)
```

**Mocking Decorator Injection:**

```typescript
const mockGuard = {
    logout: spy(),
}

await controller.logout(c, mockGuard)
assertSpyCalled(mockGuard.logout)
```

---

_Task created: 2026-01-14_ _Last updated: 2026-01-14_
