# Technical Task: Create Inertia.js Adapter Package (@lockness/inertia)

## 📋 Task Overview

Create a new package `@lockness/inertia` that provides full Inertia.js protocol
support for the Lockness framework. This adapter enables developers to build
modern single-page applications (SPAs) using classic server-side routing
patterns—the "Monolith" approach popularized by Laravel + Inertia.

**Framework Philosophy:**

This package embodies Lockness's principle of **providing powerful primitives
that empower developers**. Rather than forcing a specific frontend framework, we
provide the protocol layer that works with React, Vue, Svelte, or any Inertia.js
client adapter. The framework handles the server-side protocol; users bring
their own frontend stack.

**What We're Building:**

- A **middleware** that handles the Inertia protocol (asset versioning, redirect
  handling, context injection)
- A **renderer class** (`Inertia`) that constructs proper responses (JSON for
  AJAX, HTML for first load)
- **Shared props** system for global data (auth user, flash messages, etc.)
- **Configurable root view** for HTML shell customization

**Key Benefits for Framework Users:**

- Build SPAs without client-side routing complexity
- Use server-side controllers for all navigation logic
- Leverage existing Lockness features (auth, validation, sessions) seamlessly
- Progressive enhancement—works without JavaScript on first load

## 🎯 Objectives

1. **Primary Objective**: Implement the complete Inertia.js server-side protocol
2. **Middleware Layer**: Create middleware for version checking, redirect
   handling, and context injection
3. **Renderer Service**: Build the `Inertia` class with `render()` and `share()`
   methods
4. **Type Safety**: Provide full TypeScript types for all public APIs
5. **Documentation Objective**: Document the package with examples for React/Vue
   integration

> 💡 **Development Phase**: This framework is not yet published. We prioritize
> clean architecture over backward compatibility with any existing patterns.

## 📁 Affected File Paths

### New Package Structure

```
packages/inertia/
├── deno.json              # Package manifest
├── mod.ts                 # Public exports
├── README.md              # Package documentation
├── middleware.ts          # InertiaMiddleware
├── inertia.ts             # Inertia renderer class
├── types.ts               # Type definitions
├── helpers.ts             # Utility functions
└── tests/
    ├── middleware.test.ts
    ├── inertia.test.ts
    └── integration.test.ts
```

### Core Files to Create

- `/packages/inertia/deno.json` - Package manifest with dependencies
- `/packages/inertia/mod.ts` - Public API exports
- `/packages/inertia/types.ts` - TypeScript type definitions
- `/packages/inertia/middleware.ts` - Inertia protocol middleware
- `/packages/inertia/inertia.ts` - Main Inertia renderer class
- `/packages/inertia/helpers.ts` - Utility functions (HTML escaping, etc.)

### Test Files

- `/packages/inertia/tests/middleware.test.ts` - Middleware unit tests
- `/packages/inertia/tests/inertia.test.ts` - Renderer unit tests
- `/packages/inertia/tests/integration.test.ts` - Full protocol integration
  tests

### Documentation Files to Create/Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/packages/inertia/README.md` - Full package documentation with examples
- `/GEMINI.md` - Add Inertia package to framework overview

#### User Documentation (Web)

- `/app/view/pages/docs/content/inertia.md` - User-facing Inertia guide

#### LLM Documentation

- `/public/llms/inertia.txt` - LLM-optimized Inertia documentation
- `/public/llms/full.txt` - Update with Inertia section

## 🏗️ Architecture Principles

### Inertia.js Protocol Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser Request                                                 │
│  ├── First Load (no X-Inertia header) → Full HTML Response     │
│  └── Inertia Request (X-Inertia: true) → JSON Response         │
├─────────────────────────────────────────────────────────────────┤
│  InertiaMiddleware                                               │
│  ├── Check X-Inertia-Version → 409 Conflict if mismatch        │
│  ├── Intercept redirects → Convert 302 to 303 for PUT/PATCH    │
│  └── Inject Inertia instance into Context                       │
├─────────────────────────────────────────────────────────────────┤
│  Controller                                                      │
│  └── return inertia.render('Dashboard', { user })               │
├─────────────────────────────────────────────────────────────────┤
│  Inertia Renderer                                                │
│  ├── Build page object: { component, props, url, version }     │
│  ├── X-Inertia request → JSON response                          │
│  └── Standard request → HTML with data-page attribute           │
└─────────────────────────────────────────────────────────────────┘
```

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Middleware**: Handles protocol concerns (versioning, redirects, context
  injection)
- **Inertia Class**: Handles response rendering (JSON/HTML construction)
- **Helpers**: Handle utility functions (HTML escaping, serialization)

```typescript
// Middleware: Protocol concerns only
export const inertiaMiddleware = (config: InertiaConfig) => {
    return async (c: Context, next: Next) => {
        // Version check, redirect handling, context setup
    }
}

