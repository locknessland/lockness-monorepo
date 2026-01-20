# Technical Task: Create Inertia.js Adapter Package (@lockness/inertia)

## 📋 Task Overview

Create a new package `@lockness/inertia` that provides full Inertia.js protocol
support for the Lockness framework. This adapter enables developers to build
modern single-page applications (SPAs) using classic server-side routing
patterns—the "Monolith" approach where server-side routing drives a modern
JavaScript frontend.

> ⚠️ **Framework in Active Development**: Lockness is currently in active
> development and has not yet reached production status. We accept breaking
> changes freely to achieve the best possible API design. Do not hesitate to
> refactor or redesign components if it improves the developer experience.

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

> 💡 **Development Phase**: Lockness is not yet published and is in active
> development. We prioritize **clean architecture and optimal API design** over
> backward compatibility. Breaking changes are fully acceptable—feel free to
> refactor existing code, rename APIs, or restructure packages if it leads to a
> better developer experience.

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

### SOLID Principles

| Principle | Application |
| --------- | ----------- |
| **SRP** | Middleware: protocol • Inertia class: rendering • Helpers: utilities |
| **OCP** | Root view, version strategy, and props are configurable |
| **ISP** | Minimal interfaces: `InertiaConfig`, `PageObject`, `InertiaProps` |
| **DIP** | Depends on Hono `Context` abstraction; root view is injectable |
| **DRY** | Page object construction, headers, HTML escaping centralized |

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

---

## 🚀 Step-by-Step Implementation Guide

This section provides a **precise, sequential implementation plan** designed for
AI assistants (GitHub Copilot, Claude, etc.) to execute step-by-step. Each step
is atomic and should be completed before moving to the next.

> 💡 **Instructions for AI Assistants**: Execute each step in order. Mark the
> checkbox when complete. Do not skip steps. If a step fails, debug before
> proceeding.

---

### 📦 STEP 1: Create Package Directory Structure

**Goal**: Set up the package folder and manifest file.

- [ ] **1.1** Create directory `/packages/inertia/`
- [ ] **1.2** Create directory `/packages/inertia/tests/`
- [ ] **1.3** Create file `/packages/inertia/deno.json` with content:

```json
{
    "name": "@lockness/inertia",
    "version": "0.1.26",
    "license": "MIT",
    "exports": "./mod.ts",
    "publish": {
        "include": [
            "*.ts",
            "deno.json",
            "README.md"
        ],
        "exclude": [
            "tests/"
        ]
    },
    "tasks": {
        "test": "deno test -A tests/",
        "test:watch": "deno test -A --watch tests/"
    },
    "imports": {
        "@std/assert": "jsr:@std/assert@1",
        "hono": "jsr:@lockness/hono@^0.1.26"
    },
    "description": "Inertia.js server-side adapter for building modern SPAs with server-side routing"
}
```

**Verification**: Run `deno check packages/inertia/deno.json` (should not error)

---

### 📝 STEP 2: Create Type Definitions

**Goal**: Define all TypeScript types for the package.

- [ ] **2.1** Create file `/packages/inertia/types.ts`
- [ ] **2.2** Add `InertiaConfig` interface:

```typescript
import type { Context } from 'hono'

/**
 * Configuration options for the Inertia middleware.
 */
export interface InertiaConfig {
    /**
     * The current asset version.
     * Can be a static string or a function that returns the version.
     */
    readonly version?: string | (() => string)

    /**
     * Custom root view renderer.
     * Called for initial page loads to generate the full HTML document.
     */
    readonly rootView?: RootViewRenderer
}
```

- [ ] **2.3** Add `RootViewRenderer` type:

```typescript
/**
 * Function type for rendering the root HTML view.
 */
export type RootViewRenderer = (page: PageObject) => string | Promise<string>
```

- [ ] **2.4** Add `PageObject` interface:

```typescript
/**
 * The Inertia page object sent to the client.
 * @see https://inertiajs.com/the-protocol#the-page-object
 */
export interface PageObject {
    /** The name of the JavaScript page component to render. */
    readonly component: string

    /** Props passed to the page component. Always includes errors. */
    readonly props: Record<string, unknown> & {
        errors?: Record<string, string>
    }

    /** The current page URL. */
    readonly url: string

    /** The current asset version. */
    readonly version: string

    /** Whether to encrypt the current page's history state. */
    readonly encryptHistory?: boolean

    /** Whether to clear any encrypted history state. */
    readonly clearHistory?: boolean
}
```

