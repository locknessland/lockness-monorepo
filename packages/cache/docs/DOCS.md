# Lockness Cache

High-performance caching system with multiple driver support (Memory, Deno KV,
Redis) and tagging capabilities.

## Overview

@lockness/cache provides a unified caching API with:

- **Simple API** - get, set, remember, forget, flush
- **Multiple Drivers** - Memory (fast, volatile), Deno KV (persistent), Redis
  (distributed)
- **TTL Support** - Automatic expiration with time-to-live
- **Tagging** - Group cache entries for batch invalidation
- **Auto Serialization** - Transparent JSON serialization/deserialization
- **Counters** - Increment/decrement for rate limiting and metrics
- **Batch Operations** - Get/set multiple keys efficiently

## Installation

```typescript
import { cache, configureCache } from '@lockness/cache'
```

## Configuration

```typescript
import { configureCache } from '@lockness/cache'

configureCache({
    driver: 'memory', // or 'deno-kv'
    ttl: 3600, // Default TTL in seconds (1 hour)
    prefix: 'myapp', // Cache key prefix
    kvPath: './data/cache.db', // Optional: Deno KV path
})
```

## Basic Operations

### Get and Set

```typescript
import { flush, forget, get, has, set } from '@lockness/cache'

// Set a value (with default TTL)
await set('user:1', { name: 'John', email: 'john@example.com' })

// Set with custom TTL (5 minutes)
await set('session:abc', sessionData, 300)

// Get a value
const user = await get('user:1')

// Check if exists
if (await has('user:1')) {
    console.log('User cached')
}

// Delete a key
await forget('user:1')

// Clear all cache
await flush()
```

### Cache Forever

```typescript
import { forever } from '@lockness/cache'

// Cache without expiration
await forever('config', configData)

// Same as set() with ttl=0
await set('permanent', data, 0)
```

## Remember Pattern

Cache expensive operations automatically:

```typescript
import { remember, rememberForever } from '@lockness/cache'

// Cache database query result
const users = await remember('all-users', async () => {
    return await db.select().from(users).all()
}, 3600)

// Sync callbacks also work
const config = await remember('app-config', () => {
    return JSON.parse(Deno.readTextFileSync('config.json'))
}, 3600)

// Cache forever
const settings = await rememberForever('settings', async () => {
    return await db.select().from(settings).all()
})
```

How it works:

1. Check if key exists in cache
2. If exists, return cached value
3. If not, execute callback
4. Store result in cache with TTL
5. Return result

## Tagging System

Group related cache entries for batch invalidation:

```typescript
import { forgetByTag, set } from '@lockness/cache'

// Tag individual entries
await set('post:1', post1, 3600, ['posts', 'featured'])
await set('post:2', post2, 3600, ['posts'])
await set('user:1', user1, 3600, ['users'])

// Invalidate all posts (both post:1 and post:2 deleted)
await forgetByTag('posts')

// user:1 remains cached
```

### Fluent Tagged Cache

Create a cache store with automatic tagging:

```typescript
import { cache } from '@lockness/cache'

const postsCache = cache('posts')

// All operations automatically tagged with 'posts'
await postsCache.set('post:1', post)
await postsCache.set('post:2', post)

const featured = await postsCache.remember('featured', async () => {
    return await db.query.posts.findFirst({
        where: eq(posts.featured, true),
    })
}, 600)

// Flush all posts cache
await postsCache.flush()
```

### Multiple Tags

```typescript
const cache = cache('posts', 'homepage')

await cache.set('featured', featuredPosts)
await cache.set('recent', recentPosts)

// Flush by any tag
await forgetByTag('homepage') // Deletes both featured and recent
```

## Counter Operations

Perfect for rate limiting, metrics, and counters:

```typescript
import { decrement, increment } from '@lockness/cache'

// Page view counter
await increment('page:123:views')
await increment('page:123:views', 5) // Increment by 5

// Rate limiting
const requests = await increment(`api:user:${userId}:requests`)
if (requests > 100) {
    throw new Error('Rate limit exceeded')
}

// Set TTL on first increment
if (requests === 1) {
    await set(`api:user:${userId}:requests`, requests, 60) // Reset after 1 minute
}

// Inventory management
await decrement('inventory:item:456')
await decrement('inventory:item:456', 10) // Decrement by 10
```

