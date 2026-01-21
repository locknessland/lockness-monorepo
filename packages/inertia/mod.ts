/**
 * @fileoverview Inertia.js adapter for the Lockness framework.
 *
 * Build modern single-page applications (SPAs) using classic server-side
 * routing patterns. This package implements the Inertia.js protocol,
 * enabling you to use React, Vue, Svelte, or any Inertia client adapter
 * with server-side controllers.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { App } from '@lockness/core'
 * import { inertiaMiddleware } from '@lockness/inertia'
 *
 * const app = new App()
 *
 * app.useMiddleware(
 *     inertiaMiddleware({ version: '1.0.0' }),
 * )
 *
 * await app.init({ controllersDir: './app/controller' })
 * app.listen(3000)
 * ```
 *
 * ## Controller Usage
 *
 * ```typescript
 * @Controller('/')
 * export class DashboardController {
 *     @Get('/dashboard')
 *     async show(c: Context) {
 *         const inertia = c.get('inertia')
 *         return inertia.render('Dashboard', {
 *             user: await getCurrentUser(c),
 *         })
 *     }
 * }
 * ```
 *
 * ## Type-Safe Context
 *
 * For full type safety, configure your Hono app with context variables:
 *
 * ```typescript
 * import type { InertiaContextVariables } from '@lockness/inertia'
 *
 * const app = new Hono<{ Variables: InertiaContextVariables }>()
 * ```
 *
 * @module @lockness/inertia
 * @see https://inertiajs.com - Official Inertia.js documentation
 * @see https://inertiajs.com/the-protocol - Inertia protocol specification
 */

// ============================================================================
// Core Exports
// ============================================================================

/**
 * The main Inertia middleware factory.
 *
 * @see {@link inertiaMiddleware} for configuration options
 */
export { inertiaMiddleware } from './middleware.ts'

/**
 * The Inertia renderer class.
 *
 * @see {@link Inertia} for render and share methods
 */
export { Inertia } from './inertia.ts'

// ============================================================================
// Prop Helper Exports
// ============================================================================

/**
 * Prop helpers for advanced data loading patterns.
 *
 * - `optional()` - Props only included when explicitly requested
 * - `always()` - Props always included, even in partial reloads
 * - `defer()` - Props loaded client-side after initial render
 * - `merge()` / `deepMerge()` - Props merged with existing data
 * - `once()` - Props cached by client across navigations
 */
export {
    /** Create a prop that is always included */
    always,
    /** Prop class for always-included props */
    AlwaysProp,
    /** Create a deep-merge prop */
    deepMerge,
    /** Create a deferred prop loaded after render */
    defer,
    /** Prop class for deferred props */
    DeferredProp,
    /** Create a merge prop for infinite scroll */
    merge,
    /** Prop class for merge props */
    MergeProp,
    /** Create a prop that is cached by client */
    once,
    /** Prop class for cached props */
    OnceProp,
    /** Create an optional prop for partial reloads */
    optional,
    /** Prop class for optional props */
    OptionalProp,
} from './props.ts'

// ============================================================================
// Helper Exports
// ============================================================================

/**
 * Helper functions for HTML escaping and serialization.
 */
export { defaultRootView, escapeHtml, serializePageForHtml } from './helpers.ts'

// ============================================================================
// Type Exports
// ============================================================================

/**
 * All TypeScript types for the Inertia package.
 */
export type {
    /** Deferred props info in page object */
    DeferredPropsInfo,
    /** Error bag type for validation errors */
    ErrorBag,
    /** Middleware configuration options */
    InertiaConfig,
    /** Context variables for type-safe context access */
    InertiaContextVariables,
    /** Props type for inertia.render() */
    InertiaProps,
    /** Lazy prop function type */
    LazyProp,
    /** Merge props configuration in page object */
    MergePropsInfo,
    /** Once props info in page object */
    OncePropsInfo,
    /** The core Inertia page object */
    PageObject,
    /** Partial reload request info */
    PartialReloadInfo,
    /** Prop value (immediate or lazy) */
    PropValue,
    /** Options for inertia.render() */
    RenderOptions,
    /** Custom root view renderer function type */
    RootViewRenderer,
    /** Version resolver function type */
    VersionResolver,
} from './types.ts'

/**
 * Prop helper types.
 */
export type {
    /** Merge configuration interface */
    MergeConfig,
    /** Merge strategy type */
    MergeStrategy,
} from './props.ts'
