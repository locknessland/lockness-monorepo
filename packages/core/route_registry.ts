/**
 * @fileoverview Route Registry Module
 *
 * Manages route registration, sorting, and Hono integration.
 * Handles route metadata extraction from decorated controllers,
 * middleware resolution, and route registration with the Hono router.
 *
 * @module @lockness/core/route_registry
 */

import type { Hono, MiddlewareHandler } from 'hono'
import { namedRoutes } from './router.ts'
import type { Context, ControllerClass, Route } from './types.ts'
import type { RouteInfo } from './app.ts'

/** HTTP methods supported by the router */
type HttpMethod =
    | 'get'
    | 'post'
    | 'put'
    | 'patch'
    | 'delete'
    | 'options'
    | 'head'

/**
 * Internal representation of a route ready for registration.
 * Contains the resolved path, method, handler, and middleware chain.
 *
 * @internal
 */
interface RouteRegistration {
    /** Full URL path including controller base path */
    readonly fullPath: string
    /** HTTP method in lowercase */
    readonly method: HttpMethod
    /** Route handler function */
    readonly handler: (c: Context) => unknown
    /** Resolved middleware handlers */
    readonly middlewares: readonly MiddlewareHandler[]
}

/**
 * Validator metadata attached to controller methods by `@Validate` decorator.
 * @internal
 */
interface ValidatorEntry {
    readonly middleware: MiddlewareHandler
}

/**
 * Interface for middleware resolver dependency.
 * @internal
 */
interface MiddlewareResolverLike {
    resolve: (
        middleware: MiddlewareHandler | MiddlewareClass | string,
    ) => MiddlewareHandler | null
}

/** Middleware class type (duplicated to avoid circular import) */
type MiddlewareClass = new () => { handle: MiddlewareHandler }

/**
 * Manages route registration, sorting, and Hono integration.
 *
 * Responsible for:
 * - Extracting route metadata from decorated controller classes
 * - Resolving and chaining middlewares for each route
 * - Sorting routes by specificity to ensure correct matching
 * - Registering routes with the Hono router
 * - Maintaining a registry of named routes
 *
 * @example
 * ```typescript
 * const registry = new RouteRegistry(middlewareResolver)
 * registry.registerControllers(hono, [UserController, ProductController])
 *
 * // Get all registered routes for debugging
 * const routes = registry.getRoutes()
 * ```
 */
export class RouteRegistry {
    /** Registered routes for introspection */
    private routes: RouteInfo[] = []

    /**
     * Creates a new RouteRegistry instance.
     *
     * @param middlewareResolver - Resolver for converting middleware inputs to handlers
     */
    constructor(
        private readonly middlewareResolver: MiddlewareResolverLike,
    ) {}

    /**
     * Registers all routes from the provided controllers with Hono.
     *
     * This method:
     * 1. Extracts route metadata from each controller
     * 2. Resolves middlewares for each route
     * 3. Sorts routes by specificity (static paths before parameterized)
     * 4. Registers routes with Hono
     *
     * @param hono - The Hono application instance
     * @param controllers - Array of controller classes decorated with `@Controller`
     *
     * @example
     * ```typescript
     * registry.registerControllers(hono, [UserController, ProductController])
     * ```
     */
    registerControllers(hono: Hono, controllers: ControllerClass[]): void {
        const allRoutes = this.buildRouteRegistrations(controllers)
        const sortedRoutes = this.sortRoutes(allRoutes)
        this.applyRoutesToHono(hono, sortedRoutes)
    }

    /**
     * Returns all registered routes with their metadata.
     *
     * Useful for route listing, documentation generation, and devtools.
     *
     * @returns Array of route information objects
     */
    getRoutes(): RouteInfo[] {
        return this.routes
    }

    /**
     * Clears all registered routes and named routes.
     *
     * Primarily used in testing to reset state between tests.
     */
    clear(): void {
        this.routes = []
        namedRoutes.clear()
    }

    /**
     * Builds route registrations from controller classes.
     *
     * Creates controller instances and extracts route metadata
     * from each decorated method.
     *
     * @param controllers - Array of controller classes
     * @returns Array of route registrations ready for Hono
     *
     * @internal
     */
    private buildRouteRegistrations(
        controllers: ControllerClass[],
    ): RouteRegistration[] {
        const registrations: RouteRegistration[] = []

        for (const Controller of controllers) {
            const instance = new Controller() as Record<
                string,
                (c: Context) => unknown
            >
            const controllerRoutes = this.extractControllerRoutes(
                Controller,
                instance,
            )
            registrations.push(...controllerRoutes)
        }

        return registrations
    }

