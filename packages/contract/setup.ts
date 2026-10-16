/**
 * @fileoverview The package setup port: what a Lockness package's setup step
 * receives from `./nessy package:install`, without importing `@lockness/cli`.
 *
 * A package that needs setup publishes a `./setup` export whose **named**
 * `setup` export is a {@link PackageSetup} — never a `default` export (#575:
 * a default export the command never found is how every installer silently
 * stopped running). `package:install <name>` imports `@lockness/<name>/setup`,
 * builds a {@link SetupContext} and calls it. How the app's manifest is read
 * and written stays in `@lockness/cli`; the setup asks for it through the
 * context, so the package needs no `cli` edge (plan 274 §5).
 *
 * Types only: nothing here emits code.
 *
 * @example
 * ```ts
 * import type { PackageSetup } from '@lockness/contract/setup'
 *
 * export const setup: PackageSetup = async (context) => {
 *     await context.registerPackage('demo')
 * }
 * ```
 *
 * @module @lockness/contract/setup
 */

/**
 * What `package:install` hands a package's setup.
 *
 * @example
 * ```ts
 * const context: SetupContext = {
 *     root: Deno.cwd(),
 *     registerPackage: (name) => addPackage(name),
 * }
 * ```
 */
export interface SetupContext {
    /** The application's project directory; files a setup writes go under it. */
    readonly root: string

    /**
     * Register a package with the application, so `./nessy` loads its
     * commands.
     *
     * @param name - The package name, with or without the `@lockness/` scope.
     * @returns A promise that resolves once the package is registered.
     * @throws {import('./command.ts').CommandFailure} When the directory is not
     *   a Lockness project, or its manifest cannot be read or written.
     */
    registerPackage(name: string): Promise<void>
}

/**
 * A package's setup step, the named `setup` export of its `./setup` entry.
 *
 * @param context - What the installing command provides.
 * @returns A promise that resolves once the package is set up.
 * @throws {import('./command.ts').CommandFailure} When the setup cannot
 *   finish; the command prints it once and exits non-zero.
 */
export type PackageSetup = (context: SetupContext) => Promise<void>
