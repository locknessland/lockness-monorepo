/**
 * @fileoverview Builds safe Hono param constraints from a list of allowed codes.
 *
 * This module is the single home for one decision: **how a list of codes becomes
 * a Hono param constraint**. Nothing else in the codebase may spell that out —
 * see the decision table in
 * `.specnaut/specs/001-fix-i18n-mount-ambiguity/plan.md`.
 *
 * @module @lockness/core/routing/mount_pattern
 */

/**
 * Maximum number of codes accepted in a single constraint.
 *
 * Not a performance limit — a bound, so a mis-wired configuration source fails
 * loudly at boot instead of compiling an enormous alternation.
 */
const MAX_CODES = 256

/**
 * The only shape a code may take.
 *
 * Deliberately narrow. See {@link codeConstraint} for why validating positively
 * matters more than escaping here.
 */
const CODE_PATTERN = /^[A-Za-z0-9-]{1,8}$/

/** A Hono param name must be a bare identifier. */
const PARAM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Escapes every character that is not alphanumeric.
 *
 * Belt-and-braces only: {@link CODE_PATTERN} has already rejected anything
 * dangerous by the time this runs.
 *
 * @param code - A code that has already passed {@link CODE_PATTERN}.
 * @returns The code with non-alphanumeric characters backslash-escaped.
 */
function escapeCode(code: string): string {
    return code.replace(/[^A-Za-z0-9]/g, '\\$&')
}

/**
 * Builds a non-capturing alternation group from a list of allowed codes.
 *
 * @remarks
 * **The group is not cosmetic, and escaping alone would not be safe.**
 *
 * A bare alternation — `en|fr|es|de|ja` — compiles into Hono's `RegExpRouter`
 * without a group boundary and matches across segment content. Measured against
 * Hono 4.11.1: a mount pattern built that way matches
 * `/.well-known/appspecific/com.chrome.devtools.json` and captures
 * `langId="de"` out of the word `devtools`. The mount middleware then runs on a
 * path that has nothing to do with locales. The `(?:…)` wrapper is what
 * prevents it.
 *
 * **Why the allowlist cannot be removed as redundant.** Hono extracts param
 * constraints with `path.replace(/\{[^}]+\}/g, …)` (`dist/utils/url.js`, and
 * again in `dist/router/reg-exp-router/trie.js`). `[^}]+` is *not* escape-aware,
 * so a backslash-escaped `\}` still contains a `}` and terminates the group
 * early. A code carrying `}` followed by `/` corrupts the route table and throws
 * `TypeError: undefined is not iterable` at dispatch. Escaping is therefore the
 * wrong control on its own; the input is validated positively first.
 *
 * Input is **trusted build-time configuration**. Loading these codes from a
 * database, an environment variable, or anything request-derived turns this into
 * a boot-time injection sink and requires a fresh security review.
 *
 * @param codes - The allowed values for one path segment.
 * @returns A non-capturing group, e.g. `(?:en|fr)`.
 * @throws {Error} If `codes` is empty, longer than 256 entries, or contains a
 * code outside `/^[A-Za-z0-9-]{1,8}$/` — naming the offending index.
 *
 * @example
 * ```typescript
 * codeConstraint(['en', 'fr'])  // '(?:en|fr)'
 * ```
 */
export function codeConstraint(codes: readonly string[]): string {
    if (codes.length === 0) {
        throw new Error(
            'mount pattern: a constraint needs at least one code, received an empty list',
        )
    }

    if (codes.length > MAX_CODES) {
        throw new Error(
            `mount pattern: ${codes.length} codes exceeds the maximum of ${MAX_CODES}`,
        )
    }

    const escaped = codes.map((code, index) => {
        if (!CODE_PATTERN.test(code)) {
            throw new Error(
                `mount pattern: invalid code at index ${index} (${
                    JSON.stringify(code)
                }); ` +
                    'codes must match /^[A-Za-z0-9-]{1,8}$/',
            )
        }
        return escapeCode(code)
    })

    return `(?:${escaped.join('|')})`
}

/**
 * Builds a complete Hono param constraint for one path segment.
 *
 * Use this rather than composing the brace syntax by hand — keeping Hono's
 * `:name{…}` spelling inside this module is what stops it being restated
 * elsewhere.
 *
 * @param name - The param name, e.g. `langId`.
 * @param codes - The allowed values for that segment.
 * @returns A constrained param, e.g. `:langId{(?:en|fr)}`.
 * @throws {Error} If `name` is not a bare identifier, or if `codes` fails
 * {@link codeConstraint}'s validation.
 *
 * @example
 * ```typescript
 * import { constrainedParam } from '@lockness/core'
 *
 * const pattern = `/${constrainedParam('langId', ['en', 'fr'])}` +
 *                 `/${constrainedParam('countryId', ['us', 'ca'])}`
 * // '/:langId{(?:en|fr)}/:countryId{(?:us|ca)}'
 * ```
 */
export function constrainedParam(
    name: string,
    codes: readonly string[],
): string {
    if (!PARAM_NAME_PATTERN.test(name)) {
        throw new Error(
            `mount pattern: invalid param name ${JSON.stringify(name)}; ` +
                'expected a bare identifier',
        )
    }

    return `:${name}{${codeConstraint(codes)}}`
}
