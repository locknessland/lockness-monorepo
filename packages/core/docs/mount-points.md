# Mount Point

A mount point allows you to **extend** your application's routing by making all
routes accessible under an additional URL pattern. This is essential for
internationalization (i18n) where routes need to be accessible with locale
prefixes.

## How It Works

Mount points work by mounting your controllers at **two entry points**:

1. **Root mount** (`/`) - Routes remain accessible at their original paths
2. **Pattern mount** - Routes are ALSO accessible under the mount point pattern

```
With mount point pattern: /:langId/:countryId

Your controller routes are accessible at:
  /products           → ProductController (no locale context)
  /fr/ca/products     → ProductController (with locale context) ✅
  /en/us/products     → ProductController (with locale context) ✅
```

> **Key insight:** Mount points **extend** routing, they don't restrict it.
> Routes work at root AND under the mount point pattern.

## Architecture

Lockness uses a **dual-layer Hono architecture** for mount points:

```
┌─────────────────────────────────────────────────────────────┐
│                      rootHono (public layer)                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  1. Static files (/css, /js, /img)                  │    │
│  │  2. Root mount: route('/', hono)                    │    │
│  │  3. Mount point: route('/:lang/:country', hono)     │    │
│  │  4. 404 handler                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                              ↓                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              hono (internal layer)                  │    │
│  │  - Global middlewares                               │    │
│  │  - Controller routes                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Processing order:**

1. **Static files first** - `/css/app.css` is served immediately
2. **Root routes** - `/products` matches first (no mount point middleware)
3. **Mount point routes** - `/fr/ca/products` matches, middleware runs
4. **404 handler** - Unmatched requests

This order ensures static files are never intercepted by the mount point
pattern.

## Configuration

### Using @Kernel Decorator

```typescript
import { Context, Kernel, Next } from '@lockness/core'

@Kernel({
    controllersDir: './app/controller',
    mountPoint: {
        pattern: '/:langId/:countryId',
        middleware: async (c: Context, next: Next) => {
            // Extract parameters from URL
            const langId = c.req.param('langId')
            const countryId = c.req.param('countryId')

            // Set context values for controllers
            c.set('langId', langId)
            c.set('countryId', countryId)
            c.set('localeKey', `${langId}-${countryId}`)

            return await next()
        },
    },
})
export class AppKernel {}
```

### Using app.init()

```typescript
const app = new App()

await app.init({
    controllers: [UserController, ProductController],
    mountPoint: {
        pattern: '/:langId/:countryId',
        middleware: i18nMiddleware,
    },
})
```

## Mount Point Interface

```typescript
interface MountPoint {
    /**
     * URL pattern with Hono path parameters.
     * Example: '/:langId/:countryId'
     */
    pattern: string

    /**
     * Optional middleware executed ONLY for requests matching this pattern.
     * Use this to extract parameters and set context values.
     */
    middleware?: (c: Context, next: Next) => Promise<void | Response>
}
```

## Middleware Behavior

Mount point middleware runs **only** when the request matches the mount point
pattern:

| Request URL       | Middleware Runs? | Context Values       |
| ----------------- | ---------------- | -------------------- |
| `/products`       | ❌ No            | `langId = undefined` |
| `/fr/ca/products` | ✅ Yes           | `langId = "fr"`      |
| `/en/us/products` | ✅ Yes           | `langId = "en"`      |
| `/css/app.css`    | ❌ No            | (static file served) |

This allows controllers to handle both cases:

```typescript
@Controller('/products')
class ProductController {
    @Get('/')
    list(c: Context) {
        const langId = c.get('langId') as string | undefined

        if (langId) {
            // Localized response
            return c.json({ locale: langId, products: [...] })
        }

        // Default response (no locale)
        return c.json({ products: [...] })
    }
}
```

## Use Case: Internationalization (i18n)

```typescript
const i18nMiddleware = async (c: Context, next: Next) => {
    const langId = c.req.param('langId')
    const countryId = c.req.param('countryId')

    // Validate locale
    const validLocales = ['en-us', 'fr-ca', 'es-mx']
    const localeKey = `${langId}-${countryId}`

    if (!validLocales.includes(localeKey)) {
        // Redirect to default locale
        return c.redirect(`/en/us${c.req.path.replace(/^\/[^/]+\/[^/]+/, '')}`)
    }

    // Set context for controllers
    c.set('langId', langId)
    c.set('countryId', countryId)
    c.set('translations', await loadTranslations(langId))

    return await next()
}

