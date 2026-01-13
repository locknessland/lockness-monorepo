# Technical Task: Expose All Hono Exports via @lockness/hono

## 📋 Task Overview

Currently, `@lockness/hono` only exposes 13 exports out of 69+ available in
`npm:hono`. This forces users to import directly from `npm:hono` for features
like `hono/ssg`, `hono/basic-auth`, etc., which bypasses the centralization of
the Hono dependency in the Lockness ecosystem.

The goal is to expose **all** Hono exports in a clean and maintainable way,
without creating 40+ individual files.

## 🎯 Objectives

1. **Complete centralization**: Expose all Hono exports via `@lockness/hono`
2. **Clean architecture**: Use a folder structure organized by category
3. **Easy maintenance**: Clear structure that facilitates future updates
4. **Backward compatible**: Don't break existing imports
5. **Type-safety**: Ensure correct type inference for all exports

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/hono/deno.json` - Add new organized exports
- `/packages/hono/README.md` - Document newly available exports

### New Directory Structure

```
packages/hono/
├── deno.json
├── README.md
├── mod.ts (existing)
├── middleware/
│   ├── mod.ts (barrel export)
│   ├── auth.ts (basic-auth, bearer-auth, jwt, jwk)
│   ├── content.ts (compress, etag, pretty-json)
│   ├── security.ts (cors, csrf, secure-headers, ip-restriction)
│   └── request.ts (body-limit, logger, request-id, timeout, etc.)
├── helpers/
│   ├── mod.ts (barrel export)
│   ├── rendering.ts (html, css, ssg, streaming)
│   ├── client.ts (client, testing, factory)
│   └── server.ts (adapter, dev, proxy, route)
└── adapters/
    ├── mod.ts (barrel export - if needed)
```

### Documentation Files to Update

- `/packages/hono/README.md` - Document the new architecture
- `/GEMINI.md` - Update the @lockness/hono section
- `/app/view/pages/docs/content/packages/hono.md` - User documentation (if
  exists)

## 🏗️ Architecture Principles

### Options Analysis

**Option 1: Individual Files (Current)** ❌

```typescript
// packages/hono/basic-auth.ts
export * from 'hono/basic-auth'

// packages/hono/bearer-auth.ts
export * from 'hono/bearer-auth'
// ... 40+ fichiers similaires
```

**Problems:**

- 40+ files to maintain
- Flat structure difficult to navigate
- Pattern duplication

**Option 2: Organization by Categories (Recommended)** ✅

```typescript
// packages/hono/middleware/auth.ts
export * from 'hono/basic-auth'
export * from 'hono/bearer-auth'
export * from 'hono/jwt'
export * from 'hono/jwk'

// packages/hono/middleware/mod.ts (barrel)
export * from './auth.ts'
export * from './content.ts'
export * from './security.ts'
export * from './request.ts'
```

**Advantages:**

- Logical and navigable structure
- Semantic grouping (auth, security, rendering, etc.)
- Easier maintenance
- Barrel exports for flexibility

**Option 3: Direct Exports in deno.json** ⚠️

```json
{
    "exports": {
        "./middleware/auth": "npm:hono/basic-auth"
    }
}
```

**Problems:**

- Loses named exports (must re-export everything)
- Configuration complexity
- Difficult to group logically

### Selected Architecture: Option 2 with Improvements

```
📦 @lockness/hono
├── Core (racine)
│   ├── mod.ts → hono
│   ├── types.ts → hono/types
│   ├── http-exception.ts → hono/http-exception
│   └── client.ts → hono/client
│
├── JSX (sous-dossier jsx/)
│   ├── jsx.ts → hono/jsx
│   ├── jsx-runtime.ts → hono/jsx-runtime
│   └── jsx-renderer.ts → hono/jsx-renderer
│
├── Middleware (sous-dossier middleware/)
│   ├── mod.ts (barrel export de tous)
│   ├── auth.ts → basic-auth, bearer-auth, jwt, jwk
│   ├── content.ts → compress, etag, pretty-json, trailing-slash
│   ├── security.ts → cors, csrf, secure-headers, ip-restriction
│   ├── request.ts → body-limit, context-storage, logger, request-id
│   ├── timing.ts → timeout, timing, cache
│   └── routing.ts → method-override, combine, serve-static
│
├── Helpers (sous-dossier helpers/)
│   ├── mod.ts (barrel export de tous)
│   ├── rendering.ts → html, css, ssg, streaming
│   ├── client.ts → testing, factory
│   ├── server.ts → adapter, dev, proxy, route
│   └── network.ts → cookie, ws, conninfo, accepts
│
└── Adapters (optionnel - pour Deno principalement)
    └── deno.ts → hono/deno
