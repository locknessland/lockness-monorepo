# @lockness/hono

> **📌 Internal Package Notice**: This is an internal infrastructure package for
> the Lockness framework. For application development, please use the unified
> **`@lockness/core`** package, which provides all these functionalities and
> more.
>
> **Developers should import from `@lockness/core` instead:**
>
> ```typescript
> // ✅ Recommended (Unified API)
> import { basicAuth, cors, Hono, logger } from '@lockness/core'
>
> // ❌ Not recommended (Internal package)
> import { basicAuth, cors, Hono, logger } from '@lockness/hono'
> ```

> Hono bridge for Lockness framework providing centralized Hono dependency
> management with simplified imports and comprehensive documentation.

[![JSR](https://jsr.io/badges/@lockness/hono)](https://jsr.io/@lockness/hono)
[![Version](https://img.shields.io/badge/version-0.1.21-blue.svg)](https://jsr.io/@lockness/hono)

## Features

✨ **Single Import Point** - All 61 Hono features from one import\
📚 **Comprehensive JSDoc** - Inline documentation with examples\
📌 **Pinned Versions** - Exact Hono version for stability\
🎯 **Flat Structure** - Simple, maintainable codebase\
🌲 **Tree-Shakeable** - Only bundle what you use

## Installation

```typescript
// Import everything you need from one place
import { basicAuth, cors, Hono, jsxRenderer, logger } from '@lockness/hono'
```

## Quick Start

```typescript
import {
    basicAuth,
    type Context,
    cors,
    Hono,
    jsxRenderer,
    logger,
} from '@lockness/hono'

const app = new Hono()

// Middleware
app.use('*', cors())
app.use('*', logger())
app.use('/admin/*', basicAuth({ username: 'admin', password: 'secret' }))

// JSX rendering
app.get('*', jsxRenderer())

// Routes
app.get('/', (c: Context) => {
    return c.json({ message: 'Hello Lockness!' })
})

export default app
```

## Available Exports (61 total)

All exports are now available directly from `@lockness/hono` - no more nested
paths!

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

- **ssgParams**, **toSSG**, **disableSSG**, **isSSGContext**, **onlySSG**,
  **X_HONO_DISABLE_SSG_HEADER_KEY** - Static Site Generation
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

#### Routing (`@lockness/hono/middleware/routing`)

- `methodOverride` - HTTP method override
- `combine` - Combine middleware
- `serveStatic` - Static file serving

### Helpers (Organized)

#### Rendering (`@lockness/hono/helpers/rendering`)

- `html` - HTML helper
- `css` - CSS-in-JS
- `ssg` - Static Site Generation
- `streaming` - Streaming responses

#### Client (`@lockness/hono/helpers/client`)

- `testing` - Test utilities
- `factory` - Factory helpers

## Usage Examples

### Basic Example

```typescript
import {
    basicAuth,
    compress,
    cors,
    csrf,
    Hono,
    jsxRenderer,
    logger,
    ssgParams,
} from '@lockness/hono'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors())
app.use('*', csrf())
app.use('*', compress())

// JSX Renderer
app.use(
    '*',
    jsxRenderer(({ children }) => {
        return (
            <html>
                <body>{children}</body>
            </html>
        )
    }),
)

// Authentication
app.use(
    '/admin/*',
    basicAuth({
        username: 'admin',
        password: 'secret',
    }),
)

// Routes
app.get('/', (c) => {
    return c.html(<h1>Welcome to Lockness!</h1>)
})

// Static Site Generation
app.get(
    '/posts/:id',
    ssgParams(() => [
        { id: '1' },
        { id: '2' },
    ]),
    (c) => {
        const id = c.req.param('id')
        return c.html(<h1>Post {id}</h1>)
    },
)

export default app
```

### Advanced Example

```typescript
import {
    // Auth
    basicAuth,
    bearerAuth,
    // Request
    bodyLimit,
    // Content
    compress,
    // Security
    cors,
    csrf,
    etag,
    Hono,
    HTTPException,
    ipRestriction,
    jwt,
    logger,
    prettyJSON,
    requestId,
    secureHeaders,
    // Helpers
    ssgParams,
    // Timing
    timeout,
    timing,
    // Validation
    zValidator,
} from '@lockness/hono'
import { z } from 'zod'

const app = new Hono()

// Security middleware
app.use('*', secureHeaders())
app.use('*', cors({ origin: 'https://example.com' }))
app.use('*', csrf())

// Request middleware
app.use('*', logger())
app.use('*', requestId())
app.use('*', bodyLimit({ maxSize: 50 * 1024 })) // 50KB
app.use('*', timeout(5000)) // 5 seconds

// Content middleware
app.use('*', compress())
app.use('*', etag())
app.use('*', prettyJSON())

// Auth middleware
app.use('/api/*', jwt({ secret: process.env.JWT_SECRET }))
app.use(
    '/admin/*',
    basicAuth({
        username: process.env.ADMIN_USER,
        password: process.env.ADMIN_PASS,
    }),
)

// Validated routes
const createSchema = z.object({
    title: z.string().min(3),
    body: z.string(),
})

app.post('/posts', zValidator('json', createSchema), (c) => {
    const data = c.req.valid('json')
    return c.json({ success: true, data })
})

// Error handling
app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status)
    }
    return c.json({ error: 'Internal Server Error' }, 500)
})

export default app
```

### Testing Example

```typescript
import { basicAuth, Hono, testClient } from '@lockness/hono'
import { assertEquals } from 'jsr:@std/assert'

Deno.test('API tests', async (t) => {
    const app = new Hono()

    app.get('/', (c) => c.json({ message: 'Hello' }))
    app.use('/admin/*', basicAuth({ username: 'admin', password: 'secret' }))
    app.get('/admin/dashboard', (c) => c.json({ admin: true }))

    const client = testClient(app)

    await t.step('public route', async () => {
        const res = await client.index.$get()
        assertEquals(res.status, 200)
        assertEquals(await res.json(), { message: 'Hello' })
    })

    await t.step('protected route', async () => {
        const res = await client.admin.dashboard.$get()
        assertEquals(res.status, 401) // Unauthorized
    })
})
```

### Type Safety Example

```typescript
import {
    type Child,
    type Context,
    type Env,
    Hono,
    HTTPException,
} from '@lockness/hono'

// Typed context
const handler = (c: Context) => {
    return c.json({ ok: true })
}

// Custom env
type MyEnv = {
    Bindings: {
        DB: D1Database
    }
    Variables: {
        user: { id: string; name: string }
    }
}

const app = new Hono<MyEnv>()

app.use('*', async (c, next) => {
    c.set('user', { id: '1', name: 'John' })
    await next()
})

app.get('/profile', (c) => {
    const user = c.get('user') // Fully typed!
    return c.json(user)
})

// JSX types
const Layout = ({ children }: { children: Child }) => {
    return (
        <html>
            <body>{children}</body>
        </html>
    )
}
```

### Alternative Import Patterns

#### Organized Imports (by category)

```typescript
import { Hono } from '@lockness/hono'
import { basicAuth, jwt } from '@lockness/hono/middleware/auth'
import { cors, csrf } from '@lockness/hono/middleware/security'
import { logger } from '@lockness/hono/middleware/request'
import { ssgParams } from '@lockness/hono/helpers/rendering'
```

#### Namespace Imports

```typescript
import { Hono } from '@lockness/hono'
import * as auth from '@lockness/hono/middleware/auth'
import * as security from '@lockness/hono/middleware/security'

app.use('*', security.cors())
app.use('/api/*', auth.bearerAuth({ token: 'secret' }))
```

#### Legacy Imports (backward compatible)

```typescript
import { Hono } from '@lockness/hono'
import { basicAuth } from '@lockness/hono/basic-auth'
import { cors } from '@lockness/hono/cors'
import { logger } from '@lockness/hono/logger'
```

## Architecture

`@lockness/hono` is a **proxy package** that manages the Hono dependency for the
entire Lockness ecosystem. Instead of each Lockness package importing Hono
directly from npm, they import through this bridge, ensuring version consistency
and simplifying dependency management.

### Why This Package Exists

**The Problem:** Without a bridge, every Lockness package would need to import
`npm:hono@^4.11.1` directly, manage their own Hono version, and risk version
conflicts.

**The Solution:** `@lockness/hono` acts as a single source of truth:

- ✅ **One Hono version** for the entire framework
- ✅ **Centralized updates** - change one place, update everywhere
- ✅ **Clean imports** - `import { Hono } from '@lockness/hono'`
- ✅ **JSR compatibility** - packages can be published to JSR while depending on
  npm packages

### Updating Hono Version

To update Hono across the entire Lockness ecosystem:

1. Edit `deno.json` in this package to update the Hono version
2. Bump package version: `./nessy bump 0.2.0`
3. All Lockness packages automatically get the new Hono version

## Version

Current version: 0.1.21

Based on Hono 4.11.1

## License

MIT - See LICENSE file for details
