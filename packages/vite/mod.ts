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

// TODO(#107–#113): lockness(), defineViteConfig(), viteAssets(),
// LocknessViteConfig, ViteAssetsTagResult, DEFAULTS.
