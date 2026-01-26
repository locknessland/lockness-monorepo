/**
 * Application Configuration
 *
 * Central export point for all configuration modules.
 *
 * @module config
 *
 * @example Using centralized config object
 * ```typescript
 * import { config } from '../config/mod.ts'
 *
 * const dbUrl = config.database.url
 * const isDebug = config.app.debug
 * const sessionSecret = config.session.secret
 * ```
 *
 * @example Using in kernel
 * ```typescript
 * import { config } from '../config/mod.ts'
 *
 * @Kernel({
 *     database: config.database,
 *     session: config.session,
 *     mountPoint: config.routing,
 * })
 * ```
 */

import { appConfig } from './app.ts'
import { databaseConfig } from './database.ts'
import { sessionConfig } from './session.ts'
import { mountPointConfig } from './routing.ts'
import { compileConfig } from './compile.ts'
import {
    defaultLocale,
    isValidCountry,
    isValidLanguage,
    validCountries,
    validLanguages,
} from './i18n.ts'

/**
 * Centralized configuration object with typed namespaces.
 *
 * @example
 * ```typescript
 * import { config } from '../config/mod.ts'
 *
 * // Access via namespaces
 * config.app.name        // 'Lockness'
 * config.app.debug       // true/false
 * config.database.url    // 'postgres://...'
 * config.session.secret  // 'your-secret'
 * config.i18n.defaultLocale  // 'en-us'
 * config.routing         // MountPoint config
 * ```
 */
export const config = {
    app: appConfig,
    database: databaseConfig,
    session: sessionConfig,
    routing: mountPointConfig,
    compile: compileConfig,
    i18n: {
        defaultLocale,
        validLanguages,
        validCountries,
        isValidLanguage,
        isValidCountry,
    },
} as const

/** Check if running in development mode */
export const isDevelopment = config.app.env === 'development'

/** Check if running in production mode */
export const isProduction = config.app.env === 'production'

export type { CountryCode, LanguageCode } from './i18n.ts'
