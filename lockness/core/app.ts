// deno-lint-ignore-file no-explicit-any
import { Hono, type MiddlewareHandler } from 'hono'
import { join } from 'node:path'
import { jsxRenderer } from 'hono/jsx-renderer'
import { auth, createAuthMiddleware, createGuestMiddleware } from './auth.ts'
import type {
    AppConfig,
    Context,
    ControllerClass,
    IMiddleware,
    MiddlewareClass,
    MiddlewareRegistry,
    Module,
    ModuleWithMiddleware,
} from './types.ts'

import { serveStatic } from 'hono/deno'
import pkg from './deno.json' with { type: 'json' }

export class App {
    private hono = new Hono({ strict: false })
    private middlewareRegistry: MiddlewareRegistry = {}

    constructor() {
        this.hono.use('*', jsxRenderer(({ children }) => children as any))
    }

    public static(pathPattern: string, root: string = 'public') {
        this.hono.use(pathPattern, serveStatic({ root }))
    }

    public get fetch(): (
        request: Request,
        Env?: any,
        executionContext?: any,
    ) => Response | Promise<Response> {
        return this.hono.fetch.bind(this.hono)
    }

    /**
     * Resolve a middleware (class or named string) to a handler function
     */
    private resolveMiddleware(
        middleware: MiddlewareClass | string,
    ): MiddlewareHandler | null {
        if (typeof middleware === 'string') {
            // Named middleware - look up in registry
            const MiddlewareClass = this.middlewareRegistry[middleware]
            if (!MiddlewareClass) {
                console.warn(
                    `⚠️ Named middleware '${middleware}' not found in registry`,
                )
                return null
            }
            const instance = new MiddlewareClass() as IMiddleware
            return instance.handle.bind(instance)
        } else {
            // Class middleware
            const instance = new middleware() as IMiddleware
            return instance.handle.bind(instance)
        }
    }

    async init(config: Module | ModuleWithMiddleware | AppConfig) {
        let controllers: ControllerClass[] = []
        let globalMiddlewares: MiddlewareClass[] = []

        if ('controllers' in config) {
            controllers = config.controllers

            // Register named middlewares
            if ('middlewares' in config && config.middlewares) {
                this.middlewareRegistry = config.middlewares
            }

            // Get global middlewares
            if ('globalMiddlewares' in config && config.globalMiddlewares) {
                globalMiddlewares = config.globalMiddlewares
            }
        } else if (config.controllersDir) {
            controllers = await this.discoverControllers(config.controllersDir)
        }

        if ('staticDir' in config && config.staticDir) {
            this.static('/*', config.staticDir)
        }

        // Apply global middlewares to all routes
        const globalHandlers = globalMiddlewares
            .map((M) => this.resolveMiddleware(M))
            .filter((h) => h !== null)

        if (globalHandlers.length > 0) {
            this.hono.use('*', ...globalHandlers as any)
        }

        const allRoutes: {
            fullPath: string
            method: string
            handler: (c: Context) => any
            middlewares: any[]
        }[] = []

        for (const Controller of controllers) {
            const instance = new Controller()
            const basePath = Controller._basePath || ''
            const routes = Controller._routes || []
            const middlewares = Controller._middlewares || {}
            const validators = Controller._validators || {}

            // Check for class-level @Auth or @Guest decorators
            const classAuthRequired = Controller._authRequired === true
            const classAuthOptions = Controller._authOptions
            const classGuestRequired = Controller._guestRequired === true
            const classGuestRedirectTo = Controller._guestRedirectTo || '/'

            for (const route of routes) {
                let fullPath = `/${basePath}/${route.path}`.replace(/\/+/g, '/')
                if (fullPath.length > 1 && fullPath.endsWith('/')) {
                    fullPath = fullPath.slice(0, -1)
                }

                // Get validator middlewares (run first)
                const routeValidators = (validators[route.methodName] || [])
                    .map((v: { middleware: any }) => v.middleware)

                // Get regular middlewares (support both class and named string)
                const routeMiddlewares = (middlewares[route.methodName] || [])
                    .map((m: MiddlewareClass | string) =>
                        this.resolveMiddleware(m)
                    )
                    .filter((h: any) => h !== null)

                // Build auth middlewares
                const authMiddlewares: MiddlewareHandler[] = []

                // Get method reference
                const methodRef = (instance as any)[route.methodName]

                // Check method-level @Auth decorator
                const methodAuth = methodRef?._auth
                // Check method-level @Guest decorator
                const methodGuest = methodRef?._guest

                if (methodAuth?.required) {
                    // Method-level @Auth takes precedence
                    authMiddlewares.push(
                        createAuthMiddleware(methodAuth.options),
                    )
                } else if (methodGuest?.required) {
                    // Method-level @Guest takes precedence
                    authMiddlewares.push(
                        createGuestMiddleware(methodGuest.redirectTo),
                    )
                } else if (classAuthRequired) {
                    // Fall back to class-level @Auth
                    authMiddlewares.push(createAuthMiddleware(classAuthOptions))
                } else if (classGuestRequired) {
                    // Fall back to class-level @Guest
                    authMiddlewares.push(
                        createGuestMiddleware(classGuestRedirectTo),
                    )
                }

                allRoutes.push({
                    fullPath,
                    method: route.method.toLowerCase(),
                    handler: (c: Context) =>
                        (instance as any)[route.methodName](c),
                    middlewares: [
                        ...authMiddlewares,
                        ...routeValidators,
                        ...routeMiddlewares,
                    ],
                })
            }
        }

        allRoutes.sort((a, b) => {
            const aHasParam = a.fullPath.includes(':')
            const bHasParam = b.fullPath.includes(':')

            if (aHasParam && !bHasParam) return 1
            if (!aHasParam && bHasParam) return -1
            return b.fullPath.length - a.fullPath.length
        })

        for (const route of allRoutes) {
            ;(this.hono as any)[route.method](
                route.fullPath,
                ...route.middlewares,
                route.handler,
            )
        }
    }

