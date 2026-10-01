/**
 * @fileoverview The one way the framework imports a file of the user's app.
 *
 * Core, the cli, drizzle and openapi all import app files they find on disk at
 * run time: controllers, middlewares, listeners, jobs, seeders, commands, the
 * kernel, the error handler. Every one of those imports goes through
 * {@link importAppFile}, because each hand-built alternative broke for a
 * consumer while passing in this repository, where the packages load from disk
 * (#474, #477):
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
 * variable, which `deno publish` leaves alone. Keeping the `import()` itself
 * here, rather than only the URL builder, leaves a single unanalysable import
 * site for every app file in the framework, and nothing for a caller to get
 * wrong.
 *
 * The helper reports nothing and catches nothing: whether a missing file is
 * normal, and how a broken one is reported, is each caller's policy.
 *
 * @module @lockness/contract/app_file
 */

import { resolve, toFileUrl } from '@std/path'

/**
 * Build the `file:` URL of an app file.
 *
 * Exported for tests only; callers import through {@link importAppFile}.
 *
 * @param path - The file, relative to `root` or absolute.
 * @param root - The app root a relative `path` is anchored to. Defaults to the
 * working directory, which is where an app runs from.
 * @returns A `file:` URL `href`, with `#`, `?` and spaces escaped.
 *
 * @example
 * ```typescript
 * appFileUrl('app/kernel.ts', '/srv/my app')
 * // 'file:///srv/my%20app/app/kernel.ts'
 * ```
 */
export function appFileUrl(path: string, root: string = Deno.cwd()): string {
    return toFileUrl(resolve(root, path)).href
}

/**
 * Import a file of the user's app, anchored at the app root.
 *
 * The specifier is a `file:` URL built from `root`, never from the URL of the
 * package calling this, so it loads the same way from disk and from JSR.
 *
 * @param path - The file, relative to `root` or absolute.
 * @param root - The app root a relative `path` is anchored to. Defaults to the
 * working directory, which is where an app runs from.
 * @returns The module namespace.
 * @throws Whatever the import throws — a missing file, a syntax error, an
 * error raised while the module evaluates. Nothing is swallowed.
 *
 * @example
 * ```typescript
 * import { importAppFile } from '@lockness/contract'
 *
 * const module = await importAppFile('app/job/send_welcome_job.ts')
 * ```
 */
export function importAppFile(
    path: string,
    root: string = Deno.cwd(),
): Promise<Record<string, unknown>> {
    return import(/* @vite-ignore */ appFileUrl(path, root))
}