```

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: Single flat file for each export
- **Solution**: Group by functional responsibility
  ```typescript
  // middleware/auth.ts - Responsabilité: Authentification
  export * from 'hono/basic-auth'
  export * from 'hono/bearer-auth'
  export * from 'hono/jwt'
  export * from 'hono/jwk'
  ```

**2. Open/Closed Principle (OCP)**

- **Solution**: Barrel exports allow adding new middleware without changing
  imports
  ```typescript
  // middleware/mod.ts
  export * from './auth.ts'
  export * from './security.ts'
  // Easy to add: export * from './new-category.ts'
  ```

**3. Interface Segregation Principle (ISP)**

- **Solution**: Users can import precisely what they need
  ```typescript
  // Specific import
  import { basicAuth } from '@lockness/hono/middleware/auth'

  // Category import
  import { basicAuth, bearerAuth, jwt } from '@lockness/hono/middleware/auth'

  // Import everything
  import * as middleware from '@lockness/hono/middleware'
  ```

**4. Dependency Inversion Principle (DIP)**

- **Solution**: Abstract imports via @lockness/hono instead of depending
  directly on npm:hono

### DRY Principle

**Current Duplication:**

- Pattern `export * from 'hono/xxx'` repeated 40+ times
- Repetitive deno.json configuration

**Solution:**

- Logical grouping reduces duplication
- Barrel exports centralize re-exports

## 🎨 Proposed API Design

### Target User-Facing API (Simple - Backward Compatible)

```typescript
// ✅ Existing imports continue to work
import { Hono } from '@lockness/hono'
import { cors } from '@lockness/hono/cors'
import { zValidator } from '@lockness/hono/zod-validator'

// ✅ New organized imports
import { basicAuth, bearerAuth, jwt } from '@lockness/hono/middleware/auth'
import { cors, csrf, secureHeaders } from '@lockness/hono/middleware/security'
import { css, html } from '@lockness/hono/helpers/rendering'
import { ssgParams } from '@lockness/hono/helpers/rendering'
```

### Target User-Facing API (Grouped Import)

```typescript
// Import an entire category
import * as auth from '@lockness/hono/middleware/auth'
import * as security from '@lockness/hono/middleware/security'
import * as helpers from '@lockness/hono/helpers'

const app = new Hono()

// Usage
app.use('/admin/*', auth.basicAuth({ username: 'admin', password: 'secret' }))
app.use('*', security.cors())
app.get('/ssg', helpers.ssgParams(() => [...]))
```

### Target User-Facing API (Backward + Direct)

```typescript
// For users who want the old style (still supported)
import { basicAuth } from '@lockness/hono/basic-auth'
import { cors } from '@lockness/hono/cors'

// OR the new organized style
import { basicAuth } from '@lockness/hono/middleware/auth'
import { cors } from '@lockness/hono/middleware/security'
```

## 📝 Detailed Implementation Steps

### Phase 1: Create Folder Structure

**Step 1.1: Create middleware/auth.ts**

File: `/packages/hono/middleware/auth.ts`

```typescript
/**
 * Authentication Middleware
 *
 * Provides authentication mechanisms including:
 * - Basic Auth (HTTP Basic Authentication)
 * - Bearer Auth (Token-based authentication)
 * - JWT (JSON Web Tokens)
 * - JWK (JSON Web Key for JWT verification)
 *
 * @module
 */

export * from 'hono/basic-auth'
export * from 'hono/bearer-auth'
export * from 'hono/jwt'
export * from 'hono/jwk'
```

**Step 1.2: Create middleware/security.ts**

File: `/packages/hono/middleware/security.ts`

```typescript
/**
 * Security Middleware
 *
 * Provides security features including:
 * - CORS (Cross-Origin Resource Sharing)
 * - CSRF (Cross-Site Request Forgery protection)
 * - Secure Headers (Security-related HTTP headers)
 * - IP Restriction (IP-based access control)
 *
 * @module
 */

