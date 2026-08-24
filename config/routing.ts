/**
 * Routing Configuration
 *
 * Mount point configuration for URL prefixing (i18n, multi-tenancy).
 *
 * @module config/routing
 *
 * @example
 * ```typescript
 * import { mountPointConfig } from '../config/mod.ts'
 *
 * @Kernel({
 *     mountPoint: mountPointConfig,
 * })
 * export class AppKernel {}
 * ```
 */

import { constrainedParam, type MountPoint } from '@lockness/core'
import { i18nMiddleware } from '../app/middleware/i18n_middleware.ts'
import { validCountries, validLanguages } from './i18n.ts'

/**
 * Mount point configuration for i18n URL prefixing.
 *
 * When configured, routes are accessible both at root AND under the
 * mount point pattern. For example:
 * - `/products` → works (no locale context)
 * - `/fr/ca/products` → works with French Canadian locale
 *
 * The middleware validates locale parameters and sets context values:
 * - `langId`: Language code (e.g., 'fr', 'en')
 * - `countryId`: Country code (e.g., 'ca', 'us')
 * - `localeKey`: Combined key (e.g., 'fr-ca')
 *
 * @example Accessing locale in controllers
 * ```typescript
 * @Get('/')
 * handler(c: Context) {
 *     const langId = c.get('langId')       // 'fr' or undefined
 *     const countryId = c.get('countryId') // 'ca' or undefined
 *     const localeKey = c.get('localeKey') // 'fr-ca' or undefined
 * }
 * ```
 */
export const mountPointConfig: MountPoint = {
    /**
     * Built from `config/i18n.ts`, never written as a literal.
     *
     * The codes have exactly one home. Restating them here — as an alternation,
     * or as a looser `[a-z]{2}` shorthand — would be a second spelling of the
     * same rule, and the two would drift.
     *
     * The constraint is what stops this mount being a catch-all. Left
     * unconstrained, `/:langId/:countryId` matches any two leading segments, so
     * `/.well-known/appspecific/com.chrome.devtools.json` reaches
     * {@link i18nMiddleware} as `langId=".well-known"`.
     */
    pattern: `/${constrainedParam('langId', validLanguages)}/${
        constrainedParam('countryId', validCountries)
    }`,
    middleware: i18nMiddleware,
}
