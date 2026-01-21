/**
 * @fileoverview Inertia prop helpers for advanced data loading patterns.
 *
 * This module provides helper classes and functions for controlling
 * how props are resolved and included in Inertia responses:
 *
 * - `optional()` - Props only included when explicitly requested
 * - `always()` - Props always included, even in partial reloads
 * - `defer()` - Props loaded client-side after initial render
 * - `merge()` - Props merged with existing data instead of replaced
 *
 * @module @lockness/inertia/props
 *
 * @example
 * ```typescript
 * import { optional, always, defer, merge } from '@lockness/inertia'
 *
 * inertia.render('Users/Index', {
 *     // Only included when requested via partial reload
 *     users: optional(() => userService.findAll()),
 *
 *     // Always included, even in partial reloads
 *     permissions: always(currentUser.permissions),
 *
 *     // Loaded after initial render
 *     analytics: defer(() => analyticsService.getDashboard()),
 *
 *     // Merged with existing data (infinite scroll)
 *     items: merge(() => itemService.paginate(page)),
 * })
 * ```
 */

// ============================================================================
// Symbols for Type Identification
// ============================================================================

/** Symbol to identify optional props */
export const OPTIONAL_PROP = Symbol('inertia:optional')

/** Symbol to identify always props */
export const ALWAYS_PROP = Symbol('inertia:always')

/** Symbol to identify deferred props */
export const DEFERRED_PROP = Symbol('inertia:deferred')

/** Symbol to identify merge props */
export const MERGE_PROP = Symbol('inertia:merge')

/** Symbol to identify once props */
export const ONCE_PROP = Symbol('inertia:once')

// ============================================================================
// Base Prop Class
// ============================================================================

/**
 * Base class for all prop wrappers.
 * @internal
 */
export abstract class PropWrapper<T = unknown> {
    /** Symbol identifying the prop type */
    abstract readonly [Symbol.toStringTag]: string

    /**
     * Create a prop wrapper.
     * @param resolver - Function that resolves to the prop value
     */
    constructor(public readonly resolver: () => T | Promise<T>) {}

    /**
     * Resolve the prop value.
     * @returns The resolved prop value
     */
    async resolve(): Promise<T> {
        return await this.resolver()
    }
}

// ============================================================================
// Optional Props
// ============================================================================

/**
 * A prop that is only included when explicitly requested via partial reload.
 *
 * Use for expensive data that isn't always needed on the page.
 * The prop will never be included in standard visits unless
 * explicitly requested via the `only` option.
 *
 * @template T The type of the prop value
 *
 * @example
 * ```typescript
 * // Server-side
 * inertia.render('Users/Index', {
 *     users: optional(() => userService.findAll()),
 * })
 *
 * // Client-side (request this prop explicitly)
 * router.reload({ only: ['users'] })
 * ```
 */
export class OptionalProp<T = unknown> extends PropWrapper<T> {
    readonly [OPTIONAL_PROP] = true
    readonly [Symbol.toStringTag] = 'OptionalProp'
}

/**
 * Create an optional prop that is only included when explicitly requested.
 *
 * @param resolver - Function that resolves to the prop value
 * @returns An OptionalProp instance
 *
 * @example
 * ```typescript
 * import { optional } from '@lockness/inertia'
 *
 * inertia.render('Dashboard', {
 *     // Only fetched when client requests it
 *     notifications: optional(async () => {
 *         return await notificationService.findUnread()
 *     }),
 * })
 * ```
 */
export function optional<T>(resolver: () => T | Promise<T>): OptionalProp<T> {
    return new OptionalProp(resolver)
}

// ============================================================================
// Always Props
// ============================================================================

/**
 * A prop that is always included, even during partial reloads.
 *
 * Use for data that must always be fresh and present, regardless
 * of whether it was explicitly requested.
 *
 * @template T The type of the prop value
 *
 * @example
 * ```typescript
 * inertia.render('Users/Index', {
 *     // Always fresh, even on partial reload
 *     currentUser: always(() => authService.getCurrentUser()),
 * })
 * ```
 */
export class AlwaysProp<T = unknown> extends PropWrapper<T> {
    readonly [ALWAYS_PROP] = true
    readonly [Symbol.toStringTag] = 'AlwaysProp'
}

/**
 * Create a prop that is always included, even during partial reloads.
 *
 * @param resolver - Function or value for the prop
 * @returns An AlwaysProp instance
 *
 * @example
 * ```typescript
 * import { always } from '@lockness/inertia'
 *
 * inertia.render('Profile', {
 *     // Always included and evaluated
 *     user: always(async () => await userService.current()),
 * })
 * ```
 */
export function always<T>(resolver: T | (() => T | Promise<T>)): AlwaysProp<T> {
    const fn = typeof resolver === 'function'
        ? resolver as () => T | Promise<T>
        : () => resolver
    return new AlwaysProp(fn)
}