export * from 'hono/cors'
export * from 'hono/csrf'
export * from 'hono/secure-headers'
export * from 'hono/ip-restriction'
```

**Step 1.3: Create middleware/content.ts**

File: `/packages/hono/middleware/content.ts`

```typescript
/**
 * Content Processing Middleware
 *
 * Provides content manipulation features:
 * - Compress (Response compression)
 * - ETag (Entity Tag for caching)
 * - Pretty JSON (Formatted JSON responses)
 * - Trailing Slash (URL normalization)
 *
 * @module
 */

export * from 'hono/compress'
export * from 'hono/etag'
export * from 'hono/pretty-json'
export * from 'hono/trailing-slash'
```

**Step 1.4: Create middleware/request.ts**

File: `/packages/hono/middleware/request.ts`

```typescript
/**
 * Request Processing Middleware
 *
 * Provides request handling features:
 * - Body Limit (Request body size limits)
 * - Context Storage (Async local storage for context)
 * - Logger (Request/response logging)
 * - Request ID (Unique request identifier)
 * - Language (Language detection and negotiation)
 * - Powered By (X-Powered-By header)
 *
 * @module
 */

export * from 'hono/body-limit'
export * from 'hono/context-storage'
export * from 'hono/logger'
export * from 'hono/request-id'
export * from 'hono/language'
export * from 'hono/powered-by'
```

**Step 1.5: Create middleware/timing.ts**

File: `/packages/hono/middleware/timing.ts`

```typescript
/**
 * Timing & Caching Middleware
 *
 * Provides performance and caching features:
 * - Timeout (Request timeout handling)
 * - Timing (Server-Timing header)
 * - Cache (Response caching)
 *
 * @module
 */

export * from 'hono/timeout'
export * from 'hono/timing'
export * from 'hono/cache'
```

**Step 1.6: Create middleware/routing.ts**

File: `/packages/hono/middleware/routing.ts`

```typescript
/**
 * Routing Middleware
 *
 * Provides routing utilities:
 * - Method Override (HTTP method override)
 * - Combine (Combine multiple middleware)
 * - Serve Static (Static file serving)
 *
 * @module
 */

export * from 'hono/method-override'
export * from 'hono/combine'
export * from 'hono/serve-static'
```

**Step 1.7: Create middleware/mod.ts (Barrel)**

File: `/packages/hono/middleware/mod.ts`

````typescript
/**
 * Hono Built-in Middleware
 *
 * Barrel export of all Hono middleware categories.
 *
 * @example
 * ```typescript
 * // Import specific category
 * import * as auth from '@lockness/hono/middleware/auth'
 *
 * // Import all middleware
 * import * as middleware from '@lockness/hono/middleware'
 *
 * // Import specific middleware
 * import { basicAuth, cors, logger } from '@lockness/hono/middleware'
 * ```
 *
 * @module
 */

export * from './auth.ts'
export * from './security.ts'
export * from './content.ts'
export * from './request.ts'
export * from './timing.ts'
export * from './routing.ts'
````

### Phase 2: Create Helpers

**Step 2.1: Create helpers/rendering.ts**

File: `/packages/hono/helpers/rendering.ts`

```typescript
/**
 * Rendering Helpers
 *
 * Provides content rendering utilities:
 * - HTML (HTML template helper)
 * - CSS (CSS-in-JS helper)
 * - SSG (Static Site Generation)
 * - Streaming (Streaming responses)
 *
 * @module
 */

export * from 'hono/html'
export * from 'hono/css'
export * from 'hono/ssg'
export * from 'hono/streaming'
```

**Step 2.2: Create helpers/client.ts**

File: `/packages/hono/helpers/client.ts`

```typescript
/**
 * Client & Testing Helpers
 *
 * Provides development utilities:
 * - Testing (Test utilities)
 * - Factory (Factory helpers for creating handlers)
 *
 * @module
 */

