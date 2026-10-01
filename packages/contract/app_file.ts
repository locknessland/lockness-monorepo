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
 * This is an entry point for Lockness packages, not for apps: it is on no root
 * surface, because `@lockness/core` re-exports the contract root with
 * `export *`.
 *
 * The helper reports nothing and catches nothing: whether a missing file is
 * normal, and how a broken one is reported, is each caller's policy.
 *
 * @module @lockness/contract/app-file/internal
 */

import { appFileUrl } from './app_file_url.ts'

/**
 * Import a file of the user's app.
 *
 * The specifier is a `file:` URL resolved against `root`, never against the
 * URL of the package calling this, so it loads the same way from disk and from
 * JSR.
 *
 * `root` anchors a relative `path`; it does not confine it. A `..` segment or
 * an absolute `path` loads any readable module, and the module runs with the
 * process's full permissions. This is not a sandbox: callers pass paths their
 * own code found on disk, and must never pass request-derived data.
 *
 * @param path - The file, relative to `root` or absolute.
 * @param root - What a relative `path` is resolved against. Defaults to the
 * working directory, which is where an app runs from.
 * @returns The module namespace.
 * @throws Whatever the import throws — a missing file, a syntax error, an
 * error raised while the module evaluates. Nothing is swallowed.
 *
 * @example
 * ```typescript
 * import { importAppFile } from '@lockness/contract/app-file/internal'
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
