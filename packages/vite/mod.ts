/**
 * @fileoverview Public surface of `@lockness/vite` — the Deno-native Vite
 * integration for Lockness (dev server bridge, Deno specifier resolver, and a
 * manifest-aware asset helper).
 *
 * @module @lockness/vite
 */

export {
    classifySpecifier,
    denoResolver,
    type DenoScheme,
    isValidSpecifier,
    resolveJsrSpecifier,
    resolveWithDeno,
} from './src/mod.ts'
export { defineViteConfig } from './src/mod.ts'
export {
    CSS_WATCH_GLOBS,
    DEFAULTS,
    type LocknessViteConfig,
    SERVER_RELOAD_GLOBS,
    TAILWIND_CLI,
} from './src/mod.ts'

// TODO(#108–#113): lockness(), viteAssets(), ViteAssetsTagResult.
