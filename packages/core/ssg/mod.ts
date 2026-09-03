/**
 * @fileoverview Static-site generation for Lockness (#54).
 *
 * The `ssg:build` command's building blocks: route enumeration
 * ({@link enumerateStaticTargets}, {@link loadControllers}), the URL→file path
 * mapping ({@link outputPathFor}), curated-locale expansion
 * ({@link expandTargetsForLocales}), and the render/emit loop
 * ({@link runSsgBuild}). `@Static` (the opt-in decorator) lives in
 * `@lockness/contract` and is re-exported through the framework barrel; the
 * curated locale list lives on the `@Kernel` config.
 *
 * @module @lockness/core/ssg
 */

export { outputPathFor } from './paths.ts'
export {
    enumerateStaticTargets,
    loadControllers,
    type RenderTarget,
    type StaticControllerRef,
} from './enumerate.ts'
export { expandTargetsForLocales } from './locales.ts'
export {
    type BuildReportEntry,
    type FetchableApp,
    runSsgBuild,
    type SsgBuildResult,
} from './build.ts'
