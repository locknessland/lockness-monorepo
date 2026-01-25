/**
 * Internationalization (i18n) Configuration
 *
 * @module config/i18n
 */

/**
 * Default locale when none is specified or invalid
 */
export const defaultLocale = 'en-us'

/**
 * Valid language codes
 */
export const validLanguages = ['en', 'fr', 'es', 'de', 'ja'] as const

/**
 * Valid country codes
 */
export const validCountries = ['us', 'ca', 'mx', 'de', 'jp'] as const

/**
 * Type for valid language codes
 */
export type LanguageCode = (typeof validLanguages)[number]

/**
 * Type for valid country codes
 */
export type CountryCode = (typeof validCountries)[number]

/**
 * Check if a language code is valid
 */
export function isValidLanguage(lang: string): lang is LanguageCode {
    return validLanguages.includes(lang as LanguageCode)
}

/**
 * Check if a country code is valid
 */
export function isValidCountry(country: string): country is CountryCode {
    return validCountries.includes(country as CountryCode)
}
