# Technical Task: @Throttle Decorator (Rate Limiting)

## 📋 Task Overview

Implement a `@Throttle` decorator for rate limiting on controllers and routes,
integrating with `hono-rate-limiter` exposed through `@lockness/hono` →
`@lockness/core`.

> **Architecture**: `npm:hono-rate-limiter` → `@lockness/hono` →
> `@lockness/core` → User App

## 🎯 Objectives

1. **Primary Objective**: Expose `hono-rate-limiter` in `@lockness/hono`
2. **Secondary Objective**: Create `@Throttle` decorator in `@lockness/core`
3. **Additional Objective**: Support controller-level and method-level
   throttling
4. **Quality Objective**: Integration with `@lockness/cache` for distributed
   rate limiting
5. **Documentation Objective**: Complete JSDoc and LLM-friendly documentation

## 📁 Affected File Paths

### Files to Modify

- `/packages/hono/security.ts` - Export rate limiter
- `/packages/hono/mod.ts` - Re-export from security
- `/packages/core/decorators.ts` - Add `@Throttle` decorator
- `/packages/core/mod.ts` - Export `@Throttle`

### New Files to Create

- `/packages/core/throttle.ts` - Throttle decorator and utilities
- `/packages/core/tests/throttle.test.ts` - Unit tests
- `/packages/core/docs/throttle.md` - Documentation

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User Application                                            │
│  @Throttle(100, '1m')                                       │
├─────────────────────────────────────────────────────────────┤
│  @lockness/core                                              │
│  @Throttle decorator → generates middleware                  │
├─────────────────────────────────────────────────────────────┤
│  @lockness/hono                                              │
│  rateLimiter() from hono-rate-limiter                       │
├─────────────────────────────────────────────────────────────┤
│  npm:hono-rate-limiter                                       │
│  Actual rate limiting implementation                         │
└─────────────────────────────────────────────────────────────┘
```

## 🎨 Proposed API Design

### Basic Usage

```typescript
import { Controller, Get, Post, Throttle } from '@lockness/core'

@Controller('/api')
@Throttle(100, '1m') // 100 requests per minute for all routes
export class ApiController {
    @Get('/data')
    async getData() {/* 100/min inherited */}

    @Post('/login')
    @Throttle(5, '1m') // Override: 5 requests per minute
    async login() {/* ... */}

    @Post('/forgot-password')
    @Throttle(3, '1h') // 3 requests per hour
    async forgotPassword() {/* ... */}
}
```

### Advanced Options

```typescript
import { Throttle, ThrottleBy } from '@lockness/core'

@Controller('/api')
export class ApiController {
    // Rate limit by IP (default)
    @Get('/public')
    @Throttle(100, '1m')
    async publicEndpoint() {}

    // Rate limit by authenticated user
    @Get('/user-data')
    @Throttle(50, '1m', { by: 'user' })
    async userData() {}

    // Rate limit by API key
    @Get('/partner')
    @Throttle(1000, '1m', { by: 'header:X-API-Key' })
    async partnerEndpoint() {}

    // Custom key generator
    @Post('/action')
    @Throttle(10, '1m', {
        by: (c) => c.req.header('X-Tenant-ID') ?? 'default',
    })
    async tenantAction() {}

    // Custom error response
    @Post('/login')
    @Throttle(5, '1m', {
        message: 'Too many login attempts. Please try again later.',
        statusCode: 429,
        headers: true, // Include X-RateLimit-* headers
    })
    async login() {}

    // Skip throttle for certain conditions
    @Get('/data')
    @Throttle(100, '1m', {
        skip: (c) => c.get('user')?.isAdmin === true,
    })
    async getData() {}
}
```

### Preset Decorators

```typescript
import { ThrottleApi, ThrottleLogin, ThrottleSensitive } from '@lockness/core'

@Controller('/auth')
export class AuthController {
    @Post('/login')
    @ThrottleLogin() // Preset: 5/min
    async login() {}

    @Post('/forgot-password')
    @ThrottleSensitive() // Preset: 3/hour
    async forgotPassword() {}
}

