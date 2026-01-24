# @DeclareMiddleware Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Application Bootstrap Flow                        │
└─────────────────────────────────────────────────────────────────────┘

1. File Import Phase
   ┌─────────────────────────────────────────────┐
   │ app/middleware/auth_middleware.ts           │
   │                                             │
   │ @DeclareMiddleware('auth')   ──────────────┼──> Global Registry
   │ export class AuthMiddleware { ... }        │    (declaredMiddlewares)
   └─────────────────────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Decorator Execution                         │
   │ • Stores MIDDLEWARE_NAME_KEY on class       │
   │ • Registers in declaredMiddlewares Map      │
   └─────────────────────────────────────────────┘

2. App Initialization (app.init)
   ┌─────────────────────────────────────────────┐
   │ Step 0: Discover Middlewares                │
   │  if (middlewaresDir) {                      │
   │    await discoverMiddlewares(dir)           │
   │  }                                          │
   └─────────────────┬───────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Step 1: Register Named Middlewares          │
   │  • Set manual registry                      │
   │  • Merge declared middlewares               │
   │  • Declared takes precedence                │
   └─────────────────┬───────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Middleware Resolution                       │
   │ MiddlewareResolver has complete registry    │
   │ containing both manual + declared           │
   └─────────────────────────────────────────────┘

3. Route Registration
   ┌─────────────────────────────────────────────┐
   │ @Controller('/api')                         │
   │ @UseMiddleware('auth')    ─────────────────┼──> Stores in
   │ export class ApiController {                │    controller._middlewares
   │   @Get('/admin')                            │
   │   @UseMiddleware('admin') ─────────────────┼──> Stores in
   │   admin(c) { ... }                          │    method middlewares
   │ }                                           │
   └─────────────────┬───────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ RouteRegistry.registerControllers()         │
   │  • Reads _middlewares from controller       │
   │  • Resolves middleware names via resolver   │
   │  • Registers routes with Hono               │
   └─────────────────────────────────────────────┘

4. Request Handling
   ┌─────────────────────────────────────────────┐
   │ GET /api/admin                              │
   └─────────────────┬───────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Global Middlewares (if any)                 │
   └─────────────────┬───────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Controller-Level: 'auth'                    │
   │  → AuthMiddleware.handle()                  │
   └─────────────────┬───────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Method-Level: 'admin'                       │
   │  → AdminMiddleware.handle()                 │
   └─────────────────┬───────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Route Handler                               │
   │  → ApiController.admin()                    │
   └─────────────────────────────────────────────┘
```

## Component Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                     @DeclareMiddleware                       │
│                         Decorator                            │
└──────────────────────┬──────────────────────────────────────┘
                      │
                      │ Registers in
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  declaredMiddlewares                         │
│                    Global Map                                │
│                                                              │
│  Map<string, MiddlewareClass> {                             │
│    'auth' => AuthMiddleware,                                │
│    'admin' => AdminMiddleware,                              │
│    'rate-limit' => RateLimitMiddleware                      │
│  }                                                           │
└──────────────────────┬──────────────────────────────────────┘
                      │
                      │ Merged into
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  MiddlewareResolver                          │
│                                                              │
│  • setRegistry(manual: MiddlewareRegistry)                  │
│  • mergeDeclaredMiddlewares()                               │
│  • resolve(name: string): MiddlewareHandler                 │
│                                                              │
│  Registry: {                                                │
│    ...manualMiddlewares,    (from config)                   │
│    ...declaredMiddlewares   (from decorators - precedence)  │
│  }                                                           │
└──────────────────────┬──────────────────────────────────────┘
                      │
                      │ Used by
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    RouteRegistry                             │
│                                                              │
│  • registerControllers()                                    │
│  • Reads controller._middlewares                            │
│  • Calls resolver.resolve() for each name                   │
│  • Attaches handlers to Hono routes                         │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌──────────────────┐
│  Middleware File │
│                  │
│ @DeclareMidd...  │
│ class Auth { }   │
└────────┬─────────┘
         │
         │ 1. Class decoration
         │    happens during import
         ▼
┌──────────────────────────┐
│  Global Registry         │
│  declaredMiddlewares     │
│  Set('auth', AuthMidd...) │
└────────┬─────────────────┘
         │
         │ 2. App.init() calls
         │    mergeDeclaredMiddlewares()
         ▼
┌──────────────────────────┐
│  MiddlewareResolver      │
│  registry = {            │
│    'auth': AuthMidd...   │
│  }                       │
└────────┬─────────────────┘
         │
         │ 3. Route registration
         │    resolves 'auth' string
         ▼
┌──────────────────────────┐
│  Hono Middleware Chain   │
│  [AuthHandler, ...]      │
└────────┬─────────────────┘
         │
         │ 4. Request handling
         │    executes chain
         ▼
┌──────────────────────────┐
│  Route Handler           │
│  ApiController.admin()   │
└──────────────────────────┘
```

