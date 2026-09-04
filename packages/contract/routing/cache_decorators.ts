/**
 * @fileoverview Response-cache decorators (`@Cache`, `@CacheTTL`, `@CacheKey`).
 *
 * Declares the caching side of the routing decorator family: the metadata
 * recorded on a controller's `_cacheConfigs` and read later by the cache
 * middleware. This is the single reason-to-change for "how a route's response
 * is cached"; route verbs, middleware binding, throttling and static generation
 * live in sibling modules and are recombined by the `decorators.ts` barrel.
 *
 * @module
 */

import type { CacheOptions } from '../types.ts'
import type {
    ControllerConstructor,
    TC39MethodDecorator,
} from './decorator_shared.ts'

/**
 * Configure caching for a route method.
 *
 * @param options - Cache configuration options (ttl, key, strategy)
 * @returns Method decorator function
 *
 * @example
 * ```ts
 * @Cache({ ttl: 60, strategy: 'server' })
 * async index(c: Context) { ... }
 * ```
 */
export function Cache(options: CacheOptions): TC39MethodDecorator {
    return function (
        _target: unknown,
        context: ClassMethodDecoratorContext,
    ): void {
        const methodName = String(context.name)
        let initialized = false
        context.addInitializer(function () {
            if (!initialized) {
                initialized = true
                const constructor =
                    (this as { constructor: ControllerConstructor })
                        .constructor
                if (!constructor._cacheConfigs) constructor._cacheConfigs = {}
                constructor._cacheConfigs[methodName] = {
                    ...constructor._cacheConfigs[methodName],
                    ...options,
                }
            }
        })
    }
}

/**
 * Set the cache TTL for a route method.
 *
 * @param ttl - Cache TTL in seconds
 * @returns Method decorator function
 *
 * @example
 * ```ts
 * @CacheTTL(300)
 * async index(c: Context) { ... }
 * ```
 */
export function CacheTTL(ttl: number): TC39MethodDecorator {
    return Cache({ ttl })
}

/**
 * Set a custom cache key for a route method.
 *
 * @param key - Custom cache key
 * @returns Method decorator function
 *
 * @example
 * ```ts
 * @CacheKey('custom_users_list')
 * async index(c: Context) { ... }
 * ```
 */
export function CacheKey(key: string): TC39MethodDecorator {
    return Cache({ key })
}
