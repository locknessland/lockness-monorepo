# @lockness/inertia

Inertia.js server-side adapter for building modern single-page applications
(SPAs) with server-side routing in the Lockness framework.

## Features

- 🚀 **Server-Side Routing** - Build SPAs without client-side routing complexity
- 🔄 **Automatic Protocol Handling** - Version checking, redirects, and
  JSON/HTML responses
- 📦 **Shared Props System** - Global data injection (auth user, flash messages,
  etc.)
- 🎨 **Customizable Root View** - Full control over HTML shell rendering
- 🔌 **Framework Agnostic** - Works with React, Vue, Svelte, or any Inertia.js
  client adapter
- ⚡ **Progressive Enhancement** - Works without JavaScript on first load
- 🛡️ **Type Safe** - Full TypeScript support with strict typing
- 🧪 **Lazy Props** - Resolve expensive data only when needed

## Installation

```typescript
import { inertiaMiddleware } from '@lockness/inertia'
```

## Quick Start

### Basic Setup

```typescript
// kernel.tsx
import { App } from '@lockness/contract'
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

### Controller Usage

```typescript
// app/controller/dashboard_controller.tsx
import { type Context, Controller, Get } from '@lockness/contract'

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

## Advanced Configuration

### Dynamic Version with Custom Root View

```typescript
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

app.useMiddleware(inertiaMiddleware(inertiaConfig))
```

### Shared Props (Global Data)

Share data that should be available in all Inertia responses:

```typescript
// kernel.tsx
app.useMiddleware(async (c, next) => {
    const inertia = c.get('inertia')

    inertia.share({
        auth: {
            user: await getCurrentUser(c),
        },
        flash: c.get('session')?.flash ?? {},
        appName: 'My App',
    })

    return next()
})
```

Now `auth`, `flash`, and `appName` will be available in all page components.

## Controller Examples

### Simple Render

```typescript
@Get('/users')
async index(c: Context) {
    const inertia = c.get('inertia')
    
    return inertia.render('Users/Index', {
        users: await this.userService.findAll(),
    })
}
```

### Lazy Props (Resolved Only When Needed)

```typescript
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
```

### Form Submission with Redirect

```typescript
@Post('/users')
async store(c: Context) {
    const data = await c.req.json()
    await this.userService.create(data)
    
    // Inertia middleware converts this to 303 for PUT/PATCH/DELETE
    return c.redirect('/users')
}
```

### Async Lazy Props

```typescript
@Get('/dashboard')
async dashboard(c: Context) {
    const inertia = c.get('inertia')
    
    return inertia.render('Dashboard', {
        // Resolved immediately
        user: await this.userService.current(c),
        
        // Resolved only if component requests it (lazy)
        stats: async () => await this.statsService.calculate(),
        notifications: async () => await this.notificationService.recent(),
    })
}
```

## How Inertia.js Works

### The Protocol

Inertia.js uses a simple protocol for communication between the server and
client:

1. **First Load (No `X-Inertia` header)**
   - Server returns full HTML document with `data-page` attribute
   - Client-side app boots from the embedded JSON data

2. **Subsequent Requests (`X-Inertia: true` header)**
   - Server returns JSON response with component name and props
   - Client-side app swaps the component without page reload

3. **Version Checking**
   - Client sends `X-Inertia-Version` header
   - Server returns 409 Conflict if version mismatches
   - Client performs full page reload to get latest assets

4. **Redirect Handling**
   - For PUT/PATCH/DELETE requests, 302 redirects are converted to 303
   - Ensures proper form submission handling

### Page Object Structure

```typescript
{
    "component": "Users/Show",
    "props": {
        "user": { "id": 1, "name": "John" },
        "errors": {}
    },
    "url": "/users/1",
    "version": "1.0.0"
}
```

## API Reference

### `inertiaMiddleware(config?)`

Creates the Inertia middleware.

**Parameters:**

- `config.version` - Asset version string or function (default: `'1.0'`)
- `config.rootView` - Custom root view renderer function (optional)

**Example:**

```typescript
app.useMiddleware(
    inertiaMiddleware({
        version: () => Deno.env.get('APP_VERSION') ?? '1.0',
        rootView: customRootView,
    }),
)
```

### `inertia.render(component, props?, options?)`

Renders an Inertia response.

**Parameters:**

- `component` - Component name (e.g., `'Users/Index'`)
- `props` - Props object (can include lazy functions)
- `options.encryptHistory` - Encrypt history state (optional)
- `options.clearHistory` - Clear encrypted history (optional)

