# Architecture Documentation

## Module Structure

The @lockness/cache package follows a modular architecture with clear separation
of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│  mod.ts (Public API - Entry Point)                              │
│  - Re-exports all public types and functions                    │
│  - Maintains backward compatibility                             │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  types.ts    │      │  config.ts   │      │   store.ts   │
│              │      │              │      │              │
│ - Interfaces │      │ - Config mgmt│      │ - CacheStore │
│ - Types      │      │ - Helpers    │      │ - getDriver()│
│              │      │              │      │ - cache()    │
└──────────────┘      └──────────────┘      └──────────────┘
                              │                     │
                              │                     │
                              ▼                     ▼
                      ┌──────────────┐      ┌──────────────┐
                      │   api.ts     │      │  drivers/    │
                      │              │      │              │
                      │ - get()      │      │ - memory     │
                      │ - set()      │      │ - deno-kv    │
                      │ - remember() │      │ - redis      │
                      │ - etc.       │      │              │
                      └──────────────┘      └──────────────┘
```

## Dependency Graph

```
types.ts
  ↓
config.ts ──→ types.ts
  ↓
drivers/memory_driver.ts ──→ types.ts, config.ts
drivers/deno_kv_driver.ts ──→ types.ts, config.ts
drivers/redis_driver.ts ──→ types.ts, config.ts
  ↓
drivers/mod.ts ──→ memory_driver.ts, deno_kv_driver.ts, redis_driver.ts
  ↓
store.ts ──→ types.ts, config.ts, drivers/mod.ts
  ↓
api.ts ──→ store.ts
  ↓
mod.ts ──→ types.ts, config.ts, drivers/mod.ts, store.ts, api.ts
```

## SOLID Principles Applied

### Single Responsibility Principle (SRP)

Each module has one clear responsibility:

- **types.ts**: Type definitions only
- **config.ts**: Configuration management and helper functions
- **api.ts**: Public API functions
- **store.ts**: Fluent cache store and driver management
- **drivers/\*.ts**: Driver implementations (one per file)

### Open/Closed Principle (OCP)

- New drivers can be added to `drivers/` without modifying existing code
- Factory pattern in `store.ts` allows easy driver registration
- Example: Adding Redis driver only requires:
  1. Create `drivers/redis_driver.ts`
  2. Export from `drivers/mod.ts`
  3. Update factory in `store.ts`

### Liskov Substitution Principle (LSP)

- All drivers implement the `CacheDriver` interface
- Any driver can be swapped without breaking functionality
- Consumers depend on the interface, not implementations

### Interface Segregation Principle (ISP)

- The `CacheDriver` interface defines a cohesive set of cache operations
- No "fat interfaces" forcing drivers to implement unused methods
- All methods are relevant to caching

### Dependency Inversion Principle (DIP)

- High-level modules (`api.ts`, `store.ts`) depend on abstractions
  (`CacheDriver`)
- Low-level modules (`drivers/*.ts`) implement abstractions
- Easy to swap or mock drivers for testing

## Benefits

### Maintainability

- **Before**: 960 lines in one file
- **After**: 8 focused files (82-208 lines each)
- Clear separation makes it easy to find and modify code

### Testability

- Each component can be tested in isolation
- Drivers can be easily mocked
- Unit tests can target specific modules

### Extensibility

- Adding new drivers is straightforward
- New cache strategies can be added to `api.ts`
- Store functionality can be extended without touching drivers

### Backward Compatibility

- All existing imports continue to work
- Tests run without modification
- Public API remains unchanged

## Available Drivers

The package includes three cache drivers:

### Memory Driver

Fast in-memory cache, ideal for development and single-instance deployments.

```typescript
import { configureCache } from '@lockness/cache'

configureCache({ driver: 'memory' })
```

### Deno KV Driver

Persistent cache using Deno's built-in KV store.

```typescript
import { configureCache } from '@lockness/cache'

configureCache({
    driver: 'deno-kv',
    kvPath: './data/cache.db',
})
```

### Redis Driver

Distributed cache for multi-instance deployments.

```typescript
import { createClient } from 'npm:redis'
import { RedisCacheDriver, setCacheDriver } from '@lockness/cache'

const redis = createClient({ url: 'redis://localhost:6379' })
await redis.connect()

setCacheDriver(
    new RedisCacheDriver(redis, {
        keyPrefix: 'myapp:cache',
        tagPrefix: 'myapp:tag',
    }),
)
```

## Example: Adding a New Driver

To add a custom driver (e.g., Memcached):

1. Create `drivers/memcached_driver.ts`:

```typescript
import type { CacheDriver, CacheItem } from '../types.ts'
import { getCacheKey, getExpiresAt, isExpired } from '../config.ts'

export class MemcachedCacheDriver implements CacheDriver {
    constructor(private client: MemcachedClient) {}

    async get<T>(key: string): Promise<T | null> {
        // Implementation
    }

    // ... implement other methods
}
```

2. Export from `drivers/mod.ts`:

```typescript
export { MemcachedCacheDriver } from './memcached_driver.ts'
```

3. Use with `setCacheDriver()`:

```typescript
import { MemcachedCacheDriver, setCacheDriver } from '@lockness/cache'

const memcached = new MemcachedClient()
setCacheDriver(new MemcachedCacheDriver(memcached))
```

That's it! The new driver is now available to all users.
