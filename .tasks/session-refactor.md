# Technical Task: Refactor @lockness/session Package into Modular Architecture

## 📋 Task Overview

The `@lockness/session` package currently contains all session management code
in a single 700+ line file (`mod.ts`). This monolithic structure makes
maintenance difficult, testing complex, and violates the Single Responsibility
Principle.

This refactoring will split the package into focused, single-purpose modules
following SOLID principles, improving maintainability, testability, and
developer experience while maintaining full backward compatibility.

## 🎯 Objectives

1. **Modular Structure**: Split `mod.ts` into focused files (types, config,
   drivers, store, middleware)
2. **SOLID Compliance**: Each file handles a single responsibility with clear
   boundaries
3. **Backward Compatibility**: All existing exports remain available from
   `mod.ts`
4. **Improved Testability**: Each driver can be unit tested in isolation
5. **Documentation**: Maintain JSDoc quality across all new files

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/session/mod.ts` - Refactor to re-export from new modules (keep as
  public API)

### New Files to Create

- `/packages/session/types.ts` - All interfaces and type definitions
- `/packages/session/config.ts` - Configuration management (defaults, global
  config)
- `/packages/session/store.ts` - SessionStore class implementation
- `/packages/session/middleware.ts` - Session middleware factory
- `/packages/session/utils.ts` - Helper functions (generateSessionId,
  getSession)
- `/packages/session/drivers/mod.ts` - Driver re-exports
- `/packages/session/drivers/cookie.ts` - CookieSessionDriver
- `/packages/session/drivers/memory.ts` - MemorySessionDriver
- `/packages/session/drivers/deno-kv.ts` - DenoKvSessionDriver
- `/packages/session/drivers/redis.ts` - RedisSessionDriver

### Test Files

- `/packages/session/tests/drivers.test.ts` - Already exists, may need updates
- `/packages/session/tests/middleware.test.ts` - Already exists, may need
  updates
- `/packages/session/tests/store.test.ts` - Already exists, may need updates

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### Core Documentation

- `/packages/session/README.md` - Update with new module structure

## 🏗️ Architecture Principles

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **Current Problem**: `mod.ts` handles types, configuration, 4 different
  drivers, store logic, and middleware - 7+ responsibilities in one file
- **Solution**: Split into dedicated files, each with one clear purpose

```typescript
// types.ts - Only type definitions
export interface SessionData { ... }
export interface SessionConfig { ... }
export interface SessionDriver { ... }
export interface Session { ... }

// drivers/cookie.ts - Only cookie driver implementation
export class CookieSessionDriver implements SessionDriver { ... }
```

**2. Open/Closed Principle (OCP)**

- **Current Problem**: Adding a new driver requires modifying `mod.ts`
- **Solution**: Drivers are independent modules; new drivers can be added
  without modifying existing code

```typescript
// New driver: drivers/turso.ts
export class TursoSessionDriver implements SessionDriver { ... }

// Add to drivers/mod.ts without changing other files
export { TursoSessionDriver } from './turso.ts'
```

**3. Liskov Substitution Principle (LSP)**

- **Current Problem**: Drivers already implement SessionDriver interface
  correctly
- **Solution**: Maintain the interface contract; all drivers remain
  interchangeable

**4. Interface Segregation Principle (ISP)**

- **Current Problem**: SessionDriver has optional `gc?()` and `close?()` methods
- **Solution**: Keep current design (optional methods are appropriate here);
  consider future `ClosableDriver` and `GarbageCollectableDriver` interfaces if
  needed

**5. Dependency Inversion Principle (DIP)**

- **Current Problem**: `sessionMiddleware` directly instantiates driver classes
- **Solution**: Maintain factory pattern but isolate driver creation logic

```typescript
// middleware.ts
import { createDriver } from './drivers/mod.ts'

