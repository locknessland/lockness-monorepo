/**
 * @fileoverview The one way core names an app-local file it imports.
 *
 * Core imports app files at boot without the app naming them: the custom error
 * handler, middlewares, controllers, listeners, the kernel. Every one of those
 * imports goes through {@link appFileUrl}, because each hand-built alternative
 * broke for a consumer while passing in this repository, where core is loaded
 * from disk (#474):
 *
 * - **A bare absolute path** resolves against the importing module. From JSR
 *   that module is an `https:` URL, so `/srv/app/x.ts` became a request to the
 *   registry for the app's path.
 * - **`` import(`file://${path}`) ``** is rewritten by `deno publish`, which
 *   reads the template's static prefix as a local path and unfurls it into
 *   `` import(`../../../../${path}`) `` — again a request to the registry.
 * - **`` `file://${path}` `` built as a string** makes a `#` a fragment and a
 *   `?` a query, silently importing a different, truncated path.
 *
 * `toFileUrl` escapes the path, and the specifier reaches `import()` as a
 * variable, which `deno publish` leaves alone.
 *
 * @module @lockness/core/app_file_url
 */

import { resolve, toFileUrl } from '@std/path'

/**
 * Build the `file:` URL that imports an app-local file.
 *
 * Pass the result to `import()` as a value, never inline it into a template
 * literal there: `deno publish` rewrites a template-literal `import()`
 * argument.
 *
 * @param path - The file, relative to `root` or absolute.
 * @param root - The app root a relative `path` is anchored to. Defaults to the
 * working directory, which is where an app runs from.
 * @returns A `file:` URL `href`, with `#`, `?` and spaces escaped.
 *
 * @example
 * ```typescript
 * const url = appFileUrl('app/view/pages/errors/error_handler.tsx')
 * const module = await import(url)
 * ```
 */
export function appFileUrl(path: string, root: string = Deno.cwd()): string {
    return toFileUrl(resolve(root, path)).href
}
