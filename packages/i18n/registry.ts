/**
 * @fileoverview `CatalogRegistry` — resolves a locale to a {@link Translator}
 * with a per-key language cascade, memoising translators and sharing one
 * message-AST cache.
 *
 * @module @lockness/i18n/registry
 */

import { flattenMessages, type Messages, Translator } from './translator.ts'
import type { ICUNode } from './icu.ts'

/** Options for a {@link CatalogRegistry}. */
export interface CatalogRegistryOptions {
    /** The default locale (must have a catalog). Aligns with `config/i18n.ts`. */
    defaultLocale: string
    /** An optional fallback locale tried before the default. */
    fallbackLocale?: string
}

/**
 * The language subtag of a locale (`'en-us'` → `'en'`; `'fr'` → `'fr'`).
 *
 * @param locale - A locale key.
 * @returns Its language subtag.
 */
export function languageOf(locale: string): string {
    return locale.split('-')[0]
}

/**
 * Resolves locales to translators over a set of catalogs.
 *
 * @example
 * ```ts
 * const registry = new CatalogRegistry(
 *     { 'en-us': { hi: 'Hi' }, en: { bye: 'Bye' } },
 *     { defaultLocale: 'en-us' },
 * )
 * registry.translator('en-us').t('bye') // 'Bye' — cascades en-us → en
 * ```
 */
export class CatalogRegistry {
    private readonly flat = new Map<string, Map<string, string>>()
    private readonly translators = new Map<string, Translator>()
    private readonly astCache = new Map<string, ICUNode[]>()
    private readonly defaultLocale: string
    private readonly fallbackLocale?: string

    /**
     * @param catalogs - `locale → messages`, statically provided.
     * @param options - Default + optional fallback locale.
     */
    constructor(
        catalogs: Record<string, Messages>,
        options: CatalogRegistryOptions,
    ) {
        for (const [locale, messages] of Object.entries(catalogs)) {
            this.flat.set(locale.toLowerCase(), flattenMessages(messages))
        }
        this.defaultLocale = options.defaultLocale.toLowerCase()
        this.fallbackLocale = options.fallbackLocale?.toLowerCase()
    }

    /** The locales that have a catalog. */
    get locales(): string[] {
        return [...this.flat.keys()]
    }

    /** Whether a locale has its own catalog (not counting fallback). */
    has(locale: string): boolean {
        return this.flat.has(locale.toLowerCase())
    }

    /**
     * Get (memoised) a translator for a locale, building its per-key cascade:
     * locale → language → fallback → default (deduped, existing catalogs only).
     *
     * @param locale - The requested locale.
     * @returns A translator bound to it.
     */
    translator(locale: string): Translator {
        const key = locale.toLowerCase()
        let translator = this.translators.get(key)
        if (translator) return translator

        const chain: string[] = []
        for (
            const candidate of [
                key,
                languageOf(key),
                this.fallbackLocale,
                this.defaultLocale,
            ]
        ) {
            if (candidate && !chain.includes(candidate)) chain.push(candidate)
        }
        const cascade = chain
            .map((l) => this.flat.get(l))
            .filter((m): m is Map<string, string> => m !== undefined)

        translator = new Translator(key, cascade, this.astCache)
        this.translators.set(key, translator)
        return translator
    }
}
