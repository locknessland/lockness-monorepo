// deno-lint-ignore-file no-explicit-any
import type { Hono, MiddlewareHandler } from 'hono'
import { namedRoutes } from './router.ts'
import type { Context, ControllerClass } from './types.ts'
import type { RouteInfo } from './app.ts'

/**
 * Interface for a route with its full registration data
 */
interface RouteRegistration {
    fullPath: string
    method: string
    handler: (c: Context) => any
    middlewares: MiddlewareHandler[]
}

/**
 * Manages route registration, sorting, and Hono integration.
 * Handles route metadata extraction, middleware resolution, and registration with Hono.
 */
export class RouteRegistry {
    private routes: RouteInfo[] = []

    constructor(
        private middlewareResolver: {
            resolve: (m: any) => MiddlewareHandler | null
        },
    ) {}

    /**
     * Register controllers and their routes with Hono
     *
     * @param hono - The Hono application instance
     * @param controllers - Array of controller classes to register
     *
     * @example
     * const registry = new RouteRegistry(middlewareResolver)
     * await registry.registerControllers(hono, [UserController, PostController])
     */
    registerControllers(hono: Hono, controllers: ControllerClass[]): void {
        const allRoutes = this.buildRouteRegistrations(controllers)
        const sortedRoutes = this.sortRoutes(allRoutes)
        this.applyRoutesToHono(hono, sortedRoutes)
    }

    /**
     * Get all registered routes information
     */
    getRoutes(): RouteInfo[] {
        return this.routes
    }

    /**
     * Clear all registered routes
     */
    clear(): void {
        this.routes = []
        namedRoutes.clear()
    }

    /**
     * Build route registrations from controller classes
     */
    private buildRouteRegistrations(
        controllers: ControllerClass[],
    ): RouteRegistration[] {
        const registrations: RouteRegistration[] = []

        for (const Controller of controllers) {
            const instance = new Controller()
            const controllerRoutes = this.extractControllerRoutes(
                Controller,
                instance,
            )
            registrations.push(...controllerRoutes)
        }

        return registrations
    }

    /**
     * Extract all route registrations from a single controller
     */
    private extractControllerRoutes(
        Controller: ControllerClass,
        instance: any,
    ): RouteRegistration[] {
        const basePath = Controller._basePath || ''
        const routes = Controller._routes || []
        const middlewares = Controller._middlewares || {}
        const validators = Controller._validators || {}
        const controllerName = Controller.name

        const registrations: RouteRegistration[] = []

        for (const route of routes) {
            const fullPath = this.buildFullPath(basePath, route.path)

            // Get validator middlewares (run first)
            const routeValidators = (validators[route.methodName] || [])
                .map((v: { middleware: any }) => v.middleware)

            // Get regular middlewares (support both class and named string)
            const routeMiddlewares = (middlewares[route.methodName] || [])
                .map((m: any) => this.middlewareResolver.resolve(m))
                .filter((h: any) => h !== null)

            // Collect middleware names for display
            const middlewareNames = this.collectMiddlewareNames(
                route.methodName,
                validators,
                middlewares,
            )

            registrations.push({
                fullPath,
                method: route.method.toLowerCase(),
                handler: (c: Context) => instance[route.methodName](c),
                middlewares: [
                    ...routeValidators,
                    ...routeMiddlewares,
                ],
            })

            // Store route info for router:list command and named routes
            this.routes.push({
                method: route.method.toUpperCase(),
                path: fullPath,
                controller: controllerName,
                action: route.methodName,
                middlewares: middlewareNames,
                name: route.name,
            })

            if (route.name) {
                namedRoutes.set(route.name, fullPath)
            }
        }

        return registrations
    }

    /**
     * Build a full path from base path and route path
     */
    private buildFullPath(basePath: string, routePath: string): string {
        let fullPath = `/${basePath}/${routePath}`.replace(/\/+/g, '/')
        // Don't remove trailing slash if the routePath explicitly ends with '/'
        // Only remove it if it was added by path joining
        if (
            fullPath.length > 1 &&
            fullPath.endsWith('/') &&
            !routePath.endsWith('/')
        ) {
            fullPath = fullPath.slice(0, -1)
        }
        return fullPath
    }

    /**
     * Collect middleware names for display purposes
     */
    private collectMiddlewareNames(
        methodName: string,
        validators: Record<string, any[]>,
        middlewares: Record<string, any[]>,
    ): string[] {
        const names: string[] = []

        // Validator middlewares
        if (validators[methodName]?.length > 0) {
            names.push('@Validate')
        }

        // Regular middlewares
        const routeMiddlewareList = middlewares[methodName] || []
        for (const m of routeMiddlewareList) {
            if (typeof m === 'string') {
                names.push(m)
            } else if (typeof m === 'function') {
                names.push(m.name)
            }
        }

        return names
    }

    /**
     * Sort routes by specificity (non-parameterized routes first, then by length)
     */
    private sortRoutes(routes: RouteRegistration[]): RouteRegistration[] {
        return routes.sort((a, b) => {
            const aHasParam = a.fullPath.includes(':')
            const bHasParam = b.fullPath.includes(':')

            if (aHasParam && !bHasParam) return 1
            if (!aHasParam && bHasParam) return -1
            return b.fullPath.length - a.fullPath.length
        })
    }

    /**
     * Apply route registrations to the Hono instance
     */
    private applyRoutesToHono(
        hono: Hono,
        routes: RouteRegistration[],
    ): void {
        for (const route of routes) {
            ;(hono as any)[route.method](
                route.fullPath,
                ...route.middlewares,
                route.handler,
            )
        }
    }
}
