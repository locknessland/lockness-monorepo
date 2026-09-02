# @lockness/container

Lightweight Dependency Injection container for TypeScript/Deno applications.
Simple, powerful, and framework-agnostic.

## Features

- **Singleton Management**: Automatic singleton instance creation and caching
- **Property Injection**: `@Inject` decorator for declarative dependencies
- **Service Markers**: `@Service` decorator for documentation
- **Isolated Contexts**: Create multiple container instances
- **Zero Dependencies**: Pure TypeScript implementation
- **Framework Agnostic**: Use with any framework or standalone
- **TypeScript Native**: Full type safety and IntelliSense support
- **Tiny**: ~250 lines of code

## Installation

```typescript
import { container, Inject, Service } from '@lockness/container'
// or from core
import { container, Inject, Service } from '@lockness/core'
```

## Quick Start

### Basic Usage

```typescript
import { container } from '@lockness/container'

class UserService {
    getUsers() {
        return ['Alice', 'Bob', 'Charlie']
    }
}

// Get or create singleton instance
const userService = container.get(UserService)
console.log(userService.getUsers())
```

### With Decorators

```typescript
import { container, Inject, Service } from '@lockness/container'

@Service()
class DatabaseService {
    query(sql: string) {
        return `Executing: ${sql}`
    }
}

@Service()
class UserRepository {
    @Inject(DatabaseService)
    db!: DatabaseService

    findAll() {
        return this.db.query('SELECT * FROM users')
    }
}

// Get the service with all dependencies injected
const repo = container.get(UserRepository)
console.log(repo.findAll())
// Output: "Executing: SELECT * FROM users"
```

## Core API

### Container Class

#### `get<T>(ServiceClass): T`

Get or create a singleton instance of a service.

```typescript
const userService = container.get(UserService)
const sameInstance = container.get(UserService) // returns same instance
```

#### `set(token, instance): void`

Manually register a service instance.

```typescript
const config = new ConfigService({ apiKey: 'secret' })
container.set(ConfigService, config)
```

#### `has(token): boolean`

Check if a service is registered.

```typescript
if (container.has(UserService)) {
    console.log('Service is registered')
}
```

#### `delete(token): boolean`

Remove a service from the container.

```typescript
container.delete(UserService)
```

#### `clear(): void`

Remove all services from the container.

```typescript
container.clear() // useful for testing
```

#### `size: number`

Get the number of registered services.

```typescript
console.log(`Container has ${container.size} services`)
```

#### `registrations(): ContainerRegistration[]`

Enumerate the container's registrations, read-only. Returns one descriptor per
registered token — `{ id, token, resolved }` — where `id` is a display-ready
name (a class's name, a symbol's description, or the string token), `token` is
the raw key you can hand back to `get()`, and `resolved` reports whether an
instance currently exists.

Reading the container **instantiates nothing** (it never calls `get()`) and
**mutates nothing**; the returned array and its entries are fresh on every call,
so mutating them cannot reach the container.

```typescript
container.get(UserService)
container.set(Symbol('ILogger'), new ConsoleLogger())

for (const reg of container.registrations()) {
    console.log(`${reg.id} — ${reg.resolved ? 'resolved' : 'lazy'}`)
    // "UserService — resolved", "ILogger — resolved"
}
```

> **`resolved` today.** The container holds only already-built instances, so
> `resolved` is `true` for every entry. Display it; do not branch on it — its
> meaning is reserved for a future lazy-registration channel.

> **Tokens are identifiers, not secret stores.** Never use secret material as a
> service token: `id` renders it, and error messages already do. Secrets belong
> inside the instance, which `registrations()` never returns.

## Decorators

### @Service()

Mark a class as a service (documentation/marker decorator).

```typescript
@Service()
export class UserService {
    getUsers() {
        return []
    }
}
```

### @Inject(ServiceClass)

Inject a service into a property (lazy instantiation).

```typescript
@Service()
export class UserController {
    @Inject(UserService)
    userService!: UserService

    index() {
        return this.userService.getUsers()
    }
}
```

## Helper Functions

### createContainer()

Create a new isolated container instance.

```typescript
import { createContainer } from '@lockness/container'

const testContainer = createContainer()
testContainer.set(Config, mockConfig)
```

