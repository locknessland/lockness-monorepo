/**
 * @fileoverview TC39 Decorators for route and controller definitions.
 *
 * This module is the public barrel for the routing decorator family. The
 * decorators are split by reason-to-change into sibling modules and recombined
 * here so that `@lockness/contract` keeps exposing them from one specifier:
 * - `@Controller`, `@Get`/`@Post`/`@Put`/`@Delete`/`@Patch` — `route_decorators.ts`
 * - middleware binding (`@Middleware`, `@DeclareMiddleware`, `@Use`,
 *   `@UseMiddleware`, `@ComposeMiddleware`) — `middleware_decorators.ts`
 * - `@Cache`/`@CacheTTL`/`@CacheKey` — `cache_decorators.ts`
 * - `@Throttle` and its presets — `throttle_decorators.ts`
 * - `@Static` (SSG) — `static_decorator.ts`
 *
 * @example
 * ```ts
 * @Controller('/users')
 * class UserController {
 *   @Get('/')
 *   @UseMiddleware('auth')
 *   async index(c: Context) {
 *     return c.json({ users: [] })
 *   }
 *
 *   @Post('/')
 *   async store(c: Context) {
 *     return c.json({ created: true })
 *   }
 * }
 * ```
 *
 * @module
 */

// Route-verb decorators (`@Controller`, `@Get`…`@Patch`) — #226.
export * from './route_decorators.ts'
// Middleware-binding decorators (`@Middleware`, `@DeclareMiddleware`, `@Use`,
// `@UseMiddleware`, `@ComposeMiddleware`, `declaredMiddlewares`) — #227.
export * from './middleware_decorators.ts'
// Response-cache decorators (`@Cache`, `@CacheTTL`, `@CacheKey`) — #228.
export * from './cache_decorators.ts'
// Rate-limit decorators (`@Throttle` and presets) — #228.
export * from './throttle_decorators.ts'
// Static pre-rendering decorator (`@Static`, `StaticOptions`) — #228.
export * from './static_decorator.ts'
// The shared controller-metadata contract; its public interfaces stay visible
// from this barrel (the constructor/decorator helper types stay internal).
export type {
    ControllerWithMetadata,
    RouteMetadata,
} from './decorator_shared.ts'
