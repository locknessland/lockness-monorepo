/**
 * @fileoverview Internal barrel for `@lockness/vite`. Re-exported by the
 * package's public `mod.ts`.
 *
 * @module @lockness/vite/src
 */

export {
    classifySpecifier,
    denoResolver,
    type DenoScheme,
    isValidSpecifier,
    resolveJsrSpecifier,
    resolveWithDeno,
} from './plugins/deno.ts'
export { defineViteConfig } from './define_config.ts'
export {
    CSS_WATCH_GLOBS,
    DEFAULTS,
    type LocknessViteConfig,
    SERVER_RELOAD_GLOBS,
    TAILWIND_CLI,
} from './shared.ts'

// TODO(#108–#113): lockness(), viteAssets(), ManifestReader,
// ViteAssetsTagResult.