// Inertia Class: Rendering concerns only
export class Inertia {
    render(component: string, props: Props): Response
    share(props: Props): void
}
```

**2. Open/Closed Principle (OCP)**

- **Root View**: Users provide their own HTML template via configuration
- **Props Resolution**: Props can be lazy (functions) for deferred evaluation
- **Version Strategy**: Configurable version function (file hash, build ID,
  etc.)

```typescript
// Users extend via configuration, not code changes
const middleware = inertiaMiddleware({
    version: () => getAssetHash(),
    rootView: (page) => renderToString(<App page={page} />),
})
```

**3. Interface Segregation Principle (ISP)**

- **InertiaConfig**: Minimal configuration interface
- **PageObject**: Clean interface for page data
- **Props**: Flexible type for component props

```typescript
interface InertiaConfig {
    version?: string | (() => string)
    rootView?: RootViewRenderer
}

interface PageObject {
    component: string
    props: Record<string, unknown>
    url: string
    version: string
}
```

**4. Dependency Inversion Principle (DIP)**

- Inertia depends on `Context` abstraction from Hono
- Root view rendering is injected, not hardcoded
- Version resolution is configurable

### DRY Principle (Don't Repeat Yourself)

**Shared Logic:**

- Page object construction is centralized in Inertia class
- Response headers are set once in a helper
- HTML escaping is handled by a single utility function

**Reusable Patterns:**

- Middleware follows Lockness middleware conventions
- Types follow framework type patterns
- Tests follow framework test patterns

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User Application Layer                  │  ← Controllers using inertia.render()
├─────────────────────────────────────────┤
│  Inertia Package Layer                   │  ← @lockness/inertia middleware + class
├─────────────────────────────────────────┤
│  Lockness Core Layer                     │  ← @lockness/core Context, middleware
├─────────────────────────────────────────┤
│  HonoJS Foundation                       │  ← Request/Response primitives
└─────────────────────────────────────────┘
```

**Key Constraints:**

- Middleware must be non-blocking for non-Inertia requests
- JSON responses must follow Inertia protocol exactly
- HTML responses must work without JavaScript (data-page attribute)
- Version mismatch must trigger 409 with X-Inertia-Location header

## 🎨 Proposed API Design

### Target User-Facing API (Simple Version)

```typescript
// kernel.tsx
import { App } from '@lockness/core'
import { inertiaMiddleware } from '@lockness/inertia'

const app = new App()

app.useMiddleware(
    inertiaMiddleware({
        version: '1.0.0',
    }),
)

await app.init({
    controllersDir: './app/controller',
    staticDir: 'public',
})

app.listen(3000)
```

```typescript
// app/controller/dashboard_controller.tsx
import { type Context, Controller, Get } from '@lockness/core'

@Controller('/')
export class DashboardController {
    @Get('/dashboard')
    async show(c: Context) {
        const inertia = c.get('inertia')

        return inertia.render('Dashboard', {
            user: await getCurrentUser(c),
            stats: await getDashboardStats(),
        })
    }
}
```

### Target User-Facing API (Advanced Version)

```typescript
// kernel.tsx
import { App } from '@lockness/core'
import { type InertiaConfig, inertiaMiddleware } from '@lockness/inertia'
import { renderToString } from 'react-dom/server'
import { App as ReactApp } from './app/view/App.tsx'

const inertiaConfig: InertiaConfig = {
    // Dynamic version based on build hash
    version: () => Deno.env.get('BUILD_HASH') ?? '1.0.0',

    // Custom root view with React SSR
    rootView: (page) => {
        const appHtml = renderToString(<ReactApp initialPage={page} />)
        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>${page.props.title ?? 'My App'}</title>
                    <link rel="stylesheet" href="/css/app.css" />
                </head>
                <body>
                    <div id="app" data-page='${
            JSON.stringify(page)
        }'>${appHtml}</div>
                    <script type="module" src="/js/app.js"></script>
                </body>
            </html>
        `
    },
}