- [ ] **2.5** Add `InertiaProps` and `RenderOptions` types:

```typescript
/**
 * Props that can be passed to inertia.render().
 * Values can be raw data, lazy functions, or async lazy functions.
 */
export type InertiaProps = Record<
    string,
    unknown | (() => unknown) | (() => Promise<unknown>)
>

/**
 * Options for the render() method.
 */
export interface RenderOptions {
    /** Whether to encrypt the page's history state. */
    readonly encryptHistory?: boolean

    /** Whether to clear encrypted history state. */
    readonly clearHistory?: boolean
}
```

- [ ] **2.6** Add `InertiaContextVariables` interface:

```typescript
// Forward declaration (will be implemented in inertia.ts)
import type { Inertia } from './inertia.ts'

/**
 * Inertia context key for type-safe context access.
 */
export interface InertiaContextVariables {
    inertia: Inertia
}
```

**Verification**: Run `deno check packages/inertia/types.ts`

---

### 🔧 STEP 3: Create Helper Functions

**Goal**: Implement utility functions for HTML escaping and serialization.

- [ ] **3.1** Create file `/packages/inertia/helpers.ts`
- [ ] **3.2** Add `escapeHtml` function:

```typescript
import type { PageObject } from './types.ts'

/**
 * Escape HTML special characters in a string.
 * Prevents XSS when embedding JSON in HTML attributes.
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
```

- [ ] **3.3** Add `serializePageForHtml` function:

```typescript
/**
 * Safely serialize page object to JSON for HTML embedding.
 */
export function serializePageForHtml(page: PageObject): string {
    return escapeHtml(JSON.stringify(page))
}
```

- [ ] **3.4** Add `defaultRootView` function:

```typescript
/**
 * Default root view template.
 * Provides a minimal HTML shell when no custom rootView is configured.
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

**Verification**: Run `deno check packages/inertia/helpers.ts`

---

### 🎨 STEP 4: Create Inertia Renderer Class

**Goal**: Implement the main `Inertia` class with `render()` and `share()`
methods.

- [ ] **4.1** Create file `/packages/inertia/inertia.ts`
- [ ] **4.2** Add imports and internal types:

```typescript
import type { Context } from 'hono'
import type {
    InertiaProps,
    PageObject,
    RenderOptions,
    RootViewRenderer,
} from './types.ts'
import { defaultRootView } from './helpers.ts'

/**
 * Internal configuration for Inertia instance.
 */
interface InertiaOptions {
    readonly version: string
    readonly rootView?: RootViewRenderer
}
```

- [ ] **4.3** Add `Inertia` class skeleton:

```typescript
/**
 * The Inertia renderer class.
 * Handles rendering Inertia responses as either JSON or HTML.
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
}
```

- [ ] **4.4** Add `share()` method:

```typescript
/**
 * Share props that will be merged into every render response.
 */
share(props: Record<string, unknown>): void {
    this.sharedProps = { ...this.sharedProps, ...props }
}
```

- [ ] **4.5** Add `isInertiaRequest()` private method:

```typescript
/**
 * Check if the current request is an Inertia request.
 */
private isInertiaRequest(): boolean {
    return this.context.req.header('X-Inertia') === 'true'
}
```

- [ ] **4.6** Add `resolveProps()` private method:

```typescript
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
```

- [ ] **4.7** Add `render()` method:

```typescript
    /**
     * Render an Inertia response.
     * Returns JSON for Inertia requests, HTML for initial page loads.
     */
    async render(
        component: string,
        props: InertiaProps = {},
        options: RenderOptions = {},
    ): Promise<Response> {
        // Merge shared props with page props
        const mergedProps = { ...this.sharedProps, ...props }

        // Resolve lazy props
        const resolvedProps = await this.resolveProps(mergedProps)

        // Ensure errors object exists (Inertia protocol requirement)
        if (!resolvedProps.errors) {
            resolvedProps.errors = {}
        }

        // Build page object
        const pageObject: PageObject = {
            component,
            props: resolvedProps,
            url: this.context.req.url,
            version: this.version,
            encryptHistory: options.encryptHistory ?? false,
            clearHistory: options.clearHistory ?? false,
        }

        // Return JSON for Inertia requests
        if (this.isInertiaRequest()) {
            return this.context.json(pageObject, 200, {
                'X-Inertia': 'true',
                'Vary': 'X-Inertia',
            })
        }

        // Return HTML for initial page load
        const html = await this.rootView(pageObject)
        return this.context.html(html)
    }