// ============================================================================
// Deferred Props
// ============================================================================

/**
 * A prop that is loaded client-side after the initial page render.
 *
 * Useful for expensive operations that shouldn't block the initial
 * page load. The client will automatically fetch these props after
 * the page renders.
 *
 * @template T The type of the prop value
 *
 * @example
 * ```typescript
 * inertia.render('Dashboard', {
 *     // Loads after page renders
 *     analytics: defer(() => analyticsService.compute()),
 * })
 * ```
 */
export class DeferredProp<T = unknown> extends PropWrapper<T> {
    readonly [DEFERRED_PROP] = true
    readonly [Symbol.toStringTag] = 'DeferredProp'

    /**
     * Group name for parallel loading.
     * Props in the same group are fetched together.
     */
    readonly group: string

    constructor(resolver: () => T | Promise<T>, group = 'default') {
        super(resolver)
        this.group = group
    }
}

/**
 * Create a deferred prop that loads after initial page render.
 *
 * @param resolver - Function that resolves to the prop value
 * @param group - Optional group name for parallel loading
 * @returns A DeferredProp instance
 *
 * @example Basic usage
 * ```typescript
 * import { defer } from '@lockness/inertia'
 *
 * inertia.render('Dashboard', {
 *     permissions: defer(() => Permission.findAll()),
 * })
 * ```
 *
 * @example Grouped loading
 * ```typescript
 * // These load in parallel in the 'sidebar' group
 * inertia.render('Dashboard', {
 *     teams: defer(() => Team.findAll(), 'sidebar'),
 *     projects: defer(() => Project.findAll(), 'sidebar'),
 *     // This loads separately in 'default' group
 *     notifications: defer(() => Notification.recent()),
 * })
 * ```
 */
export function defer<T>(
    resolver: () => T | Promise<T>,
    group = 'default',
): DeferredProp<T> {
    return new DeferredProp(resolver, group)
}

// ============================================================================
// Merge Props
// ============================================================================

/**
 * Merge strategy for combining data.
 */
export type MergeStrategy = 'append' | 'prepend'

/**
 * Configuration for merge behavior.
 */
export interface MergeConfig {
    /** Strategy for merging arrays */
    readonly strategy: MergeStrategy
    /** Nested paths to apply the strategy to */
    readonly paths: readonly string[]
    /** Field to match items by (for updating existing items) */
    readonly matchOn?: string
    /** Whether to perform a deep merge */
    readonly deep: boolean
}

/**
 * A prop that merges with existing data instead of replacing it.
 *
 * Ideal for infinite scroll, pagination, or real-time updates
 * where new data should be combined with existing data.
 *
 * @template T The type of the prop value
 *
 * @example
 * ```typescript
 * inertia.render('Items/Index', {
 *     items: merge(() => itemService.paginate(page)),
 * })
 * ```
 */
export class MergeProp<T = unknown> extends PropWrapper<T> {
    readonly [MERGE_PROP] = true
    readonly [Symbol.toStringTag] = 'MergeProp'

    /** Merge configuration */
    readonly config: MergeConfig

    constructor(
        resolver: () => T | Promise<T>,
        config: Partial<MergeConfig> = {},
    ) {
        super(resolver)
        this.config = {
            strategy: config.strategy ?? 'append',
            paths: config.paths ?? [],
            matchOn: config.matchOn,
            deep: config.deep ?? false,
        }
    }

    /**
     * Prepend new items instead of appending.
     * @returns A new MergeProp with prepend strategy
     */
    prepend(): MergeProp<T> {
        return new MergeProp(this.resolver, {
            ...this.config,
            strategy: 'prepend',
        })
    }

    /**
     * Target specific nested paths for merging.
     * @param paths - Array of dot-notation paths
     * @returns A new MergeProp with path configuration
     *
     * @example
     * ```typescript
     * merge(() => User.paginate()).append('data')
     * ```
     */
    append(...paths: string[]): MergeProp<T> {
        return new MergeProp(this.resolver, {
            ...this.config,
            strategy: 'append',
            paths: [...this.config.paths, ...paths],
        })
    }

    /**
     * Match existing items by a specific field.
     * @param field - Field name to match by
     * @returns A new MergeProp with matchOn configuration
     *
     * @example
     * ```typescript
     * merge(() => posts).append('data').matchOn('id')
     * ```
     */
    matchOn(field: string): MergeProp<T> {
        return new MergeProp(this.resolver, {
            ...this.config,
            matchOn: field,
        })
    }
}

