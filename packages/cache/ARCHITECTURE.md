# Architecture Documentation

## Module Structure

The @lockness/cache package follows a modular architecture with clear separation of concerns:

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
                      │ - remember() │      │ - (future)   │
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
  ↓
drivers/mod.ts ──→ memory_driver.ts, deno_kv_driver.ts
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
- High-level modules (`api.ts`, `store.ts`) depend on abstractions (`CacheDriver`)
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

## Example: Adding a New Driver

To add a Redis driver:

1. Create `drivers/redis_driver.ts`:
```typescript
import type { CacheDriver, CacheItem } from '../types.ts'
import { getCacheKey, getExpiresAt, isExpired } from '../config.ts'

export class RedisCacheDriver implements CacheDriver {
    constructor(private redis: RedisClient) {}
    
    async get<T>(key: string): Promise<T | null> {
        // Implementation
    }
    
    // ... implement other methods
}
```

2. Export from `drivers/mod.ts`:
```typescript
export { RedisCacheDriver } from './redis_driver.ts'
```

3. Update factory in `store.ts`:
```typescript
function getDriver(): CacheDriver {
    const config = getCacheConfig()
    switch (config.driver) {
        case 'redis':
            return new RedisCacheDriver(config.redisClient)
        // ... other cases
    }
}
```

4. Update types in `types.ts`:
```typescript
export interface CacheConfig {
    driver: 'memory' | 'deno-kv' | 'redis'
    // ... other fields
}
```

That's it! The new driver is now available to all users.
