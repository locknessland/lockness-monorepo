/**
 * @fileoverview The `file:` URL of an app file, as `importAppFile` builds it.
 *
 * Kept apart from `app_file.ts` so the URL builder is on no entry point: a
 * package imports an app file through `importAppFile`, never by building a
 * specifier itself. Only `app_file.ts` and the tests import this module.
 *
 * @module
 */

import { resolve, toFileUrl } from '@std/path'

/**
 * Build the `file:` URL of an app file.
 *
 * `root` anchors a relative `path`; it does not confine it. A `..` segment or
 * an absolute `path` names any file on disk.
 *
 * @param path - The file, relative to `root` or absolute.
 * @param root - What a relative `path` is resolved against. Defaults to the
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