const app = new App()

app.useMiddleware(
    inertiaMiddleware(inertiaConfig),
)

// Share global props (available in all responses)
app.useMiddleware(async (c, next) => {
    const inertia = c.get('inertia')

    inertia.share({
        auth: {
            user: await getCurrentUser(c),
        },
        flash: c.get('session')?.flash ?? {},
    })

    return next()
})

await app.init({/* ... */})
```

### Controller Examples

```typescript
// Simple render
@Get('/users')
async index(c: Context) {
    const inertia = c.get('inertia')
    
    return inertia.render('Users/Index', {
        users: await this.userService.findAll(),
    })
}

// With lazy props (resolved only when needed)
@Get('/users/:id')
async show(c: Context) {
    const inertia = c.get('inertia')
    const id = c.req.param('id')
    
    return inertia.render('Users/Show', {
        user: await this.userService.findById(id),
        // Lazy prop - only resolved if component requests it
        activity: () => this.activityService.getRecent(id),
    })
}

// Redirect after form submission
@Post('/users')
async store(c: Context) {
    const data = await c.req.json()
    await this.userService.create(data)
    
    // Inertia middleware converts this to 303 for PUT/PATCH/DELETE
    return c.redirect('/users')
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Package Setup

**Step 1.1: Create Package Manifest**

File: `/packages/inertia/deno.json`

```json
{
    "name": "@lockness/inertia",
    "version": "0.1.0",
    "exports": "./mod.ts",
    "imports": {
        "hono": "jsr:@hono/hono@^4.7.4"
    }
}
```

**Step 1.2: Create Type Definitions**

File: `/packages/inertia/types.ts`

````typescript
import type { Context, Next } from 'hono'

/**
 * Configuration options for the Inertia middleware.
 *
 * @example
 * ```typescript
 * const config: InertiaConfig = {
 *     version: '1.0.0',
 *     rootView: (page) => `<html>...</html>`,
 * }
 * ```
 */
export interface InertiaConfig {
    /**
     * The current asset version.
     * Can be a static string or a function that returns the version.
     * Used for cache busting—if client version differs, a full reload is triggered.
     *
     * @default '1.0'
     * @example '1.0.0'
     * @example () => Deno.env.get('BUILD_HASH')
     */
    readonly version?: string | (() => string)

    /**
     * Custom root view renderer.
     * Receives the page object and returns the full HTML document.
     * If not provided, a default HTML template is used.
     *
     * @param page - The Inertia page object
     * @returns Full HTML document as string
     *
     * @example
     * ```typescript
     * rootView: (page) => `
     *     <!DOCTYPE html>
     *     <html>
     *         <body>
     *             <div id="app" data-page='${JSON.stringify(page)}'></div>
     *             <script src="/app.js"></script>
     *         </body>
     *     </html>
     * `
     * ```
     */
    readonly rootView?: RootViewRenderer
}

/**
 * Function type for rendering the root HTML view.
 */
export type RootViewRenderer = (page: PageObject) => string | Promise<string>

/**
 * The Inertia page object sent to the client.
 * Contains all data needed to render the page component.
 */
export interface PageObject {
    /**
     * The name of the page component to render.
     * @example 'Dashboard'
     * @example 'Users/Index'
     */
    readonly component: string

    /**
     * Props passed to the page component.
     * Includes both page-specific and shared props.
     */
    readonly props: Record<string, unknown>

    /**
     * The current request URL.
     * Used by the client for navigation state.
     */
    readonly url: string

    /**
     * The current asset version.
     * Used for cache invalidation.
     */
    readonly version: string
}

/**
 * Props that can be passed to inertia.render().
 * Values can be raw data or lazy functions.
 */
export type InertiaProps = Record<
    string,
    unknown | (() => unknown) | (() => Promise<unknown>)
>

/**
 * Inertia context key for type-safe context access.
 */
export interface InertiaContextVariables {
    inertia: Inertia
}
````

### Phase 2: Middleware Implementation

**Step 2.1: Create Inertia Middleware**

File: `/packages/inertia/middleware.ts`

````typescript
import type { Context, MiddlewareHandler, Next } from 'hono'
import type { InertiaConfig } from './types.ts'
import { Inertia } from './inertia.ts'

/**
 * Creates the Inertia.js middleware for handling the Inertia protocol.
 *
 * This middleware:
 * 1. Checks asset version and returns 409 if mismatched
 * 2. Converts 302 redirects to 303 for PUT/PATCH/DELETE requests
 * 3. Injects an Inertia instance into the context
 *
 * @param config - Inertia configuration options
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * import { inertiaMiddleware } from '@lockness/inertia'
 *
 * app.useMiddleware(
 *     inertiaMiddleware({
 *         version: '1.0.0',
 *     }),
 * )
 * ```
 */
export function inertiaMiddleware(
    config: InertiaConfig = {},
): MiddlewareHandler {
    return async (c: Context, next: Next) => {
        // Resolve current version
        const currentVersion = resolveVersion(config.version)

        // Create Inertia instance and inject into context
        const inertia = new Inertia(c, {
            version: currentVersion,
            rootView: config.rootView,
        })
        c.set('inertia', inertia)

        // Check for version mismatch on Inertia requests
        const clientVersion = c.req.header('X-Inertia-Version')
        if (
            isInertiaRequest(c) && clientVersion &&
            clientVersion !== currentVersion
        ) {
            // Force full page reload via 409 Conflict
            c.header('X-Inertia-Location', c.req.url)
            return c.body(null, 409)
        }

        // Continue to next middleware/controller
        await next()

        // Handle redirect responses for PUT/PATCH/DELETE
        const method = c.req.method
        const status = c.res.status

        if (['PUT', 'PATCH', 'DELETE'].includes(method) && status === 302) {
            // Convert 302 to 303 (See Other) as required by Inertia protocol
            const location = c.res.headers.get('Location')
            if (location) {
                return c.redirect(location, 303)
            }
        }
    }
}

/**
 * Check if the current request is an Inertia request.
 */
function isInertiaRequest(c: Context): boolean {
    return c.req.header('X-Inertia') === 'true'
}

/**
 * Resolve the version from config (string or function).
 */
function resolveVersion(version: InertiaConfig['version']): string {
    if (typeof version === 'function') {
        return version()
    }
    return version ?? '1.0'
}
````

### Phase 3: Inertia Renderer Implementation

**Step 3.1: Create Inertia Class**

File: `/packages/inertia/inertia.ts`

````typescript
import type { Context } from 'hono'
import type { InertiaProps, PageObject, RootViewRenderer } from './types.ts'
import { defaultRootView, escapeHtml } from './helpers.ts'

/**
 * Internal configuration for Inertia instance.
 */
interface InertiaOptions {
    readonly version: string
    readonly rootView?: RootViewRenderer
}

/**
 * The Inertia renderer class.
 *
 * Handles rendering Inertia responses as either JSON (for Inertia requests)
 * or HTML (for initial page loads).
 *
 * @example
 * ```typescript
 * // In a controller
 * const inertia = c.get('inertia')
 *
 * return inertia.render('Dashboard', {
 *     user: await getUser(),
 *     stats: await getStats(),
 * })
 * ```
 */
export class Inertia {
    private readonly context: Context
    private readonly version: string
    private readonly rootView: RootViewRenderer
    private sharedProps: Record<string, unknown> = {}

    constructor(context: Context, options: InertiaOptions) {
        this.context = context
        this.version = options.version
        this.rootView = options.rootView ?? defaultRootView
    }

    /**
     * Share props that will be merged into every render response.
     *
     * Useful for global data like authenticated user, flash messages, etc.
     *
     * @param props - Props to share globally
     *
     * @example
     * ```typescript
     * inertia.share({
     *     auth: { user: await getCurrentUser() },
     *     flash: session.flash,
     * })
     * ```
     */
    share(props: Record<string, unknown>): void {
        this.sharedProps = { ...this.sharedProps, ...props }
    }

    /**
     * Render an Inertia response.
     *
     * Returns JSON for Inertia requests (AJAX) or HTML for initial page loads.
     *
     * @param component - The name of the page component to render
     * @param props - Props to pass to the component
     * @returns Response object
     *
     * @example
     * ```typescript
     * return inertia.render('Users/Index', {
     *     users: await userService.findAll(),
     *     filters: { search: query },
     * })
     * ```
     */
    async render(
        component: string,
        props: InertiaProps = {},
    ): Promise<Response> {
        // Resolve lazy props
        const resolvedProps = await this.resolveProps(props)

        // Build page object
        const page: PageObject = {
            component,
            props: { ...this.sharedProps, ...resolvedProps },
            url: this.context.req.url,
            version: this.version,
        }

        // Handle Inertia request (JSON response)
        if (this.isInertiaRequest()) {
            this.context.header('X-Inertia', 'true')
            this.context.header('Vary', 'Accept')
            return this.context.json(page)
        }

        // Handle initial page load (HTML response)
        const html = await this.rootView(page)
        return this.context.html(html)
    }

    /**
     * Check if the current request is an Inertia request.
     */
    private isInertiaRequest(): boolean {
        return this.context.req.header('X-Inertia') === 'true'
    }

    /**
     * Resolve lazy props (functions) to their values.
     */
    private async resolveProps(
        props: InertiaProps,
    ): Promise<Record<string, unknown>> {
        const resolved: Record<string, unknown> = {}

        for (const [key, value] of Object.entries(props)) {
            if (typeof value === 'function') {
                resolved[key] = await value()
            } else {
                resolved[key] = value
            }
        }

        return resolved
    }
}
````

**Step 3.2: Create Helper Functions**

File: `/packages/inertia/helpers.ts`

```typescript
import type { PageObject } from './types.ts'

/**
 * Escape HTML special characters in a string.
 * Prevents XSS when embedding JSON in HTML attributes.
 *
 * @param str - String to escape
 * @returns Escaped string safe for HTML attribute embedding
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

/**
 * Safely serialize page object to JSON for HTML embedding.
 * Escapes HTML entities to prevent XSS.
 *
 * @param page - Page object to serialize
 * @returns Safe JSON string for data-page attribute
 */
export function serializePageForHtml(page: PageObject): string {
    return escapeHtml(JSON.stringify(page))
}

/**
 * Default root view template.
 * Provides a minimal HTML shell when no custom rootView is configured.
 *
 * @param page - The Inertia page object
 * @returns HTML string
 */
export function defaultRootView(page: PageObject): string {
    const pageJson = serializePageForHtml(page)

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lockness App</title>
</head>
<body>
    <div id="app" data-page="${pageJson}"></div>
    <script type="module" src="/js/app.js"></script>
</body>
</html>`
}
```

**Step 3.3: Create Public Exports**

File: `/packages/inertia/mod.ts`

````typescript
/**
 * @fileoverview Inertia.js adapter for the Lockness framework.
 *
 * Provides middleware and utilities for building modern SPAs
 * with server-side routing using the Inertia.js protocol.
 *
 * @module @lockness/inertia
 *
 * @example
 * ```typescript
 * import { inertiaMiddleware } from '@lockness/inertia'
 *
 * app.useMiddleware(inertiaMiddleware({ version: '1.0.0' }))
 * ```
 */

export { inertiaMiddleware } from './middleware.ts'
export { Inertia } from './inertia.ts'
export { defaultRootView, escapeHtml, serializePageForHtml } from './helpers.ts'

export type {
    InertiaConfig,
    InertiaContextVariables,
    InertiaProps,
    PageObject,
    RootViewRenderer,
} from './types.ts'
````

### Phase 4: Testing

**Step 4.1: Middleware Unit Tests**

File: `/packages/inertia/tests/middleware.test.ts`

```typescript
import { assertEquals } from '@std/assert'
import { Hono } from 'hono'
import { inertiaMiddleware } from '../middleware.ts'

