# Dependency Injection

Lockness JS features a built-in **Service Container** (or IoC - Inversion of
Control) to manage your application's dependencies. This system allows for
better code organization, easier testing, and a cleaner MVC architecture.

---

## 🚀 Key Concepts

### Dependency Injection (DI)

Instead of manually instantiating classes inside other classes, Lockness
"injects" them automatically. This decouples your code and makes it much easier
to swap implementations or mock services in tests.

### Service Container

The container is a global registry that keeps track of all your services. In
Lockness, the container is available globally, but vous interact with it
primarily through decorators.

---

## 🛠 Usage

### 1. Declaring a Service

Use the `@Service()` decorator to mark a class as a service that can be managed
by the container.

```typescript
import { Service } from '@lockness/core'

@Service()
export class UserService {
    async findAll() {
        return [{ id: 1, name: 'John Doe' }]
    }
}
```

### 2. Injecting Dependencies

Use the `@Inject()` decorator to automatically resolve a service and assign it
to a property.

> **Important**: Lockness uses TC39 Stage 3 decorators. When injecting a
> property, you MUST use the `accessor` keyword.

```typescript
import { Context, Controller, Get, Inject } from '@lockness/core'
import { UserService } from '../service/user_service.ts'

@Controller('/users')
export class UserController {
    @Inject(UserService)
    accessor userService!: UserService

    @Get('/')
    async index(c: Context) {
        const users = await this.userService.findAll()
        return c.json(users)
    }
}
```

---

## 🏗 Advanced Usage

### Injecting into other Services

Injection isn't limited to controllers. You can inject services into other
services.

```typescript
@Service()
export class NotificationService {
    send(message: string) {/* ... */}
}

@Service()
export class UserService {
    @Inject(NotificationService)
    accessor notifications!: NotificationService

    async create(data: any) {
        // ... logic
        this.notifications.send('User created')
    }
}
```

### Manual Resolution

If you need to resolve a service manually (for example, in a bootstrapper), you
can use the global `container` instance.

```typescript
import { container } from '@lockness/core'
import { Database } from '@lockness/drizzle'

const db = container.get(Database)
```

### Dependency Graph

Lockness automatically resolves the dependency graph. If `Service A` depends on
`Service B`, which depends on `Service C`, the container will instantiate them
in the correct order.

---

## 🛡 Performance & Standard

Lockness natively supports the **TC39 Stage 3 standard decorators** (available
since Deno 2.0 and TypeScript 5.0).

- No `experimentalDecorators` flag needed.
- No `reflect-metadata` overhead.
- Lightning-fast resolution at runtime.
