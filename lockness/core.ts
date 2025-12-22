import { type Context, Hono } from 'hono'
import { join } from '@std/path'
import { html } from 'hono/html'
import { jsxRenderer } from 'hono/jsx-renderer'

export type { Context }
export { html }

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
type ControllerClass =
    & (new (...args: any[]) => Record<string, any>)
    & ControllerMetadata

export interface Module {
    controllers: ControllerClass[]
}

export interface AppConfig {
    controllersDir?: string
}

export class App {
    private hono = new Hono({ strict: false })

    constructor() {
        // deno-lint-ignore no-explicit-any
        this.hono.use('*', jsxRenderer(({ children }) => children as any))
    }


    async init(config: Module | AppConfig) {
        let controllers: ControllerClass[] = []

        if ('controllers' in config) {
            controllers = config.controllers
        } else if (config.controllersDir) {
            controllers = await this.discoverControllers(config.controllersDir)
        }

        const allRoutes: {
            fullPath: string,
            method: string,
            handler: (c: Context) => any,
            middlewares: any[]
        }[] = []

        // 1. Collect all routes from all controllers
        for (const Controller of controllers) {
            const instance = new Controller()
            const basePath = Controller._basePath || ''
            const routes = Controller._routes || []
            const middlewares = Controller._middlewares || {}

            for (const route of routes) {
                let fullPath = `/${basePath}/${route.path}`.replace(/\/+/g, '/')
                if (fullPath.length > 1 && fullPath.endsWith('/')) {
                    fullPath = fullPath.slice(0, -1)
                }

                const routeMiddlewares = (middlewares[route.methodName] || [])
                    .map((MiddlewareClass: any) => {
                        const middlewareInstance = new MiddlewareClass() as IMiddleware
                        return middlewareInstance.handle.bind(middlewareInstance)
                    })

                allRoutes.push({
                    fullPath,
                    method: route.method.toLowerCase(),
                    handler: (c: Context) => (instance as any)[route.methodName](c),
                    middlewares: routeMiddlewares
                })
            }
        }

        // 2. Sort routes: static routes first, then routes with parameters (:)
        // We prioritize routes with fewer parameters and more static segments
        allRoutes.sort((a, b) => {
            const aHasParam = a.fullPath.includes(':')
            const bHasParam = b.fullPath.includes(':')

            if (aHasParam && !bHasParam) return 1
            if (!aHasParam && bHasParam) return -1

            // If both have params or both are static, longer path first (more specific)
            return b.fullPath.length - a.fullPath.length
        })

        // 3. Register sorted routes in Hono
        for (const route of allRoutes) {
            // deno-lint-ignore no-explicit-any
            (this.hono as any)[route.method](
                route.fullPath,
                ...route.middlewares,
                route.handler
            )
        }
    }



    private async discoverControllers(dirPath: string): Promise<ControllerClass[]> {
        const controllers: ControllerClass[] = []
        const absolutePath = Deno.realPathSync(dirPath)

        for await (const entry of Deno.readDir(absolutePath)) {
            if (entry.isFile && (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.tsx'))) {
                const filePath = `file://${join(absolutePath, entry.name)}`

                const module = await import(filePath)

                for (const exportKey in module) {
                    const Exported = module[exportKey]
                    if (typeof Exported === 'function' && Exported._basePath !== undefined) {
                        controllers.push(Exported as ControllerClass)
                    }
                }
            }
        }

        return controllers
    }

    listen(port: number): Deno.HttpServer<Deno.NetAddr> {
        return Deno.serve({ port }, this.hono.fetch.bind(this.hono))
    }
}

export function Controller(path: string): (value: any, _context: ClassDecoratorContext) => void {
    // deno-lint-ignore no-explicit-any
    return (value: any, _context: ClassDecoratorContext) => {
        value._basePath = path
    }
}

type RouteDecorator = (path?: string) => (_value: any, context: ClassMethodDecoratorContext) => void

function createRouteDecorator(method: string): RouteDecorator {
    return function (path = '') {
        // deno-lint-ignore no-explicit-any
        return (_value: any, context: ClassMethodDecoratorContext) => {
            context.addInitializer(function (this: any) {
                const constructor = this.constructor as ControllerClass
                if (!constructor._routes) constructor._routes = []
                constructor._routes.push({
                    method,
                    path,
                    methodName: context.name as string,
                })
            })
        }
    }
}

export const Get: RouteDecorator = createRouteDecorator('get')
export const Post: RouteDecorator = createRouteDecorator('post')
export const Put: RouteDecorator = createRouteDecorator('put')
export const Delete: RouteDecorator = createRouteDecorator('delete')
export const Patch: RouteDecorator = createRouteDecorator('patch')

// Placeholders for other things for now
import type { MiddlewareHandler } from 'hono'

export interface IMiddleware {
    handle: MiddlewareHandler
}

export function Middleware(): (value: any, _context: ClassDecoratorContext) => any {
    // deno-lint-ignore no-explicit-any
    return (value: any, _context: ClassDecoratorContext) => {
        return value
    }
}

export function Use(middleware: new () => IMiddleware): (_value: any, context: ClassMethodDecoratorContext) => void {
    // deno-lint-ignore no-explicit-any
    return (_value: any, context: ClassMethodDecoratorContext) => {
        context.addInitializer(function (this: any) {
            const constructor = this.constructor
            if (!constructor._middlewares) constructor._middlewares = {}
            if (!constructor._middlewares[context.name]) {
                constructor._middlewares[context.name] = []
            }
            constructor._middlewares[context.name].push(middleware)
        })
    }
}
