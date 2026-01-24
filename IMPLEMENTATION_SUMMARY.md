# @DeclareMiddleware Implementation Summary

## Overview

This implementation adds `@DeclareMiddleware` and `@UseMiddleware` decorators to
the Lockness framework, eliminating verbose middleware registration in the
kernel and providing a cleaner, more maintainable approach.

## Key Features

### 1. Declarative Middleware Registration

**Before (Verbose):**

```typescript
// app/kernel.tsx
await app.init({
    middlewares: {
        auth: class AuthMiddleware {
            async handle(c: Context, next: Next): Promise<Response | void> {
                return await authMiddleware()(c, next)
            }
        },
    },
})
```

**After (Clean):**

```typescript
// app/middleware/auth_middleware.ts
@DeclareMiddleware('auth')
export class AuthMiddleware {
    async handle(c: Context, next: Next) {
        return await authMiddleware()(c, next)
    }
}

// app/kernel.tsx
await app.init({
    middlewaresDir: './app/middleware', // Auto-discover
})
```

### 2. Explicit Usage Decorator

```typescript
@Controller('/api')
@UseMiddleware('auth') // Clear intent
export class ApiController {
    @Get('/admin')
    @UseMiddleware('admin') // Stack multiple
    adminPanel(c: Context) {
        return c.json({ admin: true })
    }
}
```

### 3. Backward Compatibility

The existing `@Use` decorator still works with named middlewares:

```typescript
@Use('auth')  // Still works
@UseMiddleware('auth')  // New, more explicit
```

## Technical Implementation

### Core Components

1. **Global Registry** (`declaredMiddlewares`)
   - Maps middleware names to class constructors
   - Populated during decorator execution
   - Location: `packages/core/decorators.ts`

2. **Auto-Discovery** (`discoverMiddlewares()`)
   - Imports all middleware files from a directory
   - Triggers `@DeclareMiddleware` decorators
   - Location: `packages/core/middleware_resolver.ts`

3. **Registry Merging** (`mergeDeclaredMiddlewares()`)
   - Combines manual and declared middlewares
   - Declared middlewares take precedence
   - Location: `packages/core/middleware_resolver.ts`

4. **App Integration**
   - Step 0: Discover middlewares (if `middlewaresDir` provided)
   - Step 1: Register named middlewares (manual + declared)
   - Location: `packages/core/app.ts`

### File Changes

#### New Files

- `packages/core/tests/declare_middleware.test.ts` - Unit tests
- `packages/core/tests/middleware_resolver_declared.test.ts` - Resolver tests
- `packages/core/tests/declare_middleware_integration.test.ts` - Integration
  tests
- `app/middleware/admin_middleware.ts` - Example middleware
- `app/controller/example_controller.ts` - Usage example
- `docs/middleware.md` - Comprehensive documentation

#### Modified Files

- `packages/core/decorators.ts` - Added decorators and registry
- `packages/core/middleware_resolver.ts` - Added discovery and merging
- `packages/core/app.ts` - Added middleware discovery step
- `packages/core/types.ts` - Added `middlewaresDir` config option
- `app/middleware/auth_middleware.ts` - Updated to use `@DeclareMiddleware`
- `app/kernel.tsx` - Simplified middleware registration
- `app/routes.ts` - Added ExampleController

## API Reference

### `@DeclareMiddleware(name: string)`

Declares a middleware with a unique name, automatically registering it.

**Parameters:**

- `name: string` - Unique middleware identifier

**Example:**

```typescript
@DeclareMiddleware('rate-limit')
export class RateLimitMiddleware implements IMiddleware {
    async handle(c: Context, next: Next) {
        // Rate limiting logic
        return next()
    }
}
```

### `@UseMiddleware(name: string)`

Applies a named middleware to a controller or route method.

**Parameters:**

- `name: string` - Name of the middleware

**Example:**

```typescript
@Controller('/api')
@UseMiddleware('auth')
export class ApiController {
    @Get('/admin')
    @UseMiddleware('admin')
    admin(c: Context) { ... }
}
```

### Config Option: `middlewaresDir`

Optional path to middleware directory for auto-discovery.

**Example:**

```typescript
await app.init({
    middlewaresDir: './app/middleware',
    controllersDir: './app/controller',
})
```

## Test Coverage

### Unit Tests

- Middleware registration in global registry
- Multiple middlewares registration
- Metadata storage on classes
- Method-level middleware application
- Middleware stacking

### Integration Tests

- Declared middlewares in App initialization
- Multiple middlewares working together
- Middleware blocking requests
- Backward compatibility with `@Use`

### Example Scenarios

- Auth middleware (authentication check)
- Admin middleware (role-based access)
- Example controller (usage patterns)

## Migration Path

### For Existing Projects

1. **Add `middlewaresDir` to kernel:**

```typescript
await app.init({
    middlewaresDir: './app/middleware', // Add this
    // ... rest of config
})
```

2. **Convert middlewares one by one:**

```typescript
// Old (in kernel.tsx)
middlewares: {
    auth: class AuthMiddleware { ... }
}

// New (in app/middleware/auth_middleware.ts)
@DeclareMiddleware('auth')
export class AuthMiddleware { ... }
```

3. **Update usage (optional):**

```typescript
// Old (still works)
@Use('auth')

// New (more explicit)
@UseMiddleware('auth')
```

## Benefits

1. **Cleaner Code**: No verbose inline class definitions in kernel
2. **Auto-Discovery**: Middlewares automatically registered from directory
3. **Co-location**: Middleware logic lives in dedicated files
4. **Type Safety**: Full TypeScript support with TC39 decorators
5. **Explicit Intent**: `@UseMiddleware` is clearer than `@Use` with strings
6. **Backward Compatible**: Existing `@Use` decorator still works
7. **Zero Breaking Changes**: Fully opt-in, no changes required

## Future Enhancements

Potential additions:

1. Middleware priority/ordering
2. Middleware groups (e.g., `@UseMiddleware(['auth', 'admin'])`)
3. Conditional middleware application
4. Middleware dependency injection
5. Middleware lifecycle hooks

## Documentation

- **Guide**: `docs/middleware.md` - Complete middleware documentation
- **Examples**: `app/middleware/` - Auth and admin middleware examples
- **Usage**: `app/controller/example_controller.ts` - Controller examples
- **Tests**: `packages/core/tests/*_middleware*.test.ts` - Test examples
