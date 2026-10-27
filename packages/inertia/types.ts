/**
 * @fileoverview Type definitions for the Inertia.js adapter.
 *
 * This module provides all TypeScript interfaces and types used by
 * the Inertia middleware and renderer class.
 *
 * @module @lockness/inertia/types
 */

// Forward declaration for circular reference
import type { Inertia } from './inertia.ts'

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Version resolver function type.
 *
 * Called on each request to determine the current asset version.
 * Useful for dynamic versioning based on build hashes or timestamps.
 *
 * @returns The current asset version string
 *
 * @example
 * ```typescript
 * const versionResolver: VersionResolver = () => {
 *     return Deno.env.get('BUILD_HASH') ?? '1.0.0'
 * }
 * ```
 */
export type VersionResolver = () => string

/**
 * Function type for rendering the root HTML view.
 *
 * Called during initial page loads to generate the full HTML document
 * that bootstraps the client-side Inertia application.
 *
 * @param page - The Inertia page object containing component and props
 * @returns HTML string or Promise resolving to HTML string
 *
 * @example
 * ```typescript
 * const rootView: RootViewRenderer = (page) => {
 *     return `
 *         <!DOCTYPE html>
 *         <html>
 *             <head><title>${page.props.title ?? 'App'}</title></head>
 *             <body>
 *                 <div id="app" data-page='${JSON.stringify(page)}'></div>
 *                 <script type="module" src="/js/app.js"></script>
 *             </body>
 *         </html>
 *     `
 * }
 * ```
 */
export type RootViewRenderer = (page: PageObject) => string | Promise<string>

/**
 * Configuration options for the Inertia middleware.
 *
 * @example Basic configuration
 * ```typescript
 * const config: InertiaConfig = {
 *     version: '1.0.0',
 * }
 * ```
 *
 * @example Advanced configuration
 * ```typescript
 * const config: InertiaConfig = {
 *     version: () => Deno.env.get('BUILD_HASH') ?? '1.0.0',
 *     rootView: customRootViewRenderer,
 * }
 * ```
 */
export interface InertiaConfig {
    /**
     * The current asset version for cache busting.
     *
     * When the client's version doesn't match the server's version,
     * Inertia returns a 409 Conflict to trigger a full page reload.
     *
     * Can be:
     * - A static string (e.g., `'1.0.0'`)
     * - A function that returns a string (evaluated per request)
     *
     * @default '1.0'
     *
     * @example Static version
     * ```typescript
     * { version: '2024.01.15' }
     * ```
     *
     * @example Dynamic version from environment
     * ```typescript
     * { version: () => Deno.env.get('BUILD_HASH')! }
     * ```
     */
    readonly version?: string | VersionResolver

    /**
     * Custom root view renderer for initial page loads.
     *
     * When not provided, uses a minimal default HTML template.
     * Override this to customize the HTML shell, add scripts,
     * styles, meta tags, or integrate with your frontend framework.
     *
     * @see {@link defaultRootView} for the default implementation
     *
     * @example React SSR integration
     * ```typescript
     * {
     *     rootView: async (page) => {
     *         const html = renderToString(<App page={page} />)
     *         return `<!DOCTYPE html>${html}`
     *     }
     * }
     * ```
     */
    readonly rootView?: RootViewRenderer
}

// ============================================================================
// Page Object Types
// ============================================================================

/**
 * Error bag containing validation errors.
 *
 * Keys are field names, values are error messages.
 *
 * @example
 * ```typescript
 * const errors: ErrorBag = {
 *     email: 'The email field is required.',
 *     password: 'The password must be at least 8 characters.',
 * }
 * ```
 */
export type ErrorBag = Record<string, string>

/**
 * The Inertia page object sent to the client.
 *
 * This is the core data structure of the Inertia protocol.
 * It contains everything the client needs to render the page.
 *
 * @see https://inertiajs.com/the-protocol#the-page-object
 *
 * @example
 * ```typescript
 * const page: PageObject = {
 *     component: 'Users/Index',
 *     props: {
 *         users: [{ id: 1, name: 'John' }],
 *         errors: {},
 *     },
 *     url: '/users',
 *     version: '1.0.0',
 * }
 * ```
 */
