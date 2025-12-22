// deno-lint-ignore-file no-explicit-any
import { Hono } from 'hono'
import { join } from '@std/path'
import { jsxRenderer } from 'hono/jsx-renderer'
import type {
    AppConfig,
    Context,
    ControllerClass,
    IMiddleware,
    Module,
} from './types.ts'

import { serveStatic } from 'hono/deno'
import pkg from './deno.json' with { type: 'json' }

export class App {
    private hono = new Hono({ strict: false })

    constructor() {
        this.hono.use('*', jsxRenderer(({ children }) => children as any))
    }

    public static(path: string, root: string = 'public') {
        this.hono.use(path, serveStatic({ root }))
    }

    async init(config: Module | AppConfig) {
        let controllers: ControllerClass[] = []

        if ('controllers' in config) {
            controllers = config.controllers
        } else {
            if (config.controllersDir) {
                controllers = await this.discoverControllers(
                    config.controllersDir,
                )
            }
            if (config.staticDir) {
                this.static('/*', config.staticDir)
            }
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

            for (const route of routes) {
                let fullPath = `/${basePath}/${route.path}`.replace(/\/+/g, '/')
                if (fullPath.length > 1 && fullPath.endsWith('/')) {
                    fullPath = fullPath.slice(0, -1)
                }

                const routeMiddlewares = (middlewares[route.methodName] || [])
                    .map((MiddlewareClass: any) => {
                        const middlewareInstance =
                            new MiddlewareClass() as IMiddleware
                        return middlewareInstance.handle.bind(
                            middlewareInstance,
                        )
                    })

                allRoutes.push({
                    fullPath,
                    method: route.method.toLowerCase(),
                    handler: (c: Context) =>
                        (instance as any)[route.methodName](c),
                    middlewares: routeMiddlewares,
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
        const absolutePath = Deno.realPathSync(dirPath)

        for await (const entry of Deno.readDir(absolutePath)) {
            if (
                entry.isFile &&
                (entry.name.endsWith('.ts') || entry.name.endsWith('.js') ||
                    entry.name.endsWith('.tsx'))
            ) {
                const filePath = `file://${join(absolutePath, entry.name)}`
                const module = await import(filePath)

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

        return controllers
    }

    listen(port: number): Deno.HttpServer<Deno.NetAddr> {
        console.log(`
  ▜     ▌         
  ▐ ▛▌▛▘▙▘▛▌█▌▛▘▛▘
  ▐▖▙▌▙▖▛▖▌▌▙▖▄▌▄▌ v${pkg.version}
        `)

        const server = Deno.serve({
            port,
            onListen: ({ port, hostname }) => {
                const protocol = 'http'
                const host = hostname === '0.0.0.0' ? 'localhost' : hostname
                console.log(
                    `  🚀 Server is flying at \x1b[36m${protocol}://${host}:${port}\x1b[0m`,
                )
                console.log(`  📂 Ready to serve your awesome app!\n`)
            },
        }, this.hono.fetch.bind(this.hono))

        return server
    }
}