export * from 'hono/testing'
export * from 'hono/factory'
```

**Step 2.3: Create helpers/server.ts**

File: `/packages/hono/helpers/server.ts`

```typescript
/**
 * Server Helpers
 *
 * Provides server-side utilities:
 * - Adapter (Runtime adapter utilities)
 * - Dev (Development helpers)
 * - Proxy (Proxy helper)
 * - Route (Route helper)
 *
 * @module
 */

export * from 'hono/adapter'
export * from 'hono/dev'
export * from 'hono/proxy'
export * from 'hono/route'
```

**Step 2.4: Create helpers/network.ts**

File: `/packages/hono/helpers/network.ts`

```typescript
/**
 * Network Helpers
 *
 * Provides network-related utilities:
 * - Cookie (Cookie management)
 * - WebSocket (WebSocket utilities)
 * - ConnInfo (Connection information)
 * - Accepts (Content negotiation)
 *
 * @module
 */

export * from 'hono/cookie'
export * from 'hono/ws'
export * from 'hono/conninfo'
export * from 'hono/accepts'
```

**Step 2.5: Create helpers/mod.ts (Barrel)**

File: `/packages/hono/helpers/mod.ts`

````typescript
/**
 * Hono Helpers
 *
 * Barrel export of all Hono helper categories.
 *
 * @example
 * ```typescript
 * // Import specific category
 * import * as rendering from '@lockness/hono/helpers/rendering'
 *
 * // Import all helpers
 * import * as helpers from '@lockness/hono/helpers'
 *
 * // Import specific helper
 * import { html, css, ssgParams } from '@lockness/hono/helpers'
 * ```
 *
 * @module
 */

export * from './rendering.ts'
export * from './client.ts'
export * from './server.ts'
export * from './network.ts'
````

### Phase 3: Update deno.json

**Step 3.1: Add organized exports**

File: `/packages/hono/deno.json`

```json
{
    "name": "@lockness/hono",
    "version": "0.1.21",
    "license": "MIT",
    "exports": {
        ".": "./mod.ts",
        "./types": "./types.ts",
        "./http-exception": "./http-exception.ts",
        "./client": "./client.ts",
        "./validator": "./validator.ts",

        "./jsx": "./jsx.ts",
        "./jsx-runtime": "./jsx-runtime.ts",
        "./jsx/jsx-runtime": "./jsx-runtime.ts",
        "./jsx-renderer": "./jsx-renderer.ts",

        "./deno": "./deno.ts",
        "./html": "./html.ts",

        "./middleware": "./middleware/mod.ts",
        "./middleware/auth": "./middleware/auth.ts",
        "./middleware/security": "./middleware/security.ts",
        "./middleware/content": "./middleware/content.ts",
        "./middleware/request": "./middleware/request.ts",
        "./middleware/timing": "./middleware/timing.ts",
        "./middleware/routing": "./middleware/routing.ts",

        "./helpers": "./helpers/mod.ts",
        "./helpers/rendering": "./helpers/rendering.ts",
        "./helpers/client": "./helpers/client.ts",
        "./helpers/server": "./helpers/server.ts",
        "./helpers/network": "./helpers/network.ts",

        "./cookie": "./cookie.ts",
        "./cors": "./cors.ts",
        "./zod-validator": "./zod-validator.ts",

        "./basic-auth": "./middleware/auth.ts",
        "./bearer-auth": "./middleware/auth.ts",
        "./jwt": "./middleware/auth.ts",
        "./jwk": "./middleware/auth.ts",
        "./csrf": "./middleware/security.ts",
        "./secure-headers": "./middleware/security.ts",
        "./ip-restriction": "./middleware/security.ts",
        "./compress": "./middleware/content.ts",
        "./etag": "./middleware/content.ts",
        "./pretty-json": "./middleware/content.ts",
        "./trailing-slash": "./middleware/content.ts",
        "./body-limit": "./middleware/request.ts",
        "./context-storage": "./middleware/request.ts",
        "./logger": "./middleware/request.ts",
        "./request-id": "./middleware/request.ts",
        "./language": "./middleware/request.ts",
        "./powered-by": "./middleware/request.ts",
        "./timeout": "./middleware/timing.ts",
        "./timing": "./middleware/timing.ts",
        "./cache": "./middleware/timing.ts",
        "./method-override": "./middleware/routing.ts",
        "./combine": "./middleware/routing.ts",
        "./serve-static": "./middleware/routing.ts",

        "./css": "./helpers/rendering.ts",
        "./ssg": "./helpers/rendering.ts",
        "./streaming": "./helpers/rendering.ts",
        "./testing": "./helpers/client.ts",
        "./factory": "./helpers/client.ts",
        "./adapter": "./helpers/server.ts",
        "./dev": "./helpers/server.ts",
        "./proxy": "./helpers/server.ts",
        "./route": "./helpers/server.ts",
        "./ws": "./helpers/network.ts",
        "./conninfo": "./helpers/network.ts",
        "./accepts": "./helpers/network.ts"
    },
    "publish": {
        "include": [
            "*.ts",
            "middleware/**/*.ts",
            "helpers/**/*.ts",
            "deno.json",
            "README.md"
        ],
        "exclude": [
            "tests/"
        ]
    },
    "imports": {
        "hono": "npm:hono@^4.11.1",
        "hono/jsx": "npm:hono@^4.11.1/jsx",
        "hono/jsx-runtime": "npm:hono@^4.11.1/jsx/jsx-runtime",
        "hono/jsx-renderer": "npm:hono@^4.11.1/jsx-renderer",
        "hono/deno": "npm:hono@^4.11.1/deno",
        "hono/html": "npm:hono@^4.11.1/html",
        "hono/types": "npm:hono@^4.11.1/types",
        "hono/cookie": "npm:hono@^4.11.1/cookie",
        "hono/cors": "npm:hono@^4.11.1/cors",
        "hono/basic-auth": "npm:hono@^4.11.1/basic-auth",
        "hono/bearer-auth": "npm:hono@^4.11.1/bearer-auth",
        "hono/body-limit": "npm:hono@^4.11.1/body-limit",
        "hono/cache": "npm:hono@^4.11.1/cache",
        "hono/compress": "npm:hono@^4.11.1/compress",
        "hono/context-storage": "npm:hono@^4.11.1/context-storage",
        "hono/csrf": "npm:hono@^4.11.1/csrf",
        "hono/etag": "npm:hono@^4.11.1/etag",
        "hono/jwt": "npm:hono@^4.11.1/jwt",
        "hono/jwk": "npm:hono@^4.11.1/jwk",
        "hono/logger": "npm:hono@^4.11.1/logger",
        "hono/language": "npm:hono@^4.11.1/language",
        "hono/powered-by": "npm:hono@^4.11.1/powered-by",
        "hono/pretty-json": "npm:hono@^4.11.1/pretty-json",
        "hono/request-id": "npm:hono@^4.11.1/request-id",
        "hono/secure-headers": "npm:hono@^4.11.1/secure-headers",
        "hono/timeout": "npm:hono@^4.11.1/timeout",
        "hono/timing": "npm:hono@^4.11.1/timing",
        "hono/method-override": "npm:hono@^4.11.1/method-override",
        "hono/trailing-slash": "npm:hono@^4.11.1/trailing-slash",
        "hono/ip-restriction": "npm:hono@^4.11.1/ip-restriction",
        "hono/combine": "npm:hono@^4.11.1/combine",
        "hono/accepts": "npm:hono@^4.11.1/accepts",
        "hono/adapter": "npm:hono@^4.11.1/adapter",
        "hono/css": "npm:hono@^4.11.1/css",
        "hono/dev": "npm:hono@^4.11.1/dev",
        "hono/factory": "npm:hono@^4.11.1/factory",
        "hono/proxy": "npm:hono@^4.11.1/proxy",
        "hono/route": "npm:hono@^4.11.1/route",
        "hono/ssg": "npm:hono@^4.11.1/ssg",
        "hono/streaming": "npm:hono@^4.11.1/streaming",
        "hono/testing": "npm:hono@^4.11.1/testing",
        "hono/ws": "npm:hono@^4.11.1/ws",
        "hono/conninfo": "npm:hono@^4.11.1/conninfo",
        "hono/validator": "npm:hono@^4.11.1/validator",
        "hono/client": "npm:hono@^4.11.1/client",
        "hono/http-exception": "npm:hono@^4.11.1/http-exception",
        "hono/serve-static": "npm:hono@^4.11.1/serve-static",
        "@hono/zod-validator": "npm:@hono/zod-validator@^0.7.6"
    }
}
```

**Step 3.2: Create individual files for backward compatibility**

File: `/packages/hono/http-exception.ts`

```typescript
export * from 'hono/http-exception'
```

File: `/packages/hono/client.ts`

```typescript
export * from 'hono/client'
```

File: `/packages/hono/validator.ts`

```typescript
export * from 'hono/validator'
```

### Phase 4: Update Documentation

**Step 4.1: Update README.md**

File: `/packages/hono/README.md`

````markdown
# @lockness/hono

Hono bridge for Lockness framework providing centralized Hono dependency
management.

## Installation

```typescript
import { Hono } from '@lockness/hono'
```
````

## Available Exports

### Core

- `@lockness/hono` - Main Hono class
- `@lockness/hono/types` - TypeScript types
- `@lockness/hono/client` - Hono RPC client
- `@lockness/hono/http-exception` - HTTPException class
- `@lockness/hono/validator` - Validator utilities

### Middleware (Organized)

#### Authentication (`@lockness/hono/middleware/auth`)

- `basicAuth` - HTTP Basic Authentication
- `bearerAuth` - Bearer Token Authentication
- `jwt` - JWT Authentication
- `jwk` - JWK Authentication

#### Security (`@lockness/hono/middleware/security`)

- `cors` - CORS handling
- `csrf` - CSRF protection
- `secureHeaders` - Security headers
- `ipRestriction` - IP-based access control

#### Content (`@lockness/hono/middleware/content`)

- `compress` - Response compression
- `etag` - ETag generation
- `prettyJSON` - JSON formatting
- `trailingSlash` - URL normalization

#### Request (`@lockness/hono/middleware/request`)

- `bodyLimit` - Request body size limits
- `contextStorage` - Context storage
- `logger` - Request logging
- `requestId` - Request ID generation
- `language` - Language detection
- `poweredBy` - X-Powered-By header

#### Timing (`@lockness/hono/middleware/timing`)

- `timeout` - Request timeout
- `timing` - Server-Timing header
- `cache` - Response caching

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

#### Server (`@lockness/hono/helpers/server`)

- `adapter` - Runtime adapters
- `dev` - Development utilities
- `proxy` - Proxy helper
- `route` - Route helper

#### Network (`@lockness/hono/helpers/network`)

- `cookie` - Cookie management
- `ws` - WebSocket
- `conninfo` - Connection info
- `accepts` - Content negotiation

### Backward Compatible Exports

All middleware and helpers are also available via their original paths:

```typescript
import { basicAuth } from '@lockness/hono/basic-auth'
import { cors } from '@lockness/hono/cors'
import { ssgParams } from '@lockness/hono/ssg'
```

## Usage Examples

### Organized Imports (Recommended)

```typescript
import { Hono } from '@lockness/hono'
import { basicAuth, jwt } from '@lockness/hono/middleware/auth'
import { cors, csrf } from '@lockness/hono/middleware/security'
import { logger } from '@lockness/hono/middleware/request'
import { html, ssgParams } from '@lockness/hono/helpers/rendering'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())
app.use('/admin/*', basicAuth({ username: 'admin', password: 'secret' }))

