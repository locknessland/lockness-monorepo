/**
 * @fileoverview `@lockness/transform` — the emit of user TypeScript for
 * runtimes that cannot run it themselves.
 *
 * Two entry points:
 *
 * - **`@lockness/transform/register`** — the Node `--import` entry. It installs
 *   a load hook that runs each `.ts` / `.tsx` file of the app (never one under
 *   `node_modules`) through {@link transpileForLoad}, behind a project-local
 *   cache, and refuses to run when `APP_ENV=production`.
 * - **`@lockness/transform`** (this module) — the emit itself. `lockness
 *   build` calls {@link transpileForBuild}, which runs the same emit as the
 *   hook with the build's placement: `.ts` specifiers rewritten to `.js`, and
 *   an external source map.
 *
 * Semantic compiler options come from the app's `tsconfig.json`, their one
 * home; this package spells none of them. `.mts` and `.cts` files are not
 * transformed (see the package README).
 *
 * @example
 * ```ts
 * import {
 *     findTsconfig,
 *     readCompilerOptions,
 *     transpileForBuild,
 * } from '@lockness/transform'
 *
 * const tsconfig = findTsconfig(appRoot)
 * if (tsconfig === null) throw new Error('no tsconfig.json')
 * const { code, map } = transpileForBuild(
 *     source,
 *     '/srv/app/main.ts',
 *     '/srv/app/dist/main.js',
 *     readCompilerOptions(tsconfig),
 * )
 * ```
 *
 * @module
 */

export {
    type BuildEmit,
    type CompilerOptions,
    findTsconfig,
    readCompilerOptions,
    transpileForBuild,
    transpileForLoad,
} from './transform.ts'