**Returns:** `Promise<Response>`

### `inertia.share(props)`

Shares props globally for all responses.

**Parameters:**

- `props` - Object with props to share

**Example:**

```typescript
inertia.share({
    user: currentUser,
    flash: flashMessages,
})
```

## Types

### `InertiaConfig`

```typescript
interface InertiaConfig {
    readonly version?: string | (() => string)
    readonly rootView?: RootViewRenderer
}
```

### `PageObject`

```typescript
interface PageObject {
    readonly component: string
    readonly props: Record<string, unknown> & {
        errors?: Record<string, string>
    }
    readonly url: string
    readonly version: string
    readonly encryptHistory?: boolean
    readonly clearHistory?: boolean
}
```

### `InertiaProps`

```typescript
type InertiaProps = Record<
    string,
    unknown | (() => unknown) | (() => Promise<unknown>)
>
```

## Client-Side Setup

### React Example

```tsx
// app.tsx
import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'

createInertiaApp({
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.tsx', { eager: true })
        return pages[`./Pages/${name}.tsx`]
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />)
    },
})
```

### Vue Example

```typescript
// app.js
import { createInertiaApp } from '@inertiajs/vue3'
import { createApp, h } from 'vue'

createInertiaApp({
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.vue', { eager: true })
        return pages[`./Pages/${name}.vue`]
    },
    setup({ el, App, props, plugin }) {
        createApp({ render: () => h(App, props) })
            .use(plugin)
            .mount(el)
    },
})
```

## Best Practices

### 1. Use Shared Props for Global Data

Instead of fetching auth user in every controller:

```typescript
// ❌ Don't do this in every controller
return inertia.render('Dashboard', {
    user: await getCurrentUser(c),
    // ...other props
})

// ✅ Do this once in middleware
app.useMiddleware(async (c, next) => {
    const inertia = c.get('inertia')
    inertia.share({ user: await getCurrentUser(c) })
    return next()
})
```

### 2. Use Lazy Props for Expensive Operations

```typescript
return inertia.render('Users/Show', {
    user: await this.userService.find(id), // Always resolved
    activity: () => this.activityService.recent(id), // Only if requested
})
```

### 3. Version Your Assets Properly

Use a build hash or timestamp for cache busting:

```typescript
inertiaMiddleware({
    version: () => Deno.env.get('BUILD_HASH') ?? Date.now().toString(),
})
```

### 4. Handle Errors Consistently

Inertia expects an `errors` object in props:

```typescript
@Post('/users')
async store(c: Context) {
    try {
        await this.userService.create(data)
        return c.redirect('/users')
    } catch (error) {
        return inertia.render('Users/Create', {
            errors: { email: 'Email already exists' },
        })
    }
}
```

## Comparison with Traditional SPAs

| Feature        | Traditional SPA                        | Inertia.js                         |
| -------------- | -------------------------------------- | ---------------------------------- |
| Routing        | Client-side (React Router, Vue Router) | Server-side (Lockness controllers) |
| Data Fetching  | API calls from client                  | Server-side props                  |
| Code Splitting | Manual or route-based                  | Automatic per-component            |
| SEO            | Requires SSR setup                     | Built-in with first load           |
| Auth           | Token-based API                        | Session-based (traditional web)    |
| Complexity     | High (separate API + client)           | Low (monolith approach)            |

## Troubleshooting

### Version Mismatches

If you see 409 errors, ensure your version is consistent:

```typescript
// Use a stable version in development
inertiaMiddleware({ version: '1.0' })

// Use dynamic version in production
inertiaMiddleware({ version: () => Deno.env.get('BUILD_HASH')! })
```

### Shared Props Not Updating

Shared props are set **per-request**. Make sure you're calling `share()` in
middleware:

```typescript
app.useMiddleware(async (c, next) => {
    const inertia = c.get('inertia')
    inertia.share({ timestamp: Date.now() }) // ✅ Fresh every request
    return next()
})
```

### Custom Root View Not Working

Ensure your custom root view is async-compatible:

```typescript
rootView: ;
;(async (page) => {
    const html = await renderToString(<App page={page} />)
    return `<!DOCTYPE html>...${html}...`
})
```

## Resources

- [Inertia.js Official Docs](https://inertiajs.com)
- [Inertia.js Protocol Specification](https://inertiajs.com/the-protocol)
- [Lockness Framework Docs](https://lockness.land/docs)

## License

MIT
