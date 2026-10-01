/**
 * @fileoverview Controller discovery: find the app's controller classes on
 * disk, for the OpenAPI document.
 *
 * Openapi owns this so that no app code imports its own files to build the
 * document (#483). The scaffolded docs controller used to scan
 * `app/controller` itself, with a hand-built `file:` URL that a `#` or `?` in
 * the app path truncated, inside a `try` that swallowed the failure. Calling
 * this instead puts the escaping and the error reporting in one place that is
 * tested, rather than in a copy every app carries.
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
 * exports whose name ends in `Controller`, to hand to `generateOpenAPISpec`.
 *
 * `docs:generate` and the docs controller that `@lockness/openapi/install`
 * scaffolds both call it. Each file is imported through its escaped `file:`
 * URL, so an app path holding a `#`, a `?` or a space loads like any other.
 *
 * Any failure stops the scan: a document missing a controller would look
 * complete. A file that fails to load is named in the error.
 *
 * The scan reads `dir` only. It does not follow `@Kernel({ controllersDir })`
 * and it re-imports files rather than reading the controllers the app
 * registered (#484). The caller filters the result: the scaffolded docs
 * controller drops itself by class identity, which holds because the URL
 * built here is the one the app's own import of that file resolves to.
 *
 * @param dir - The directory, absolute or relative to the working directory.
 *   Defaults to `app/controller`.
 * @returns The controller classes, in directory order.
 * @throws {Deno.errors.NotFound} When `dir` does not exist; any other error
 *   reading it is rethrown as is.
 * @throws {Error} When a controller file fails to load. The message names the
 *   file, and `cause` holds the original error.
 *
 * @example
 * ```ts
 * import {
 *     generateOpenAPISpec,
 *     loadDocumentedControllers,
 * } from '@lockness/openapi'
 *
 * const controllers = await loadDocumentedControllers()
 * const spec = generateOpenAPISpec(controllers, {
 *     title: 'My API',
 *     version: '1.0.0',
 * })
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
