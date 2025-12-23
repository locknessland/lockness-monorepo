import { type Ace } from '../cli.ts'
import { join } from '@std/path'

export function registerRouterCommands(ace: Ace) {
    ace.register('router:list', async () => {
        try {
            // Load controllers from src/controller directory
            const controllerDir = join(Deno.cwd(), 'src', 'controller')
            const controllers: any[] = []

            try {
                for await (const entry of Deno.readDir(controllerDir)) {
                    if (
                        entry.isFile &&
                        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
                    ) {
                        const filePath = `file://${join(controllerDir, entry.name)}`
                        try {
                            const module = await import(/* @vite-ignore */ filePath)

                            for (const key in module) {
                                const Exported = module[key]
                                if (
                                    typeof Exported === 'function' &&
                                    (Exported as any)._basePath !== undefined
                                ) {
                                    controllers.push(Exported)
                                }
                            }
                        } catch (importError) {
                            console.warn(`⚠️  Could not import ${entry.name}: ${(importError as Error).message}`)
                        }
                    }
                }
            } catch (e) {
                console.error('❌ Could not read src/controller directory')
                console.error(`   ${(e as Error).message}`)
                return
            }

            if (controllers.length === 0) {
                console.log('⚠️  No controllers found in src/controller/')
                return
            }

            // Collect all routes from controllers
            interface RouteInfo {
                method: string
                path: string
                controller: string
                action: string
                middlewares: string[]
            }

            const routes: RouteInfo[] = []

            for (const Controller of controllers) {
                const basePath = (Controller as any)._basePath || ''
                const controllerRoutes = (Controller as any)._routes || []
                const middlewares = (Controller as any)._middlewares || {}
                const validators = (Controller as any)._validators || {}
                const controllerName = Controller.name

                // Check for class-level decorators
                const classAuthRequired = (Controller as any)._authRequired === true
                const classGuestRequired = (Controller as any)._guestRequired === true

                for (const route of controllerRoutes) {
                    let fullPath = `/${basePath}/${route.path}`.replace(/\/+/g, '/')
                    if (fullPath.length > 1 && fullPath.endsWith('/')) {
                        fullPath = fullPath.slice(0, -1)
                    }

                    // Collect middleware names
                    const middlewareNames: string[] = []

                    // Check method-level auth decorators
                    const instance = new Controller()
                    const methodRef = (instance as any)[route.methodName]
                    const methodAuth = methodRef?._auth
                    const methodGuest = methodRef?._guest

                    if (methodAuth?.required || classAuthRequired) {
                        middlewareNames.push('@Auth')
                    } else if (methodGuest?.required || classGuestRequired) {
                        middlewareNames.push('@Guest')
                    }

                    // Validators
                    if (validators[route.methodName]?.length > 0) {
                        middlewareNames.push('@Validate')
                    }

                    // Regular middlewares
                    const routeMiddlewares = middlewares[route.methodName] || []
                    for (const m of routeMiddlewares) {
                        if (typeof m === 'string') {
                            middlewareNames.push(m)
                        }
                    }

                    routes.push({
                        method: route.method.toUpperCase(),
                        path: fullPath,
                        controller: controllerName,
                        action: route.methodName,
                        middlewares: middlewareNames,
                    })
                }
            }

            if (routes.length === 0) {
                console.log('⚠️  No routes registered.')
                return
            }

            console.log(`\n📋 Registered Routes (${routes.length} total)\n`)

            // Calculate column widths
            const methodWidth = Math.max(6, ...routes.map((r) => r.method.length))
            const pathWidth = Math.max(20, ...routes.map((r) => r.path.length))
            const controllerWidth = Math.max(15, ...routes.map((r) => r.controller.length))
            const actionWidth = Math.max(10, ...routes.map((r) => r.action.length))

            // Print header
            const header =
                `┃ ${'METHOD'.padEnd(methodWidth)} ┃ ${'PATH'.padEnd(pathWidth)} ┃ ${'CONTROLLER'.padEnd(controllerWidth)} ┃ ${'ACTION'.padEnd(actionWidth)} ┃ MIDDLEWARES`
            const separator = '━'.repeat(header.length)

            console.log(separator)
            console.log(header)
            console.log(separator)

            // Print each route
            for (const route of routes) {
                const method = route.method.padEnd(methodWidth)
                const path = route.path.padEnd(pathWidth)
                const controller = route.controller.padEnd(controllerWidth)
                const action = route.action.padEnd(actionWidth)
                const middlewares = route.middlewares.length > 0
                    ? route.middlewares.join(', ')
                    : '-'

                // Color code by HTTP method
                let methodColor = '\x1b[0m'
                if (route.method === 'GET') methodColor = '\x1b[32m'
                else if (route.method === 'POST') methodColor = '\x1b[33m'
                else if (route.method === 'PUT') methodColor = '\x1b[34m'
                else if (route.method === 'PATCH') methodColor = '\x1b[36m'
                else if (route.method === 'DELETE') methodColor = '\x1b[31m'

                console.log(
                    `┃ ${methodColor}${method}\x1b[0m ┃ ${path} ┃ ${controller} ┃ ${action} ┃ ${middlewares}`,
                )
            }

            console.log(separator)
            console.log()
        } catch (error) {
            console.error(`❌ Error listing routes: ${(error as Error).message}`)
        }
    }, 'Display all registered routes')
}
