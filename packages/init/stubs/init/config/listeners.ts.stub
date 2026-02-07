/**
 * Event Listeners Configuration
 *
 * Register event listener classes from packages or your application.
 * These listeners respond to Lockness Lifecycle Events.
 *
 * Listeners defined here are registered explicitly, in addition to
 * auto-discovered listeners from `app/listener/` directory.
 *
 * @module config/listeners
 *
 * @example Adding a package listener
 * ```typescript
 * import { DevtoolsListener } from '@lockness/devtools'
 * import { CacheInvalidationListener } from '@lockness/cache'
 *
 * export const listeners = [
 *     DevtoolsListener,
 *     CacheInvalidationListener,
 * ]
 * ```
 *
 * @see {@link https://lockness.land/docs/lifecycle-events | Lifecycle Events Guide}
 */

import type { ListenerClass } from '@lockness/core'

/**
 * List of listener classes to register.
 *
 * Add package listeners or explicit listener classes here.
 * These are combined with auto-discovered listeners from `app/listener/`.
 *
 * @example
 * ```typescript
 * import { DevtoolsListener } from '@lockness/devtools'
 *
 * export const listeners: ListenerClass[] = [
 *     DevtoolsListener,
 * ]
 * ```
 */
export const listeners: ListenerClass[] = [
    // Package listeners (uncomment to enable):
    // DevtoolsListener,          // from @lockness/devtools
    // CacheInvalidationListener, // from @lockness/cache
]
