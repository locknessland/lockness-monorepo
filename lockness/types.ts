import type { Context, MiddlewareHandler } from 'hono'

export type { Context }

export interface Route {
    method: string
    path: string
    methodName: string
}

export interface ControllerMetadata {
    _basePath?: string
    _routes?: Route[]
    // deno-lint-ignore no-explicit-any
    _middlewares?: Record<string, any[]>
}

// deno-lint-ignore no-explicit-any
export type ControllerClass =
    & (new (...args: any[]) => Record<string, any>)
    & ControllerMetadata

export interface Module {
    controllers: ControllerClass[]
}

export interface AppConfig {
    controllersDir?: string
}

export interface IMiddleware {
    handle: MiddlewareHandler
}
