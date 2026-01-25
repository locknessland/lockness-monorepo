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

// Kernel configuration decorators (new in 0.1.28)
export {
    type DatabaseConfig,
    DeclareGlobalMiddleware,
    Kernel,
    KERNEL_CONFIG,
    KERNEL_GLOBAL_MIDDLEWARE,
    type KernelConfig,
    type SessionConfig,
} from './kernel_decorators.ts'

// Kernel loader
export { createApp } from './loader.ts'
