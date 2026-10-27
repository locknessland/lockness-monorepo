# Lockness Hono Bridge

> **⚠️ INTERNAL PACKAGE**: This is an internal infrastructure package.
> Developers should use `@lockness/core` instead.

Internal Hono dependency bridge providing centralized Hono dependency management
for Lockness framework.

## Overview

@lockness/hono is a **proxy package** that:

- **Centralizes Hono dependency** - Single source of truth for Hono version
- **Simplifies imports** - All 61 Hono features from one import
- **Ensures consistency** - One Hono version across entire framework
- **Provides documentation** - Comprehensive JSDoc with examples

## For Application Developers

**DO NOT use this package directly in applications. Use `@lockness/core`
instead:**

```typescript
// ✅ Recommended (Use this)
import { basicAuth, Context, cors, Hono, logger } from '@lockness/core'

// ❌ Not recommended (Internal package)
import { basicAuth, Context, cors, Hono, logger } from '@lockness/hono'
```

## For Framework Developers

This package is designed for Lockness framework packages that need Hono
functionality:

```typescript
// In @lockness/auth, @lockness/session, etc.
import { Context, MiddlewareHandler } from '@lockness/hono'
```

## Architecture

### Why This Package Exists

**Problem:** Without a bridge, every Lockness package would import
`npm:hono@^4.11.1` directly, causing:

- Version conflicts between packages
- Duplicate Hono instances
- Difficult version management

**Solution:** @lockness/hono acts as a single source of truth:

- ✅ One Hono version for entire framework
- ✅ Centralized updates - change once, update everywhere
- ✅ Clean imports - `import { Hono } from '@lockness/hono'`
- ✅ JSR compatibility - packages can depend on npm packages

### Updating Hono Version

To update Hono across entire Lockness ecosystem:

1. Edit `deno.json` in this package to update Hono version
2. Bump package version: `./nessy bump 0.2.0`
3. All Lockness packages automatically get new Hono version

## Available Exports (61 total)

### Core Modules

- **Hono** - Main application class
- **Context** - Request context (type)
- **MiddlewareHandler** - Middleware signature (type)
- **HTTPException** - Error handling
- **HonoRequest** - Request type
- **Env** - Environment types

### JSX & Rendering

- **jsx**, **jsxFn**, **Fragment** - JSX runtime
- **jsxRenderer** - JSX middleware
- **html**, **raw** - HTML helpers
- **css**, **cx**, **keyframes**, **Style** - CSS-in-JS

### Authentication

- **basicAuth** - HTTP Basic Authentication
- **bearerAuth** - Bearer Token Authentication
- **jwt** - JWT middleware
- **jwk** - JWK middleware

### Security

- **cors** - CORS handling
- **csrf** - CSRF protection
- **secureHeaders** - Security headers
- **ipRestriction** - IP-based access control

### Content Management

- **compress** - Response compression (gzip, deflate)
- **etag** - ETag generation
- **prettyJSON** - JSON formatting
- **trailingSlash** - URL normalization
- **bodyLimit** - Request body size limits

### Request Handling

- **logger** - Request logging
- **requestId** - Request ID generation
- **language** - Language detection
- **poweredBy** - X-Powered-By header
- **methodOverride** - HTTP method override
- **accepts** - Accept header parsing

### Timing & Performance

- **timeout** - Request timeout
- **timing** - Server-Timing header
- **cache** - Response caching

### Routing

- **combine** - Combine multiple apps
- **factory** - Create middleware/handlers
- **route** - Dynamic routing utilities

### SSG & Streaming

- **ssgParams**, **toSSG**, **disableSSG**, **isSSGContext**, **onlySSG** -
  Static Site Generation
- **stream**, **streamSSE**, **streamText** - Streaming responses

### Utilities

- **getCookie**, **setCookie**, **deleteCookie**, **getSignedCookie**,
  **setSignedCookie** - Cookie management
- **getConnInfo** - Connection info
- **validator** - Request validation
- **createMiddleware**, **createFactory** - Factory functions
- **serveStatic**, **denoServeStatic** - Static file serving
- **hc** - RPC client
- **proxy** - Proxy requests

## Import Patterns (Internal Use)

### Flat Import (Recommended)

```typescript
import { basicAuth, Context, cors, Hono, logger } from '@lockness/hono'
```

### Organized Imports

```typescript
import { Hono } from '@lockness/hono'
import { basicAuth, jwt } from '@lockness/hono/middleware/auth'
import { cors, csrf } from '@lockness/hono/middleware/security'
import { logger } from '@lockness/hono/middleware/request'
```

### Namespace Imports

