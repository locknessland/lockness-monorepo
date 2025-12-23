# @lockness/logger

Structured logging system for Deno with multiple levels, transports, and
formatters.

## Features

- 📊 **5 Log Levels**: DEBUG, INFO, WARN, ERROR, FATAL
- 🎨 **Multiple Formatters**: Text, JSON, Pretty (with colors)
- 🚀 **Flexible Transports**: Console, File, Memory, Custom
- 🏷️ **Contextual Logging**: Child loggers with inherited context
- 📝 **Metadata Support**: Attach structured data to logs
- ⚡ **Async/Await**: Non-blocking logging operations
- 🧪 **Well-tested**: 31 test steps covering all features

## Installation

```typescript
import { configureLogger, Logger } from '@lockness/logger'
// or from main package
import { configureLogger, Logger } from 'lockness'
```

## Quick Start

### Basic Usage

```typescript
import { Logger } from '@lockness/logger'

const log = new Logger()

await log.info('Application started')
await log.warn('Low disk space', { available: '10GB' })
await log.error('Database connection failed', new Error('Connection timeout'))
```

### Global Logger

```typescript
import { configureLogger, logger } from '@lockness/logger'

// Configure once at startup
configureLogger({
    level: LogLevel.DEBUG,
})

// Use anywhere in your app
await logger().info('User logged in', { userId: 123 })
```

### Quick Helpers

```typescript
import { error, info, warn } from '@lockness/logger'

await info('Server started on port 3000')
await warn('Rate limit approaching')
await error('Failed to send email', new Error('SMTP error'))
```

## Log Levels

Logs are filtered by severity threshold:

```typescript
import { Logger, LogLevel } from '@lockness/logger'

const log = new Logger({ level: LogLevel.WARN })

await log.debug('Debug message') // Skipped
await log.info('Info message') // Skipped
await log.warn('Warning message') // Logged
await log.error('Error message') // Logged
await log.fatal('Fatal message') // Logged
```

Level hierarchy (from lowest to highest):

- `DEBUG` (0): Detailed debugging information
- `INFO` (1): General informational messages
- `WARN` (2): Warning messages
- `ERROR` (3): Error conditions
- `FATAL` (4): Critical failures

## Formatters

### Text Formatter (default for production)

```typescript
import { Logger, TextFormatter } from '@lockness/logger'

const log = new Logger({
    formatter: new TextFormatter(),
})

await log.info('User login', { userId: 123 })
// Output: 2024-01-01T12:00:00.000Z INFO  User login {"userId":123}
```

### JSON Formatter (for log aggregation)

```typescript
import { JsonFormatter, Logger } from '@lockness/logger'

const log = new Logger({
    formatter: new JsonFormatter(),
})

await log.info('API request', { method: 'GET', path: '/users' })
// Output: {"timestamp":"2024-01-01T12:00:00.000Z","level":"INFO","message":"API request","method":"GET","path":"/users"}
```

### Pretty Formatter (for development)

```typescript
import { Logger, PrettyFormatter } from '@lockness/logger'

const log = new Logger({
    formatter: new PrettyFormatter(),
})

await log.info('Server ready')
// Output: ℹ️  12:00:00 INFO  Server ready (with colors!)
```

## Transports

Transports determine where logs are sent.

### Console Transport

```typescript
import { ConsoleTransport, Logger } from '@lockness/logger'

const log = new Logger({
    transports: [new ConsoleTransport()],
})

await log.info('Console output')
```

### File Transport

```typescript
import { FileTransport, Logger, TextFormatter } from '@lockness/logger'

const log = new Logger({
    transports: [
        new FileTransport('./logs/app.log', new TextFormatter()),
    ],
})

await log.info('Written to file')

// Close file handles when done
await log.close()
```

### Memory Transport (for testing)

```typescript
import { Logger, MemoryTransport } from '@lockness/logger'

const memory = new MemoryTransport()
const log = new Logger({
    transports: [memory],
})

await log.info('Test message')

const logs = memory.getLogs()
console.log(logs) // [{ level: 1, message: '...', ... }]

memory.clear() // Clear logs
```

