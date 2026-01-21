/**
 * @fileoverview Deprecation contracts for managing deprecation notices.
 *
 * This module provides a unified API for triggering deprecation warnings in a
 * consistent way, with support for strict mode (throws errors) and silent mode
 * (ignores deprecations).
 *
 * @module @lockness/deprecation-contracts
 *
 * ## Architecture
 *
 * The package follows SOLID principles with clear separation of concerns:
 *
 * - **types.ts** - All type definitions and interfaces
 * - **config.ts** - Environment configuration helpers
 * - **formatter.ts** - Message formatting utilities
 * - **handler.ts** - Output handling (Logger/console)
 * - **collector.ts** - External collector registry
 * - **trigger.ts** - Core deprecation trigger logic
 * - **decorators.ts** - The `@Deprecated` decorator
 *
 * ## Environment Variables
 *
 * - `IGNORE_DEPRECATIONS=true` - Silently ignores all deprecation notices
 * - `STRICT_DEPRECATIONS=true` - Throws an error instead of logging
 *
 * @example Basic usage
 * ```ts
 * import { triggerDeprecation, Deprecated } from '@lockness/deprecation-contracts'
 *
 * // Trigger a deprecation notice programmatically
 * triggerDeprecation('my-pkg', '1.0.0', 'Use newMethod() instead')
 *
 * // Or use the decorator on classes, methods, or accessors
 * @Deprecated('1.0.0', 'Use NewService instead')
 * class OldService {}
 * ```
 *
 * @example Registering an external collector
 * ```ts
 * import { registerCollector } from '@lockness/deprecation-contracts'
 *
 * registerCollector({
 *     addDeprecation(entry) {
 *         // Send to monitoring service
 *         analytics.track('deprecation', entry)
 *     }
 * })
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
    DeprecationCollector,
    DeprecationConfig,
    DeprecationEntry,
    DeprecationHandler,
    DeprecationOptions,
} from './types.ts'

// =============================================================================
// Configuration
// =============================================================================

export { getConfig, isStrictMode, shouldIgnore } from './config.ts'

// =============================================================================
// Formatting
// =============================================================================

export { buildFullMessage, createEntry, formatMessage } from './formatter.ts'

// =============================================================================
// Handler
// =============================================================================

export { createHandler, defaultHandler } from './handler.ts'

// =============================================================================
// Collector
// =============================================================================

export {
    getCollector,
    hasCollector,
    notifyCollector,
    registerCollector,
    unregisterCollector,
} from './collector.ts'

// =============================================================================
// Core API
// =============================================================================

export { triggerDeprecation, triggerWithHandler } from './trigger.ts'

// =============================================================================
// Decorators
// =============================================================================

export { Deprecated } from './decorators.ts'

// =============================================================================
// Legacy Compatibility
// =============================================================================

/**
 * @deprecated Use `registerCollector` instead. Will be removed in v2.0.0.
 */
export { registerCollector as registerDeprecationCollector } from './collector.ts'