Deno.test('inertiaMiddleware - injects Inertia instance into context', async () => {
    const app = new Hono()
    let inertiaInstance: unknown = null

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        inertiaInstance = c.get('inertia')
        return c.text('ok')
    })

    await app.fetch(new Request('http://localhost/test'))

    assertEquals(inertiaInstance !== null, true)
})

Deno.test('inertiaMiddleware - returns 409 on version mismatch', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '2.0' }))
    app.get('/test', (c) => c.text('ok'))

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0', // Mismatch!
            },
        }),
    )

    assertEquals(res.status, 409)
    assertEquals(res.headers.get('X-Inertia-Location'), 'http://localhost/test')
})

Deno.test('inertiaMiddleware - passes through when versions match', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => c.text('ok'))

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    assertEquals(res.status, 200)
})

Deno.test('inertiaMiddleware - converts 302 to 303 for PUT requests', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.put('/test', (c) => c.redirect('/other', 302))

    const res = await app.fetch(
        new Request('http://localhost/test', {
            method: 'PUT',
            headers: { 'X-Inertia': 'true' },
        }),
    )

    assertEquals(res.status, 303)
})

Deno.test('inertiaMiddleware - resolves version from function', async () => {
    const app = new Hono()
    let versionCalled = false

    app.use(inertiaMiddleware({
        version: () => {
            versionCalled = true
            return 'dynamic-version'
        },
    }))
    app.get('/test', (c) => c.text('ok'))

    await app.fetch(new Request('http://localhost/test'))

    assertEquals(versionCalled, true)
})
```

**Step 4.2: Inertia Class Unit Tests**

File: `/packages/inertia/tests/inertia.test.ts`

```typescript
import { assertEquals, assertStringIncludes } from '@std/assert'
import { Hono } from 'hono'
import { inertiaMiddleware } from '../middleware.ts'