export interface PageObject {
    /**
     * The name of the JavaScript page component to render.
     *
     * This maps to a component in your frontend application.
     * Use forward slashes to organize components in directories.
     *
     * @example `'Dashboard'`, `'Users/Index'`, `'Settings/Profile/Edit'`
     */
    readonly component: string

    /**
     * Props passed to the page component.
     *
     * Contains all data needed by the component, plus an `errors`
     * object for validation errors (required by Inertia protocol).
     */
    readonly props: Record<string, unknown> & {
        /**
         * Validation errors bag.
         * Always present (empty object if no errors).
         */
        errors?: ErrorBag
    }

    /**
     * The current page URL.
     *
     * Used by the client for browser history management.
     * Automatically extracted from the request.
     */
    readonly url: string

    /**
     * The current asset version.
     *
     * Enables cache busting when assets are updated.
     * Client compares this with its version on subsequent requests.
     */
    readonly version: string

    /**
     * Whether to encrypt the current page's history state.
     *
     * When `true`, the page's scroll position and form data
     * are encrypted before storing in browser history.
     *
     * @default false
     * @see https://inertiajs.com/history-encryption
     */
    readonly encryptHistory?: boolean

    /**
     * Whether to clear any encrypted history state.
     *
     * When `true`, clears all encrypted history entries.
     * Useful after logout or sensitive operations.
     *
     * @default false
     * @see https://inertiajs.com/history-encryption
     */
    readonly clearHistory?: boolean

    /**
     * Deferred props grouped by loading group.
     *
     * Maps group names to arrays of prop keys that should
     * be loaded client-side after initial render.
     *
     * @example
     * ```typescript
     * {
     *     deferredProps: {
     *         default: ['notifications'],
     *         sidebar: ['teams', 'projects'],
     *     }
     * }
     * ```
     */
    readonly deferredProps?: DeferredPropsInfo

    /**
     * Merge props configuration.
     *
     * Maps prop keys to their merge configuration for
     * client-side data merging (infinite scroll, etc.).
     */
    readonly mergeProps?: MergePropsInfo

    /**
     * Once props cache key mapping.
     *
     * Maps prop keys to their cache keys for client-side
     * caching across navigations.
     */
    readonly onceProps?: OncePropsInfo
}

// ============================================================================
// Props Types
// ============================================================================

/**
 * A lazy prop that is only resolved when the component requests it.
 *
 * Use for expensive operations that may not always be needed.
 *
 * @template T The type of value returned by the lazy prop
 *
 * @example
 * ```typescript
 * const lazyUsers: LazyProp<User[]> = () => userService.findAll()
 * const asyncLazy: LazyProp<number> = async () => await countUsers()
 * ```
 */
export type LazyProp<T = unknown> = () => T | Promise<T>

/**
 * A prop value that can be either immediate or lazy.
 *
 * @template T The type of the prop value
 */
export type PropValue<T = unknown> = T | LazyProp<T>

/**
 * Props that can be passed to `inertia.render()`.
 *
 * Values can be:
 * - Raw data (resolved immediately)
 * - Synchronous functions (lazy, resolved on demand)
 * - Async functions (lazy async, resolved on demand)
 *
 * @example
 * ```typescript
 * const props: InertiaProps = {
 *     // Immediate value
 *     user: currentUser,
 *
 *     // Lazy sync
 *     permissions: () => user.getPermissions(),
 *
 *     // Lazy async
 *     notifications: async () => await notificationService.recent(),
 * }
 * ```
 */
export type InertiaProps = Record<string, PropValue>

// ============================================================================
// Render Options
// ============================================================================

/**
 * Options for the `inertia.render()` method.
 *
 * @example
 * ```typescript
 * inertia.render('Checkout', props, {
 *     encryptHistory: true,  // Encrypt sensitive checkout data
 * })
 * ```
 */
