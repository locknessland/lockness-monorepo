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
 * can be rebuilt by hand, so a failure is not a command failure: it prints the
 * command that rebuilds it and resolves.
 *
 * @returns A promise that resolves once the registry was refreshed, or the
 *   hint printed.
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
        // Not swallowed: the hint names the command that does the same work.
        console.log(
            'ℹ️  Run "deno task routes:generate" to update routes registry',
        )
    }
}