/**
 * Create a mergeable prop that combines with existing data.
 *
 * @param resolver - Function that resolves to the prop value
 * @returns A MergeProp instance
 *
 * @example Basic usage
 * ```typescript
 * import { merge } from '@lockness/inertia'
 *
 * // Append items to existing list
 * inertia.render('Items', {
 *     items: merge(() => itemService.paginate(page)),
 * })
 * ```
 *
 * @example With path targeting
 * ```typescript
 * // Only merge the 'data' array, replace other fields
 * inertia.render('Users', {
 *     users: merge(() => User.paginate()).append('data'),
 * })
 * ```
 *
 * @example Prepending items
 * ```typescript
 * // New messages appear at top
 * inertia.render('Chat', {
 *     messages: merge(() => messageService.recent()).prepend(),
 * })
 * ```
 */
export function merge<T>(resolver: () => T | Promise<T>): MergeProp<T> {
    return new MergeProp(resolver)
}

/**
 * Create a deep-mergeable prop.
 *
 * Performs a recursive merge of nested objects and arrays.
 *
 * @param resolver - Function that resolves to the prop value
 * @returns A MergeProp instance with deep merge enabled
 *
 * @example
 * ```typescript
 * import { deepMerge } from '@lockness/inertia'
 *
 * inertia.render('Chat', {
 *     chat: deepMerge(() => ({
 *         messages: newMessages,
 *         online: onlineCount,
 *     })),
 * })
 * ```
 */
export function deepMerge<T>(resolver: () => T | Promise<T>): MergeProp<T> {
    return new MergeProp(resolver, { deep: true })
}

// ============================================================================
// Once Props
// ============================================================================

/**
 * A prop that is resolved only once and remembered by the client.
 *
 * Once props are ideal for:
 * - Data that rarely changes (country lists, roles, permissions)
 * - Expensive computations that can be cached
 * - Shared data across multiple pages
 *
 * The client remembers the prop value and reuses it on subsequent
 * navigations to pages that include the same prop.
 *
 * @template T The type of the prop value
 *
 * @example
 * ```typescript
 * inertia.render('Billing', {
 *     plans: once(() => planService.findAll()),
 * })
 * ```
 */
export class OnceProp<T = unknown> extends PropWrapper<T> {
    readonly [ONCE_PROP] = true
    readonly [Symbol.toStringTag] = 'OnceProp'

    /** Custom key for sharing across pages */
    readonly key: string | null

    constructor(resolver: () => T | Promise<T>, key: string | null = null) {
        super(resolver)
        this.key = key
    }

    /**
     * Assign a custom key for sharing across pages.
     * @param key - Custom key to use
     * @returns A new OnceProp with the custom key
     *
     * @example
     * ```typescript
     * // Both pages share the same data
     * // Page 1
     * inertia.render('Team/Index', {
     *     roles: once(() => Role.all()).as('roles'),
     * })
     * // Page 2
     * inertia.render('Team/Invite', {
     *     availableRoles: once(() => Role.all()).as('roles'),
     * })
     * ```
     */
    as(key: string): OnceProp<T> {
        return new OnceProp(this.resolver, key)
    }
}

/**
 * Create a prop that is resolved only once and remembered.
 *
 * The client caches the resolved value and reuses it on subsequent
 * navigations. The server will skip resolving the prop if the client
 * already has it cached.
 *
 * @param resolver - Function that resolves to the prop value
 * @returns An OnceProp instance
 *
 * @example Basic usage
 * ```typescript
 * import { once } from '@lockness/inertia'
 *
 * inertia.render('Settings', {
 *     // Resolved once, cached by client
 *     countries: once(() => countryService.findAll()),
 * })
 * ```
 *
 * @example Sharing across pages with custom key
 * ```typescript
 * // Both pages share the same cached value
 * inertia.render('Team/Index', {
 *     memberRoles: once(() => Role.all()).as('roles'),
 * })
 *
 * inertia.render('Team/Invite', {
 *     availableRoles: once(() => Role.all()).as('roles'),
 * })
 * ```
 */
export function once<T>(resolver: () => T | Promise<T>): OnceProp<T> {
    return new OnceProp(resolver)
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is an OptionalProp.
 * @internal
 */
export function isOptionalProp(value: unknown): value is OptionalProp {
    return value instanceof OptionalProp
}

/**
 * Check if a value is an AlwaysProp.
 * @internal
 */
export function isAlwaysProp(value: unknown): value is AlwaysProp {
    return value instanceof AlwaysProp
}

/**
 * Check if a value is a DeferredProp.
 * @internal
 */
export function isDeferredProp(value: unknown): value is DeferredProp {
    return value instanceof DeferredProp
}

/**
 * Check if a value is a MergeProp.
 * @internal
 */
export function isMergeProp(value: unknown): value is MergeProp {
    return value instanceof MergeProp
}

/**
 * Check if a value is an OnceProp.
 * @internal
 */
export function isOnceProp(value: unknown): value is OnceProp {
    return value instanceof OnceProp
}

/**
 * Check if a value is any kind of prop wrapper.
 * @internal
 */
export function isPropWrapper(value: unknown): value is PropWrapper {
    return value instanceof PropWrapper
}