```

**Verification**: Run `deno check packages/inertia/inertia.ts`

---

### 🔌 STEP 5: Create Inertia Middleware

**Goal**: Implement the middleware that handles the Inertia protocol.

- [ ] **5.1** Create file `/packages/inertia/middleware.ts`
- [ ] **5.2** Add imports:

```typescript
import type { Context, MiddlewareHandler, Next } from 'hono'
import type { InertiaConfig } from './types.ts'
import { Inertia } from './inertia.ts'
```

- [ ] **5.3** Add helper functions:

```typescript
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
```

- [ ] **5.4** Add `inertiaMiddleware` function:

```typescript
/**
 * Creates the Inertia.js middleware for handling the Inertia protocol.
 *
 * This middleware:
 * 1. Checks asset version and returns 409 if mismatched
 * 2. Converts 302 redirects to 303 for PUT/PATCH/DELETE requests
 * 3. Injects an Inertia instance into the context
 */
export function inertiaMiddleware(
    config: InertiaConfig = {},
): MiddlewareHandler {
    return async (c: Context, next: Next) => {
        // Resolve current version
        const currentVersion = resolveVersion(config.version)

        // Check version mismatch for Inertia requests
        if (isInertiaRequest(c)) {
            const clientVersion = c.req.header('X-Inertia-Version')

            if (clientVersion && clientVersion !== currentVersion) {
                // Version mismatch - return 409 to trigger full page reload
                return new Response(null, {
                    status: 409,
                    headers: {
                        'X-Inertia-Location': c.req.url,
                    },
                })
            }
        }

        // Create and inject Inertia instance into context
        const inertia = new Inertia(c, {
            version: currentVersion,
            rootView: config.rootView,
        })
        c.set('inertia', inertia)

        // Continue to next middleware/handler
        const response = await next()

        // Convert 302 to 303 for PUT/PATCH/DELETE requests
        if (
            isInertiaRequest(c) &&
            response.status === 302 &&
            ['PUT', 'PATCH', 'DELETE'].includes(c.req.method)
        ) {
            return new Response(null, {
                status: 303,
                headers: response.headers,
            })
        }

        return response
    }
}
```

**Verification**: Run `deno check packages/inertia/middleware.ts`

---

### 📤 STEP 6: Create Public Exports

**Goal**: Create the `mod.ts` file that exports all public APIs.

- [ ] **6.1** Create file `/packages/inertia/mod.ts`:

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
    RenderOptions,
    RootViewRenderer,
} from './types.ts'
````

**Verification**: Run `deno check packages/inertia/mod.ts`

---

### 🧪 STEP 7: Create Helper Unit Tests

**Goal**: Write tests for helper functions.

- [ ] **7.1** Create file `/packages/inertia/tests/helpers.test.ts`:

```typescript
import { assertEquals } from '@std/assert'
import {
    defaultRootView,
    escapeHtml,
    serializePageForHtml,
} from '../helpers.ts'

Deno.test('escapeHtml - escapes < and >', () => {
    assertEquals(escapeHtml('<script>'), '&lt;script&gt;')
})

Deno.test('escapeHtml - escapes quotes', () => {
    assertEquals(escapeHtml('"test"'), '&quot;test&quot;')
    assertEquals(escapeHtml("'test'"), '&#039;test&#039;')
})

Deno.test('escapeHtml - escapes ampersand', () => {
    assertEquals(escapeHtml('a & b'), 'a &amp; b')
})

Deno.test('serializePageForHtml - produces safe JSON', () => {
    const page = {
        component: 'Test',
        props: { message: '<script>alert("xss")</script>' },
        url: '/test',
        version: '1.0',
    }
    const result = serializePageForHtml(page)
    assertEquals(result.includes('<script>'), false)
    assertEquals(result.includes('&lt;script&gt;'), true)
})

Deno.test('defaultRootView - returns valid HTML', () => {
    const page = {
        component: 'Test',
        props: { errors: {} },
        url: '/test',
        version: '1.0',
    }
    const html = defaultRootView(page)
    assertEquals(html.includes('<!DOCTYPE html>'), true)
    assertEquals(html.includes('data-page='), true)
    assertEquals(html.includes('id="app"'), true)
})
```

**Verification**: Run `deno test packages/inertia/tests/helpers.test.ts`

---

### 🧪 STEP 8: Create Middleware Unit Tests

**Goal**: Write tests for the Inertia middleware.

- [ ] **8.1** Create file `/packages/inertia/tests/middleware.test.ts`:

```typescript
import { assertEquals } from '@std/assert'
import { Hono } from 'hono'
import { inertiaMiddleware } from '../middleware.ts'