@Controller('/api')
@ThrottleApi() // Preset: 100/min
export class ApiController {}
```

## 📝 Detailed Implementation Steps

### Phase 1: Expose in @lockness/hono

**Step 1.1: Add to security.ts**

File: `/packages/hono/security.ts`

```typescript
/**
 * Security Middleware
 *
 * Provides security features including:
 * - CORS (Cross-Origin Resource Sharing)
 * - CSRF (Cross-Site Request Forgery protection)
 * - Secure Headers (Security-related HTTP headers)
 * - IP Restriction (IP-based access control)
 * - Rate Limiting (Request throttling)
 *
 * @module
 */

export * from 'hono/cors'
export * from 'hono/csrf'
export * from 'hono/secure-headers'
export * from 'hono/ip-restriction'

// Rate limiting from third-party package
export { rateLimiter } from 'npm:hono-rate-limiter'
export type { RateLimitInfo, Store } from 'npm:hono-rate-limiter'
```

### Phase 2: Create Throttle Decorator in @lockness/core

**Step 2.1: Types and Utilities**

File: `/packages/core/throttle.ts`

````typescript
/**
 * @fileoverview Rate limiting decorator using hono-rate-limiter.
 *
 * @module @lockness/core
 */

import { rateLimiter, type Store } from '@lockness/hono'
import type { Context, MiddlewareHandler } from '@lockness/hono'

// =============================================================================
// Types
// =============================================================================

/**
 * Time window format: number (ms) or string with unit
 * @example '1m', '1h', '30s', 60000
 */
export type TimeWindow = number | `${number}${'s' | 'm' | 'h' | 'd'}`

/**
 * Key generator for rate limiting
 */
export type ThrottleKeyGenerator = (c: Context) => string

/**
 * Throttle options
 */
export interface ThrottleOptions {
    /**
     * How to identify the client for rate limiting
     * - 'ip': Use client IP address (default)
     * - 'user': Use authenticated user ID
     * - 'header:X-Name': Use specific header value
     * - function: Custom key generator
     */
    readonly by?: 'ip' | 'user' | `header:${string}` | ThrottleKeyGenerator

    /**
     * Custom error message when rate limited
     * @default 'Too many requests, please try again later.'
     */
    readonly message?: string

    /**
     * HTTP status code when rate limited
     * @default 429
     */
    readonly statusCode?: number

    /**
     * Include rate limit headers in response
     * - X-RateLimit-Limit
     * - X-RateLimit-Remaining
     * - X-RateLimit-Reset
     * @default true
     */
    readonly headers?: boolean

    /**
     * Skip rate limiting for certain requests
     * Return true to skip
     */
    readonly skip?: (c: Context) => boolean | Promise<boolean>

    /**
     * Custom store for rate limit data
     * Use for distributed rate limiting (e.g., Redis)
     */
    readonly store?: Store
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Parse time window to milliseconds
 */
export function parseTimeWindow(window: TimeWindow): number {
    if (typeof window === 'number') {
        return window
    }

    const match = window.match(/^(\d+)(s|m|h|d)$/)
    if (!match) {
        throw new Error(`Invalid time window format: ${window}`)
    }

    const value = parseInt(match[1], 10)
    const unit = match[2]

    switch (unit) {
        case 's':
            return value * 1000
        case 'm':
            return value * 60 * 1000
        case 'h':
            return value * 60 * 60 * 1000
        case 'd':
            return value * 24 * 60 * 60 * 1000
        default:
            throw new Error(`Unknown time unit: ${unit}`)
    }
}

/**
 * Build key generator from options
 */
function buildKeyGenerator(by: ThrottleOptions['by']): ThrottleKeyGenerator {
    if (typeof by === 'function') {
        return by
    }

    switch (by) {
        case 'user':
            return (c) => {
                const user = c.get('user')
                return user?.id?.toString() ??
                    c.req.header('x-forwarded-for') ?? 'anonymous'
            }
        case 'ip':
        default:
            if (typeof by === 'string' && by.startsWith('header:')) {
                const headerName = by.slice(7)
                return (c) => c.req.header(headerName) ?? 'anonymous'
            }
            return (c) => c.req.header('x-forwarded-for') ?? 'anonymous'
    }
}

/**
 * Create rate limiter middleware from options
 */
export function createThrottleMiddleware(
    limit: number,
    window: TimeWindow,
    options: ThrottleOptions = {},
): MiddlewareHandler {
    const windowMs = parseTimeWindow(window)
    const keyGenerator = buildKeyGenerator(options.by)

    return rateLimiter({
        windowMs,
        limit,
        keyGenerator,
        standardHeaders: options.headers ?? true,
        message: options.message ??
            'Too many requests, please try again later.',
        statusCode: options.statusCode ?? 429,
        skip: options.skip,
        store: options.store,
    })
}

// =============================================================================
// Symbols
// =============================================================================

export const THROTTLE_KEY = Symbol('throttle:config')
export const THROTTLE_METHOD_KEY = Symbol('throttle:methods')

// =============================================================================
// Decorator
// =============================================================================

/**
 * Apply rate limiting to a controller or route.
 *
 * @param limit - Maximum number of requests allowed
 * @param window - Time window (e.g., '1m', '1h', '30s')
 * @param options - Additional configuration
 *
 * @example Controller-level (applies to all routes)
 * ```typescript
 * @Controller('/api')
 * @Throttle(100, '1m')
 * export class ApiController { }
 * ```
 *
 * @example Method-level (applies to specific route)
 * ```typescript
 * @Post('/login')
 * @Throttle(5, '1m', { message: 'Too many login attempts' })
 * async login() { }
 * ```
 *
 * @example Rate limit by user instead of IP
 * ```typescript
 * @Get('/data')
 * @Throttle(50, '1m', { by: 'user' })
 * async getData() { }
 * ```
 */
export function Throttle(
    limit: number,
    window: TimeWindow,
    options: ThrottleOptions = {},
) {
    const config = { limit, window, options }

    return function <T>(
        target: T,
        context: ClassDecoratorContext | ClassMethodDecoratorContext,
    ) {
        if (context.kind === 'class') {
            // Controller-level
            ;(target as any)[THROTTLE_KEY] = config
        } else if (context.kind === 'method') {
            // Method-level
            context.addInitializer(function () {
                const methodName = String(context.name)
                const constructor = this.constructor as any

                if (!constructor[THROTTLE_METHOD_KEY]) {
                    constructor[THROTTLE_METHOD_KEY] = new Map()
                }
                constructor[THROTTLE_METHOD_KEY].set(methodName, config)
            })
        }

        return target
    }
}

// =============================================================================
// Preset Decorators
// =============================================================================

/**
 * Rate limit for login endpoints: 5 attempts per minute
 */
export function ThrottleLogin(options: Omit<ThrottleOptions, 'message'> = {}) {
    return Throttle(5, '1m', {
        ...options,
        message: 'Too many login attempts. Please try again in a minute.',
    })
}

/**
 * Rate limit for sensitive actions: 3 per hour
 */
export function ThrottleSensitive(
    options: Omit<ThrottleOptions, 'message'> = {},
) {
    return Throttle(3, '1h', {
        ...options,
        message: 'This action is rate limited. Please try again later.',
    })
}

/**
 * Rate limit for general API: 100 per minute
 */
export function ThrottleApi(options: ThrottleOptions = {}) {
    return Throttle(100, '1m', options)
}

/**
 * Rate limit for heavy API operations: 10 per minute
 */
export function ThrottleHeavy(options: ThrottleOptions = {}) {
    return Throttle(10, '1m', options)
}
````

### Phase 3: Integration with Route Registry

**Step 3.1: Update Route Registration**

File: `/packages/core/route_registry.ts` (update)

```typescript
import {
    createThrottleMiddleware,
    THROTTLE_KEY,
    THROTTLE_METHOD_KEY,
} from './throttle.ts'

