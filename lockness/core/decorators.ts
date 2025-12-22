// deno-lint-ignore-file no-explicit-any
import type { ControllerClass, IMiddleware } from './types.ts'

export function Controller(
    path: string,
): ClassDecorator {
    return (target: any) => {
        target._basePath = path
    }
}

type RouteDecorator = (
    path?: string,
) => MethodDecorator

function createRouteDecorator(method: string): RouteDecorator {
    return function (path = '') {
        return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
            const constructor = target.constructor;
            if (!constructor._routes) constructor._routes = [];
            constructor._routes.push({
                method,
                path,
                 methodName: propertyKey as string,
             });
        }
    }
}

export const Get: RouteDecorator = createRouteDecorator('get')
export const Post: RouteDecorator = createRouteDecorator('post')
export const Put: RouteDecorator = createRouteDecorator('put')
export const Delete: RouteDecorator = createRouteDecorator('delete')
export const Patch: RouteDecorator = createRouteDecorator('patch')

export function Middleware(): ClassDecorator {
    return (_target: any) => {
    // no-op or registration
    }
}

export function Use(
    middleware: new () => IMiddleware,
): MethodDecorator {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
        const constructor = target.constructor;
        if (!constructor._middlewares) constructor._middlewares = {};
        const key = propertyKey as string;
        if (!constructor._middlewares[key]) {
            constructor._middlewares[key] = [];
        }
        constructor._middlewares[key].push(middleware);
    }
}
