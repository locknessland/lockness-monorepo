// deno-lint-ignore-file no-explicit-any
import type {
    Context as HonoContext,
    MiddlewareHandler,
    Next,
    ValidationTargets,
} from 'hono'
import type { Env, Input } from '@lockness/hono'

export type { MiddlewareHandler, Next, ValidationTargets }

export type Context<
    E extends Env = any,
    P extends string = any,
    I extends Input = { out: { [K in keyof ValidationTargets]: any } },
> = HonoContext<E, P, I>

export interface Route {
    method: string
    path: string
    methodName: string
    name?: string
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

export interface Module {
    controllers: ControllerClass[]
}

export interface AppConfig {
    controllersDir?: string
    staticDir?: string
}

/**
 * Error handler function type
 */
export type ErrorHandler = (
    error: Error,
    c: Context,
) => Response | Promise<Response>

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

/**
 * Extended Module config with middleware support
 */
export interface ModuleWithMiddleware extends Module {
    globalMiddlewares?: MiddlewareInput[]
    middlewares?: MiddlewareRegistry
    errorHandler?: ErrorHandler
    staticDir?: string
}
