// deno-lint-ignore-file no-explicit-any
import type {
    Context as HonoContext,
    MiddlewareHandler,
    ValidationTargets,
} from 'hono'
import type { Env, Input } from 'hono/types'

export type Context<
    E extends Env = any,
    P extends string = any,
    I extends Input = { out: { [K in keyof ValidationTargets]: any } },
> = HonoContext<E, P, I>

export interface Route {
    method: string
    path: string
    methodName: string
}

export interface ControllerMetadata {
    _basePath?: string
    _routes?: Route[]
    _middlewares?: Record<string, any[]>
    _validators?: Record<string, any[]>
    _authRequired?: boolean
    _authOptions?: { redirectTo?: string }
    _guestRequired?: boolean
    _guestRedirectTo?: string
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

export interface IMiddleware {
    handle: MiddlewareHandler
}

/**
 * Middleware class type
 */
export type MiddlewareClass = new () => IMiddleware

/**
 * Registry of named middlewares
 */
export type MiddlewareRegistry = Record<string, MiddlewareClass>

/**
 * Extended Module config with middleware support
 */
export interface ModuleWithMiddleware extends Module {
    globalMiddlewares?: MiddlewareClass[]
    middlewares?: MiddlewareRegistry
}