### bind()

Register a service with the global container.

```typescript
import { bind } from '@lockness/container'

// Auto-create singleton
bind(UserService)

// Register pre-created instance
const config = new Config({ apiKey: 'secret' })
bind(Config, config)
```

### resolve()

Resolve a service from the global container (alias for `container.get()`).

```typescript
import { resolve } from '@lockness/container'

const userService = resolve(UserService)
```

## Usage Examples

### Service Layer Pattern

```typescript
import { container, Inject, Service } from '@lockness/container'

@Service()
class LoggerService {
    log(message: string) {
        console.log(`[${new Date().toISOString()}] ${message}`)
    }
}

@Service()
class UserService {
    @Inject(LoggerService)
    logger!: LoggerService

    createUser(name: string) {
        this.logger.log(`Creating user: ${name}`)
        return { id: 1, name }
    }
}

@Service()
class UserController {
    @Inject(UserService)
    userService!: UserService

    async create(req: Request) {
        const { name } = await req.json()
        return this.userService.createUser(name)
    }
}

// Use in your app
const controller = container.get(UserController)
```

### Repository Pattern

```typescript
@Service()
class Database {
    query(sql: string) {
        // Execute query
        return []
    }
}

@Service()
class UserRepository {
    @Inject(Database)
    db!: Database

    findById(id: number) {
        return this.db.query(`SELECT * FROM users WHERE id = ${id}`)
    }

    findAll() {
        return this.db.query('SELECT * FROM users')
    }
}

@Service()
class UserService {
    @Inject(UserRepository)
    repository!: UserRepository

    async getUser(id: number) {
        return this.repository.findById(id)
    }
}

const userService = container.get(UserService)
```

### Constructor Injection Pattern

For complex dependencies, use constructor injection:

```typescript
class DatabaseService {
    constructor(private connectionString: string) {}

    query(sql: string) {
        console.log(`Query on ${this.connectionString}: ${sql}`)
    }
}

class UserRepository {
    constructor(private db: DatabaseService) {}

    findAll() {
        return this.db.query('SELECT * FROM users')
    }
}

// Manual registration with constructor arguments
const db = new DatabaseService('postgresql://localhost:5432/mydb')
container.set(DatabaseService, db)

const repo = new UserRepository(container.get(DatabaseService))
container.set(UserRepository, repo)

// Now you can use it
const repository = container.get(UserRepository)
```

### Configuration Management

```typescript
interface AppConfig {
    apiKey: string
    environment: string
    debug: boolean
}

class ConfigService {
    constructor(private config: AppConfig) {}

    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.config[key]
    }
}

// Register configuration at app startup
const config = new ConfigService({
    apiKey: Deno.env.get('API_KEY') || '',
    environment: Deno.env.get('ENV') || 'development',
    debug: Deno.env.get('DEBUG') === 'true',
})

container.set(ConfigService, config)

// Use anywhere
@Service()
class ApiClient {
    @Inject(ConfigService)
    config!: ConfigService

    async fetch(url: string) {
        const apiKey = this.config.get('apiKey')
        return fetch(url, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        })
    }
}
```

### Testing with Isolated Containers

```typescript
import { createContainer } from '@lockness/container'

Deno.test('UserService creates users', () => {
    // Create isolated test container
    const testContainer = createContainer()

    // Mock dependencies
    class MockLogger {
        logs: string[] = []
        log(message: string) {
            this.logs.push(message)
        }
    }

    const mockLogger = new MockLogger()
    testContainer.set(LoggerService, mockLogger)

    // Test with mocked dependencies
    class TestUserService {
        constructor(private logger: any) {}

        createUser(name: string) {
            this.logger.log(`Creating ${name}`)
            return { id: 1, name }
        }
    }

    const userService = new TestUserService(
        testContainer.get(LoggerService),
    )
    userService.createUser('Test User')

    assertEquals(mockLogger.logs.length, 1)
    assertEquals(mockLogger.logs[0], 'Creating Test User')
})
```

### Multiple Container Instances

