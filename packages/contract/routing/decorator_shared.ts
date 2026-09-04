/**
 * @fileoverview Shared spine for the routing decorator family.
 *
 * Holds the controller-metadata contract every decorator family writes into
 * (`ControllerWithMetadata`, `RouteMetadata`) plus the constructor/decorator
 * helper types they all consume. Splitting the decorator families along their
 * reasons-to-change (route verbs, middleware binding, cache, throttle, static)
 * leaves this metadata contract as the one thing they genuinely share, so it
 * lives here rather than being duplicated or forcing a cycle between families.
 *
 * The public interfaces (`RouteMetadata`, `ControllerWithMetadata`) are
 * re-exported by the `decorators.ts` barrel; the constructor/decorator helper
 * types are internal to the family modules and intentionally not re-exported.
 *
 * @module
 */

import type { CacheOptions, MiddlewareInput } from '../types.ts'
import type { ThrottleConfig } from './throttle.ts'
// Type-only: the `Static` concern owns `StaticOptions`; the shared metadata
// contract only references its shape. Erased at compile time — no runtime cycle.
import type { StaticOptions } from './static_decorator.ts'

/**
 * Route metadata stored on controller classes.
 */
export interface RouteMetadata {
    /** HTTP method (get, post, put, delete, patch) */
    readonly method: string
    /** Route path relative to controller base path */
    readonly path: string
    /** Name of the method on the controller class */
    readonly methodName: string
    /** Optional route name for named routing */
    readonly name?: string
    /** File extension to strip from route parameters */
    readonly extension?: string
}

/**
 * Controller class with decorator metadata.
 * This interface describes the shape of a decorated controller class.
 */
export interface ControllerWithMetadata {
    /** Base path for all routes in this controller */
    _basePath?: string
    /** Array of route definitions */
    _routes?: RouteMetadata[]
    /** Middleware mappings by method name */
    _middlewares?: Record<string, (MiddlewareInput | string)[]>
    /** Validator mappings by method name */
    _validators?: Record<string, unknown[]>
    /** Cache configuration by method name */
    _cacheConfigs?: Record<string, CacheOptions>
    /** Throttle configuration by method name */
    _throttleConfigs?: Record<string, ThrottleConfig>
    /** Controller-wide throttle, applied to every route that has none of its own */
    _throttle?: ThrottleConfig
    /** Static-generation configuration by method name (#54, `@Static`) */
    _staticConfigs?: Record<string, StaticOptions>
    /** Controller-wide static marker: every GET route is pre-rendered (`@Static` on the class) */
    _staticAll?: boolean
}

/** Generic constructor type */
// deno-lint-ignore no-explicit-any
export type Constructor<T = unknown> = new (...args: any[]) => T

/** Constructor with controller metadata */
export type ControllerConstructor<T = unknown> =
    & Constructor<T>
    & ControllerWithMetadata

/** TC39 class decorator type */
export type TC39ClassDecorator = <T extends Constructor>(
    target: T,
    context: ClassDecoratorContext,
) => T | void

/** TC39 method decorator type */
export type TC39MethodDecorator = (
    _target: unknown,
    context: ClassMethodDecoratorContext,
) => void
