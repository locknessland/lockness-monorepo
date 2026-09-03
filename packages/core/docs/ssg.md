# Static Site Generation (`@Static` + `ssg:build`)

Pre-render selected routes to static HTML at build time, for hosting on any CDN
or static host with no running Deno server. SSG is **opt-in**: only routes you
mark with `@Static` are emitted; everything else keeps serving dynamically.

## At a glance

```ts
import { Controller, Get, Static } from '@lockness/core'

@Controller('/docs')
export class DocsController {
    @Get('/')
    @Static() // ← this page is pre-rendered
    index(c: Context) {
        return c.html(<DocsHome />)
    }

    @Get('/search')
    search(c: Context) { // no @Static → stays dynamic
        return c.html(<SearchResults q={c.req.query('q')} />)
    }
}
```

```bash
deno task cli ssg:build            # renders @Static routes to ./dist
deno task cli ssg:build --out out  # …to ./out
```

Output uses a clean-URL directory convention: `/docs` → `dist/docs/index.html`,
`/` → `dist/index.html`. A file-like route (a last segment containing a dot,
e.g. `/docs/llms.txt`) is written literally to `dist/docs/llms.txt` so a plain
host serves it at its own URL.

## The `@Static` decorator

Applied to a **method**, it marks that route. Applied to a **class**, it marks
every GET route the controller declares.

```ts
@Controller('/ui')
@Static() // every GET route in this controller is static
export class UiController {/* … */}
```

Only **GET** routes can be pre-rendered — a `@Static` non-GET route fails the
build.

### Parameterized routes

A route with a path parameter needs an **explicit, literal** list of values —
SSG does not fetch data at build time to discover them (see _Scope_ below):

```ts
@Get('/:slug')
@Static({ params: [{ slug: 'intro' }, { slug: 'installation' }] })
page(c: Context) {
    return c.html(<Doc slug={c.req.param('slug')} />)
}
```

Each entry emits one page (`/docs/intro`, `/docs/installation`). A parameterized
`@Static` route **without** a `params` list fails the build with an actionable
message — it never silently skips the route.

## i18n: curated locales

Set a **curated** locale list on the `@Kernel` config. Each `@Static` route is
then emitted once at its root path and once per locale, under the app's i18n
mount prefix (derived from the kernel `mountPoint`):

```ts
@Kernel({
    mountPoint: mountPointConfig, // /:langId{…}/:countryId{…}
    ssg: { locales: ['en-us', 'fr-ca'] },
})
export class AppKernel {}
```

For one `@Static` route this emits three files — `dist/docs/index.html`,
`dist/en/us/docs/index.html`, `dist/fr/ca/docs/index.html` — **not** the full
`validLanguages × validCountries` product. A locale the mount pattern does not
admit fails the build. Without `ssg.locales`, the build is root-only.

## Failure is loud

The build **aborts with a non-zero exit** and never presents a partial `dist/`
as success when:

- a `@Static` handler renders a non-2xx response (a thrown handler → 500 →
  abort), naming the route;
- a controller file fails to import;
- two routes resolve to the same output file (a collision);
- a route, param, or locale segment carries a traversal (`..`), a leading dot,
  or a disallowed character.

## Security & scope

`@Static` routes are rendered through the **full app and global-middleware
stack** with your environment loaded. Keep them **state-free and secret-free**:

- No per-request tokens or CSP nonces — they would freeze into the cached file.
- No env secrets, API keys, or signed URLs in the page body — the output is
  published as-is to a public host, permanently.

The command prints this warning on every run.

### Out of scope (v1)

- **Build-time dynamic data** — `@Static` routes do not run DB queries or
  external `fetch` at build time. Routes that need data stay dynamic (SSR). This
  is the deferred high-value feature.
- ISR / on-demand revalidation, RSS/sitemap generation, and full auto-discovery
  without an explicit `@Static` opt-in.

## How it works

1. The command boots the app from `@Kernel` (`createApp`), which instantiates
   every controller and populates route + `@Static` metadata.
2. It enumerates `@Static` GET routes by joining the app's registered routes
   (`app.getRoutes()`) with the `@Static` opt-in metadata.
3. It renders each target in-memory via `App.fetch(new Request(url))` — no
   `Deno.serve`, no socket — and writes the body under `dist/`.

SSG is a standalone CLI command, **not** a Vite plugin: `@lockness/vite`
deliberately emits no HTML.
