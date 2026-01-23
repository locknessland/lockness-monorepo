# Technical Task: @Cached Decorator

## 📋 Task Overview

Implement a `@Cached` decorator that integrates with `@lockness/cache` to
automatically cache method return values. This provides a declarative way to add
caching to expensive computations or database queries.

## 🎯 Objectives

1. **Primary Objective**: Create `@Cached` decorator for automatic method result
   caching
2. **Secondary Objective**: Support cache key generation from method arguments
3. **Additional Objective**: Integrate with existing tag-based invalidation
4. **Quality Objective**: Full type safety preserving method signatures
5. **Documentation Objective**: Complete JSDoc, examples, and LLM documentation

## 📁 Affected File Paths

### Files to Modify

- `/packages/cache/mod.ts` - Export new decorator
- `/packages/cache/README.md` - Document decorator usage
- `/packages/cache/docs/DOCS.md` - User documentation

### New Files to Create

- `/packages/cache/decorators.ts` - `@Cached`, `@CacheInvalidate` decorators
- `/packages/cache/tests/decorators.test.ts` - Unit tests

## 🏗️ Current Cache API

Le package `@lockness/cache` expose déjà :

```typescript
// Functional API
import { flush, flushByTag, forget, get, remember, set } from '@lockness/cache'

await set('key', value, ttl, tags)
const value = await get('key')
const value = await remember('key', () => expensiveOp(), ttl)
await forget('key')
await flushByTag('tag')

// Fluent API
import { cache } from '@lockness/cache'

await cache('tag1', 'tag2').set('key', value, ttl)
await cache('tag1').flush()
```

## 🎨 Proposed API Design

### Target User-Facing API (Simple Version)

```typescript
import { Cached } from '@lockness/cache'

class UserService {
    @Cached('5m')
    async getUser(id: number): Promise<User> {
        return await db.query.users.findFirst({ where: eq(users.id, id) })
    }

    @Cached('1h')
    async getAllUsers(): Promise<User[]> {
        return await db.query.users.findMany()
    }
}
```

### Target User-Facing API (Advanced Version)

```typescript
import { Cached, CacheInvalidate } from '@lockness/cache'

class UserService {
    @Cached({
        ttl: '5m',
        key: (id: number) => `user:${id}`,
        tags: ['users'],
    })
    async getUser(id: number): Promise<User> {
        return await db.query.users.findFirst({ where: eq(users.id, id) })
    }

    @Cached({
        ttl: '1h',
        key: 'users:all',
        tags: ['users', 'lists'],
        condition: (users) => users.length > 0, // Only cache non-empty
    })
    async getAllUsers(): Promise<User[]> {
        return await db.query.users.findMany()
    }

    @CacheInvalidate({ tags: ['users'] })
    async createUser(data: CreateUserDTO): Promise<User> {
        return await db.insert(users).values(data).returning()
    }

    @CacheInvalidate({ key: (id: number) => `user:${id}` })
    async updateUser(id: number, data: UpdateUserDTO): Promise<User> {
        return await db.update(users).set(data).where(eq(users.id, id))
            .returning()
    }
}
```

### TTL Formats

```typescript
@Cached('30s')   // 30 seconds
@Cached('5m')    // 5 minutes
@Cached('1h')    // 1 hour
@Cached('1d')    // 1 day
@Cached(300)     // 300 seconds (number)
@Cached(0)       // Forever (no expiration)
```

## 📝 Detailed Implementation Steps

### Phase 1: Core Types

**Step 1.1: Type Definitions**

File: `/packages/cache/decorators.ts`

````typescript
/**
 * @fileoverview Cache decorators for automatic method result caching.
 *
 * @module @lockness/cache
 */

import { flushByTag, forget, remember } from './api.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * TTL format: number (seconds) or string with unit
 * @example '30s', '5m', '1h', '1d', 300
 */
export type TTLFormat = number | `${number}${'s' | 'm' | 'h' | 'd'}`

