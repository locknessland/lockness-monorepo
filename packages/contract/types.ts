import type {
    Context as HonoContext,
    Env,
    Input,
    MiddlewareHandler,
    Next,
    ValidationTargets,
} from 'hono'
import type { ThrottleConfig } from './routing/throttle.ts'

export type { MiddlewareHandler, Next, ValidationTargets }

export type Context<
    E extends Env = any,
    P extends string = any,
    I extends Input = { out: { [K in keyof ValidationTargets]: any } },
> = HonoContext<E, P, I>

/**
 * Constructor type for instantiable classes.
 */
// deno-lint-ignore no-explicit-any
export type Constructor<T = unknown> = new (...args: any[]) => T

/**
 * Token type for service registration.
 */
export type ServiceToken<T = unknown> = Constructor<T> | symbol | string

/**
 * Full container interface for resolution and registration.
 */
export interface ContainerContract {
    get<T>(token: Constructor<T> | ServiceToken<T>): T
    set<T>(token: Constructor<T> | ServiceToken<T>, instance: T): void
    has(token: ServiceToken): boolean
    delete(token: ServiceToken): boolean
    clear(): void
    readonly size: number
}

export interface Route {
    method: string
    path: string
    methodName: string
    name?: string
    /** File extension to strip from route parameters */
    extension?: string
}

/**
 * Interface for application-level caching.
 *
 * This interface must be implemented by the cache provider
 * and registered in the container using CacheServiceToken.
 */
export interface CacheContract {
    /** Get an item from the cache */
    get<T>(key: string): Promise<T | null>
    /** Store an item in the cache */
    set<T>(key: string, value: T, ttl?: number): Promise<void>
    /** Check if an item exists in the cache */
    has(key: string): Promise<boolean>
    /** Remove an item from the cache */
    forget(key: string): Promise<void>
    /** Clear all items from the cache */
    flush(): Promise<void>
}

/**
 * Token used to resolve the global cache service from the container.
 */
export const CacheServiceToken = Symbol('lockness:cache')

/**
 * Options for configuring caching on controller routes.
 */
export interface CacheOptions {
    /**
     * Cache TTL (Time To Live) in seconds.
     * Use 0 for permanent cache (if supported by driver).
     */
    ttl?: number
    /**
     * Custom cache key to use instead of the auto-generated URL-based key.
     */
    key?: string
    /**
     * Optional strategy to use:
     * - 'server': Store result in-memory/kv/redis (default)
     * - 'http': Only set Cache-Control headers
     */
    strategy?: 'server' | 'http' | 'both'
}

export interface ControllerMetadata {
    _basePath?: string
    _routes?: Route[]
    _middlewares?: Record<string, any[]>
    _validators?: Record<string, any[]>
    /** Cache configuration by method name */
    _cacheConfigs?: Record<string, CacheOptions>
    /** Throttle configuration by method name */
    _throttleConfigs?: Record<string, ThrottleConfig>
    /** Controller-wide throttle, applied to every route that has none of its own */
    _throttle?: ThrottleConfig
}

export type ControllerClass =
    & (new (...args: any[]) => Record<string, any>)
    & ControllerMetadata

export interface MiddlewareContract {
    handle: MiddlewareHandler
}

/**
 * Middleware class type
 */
export type MiddlewareClass = new () => MiddlewareContract

/**
 * Middleware input - can be a class or a handler function
 */
export type MiddlewareInput = MiddlewareClass | MiddlewareHandler

/**
 * Registry of named middlewares
 */
export type MiddlewareRegistry = Record<string, MiddlewareClass>
