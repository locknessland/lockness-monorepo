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

export {
    type AppFetchHandler,
    devServerBridge,
    type DevServerOptions,
    injectCssIntoHtml,
    isViteInternalRequest,
} from './src/mod.ts'

export {
    CLIENT_ENTRY_ID,
    clientEntry,
    type ClientEntryOptions,
    generateClientEntry,
    RESOLVED_CLIENT_ENTRY_ID,
} from './src/mod.ts'

export {
    encodeAttribute,
    type ManifestChunk,
    ManifestReader,
    viteAssets,
    type ViteAssetsOptions,
    type ViteAssetsTagResult,
    type ViteAssetTag,
    type ViteManifest,
    type ViteMode,
} from './src/mod.ts'

export {
    buildTailwindArgs,
    type ChangeKind,
    classifyChange,
    createCssCollector,
    type CssCollector,
    cssPlugin,
} from './src/mod.ts'

export { type HmrOptions, hmrPlugin } from './src/mod.ts'

// TODO(#108–#113): lockness(), viteAssets(), ViteAssetsTagResult.