## Key Design Decisions

### 1. Global Registry Pattern

**Why:** TC39 decorators execute during class definition, before any app
initialization. A global registry allows middlewares to self-register
immediately.

```typescript
export const declaredMiddlewares = new Map<string, MiddlewareClass>()
```

### 2. Auto-Discovery via Import

**Why:** Decorators only execute when files are imported. The
`discoverMiddlewares()` function imports all files in a directory to trigger
decorator execution.

```typescript
export async function discoverMiddlewares(directory: string) {
    for (const file of files) {
        await import(file) // Triggers @DeclareMiddleware
    }
}
```

### 3. Precedence Model

**Why:** Allows gradual migration. Declared middlewares override manual ones,
encouraging adoption of the new pattern.

```typescript
mergeDeclaredMiddlewares() {
    // Declared middlewares take precedence
    this.middlewareRegistry = { 
        ...this.middlewareRegistry, 
        ...declared 
    }
}
```

### 4. String-Based Resolution

**Why:** Maintains consistency with existing `@Use('name')` pattern. String
names provide a stable reference regardless of import order.

```typescript
@UseMiddleware('auth')  // String lookup, not class reference
```

## Trade-offs

### Advantages

✅ Clean, declarative syntax ✅ Auto-registration eliminates kernel boilerplate
✅ Co-located middleware definitions ✅ Type-safe with full TypeScript support
✅ Backward compatible with `@Use`

### Considerations

⚠️ Global state (declaredMiddlewares Map) ⚠️ Requires file imports for
registration ⚠️ String-based lookup (no compile-time validation of names) ⚠️
Auto-discovery has small startup overhead

## Comparison with Alternatives

### Alternative 1: Manual Registration Only

```typescript
// Pros: Simple, no magic
// Cons: Verbose, kernel becomes cluttered
await app.init({
    middlewares: {
        auth: AuthMiddleware,
        admin: AdminMiddleware,
    },
})
```

### Alternative 2: Class-Based `@Use`

```typescript
// Pros: Type-safe, no strings
// Cons: Tight coupling, breaks with circular deps
@Use(AuthMiddleware)  // Direct class reference
```

### Chosen Approach: Hybrid

```typescript
// Best of both worlds:
// - Declarative registration (@DeclareMiddleware)
// - String-based usage (@UseMiddleware)
// - Optional manual override
```

## Future Extensions

### Potential Enhancements

1. **Middleware Groups**
   ```typescript
   @UseMiddlewareGroup(['auth', 'admin'])
   ```

2. **Priority/Ordering**
   ```typescript
   @DeclareMiddleware('auth', { priority: 10 })
   ```

3. **Conditional Application**
   ```typescript
   @UseMiddleware('auth', { unless: isDevelopment })
   ```

4. **Dependency Injection**
   ```typescript
   @DeclareMiddleware('auth')
   class AuthMiddleware {
       @Inject(UserService)
       accessor userService!: UserService
   }
   ```

## Summary

The `@DeclareMiddleware` implementation provides a clean, maintainable approach
to middleware management while maintaining backward compatibility and following
Lockness's philosophy of ergonomics and speed.