/**
 * Key generator function
 */
export type KeyGenerator<Args extends unknown[]> = (...args: Args) => string

/**
 * Condition function to determine if result should be cached
 */
export type CacheCondition<T> = (result: T) => boolean

/**
 * Options for @Cached decorator
 */
export interface CachedOptions<
    Args extends unknown[] = unknown[],
    Result = unknown,
> {
    /**
     * Time-to-live for cached value
     * @example '5m', '1h', 300
     */
    readonly ttl: TTLFormat

    /**
     * Cache key or key generator function.
     * If not provided, auto-generates from class.method(args)
     * @example 'users:all'
     * @example (id) => `user:${id}`
     */
    readonly key?: string | KeyGenerator<Args>

    /**
     * Tags for grouped invalidation
     * @example ['users', 'api']
     */
    readonly tags?: readonly string[]

    /**
     * Condition to determine if result should be cached.
     * Return false to skip caching.
     * @example (users) => users.length > 0
     */
    readonly condition?: CacheCondition<Result>

    /**
     * Whether to refresh cache in background when stale
     * (serves stale value while refreshing)
     * @default false
     */
    readonly staleWhileRevalidate?: boolean
}

/**
 * Options for @CacheInvalidate decorator
 */
export interface CacheInvalidateOptions<Args extends unknown[] = unknown[]> {
    /**
     * Specific key(s) to invalidate
     */
    readonly key?: string | KeyGenerator<Args> | readonly string[]

    /**
     * Tags to invalidate (flushes all entries with these tags)
     */
    readonly tags?: readonly string[]

