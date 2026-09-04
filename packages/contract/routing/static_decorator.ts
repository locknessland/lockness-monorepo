/**
 * @fileoverview Static pre-rendering decorator (`@Static`) for SSG (#54).
 *
 * Declares the `@Static` decorator and its `StaticOptions` shape. This is the
 * single reason-to-change for "which routes are pre-rendered by `ssg:build`";
 * route verbs, middleware binding, caching and throttling live in sibling
 * modules and are recombined by the `decorators.ts` barrel.
 *
 * @module
 */

import type { ControllerConstructor } from './decorator_shared.ts'

/**
 * Options for the {@link Static} decorator (#54).
 *
 * v1 exposes a single field. It deliberately carries **no** data-fetching hook:
 * `@Static` routes do not run DB queries or external `fetch` at build time
 * (that is the deferred build-time-data feature). This shape is the single home
 * for the "build-time data is forbidden in v1" rule — a `data`/`loader` field may
 * not be added without amending the feature plan.
 */
export interface StaticOptions {
    /**
     * An explicit, literal enumeration of a parameterized route's values, one
     * map per emitted page (e.g. `[{ slug: 'intro' }, { slug: 'setup' }]`). The
     * SSG build substitutes each map into the route path and emits one file per
     * entry. Omit for a parameterless route; a parameterized `@Static` route with
     * no `params` list is a build error.
     */
    readonly params?: ReadonlyArray<Record<string, string>>
}

/**
 * Opt a route (or a whole controller) into static pre-rendering by the
 * `ssg:build` command (#54).
 *
 * Applied to a **method**, it marks that single route static. Applied to a
 * **class**, it marks every GET route the controller declares static. It records
 * metadata on the controller constructor — method-level via `addInitializer`
 * (which fires only on instantiation, matching `@Cache` / `@Throttle`),
 * class-level directly — and changes nothing at runtime; only the SSG build
 * reads it. This decorator is the single home for the "which routes are static"
 * decision.
 *
 * @param options - Optional static configuration (the literal `params` list).
 * @returns A decorator usable on a controller class or a route method.
 * @throws {TypeError} If applied to anything but a class or a method.
 *
 * @example Method-level, parameterless
 * ```ts
 * @Get('/')
 * @Static()
 * index(c: Context) { return c.html(<Home />) }
 * ```
 *
 * @example Method-level with a literal params list
 * ```ts
 * @Get('/:slug')
 * @Static({ params: [{ slug: 'intro' }, { slug: 'setup' }] })
 * page(c: Context) { return c.html(<Doc slug={c.req.param('slug')} />) }
 * ```
 *
 * @example Class-level — every GET route static
 * ```ts
 * @Controller('/docs')
 * @Static()
 * class DocsController { ... }
 * ```
 */
export function Static(
    options: StaticOptions = {},
): (target: unknown, context: DecoratorContext) => void {
    return function (target: unknown, context: DecoratorContext): void {
        if (context.kind === 'class') {
            const controller = target as ControllerConstructor
            controller._staticAll = true
            return
        }

        if (context.kind !== 'method') {
            throw new TypeError(
                `@Static can only decorate a controller class or a route method, not a ${context.kind}.`,
            )
        }

        const methodName = String(context.name)
        let initialized = false
        ;(context as ClassMethodDecoratorContext).addInitializer(function () {
            if (initialized) return
            initialized = true
            const constructor =
                (this as { constructor: ControllerConstructor }).constructor
            if (!constructor._staticConfigs) constructor._staticConfigs = {}
            constructor._staticConfigs[methodName] = options
        })
    }
}
