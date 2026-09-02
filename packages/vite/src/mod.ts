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

// TODO(#107–#113): DEFAULTS, defineViteConfig, lockness(), viteAssets,
// ManifestReader.