export interface RenderOptions {
    /**
     * Whether to encrypt the page's history state.
     *
     * Enable for pages with sensitive data that shouldn't
     * be stored in plain text in browser history.
     *
     * @default false
     */
    readonly encryptHistory?: boolean

    /**
     * Whether to clear encrypted history state.
     *
     * Enable after logout or when switching users to
     * prevent access to previous user's encrypted data.
     *
     * @default false
     */
    readonly clearHistory?: boolean
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Hono context variables added by the Inertia middleware.
 *
 * Use this type to enable type-safe access to the Inertia instance.
 *
 * @example
 * ```typescript
 * import type { Hono } from 'hono'
 * import type { InertiaContextVariables } from '@lockness/inertia'
 *
 * const app = new Hono<{ Variables: InertiaContextVariables }>()
 *
 * app.get('/dashboard', (c) => {
 *     const inertia = c.get('inertia') // ✅ Typed as Inertia
 *     return inertia.render('Dashboard', { ... })
 * })
 * ```
 */
export interface InertiaContextVariables {
    /**
     * The Inertia renderer instance.
     *
     * Provides `render()` and `share()` methods for building
     * Inertia responses.
     */
    inertia: Inertia
}

// ============================================================================
// HTTP Types
// ============================================================================

/**
 * HTTP methods that trigger redirect conversion (302 → 303).
 *
 * Per the Inertia protocol, these methods should use 303 See Other
 * for redirects to ensure the browser uses GET for the redirect.
 *
 * @internal
 */
export type RedirectConversionMethod = 'PUT' | 'PATCH' | 'DELETE'

/**
 * Inertia-specific HTTP headers.
 *
 * @internal
 */
export interface InertiaHeaders {
    /** Indicates this is an Inertia request */
    readonly 'X-Inertia': 'true'
    /** Client's current asset version */
    readonly 'X-Inertia-Version'?: string
    /** Partial reload component name */
    readonly 'X-Inertia-Partial-Component'?: string
    /** Partial reload data keys to include (comma-separated) */
    readonly 'X-Inertia-Partial-Data'?: string
    /** Partial reload data keys to exclude (comma-separated) */
    readonly 'X-Inertia-Partial-Except'?: string
    /** Props to reset (comma-separated, for merge props) */
    readonly 'X-Inertia-Reset'?: string
}

// ============================================================================
// Partial Reload Types
// ============================================================================

/**
 * Partial reload request information.
 *
 * Extracted from request headers during partial reload requests.
 *
 * @internal
 */
export interface PartialReloadInfo {
    /** Whether this is a partial reload request */
    readonly isPartial: boolean
    /** The component name for the partial reload */
    readonly component: string | null
    /** Props to include (from X-Inertia-Partial-Data) */
    readonly only: ReadonlySet<string>
    /** Props to exclude (from X-Inertia-Partial-Except) */
    readonly except: ReadonlySet<string>
    /** Props to reset (from X-Inertia-Reset, for merge props) */
    readonly reset: ReadonlySet<string>
}

// ============================================================================
// Deferred Props Types
// ============================================================================

/**
 * Information about deferred props for client-side loading.
 *
 * Sent in the page object to tell the client which props
 * need to be loaded after initial render.
 */
export interface DeferredPropsInfo {
    /** Group name to prop keys mapping */
    readonly [group: string]: readonly string[]
}

/**
 * Information about merge props for client-side handling.
 */
export interface MergePropsInfo {
    /** Prop key to merge configuration */
    readonly [key: string]: {
        /** Merge strategy */
        readonly strategy: 'append' | 'prepend'
        /** Nested paths to merge */
        readonly paths: readonly string[]
        /** Field to match items by */
        readonly matchOn?: string
        /** Whether to deep merge */
        readonly deep: boolean
    }
}

/**
 * Information about once props for client-side caching.
 */
export interface OncePropsInfo {
    /**
     * Prop key to cache key mapping.
     * The cache key is used by the client to identify shared data.
     */
    readonly [propKey: string]: string
}