app.get('/', (c) =>
    c.html(html`
        <h1>Hello Lockness!</h1>
    `))
```

### Category Import

```typescript
import { Hono } from '@lockness/hono'
import * as auth from '@lockness/hono/middleware/auth'
import * as security from '@lockness/hono/middleware/security'

const app = new Hono()

app.use('*', security.cors())
app.use('/api/*', auth.bearerAuth({ token: 'secret' }))
```

### Legacy Imports (Still Supported)

```typescript
import { Hono } from '@lockness/hono'
import { basicAuth } from '@lockness/hono/basic-auth'
import { cors } from '@lockness/hono/cors'
import { logger } from '@lockness/hono/logger'
```

## Version

Current version: 0.1.21

Based on Hono 4.11.1

````
## 🔄 Migration Guide

### For Existing Users

**No Breaking Changes** ✅

All existing imports continue to work:

```typescript
// ✅ Ces imports fonctionnent toujours
import { Hono } from '@lockness/hono'
import { cors } from '@lockness/hono/cors'
import { html } from '@lockness/hono/html'
import { zValidator } from '@lockness/hono/zod-validator'
````

**Nouveaux Imports Recommandés** (Optionnel)

```typescript
// ✨ Nouveaux imports organisés (recommandé)
import { Hono } from '@lockness/hono'
import { cors, csrf } from '@lockness/hono/middleware/security'
import { css, html } from '@lockness/hono/helpers/rendering'
import { ssgParams } from '@lockness/hono/helpers/rendering' // Maintenant disponible!
```

