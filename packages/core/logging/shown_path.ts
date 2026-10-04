/**
 * @fileoverview How a boot error names an application file.
 *
 * One rule, shared by every discovery error that names the file it could not
 * load (`ListenerLoadError`, `ScheduleLoadError`): relative to the working
 * directory when the file is under it, so the message reads the way the
 * operator laid out the project, and absolute otherwise, so a path outside the
 * project is never disguised as one inside it.
 *
 * Internal: on no public surface.
 *
 * @module @lockness/core/logging/shown_path
 */

import { isAbsolute, relative, SEPARATOR } from '@std/path'

/**
 * `file` relative to the working directory when under it, else as given.
 *
 * @param file - An absolute path.
 * @returns The path a boot error should show.
 *
 * @example
 * ```ts
 * // with Deno.cwd() === '/srv/app'
 * shownPath('/srv/app/app/schedule/purge.ts') // 'app/schedule/purge.ts'
 * shownPath('/etc/elsewhere.ts') // '/etc/elsewhere.ts'
 * ```
 */
export function shownPath(file: string): string {
    const shown = relative(Deno.cwd(), file)
    return shown === '..' || shown.startsWith(`..${SEPARATOR}`) ||
            isAbsolute(shown)
        ? file
        : shown
}