// In route registration logic, check for throttle decorators
function getRouteMiddlewares(
    controller: any,
    methodName: string,
): MiddlewareHandler[] {
    const middlewares: MiddlewareHandler[] = []

    // Controller-level throttle
    if (controller[THROTTLE_KEY]) {
        const { limit, window, options } = controller[THROTTLE_KEY]
        middlewares.push(createThrottleMiddleware(limit, window, options))
    }

    // Method-level throttle (overrides controller-level)
    const methodThrottles = controller[THROTTLE_METHOD_KEY]
    if (methodThrottles?.has(methodName)) {
        // Remove controller-level throttle if method has its own
        if (controller[THROTTLE_KEY]) {
            middlewares.pop()
        }
        const { limit, window, options } = methodThrottles.get(methodName)
        middlewares.push(createThrottleMiddleware(limit, window, options))
    }

    return middlewares
}
```

### Phase 4: Exports

**Step 4.1: Update mod.ts**

File: `/packages/core/mod.ts`

```typescript
// Rate limiting
export {
    createThrottleMiddleware,
    parseTimeWindow,
    Throttle,
    ThrottleApi,
    ThrottleHeavy,
    type ThrottleKeyGenerator,
    ThrottleLogin,
    type ThrottleOptions,
    ThrottleSensitive,
    type TimeWindow,
} from './throttle.ts'
```

## 🔄 Distributed Rate Limiting

For production deployments with multiple instances, use a shared store:

```typescript
import { Throttle } from '@lockness/core'
import { createRedisStore } from '@lockness/cache/redis'