### Breaking Changes

**No breaking changes** - 100% backward compatible architecture.

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Create `/packages/hono/middleware/` with 6 files + mod.ts
- [ ] Create `/packages/hono/helpers/` with 4 files + mod.ts
- [ ] Update `/packages/hono/deno.json` with new exports
- [ ] Update `/packages/hono/README.md` with complete documentation
- [ ] Add JSDoc comments in all re-export files

### User Documentation (Web Docs)

- [ ] Update `/GEMINI.md` @lockness/hono section
- [ ] Create/update `/app/view/pages/docs/content/packages/hono.md` if exists
- [ ] Add usage examples in web docs

### LLM Documentation

- [ ] Create `/public/llms/lockness-hono.txt` with complete exports list
- [ ] Update `/public/llms/full.txt` with @lockness/hono section

### README Files

- [ ] ✅ `/packages/hono/README.md` - Complete documentation of all exports
- [ ] Update root `/README.md` if necessary
- [ ] Ensure all examples are tested

## 🧪 Testing Strategy

### Manual Testing

- [ ] Test backward compatible imports:
  ```bash
  # Verify old imports still work
  deno eval "import { cors } from '@lockness/hono/cors'; console.log('OK')"
  ```

- [ ] Test new organized imports:
  ```bash
  # Verify new groups
  deno eval "import { cors } from '@lockness/hono/middleware/security'; console.log('OK')"
  deno eval "import { ssgParams } from '@lockness/hono/helpers/rendering'; console.log('OK')"
  ```