Deno.test('inertiaMiddleware - injects Inertia instance into context', async () => {
    const app = new Hono()
    let hasInertia = false

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', (c) => {
        hasInertia = c.get('inertia') !== undefined
        return c.text('ok')
    })

    await app.fetch(new Request('http://localhost/test'))
    assertEquals(hasInertia, true)
})

Deno.test('inertiaMiddleware - returns 409 on version mismatch', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '2.0' }))
    app.get('/test', (c) => c.text('ok'))

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
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

Deno.test('inertiaMiddleware - converts 302 to 303 for PUT', async () => {
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

    app.use(
        inertiaMiddleware({
            version: () => {
                versionCalled = true
                return 'dynamic-1.0'
            },
        }),
    )
    app.get('/test', (c) => c.text('ok'))

    await app.fetch(new Request('http://localhost/test'))
    assertEquals(versionCalled, true)
})
```

**Verification**: Run `deno test packages/inertia/tests/middleware.test.ts`

---

### 🧪 STEP 9: Create Inertia Class Unit Tests

**Goal**: Write tests for the Inertia renderer class.

- [ ] **9.1** Create file `/packages/inertia/tests/inertia.test.ts`:

```typescript
import { assertEquals, assertStringIncludes } from '@std/assert'
import { Hono } from 'hono'
import { inertiaMiddleware } from '../middleware.ts'
import type { Inertia } from '../inertia.ts'

Deno.test('Inertia.render - returns JSON for Inertia requests', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', async (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('TestComponent', { message: 'Hello' })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    assertEquals(res.status, 200)
    assertEquals(res.headers.get('Content-Type'), 'application/json')
    assertEquals(res.headers.get('X-Inertia'), 'true')
    assertEquals(res.headers.get('Vary'), 'X-Inertia')

    const json = await res.json()
    assertEquals(json.component, 'TestComponent')
    assertEquals(json.props.message, 'Hello')
    assertEquals(json.props.errors, {})
    assertEquals(json.version, '1.0')
})

Deno.test('Inertia.render - returns HTML for initial page load', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', async (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('TestComponent', { message: 'Hello' })
    })

    const res = await app.fetch(new Request('http://localhost/test'))

    assertEquals(res.status, 200)
    const html = await res.text()
    assertStringIncludes(html, '<!DOCTYPE html>')
    assertStringIncludes(html, 'data-page=')
    assertStringIncludes(html, 'TestComponent')
})

Deno.test('Inertia.share - merges shared props', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.use(async (c, next) => {
        const inertia = c.get('inertia') as Inertia
        inertia.share({ auth: { user: 'John' } })
        return next()
    })
    app.get('/test', async (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('TestComponent', { message: 'Hello' })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.auth.user, 'John')
    assertEquals(json.props.message, 'Hello')
})

Deno.test('Inertia.render - resolves lazy props', async () => {
    const app = new Hono()

    app.use(inertiaMiddleware({ version: '1.0' }))
    app.get('/test', async (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('TestComponent', {
            eager: 'immediate',
            lazy: () => 'resolved',
            asyncLazy: async () => 'async-resolved',
        })
    })

    const res = await app.fetch(
        new Request('http://localhost/test', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': '1.0',
            },
        }),
    )

    const json = await res.json()
    assertEquals(json.props.eager, 'immediate')
    assertEquals(json.props.lazy, 'resolved')
    assertEquals(json.props.asyncLazy, 'async-resolved')
})

Deno.test('Inertia.render - uses custom rootView', async () => {
    const app = new Hono()

    app.use(
        inertiaMiddleware({
            version: '1.0',
            rootView: (page) => `<custom>${page.component}</custom>`,
        }),
    )
    app.get('/test', async (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('MyPage', {})
    })

    const res = await app.fetch(new Request('http://localhost/test'))
    const html = await res.text()
    assertEquals(html, '<custom>MyPage</custom>')
})
```

**Verification**: Run `deno test packages/inertia/tests/inertia.test.ts`

---

### 🧪 STEP 10: Create Integration Tests

**Goal**: Write end-to-end integration tests.

- [ ] **10.1** Create file `/packages/inertia/tests/integration.test.ts`:

```typescript
import { assertEquals, assertStringIncludes } from '@std/assert'
import { Hono } from 'hono'
import { inertiaMiddleware } from '../middleware.ts'
import type { Inertia } from '../inertia.ts'

