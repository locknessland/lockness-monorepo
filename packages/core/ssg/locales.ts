/**
 * @fileoverview Curated-locale expansion for static-site generation (#54, US2).
 *
 * Emits each `@Static` page once at its root path and once per **curated**
 * locale, under the app's i18n mount prefix. The prefix shape and the set of
 * admissible locale segments are both **derived from the kernel `mountPoint`**
 * (whose authoring home is `config/routing.ts`) — never a literal restated here,
 * and never the `validLanguages × validCountries` product. Validating each locale
 * against the mount pattern's own inline constraint keeps this module from
 * importing app i18n config (which would be a core→app layer violation).
 *
 * @module @lockness/core/ssg/locales
 */

import type { KernelConfig } from '../kernel/kernel_decorators.ts'
import type { RenderTarget } from './enumerate.ts'
import { outputPathFor } from './paths.ts'

/**
 * Ordered parameter names in a mount pattern, e.g. `['langId','countryId']`.
 * The `(?<!\?)` excludes the `:` inside a `(?:…)` regex constraint group, which
 * would otherwise be misread as a parameter.
 */
function paramNames(pattern: string): string[] {
    return [...pattern.matchAll(/(?<!\?):([A-Za-z0-9_]+)/g)].map((m) => m[1])
}

/**
 * The values a mount param admits, from its inline `{(?:a|b|c)}` constraint, or
 * `undefined` when the param is unconstrained.
 */
function allowedValues(pattern: string, name: string): string[] | undefined {
    const match = pattern.match(
        new RegExp(`:${name}\\{\\(\\?:([^}]*)\\)\\}`),
    )
    return match ? match[1].split('|') : undefined
}

/**
 * Build the URL prefix for one locale from the mount pattern, validating each
 * segment against the pattern's own constraint.
 *
 * @throws {Error} If the locale's segment count differs from the pattern's param
 * count, or a segment is not admitted by the pattern's constraint.
 */
function localePrefix(pattern: string, locale: string): string {
    const names = paramNames(pattern)
    const parts = locale.split('-')
    if (parts.length !== names.length) {
        throw new Error(
            `SSG locale "${locale}" has ${parts.length} segment(s) but the mount pattern expects ${names.length} (${
                names.join('/')
            }).`,
        )
    }
    parts.forEach((part, i) => {
        const allowed = allowedValues(pattern, names[i])
        if (allowed && !allowed.includes(part)) {
            throw new Error(
                `SSG locale "${locale}": segment "${part}" is not admitted by the mount pattern for :${
                    names[i]
                } (allowed: ${allowed.join(', ')}).`,
            )
        }
    })
    return '/' + parts.join('/')
}

/**
 * Expand render targets with curated-locale variants.
 *
 * With no `ssg.locales` configured, the targets are returned unchanged (a
 * root-only build). Otherwise each target is emitted at root **and** once per
 * curated locale, prefixed with the mount-derived locale path. Requires a
 * `mountPoint` when locales are configured.
 *
 * @param targets - The root render targets from `enumerateStaticTargets`.
 * @param config - The kernel config (reads `ssg.locales` and `mountPoint`).
 * @param distRoot - The output root the locale paths are computed against.
 * @returns The targets plus one locale variant per curated locale.
 * @throws {Error} If locales are configured without a `mountPoint`, or a locale
 * is malformed or rejected by the mount constraint.
 *
 * @example
 * ```typescript
 * // ssg.locales = ['en-us','fr-ca'], one @Static route '/docs'
 * // -> ['/docs', '/en/us/docs', '/fr/ca/docs']
 * ```
 */
export function expandTargetsForLocales(
    targets: readonly RenderTarget[],
    config: KernelConfig,
    distRoot: string,
): RenderTarget[] {
    const locales = config.ssg?.locales
    if (!locales || locales.length === 0) return [...targets]

    const pattern = config.mountPoint?.pattern
    if (!pattern) {
        throw new Error(
            'SSG ssg.locales is configured but the kernel has no mountPoint; the locale URL prefix cannot be derived.',
        )
    }

    const out: RenderTarget[] = [...targets]
    for (const locale of locales) {
        const prefix = localePrefix(pattern, locale)
        for (const target of targets) {
            const url = target.url === '/' ? prefix : prefix + target.url
            out.push({
                url,
                outputPath: outputPathFor(url, distRoot),
                controller: target.controller,
                action: target.action,
            })
        }
    }
    return out
}
