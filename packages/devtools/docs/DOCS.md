# Lockness Devtools

Lockness includes a powerful set of development tools to help you debug and
optimize your application. Inspired by the Symfony Web Debug Toolbar, it
provides real-time insights into your app's behavior.

---

## 🚀 Features

- **🔧 Debug Toolbar**: A fixed toolbar at the bottom of every page showing
  real-time stats.
- **📊 Profiler Dashboard**: A full-featured web interface at `/_devtools` to
  inspect every detail.
- **🔍 Request Inspector**: Track HTTP requests, headers, and payloads.
- **🗄️ SQL Monitor**: View all database queries executed by Drizzle with timing.
- **📝 Log Viewer**: See all application logs in a centralized place.
- **🎯 Routing Table**: List all registered routes, names, and middleware stack.

---

## ⚙️ Enabling Devtools

Devtools are disabled by default. You should enable them **only in development**
in your `app/kernel.ts`.

```typescript
import { enableDevtools, collectAppRoutes } from '@lockness/devtools'

const isDevelopment = Deno.env.get('APP_ENV') === 'development'

if (isDevelopment) {
    // 1. Enable interception and dashboard
    enableDevtools(app.getHono())
}

await app.init({ ... })

if (isDevelopment) {
    // 2. Collect routes after initialization
    collectAppRoutes(app)
}
```

---

## 🛠 Usage

### The Web Debug Toolbar

When devtools are enabled, a small bar appears at the bottom of your browser. It
displays:

- The current route name.
- Total request duration.
- Number of database queries.
- Warning or error log count.

Click on any icon to jump directly to the relevant tab in the full dashboard.

### The Dashboard

Access the full dashboard by clicking the "wrench" icon in the toolbar or
visiting `/_devtools`.

#### SQL Queries

Inspect exactly what SQL was sent to your database. It highlights slow queries
and shows the duration for each execution.

#### Logs

View all logs triggered by `Logger.info()`, `Logger.warn()`, etc.

#### Deprecation Notices

When `@lockness/deprecation-contracts` is installed, the Logs tab displays
deprecation warnings with:

- Package name and version that introduced the deprecation
- Detailed message explaining the change
- Full stack trace to locate the deprecated code usage
- Timestamp for tracking when the deprecation was triggered

**Installation:**

```bash
deno task cli package:install deprecation-contracts
```

This package is **optional**. Without it, deprecations will still appear in the
console, but won't be tracked in the devtools dashboard.

#### Performance

See a detailed breakdown of the request lifecycle, including time spent in
middlewares and controllers.

---

## 🛡 Security Note

⚠️ **Critical**: Never enable devtools in production. They expose sensitive data
like session structures, database queries, and environment details.

Lockness automatically filters out the debug bar injection and dashboard routes
if the `APP_ENV` is not set to `development`, or if you manually set
`DEBUG_BAR=false` in your `.env`.

## Debug panels (events, sessions) — #27

The dashboard adds two panels beyond routes/requests/deprecations:

- **Events** — every dispatched event, newest-first, with the number of
  listeners **registered** for it at capture time and the **request** it was
  fired in (events fired outside a request show as unattributed). Correlation is
  per-request via an `AsyncLocalStorage` scope established in the devtools
  middleware.
- **Sessions** — the current request's session id, keys and flash. **Secret-
  looking values are redacted at capture** (keys matching
  `password`/`token`/`secret`/`authorization`/`csrf`/`apikey`/`key` show
  `[redacted]`), so no secret reaches the panel or the `/api/data` JSON.

Each panel renders a graceful empty state when it has no data.

### Activation is fail-closed

Devtools mounts and collects **only when explicitly development** — an
explicitly-set `DENO_ENV`/`APP_ENV === 'development'`, or `LOCKNESS_DEVTOOLS=1`.
A no-env deployment and a `deno compile` binary without `--allow-env` both
resolve the environment name to `development` by default, so a plain
`isDevelopment()` check would fail **open**; the gate requires a positive,
explicit signal instead, and the same guard sits on the collection boundary so
wiring `devtoolsMiddleware` directly cannot collect in production either.

### The `/_debug` route

Reach the bar at `/_debug` by configuring the base path (the default stays
`/_devtools`):

```ts
enableDevtools(app, { basePath: '/_debug' })
```

### Not included: the DI container panel

The DI-container panel is deferred: `@lockness/container` exposes no way to
enumerate its registrations, so the panel is blocked on **#128**. It will land
once #128 ships read-only introspection (token ids + resolved/lazy state only —
never instance contents, which hold secrets).
