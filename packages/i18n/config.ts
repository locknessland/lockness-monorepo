/**
 * @fileoverview `configureI18n` — the single config home + the process-wide
 * registry the resolver and accessors read.
 *
 * The default locale and the locale set **derive from / must agree with**
 * `config/i18n.ts` (the routing source of truth) — one source of truth, not two
 * (architecture A-M3). Catalogs are provided statically (SSG-enumerable).
 *
 * @module @lockness/i18n/config
 */

import { CatalogRegistry } from './registry.ts'
import type { Messages } from './translator.ts'

/** App-supplied i18n configuration. */
export interface I18nConfig {
    /** `locale → messages`, statically importable (SSG build-time enumeration). */
    catalogs: Record<string, Messages>
    /** The default locale — should equal `config/i18n.ts`'s `defaultLocale`. */
    defaultLocale: string
    /** An optional fallback locale tried before the default. */
    fallbackLocale?: string
    /**
     * The locale-source order the resolver uses. Defaults to
     * `['route', 'cookie', 'header']` then the default locale.
     */
    sources?: ReadonlyArray<'route' | 'cookie' | 'header'>
    /** The cookie name carrying a locale (default `locale`). */
    cookieName?: string
}

let registry: CatalogRegistry | undefined
let current: I18nConfig | undefined

/**
 * Configure the translation layer. Builds the process-wide registry the
 * resolver + accessors read.
 *
 * @param config - Catalogs, default/fallback locale, and resolver sources.
 *
 * @example
 * ```ts
 * configureI18n({ catalogs: { 'en-us': en, 'fr-fr': fr }, defaultLocale: 'en-us' })
 * ```
 */
export function configureI18n(config: I18nConfig): void {
    current = config
    registry = new CatalogRegistry(config.catalogs, {
        defaultLocale: config.defaultLocale,
        fallbackLocale: config.fallbackLocale,
    })
}

/**
 * The configured registry.
 *
 * @returns The registry.
 * @throws {Error} When i18n is not configured.
 */
export function getRegistry(): CatalogRegistry {
    if (!registry) {
        throw new Error(
            'i18n is not configured — call configureI18n({ catalogs, defaultLocale }) at boot',
        )
    }
    return registry
}

/**
 * The current config (resolver sources, default locale, cookie name).
 *
 * @returns The config.
 * @throws {Error} When i18n is not configured.
 */
export function getI18nConfig(): I18nConfig {
    if (!current) {
        throw new Error(
            'i18n is not configured — call configureI18n({ catalogs, defaultLocale }) at boot',
        )
    }
    return current
}

/** Whether i18n has been configured (accessors use this to fail clearly). */
export function isI18nConfigured(): boolean {
    return registry !== undefined
}

/** Reset i18n — test-only, so one test's config does not leak into the next. */
export function resetI18n(): void {
    registry = undefined
    current = undefined
}
