# @lockness/devtools

Development debugging toolbar and dashboard for Lockness JS applications.
Inspired by Symfony Web Debug Toolbar.

## Features

- **🔧 Debug Toolbar**: Fixed bottom toolbar on every page (like Symfony)
- **📊 Dashboard**: Full-featured web interface at `/_devtools`
- **🔍 Request Inspector**: Track all HTTP requests with timing
- **📝 Logs**: Centralized log viewer with filtering
- **🗄️ SQL Queries**: Monitor database queries and performance
- **🎯 Routes**: View all registered routes and middlewares
- **📬 Mail**: Track sent emails
- **⚙️ Queue**: Monitor background jobs
- **⚡ Performance**: Measure route and middleware timing

## Installation

```typescript
import { enableDevtools } from '@lockness/devtools'

// In your kernel.ts (development only!)
if (Deno.env.get('APP_ENV') === 'development') {
    enableDevtools(app.getHono())
}
```

## Usage

### Debug Toolbar

A Symfony-style debug toolbar is automatically injected at the bottom of all
HTML pages:

- Shows real-time stats (routes, requests, duration, logs, SQL, queue, mail)
- Click on any item to open the full dashboard panel
- Click the "✕" to hide the toolbar
- Disable with `DEBUG_BAR=false` environment variable

### Dashboard

Access the full dashboard at: `http://localhost:8888/_devtools`

### Configuration

```typescript
enableDevtools(app.getHono(), {
    enabled: true, // Enable/disable devtools
    basePath: '/_devtools', // Dashboard URL (changed from /__devtools)
    maxLogs: 1000, // Max log entries to keep
    maxQueries: 500, // Max SQL queries to keep
    maxRequests: 100, // Max requests to keep
    showDebugBar: true, // Show debug toolbar (default: true, disable with DEBUG_BAR=false)
    token: '<128-bit CSPRNG secret>', // Require Authorization: Bearer for remote access
    authorize: (c) => c.get('user')?.isAdmin === true, // Or decide with your own auth
})
```