export function sessionMiddleware(config?: Partial<SessionConfig>) {
    return async (c: Context, next: () => Promise<void>) => {
        const driver = createDriver(c, sessionConfig)
        // ...
    }
}
```

### DRY Principle (Don't Repeat Yourself)

**Current Duplication:**

- Driver constructor patterns are similar across drivers
- Configuration merging logic could be centralized

**Solution:**

- Create `createDriver()` factory function in `drivers/mod.ts`
- Centralize config merging in `config.ts`

### 📝 JSDoc Documentation Standards

All new files must include:

```typescript
/**
 * @fileoverview [Brief description]
 *
 * @module @lockness/session/[submodule]
 */
```

### 🔒 TypeScript Type Safety Standards

- ✅ All files use `readonly` for immutable properties (already done)
- ✅ No `any` types (already clean)
- ✅ Explicit return types on all public functions
- ✅ Keep existing type guards and generics

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User Application Layer                  │  ← Imports from @lockness/session
├─────────────────────────────────────────┤
│  Public API (mod.ts)                     │  ← Re-exports all public APIs
├─────────────────────────────────────────┤
│  Core Modules                            │  ← types, config, store, middleware
├─────────────────────────────────────────┤
│  Drivers Layer                           │  ← cookie, memory, deno-kv, redis
└─────────────────────────────────────────┘
```

**Key Constraints:**

- `mod.ts` remains the only public entry point
- Internal modules can import from each other
- Drivers depend on types only (no circular dependencies)
- Middleware depends on drivers, store, and config

## 🎨 Proposed API Design

### Public API (Unchanged)

```typescript
// All existing imports continue to work
import {
    configureSession,
    CookieSessionDriver,
    DenoKvSessionDriver,
    getSession,
    getSessionConfig,
    MemorySessionDriver,
    RedisSessionDriver,
    type Session,
    type SessionConfig,
    type SessionData,
    type SessionDriver,
    sessionMiddleware,
    SessionStore,
} from '@lockness/session'
```

### Internal Module Structure

```typescript
// types.ts - Type definitions only
export interface SessionData { ... }
export interface SessionConfig { ... }
export interface RedisConfig { ... }
export interface SessionDriver { ... }
export interface Session { ... }

// config.ts - Configuration management
export const defaultConfig: SessionConfig = { ... }
export function configureSession(config: Partial<SessionConfig>): void
export function getSessionConfig(): SessionConfig

// utils.ts - Utility functions
export function generateSessionId(): string
export function getSession(c: Context): Session

// store.ts - Session store implementation
export class SessionStore implements Session { ... }

// drivers/mod.ts - Driver exports and factory
export { CookieSessionDriver } from './cookie.ts'
export { MemorySessionDriver } from './memory.ts'
export { DenoKvSessionDriver } from './deno-kv.ts'
export { RedisSessionDriver } from './redis.ts'
export function createDriver(c: Context, config: SessionConfig): SessionDriver

// middleware.ts - Middleware factory
export function sessionMiddleware(config?: Partial<SessionConfig>): MiddlewareHandler
```

## 📝 Detailed Implementation Steps

### Phase 1: Create Type Definitions Module

**Step 1.1: Create types.ts**

File: `/packages/session/types.ts`

```typescript
/**
 * @fileoverview Session type definitions.
 *
 * Contains all interfaces and types for the session package.
 *
 * @module @lockness/session/types
 */

import type { Context } from 'hono'

/**
 * Session data container type.
 */
export interface SessionData {
    [key: string]: unknown
}

/**
 * Redis connection configuration.
 */
export interface RedisConfig {
    hostname: string
    port?: number
    password?: string
    db?: number
}

/**
 * Session configuration options.
 */
export interface SessionConfig {
    driver: 'cookie' | 'deno-kv' | 'memory' | 'redis'
    cookieName: string
    lifetime: number
    secret: string
    path: string
    domain?: string
    secure: boolean
    httpOnly: boolean
    sameSite: 'Strict' | 'Lax' | 'None'
    kvPath?: string
    redis?: RedisConfig
}

/**
 * Session storage driver interface.
 */
export interface SessionDriver {
    read(sessionId: string): Promise<SessionData | null>
    write(sessionId: string, data: SessionData, lifetime: number): Promise<void>
    destroy(sessionId: string): Promise<void>
    regenerate(oldId: string, newId: string): Promise<void>
    gc?(): Promise<void>
    close?(): Promise<void>
}

/**
 * Session instance interface.
 */
export interface Session {
    getId(): string
    get<T = unknown>(key: string, defaultValue?: T): T | undefined
    set(key: string, value: unknown): void
    has(key: string): boolean
    forget(key: string): void
    all(): SessionData
    flush(): void
    regenerate(): Promise<void>
    destroy(): Promise<void>
    flash(key: string, value: unknown): void
    getFlash<T = unknown>(key: string): T | undefined
    isDirty(): boolean
}
```