Deno.test('Integration - full request lifecycle', async () => {
    const app = new Hono()

    // Setup middleware
    app.use(inertiaMiddleware({ version: 'abc123' }))

    // Share global props
    app.use(async (c, next) => {
        const inertia = c.get('inertia') as Inertia
        inertia.share({
            auth: { user: { id: 1, name: 'Test User' } },
            flash: {},
        })
        return next()
    })

    // Define routes
    app.get('/dashboard', async (c) => {
        const inertia = c.get('inertia') as Inertia
        return inertia.render('Dashboard', {
            stats: { visits: 100 },
        })
    })

    app.post('/users', (c) => c.redirect('/users', 302))

    // Test 1: Initial page load (HTML)
    const initialRes = await app.fetch(
        new Request('http://localhost/dashboard'),
    )
    assertEquals(initialRes.status, 200)
    const html = await initialRes.text()
    assertStringIncludes(html, 'Dashboard')
    assertStringIncludes(html, 'Test User')

    // Test 2: Inertia request (JSON)
    const inertiaRes = await app.fetch(
        new Request('http://localhost/dashboard', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': 'abc123',
            },
        }),
    )
    assertEquals(inertiaRes.status, 200)
    assertEquals(inertiaRes.headers.get('X-Inertia'), 'true')
    const json = await inertiaRes.json()
    assertEquals(json.component, 'Dashboard')
    assertEquals(json.props.auth.user.name, 'Test User')
    assertEquals(json.props.stats.visits, 100)

    // Test 3: Version mismatch (409)
    const mismatchRes = await app.fetch(
        new Request('http://localhost/dashboard', {
            headers: {
                'X-Inertia': 'true',
                'X-Inertia-Version': 'old-version',
            },
        }),
    )
    assertEquals(mismatchRes.status, 409)

    // Test 4: POST redirect converts to 303
    const postRes = await app.fetch(
        new Request('http://localhost/users', {
            method: 'POST',
            headers: { 'X-Inertia': 'true' },
        }),
    )
    assertEquals(postRes.status, 303)
})
```

**Verification**: Run `deno test packages/inertia/tests/integration.test.ts`

---

### ✅ STEP 11: Run All Tests

**Goal**: Verify all tests pass.

- [ ] **11.1** Run all tests:

```bash
deno test packages/inertia/tests/
```

- [ ] **11.2** Run type check:

```bash
deno check packages/inertia/**/*.ts
```

- [ ] **11.3** Run linter:

```bash
deno lint packages/inertia/
```

**Expected Result**: All commands should complete without errors.

---

### 📚 STEP 12: Create Package README

**Goal**: Write comprehensive documentation.

- [ ] **12.1** Create file `/packages/inertia/README.md` with:
  - Package description
  - Installation instructions
  - Quick start guide
  - API reference
  - Examples for React, Vue, Svelte

---

### 🔄 STEP 13: Update Framework Documentation

**Goal**: Integrate Inertia package into framework docs.

- [ ] **13.1** Update `/GEMINI.md` - Add Inertia package to overview
- [ ] **13.2** Create `/public/llms/inertia.txt` - LLM-optimized docs
- [ ] **13.3** Update `/public/llms/full.txt` - Add Inertia section

---

## API Examples

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

1. **Middleware + Class separation**: Middleware handles protocol (versioning,
   redirects), class handles rendering
2. **Lazy props**: Deferred execution for expensive operations (database
   queries)
3. **Configurable rootView**: Framework doesn't impose frontend choices (React,
   Vue, Svelte)
4. **Default version**: Falls back to '1.0' for simplicity
5. **Always include `errors` object**: Per Inertia protocol, props always
   include `errors: {}` by default
6. **Vary: X-Inertia header**: Helps browsers correctly differentiate between
   HTML and JSON responses

### Inertia Protocol Compliance

Based on the
[official Inertia.js protocol documentation](https://inertiajs.com/the-protocol):

> 📚 **LLM Documentation**: For comprehensive Inertia.js documentation optimized
> for AI assistants, see: https://inertiajs.com/docs/llms.txt

| Feature                       | Status      | Notes                                    |
| ----------------------------- | ----------- | ---------------------------------------- |
| HTML responses (first load)   | ✅ Included | Full HTML with `data-page` attribute     |
| JSON responses (XHR)          | ✅ Included | Returns PageObject as JSON               |
| X-Inertia header check        | ✅ Included | Detects Inertia requests                 |
| X-Inertia-Version check       | ✅ Included | Returns 409 on mismatch                  |
| 302 → 303 redirect conversion | ✅ Included | For PUT/PATCH/DELETE                     |
| X-Inertia-Location header     | ✅ Included | Set on 409 responses                     |
| Vary: X-Inertia header        | ✅ Included | On all Inertia responses                 |
| Shared props                  | ✅ Included | Via `inertia.share()`                    |
| Lazy props                    | ✅ Included | Function props resolved at render time   |
| encryptHistory / clearHistory | ✅ Included | Via RenderOptions                        |
| Partial reloads               | 🔄 Phase 2  | X-Inertia-Partial-Data/Except headers    |
| Deferred props                | 🔄 Phase 2  | Client-side lazy loading                 |
| Once props                    | 🔄 Phase 2  | Props resolved once, reused across pages |
| Merge props                   | 🔄 Phase 2  | For infinite scroll / append behavior    |
| Precognition validation       | 🔄 Phase 3  | Form validation before submission        |
| Server-Side Rendering (SSR)   | 🔄 Phase 3  | Pre-render pages on server for SEO       |

### Security Considerations

- HTML escaping for data-page attribute (XSS prevention)
- Version header validation
- Safe JSON serialization with entity escaping

### Future Enhancements (Phase 2+)

**Partial Reloads:**

- Support `X-Inertia-Partial-Component` header
- Support `X-Inertia-Partial-Data` header (comma-separated prop keys to include)
- Support `X-Inertia-Partial-Except` header (prop keys to exclude)
- Only resolve requested props for performance

**Deferred Props:**

- Add `deferredProps` to PageObject for client-side lazy loading
- Support grouping deferred props (e.g., `default`, `sidebar`)

**Once Props:**

- Add `onceProps` to PageObject
- Support `X-Inertia-Except-Once-Props` header
- Skip resolving already-loaded props

**Merge Props (Infinite Scroll):**

- Add `mergeProps`, `prependProps`, `deepMergeProps` to PageObject
- Add `scrollProps` configuration for pagination

**Precognition (Form Validation):**

- Support `Precognition: true` header
- Return 204 No Content on success
- Return 422 with validation errors

**SSR Support (Server-Side Rendering):**

SSR pre-renders JavaScript pages on the server, allowing visitors to receive
fully rendered HTML. This improves SEO and initial page load performance.

- Add `renderToString()` integration for React, Vue, and Svelte
- Support hydration on client-side (reuse server-rendered HTML)
- Provide `createServer()` helper for SSR server setup
- Support clustering for multi-threaded SSR rendering
- Allow disabling SSR for specific routes (e.g., admin panels)
- Client-side hydration:
  - React: `hydrateRoot()` instead of `createRoot()`
  - Vue: `createSSRApp()` instead of `createApp()`
  - Svelte 4: `hydrate: true` option
  - Svelte 5: `hydrate()` instead of `mount()`

**Example SSR Setup with Lockness (React):**

```typescript
// kernel.tsx - Lockness server with SSR
import { App } from '@lockness/core'
import { createInertiaSSRRenderer, inertiaMiddleware } from '@lockness/inertia'
import { renderToString } from 'react-dom/server'
import { resolvePage } from './app/view/pages/mod.ts'

const app = new App()

app.useMiddleware(
    inertiaMiddleware({
        version: Deno.env.get('BUILD_HASH') ?? '1.0',
        rootView: createInertiaSSRRenderer({
            render: renderToString,
            resolve: resolvePage,
            setup: ({ App, props }) => <App {...props} />,
        }),
    }),
)

await app.init({ controllersDir: './app/controller' })
app.listen(3000)
```

```typescript
// app/view/pages/mod.ts - Page resolver
export async function resolvePage(name: string) {
    // Dynamic import of page components
    const pages = import.meta.glob('./pages/**/*.tsx')
    const pagePath = `./pages/${name}.tsx`
    if (pages[pagePath]) {
        return (await pages[pagePath]()).default
    }
    throw new Error(`Page not found: ${name}`)
}
```

---

## � Inertia.js Protocol Reference

For the complete Inertia.js protocol documentation:

- **LLM Documentation**: https://inertiajs.com/docs/llms.txt
- **The Protocol**: https://inertiajs.com/the-protocol
- **Shared Data**: https://inertiajs.com/shared-data
- **Validation**: https://inertiajs.com/validation

---

_Task created: 2025-01-20_