Deno.test('Inertia.render - returns JSON for Inertia requests', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('TestComponent', { message: 'Hello' })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: { 'X-Inertia': 'true' },
        }),
    )

    assertEquals(res.headers.get('Content-Type'), 'application/json')
    assertEquals(res.headers.get('X-Inertia'), 'true')

    const json = await res.json()
    assertEquals(json.component, 'TestComponent')
    assertEquals(json.props.message, 'Hello')
    assertEquals(json.version, '1.0')
})

Deno.test('Inertia.render - returns HTML for initial page load', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('TestComponent', { message: 'Hello' })
    })

    const res = await app.fetch(new Request('http://localhost/test'))

    assertStringIncludes(res.headers.get('Content-Type') ?? '', 'text/html')

    const html = await res.text()
    assertStringIncludes(html, '<!DOCTYPE html>')
    assertStringIncludes(html, 'data-page=')
    assertStringIncludes(html, 'TestComponent')
})

Deno.test('Inertia.share - merges shared props into all renders', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.use(async (c, next) => {
        const inertia = c.get('inertia')
        inertia.share({ auth: { user: 'John' } })
        return next()
    })
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('TestComponent', { message: 'Hello' })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: { 'X-Inertia': 'true' },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.auth.user, 'John')
    assertEquals(json.props.message, 'Hello')
})

