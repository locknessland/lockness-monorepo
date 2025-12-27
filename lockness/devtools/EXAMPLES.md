# Devtools Integration Examples

## Basic Setup

### In your kernel.tsx

```typescript
import { App } from 'lockness/core'
import { enableDevtools } from '@lockness/devtools'

export const bootstrap = async () => {
    const app = new App()
    const isDevelopment = Deno.env.get('APP_ENV') === 'development'

    // Enable devtools BEFORE app.init()
    if (isDevelopment) {
        enableDevtools(app.getHono(), {
            basePath: '/_devtools',
            maxLogs: 2000,
            showDebugBar: true,
        })
    }

    await app.init({
        // your config
    })

    return app
}
```

## Integration with Database

### Track SQL queries in your repository

```typescript
import { trackQuery } from '@lockness/devtools'
import { db } from '@lockness/drizzle'

export class UserRepository {
    async findAll() {
        const start = performance.now()
        const users = await db.select().from(usersTable)

        // Track the query
        trackQuery(
            'SELECT * FROM users',
            performance.now() - start,
        )

        return users
    }

    async findById(id: number) {
        const start = performance.now()
        const user = await db.select()
            .from(usersTable)
            .where(eq(usersTable.id, id))

        trackQuery(
            `SELECT * FROM users WHERE id = ${id}`,
            performance.now() - start,
            [id],
        )

        return user[0]
    }
}
```

## Integration with Logger

### Auto-track logs with custom logger

```typescript
import { log as devtoolsLog } from '@lockness/devtools'

export class Logger {
    info(message: string, context?: Record<string, any>) {
        console.log(`[INFO] ${message}`, context)
        devtoolsLog('info', message, context)
    }

    error(message: string, context?: Record<string, any>) {
        console.error(`[ERROR] ${message}`, context)
        devtoolsLog('error', message, context)
    }

    warn(message: string, context?: Record<string, any>) {
        console.warn(`[WARN] ${message}`, context)
        devtoolsLog('warn', message, context)
    }

    debug(message: string, context?: Record<string, any>) {
        console.debug(`[DEBUG] ${message}`, context)
        devtoolsLog('debug', message, context)
    }
}

// Usage
const logger = new Logger()
logger.info('User logged in', { userId: 123 })
```

## Integration with Queue

### Track jobs in your queue processor

```typescript
import { trackJob } from '@lockness/devtools'

export class QueueProcessor {
    async process(job: Job) {
        const jobId = crypto.randomUUID()

        trackJob({
            id: jobId,
            name: job.name,
            status: 'processing',
            attempts: job.attempts,
            timestamp: Date.now(),
        })

        try {
            await job.handle()

            trackJob({
                id: jobId,
                name: job.name,
                status: 'completed',
                attempts: job.attempts,
                timestamp: Date.now(),
            })
        } catch (error) {
            trackJob({
                id: jobId,
                name: job.name,
                status: 'failed',
                attempts: job.attempts,
                timestamp: Date.now(),
                error: error.message,
            })
            throw error
        }
    }
}
```

## Integration with Mail

### Track emails in your mail service

```typescript
import { trackMail } from '@lockness/devtools'

export class MailService {
    async send(to: string, subject: string, body: string) {
        try {
            // Send email via your driver
            await this.driver.send({ to, subject, body })

            trackMail({
                to,
                subject,
                timestamp: Date.now(),
                driver: this.driver.name,
                status: 'sent',
            })
        } catch (error) {
            trackMail({
                to,
                subject,
                timestamp: Date.now(),
                driver: this.driver.name,
                status: 'failed',
            })
            throw error
        }
    }
}
```

## Integration with Auth

### Track sessions

```typescript
import { trackSession } from '@lockness/devtools'

export class SessionManager {
    async createSession(userId: number, data: Record<string, any>) {
        const sessionId = crypto.randomUUID()
        const now = Date.now()

        // Store session
        await this.store.set(sessionId, { userId, ...data })

        // Track in devtools
        trackSession({
            id: sessionId,
            data: { userId, ...data },
            createdAt: now,
            updatedAt: now,
        })

        return sessionId
    }

    async updateSession(sessionId: string, data: Record<string, any>) {
        const existing = await this.store.get(sessionId)
        const updated = { ...existing, ...data }

        await this.store.set(sessionId, updated)

        trackSession({
            id: sessionId,
            data: updated,
            createdAt: existing.createdAt,
            updatedAt: Date.now(),
        })
    }
}
```

## Collecting Routes

### Auto-collect routes on app initialization

```typescript
import { collectRoutes } from '@lockness/devtools'

export const bootstrap = async () => {
    const app = new App()

    // ... enable devtools

    await app.init({
        // config
    })

    // Collect all registered routes
    if (Deno.env.get('APP_ENV') === 'development') {
        const routes = app.getRoutes() // Your method to get routes
        collectRoutes(routes.map((route) => ({
            method: route.method,
            path: route.path,
            controller: route.controller,
            action: route.action,
            middlewares: route.middlewares || [],
        })))
    }

    return app
}
```

## Middleware Stack Example

### Complete middleware setup

```typescript
import { App } from 'lockness/core'
import { enableDevtools } from '@lockness/devtools'
import { logger } from './middleware/logger.ts'
import { cors } from 'hono/cors'

export const bootstrap = async () => {
    const app = new App()

    // 1. Enable devtools FIRST (before any other middleware)
    if (Deno.env.get('APP_ENV') === 'development') {
        enableDevtools(app.getHono())
    }

    // 2. Then add your other middleware
    await app.init({
        middleware: [
            logger(),
            cors(),
        ],
        // ... rest of config
    })

    return app
}
```

## Custom Configuration

### Environment-based config

```typescript
const devtoolsConfig = {
    enabled: Deno.env.get('APP_ENV') === 'development',
    basePath: Deno.env.get('DEVTOOLS_PATH') || '/_devtools',
    maxLogs: parseInt(Deno.env.get('DEVTOOLS_MAX_LOGS') || '1000'),
    maxQueries: parseInt(Deno.env.get('DEVTOOLS_MAX_QUERIES') || '500'),
    maxRequests: parseInt(Deno.env.get('DEVTOOLS_MAX_REQUESTS') || '100'),
    showDebugBar: Deno.env.get('DEBUG_BAR') !== 'false',
}

if (devtoolsConfig.enabled) {
    enableDevtools(app.getHono(), devtoolsConfig)
}
```

## Tips & Best Practices

1. **Always enable devtools BEFORE app.init()** - Route order matters in Hono
2. **Only enable in development** - Check `APP_ENV` environment variable
3. **Adjust limits based on your needs** - Default 1000 logs might be too
   much/little
4. **Track performance-critical operations** - Use trackQuery for slow queries
5. **Log meaningful context** - Include user IDs, request IDs, etc.
6. **Clear data periodically** - Use `collector.clear()` if needed
7. **Disable toolbar if it interferes** - Set `DEBUG_BAR=false`

## Troubleshooting

### Toolbar not appearing

- Check that response is HTML (not JSON/API)
- Verify `showDebugBar` is `true`
- Ensure devtools is enabled before app.init()
- Check browser console for errors

### Dashboard returns 404

- Make sure enableDevtools is called BEFORE app.init()
- Check that basePath is correct (default: `/_devtools`)
- Verify no other route conflicts with the basePath

### Data not appearing

- Check that helper functions are called correctly
- Verify collector is receiving data: `console.log(collector.getAllData())`
- Clear browser cache and reload

### Performance issues

- Reduce max limits (maxLogs, maxQueries, maxRequests)
- Call `collector.clear()` periodically
- Only enable in development mode
