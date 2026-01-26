import type {
    Context as HonoContext,
    Env,
    Input,
    MiddlewareHandler,
    Next,
    ValidationTargets,
} from 'hono'

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
export interface IContainer {
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

export interface ControllerMetadata {
    _basePath?: string
    _routes?: Route[]
    _middlewares?: Record<string, any[]>
    _validators?: Record<string, any[]>
}

export type ControllerClass =
    & (new (...args: any[]) => Record<string, any>)
    & ControllerMetadata

export interface IMiddleware {
    handle: MiddlewareHandler
}

/**
 * Middleware class type
 */
export type MiddlewareClass = new () => IMiddleware

/**
 * Middleware input - can be a class or a handler function
 */
export type MiddlewareInput = MiddlewareClass | MiddlewareHandler

/**
 * Registry of named middlewares
 */
export type MiddlewareRegistry = Record<string, MiddlewareClass>