### Phase 2: Create Configuration Module

**Step 2.1: Create config.ts**

File: `/packages/session/config.ts`

```typescript
/**
 * @fileoverview Session configuration management.
 *
 * @module @lockness/session/config
 */

import type { SessionConfig } from './types.ts'

export const defaultConfig: SessionConfig = {
    driver: 'cookie',
    cookieName: 'lockness_session',
    lifetime: 7200,
    secret: '',
    path: '/',
    secure: false,
    httpOnly: true,
    sameSite: 'Lax',
}

let globalConfig: SessionConfig = { ...defaultConfig }

export function configureSession(config: Partial<SessionConfig>): void {
    globalConfig = { ...defaultConfig, ...config }
}

export function getSessionConfig(): SessionConfig {
    return globalConfig
}
```

### Phase 3: Create Utility Module

**Step 3.1: Create utils.ts**

File: `/packages/session/utils.ts`

```typescript
/**
 * @fileoverview Session utility functions.
 *
 * @module @lockness/session/utils
 */

import type { Context } from 'hono'
import type { Session } from './types.ts'

/**
 * Generate a cryptographically secure session ID.
 * @internal
 */
export function generateSessionId(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
    )
}

/**
 * Get session from Hono context.
 */
export function getSession(c: Context): Session {
    const session = c.get('session') as Session | undefined
    if (!session) {
        throw new Error('Session not initialized. Use sessionMiddleware.')
    }
    return session
}
```

### Phase 4: Create Driver Modules

**Step 4.1: Create drivers/cookie.ts**

File: `/packages/session/drivers/cookie.ts`

Move `CookieSessionDriver` class with all its methods (encrypt, decrypt,
deriveKey).

**Step 4.2: Create drivers/memory.ts**

File: `/packages/session/drivers/memory.ts`

Move `MemorySessionDriver` class.

**Step 4.3: Create drivers/deno-kv.ts**

File: `/packages/session/drivers/deno-kv.ts`

Move `DenoKvSessionDriver` class.

**Step 4.4: Create drivers/redis.ts**

File: `/packages/session/drivers/redis.ts`

Move `RedisSessionDriver` class.

**Step 4.5: Create drivers/mod.ts**

File: `/packages/session/drivers/mod.ts`

```typescript
/**
 * @fileoverview Session driver exports and factory.
 *
 * @module @lockness/session/drivers
 */

import type { Context } from 'hono'
import type { SessionConfig, SessionDriver } from '../types.ts'

export { CookieSessionDriver } from './cookie.ts'
export { MemorySessionDriver } from './memory.ts'
export { DenoKvSessionDriver } from './deno-kv.ts'
export { RedisSessionDriver } from './redis.ts'

/**
 * Create a session driver based on configuration.
 */
export function createDriver(c: Context, config: SessionConfig): SessionDriver {
    switch (config.driver) {
        case 'cookie':
            return new CookieSessionDriver(c, config)
        case 'memory':
            return new MemorySessionDriver()
        case 'deno-kv':
            return new DenoKvSessionDriver(config.kvPath)
        case 'redis':
            if (!config.redis) {
                throw new Error('Redis configuration required for redis driver')
            }
            return new RedisSessionDriver(config.redis)
        default:
            return new CookieSessionDriver(c, config)
    }
}
```

