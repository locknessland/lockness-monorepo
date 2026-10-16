/**
 * @fileoverview `@lockness/transform` — the emit of user TypeScript for
 * runtimes that cannot run it themselves.
 *
 * Two entry points:
 *
 * - **`@lockness/transform/register`** — the Node `--import` entry. It installs
 *   a load hook that runs each `.ts` / `.tsx` file of the app (never one under
 *   `node_modules`) through {@link transpile}, behind a project-local cache, and
 *   refuses to run when `APP_ENV=production`.
 * - **`@lockness/transform`** (this module) — the emit itself, for `lockness
 *   build`, which must produce the same code the hook does in development.
 *
 * Compiler options come from the app's `tsconfig.json`, their one home; this
 * package spells none of them.
 *
 * @example
 * ```ts
 * import { findTsconfig, readCompilerOptions, transpile } from '@lockness/transform'
 *
 * const tsconfig = findTsconfig(appRoot)
 * if (tsconfig === null) throw new Error('no tsconfig.json')
 * const js = transpile(source, '/srv/app/main.ts', readCompilerOptions(tsconfig))
 * ```
 *
 * @module
 */

export {
    type CompilerOptions,
    findTsconfig,
    readCompilerOptions,
    transpile,
    TYPESCRIPT_VERSION,
} from './transform.ts'