## Batch Operations

Efficiently handle multiple keys:

```typescript
import { many, putMany } from '@lockness/cache'

// Get multiple keys
const values = await many(['user:1', 'user:2', 'user:3'])
// Returns: { 'user:1': {...}, 'user:2': {...}, 'user:3': null }

// Set multiple keys
await putMany({
    'setting:theme': 'dark',
    'setting:lang': 'en',
    'setting:notifications': true,
}, 3600)
```

## Additional Helpers

### Add (Set if Not Exists)

```typescript
import { add } from '@lockness/cache'

// Useful for distributed locks
const added = await add('lock:process', true, 60)
if (!added) {
    console.log('Lock already exists, process running elsewhere')
    return
}

// Proceed with locked operation
try {
    // ... critical section
} finally {
    await forget('lock:process')
}
```

### Pull (Get and Delete)

```typescript
import { pull } from '@lockness/cache'

// Get value and delete in one operation
const token = await pull('token:abc')
if (token) {
    // Use token (now deleted from cache)
}
```

### Aliases

```typescript
import { put } from '@lockness/cache'

// put() is an alias for set()
await put('key', 'value', 600)
```

## Drivers

### Memory Driver (Default)

Fast in-memory cache, not persistent:

```typescript
configureCache({ driver: 'memory' })
```

**Pros:**

- Fastest performance (no I/O)
- No external dependencies
- Great for development

**Cons:**

- Lost on restart
- Limited by available RAM
- Single process only (no sharing between workers)

**Best for:**

- Development
- Single-instance deployments
- Temporary data (sessions, rate limiting)

### Deno KV Driver

Persistent cache using Deno's built-in KV store:

```typescript
configureCache({
    driver: 'deno-kv',
    kvPath: './data/cache.db', // Optional, defaults to system location
})
```

**Pros:**

- Persistent across restarts
- Built-in to Deno runtime
- Atomic operations
- Works with Deno Deploy

**Cons:**

- Slightly slower than memory (disk I/O)
- Requires file system access (or Deploy KV in production)

**Best for:**

- Production deployments
- Persistent cache data
- Multi-worker setups

### Redis Driver

Distributed cache using Redis for multi-instance deployments:

```typescript
import { createClient } from 'npm:redis'
import { RedisCacheDriver, setCacheDriver } from '@lockness/cache'

// Connect to Redis
const redis = createClient({ url: 'redis://localhost:6379' })
await redis.connect()

// Set the Redis driver
setCacheDriver(new RedisCacheDriver(redis))
```

**With Deno's Redis library:**

```typescript
import { connect } from 'https://deno.land/x/redis/mod.ts'
import { RedisCacheDriver, setCacheDriver } from '@lockness/cache'

const redis = await connect({ hostname: 'localhost', port: 6379 })
setCacheDriver(new RedisCacheDriver(redis))
```

**With custom options:**

```typescript
setCacheDriver(
    new RedisCacheDriver(redis, {
        keyPrefix: 'myapp:cache', // Custom key prefix (default: 'cache')
        tagPrefix: 'myapp:tag', // Custom tag prefix (default: 'tag')
        serialize: JSON.stringify, // Custom serializer
        deserialize: JSON.parse, // Custom deserializer
    }),
)
```

**Pros:**

- Shared across multiple instances
- High performance (in-memory)
- Persistent (with Redis persistence)
- Rich data structure support
- Cluster support for scaling

**Cons:**

- Requires Redis server
- Network latency
- Additional infrastructure

**Best for:**

- Multi-instance deployments
- Microservices architecture
- High-traffic applications
- Shared session storage

## Complete Usage Example