### Phase 5: Create Store Module

**Step 5.1: Create store.ts**

File: `/packages/session/store.ts`

Move `SessionStore` class.

### Phase 6: Create Middleware Module

**Step 6.1: Create middleware.ts**

File: `/packages/session/middleware.ts`

Move `sessionMiddleware` function, import from new modules.

### Phase 7: Update Main Entry Point

**Step 7.1: Refactor mod.ts**

File: `/packages/session/mod.ts`

```typescript
/**
 * @fileoverview Session Management System for Lockness.
 *
 * Multi-driver session handling with Cookie, Memory, DenoKV, and Redis support.
 *
 * @module @lockness/session
 */

// Re-export types
export type {
    RedisConfig,
    Session,
    SessionConfig,
    SessionData,
    SessionDriver,
} from './types.ts'

// Re-export configuration
export { configureSession, getSessionConfig } from './config.ts'

// Re-export utilities
export { getSession } from './utils.ts'

// Re-export drivers
export {
    CookieSessionDriver,
    DenoKvSessionDriver,
    MemorySessionDriver,
    RedisSessionDriver,
} from './drivers/mod.ts'

// Re-export store
export { SessionStore } from './store.ts'

// Re-export middleware
export { sessionMiddleware } from './middleware.ts'
```

## 🔄 Migration Guide

### For Existing Users

**No changes required!** All existing imports continue to work:

```typescript
// Before AND After - identical usage
import { getSession, sessionMiddleware } from '@lockness/session'
```

### Breaking Changes

- ⚠️ **None** - This is a pure internal refactoring with no API changes

### New Capabilities

Users can now import specific modules for advanced use cases:

```typescript
// Import only types (smaller bundle for type-only imports)
import type { SessionConfig, SessionDriver } from '@lockness/session'

// Import specific driver for custom usage
import { MemorySessionDriver } from '@lockness/session'
```

## 📚 Documentation Updates Checklist

### Core Documentation

- [ ] Update `/packages/session/README.md` with module structure diagram

### README Updates

- [ ] Add "Architecture" section explaining the modular structure
- [ ] Keep usage examples unchanged (API is unchanged)

## 🧪 Testing Strategy

### Unit Tests

- [ ] Verify all existing tests pass without modification
- [ ] Add tests for `createDriver()` factory function
- [ ] Test each driver in isolation

### Integration Tests

- [ ] Test full session flow with each driver
- [ ] Verify middleware works with all drivers

### Manual Testing

- [ ] Test in development mode
- [ ] Test compiled binary

## 🔍 Quality Checks

### Pre-Implementation

```bash
# Verify current tests pass
deno test packages/session/tests/
```

### Post-Implementation

```bash
# Check all new files
deno check packages/session/**/*.ts

# Lint all files
deno lint packages/session/

# Run all tests
deno test packages/session/tests/
```

## ✅ Definition of Done

- [ ] All 10 new files created with proper structure
- [ ] `mod.ts` refactored to re-export from modules
- [ ] All existing tests pass without modification
- [ ] `deno check` passes on all files
- [ ] `deno lint` passes on all files
- [ ] README updated with architecture diagram
- [ ] No breaking changes to public API

## 📊 Metrics

| Metric          | Before    | After      |
| --------------- | --------- | ---------- |
| Files           | 1         | 11         |
| Lines in mod.ts | ~700      | ~40        |
| Max file size   | 700 lines | ~150 lines |
| Testability     | Medium    | High       |

## 📅 Timeline

- **Estimated Effort**: 2-3 hours
- **Complexity**: Medium (no logic changes, pure refactoring)

## 📝 Notes

- This refactoring follows the same pattern used in `@lockness/core` (SOLID
  principles)
- The `drivers/` folder structure allows easy addition of new drivers (e.g.,
  Turso, SQLite)
- Consider adding a `createCustomDriver()` helper for users who want to
  implement custom drivers
- Future enhancement: Add `@lockness/session/testing` module with test utilities

---

_Task created: 2026-01-21_
