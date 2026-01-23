# Lockness Inertia.js Adapter

Build modern single-page applications (SPAs) with server-side routing using
Inertia.js protocol.

## Installation

```typescript
import { inertiaMiddleware } from '@lockness/inertia'
```

## Quick Start

### Configure Middleware

```typescript
// app/kernel.tsx
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

### Controller Usage

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

## Shared Props (Global Data)

Share data available in all Inertia responses:

```typescript
// app/kernel.tsx
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

## Lazy Props

Resolve expensive data only when component requests it:

```typescript
@Get('/users/:id')
async show(c: Context) {
    const inertia = c.get('inertia')
    const id = c.req.param('id')
    
    return inertia.render('Users/Show', {
        user: await this.userService.findById(id),
        // Only resolved if component requests it
        activity: () => this.activityService.getRecent(id),
        notifications: async () => await this.notificationService.for(id),
    })
}
```

## Advanced Configuration

### Dynamic Version with Custom Root View

```typescript
import { type InertiaConfig, inertiaMiddleware } from '@lockness/inertia'

const inertiaConfig: InertiaConfig = {
    // Dynamic version based on build hash
    version: () => Deno.env.get('BUILD_HASH') ?? '1.0.0',

    // Custom root view
    rootView: (page) => {
        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>${page.props.title ?? 'My App'}</title>
                    <link rel="stylesheet" href="/css/app.css" />
                </head>
                <body>
                    <div id="app" data-page='${JSON.stringify(page)}'></div>
                    <script type="module" src="/js/app.js"></script>
                </body>
            </html>
        `
    },
}

app.useMiddleware(inertiaMiddleware(inertiaConfig))
```

## How Inertia Works

### The Protocol

1. **First Load (No X-Inertia header)**
   - Server returns full HTML with `data-page` attribute
   - Client boots from embedded JSON data

2. **Subsequent Requests (X-Inertia: true)**
   - Server returns JSON with component and props
   - Client swaps component without page reload

3. **Version Checking**
   - Client sends `X-Inertia-Version` header
   - Server returns 409 if version mismatches
   - Client performs full page reload for latest assets

4. **Redirect Handling**
   - PUT/PATCH/DELETE redirects converted from 302 to 303
   - Ensures proper form submission handling

### Page Object

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

### `inertia.render(component, props?, options?)`

Render an Inertia response:

```typescript
return inertia.render('Dashboard', {
    users: await this.userService.all(),
})
```

**Parameters:**

- `component` - Component name (e.g., `'Users/Index'`)
- `props` - Props object (can include lazy functions)
- `options.encryptHistory` - Encrypt history state
- `options.clearHistory` - Clear encrypted history

### `inertia.share(props)`

Share props globally:

```typescript
inertia.share({
    user: currentUser,
    flash: flashMessages,
})
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

```typescript
// ✅ Good - set once in middleware
app.useMiddleware(async (c, next) => {
    const inertia = c.get('inertia')
    inertia.share({ user: await getCurrentUser(c) })
    return next()
})

// ❌ Bad - repeated in every controller
return inertia.render('Dashboard', {
    user: await getCurrentUser(c),
    // ...
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

```typescript
inertiaMiddleware({
    version: () => Deno.env.get('BUILD_HASH') ?? Date.now().toString(),
})
```

## Troubleshooting

### Version Mismatches (409 errors)

Use consistent versioning:

```typescript
// Development
inertiaMiddleware({ version: '1.0' })

// Production
inertiaMiddleware({ version: () => Deno.env.get('BUILD_HASH')! })
```

### Shared Props Not Updating

Set shared props in middleware, not globally:

```typescript
app.useMiddleware(async (c, next) => {
    const inertia = c.get('inertia')
    inertia.share({ timestamp: Date.now() }) // ✅ Fresh every request
    return next()
})
```

## Resources

- [Inertia.js Official Docs](https://inertiajs.com)
- [Inertia.js Protocol](https://inertiajs.com/the-protocol)
- [Lockness Framework](https://lockness.land/docs)
