import { Context as HonoContext, Hono } from 'jsr:@hono/hono'
import { SmartRouter } from 'jsr:@hono/hono/router/smart-router'
import { RegExpRouter } from 'jsr:@hono/hono/router/reg-exp-router'
import { TrieRouter } from 'jsr:@hono/hono/router/trie-router'

// Stockage des métadonnées des routes
const routeMetadata = new Map<string, RouteDefinition[]>()

// Interface pour les métadonnées de route
interface RouteDefinition {
    path: string
    method: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'all'
    handler: (c: HonoContext) => Promise<Response> | Response
    middlewares: Function[]
}

// Création d'une instance Hono avec SmartRouter
const app = new Hono({
    router: new SmartRouter({
        routers: [new RegExpRouter(), new TrieRouter()],
    }),
})

// Décorateur Controller
export function Controller(prefix: string = '') {
    return function (target: any) {
        const routes = routeMetadata.get(target.name) || []

        routes.forEach((route) => {
            const fullPath = `${prefix}${route.path}`
            app[route.method](fullPath, async (c: HonoContext) => {
                const instance = new target()
                return await route.handler.call(instance, c)
            })
        })
    }
}

// Décorateurs de méthodes HTTP
export function Get(path: string = '') {
    return createMethodDecorator('get', path)
}

export function Post(path: string = '') {
    return createMethodDecorator('post', path)
}

export function Put(path: string = '') {
    return createMethodDecorator('put', path)
}

export function Delete(path: string = '') {
    return createMethodDecorator('delete', path)
}

export function Patch(path: string = '') {
    return createMethodDecorator('patch', path)
}

export function All(path: string = '') {
    return createMethodDecorator('all', path)
}

function createMethodDecorator(method: string, path: string) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor,
    ) {
        const controllerName = target.constructor.name
        const routes = routeMetadata.get(controllerName) || []

        routes.push({
            path,
            method: method as
                | 'get'
                | 'post'
                | 'put'
                | 'delete'
                | 'patch'
                | 'all',
            handler: descriptor.value,
            middlewares: [],
        })

        routeMetadata.set(controllerName, routes)
        return descriptor
    }
}

// Décorateurs pour les paramètres
export function Req() {
    return createParamDecorator((c: HonoContext) => c.req)
}

export function Res() {
    return createParamDecorator((c: HonoContext) => c.res)
}

export function Param(name: string) {
    return createParamDecorator((c: HonoContext) => c.req.param(name))
}

export function Query(name: string) {
    return createParamDecorator((c: HonoContext) => c.req.query(name))
}

export function Body() {
    return createParamDecorator(async (c: HonoContext) => await c.req.json())
}

function createParamDecorator(handler: (c: HonoContext) => any) {
    return function (target: any, propertyKey: string, parameterIndex: number) {
        // TODO: Implement parameter injection logic
    }
}

export type { HonoContext as Context }
export { app }