```typescript
import { createContainer } from '@lockness/container'

// Global container for main app
const mainContainer = createContainer()
mainContainer.set(DatabaseService, mainDatabase)

// Separate container for background jobs
const jobsContainer = createContainer()
jobsContainer.set(DatabaseService, jobsDatabase)

// Each container has isolated services
class MainWorker {
    constructor(private container: Container) {}

    process() {
        const db = this.container.get(DatabaseService)
        // Uses mainDatabase
    }
}

class BackgroundWorker {
    constructor(private container: Container) {}

    process() {
        const db = this.container.get(DatabaseService)
        // Uses jobsDatabase
    }
}
```

## Integration with Lockness

When used with Lockness framework:

```typescript
// app/service/user_service.ts
import { Inject, Service } from 'lockness/core'
import { UserRepository } from '@repository/user_repository.ts'

@Service()
export class UserService {
    @Inject(UserRepository)
    repository!: UserRepository

    async createUser(data: any) {
        return await this.repository.create(data)
    }
}

// app/controller/user_controller.tsx
import { Controller, Get, Post } from 'lockness/core'
import { UserService } from '@service/user_service.ts'

@Controller('/users')
export class UserController {
    @Inject(UserService)
    userService!: UserService

    @Get('/')
    async index() {
        return await this.userService.getAll()
    }

    @Post('/')
    async create(ctx: Context) {
        const data = await ctx.req.json()
        return await this.userService.createUser(data)
    }
}
```

## Best Practices

### 1. Use Constructor Injection for Required Dependencies

```typescript
// Good - clear required dependencies
class UserService {
    constructor(
        private db: DatabaseService,
        private logger: LoggerService,
    ) {}
}

// Less clear - optional-looking syntax
class UserService {
    @Inject(DatabaseService)
    db!: DatabaseService
}
```

### 2. Register Configuration Early

```typescript
// At app startup
const config = loadConfig()
container.set(ConfigService, config)

// Then use everywhere
@Service()
class ApiClient {
    @Inject(ConfigService)
    config!: ConfigService
}
```

### 3. Use Isolated Containers for Testing

```typescript
Deno.test('my test', () => {
    const testContainer = createContainer()
    // Register mocks
    testContainer.set(DatabaseService, mockDb)
    // Test in isolation
})
```

### 4. Clear Container Between Tests

```typescript
Deno.test('test 1', () => {
    container.set(Service, instance1)
    // test...
})

Deno.test('test 2', () => {
    container.clear() // Start fresh
    container.set(Service, instance2)
    // test...
})
```

## TypeScript Configuration

Lockness uses **TC39 Stage 3 standard decorators** natively supported by Deno
2+. No special configuration is needed in your `deno.json`.

**Important:** When using `@Inject`, use the `accessor` keyword:

```typescript
@Service()
export class MyService {
    @Inject(Database)
    accessor database!: Database // Use 'accessor', not 'private'
}
```

## Comparison with Other DI Libraries

| Feature               | @lockness/container | TSyringe    | InversifyJS |
| --------------------- | ------------------- | ----------- | ----------- |
| Size                  | ~250 lines          | ~2000 lines | ~5000 lines |
| Deno Native           | ✅                  | ❌          | ❌          |
| Zero Dependencies     | ✅                  | ❌          | ❌          |
| Decorators            | ✅                  | ✅          | ✅          |
| Constructor Injection | Manual              | ✅          | ✅          |
| Lifetime Management   | Singleton           | Multiple    | Multiple    |
| Learning Curve        | Easy                | Medium      | Complex     |

**When to use @lockness/container:**

- ✅ Deno applications
- ✅ Simple DI needs
- ✅ Small to medium projects
- ✅ Framework-agnostic code

**When to use alternatives:**

- Need advanced features (scoped lifetimes, auto-wiring)
- Large enterprise applications
- Need Node.js compatibility

## FAQ

**Q: Does this support constructor injection?**\
A: Yes, but manually. Use `container.get()` in your constructor or factory
functions.

**Q: Can I use interfaces as tokens?**\
A: No, TypeScript interfaces don't exist at runtime. Use classes or symbols as
tokens.

**Q: Is this thread-safe?**\
A: JavaScript is single-threaded, so yes. For Web Workers, use separate
container instances.

**Q: Can I override services?**\
A: Yes, use `container.set()` to replace existing services.

**Q: How do I test code that uses the container?**\
A: Use `createContainer()` for isolated test contexts, or clear and mock the
global container.

## License

MIT