The collector routes are gated: by default only a **loopback** peer is trusted;
set a `token` (or `LOCKNESS_DEVTOOLS_TOKEN`) or an `authorize` callback to open
access from any host. See
[Securing the devtools endpoints](docs/DOCS.md#-securing-the-devtools-endpoints)
for the default posture, the reverse-proxy caveat, and token hardening.

### Manual Tracking

#### Log Messages

```typescript
import { log } from '@lockness/devtools'

log('info', 'User logged in', { userId: 123 })
log('error', 'Database error', { error: err.message })
```

#### SQL Queries

```typescript
import { trackQuery } from '@lockness/devtools'

const start = performance.now()
const users = await db.select().from(usersTable)
trackQuery('SELECT * FROM users', performance.now() - start)
```

#### Background Jobs

```typescript
import { trackJob } from '@lockness/devtools'

trackJob({
    id: crypto.randomUUID(),
    name: 'SendWelcomeEmail',
    status: 'completed',
    attempts: 1,
    timestamp: Date.now(),
})
```

#### Emails

```typescript
import { trackMail } from '@lockness/devtools'

trackMail({
    to: 'user@example.com',
    subject: 'Welcome!',
    timestamp: Date.now(),
    driver: 'smtp',
    status: 'sent',
})
```

#### Sessions

```typescript
import { trackSession } from '@lockness/devtools'

trackSession({
    id: sessionId,
    data: { userId: 123, role: 'admin' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
})
```

#### Routes

```typescript
import { collectRoutes } from '@lockness/devtools'

collectRoutes([
    {
        method: 'GET',
        path: '/users',
        controller: 'UserController',
        action: 'index',
        middlewares: ['auth'],
    },
])
```

## Debug Toolbar

The debug toolbar is automatically injected at the bottom of all HTML pages in
development mode. It provides:

- **Real-time stats**: Routes, Requests, Duration, Logs (with error badge), SQL
  queries, Queue jobs, Mail
- **Quick access**: Click any item to jump to the relevant dashboard panel
- **Minimalist design**: Symfony-style toolbar that doesn't interfere with your
  UI
- **Closeable**: Click the "✕" button to hide if needed

### Disable the toolbar

Set `DEBUG_BAR=false` in your `.env` file:

```bash
DEBUG_BAR=false
```

Or configure programmatically:

```typescript
enableDevtools(app.getHono(), {
    showDebugBar: false,
})
```

## Architecture

### Components

- **`collector.ts`**: Singleton data collector with in-memory storage
- **`middleware.ts`**: Request interceptor that collects data and injects
  toolbar
- **`dashboard.tsx`**: Full-featured dashboard with 8 panels (JSX components)
- **`toolbar_html.ts`**: HTML generator for the debug toolbar
- **`components/`**: Reusable JSX components (Badge, Card, Tab, Layout, Toolbar)
- **`devtools.ts`**: Main API and helper functions

### Data Flow

1. **Middleware intercepts** every request
2. **Collector stores** data in memory (with max limits)
3. **Toolbar injected** into HTML responses automatically
4. **Dashboard fetches** data via API endpoint
5. **Auto-refresh** every 5 seconds

## Testing

Run the test suite:

```bash
deno test lockness/devtools/
```

Test with coverage:

```bash
deno test --coverage=coverage lockness/devtools/
deno coverage coverage --lcov
```

## Development

The devtools package is built with:

- **Hono JSX** for components (precompile mode)
- **Tailwind CSS** (CDN) for styling
- **TypeScript** for type safety
- **Deno** runtime

## API Reference

### `enableDevtools(app, config?)`

Enable devtools on your Hono application.

**Parameters:**

- `app: Hono` - Your Hono instance (use `app.getHono()` for Lockness App)
- `config?: DevtoolsConfig` - Optional configuration

**Config Options:**

```typescript
interface DevtoolsConfig {
    enabled?: boolean // Default: true
    basePath?: string // Default: '/_devtools'
    maxLogs?: number // Default: 1000
    maxQueries?: number // Default: 500
    maxRequests?: number // Default: 100
    showDebugBar?: boolean // Default: true (or DEBUG_BAR !== 'false')
}
```

### Helper Functions

#### `log(level, message, context?)`

Add a log entry.

```typescript
log('info', 'User logged in', { userId: 123 })
log('error', 'Database error', { error: err.message })
```

#### `trackQuery(query, duration, bindings?)`

Track a SQL query.

```typescript
const start = performance.now()
const users = await db.select().from(usersTable)
trackQuery('SELECT * FROM users', performance.now() - start)
```

#### `trackJob(jobInfo)`

Track a queue job.

```typescript
trackJob({
    id: crypto.randomUUID(),
    name: 'SendEmailJob',
    status: 'completed',
    attempts: 1,
    timestamp: Date.now(),
})
```

#### `trackMail(mailInfo)`

Track an email.

```typescript
trackMail({
    to: 'user@example.com',
    subject: 'Welcome!',
    timestamp: Date.now(),
    driver: 'smtp',
    status: 'sent',
})
```

#### `trackSession(sessionData)`

Track session data.

```typescript
trackSession({
    id: sessionId,
    data: { userId: 123 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
})
```

#### `collectRoutes(routes)`

Collect application routes.

```typescript
collectRoutes([
    {
        method: 'GET',
        path: '/users',
        controller: 'UserController',
        middlewares: ['auth'],
    },
])
```

### `collector`

Direct access to the collector instance.

```typescript
import { collector } from '@lockness/devtools'

// Get all data
const data = collector.getAllData()

// Clear all data
collector.clear()
```

## Production Safety

⚠️ **Important**: Only enable devtools in development!

```typescript
// ✅ Recommended
if (Deno.env.get('APP_ENV') === 'development') {
    enableDevtools(app.getHono())
}

// ❌ Never in production
enableDevtools(app.getHono()) // Don't do this!
```

The devtools:

- Stores data in memory (can grow large)
- Exposes debug information
- Injects HTML into responses
- Adds performance overhead

## License

MIT

## Contributing

Contributions welcome! Please ensure tests pass before submitting PRs.

---

Made with ❤️ for Lockness JS import { trackMail } from '@lockness/devtools'

trackMail({ to: 'user@example.com', subject: 'Welcome!', timestamp: Date.now(),
driver: 'smtp', status: 'sent', })

````
## Security Warning

⚠️ **Never enable devtools in production!** It exposes sensitive debugging
information.

Always wrap with environment check:

```typescript
if (Deno.env.get('APP_ENV') === 'development') {
    enableDevtools(app)
}
````

## Dashboard Panels

### Overview

- Quick stats: routes, requests, queries, logs
- Recent requests with timing
- Recent log entries

### Routes

- All registered routes with HTTP methods
- Controller and action names
- Middleware stack

### Requests

- Request history with headers, query params, body
- Response status and timing
- Request/response inspection

### Logs

- All application logs (info, warn, error, debug)
- Filterable by level
- Contextual data display

### SQL Queries

- All executed queries with timing
- Query bindings
- Slow query highlighting

### Queue

- Background job status
- Job attempts and errors
- Queue statistics

### Mail

- Sent email log
- Recipient and subject
- Driver used (SMTP, Console, etc.)

### Performance

- Route timing breakdown
- Middleware performance
- Database query performance
- Overall request metrics

## License

MIT
