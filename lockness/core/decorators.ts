// deno-lint-ignore-file no-explicit-any
import type { IMiddleware } from './types.ts'

/**
 * Controller decorator - marks a class as a controller and sets its base path
 * @param path Base path for all routes in this controller
 */
export function Controller(path: string) {
    return function <T extends new (...args: any[]) => any>(
        target: T,
        _context: ClassDecoratorContext,
    ) {
        // With TC39 decorators, we modify the constructor directly
        (target as any)._basePath = path
        // Initialize arrays if they don't exist
        if (!(target as any)._routes) (target as any)._routes = []
        if (!(target as any)._middlewares) (target as any)._middlewares = {}
        if (!(target as any)._validators) (target as any)._validators = {}
        return target
    }
}

type RouteDecorator = (path?: string) => any

function createRouteDecorator(method: string): RouteDecorator {
    return function (path = '') {
        return function (
            _target: any,
            context: ClassMethodDecoratorContext,
        ) {
            // Store route metadata directly on the constructor (not instance)
            const methodName = String(context.name)

            // We need to get the constructor, but context doesn't give it directly
            // So we use addInitializer to run on first instance creation
            let initialized = false
            context.addInitializer(function (this: any) {
                if (!initialized) {
                    initialized = true
                    const constructor = this.constructor
                    if (!constructor._routes) constructor._routes = []
                    constructor._routes.push({
                        method,
                        path,
                        methodName,
                    })
                }
            })
        }
    }
}

export const Get: RouteDecorator = createRouteDecorator('get')
export const Post: RouteDecorator = createRouteDecorator('post')
export const Put: RouteDecorator = createRouteDecorator('put')
export const Delete: RouteDecorator = createRouteDecorator('delete')
export const Patch: RouteDecorator = createRouteDecorator('patch')

export function Middleware() {
    return function <T extends new (...args: any[]) => any>(
        target: T,
        _context: ClassDecoratorContext,
    ) {
        return target
    }
}

/**
 * Apply a middleware to a route method.
 * Can accept either a middleware class or a named middleware string.
 *
 * @example
 * // Using a class directly
 * @Use(AuthMiddleware)
 *
 * // Using a named middleware (must be registered in kernel)
 * @Use('auth')
 */
export function Use(middleware: (new () => IMiddleware) | string) {
    return function (
        _target: any,
        context: ClassMethodDecoratorContext,
    ) {
        const methodName = String(context.name)
        let initialized = false
        context.addInitializer(function (this: any) {
            if (!initialized) {
                initialized = true
                const constructor = this.constructor
                if (!constructor._middlewares) constructor._middlewares = {}
                if (!constructor._middlewares[methodName]) {
                    constructor._middlewares[methodName] = []
                }
                constructor._middlewares[methodName].push(middleware)
            }
        })
    }
}