- [ ] Test barrel exports:
  ```bash
  deno eval "import * as auth from '@lockness/hono/middleware/auth'; console.log(Object.keys(auth))"
  ```

- [ ] Test in a real lockness app:
  ```typescript
  // app/kernel.tsx
  import { Hono } from '@lockness/hono'
  import { basicAuth } from '@lockness/hono/middleware/auth'
  import { ssgParams } from '@lockness/hono/helpers/rendering'

  const app = new Hono()
  app.use('/admin/*', basicAuth({ username: 'admin', password: 'secret' }))
  // Test that everything compiles and works
  ```

### Type Checking

- [ ] Verify type inference:
  ```bash
  deno check packages/hono/middleware/mod.ts
  deno check packages/hono/helpers/mod.ts
  ```

- [ ] Verify types are correctly exported:
  ```typescript
  import type { BasicAuthOptions } from '@lockness/hono/middleware/auth'
  import type { CorsOptions } from '@lockness/hono/middleware/security'
  ```

## ✅ Definition of Done

- [ ] Folder structure created (middleware/, helpers/)
- [ ] 10 re-export files created (auth, security, content, etc.)
- [ ] 2 mod.ts files (barrel exports)
- [ ] deno.json updated with ~50 exports
- [ ] README.md fully documented with examples
- [ ] Backward compatibility tested (old imports work)
- [ ] New imports tested (organized by category)
- [ ] Type-safety verified (deno check passes)
- [ ] GEMINI.md documentation updated
- [ ] Tested in a real lockness application
- [ ] Version bumped to 0.1.21
- [ ] Published on JSR

## 📊 Metrics

**Before:**

- 13 exposed exports / 69 available (18%)
- 13 individual files
- Flat structure

**After:**

- 69 exposed exports / 69 available (100%)
- 12 organized files (10 category files + 2 barrels)
- Clear hierarchical structure
- 100% backward compatible

## 🎯 Success Criteria

1. ✅ All Hono exports accessible via @lockness/hono
2. ✅ Organized and maintainable structure
3. ✅ Total backward compatibility
4. ✅ Complete documentation
5. ✅ Type-safety preserved
