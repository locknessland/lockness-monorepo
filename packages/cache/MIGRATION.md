# Migration Guide

## Overview

The `@lockness/cache` package has been refactored from a monolithic 960-line file into a modular structure. **No breaking changes** have been introduced - all existing code will continue to work without modification.

## What Changed

### Before (v0.1.26 and earlier)

```
packages/cache/
├── mod.ts                  # 960 lines - everything in one file
└── tests/
```

### After (v0.1.27+)

```
packages/cache/
├── mod.ts                  # 82 lines - re-exports only
├── types.ts                # Type definitions
├── config.ts               # Configuration management
├── store.ts                # CacheStore and driver management
├── api.ts                  # Public API functions
├── drivers/
│   ├── mod.ts              # Driver exports
│   ├── memory_driver.ts    # Memory driver
│   └── deno_kv_driver.ts   # Deno KV driver
└── tests/
```

## Do You Need to Change Your Code?

**NO!** All imports continue to work as before:

```typescript
// ✅ This still works (recommended)
import { cache, get, set, remember } from '@lockness/cache'

// ✅ This also still works
import type { CacheConfig, CacheDriver } from '@lockness/cache'

// ✅ Driver classes still available
import { MemoryCacheDriver, DenoKvCacheDriver } from '@lockness/cache'
```

## Benefits You Get Automatically

### 1. Better Tree-Shaking
Your bundler can now eliminate unused code more effectively since the package is modular.

### 2. Improved Type Checking
TypeScript can resolve types faster with the modular structure.

### 3. Clearer Error Messages
Import errors will reference specific modules, making debugging easier.

## For Package Maintainers

If you're maintaining the `@lockness/cache` package or creating custom drivers, you can now import from specific modules:

```typescript
// Import types directly
import type { CacheDriver } from '@lockness/cache/types.ts'

// Import config utilities
import { getCacheKey, isExpired } from '@lockness/cache/config.ts'

// Import driver base
import { MemoryCacheDriver } from '@lockness/cache/drivers/memory_driver.ts'
```

## Creating Custom Drivers

The new structure makes it easier to understand how to create custom drivers:

```typescript
// custom_driver.ts
import type { CacheDriver } from '@lockness/cache/types.ts'
import { getCacheKey, getExpiresAt, isExpired } from '@lockness/cache/config.ts'

export class CustomCacheDriver implements CacheDriver {
    async get<T>(key: string): Promise<T | null> {
        const fullKey = getCacheKey(key)
        // Your implementation
    }
    
    // ... implement other methods
}
```

Then use it:

```typescript
import { setCacheDriver } from '@lockness/cache'
import { CustomCacheDriver } from './custom_driver.ts'

setCacheDriver(new CustomCacheDriver())
```

## Testing

Your existing tests will continue to work without changes:

```typescript
// ✅ Still works
import {
    configureCache,
    flush,
    get,
    set,
    MemoryCacheDriver,
} from '@lockness/cache'

Deno.test('my cache test', async () => {
    MemoryCacheDriver.clear()
    configureCache({ driver: 'memory' })
    
    await set('key', 'value')
    const result = await get('key')
    // assertions...
})
```

## Rollback

If you encounter any issues (though none are expected), you can always pin to the previous version:

```json
{
    "imports": {
        "@lockness/cache": "jsr:@lockness/cache@0.1.26"
    }
}
```

## Questions?

If you have any questions about the refactoring or encounter any issues, please open an issue on GitHub.