Deno.test('Inertia.render - resolves lazy props', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('TestComponent', {
            eager: 'immediate',
            lazy: () => 'resolved',
            asyncLazy: async () => 'async-resolved',
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: { 'X-Inertia': 'true' },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.eager, 'immediate')
    assertEquals(json.props.lazy, 'resolved')
    assertEquals(json.props.asyncLazy, 'async-resolved')
})

Deno.test('Inertia.render - uses custom rootView', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({
        version: '1.0',
        rootView: (page) => `<custom>${page.component}</custom>`,
    }))
    app.get('/test', (c) => {
        const inertia = c.get('inertia')
        return inertia.render('MyPage', {})
    })

    const res = await app.fetch(new Request('http://localhost/test'))

    const html = await res.text()
    assertEquals(html, '<custom>MyPage</custom>')
})
```

**Step 4.3: Helper Unit Tests**

File: `/packages/inertia/tests/helpers.test.ts`

```typescript
import { assertEquals } from '@std/assert'
import { escapeHtml, serializePageForHtml } from '../helpers.ts'

Deno.test('escapeHtml - escapes HTML special characters', () => {
    assertEquals(escapeHtml('<script>'), '&lt;script&gt;')
    assertEquals(escapeHtml('"test"'), '&quot;test&quot;')
    assertEquals(escapeHtml("'test'"), '&#039;test&#039;')
    assertEquals(escapeHtml('a & b'), 'a &amp; b')
})

Deno.test('serializePageForHtml - produces safe JSON for HTML attribute', () => {
    const page = {
        component: 'Test',
        props: { html: '<script>alert("xss")</script>' },
        url: '/test',
        version: '1.0',
    }

    const result = serializePageForHtml(page)

    // Should not contain unescaped < or >
    assertEquals(result.includes('<script>'), false)
    assertEquals(result.includes('</script>'), false)
})
```

## 🔄 API Examples

### Basic Setup

```typescript
import { App } from '@lockness/core'
import { inertiaMiddleware } from '@lockness/inertia'

const app = new App()

app.useMiddleware(inertiaMiddleware({ version: '1.0' }))

await app.init({ controllersDir: './app/controller' })
app.listen(3000)
```

### With React SSR

```typescript
import { App } from '@lockness/core'
import { inertiaMiddleware } from '@lockness/inertia'
import { renderToString } from 'react-dom/server'

const app = new App()