    private async discoverControllers(
        dirPath: string,
    ): Promise<ControllerClass[]> {
        const controllers: ControllerClass[] = []
        let absolutePath: string

        try {
            absolutePath = Deno.realPathSync(dirPath)
        } catch (_e) {
            // If it fails, try to use CWD + dirPath
            try {
                absolutePath = join(Deno.cwd(), dirPath)
                // Test if it's a directory
                const info = Deno.statSync(absolutePath)
                if (!info.isDirectory) return []
            } catch (__e) {
                console.warn(`⚠️ Controllers directory not found: ${dirPath}`)
                return []
            }
        }

        try {
            for await (const entry of Deno.readDir(absolutePath)) {
                if (
                    entry.isFile &&
                    (entry.name.endsWith('.ts') ||
                        entry.name.endsWith('.js') ||
                        entry.name.endsWith('.tsx'))
                ) {
                    const filePath = `file://${join(absolutePath, entry.name)}`
                    const module = await import(/* @vite-ignore */ filePath)

                    for (const exportKey in module) {
                        const Exported = module[exportKey]
                        if (
                            typeof Exported === 'function' &&
                            Exported._basePath !== undefined
                        ) {
                            controllers.push(Exported as ControllerClass)
                        }
                    }
                }
            }
        } catch (error) {
            console.error(
                `❌ Error during controller discovery: ${
                    (error as Error).message
                }`,
            )
        }

        return controllers
    }

    listen(port: number): Deno.HttpServer<Deno.NetAddr> {
        const env = Deno.env.get('DENO_ENV') || Deno.env.get('APP_ENV') ||
            'development'
        const isProd = env.toLowerCase() === 'production'
        const envLabel = isProd
            ? '\x1b[45m\x1b[37m\x1b[1m PRODUCTION \x1b[0m'
            : '\x1b[44m\x1b[37m DEVELOPMENT \x1b[0m'

        console.log(`
  ▜     ▌         
  ▐ ▛▌▛▘▙▘▛▌█▌▛▘▛▘
  ▐▖▙▌▙▖▛▖▌▌▙▖▄▌▄▌ v${pkg.version}
        `)

        const tryServe = async () => {
            try {
                return Deno.serve({
                    port,
                    onListen: ({ port, hostname }) => {
                        const protocol = 'http'
                        const host = hostname === '0.0.0.0'
                            ? 'localhost'
                            : hostname
                        console.log(`  Environment: ${envLabel}\n`)
                        console.log(
                            `  🚀 Server is flying at \x1b[36m${protocol}://${host}:${port}\x1b[0m`,
                        )
                        console.log(`  📂 Ready to serve your awesome app!\n`)
                    },
                }, this.hono.fetch.bind(this.hono))
            } catch (error) {
                if (error instanceof Deno.errors.AddrInUse) {
                    const hasForce = Deno.args.includes('--force')

                    if (hasForce) {
                        try {
                            console.log(
                                `  🛠  Port ${port} in use. Attempting to force release...`,
                            )
                            const lsof = new Deno.Command('lsof', {
                                args: ['-ti', `:${port}`],
                                stdout: 'piped',
                            })
                            const { stdout } = await lsof.output()
                            const pids = new TextDecoder().decode(stdout).trim()
                                .split('\n').filter((p) => p.length > 0)

                            if (pids.length > 0) {
                                for (const pid of pids) {
                                    const kill = new Deno.Command('kill', {
                                        args: ['-9', pid],
                                    })
                                    await kill.output()
                                }
                                // Small delay to let OS release the port
                                await new Promise((r) => setTimeout(r, 800))
                                return await tryServe()
                            }
                        } catch (e) {
                            console.error(
                                `  ⚠️  Failed to force release port ${port}: ${
                                    (e as Error).message
                                }`,
                            )
                        }
                    }

                    console.error(`\x1b[31m
  ❌ Error: Port ${port} is already in use.
  
  The server could not start because another process is already listening on this port.

  Possible solutions:
  1. Kill the process using this port:
     lsof -ti:${port} | xargs kill -9
  2. Use the --force flag to let Lockness do it for you:
     deno task start -- --force
  3. Use a different port by setting the PORT environment variable:
     PORT=9999 deno task start
                \x1b[0m`)
                    Deno.exit(1)
                }
                throw error
            }
        }

        // Return a promise that resolves to the server
        // Note: Deno.serve is synchronous in Deno 1.x but we wrap it for the --force retry logic
        return tryServe() as any
    }
}
