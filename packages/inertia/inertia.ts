/**
 * @fileoverview Inertia renderer class for building Inertia responses.
 *
 * The Inertia class is the core API for rendering pages in an Inertia
 * application. It handles both JSON responses for AJAX requests and
 * HTML responses for initial page loads.
 *
 * @module @lockness/inertia/inertia
 *
 * @example
 * ```typescript
 * // In a controller
 * const inertia = c.get('inertia')
 *
 * return inertia.render('Users/Index', {
 *     users: await userService.findAll(),
 * })
 * ```
 */

import type { Context } from 'hono'
import type {
    DeferredPropsInfo,
    InertiaProps,
    MergePropsInfo,
    OncePropsInfo,
    PageObject,
    PartialReloadInfo,
    RenderOptions,
    RootViewRenderer,
} from './types.ts'
import { defaultRootView } from './helpers.ts'
import {
    type DeferredProp,
    isAlwaysProp,
    isDeferredProp,
    isMergeProp,
    isOnceProp,
    isOptionalProp,
    type MergeProp,
    type OnceProp,
    type PropWrapper,
} from './props.ts'

/**
 * Internal configuration for Inertia instance.
 * @internal
 */
interface InertiaOptions {
    /** Current asset version for cache busting */
    readonly version: string
    /** Custom root view renderer */
    readonly rootView?: RootViewRenderer
}

/**
 * The Inertia renderer class.
 *
 * Handles rendering Inertia responses as either JSON (for AJAX requests)
 * or HTML (for initial page loads). Supports shared props, lazy props,
 * partial reloads, deferred props, and merge props.
 *
 * @example Basic usage
 * ```typescript
 * const inertia = c.get('inertia')
 *
 * return inertia.render('Dashboard', {
 *     stats: await getStats(),
 * })
 * ```
 *
 * @example With shared props
 * ```typescript
 * // In middleware
 * const inertia = c.get('inertia')
 * inertia.share({
 *     auth: { user: await getCurrentUser(c) },
 *     flash: c.get('session')?.flash ?? {},
 * })
 * ```
 *
 * @example With prop helpers
 * ```typescript
 * import { optional, always, defer, merge } from '@lockness/inertia'
 *
 * return inertia.render('Users/Index', {
 *     // Only when explicitly requested
 *     users: optional(() => userService.findAll()),
 *     // Always included
 *     permissions: always(currentUser.permissions),
 *     // Loaded after render
 *     analytics: defer(() => analyticsService.get()),
 *     // Merged with existing data
 *     items: merge(() => itemService.paginate(page)),
 * })
 * ```
 */
export class Inertia {
    /** @internal */
    private readonly context: Context
    /** @internal */
    private readonly version: string
    /** @internal */
    private readonly rootView: RootViewRenderer
    /** @internal */
    private sharedProps: Record<string, unknown> = {}

    /**
     * Creates a new Inertia instance.
     *
     * Typically created by the middleware and injected into the context.
     * You rarely need to instantiate this directly.
     *
     * @param context - The Hono request context
     * @param options - Configuration options
     *
     * @internal
     */
    constructor(context: Context, options: InertiaOptions) {
        this.context = context
        this.version = options.version
        this.rootView = options.rootView ?? defaultRootView
    }

    /**
     * Share props that will be merged into every render response.
     *
     * Shared props are ideal for data that should be available on
     * every page, such as authentication state, flash messages,
     * or application configuration.
     *
     * **Note**: Call this in middleware to ensure props are shared
     * before any controller renders a response.
     *
     * @param props - Props to share across all renders
     *
     * @example
     * ```typescript
     * // In middleware
     * app.use(async (c, next) => {
     *     const inertia = c.get('inertia')
     *
     *     inertia.share({
     *         auth: {
     *             user: await getCurrentUser(c),
     *         },
     *         flash: c.get('session')?.flash ?? {},
     *         appName: 'My Application',
     *     })
     *
     *     return next()
     * })
     * ```
     */
    share(props: Record<string, unknown>): void {
        this.sharedProps = { ...this.sharedProps, ...props }
    }

