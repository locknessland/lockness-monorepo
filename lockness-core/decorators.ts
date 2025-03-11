import type { Context, Hono } from '@lockness/hono'

// Store metadata about routes
const ROUTES_METADATA = new Map<any, RouteDefinition[]>()

interface RouteDefinition {
    path: string
    method: 'get' | 'post' | 'put' | 'delete' | 'patch'
    propertyKey: string | symbol
}

// Controller decorator
export function Controller(prefix: string = '') {
    return function (target: any) {
        Reflect.defineMetadata('prefix', prefix, target)

        // Store the controller class to be used later for route registration
        if (!ROUTES_METADATA.has(target)) {
            ROUTES_METADATA.set(target, [])
        }
    }
}

// Create route decorator factory
function createRouteDecorator(method: RouteDefinition['method']) {
    return function (path: string = '') {
        return function (target: any, propertyKey: string | symbol) {
            const controllerClass = target.constructor
            const routes = ROUTES_METADATA.get(controllerClass) || []

            routes.push({
                path,
                method,
                propertyKey,
            })

            ROUTES_METADATA.set(controllerClass, routes)
        }
    }
}

// HTTP method decorators
export const Get = createRouteDecorator('get')
export const Post = createRouteDecorator('post')
export const Put = createRouteDecorator('put')
export const Delete = createRouteDecorator('delete')
export const Patch = createRouteDecorator('patch')

// Function to register routes from a controller instance
export function registerController(app: Hono, controllerClass: any) {
    const instance = new controllerClass()
    const prefix = Reflect.getMetadata('prefix', controllerClass) || ''
    const routes = ROUTES_METADATA.get(controllerClass) || []

    routes.forEach((route) => {
        const { path, method, propertyKey } = route
        const fullPath = `${prefix}${path}`
        const handler = instance[propertyKey].bind(instance)

        // Register the route with Hono
        app[method](fullPath, (c: Context) => handler(c))
    })
}
