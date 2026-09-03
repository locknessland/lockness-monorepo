/**
 * @fileoverview The URL→file mapping for static-site generation (#54), with its
 * path-containment guard.
 *
 * This module is the single home for the decision "the output path for a rendered
 * URL" (plan §5). It maps a route path to a clean-URL `index.html` under the
 * `dist/` root, and hardens that mapping against path traversal: a route, param,
 * or locale segment carrying `..`, a leading dot, a disallowed character, or a
 * control byte is rejected before any file is written (plan R6 / security S1).
 * The rule is worth its weight now and prevents a HIGH-severity filesystem-write
 * primitive once the deferred build-time-data feature makes params attacker-influenced.
 *
 * @module @lockness/core/ssg/paths
 */

import { join, resolve, SEPARATOR } from '@std/path'

/**
 * A path segment is allowed only if it is one or more of these characters — no
 * slashes, no whitespace, no control bytes, no uppercase, no `%`/`?`/`:`. A
 * leading dot is rejected separately so `.`, `..`, and dotfiles never pass.
 */
const SEGMENT_ALLOWLIST = /^[a-z0-9._-]+$/

/**
 * Map a route URL path to its static output file, guarding against traversal.
 *
 * The path is split into segments; each must match {@link SEGMENT_ALLOWLIST} and
 * must not begin with a dot. The file is `<distRoot>/<segments…>/index.html`
 * (clean-URL directory convention — `/` → `dist/index.html`, `/x/y` →
 * `dist/x/y/index.html`). As defence-in-depth the resolved result is asserted to
 * lie inside the resolved `distRoot`.
 *
 * @param urlPath - The route path to map (query/hash are ignored); leading and
 * trailing slashes are insignificant.
 * @param distRoot - The output root directory (absolute or relative; resolved internally).
 * @returns The absolute output file path under the resolved `distRoot`.
 * @throws {Error} If any segment is disallowed, begins with a dot, or the
 * resolved path escapes `distRoot`.
 *
 * @example
 * ```typescript
 * outputPathFor('/en/us/docs', resolve('dist')) // <cwd>/dist/en/us/docs/index.html
 * outputPathFor('/../etc', resolve('dist'))      // throws — disallowed segment
 * ```
 */
export function outputPathFor(urlPath: string, distRoot: string): string {
    const pathname = urlPath.split(/[?#]/, 1)[0]
    const segments = pathname.split('/').filter((s) => s.length > 0)

    for (const segment of segments) {
        if (segment.startsWith('.')) {
            throw new Error(
                `Refusing to write: path segment "${segment}" begins with a dot (from "${urlPath}").`,
            )
        }
        if (!SEGMENT_ALLOWLIST.test(segment)) {
            throw new Error(
                `Refusing to write: path segment "${segment}" is not in the allowlist /^[a-z0-9._-]+$/ (from "${urlPath}").`,
            )
        }
    }

    const root = resolve(distRoot)
    // Clean-URL directory convention for pages (`/docs` → dist/docs/index.html),
    // but a file-like last segment (one containing a dot, e.g. `llms.txt`) is
    // written literally so a plain static host serves it at its own URL rather
    // than at `<name>/`.
    const last = segments[segments.length - 1]
    const candidate = last && last.includes('.')
        ? join(root, ...segments)
        : join(root, ...segments, 'index.html')

    // Defence-in-depth: the allowlist already forbids traversal, but assert
    // containment so a future change to the rules cannot silently escape dist/.
    if (
        candidate !== join(root, 'index.html') &&
        !candidate.startsWith(root + SEPARATOR)
    ) {
        throw new Error(
            `Refusing to write outside dist/: "${candidate}" is not contained in "${root}" (from "${urlPath}").`,
        )
    }

    return candidate
}
