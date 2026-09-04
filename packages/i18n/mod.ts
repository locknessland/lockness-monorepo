/**
 * @fileoverview Public surface of `@lockness/i18n` — message catalogs, `t()`
 * with ICU interpolation + `Intl`-backed pluralization, and (added by later
 * children) a per-request locale resolver + accessors.
 *
 * @module @lockness/i18n
 *
 * @example
 * ```ts
 * import { configureI18n, CatalogRegistry } from '@lockness/i18n'
 *
 * configureI18n({ catalogs: { 'en-us': { hi: 'Hi {name}' } }, defaultLocale: 'en-us' })
 * ```
 */

export {
    type ICUNode,
    ICUParseError,
    MAX_ICU_DEPTH,
    MAX_ICU_LENGTH,
    parseICU,
    renderICU,
} from './icu.ts'
export {
    flattenMessages,
    type Messages,
    type TranslateParams,
    Translator,
} from './translator.ts'
export {
    CatalogRegistry,
    type CatalogRegistryOptions,
    languageOf,
} from './registry.ts'
export {
    configureI18n,
    getI18nConfig,
    getRegistry,
    type I18nConfig,
    isI18nConfigured,
    resetI18n,
} from './config.ts'