app.useMiddleware(inertiaMiddleware({
    version: Deno.env.get('BUILD_HASH') ?? '1.0',
    rootView: (page) => {
        const appHtml = renderToString(<App initialPage={page} />)
        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>${page.props.title ?? 'App'}</title>
                    <script type="module" src="/assets/app.js"></script>
                </head>
                <body>
                    <div id="app" data-page='${
            JSON.stringify(page)
        }'>${appHtml}</div>
                </body>
            </html>
        `
    },
}))

await app.init({ controllersDir: './app/controller' })
app.listen(3000)
```

### Controller Usage

```typescript
@Controller('/dashboard')
class DashboardController {
    @Inject(UserService)
    accessor userService!: UserService

    @Get('/')
    async index(c: Context) {
        const inertia = c.get('inertia')

        return inertia.render('Dashboard/Index', {
            user: await this.userService.current(c),
            stats: await this.getStats(),
        })
    }

    @Post('/settings')
    async updateSettings(c: Context) {
        const data = await c.req.json()
        await this.userService.updateSettings(data)

        // Inertia will handle the redirect properly
        return c.redirect('/dashboard')
    }
}
```

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Create `/packages/inertia/README.md` with full API documentation
- [ ] Update `/GEMINI.md` with Inertia package reference
- [ ] Add JSDoc comments to all public APIs

### User Documentation (Web Docs)

- [ ] Create `/app/view/pages/docs/content/inertia.md`
- [ ] Include React, Vue, and Svelte setup examples
- [ ] Add troubleshooting section

### LLM Documentation

- [ ] Create `/public/llms/inertia.txt`
- [ ] Update `/public/llms/full.txt` with Inertia section

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test middleware version checking
- [ ] Test middleware redirect conversion (302 → 303)
- [ ] Test Inertia instance injection
- [ ] Test JSON response for Inertia requests
- [ ] Test HTML response for initial loads
- [ ] Test shared props merging
- [ ] Test lazy props resolution
- [ ] Test custom rootView rendering
- [ ] Test HTML escaping

### Integration Tests

- [ ] Test full request lifecycle
- [ ] Test with actual Hono app
- [ ] Test controller integration

### Manual Testing

- [ ] Test with React Inertia client
- [ ] Test with Vue Inertia client
- [ ] Test browser navigation (back/forward)
- [ ] Test form submissions

## 🔍 Quality Checks

```bash
# Type check
deno check packages/inertia/**/*.ts

# Lint
deno lint packages/inertia/

# Run tests
deno test packages/inertia/tests/
```

**Before marking task complete:**

- ✅ `deno check` passes on all files
- ✅ `deno lint` passes on all files
- ✅ `deno test` passes with 100% success rate

## ✅ Definition of Done

- [ ] Package manifest created (`deno.json`)
- [ ] Type definitions complete (`types.ts`)
- [ ] `inertiaMiddleware` implemented and tested
- [ ] `Inertia` class implemented with `render()` and `share()`
- [ ] Helper functions implemented (`escapeHtml`, `defaultRootView`)
- [ ] All types exported from `mod.ts`
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] JSDoc documentation complete
- [ ] Package README created
- [ ] User documentation created
- [ ] `deno check` passes
- [ ] `deno lint` passes
- [ ] Manual testing with Inertia client completed

## 🔗 Related Tasks

- Core middleware system (`/packages/core/middleware_resolver.ts`)
- Session package for flash messages (`/packages/session/`)
- Validator package for form validation (`/packages/validator/`)

## 📅 Timeline

- **Estimated Effort**: 8-12 hours
- **Complexity**: Medium-High

## 📝 Notes

### Design Decisions

1. **Middleware + Class separation**: Middleware handles protocol, class handles
   rendering
2. **Lazy props**: Deferred execution for expensive operations
3. **Configurable rootView**: Framework doesn't impose frontend choices
4. **Default version**: Falls back to '1.0' for simplicity

### Inertia Protocol References

- [Inertia.js Protocol](https://inertiajs.com/the-protocol)
- [Server-side Adapters](https://inertiajs.com/server-side-setup)

### Security Considerations

- HTML escaping for data-page attribute (XSS prevention)
- Version header validation
- Safe JSON serialization

### Future Enhancements

- Partial reloads (`X-Inertia-Partial-Data`)
- Error handling integration
- SSR with streaming
- Prefetching support

---

_Task created: 2025-01-20_