    /**
     * Get all currently shared props.
     *
     * Useful for debugging or accessing shared props from controllers.
     *
     * @returns A copy of the shared props object
     *
     * @example
     * ```typescript
     * const shared = inertia.getSharedProps()
     * console.log('Current user:', shared.auth?.user)
     * ```
     */
    getSharedProps(): Record<string, unknown> {
        return { ...this.sharedProps }
    }

    /**
     * Check if the current request is an Inertia AJAX request.
     *
     * Inertia requests include the `X-Inertia: true` header.
     * These receive JSON responses instead of full HTML.
     *
     * @returns `true` if this is an Inertia request
     *
     * @example
     * ```typescript
     * if (inertia.isInertiaRequest()) {
     *     // This is an AJAX navigation
     * } else {
     *     // This is an initial page load
     * }
     * ```
     */
    isInertiaRequest(): boolean {
        return this.context.req.header('X-Inertia') === 'true'
    }

    /**
     * Parse partial reload information from request headers.
     * @internal
     */
    private getPartialReloadInfo(component: string): PartialReloadInfo {
        const partialComponent = this.context.req.header(
            'X-Inertia-Partial-Component',
        )
        const partialData = this.context.req.header('X-Inertia-Partial-Data')
        const partialExcept = this.context.req.header(
            'X-Inertia-Partial-Except',
        )
        const resetData = this.context.req.header('X-Inertia-Reset')

        // Only consider partial reload if component matches
        const isPartial = partialComponent === component &&
            (partialData !== undefined || partialExcept !== undefined)

        return {
            isPartial,
            component: partialComponent ?? null,
            only: new Set(
                partialData?.split(',').map((s) => s.trim()).filter(Boolean) ??
                    [],
            ),
            except: new Set(
                partialExcept?.split(',').map((s) => s.trim()).filter(
                    Boolean,
                ) ?? [],
            ),
            reset: new Set(
                resetData?.split(',').map((s) => s.trim()).filter(Boolean) ??
                    [],
            ),
        }
    }

    /**
     * Determine if a prop should be included based on partial reload rules.
     * @internal
     */
    private shouldIncludeProp(
        key: string,
        value: unknown,
        partial: PartialReloadInfo,
        _isInertiaRequest: boolean,
    ): boolean {
        // Optional props are never included in standard visits
        if (isOptionalProp(value) && !partial.isPartial) {
            return false
        }

        // Deferred props are not included on initial render (handled separately)
        if (isDeferredProp(value) && !partial.isPartial) {
            return false
        }

        // Always props are always included
        if (isAlwaysProp(value)) {
            return true
        }

        // For partial reloads, apply only/except filters
        if (partial.isPartial) {
            // If 'only' is specified, only include those props
            if (partial.only.size > 0) {
                return partial.only.has(key)
            }
            // If 'except' is specified, exclude those props
            if (partial.except.size > 0) {
                return !partial.except.has(key)
            }
        }

        // Default: include the prop
        return true
    }

    /**
     * Resolve a single prop value.
     * @internal
     */
    private async resolvePropValue(
        value: unknown,
    ): Promise<unknown> {
        // Handle prop wrappers
        if (
            isOptionalProp(value) || isAlwaysProp(value) ||
            isDeferredProp(value) || isMergeProp(value) ||
            isOnceProp(value)
        ) {
            return await (value as PropWrapper).resolve()
        }

        // Handle plain functions (lazy props)
        if (typeof value === 'function') {
            return await value()
        }

        return value
    }

