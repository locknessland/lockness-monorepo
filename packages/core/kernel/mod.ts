/**
 * @fileoverview Kernel module barrel exports.
 *
 * This module exports all kernel-related features:
 * - Boot lifecycle decorators (@OnBoot)
 * - Boot hook execution (runBootHooks, getBootHooks)
 * - Kernel configuration decorators (@Kernel, @DeclareGlobalMiddleware)
 * - Kernel loader (createApp)
 *
 * @module @lockness/core/kernel
 * @since 0.1.27
 */

// Boot lifecycle decorators and utilities
export {
    type BootHookMeta,
    type BootHookMethod,
    type BootHooksContainer,
    KERNEL_BOOT_HOOKS,
    OnBoot,
    type OnBootOptions,
} from './decorators.ts'

export { getBootHooks, runBootHooks } from './boot_runner.ts'

// Shutdown lifecycle decorator and introspection.
// No `runShutdownHooks` counterpart on purpose: App.shutdown() is the only
// thing that runs teardown, because it is the only thing that can also stop the
// server, honour the deadline and dedupe concurrent callers.
export {
    getShutdownHooks,
    KERNEL_SHUTDOWN_HOOKS,
    OnShutdown,
    type OnShutdownOptions,
    type ShutdownHookMeta,
    type ShutdownHookMethod,
    type ShutdownHooksContainer,
} from './shutdown_decorators.ts'

export {
    SHUTDOWN_PRIORITY,
    type ShutdownFailure,
    ShutdownRegistry,
    type ShutdownRunResult,
} from './shutdown_registry.ts'

export {
    DEFAULT_SHUTDOWN_DEADLINE_MS,
    MAX_SHUTDOWN_DEADLINE_MS,
    resolveDeadlineMs,
    type ShutdownReport,
    ShutdownSequence,
} from './shutdown_sequence.ts'

export { exitCodeFor, installShutdownSignals } from './signals.ts'

// Kernel configuration decorators (new in 0.1.28)
export {
    type CacheConfig,
    type DatabaseConfig,
    DeclareGlobalMiddleware,
    Kernel,
    KERNEL_CONFIG,
    KERNEL_GLOBAL_MIDDLEWARE,
    type KernelConfig,
    type SessionConfig,
    type ShutdownConfig,
} from './kernel_decorators.ts'

// Kernel loader
export { createApp } from './loader.ts'