    /**
     * When to invalidate: before or after method execution
     * @default 'after'
     */
    readonly timing?: 'before' | 'after'
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Parse TTL format to seconds
 */
export function parseTTL(ttl: TTLFormat): number {
    if (typeof ttl === 'number') {
        return ttl
    }

    const match = ttl.match(/^(\d+)(s|m|h|d)$/)
    if (!match) {
        throw new Error(`Invalid TTL format: ${ttl}`)
    }

    const value = parseInt(match[1], 10)
    const unit = match[2]

    switch (unit) {
        case 's':
            return value
        case 'm':
            return value * 60
        case 'h':
            return value * 60 * 60
        case 'd':
            return value * 60 * 60 * 24
        default:
            throw new Error(`Unknown time unit: ${unit}`)
    }
}

/**
 * Generate a cache key from class, method, and arguments
 */
function generateKey(
    className: string,
    methodName: string,
    args: unknown[],
): string {
    const argsHash = args.length > 0
        ? ':' + args.map((a) => JSON.stringify(a)).join(':')
        : ''
    return `${className}.${methodName}${argsHash}`
}

// =============================================================================
// @Cached Decorator
// =============================================================================

/**
 * Cache the return value of a method.
 *
 * @param ttlOrOptions - TTL string/number or full options object
 *
 * @example Simple usage
 * ```typescript
 * class UserService {
 *     @Cached('5m')
 *     async getUser(id: number): Promise<User> {
 *         return await db.findUser(id)
 *     }
 * }
 * ```
 *
 * @example With options
 * ```typescript
 * class UserService {
 *     @Cached({
 *         ttl: '1h',
 *         key: (id) => `user:${id}`,
 *         tags: ['users'],
 *         condition: (user) => user !== null,
 *     })
 *     async getUser(id: number): Promise<User | null> {
 *         return await db.findUser(id)
 *     }
 * }
 * ```
 */
export function Cached<
    Args extends unknown[],
    Result,
>(
    ttlOrOptions: TTLFormat | CachedOptions<Args, Result>,
): <T extends (...args: Args) => Promise<Result>>(
    originalMethod: T,
    context: ClassMethodDecoratorContext,
) => T {
    // Normalize options
    const options: CachedOptions<Args, Result> =
        typeof ttlOrOptions === 'object' &&
            !Array.isArray(ttlOrOptions) &&
            'ttl' in ttlOrOptions
            ? ttlOrOptions
            : { ttl: ttlOrOptions as TTLFormat }

    const ttlSeconds = parseTTL(options.ttl)

    return function <T extends (...args: Args) => Promise<Result>>(
        originalMethod: T,
        context: ClassMethodDecoratorContext,
    ): T {
        if (context.kind !== 'method') {
            throw new Error('@Cached can only decorate methods')
        }

        const methodName = String(context.name)

        const wrapper = async function (
            this: object,
            ...args: Args
        ): Promise<Result> {
            const className = this.constructor.name

            // Generate cache key
            let cacheKey: string
            if (typeof options.key === 'function') {
                cacheKey = options.key(...args)
            } else if (typeof options.key === 'string') {
                cacheKey = options.key
            } else {
                cacheKey = generateKey(className, methodName, args)
            }

            // Use remember pattern
            const result = await remember<Result>(
                cacheKey,
                async () => {
                    const value = await originalMethod.call(this, ...args)

                    // Check condition
                    if (options.condition && !options.condition(value)) {
                        // Don't cache, but we still need to return the value
                        // The remember function will cache it anyway, so we need
                        // to immediately invalidate if condition fails
                        setTimeout(() => forget(cacheKey), 0)
                    }

                    return value
                },
                ttlSeconds,
                options.tags ? [...options.tags] : undefined,
            )

            return result
        }

        return wrapper as T
    }
}

// =============================================================================
// @CacheInvalidate Decorator
// =============================================================================

/**
 * Invalidate cache entries when a method is called.
 *
 * Use this to clear cached data when it becomes stale
 * (e.g., after create/update/delete operations).
 *
 * @param options - Invalidation options
 *
 * @example Invalidate by tags
 * ```typescript
 * class UserService {
 *     @CacheInvalidate({ tags: ['users'] })
 *     async createUser(data: CreateUserDTO): Promise<User> {
 *         return await db.insert(users).values(data)
 *     }
 * }
 * ```
 *
 * @example Invalidate specific key
 * ```typescript
 * class UserService {
 *     @CacheInvalidate({ key: (id) => `user:${id}` })
 *     async updateUser(id: number, data: UpdateUserDTO): Promise<User> {
 *         return await db.update(users).set(data).where(eq(id))
 *     }
 * }
 * ```
 *
 * @example Invalidate before execution
 * ```typescript
 * class UserService {
 *     @CacheInvalidate({ tags: ['users'], timing: 'before' })
 *     async deleteAllUsers(): Promise<void> {
 *         await db.delete(users)
 *     }
 * }
 * ```
 */
export function CacheInvalidate<Args extends unknown[]>(
    options: CacheInvalidateOptions<Args>,
): <T extends (...args: Args) => Promise<unknown>>(
    originalMethod: T,
    context: ClassMethodDecoratorContext,
) => T {
    const timing = options.timing ?? 'after'

    return function <T extends (...args: Args) => Promise<unknown>>(
        originalMethod: T,
        context: ClassMethodDecoratorContext,
    ): T {
        if (context.kind !== 'method') {
            throw new Error('@CacheInvalidate can only decorate methods')
        }

        const wrapper = async function (
            this: object,
            ...args: Args
        ): Promise<unknown> {
            const invalidate = async () => {
                // Invalidate by key(s)
                if (options.key) {
                    if (typeof options.key === 'function') {
                        await forget(options.key(...args))
                    } else if (Array.isArray(options.key)) {
                        await Promise.all(options.key.map((k) => forget(k)))
                    } else {
                        await forget(options.key)
                    }
                }

                // Invalidate by tags
                if (options.tags) {
                    await Promise.all(
                        options.tags.map((tag) => flushByTag(tag)),
                    )
                }
            }

            if (timing === 'before') {
                await invalidate()
            }

            const result = await originalMethod.call(this, ...args)

            if (timing === 'after') {
                await invalidate()
            }

            return result
        }

        return wrapper as T
    }
}
````

### Phase 2: Exports

**Step 2.1: Update mod.ts**

File: `/packages/cache/mod.ts` - Add exports

```typescript
// =============================================================================
// Decorator Exports
// =============================================================================

export {
    type CacheCondition,
    Cached,
    type CachedOptions,
    CacheInvalidate,
    type CacheInvalidateOptions,
    type KeyGenerator,
    parseTTL,
    type TTLFormat,
} from './decorators.ts'
```

### Phase 3: Tests

**Step 3.1: Unit Tests**

File: `/packages/cache/tests/decorators.test.ts`

```typescript
import { assertEquals, assertExists } from '@std/assert'
import { Cached, CacheInvalidate, parseTTL } from '../decorators.ts'
import { configureCache, flush, get } from '../mod.ts'

// Setup memory driver for tests
configureCache({ driver: 'memory', ttl: 60 })

Deno.test('parseTTL - parses seconds', () => {
    assertEquals(parseTTL('30s'), 30)
    assertEquals(parseTTL('1s'), 1)
})

Deno.test('parseTTL - parses minutes', () => {
    assertEquals(parseTTL('5m'), 300)
    assertEquals(parseTTL('1m'), 60)
})

Deno.test('parseTTL - parses hours', () => {
    assertEquals(parseTTL('1h'), 3600)
    assertEquals(parseTTL('2h'), 7200)
})

Deno.test('parseTTL - parses days', () => {
    assertEquals(parseTTL('1d'), 86400)
})

Deno.test('parseTTL - accepts numbers', () => {
    assertEquals(parseTTL(300), 300)
    assertEquals(parseTTL(0), 0)
})

Deno.test('@Cached - caches method result', async () => {
    await flush()

    let callCount = 0

    class TestService {
        @Cached('5m')
        async getData(): Promise<string> {
            callCount++
            return 'data'
        }
    }

    const service = new TestService()

    // First call - should execute method
    const result1 = await service.getData()
    assertEquals(result1, 'data')
    assertEquals(callCount, 1)

    // Second call - should return cached
    const result2 = await service.getData()
    assertEquals(result2, 'data')
    assertEquals(callCount, 1) // Still 1!
})

Deno.test('@Cached - generates different keys for different args', async () => {
    await flush()

    let callCount = 0

    class TestService {
        @Cached('5m')
        async getById(id: number): Promise<string> {
            callCount++
            return `item-${id}`
        }
    }

    const service = new TestService()

    await service.getById(1)
    await service.getById(2)
    await service.getById(1) // Should be cached

    assertEquals(callCount, 2) // Only 2 calls, not 3
})

Deno.test('@Cached - uses custom key generator', async () => {
    await flush()

    class TestService {
        @Cached({
            ttl: '5m',
            key: (id: number) => `custom:${id}`,
        })
        async getById(id: number): Promise<string> {
            return `item-${id}`
        }
    }

    const service = new TestService()
    await service.getById(42)

    const cached = await get('custom:42')
    assertExists(cached)
})

Deno.test('@CacheInvalidate - invalidates by tag', async () => {
    await flush()

    class TestService {
        @Cached({ ttl: '5m', tags: ['items'] })
        async getAll(): Promise<string[]> {
            return ['a', 'b', 'c']
        }

        @CacheInvalidate({ tags: ['items'] })
        async create(): Promise<void> {
            // Creates item
        }
    }

    const service = new TestService()

    // Cache the data
    await service.getAll()
    const cached1 = await get('TestService.getAll')
    assertExists(cached1)

    // Invalidate
    await service.create()

    // Should be invalidated
    const cached2 = await get('TestService.getAll')
    assertEquals(cached2, null)
})
```

## 🔄 Usage Examples

### Basic Service Pattern

```typescript
import { Cached, CacheInvalidate } from '@lockness/cache'

class ProductService {
    @Cached('10m')
    async getProduct(id: number): Promise<Product> {
        return await db.query.products.findFirst({
            where: eq(products.id, id),
        })
    }

    @Cached({ ttl: '1h', tags: ['products', 'catalog'] })
    async getAllProducts(): Promise<Product[]> {
        return await db.query.products.findMany()
    }

    @CacheInvalidate({
        key: (id) => `ProductService.getProduct:${id}`,
        tags: ['products'],
    })
    async updateProduct(id: number, data: UpdateProductDTO): Promise<Product> {
        return await db.update(products)
            .set(data)
            .where(eq(products.id, id))
            .returning()
    }
}
```

### With Repository Pattern

```typescript
import { Cached, CacheInvalidate } from '@lockness/cache'

class UserRepository {
    @Cached({
        ttl: '5m',
        key: (id) => `user:${id}`,
        tags: ['users'],
        condition: (user) => user !== null,
    })
    async findById(id: number): Promise<User | null> {
        return await db.query.users.findFirst({
            where: eq(users.id, id),
        })
    }

    @Cached({
        ttl: '30m',
        key: 'users:count',
        tags: ['users', 'stats'],
    })
    async count(): Promise<number> {
        const result = await db.select({ count: count() }).from(users)
        return result[0].count
    }

    @CacheInvalidate({ tags: ['users'] })
    async save(user: User): Promise<User> {
        // Insert or update
    }

    @CacheInvalidate({
        key: (id) => `user:${id}`,
        tags: ['users'],
    })
    async delete(id: number): Promise<void> {
        await db.delete(users).where(eq(users.id, id))
    }
}
```

### Controller with Cached Responses

```typescript
import { Controller, Get } from '@lockness/core'
import { Cached } from '@lockness/cache'

@Controller('/api/stats')
class StatsController {
    @Get('/dashboard')
    @Cached('5m') // Cache entire response
    async getDashboard(): Promise<DashboardData> {
        const [users, orders, revenue] = await Promise.all([
            this.userService.count(),
            this.orderService.countToday(),
            this.orderService.revenueToday(),
        ])
        return { users, orders, revenue }
    }
}
```

## ✅ Definition of Done

- [ ] `@Cached` decorator implemented
- [ ] `@CacheInvalidate` decorator implemented
- [ ] TTL parsing (seconds, minutes, hours, days)
- [ ] Custom key generators
- [ ] Tag-based invalidation
- [ ] Condition-based caching
- [ ] All tests passing
- [ ] **JSDoc documentation complete**
  - [ ] File-level `@fileoverview` and `@module` tags
  - [ ] All public functions documented
  - [ ] `@param`, `@returns`, `@example` tags included
- [ ] **Type safety enforced**
  - [ ] No `any` types
  - [ ] Generic types preserve method signatures
- [ ] README.md updated
- [ ] docs/DOCS.md updated
- [ ] **Quality checks passed**
  - [ ] `deno check packages/cache/**/*.ts` passes
  - [ ] `deno lint packages/cache/` passes
  - [ ] `deno test packages/cache/tests/` passes

## 🔗 Related Tasks

- Integrates with existing `@lockness/cache` package
- Can be combined with `@Schedule` for periodic cache warming

## 📅 Timeline

- **Estimated Effort**: 4-5 hours
- **Priority**: High (améliore significativement la DX)

## 📝 Notes

### Design Decisions

1. **Pourquoi `remember` pattern ?** - Réutilise l'API existante du package
   cache
2. **Pourquoi les tags ?** - Intégration naturelle avec `flushByTag` existant
3. **Pourquoi TTL string ?** - Plus lisible que des nombres

### Future Enhancements

- `staleWhileRevalidate` option (sert le cache périmé pendant le refresh)
- Cache metrics (hit/miss ratio)
- Cache warming decorator (`@WarmCache`)
- Distributed cache locking pour éviter les stampedes

---

_Task created: 2026-01-24_
