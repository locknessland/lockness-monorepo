/**
 * @fileoverview The seeder-loader port `db:seed` resolves a seeder module
 * through, and its production implementation.
 *
 * The port type, {@link SeederLoader}, is public: `DrizzleCommandDeps` names
 * it, so `cli_commands.ts` re-exports it. The default implementation,
 * {@link defaultLoadSeeder}, is not: this module is absent from the package's
 * `exports`, so nothing outside `@lockness/drizzle` and its own tests can reach
 * it (#564). A test imports it by relative path.
 *
 * @module @lockness/drizzle/seeder-loader
 * @internal
 */

import { importAppFile } from '@lockness/contract/app-file/internal'

/**
 * Seeder-module loader port — resolves a seeder module from a project-relative
 * path.
 *
 * The production default dynamically imports it; a test injects a fake that
 * returns a synthetic module, keeping `db:seed` hermetic.
 *
 * @param relativePath - Path to the seeder file, relative to the project root.
 * @returns The imported module namespace.
 */
export type SeederLoader = (
    relativePath: string,
) => Promise<Record<string, unknown>>

/**
 * Production seeder-loader: imports a seeder module from the project's
 * working directory.
 *
 * Through `importAppFile`, never a `file://` template literal: `deno publish`
 * rewrites one into a relative path, which from JSR resolves against the
 * registry (#477).
 *
 * @param relativePath - Path to the seeder file, relative to the project root.
 * @returns The imported module namespace.
 * @throws Whatever the import throws; `db:seed` reports it.
 *
 * @example
 * ```ts
 * await defaultLoadSeeder('database/seeders/database_seeder.ts')
 * ```
 */
export const defaultLoadSeeder: SeederLoader = (relativePath) =>
    importAppFile(relativePath)
