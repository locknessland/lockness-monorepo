/**
 * @fileoverview Refresh `app/routes.ts` after a generator wrote a controller.
 *
 * Shared by `make:controller` and `make:crud`, so both degrade the same way.
 *
 * @module @lockness/cli/commands/make/routes_registry
 */

/**
 * Regenerate `./app/routes.ts` from `./app/controller`, the registry a
 * production build reads.
 *
 * The controller was written whether or not this succeeds, and the registry
 * can be rebuilt by hand, so a failure is not a command failure: it warns
 * with the command that rebuilds it and resolves.
 *
 * @returns A promise that resolves once the registry was refreshed, or the
 *   warning printed.
 *
 * @example
 * ```ts
 * await Deno.writeTextFile(controllerPath, content)
 * await refreshRoutesRegistry()
 * ```
 */
export async function refreshRoutesRegistry(): Promise<void> {
    try {
        const { generateRoutesFile } = await import('@lockness/contract')
        await generateRoutesFile('./app/controller', './app/routes.ts')
        console.log('✅ Routes registry updated')
    } catch {
        // Not swallowed: warned, with the command that does the same work.
        // The caught text is left out (D4): it may carry a path or a secret,
        // and `routes:generate` reports the real failure if it persists.
        console.warn(
            '⚠️  Could not update the routes registry. Run "deno task routes:generate" to rebuild it',
        )
    }
}
