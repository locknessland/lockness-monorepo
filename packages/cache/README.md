# @lockness/cache

High-performance caching system with multiple driver support.

## Features

- 🚀 Simple API: get, set, remember, forget, flush
- 🎨 Multiple drivers: Memory, Deno KV, Redis
- ⏱️ TTL (Time To Live) support with automatic expiration
- 🏷️ Tags for grouping and batch invalidation
- 📦 Automatic serialization
- 💾 Increment/decrement for counters
- 🔄 Batch operations (many, putMany)
- 🧪 Full test coverage

## Installation

```typescript
import { cache, configureCache } from '@lockness/cache'
```

## Configuration

```typescript
configureCache({
    driver: 'memory', // or 'deno-kv'
    ttl: 3600, // Default TTL in seconds (1 hour)
    prefix: 'myapp', // Cache key prefix
    kvPath: './data/kv', // Optional: Deno KV path
})
```

## Usage

### Basic Operations

```typescript
import { flush, forget, get, has, set } from '@lockness/cache'

// Set a value
await set('user:1', { name: 'John', email: 'john@example.com' })

// Get a value
const user = await get('user:1')

// Check if exists
if (await has('user:1')) {
    console.log('User exists in cache')
}

// Delete a key
await forget('user:1')

// Clear all cache
await flush()
```

### TTL (Time To Live)

```typescript
// Cache for 5 minutes
await set('session:abc', sessionData, 300)

// Cache forever (no expiration)
await set('config', configData, 0)

// Using helper
import { forever } from '@lockness/cache'
await forever('permanent', data)
```

### Remember Pattern

Cache the result of expensive operations:

```typescript
import { remember } from '@lockness/cache'

// Cache database query result
const users = await remember('all-users', async () => {
    return await db.select().from(users).all()
}, 3600) // Cache for 1 hour

// Sync callback also works
const config = await remember('config', () => {
    return JSON.parse(Deno.readTextFileSync('config.json'))
})
```

### Tags for Grouping

```typescript
import { forgetByTag, set } from '@lockness/cache'

// Tag cache entries
await set('post:1', post1, undefined, ['posts', 'recent'])
await set('post:2', post2, undefined, ['posts'])
await set('user:1', user1, undefined, ['users'])

// Invalidate all posts
await forgetByTag('posts')
// post:1 and post:2 are deleted, user:1 remains
```

### Fluent API with Tags

```typescript
import { cache } from '@lockness/cache'

const postsCache = cache('posts')

// All operations automatically tagged
await postsCache.set('post:1', post)
await postsCache.set('post:2', post)

const post = await postsCache.remember('post:featured', async () => {
    return await db.query.posts.findFirst({ where: eq(posts.featured, true) })
}, 600)

// Flush all posts cache
await postsCache.flush()
```

### Multiple Tags

```typescript
const cache = cache('posts', 'homepage')

await cache.set('featured', featuredPosts)
await cache.set('recent', recentPosts)

// Flush by either tag
await forgetByTag('homepage')
```

### Counter Operations

```typescript
import { decrement, increment } from '@lockness/cache'

// Page view counter
await increment('page:123:views')
await increment('page:123:views', 5) // Increment by 5

// Rate limiting
const requests = await increment('api:user:123:requests')
if (requests > 100) {
    throw new Error('Rate limit exceeded')
}

// Decrement
await decrement('inventory:item:456')
```

### Batch Operations

```typescript
import { many, putMany } from '@lockness/cache'

// Get multiple keys at once
const values = await many(['user:1', 'user:2', 'user:3'])
// { 'user:1': {...}, 'user:2': {...}, 'user:3': null }

// Set multiple keys at once
await putMany({
    'setting:theme': 'dark',
    'setting:lang': 'en',
    'setting:notifications': true,
}, 3600)
```

### Additional Helpers

```typescript
import { add, forever, pull, put } from '@lockness/cache'

// Add only if doesn't exist
const added = await add('lock:process', true, 60)
if (!added) {
    console.log('Lock already exists')
}

// Get and delete in one operation
const token = await pull('token:abc')

// Aliases
await put('key', 'value', 600) // Same as set()
await forever('key', 'value') // Same as set() with ttl=0
```

## Drivers

### Memory Driver (Default)

In-memory cache, fast but not persistent:

```typescript
configureCache({ driver: 'memory' })
```

**Pros:**

- Fastest performance
- No external dependencies

**Cons:**

- Lost on restart
- Limited by RAM
- Single process only

### Deno KV Driver

Persistent cache using Deno KV:

```typescript
configureCache({
    driver: 'deno-kv',
    kvPath: './data/cache.db', // Optional
})
```

**Pros:**

- Persistent across restarts
- Built-in to Deno
- Atomic operations

**Cons:**

- Slightly slower than memory
- Requires file system access

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
        keyPrefix: 'myapp:cache', // Custom key prefix
        tagPrefix: 'myapp:tag', // Custom tag prefix
        serialize: JSON.stringify, // Custom serializer
        deserialize: JSON.parse, // Custom deserializer
    }),
)
```

**Pros:**

- Shared across multiple instances
- High performance
- Persistent (with Redis persistence)
- Rich data structure support

**Cons:**

- Requires Redis server
- Network latency
- Additional infrastructure

## Advanced Example

```typescript
import { cache, configureCache, remember } from '@lockness/cache'

configureCache({
    driver: 'deno-kv',
    ttl: 3600,
    prefix: 'blog',
})

// Tagged cache for posts
const postsCache = cache('posts')

// Cache expensive database query
const allPosts = await postsCache.remember('all', async () => {
    return await db.query.posts.findMany()
}, 300) // 5 minutes

// Cache single post with multiple tags
await set('post:123', post, 600, ['posts', 'featured'])

// When post is updated, invalidate all post caches
await forgetByTag('posts')

// Rate limiting with cache
async function checkRateLimit(userId: string): Promise<boolean> {
    const key = `rate:${userId}`
    const count = await increment(key)

    if (count === 1) {
        await set(key, count, 60) // Reset after 1 minute
    }

    return count <= 100 // Max 100 requests per minute
}
```

## Testing

Clear cache between tests:

```typescript
import { flush, MemoryCacheDriver } from '@lockness/cache'

Deno.test('my test', async () => {
    // Reset memory cache
    MemoryCacheDriver.clear()

    // Your test...
})
```

## API Reference

### Functions

- `get<T>(key)` - Get value from cache
- `set<T>(key, value, ttl?, tags?)` - Set value in cache
- `has(key)` - Check if key exists
- `forget(key)` - Delete a key
- `flush()` - Clear all cache
- `remember<T>(key, callback, ttl?, tags?)` - Cache callback result
- `rememberForever<T>(key, callback, tags?)` - Cache callback result forever
- `many<T>(keys)` - Get multiple keys
- `putMany<T>(values, ttl?)` - Set multiple keys
- `increment(key, value?)` - Increment counter
- `decrement(key, value?)` - Decrement counter
- `add<T>(key, value, ttl?, tags?)` - Add only if not exists
- `pull<T>(key)` - Get and delete
- `put<T>(key, value, ttl?, tags?)` - Alias for set
- `forever<T>(key, value, tags?)` - Set without expiration
- `forgetByTag(tag)` - Delete all keys with tag
- `flushByTag(tag)` - Alias for forgetByTag
- `cache(...tags)` - Create tagged cache store

### CacheStore

```typescript
const store = cache('tag1', 'tag2')

store.get<T>(key)
store.set<T>(key, value, ttl?)
store.remember<T>(key, callback, ttl?)
store.flush()
```

## License

MIT
