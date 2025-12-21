import { Hono, type Context } from 'hono'

export type { Context }

interface Route {
    method: string
    path: string
    methodName: string
}

interface ControllerMetadata {
    _basePath?: string
    _routes?: Route[]
    // deno-lint-ignore no-explicit-any
    _middlewares?: Record<string, any[]>
}

// deno-lint-ignore no-explicit-any
type ControllerClass = (new (...args: any[]) => Record<string, any>) & ControllerMetadata

export interface Module {
    controllers: ControllerClass[]
}

export class App {
    private hono = new Hono()

    init(module: Module) {
        for (const Controller of module.controllers) {
            const instance = new Controller()
            const basePath = Controller._basePath || ''
            const routes = Controller._routes || []
            const middlewares = Controller._middlewares || {}

            for (const route of routes) {
                const fullPath = (basePath + route.path).replace(/\/+/g, '/')
                const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch'

                const routeMiddlewares = (middlewares[route.methodName] || []).map((MiddlewareClass: any) => {
                    const middlewareInstance = new MiddlewareClass() as IMiddleware
                    return middlewareInstance.handle.bind(middlewareInstance)
                })

                // deno-lint-ignore no-explicit-any
                this.hono[method](fullPath, ...routeMiddlewares, (c) => (instance as any)[route.methodName](c))
            }
        }
    }

    listen(port: number) {
        return Deno.serve({ port }, this.hono.fetch.bind(this.hono))
    }
}

export function Controller(path: string) {
    // deno-lint-ignore no-explicit-any
    return (value: any, _context: ClassDecoratorContext) => {
        value._basePath = path
    }
}

function createRouteDecorator(method: string) {
    return function (path = '') {
        // deno-lint-ignore no-explicit-any
        return (_value: any, context: ClassMethodDecoratorContext) => {
            context.addInitializer(function (this: any) {
                const constructor = this.constructor as ControllerClass
                if (!constructor._routes) constructor._routes = []
                constructor._routes.push({ method, path, methodName: context.name as string })
            })
        }
    }
}

export const Get = createRouteDecorator('get')
export const Post = createRouteDecorator('post')
export const Put = createRouteDecorator('put')
export const Delete = createRouteDecorator('delete')
export const Patch = createRouteDecorator('patch')

// Placeholders for other things for now
import type { MiddlewareHandler } from 'hono'

export interface IMiddleware {
    handle: MiddlewareHandler
}

export function Middleware() {
    // deno-lint-ignore no-explicit-any
    return (value: any, _context: ClassDecoratorContext) => {
        return value
    }
}

export function Use(middleware: (new () => IMiddleware)) {
    // deno-lint-ignore no-explicit-any
    return (_value: any, context: ClassMethodDecoratorContext) => {
        context.addInitializer(function (this: any) {
            const constructor = this.constructor
            if (!constructor._middlewares) constructor._middlewares = {}
            if (!constructor._middlewares[context.name]) constructor._middlewares[context.name] = []
            constructor._middlewares[context.name].push(middleware)
        })
    }
}