const redisStore = createRedisStore(redisClient)

@Controller('/api')
@Throttle(100, '1m', { store: redisStore })
export class ApiController {}
```

## 🧪 Testing Strategy

### Unit Tests

File: `/packages/core/tests/throttle.test.ts`

```typescript
import { assertEquals } from '@std/assert'
import { parseTimeWindow } from '../throttle.ts'

Deno.test('parseTimeWindow - parses seconds', () => {
    assertEquals(parseTimeWindow('30s'), 30_000)
})

Deno.test('parseTimeWindow - parses minutes', () => {
    assertEquals(parseTimeWindow('1m'), 60_000)
    assertEquals(parseTimeWindow('5m'), 300_000)
})

Deno.test('parseTimeWindow - parses hours', () => {
    assertEquals(parseTimeWindow('1h'), 3_600_000)
})

Deno.test('parseTimeWindow - accepts milliseconds', () => {
    assertEquals(parseTimeWindow(5000), 5000)
})
```

## ✅ Definition of Done

- [ ] `hono-rate-limiter` exposed in `@lockness/hono`
- [ ] `@Throttle(limit, window, options?)` decorator implemented
- [ ] Works on controllers (class-level)
- [ ] Works on methods (route-level)
- [ ] `by` option: 'ip', 'user', 'header:X-Name', custom function
- [ ] Preset decorators: `@ThrottleLogin`, `@ThrottleSensitive`, `@ThrottleApi`
- [ ] Rate limit headers (X-RateLimit-*) included by default
- [ ] `skip` option for conditional bypass
- [ ] All tests passing
- [ ] **JSDoc documentation complete**
- [ ] **Quality checks passed**
  - [ ] `deno check packages/core/throttle.ts` passes
  - [ ] `deno lint packages/core/` passes
  - [ ] `deno test packages/core/tests/throttle.test.ts` passes

## 🔗 Related Tasks

- [declare-middleware-decorator.md](.tasks/declare-middleware-decorator.md) -
  Same decorator pattern
- [cached-decorator.md](.tasks/cached-decorator.md) - Uses same TimeWindow
  format

## 📅 Timeline

- **Estimated Effort**: 4-6 hours
- **Priority**: High (security essential)

## 📝 Notes

### Design Decisions

1. **Why hono-rate-limiter?** Official third-party middleware, well maintained
2. **Why TimeWindow string?** More readable than milliseconds
3. **Why presets?** Common patterns shouldn't require thinking

### Security Considerations

- Default to IP-based limiting (safest)
- Include headers for client transparency
- 429 status code is standard
- Message should not reveal internal details

---

_Task created: 2026-01-24_
