/**
 * @fileoverview Environment-name resolution — re-exported from
 * `@lockness/contract`.
 *
 * The canonical implementation moved to `@lockness/contract` (#27/A2) so feature
 * packages such as `@lockness/devtools` can consult it without importing
 * `@lockness/core` and inverting the dependency graph. Core keeps this module as
 * a thin re-export, so its public API and every internal `./environment.ts`
 * import are unchanged from #144.
 *
 * @module @lockness/core/environment
 */

export {
    isDevelopment,
    isExplicitlyDevelopment,
    isProduction,
    resolveEnvName,
} from '@lockness/contract'
