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
With mount point pattern: /:langId{(?:en|fr)}/:countryId{(?:us|ca)}

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

### Recommended: Externalized Configuration

Lockness encourages externalizing configuration to the `config/` directory. This
keeps the kernel clean and makes mount point configuration easy to modify:

```typescript
// config/routing.ts
import { constrainedParam, type MountPoint } from '@lockness/core'
import { i18nMiddleware } from '../app/middleware/i18n_middleware.ts'
import { validCountries, validLanguages } from './i18n.ts'

export const mountPointConfig: MountPoint = {
    // Built, never a literal — the codes have one home, in config/i18n.ts.
    pattern: `/${constrainedParam('langId', validLanguages)}/${
        constrainedParam('countryId', validCountries)
    }`,
    middleware: i18nMiddleware,
}
```

```typescript
// config/mod.ts
export { mountPointConfig } from './routing.ts'
// ... other exports
```

```typescript
// app/kernel.tsx
import { Kernel } from '@lockness/core'
import { mountPointConfig } from '../config/mod.ts'

@Kernel({
    controllersDir: './app/controller',
    mountPoint: mountPointConfig,
})
export class AppKernel {}
```

This approach:

- Keeps configuration separate from bootstrap logic
- Makes it easy to modify without touching the kernel
- Follows the same pattern as `databaseConfig` and `sessionConfig`

### Inline Configuration

For simple cases, you can also configure inline in the kernel:

```typescript
import { Context, Kernel, Next } from '@lockness/core'

@Kernel({
    controllersDir: './app/controller',
    mountPoint: {
        pattern: `/${constrainedParam('langId', validLanguages)}/${
            constrainedParam('countryId', validCountries)
        }`,
        middleware: async (c: Context, next: Next) => {
            c.set('langId', c.req.param('langId'))
            c.set('countryId', c.req.param('countryId'))
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
        pattern: `/${constrainedParam('langId', validLanguages)}/${
            constrainedParam('countryId', validCountries)
        }`,
        middleware: i18nMiddleware,
    },
})
```

## Mount Point Interface

```typescript
interface MountPoint {
    /**
     * URL pattern with Hono path parameters. **Constrain them.**
     * Build it with `constrainedParam()` rather than writing a literal:
     * an unconstrained `/:langId/:countryId` matches ANY two leading
     * segments. Example: '/:langId{(?:en|fr)}/:countryId{(?:us|ca)}'
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
        pattern: `/${constrainedParam('langId', validLanguages)}/${
            constrainedParam('countryId', validCountries)
        }`,
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

Static files are registered on the root app **before** the mount point:

```typescript
@Kernel({
    staticDir: 'public',  // Served at /css, /js, /img, /favicon.ico
    mountPoint: {
        pattern: `/${constrainedParam('langId', validLanguages)}/${
            constrainedParam('countryId', validCountries)
        }`,
    },
})
```

An existing static file is therefore served first: `serveStatic` is registered
at `/*` on the root app before `mountManager.setup()` runs, and it
short-circuits the chain by responding.

**Registration order protects a path only when an earlier handler actually
responds.** On a miss, `serveStatic` calls `next()` and the path continues to
the mount — so a request for a _missing_ two-segment asset (`/css/missing.css`)
still reaches the mount middleware. Only constraining the mount params keeps it
out.

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

2. **Static files first, but only when they exist** - an existing file is served
   before the mount runs. A _missing_ file falls through to the mount, so
   constrain your mount params rather than relying on ordering

3. **Validate parameters** - Check that URL parameters are valid in middleware
   before setting context

4. **Use redirects for defaults** - Redirect invalid locales to a default rather
   than returning 404

5. **Type your context** - Use TypeScript declaration merging for type-safe
   context access

6. **Use mount points for i18n only** - For API versioning, prefer
   `@Controller('/api/:version')` which is more explicit

7. **Externalize configuration** - Keep mount point config in
   `config/routing.ts` for easier maintenance

## Live Demo

This application has a mount point configured in `config/routing.ts`. Try the
interactive demo:

### 🔗 Interactive Mount Point Demo

See how the same route behaves with and without locale prefix:

- [🌍 No Locale](/demo/mount-points)
- [🇺🇸 English (US)](/en/us/demo/mount-points)
- [🇨🇦 Français (CA)](/fr/ca/demo/mount-points)
- [🇲🇽 Español (MX)](/es/mx/demo/mount-points)

The locale prefix is at the **START** of the URL, and the middleware sets
context values that the controller can access.

## Related

- [Routing & Controllers](routing) - Basic routing concepts
- [Middleware](middleware) - Middleware fundamentals
- [Kernel Decorator](kernel-decorator) - Declarative app configuration