```typescript
import {
    cache,
    configureCache,
    forgetByTag,
    increment,
    remember,
} from '@lockness/cache'

// Configure cache
configureCache({
    driver: 'deno-kv',
    ttl: 3600,
    prefix: 'blog',
    kvPath: './data/cache.db',
})

// Create tagged cache stores
const postsCache = cache('posts')
const usersCache = cache('users')

// Cache expensive queries
const allPosts = await postsCache.remember('all', async () => {
    return await db.query.posts.findMany()
}, 300)

// Cache with multiple tags
await set('post:123', post, 600, ['posts', 'featured'])

// Rate limiting
async function checkRateLimit(userId: string): Promise<boolean> {
    const key = `rate:${userId}`
    const count = await increment(key)

    if (count === 1) {
        await set(key, count, 60) // Reset after 1 minute
    }

    return count <= 100 // Max 100 requests per minute
}

// Invalidate related caches
async function updatePost(id: number, data: Partial<Post>) {
    await db.update(posts).set(data).where(eq(posts.id, id))

    // Invalidate all post caches
    await forgetByTag('posts')
}

// Session caching
await set(`session:${sessionId}`, sessionData, 7200) // 2 hours

// Feature flags
const features = await rememberForever('feature-flags', async () => {
    return await db.select().from(featureFlags).all()
})
```

## Testing

Clear cache between tests:

```typescript
import { flush, MemoryCacheDriver } from '@lockness/cache'

Deno.test('my test', async () => {
    // Clear memory cache
    MemoryCacheDriver.clear()

    // Or use flush() for any driver
    await flush()

    // Your test...
})
```

## API Reference

### Configuration

```typescript
configureCache(options: {
    driver: 'memory' | 'deno-kv'
    ttl?: number              // Default TTL in seconds
    prefix?: string           // Key prefix for namespacing
    kvPath?: string           // Deno KV file path (for deno-kv driver)
})
```

### Core Functions

```typescript
// Get value
get<T>(key: string): Promise<T | null>

// Set value
set<T>(key: string, value: T, ttl?: number, tags?: string[]): Promise<void>

// Check existence
has(key: string): Promise<boolean>

// Delete key
forget(key: string): Promise<void>

// Clear all cache
flush(): Promise<void>

// Cache callback result
remember<T>(key: string, callback: () => T | Promise<T>, ttl?: number, tags?: string[]): Promise<T>

// Cache callback result forever
rememberForever<T>(key: string, callback: () => T | Promise<T>, tags?: string[]): Promise<T>

// Get multiple keys
many<T>(keys: string[]): Promise<Record<string, T | null>>

// Set multiple keys
putMany<T>(values: Record<string, T>, ttl?: number): Promise<void>

// Increment counter
increment(key: string, amount?: number): Promise<number>

// Decrement counter
decrement(key: string, amount?: number): Promise<number>

// Add if not exists
add<T>(key: string, value: T, ttl?: number, tags?: string[]): Promise<boolean>

// Get and delete
pull<T>(key: string): Promise<T | null>

// Alias for set
put<T>(key: string, value: T, ttl?: number, tags?: string[]): Promise<void>

// Set forever
forever<T>(key: string, value: T, tags?: string[]): Promise<void>

// Delete by tag
forgetByTag(tag: string): Promise<void>

// Alias for forgetByTag
flushByTag(tag: string): Promise<void>
```

### Tagged Cache Store

```typescript
// Create tagged store
cache(...tags: string[]): CacheStore

// CacheStore methods
interface CacheStore {
    get<T>(key: string): Promise<T | null>
    set<T>(key: string, value: T, ttl?: number): Promise<void>
    has(key: string): Promise<boolean>
    forget(key: string): Promise<void>
    remember<T>(key: string, callback: () => T | Promise<T>, ttl?: number): Promise<T>
    rememberForever<T>(key: string, callback: () => T | Promise<T>): Promise<T>
    flush(): Promise<void>
}
```

## Best Practices

- **Use memory driver in development**, Deno KV in production
- **Set appropriate TTLs** - shorter for frequently changing data, longer for
  static data
- **Use tagging** to group related cache entries for easy invalidation
- **Use remember()** pattern to simplify caching logic
- **Add rate limiting** with increment/decrement
- **Namespace keys** with prefixes (e.g., 'user:', 'post:')
- **Clear cache** on deployments if schema changes
- **Monitor cache hit rates** in production
- **Use cache for expensive operations** (DB queries, API calls, computations)
- **Invalidate strategically** - only clear what changed

## Common Use Cases

- **Database query caching** - Cache expensive queries
- **API response caching** - Cache third-party API responses
- **Rate limiting** - Limit requests per user/IP
- **Session storage** - Store session data
- **Page view counters** - Track views/visits
- **Feature flags** - Cache feature configuration
- **User preferences** - Cache user settings
- **Computed results** - Cache expensive computations
- **Distributed locks** - Coordinate across workers
