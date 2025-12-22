// deno-lint-ignore-file no-explicit-any
import type { ControllerClass, IMiddleware } from './types.ts'

export function Controller(path: string): (value: any, _context: ClassDecoratorContext) => void {
    return (value: any, _context: ClassDecoratorContext) => {
        value._basePath = path
    }
}

type RouteDecorator = (path?: string) => (_value: any, context: ClassMethodDecoratorContext) => void

function createRouteDecorator(method: string): RouteDecorator {
    return function (path = '') {
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

export function Middleware(): (value: any, _context: ClassDecoratorContext) => any {
    return (value: any, _context: ClassDecoratorContext) => {
        return value
    }
}

export function Use(middleware: new () => IMiddleware): (_value: any, context: ClassMethodDecoratorContext) => void {
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