@Kernel({
    mountPoint: {
        pattern: '/:langId/:countryId',
        middleware: i18nMiddleware,
    },
})
export class AppKernel {}
```

**Resulting URLs:**

- `/products` → Works (no locale)
- `/fr/ca/products` → Works with French Canadian locale
- `/invalid/xx/products` → Redirects to `/en/us/products`

## API Versioning Alternative

For API versioning, prefer using `@Controller('/api/:version')` instead of a
mount point. This is more explicit and keeps versioning logic local to API
controllers:

```typescript
@Controller('/api/:version')
class ApiController {
    @Get('/users')
    users(c: Context) {
        const version = c.req.param('version')
        // Handle version-specific logic
        return c.json({ version, users: [] })
    }
}
```

This approach:

- Keeps versioning explicit in the controller
- Doesn't affect other routes in the application
- Is simpler to understand and maintain

## Static Files

Static files are registered **before** the mount point in the routing chain:

```typescript
@Kernel({
    staticDir: 'public',  // Served at /css, /js, /img, /favicon.ico
    mountPoint: {
        pattern: '/:langId/:countryId',
    },
})
```

This ensures `/css/app.css` is served correctly and not intercepted by the
`/:langId/:countryId` pattern (which would match `langId="css"`,
`countryId="app.css"`).

## Context Values

### Setting Values (in middleware)

```typescript
const middleware = async (c: Context, next: Next) => {
    c.set('langId', c.req.param('langId'))
    c.set('countryId', c.req.param('countryId'))
    c.set('locale', { lang: 'fr', country: 'ca' })
    return await next()
}
```

### Accessing Values (in controllers)

```typescript
@Get('/')
handler(c: Context) {
    // Values are undefined when accessing root path
    const langId = c.get('langId') as string | undefined
    const countryId = c.get('countryId') as string | undefined

    if (langId && countryId) {
        // Request came through mount point
    } else {
        // Request came through root
    }
}
```

### Type Safety

Declare context types for TypeScript support:

```typescript
declare module '@lockness/core' {
    interface ContextVariableMap {
        langId: string
        countryId: string
        localeKey: string
    }
}
```

## Parameter Validation

Middleware can validate parameters and reject invalid requests:

```typescript
const i18nMiddleware = async (c: Context, next: Next) => {
    const langId = c.req.param('langId')
    const countryId = c.req.param('countryId')

    // Reject invalid languages
    const validLanguages = ['en', 'fr', 'es', 'de', 'ja']
    if (!validLanguages.includes(langId)) {
        return c.notFound()
    }

    // Reject invalid countries
    const validCountries = ['us', 'ca', 'mx', 'de', 'jp']
    if (!validCountries.includes(countryId)) {
        return c.notFound()
    }

    c.set('langId', langId)
    c.set('countryId', countryId)
    return await next()
}
```

## Best Practices

1. **Always handle undefined context values** - Controllers may be accessed at
   root without mount point middleware running

2. **Static files first** - Lockness handles this automatically, but be aware
   that static file paths won't trigger mount point middleware

3. **Validate parameters** - Check that URL parameters are valid in middleware
   before setting context

4. **Use redirects for defaults** - Redirect invalid locales to a default rather
   than returning 404

5. **Type your context** - Use TypeScript declaration merging for type-safe
   context access

6. **Use mount points for i18n only** - For API versioning, prefer
   `@Controller('/api/:version')` which is more explicit

## Live Demo

This application has a mount point configured in `app/kernel.tsx`. Try the
interactive demo:

<div class="my-8 rounded-lg border border-border bg-card p-6">
    <h3 class="font-pixel text-lg mb-4">🔗 Interactive Mount Point Demo</h3>
    <p class="text-muted-foreground mb-4">
        See how the same route behaves with and without locale prefix:
    </p>
    <div class="flex flex-wrap gap-2 mb-4">
        <a href="/demo/mount-points" class="px-4 py-2 bg-muted text-muted-foreground rounded hover:opacity-90">🌍 No Locale</a>
        <a href="/en/us/demo/mount-points" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">🇺🇸 English (US)</a>
        <a href="/fr/ca/demo/mount-points" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">🇨🇦 Français (CA)</a>
        <a href="/es/mx/demo/mount-points" class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90">🇲🇽 Español (MX)</a>
    </div>
    <p class="text-sm text-muted-foreground">
        The locale prefix is at the <strong>START</strong> of the URL, and the middleware sets context values that the controller can access.
    </p>
</div>

## Related

- [Routing & Controllers](routing) - Basic routing concepts
- [Middleware](middleware) - Middleware fundamentals
- [Kernel Decorator](kernel-decorator) - Declarative app configuration