```typescript
import { Hono } from '@lockness/hono'
import * as auth from '@lockness/hono/middleware/auth'
import * as security from '@lockness/hono/middleware/security'

app.use('*', security.cors())
app.use('/api/*', auth.bearerAuth({ token: 'secret' }))
```

## Usage Examples (Framework Development)

### Basic Middleware

```typescript
import { Context, MiddlewareHandler } from '@lockness/hono'

export function customMiddleware(): MiddlewareHandler {
    return async (c: Context, next) => {
        console.log(`Request to: ${c.req.path}`)
        await next()
    }
}
```

### Type-Safe Context

```typescript
import { Context, Env } from '@lockness/hono'

type MyEnv = {
    Bindings: {
        DB: D1Database
    }
    Variables: {
        user: { id: string; name: string }
    }
}

export function authMiddleware(): MiddlewareHandler<MyEnv> {
    return async (c: Context<MyEnv>, next) => {
        c.set('user', { id: '1', name: 'John' })
        await next()
    }
}
```

### Custom Error Handling

```typescript
import { HTTPException } from '@lockness/hono'

export function throwNotFound(message: string): never {
    throw new HTTPException(404, { message })
}
```

### JSX Components (Framework)

```typescript
import { Fragment, jsx } from '@lockness/hono'

export function ErrorPage({ message }: { message: string }) {
    return (
        <html>
            <body>
                <h1>Error</h1>
                <p>{message}</p>
            </body>
        </html>
    )
}
```

## Testing with Hono Bridge

```typescript
import { Hono, testClient } from '@lockness/hono'
import { assertEquals } from 'jsr:@std/assert'

Deno.test('middleware test', async () => {
    const app = new Hono()

    app.get('/', (c) => c.json({ message: 'Hello' }))

    const client = testClient(app)
    const res = await client.index.$get()

    assertEquals(res.status, 200)
    assertEquals(await res.json(), { message: 'Hello' })
})
```

## Documentation

All exports include comprehensive JSDoc comments with:

- Purpose and description
- Usage examples
- Parameter descriptions
- Return types
- Related exports

Example:

````typescript
/**
 * HTTP Basic Authentication middleware
 *
 * @example
 * ```typescript
 * app.use('/admin/*', basicAuth({
 *     username: 'admin',
 *     password: 'secret'
 * }))
 * ```
 */
export { basicAuth } from 'npm:hono@4.11.1/basic-auth'
````

## Version Information

- Current version: 0.1.21
- Based on: Hono 4.11.1
- Published to: JSR (@lockness/hono)

## Maintenance

### Adding New Exports

1. Add export to `mod.ts`:
   ```typescript
   /**
    * Your JSDoc here
    */
   export { newFeature } from 'npm:hono@4.11.1/new-feature'
   ```

2. Update organized imports if needed:
   ```typescript
   // middleware/new-category.ts
   export { newFeature } from 'npm:hono@4.11.1/new-feature'
   ```

3. Update this documentation

### Version Updates

1. Update Hono version in `deno.json`:
   ```json
   {
       "imports": {
           "hono": "npm:hono@4.12.0"
       }
   }
   ```

2. Bump package version:
   ```bash
   ./nessy bump 0.2.0
   ```

3. Test all Lockness packages

4. Publish to JSR

## Integration with Lockness Core

@lockness/core re-exports all Hono functionality:

```typescript
// @lockness/core/mod.ts
export * from '@lockness/hono'
```

This allows application developers to use single import:

```typescript
import { basicAuth, Context, Hono } from '@lockness/core'
```

## Best Practices

### For Framework Developers

- **Use TypeScript types** from @lockness/hono for type safety
- **Import minimal exports** to keep bundle size small
- **Document usage** when creating framework features
- **Test compatibility** when Hono version updates

### For Application Developers

- **Use @lockness/core** instead of @lockness/hono
- **Follow Lockness patterns** (MVC, decorators, services)
- **Refer to @lockness/core docs** for application development

## Troubleshooting

### Import Errors

If you see import errors:

1. Check you're using correct package:
   - Framework development: `@lockness/hono`
   - Application development: `@lockness/core`

2. Verify version compatibility in `deno.json`

3. Clear Deno cache: `deno cache --reload`

### Type Errors

If TypeScript types don't match:

1. Ensure all Lockness packages use same @lockness/hono version
2. Check `deno.json` imports are correct
3. Restart TypeScript server

## Contributing

When contributing to this package:

1. Maintain backward compatibility
2. Add comprehensive JSDoc to new exports
3. Test with all Lockness packages
4. Update this documentation
5. Follow semantic versioning

## Internal Package Notice

Remember: This is an internal package for Lockness framework infrastructure.
Application developers should use `@lockness/core` which provides a unified API
including all Hono functionality plus Lockness-specific features like
decorators, dependency injection, and MVC patterns.
