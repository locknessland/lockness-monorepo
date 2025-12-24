# @lockness/devtools

Development debugging toolbar and dashboard for Lockness JS applications. Inspired by Symfony Web Debug Toolbar.

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

A Symfony-style debug toolbar is automatically injected at the bottom of all HTML pages:
- Shows real-time stats (routes, requests, duration, logs, SQL, queue, mail)
- Click on any item to open the full dashboard panel
- Click the "✕" to hide the toolbar
- Disable with `DEBUG_BAR=false` environment variable

### Dashboard

Access the full dashboard at: `http://localhost:8888/_devtools`

### Configuration

```typescript
enableDevtools(app.getHono(), {
    enabled: true,              // Enable/disable devtools
    basePath: '/_devtools',     // Dashboard URL (changed from /__devtools)
    maxLogs: 1000,              // Max log entries to keep
    maxQueries: 500,            // Max SQL queries to keep
    maxRequests: 100,           // Max requests to keep
    showDebugBar: true,         // Show debug toolbar (default: true, disable with DEBUG_BAR=false)
})
```

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

## Security Warning

⚠️ **Never enable devtools in production!** It exposes sensitive debugging
information.

Always wrap with environment check:

```typescript
if (Deno.env.get('APP_ENV') === 'development') {
    enableDevtools(app)
}
```

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