### Multiple Transports

```typescript
import {
    ConsoleTransport,
    FileTransport,
    Logger,
    PrettyFormatter,
    TextFormatter,
} from '@lockness/logger'

const log = new Logger({
    transports: [
        new ConsoleTransport(), // Pretty console output
        new FileTransport('./logs/app.log', new TextFormatter()),
    ],
    formatter: new PrettyFormatter(),
})

// Logs to both console and file
await log.info('Logged everywhere')
```

## Contextual Logging

Create child loggers with inherited context:

```typescript
import { Logger } from '@lockness/logger'

const appLog = new Logger({ context: 'App' })

const dbLog = appLog.child('Database')
const cacheLog = appLog.child('Cache')

await dbLog.info('Query executed')
// Output: ... [App:Database] Query executed

await cacheLog.info('Cache hit')
// Output: ... [App:Cache] Cache hit
```

Nested contexts:

```typescript
const serverLog = new Logger({ context: 'Server' })
const apiLog = serverLog.child('API')
const userLog = apiLog.child('Users')

await userLog.info('User created')
// Output: ... [Server:API:Users] User created
```

## Metadata

Attach structured data to logs:

```typescript
await log.info('User action', {
    userId: 123,
    action: 'login',
    ip: '127.0.0.1',
})
```

Error objects are automatically expanded:

```typescript
try {
    throw new Error('Database connection failed')
} catch (err) {
    await log.error('Connection error', err)
    // Includes: error message, stack trace, error name
}
```

Custom error metadata:

```typescript
await log.error('Request failed', {
    statusCode: 500,
    endpoint: '/api/users',
    duration: 1234,
})
```

## API Reference

### Logger

#### Constructor

```typescript
new Logger(config?: LoggerConfig)
```

Options:

- `level?: LogLevel` - Minimum log level (default: `INFO`)
- `transports?: LogTransport[]` - Output destinations (default:
  `[ConsoleTransport]`)
- `formatter?: LogFormatter` - Log format (default: `PrettyFormatter`)
- `context?: string` - Logger context name

#### Methods

```typescript
setLevel(level: LogLevel): void
getLevel(): LogLevel
addTransport(transport: LogTransport): void
child(context: string): Logger

debug(message: string, metadata?: Record<string, unknown>): Promise<void>
info(message: string, metadata?: Record<string, unknown>): Promise<void>
warn(message: string, metadata?: Record<string, unknown>): Promise<void>
error(message: string, error?: Error | Record<string, unknown>): Promise<void>
fatal(message: string, error?: Error | Record<string, unknown>): Promise<void>

close(): Promise<void>
```

### Global Functions

```typescript
configureLogger(config?: LoggerConfig): Logger
logger(): Logger
createLogger(config?: LoggerConfig): Logger

debug(message: string, metadata?: Record<string, unknown>): Promise<void>
info(message: string, metadata?: Record<string, unknown>): Promise<void>
warn(message: string, metadata?: Record<string, unknown>): Promise<void>
error(message: string, error?: Error | Record<string, unknown>): Promise<void>
fatal(message: string, error?: Error | Record<string, unknown>): Promise<void>
```

## Use Cases

### HTTP Request Logging

```typescript
import { JsonFormatter, Logger } from '@lockness/logger'

const httpLog = new Logger({
    context: 'HTTP',
    formatter: new JsonFormatter(),
})

// Log incoming requests
await httpLog.info('Request received', {
    method: 'POST',
    path: '/api/users',
    ip: '192.168.1.1',
})

// Log responses
await httpLog.info('Response sent', {
    status: 201,
    duration: 45,
})
```

### Error Tracking

```typescript
import { Logger } from '@lockness/logger'

const errorLog = new Logger({ context: 'ErrorHandler' })

try {
    await riskyOperation()
} catch (error) {
    await errorLog.error('Operation failed', error as Error)
    // Logs: message, stack trace, error name
}
```

### Service-Specific Logging

