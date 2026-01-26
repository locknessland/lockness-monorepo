/**
 * Application Configuration
 *
 * Central export point for all configuration modules.
 *
 * @module config
 *
 * @example
 * ```typescript
 * import { databaseConfig, sessionConfig, appConfig } from '../config/mod.ts'
 * ```
 */

export { appConfig, isDevelopment, isProduction } from './app.ts'
export { databaseConfig } from './database.ts'
export { sessionConfig } from './session.ts'
export { mountPointConfig } from './routing.ts'
export {
    defaultLocale,
    isValidCountry,
    isValidLanguage,
    validCountries,
    validLanguages,
} from './i18n.ts'
export type { CountryCode, LanguageCode } from './i18n.ts'
