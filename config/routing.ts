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

import type { MountPoint } from '@lockness/core'
import { i18nMiddleware } from '../app/middleware/i18n_middleware.ts'

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
    pattern: '/:langId/:countryId',
    middleware: i18nMiddleware,
}