```typescript
import { Logger } from '@lockness/logger'

const appLog = new Logger({ context: 'App' })

// Database logger
const dbLog = appLog.child('DB')
await dbLog.info('Connected to PostgreSQL')
await dbLog.debug('Query', { sql: 'SELECT * FROM users', duration: 23 })

// Cache logger
const cacheLog = appLog.child('Cache')
await cacheLog.info('Redis connected')
await cacheLog.debug('Cache hit', { key: 'user:123' })

// Queue logger
const queueLog = appLog.child('Queue')
await queueLog.info('Worker started')
await queueLog.warn('Queue backlog', { count: 1000 })
```

### Development vs Production

```typescript
import {
    ConsoleTransport,
    FileTransport,
    JsonFormatter,
    Logger,
    LogLevel,
    PrettyFormatter,
} from '@lockness/logger'

const isDev = Deno.env.get('ENV') === 'development'

const log = new Logger({
    level: isDev ? LogLevel.DEBUG : LogLevel.INFO,
    formatter: isDev ? new PrettyFormatter() : new JsonFormatter(),
    transports: isDev ? [new ConsoleTransport()] : [
        new FileTransport('./logs/app.log'),
        new ConsoleTransport(),
    ],
})
```

### Structured Application Logs

```typescript
import { Logger, LogLevel } from '@lockness/logger'

const log = new Logger({
    level: LogLevel.INFO,
    context: 'MyApp',
})

// Application lifecycle
await log.info('Application starting', {
    version: '1.0.0',
    env: Deno.env.get('ENV'),
})

await log.info('Database connected', {
    host: 'localhost',
    database: 'myapp',
})

await log.info('Server listening', {
    port: 3000,
    mode: 'production',
})

// User actions
await log.info('User registered', {
    userId: 'abc123',
    email: 'user@example.com',
})

// Errors
await log.error('Payment failed', {
    userId: 'abc123',
    amount: 99.99,
    gateway: 'stripe',
    errorCode: 'card_declined',
})
```

## Testing

Run the test suite:

```bash
cd lockness/logger
deno task test
```

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
await log.debug('Variable value:', { value: x }) // Development only
await log.info('User logged in') // Informational
await log.warn('Cache miss') // Warnings
await log.error('Failed to save', err) // Errors
await log.fatal('Database unavailable', err) // Critical
```

### 2. Add Context to Loggers

```typescript
const userLog = appLog.child('UserService')
const orderLog = appLog.child('OrderService')
```

### 3. Include Metadata

```typescript
await log.info('Order placed', {
    orderId: 'ORD-123',
    userId: 456,
    total: 99.99,
})
```

### 4. Log Errors with Stack Traces

```typescript
try {
    await operation()
} catch (err) {
    await log.error('Operation failed', err as Error)
}
```

### 5. Use JSON Format for Production

```typescript
import { JsonFormatter } from '@lockness/logger'

const log = new Logger({
    formatter: new JsonFormatter(),
})
```

### 6. Close File Transports

```typescript
const log = new Logger({
    transports: [new FileTransport('./app.log')],
})

// ... application logic ...

await log.close() // Close file handles
```

### 7. Configure Once, Use Everywhere

```typescript
// app.ts
configureLogger({
    level: LogLevel.INFO,
    formatter: new JsonFormatter(),
})

// any-file.ts
import { logger } from '@lockness/logger'
await logger().info('Ready')
```

## Performance

- Logs below threshold are skipped (no formatting overhead)
- Async operations don't block application
- Formatting happens once, then sent to all transports
- Memory transport is fast for testing

## Custom Transport

Create your own transport:

```typescript
import type { LogEntry, LogTransport } from '@lockness/logger'

class SlackTransport implements LogTransport {
    constructor(private webhookUrl: string) {}

    async log(entry: LogEntry): Promise<void> {
        if (entry.level >= LogLevel.ERROR) {
            await fetch(this.webhookUrl, {
                method: 'POST',
                body: JSON.stringify({
                    text: entry.message,
                }),
            })
        }
    }
}

const log = new Logger({
    transports: [
        new ConsoleTransport(),
        new SlackTransport('https://hooks.slack.com/...'),
    ],
})
```

## License

MIT
