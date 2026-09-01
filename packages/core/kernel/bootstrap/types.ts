/**
 * @fileoverview Bootstrap step types for kernel loader.
 *
 * This module defines the core types for the bootstrap pipeline:
 * - `BootstrapStep`: Interface for individual boot steps
 * - `BootstrapContext`: Shared context passed to all steps
 *
 * @module @lockness/core/kernel/bootstrap/types
 * @since 0.2.0
 *
 * @example Creating a custom bootstrap step
 * ```typescript
 * import type { BootstrapStep, BootstrapContext } from './types.ts'
 *
 * export const customStep: BootstrapStep = {
 *     id: 'custom',
 *     order: 500,
 *     async run(context: BootstrapContext): Promise<void> {
 *         console.log('Custom step executing')
 *         // Access context.config, context.kernel, context.app
 *     },
 * }
 * ```
 */

import type { App } from '../../app.ts'
import type { KernelConfig } from '../kernel_decorators.ts'
import type { BootHookMeta } from '../decorators.ts'
import type { ShutdownHookMeta } from '../shutdown_decorators.ts'

/**
 * Shared context passed to all bootstrap steps.
 * Contains configuration, kernel instance, app instance, and metadata.
 */
export interface BootstrapContext {
    /**
     * Kernel configuration from @Kernel decorator
     */
    readonly config: KernelConfig

    /**
     * Kernel instance (instantiated before bootstrap)
     */
    readonly kernel: unknown

    /**
     * Kernel class constructor
     */
    readonly KernelClass: new () => unknown

    /**
     * App instance (created during bootstrap)
     * Will be undefined in early steps, set during app creation step
     *
     * **Important**: Steps that require the app instance should check for its
     * existence and throw an error if not present, or skip gracefully if optional.
     *
     * @example
     * ```typescript
     * run(context: BootstrapContext) {
     *     if (!context.app) {
     *         throw new Error('App instance not created')
     *     }
     *     // Use context.app safely
     * }
     * ```
     */
    app?: App

    /**
     * Field name for global middleware property (from @DeclareGlobalMiddleware)
     */
    readonly globalMiddlewareProp?: string

    /**
     * Boot hooks metadata (from @OnBoot decorators)
     */
    readonly bootHooks: readonly BootHookMeta[]

    /**
     * Shutdown hooks metadata (from @OnShutdown decorators).
     *
     * Moved into the app's shutdown registry by the `shutdown_hooks` step.
     * Order is NOT decided here — `shutdown_registry.ts` owns that.
     *
     * **Optional, like `app`, and deliberately not required like `bootHooks`.**
     * `BootstrapContext` is public, so anything constructing one — a custom
     * step, a test — would stop compiling the day this field arrived. An
     * absent value means "no shutdown hooks", which is the honest reading for
     * a context built before the field existed.
     */
    readonly shutdownHooks?: readonly ShutdownHookMeta[]
}

/**
 * Interface for a single bootstrap step.
 *
 * Steps are executed sequentially in order based on their `order` property.
 * Each step receives the shared `BootstrapContext` and can modify it.
 */
export interface BootstrapStep {
    /**
     * Unique identifier for this step (for debugging and logging)
     */
    readonly id: string

    /**
     * Execution order (lower values execute first)
     *
     * Standard order ranges:
     * - 100-199: Infrastructure setup (database, session, cache)
     * - 200-299: App creation
     * - 300-399: Middleware and hooks
     * - 400-499: Discovery (middlewares, listeners)
     * - 500-599: Events and finalization
     * - 600+: Post-initialization (devtools routes)
     */
    readonly order: number

    /**
     * Execute this bootstrap step.
     *
     * @param context - Shared bootstrap context
     * @throws {Error} If step execution fails critically
     */
    run(context: BootstrapContext): Promise<void> | void
}