    /**
     * Extracts all route registrations from a single controller.
     *
     * Processes each decorated method in the controller, resolving
     * validators and middlewares, and building the full route path.
     *
     * @param Controller - The controller class with route metadata
     * @param instance - An instance of the controller
     * @returns Array of route registrations for this controller
     *
     * @internal
     */
    private extractControllerRoutes(
        Controller: ControllerClass,
        instance: Record<string, (c: Context) => unknown>,
    ): RouteRegistration[] {
        const basePath = Controller._basePath || ''
        const routes: Route[] = Controller._routes || []
        const middlewares: Record<string, unknown[]> =
            Controller._middlewares || {}
        const validators: Record<string, ValidatorEntry[]> =
            Controller._validators || {}
        const controllerName = Controller.name

        const registrations: RouteRegistration[] = []

        for (const route of routes) {
            const fullPath = this.buildFullPath(basePath, route.path)

            // Get validator middlewares (run first)
            const routeValidators = (validators[route.methodName] || [])
                .map((v) => v.middleware)

            // Get regular middlewares (support both class and named string)
            const routeMiddlewares = (middlewares[route.methodName] || [])
                .map((m) =>
                    this.middlewareResolver.resolve(
                        m as MiddlewareHandler | MiddlewareClass | string,
                    )
                )
                .filter((h): h is MiddlewareHandler => h !== null)

            // Collect middleware names for display
            const middlewareNames = this.collectMiddlewareNames(
                route.methodName,
                validators,
                middlewares,
            )

            registrations.push({
                fullPath,
                method: route.method.toLowerCase() as HttpMethod,
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
     * Builds the full URL path from controller base path and route path.
     *
     * Normalizes slashes and handles edge cases like trailing slashes.
     *
     * @param basePath - Controller's base path from `@Controller` decorator
     * @param routePath - Route's path from method decorator
     * @returns Normalized full path
     *
     * @example
     * ```typescript
     * buildFullPath('users', '/:id') // => '/users/:id'
     * buildFullPath('/api/', '/items/') // => '/api/items'
     * ```
     *
     * @internal
     */
    private buildFullPath(basePath: string, routePath: string): string {
        let fullPath = `/${basePath}/${routePath}`.replace(/\/+/g, '/')
        // Remove trailing slash unless routePath explicitly ends with '/'
        // AND is not just '/' (the root/index route of a controller)
        if (
            fullPath.length > 1 &&
            fullPath.endsWith('/') &&
            (routePath === '/' || !routePath.endsWith('/'))
        ) {
            fullPath = fullPath.slice(0, -1)
        }
        return fullPath
    }

    /**
     * Collects middleware names for display in route listings.
     *
     * @param methodName - Controller method name
     * @param validators - Validator metadata from controller
     * @param middlewares - Middleware metadata from controller
     * @returns Array of middleware names for display
     *
     * @internal
     */
    private collectMiddlewareNames(
        methodName: string,
        validators: Record<string, ValidatorEntry[]>,
        middlewares: Record<string, unknown[]>,
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
     * Sorts routes by specificity for correct matching order.
     *
     * Static routes (without parameters) come before parameterized routes.
     * Within each group, longer paths come first.
     *
     * @param routes - Unsorted route registrations
     * @returns Sorted route registrations
     *
     * @example
     * ```
     * // Before: ['/users/:id', '/users/me', '/users']
     * // After:  ['/users/me', '/users', '/users/:id']
     * ```
     *
     * @internal
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
     * Applies route registrations to the Hono instance.
     *
     * Registers each route with its method, path, middlewares, and handler.
     *
     * @param hono - The Hono application instance
     * @param routes - Sorted route registrations
     *
     * @internal
     */
    private applyRoutesToHono(
        hono: Hono,
        routes: RouteRegistration[],
    ): void {
        for (const route of routes) {
            // Use Hono's on() method which accepts any HTTP method
            hono.on(
                [route.method.toUpperCase()],
                [route.fullPath],
                ...route.middlewares,
                route.handler as MiddlewareHandler,
            )
        }
    }
}
