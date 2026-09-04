/**
 * @fileoverview Pure per-request locale resolution — route → cookie → header →
 * default, validated against the configured set and bounded (security S1/S5/S6).
 *
 * This module has no ALS and no side effects; `context.ts` wraps it with the
 * lazy accessors + the optional eager middleware. Resolution is lazy by design:
 * `resolveLocale(c)` runs at access time (after the mount `i18nMiddleware` set
 * `localeKey`), so the route source is populated — an eager global middleware
 * would run outer of the mount and read an empty `localeKey` (architecture A1).
 *
 * **Logging (S3):** the resolver logs **nothing** — it never emits a raw
 * request-derived locale, so there is no log-injection surface (the safe
 * choice; a per-request fallback diagnostic was deliberately dropped as prod
 * log noise). An app that wants a diagnostic logs `getLocale(c)` (the resolved,
 * control-free locale) itself.
 *
 * @module @lockness/i18n/resolver
 */

import { getCookie } from '@lockness/hono'
import type { Context } from '@lockness/hono'
import { getI18nConfig, getRegistry } from './config.ts'
import { type CatalogRegistry, languageOf } from './registry.ts'

/** Max accepted locale value length (header/cookie/route), in bytes-ish. */
export const MAX_LOCALE_LENGTH = 256
/** Max Accept-Language ranges parsed before short-circuiting. */
export const MAX_ACCEPT_LANGUAGE_RANGES = 20

/**
 * Resolve the request's locale from the configured sources, always returning a
 * value in (or cascading to) the configured set — never a raw request value.
 *
 * @param c - The request context.
 * @returns The resolved locale (lowercased); the default when nothing matches.
 */
export function resolveLocale(c: Context): string {
    const config = getI18nConfig()
    const registry = getRegistry()
    const cookieName = config.cookieName ?? 'locale'
    for (const source of config.sources ?? ['route', 'cookie', 'header']) {
        const candidate = readSource(c, source, cookieName)
        const normalized = candidate
            ? normalizeLocale(candidate, registry)
            : undefined
        if (normalized) return normalized
    }
    return config.defaultLocale.toLowerCase()
}

/** Read a locale candidate from one source (never trusted beyond validation). */
function readSource(
    c: Context,
    source: 'route' | 'cookie' | 'header',
    cookieName: string,
): string | undefined {
    if (source === 'route') {
        const value = c.get('localeKey' as never) as unknown
        return typeof value === 'string' ? value : undefined
    }
    if (source === 'cookie') return getCookie(c, cookieName)
    if (source === 'header') {
        return firstAcceptLanguage(c.req.header('accept-language'))
    }
    return undefined
}

/**
 * The first usable tag from an `Accept-Language` header, bounded (S5).
 *
 * @param header - The raw header value.
 * @returns The first language tag, or `undefined`.
 */
export function firstAcceptLanguage(
    header: string | undefined,
): string | undefined {
    // Over-cap short-circuits to nothing without a full parse.
    if (!header || header.length > MAX_LOCALE_LENGTH) return undefined
    const ranges = header.split(',').slice(0, MAX_ACCEPT_LANGUAGE_RANGES)
    for (const range of ranges) {
        const tag = range.split(';')[0].trim()
        if (tag && tag !== '*') return tag
    }
    return undefined
}

/**
 * Validate + normalise a candidate against the configured locales, **always
 * returning a configured locale or `undefined`** — never the raw request value.
 *
 * A direct match returns that configured locale; a language-only match returns
 * a **configured representative** for that language (not the raw candidate), so
 * the resolved locale is always in the bounded configured set. This keeps the
 * translator memo key bounded (no attacker-varied cache growth) and keeps a
 * structurally-invalid tag from ever reaching `Intl.*` (no mid-request
 * `RangeError`) — the FR-006/S5/S6 invariant.
 *
 * @param candidate - The raw candidate value.
 * @param registry - The configured registry.
 * @returns A configured locale, or `undefined` when unknown/over-cap.
 */
export function normalizeLocale(
    candidate: string,
    registry: CatalogRegistry,
): string | undefined {
    if (candidate.length > MAX_LOCALE_LENGTH) return undefined
    const lc = candidate.toLowerCase()
    if (registry.has(lc)) return lc
    // Language-only match → a CONFIGURED representative, never the raw candidate.
    const language = languageOf(lc)
    return registry.locales.find((l) => languageOf(l) === language)
}
