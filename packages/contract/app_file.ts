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
 * The helper reports nothing and swallows nothing: whether a missing file is
 * normal, and how a broken one is reported, is each caller's policy. It
 * translates exactly one failure: a file that does not compile or link becomes
 * an {@link AppFileCompileError} naming the file and location, because the
 * runtime's own message quotes the failing source line (#478). Every other
 * rejection is rethrown untouched, so "Module not found" keeps its shape.
 *
 * @module @lockness/contract/app-file/internal
 */

import { fromFileUrl, isAbsolute, relative, resolve } from '@std/path'
import { appFileUrl } from './app_file_url.ts'
import {
    AppFileCompileError,
    readCompileDiagnostic,
} from './logging/compile_diagnostic.ts'

export { AppFileCompileError }

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
 * @throws {AppFileCompileError} When the file, or a module it imports, does
 * not compile or link — with the failing file relative to `root` and its
 * location, and no `cause`.
 * @throws Whatever else the import throws, untouched — a missing file, an
 * error raised while the module evaluates. Nothing is swallowed.
 *
 * @example
 * ```typescript
 * import { importAppFile } from '@lockness/contract/app-file/internal'
 *
 * const module = await importAppFile('app/job/send_welcome_job.ts')
 * ```
 */
export async function importAppFile(
    path: string,
    root: string = Deno.cwd(),
): Promise<Record<string, unknown>> {
    try {
        return await import(/* @vite-ignore */ appFileUrl(path, root))
    } catch (error) {
        let translated: AppFileCompileError | undefined
        try {
            translated = compileFailure(error, path, root)
        } catch {
            // A module may throw anything while it evaluates, including a
            // Proxy whose prototype read throws. Reading it must not replace
            // it: the module's own error is rethrown untouched.
            throw error
        }
        throw translated ?? error
    }
}

/**
 * Translate a compile or link failure into an {@link AppFileCompileError}.
 *
 * A compile or link failure is always an `Error` the runtime built. Anything
 * else a module threw while it evaluated passes through as `undefined`, and a
 * read that throws is answered by the caller rethrowing the original.
 *
 * @param error - What the import rejected with.
 * @param path - The file that was imported.
 * @param root - The app root `path` was resolved against.
 * @returns The translated error, or `undefined` to rethrow `error` untouched.
 */
function compileFailure(
    error: unknown,
    path: string,
    root: string,
): AppFileCompileError | undefined {
    if (!(error instanceof Error) || typeof error.message !== 'string') {
        return undefined
    }
    const diagnostic = readCompileDiagnostic(error.name, error.message)
    if (diagnostic === undefined) return undefined
    // The failing module may be a dependency of `path`, so the location the
    // runtime names wins over the file that was asked for.
    if (diagnostic.url === undefined) {
        return new AppFileCompileError(
            diagnostic.kind,
            shownPath(resolve(root, path), root),
        )
    }
    const file = diagnostic.url.startsWith('file:')
        ? shownPath(fromFileUrl(diagnostic.url), root)
        : diagnostic.url
    return new AppFileCompileError(
        diagnostic.kind,
        file,
        diagnostic.line,
        diagnostic.column,
    )
}

/**
 * A file as an error should show it: relative to `root` when under it, so a
 * log line does not carry the machine's directory layout; else absolute.
 *
 * @param absolute - The file's absolute path.
 * @param root - The app root.
 * @returns The path to show.
 */
function shownPath(absolute: string, root: string): string {
    const shown = relative(resolve(root), absolute)
    return shown === '' || shown.startsWith('..') || isAbsolute(shown)
        ? absolute
        : shown
}