    /**
     * Resolve props with partial reload and prop type support.
     * @internal
     */
    private async resolvePropsWithPartial(
        props: InertiaProps,
        component: string,
    ): Promise<{
        resolved: Record<string, unknown>
        deferred: DeferredPropsInfo
        merge: MergePropsInfo
        once: OncePropsInfo
    }> {
        const isInertia = this.isInertiaRequest()
        const partial = this.getPartialReloadInfo(component)

        const resolved: Record<string, unknown> = {}
        const deferredGroups: Record<string, string[]> = {}
        const mergeConfig: MergePropsInfo = {}
        const onceConfig: OncePropsInfo = {}

        for (const [key, value] of Object.entries(props)) {
            // Track deferred props for client-side loading
            if (isDeferredProp(value) && !partial.isPartial) {
                const deferred = value as DeferredProp
                if (!deferredGroups[deferred.group]) {
                    deferredGroups[deferred.group] = []
                }
                deferredGroups[deferred.group].push(key)
                continue
            }

            // Track merge props configuration
            if (isMergeProp(value)) {
                const mergeProp = value as MergeProp
                ;(mergeConfig as Record<string, unknown>)[key] = {
                    strategy: mergeProp.config.strategy,
                    paths: mergeProp.config.paths,
                    matchOn: mergeProp.config.matchOn,
                    deep: mergeProp.config.deep,
                }
            }

            // Track once props configuration
            if (isOnceProp(value)) {
                const onceProp = value as OnceProp // Use custom key if provided, otherwise use the prop key
                ;(onceConfig as Record<string, string>)[key] = onceProp.key ??
                    key
            }

            // Check if prop should be included
            if (!this.shouldIncludeProp(key, value, partial, isInertia)) {
                continue
            }

            // Resolve the prop value
            resolved[key] = await this.resolvePropValue(value)
        }

        return {
            resolved,
            deferred: deferredGroups as DeferredPropsInfo,
            merge: mergeConfig,
            once: onceConfig,
        }
    }

    /**
     * Render an Inertia response.
     *
     * For Inertia AJAX requests (with `X-Inertia: true` header),
     * returns a JSON response with the page object.
     *
     * For initial page loads, returns a full HTML response using
     * the configured root view renderer.
     *
     * Supports:
     * - **Partial Reloads**: Only return requested props via `only`/`except`
     * - **Optional Props**: Props only included when explicitly requested
     * - **Always Props**: Props always included, even in partial reloads
     * - **Deferred Props**: Props loaded client-side after initial render
     * - **Merge Props**: Props merged with existing data (infinite scroll)
     * - **Once Props**: Props cached by client across navigations
     *
     * @param component - The name of the page component to render
     * @param props - Props to pass to the component (can include prop helpers)
     * @param options - Render options (history encryption, etc.)
     * @returns A Response object (JSON or HTML)
     *
     * @example Basic render
     * ```typescript
     * return inertia.render('Dashboard', {
     *     stats: await getDashboardStats(),
     * })
     * ```
     *
     * @example With prop helpers
     * ```typescript
     * import { optional, defer, merge, once } from '@lockness/inertia'
     *
     * return inertia.render('Users/Index', {
     *     users: optional(() => userService.findAll()),
     *     analytics: defer(() => analyticsService.get()),
     *     items: merge(() => itemService.paginate(page)),
     *     countries: once(() => countryService.findAll()),
     * })
     * ```
     *
     * @example With history encryption
     * ```typescript
     * return inertia.render('Checkout', {
     *     cart: await cartService.get(),
     * }, {
     *     encryptHistory: true, // Protect sensitive data
     * })
     * ```
     */
    async render(
        component: string,
        props: InertiaProps = {},
        options: RenderOptions = {},
    ): Promise<Response> {
        // Merge shared props with page props (page props take precedence)
        const mergedProps = { ...this.sharedProps, ...props }

        // Resolve props with partial reload and prop type support
        const { resolved, deferred, merge, once } = await this
            .resolvePropsWithPartial(
                mergedProps,
                component,
            )

        // Ensure errors object exists (Inertia protocol requirement)
        if (!resolved.errors) {
            resolved.errors = {}
        }

        // Build the Inertia page object
        const pageObject: PageObject = {
            component,
            props: resolved,
            url: this.context.req.url,
            version: this.version,
            encryptHistory: options.encryptHistory ?? false,
            clearHistory: options.clearHistory ?? false,
            // Only include if there are deferred props
            ...(Object.keys(deferred).length > 0 &&
                { deferredProps: deferred }),
            // Only include if there are merge props
            ...(Object.keys(merge).length > 0 && { mergeProps: merge }),
            // Only include if there are once props
            ...(Object.keys(once).length > 0 && { onceProps: once }),
        }

        // Return JSON for Inertia AJAX requests
        if (this.isInertiaRequest()) {
            return this.context.json(pageObject, 200, {
                'X-Inertia': 'true',
                'Vary': 'X-Inertia',
            })
        }

        // Return full HTML for initial page loads
        const html = await this.rootView(pageObject)
        return this.context.html(html)
    }
}
