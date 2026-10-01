/**
 * @fileoverview Controller discovery: find the app's controller classes on
 * disk, for the OpenAPI document.
 *
 * @module @lockness/openapi/discovery
 */

import {
    type ControllerClass,
    renderError,
    safeForLog,
} from '@lockness/contract'
import { importAppFile } from '@lockness/contract/app-file/internal'
import { join } from '@std/path'

/**
 * Import every `*_controller.ts(x)` file of a directory and collect the
 * exports whose name ends in `Controller`, for `docs:generate`.
 *
 * Any failure stops the scan: a document missing a controller would look
 * complete. A file that fails to load is named in the error.
 *
 * @param dir - The directory, absolute or relative to the working directory.
 * @returns The controller classes, in directory order.
 * @throws When the directory cannot be read, or a controller file fails to
 *   load.
 * @internal Exported for tests.
 *
 * @example
 * ```ts
 * const controllers = await loadDocumentedControllers()
 * ```
 */
export async function loadDocumentedControllers(
    dir: string = join('app', 'controller'),
): Promise<ControllerClass[]> {
    const controllers: ControllerClass[] = []
    for await (const entry of Deno.readDir(dir)) {
        if (
            !entry.isFile ||
            !(entry.name.endsWith('_controller.ts') ||
                entry.name.endsWith('_controller.tsx'))
        ) continue

        let module: Record<string, unknown>
        try {
            // Through the app root, never a `file://` template literal:
            // `deno publish` rewrites one into a path that resolves against
            // the registry (#477).
            module = await importAppFile(join(dir, entry.name))
        } catch (error) {
            throw new Error(
                `${safeForLog(entry.name)} failed to load: ${
                    renderError(error)
                }`,
                { cause: error },
            )
        }

        for (const [key, exported] of Object.entries(module)) {
            if (typeof exported === 'function' && key.endsWith('Controller')) {
                controllers.push(exported as ControllerClass)
            }
        }
    }
    return controllers
}
