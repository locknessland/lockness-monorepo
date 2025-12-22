// deno-lint-ignore-file no-explicit-any
import type { Context as HonoContext, MiddlewareHandler, ValidationTargets } from 'hono'
import type { Env, Input } from 'hono/types'

export type Context<
    E extends Env = any,
    P extends string = any,
    I extends Input = { out: { [K in keyof ValidationTargets]: any } }
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
    database?: {
        url: string
        schema?: any
    }
}

export interface IMiddleware {
    handle: MiddlewareHandler
}
