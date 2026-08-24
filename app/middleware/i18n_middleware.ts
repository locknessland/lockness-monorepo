import type { Context, Next } from '@lockness/core'
// Imported directly, NOT through the config barrel: the barrel imports
// config/routing.ts, which imports this file, and entering that cycle at
// routing.ts leaves `mountPointConfig` in its temporal dead zone.
import { isValidCountry, isValidLanguage } from '../../config/i18n.ts'

/**
 * i18n Middleware for Mount Points
 *
 * Validates and extracts locale parameters from the URL.
 * Sets `langId`, `countryId`, and `localeKey` in the context.
 *
 * @example
 * ```typescript
 * // In config/routing.ts
 * mountPoint: {
 *     pattern: `/${constrainedParam('langId', validLanguages)}/${
 *         constrainedParam('countryId', validCountries)
 *     }`,
 *     middleware: i18nMiddleware,
 * }
 * ```
 *
 * @example Accessing in controllers
 * ```typescript
 * @Get('/')
 * handler(c: Context) {
 *     const langId = c.get('langId')     // 'fr'
 *     const countryId = c.get('countryId') // 'ca'
 *     const localeKey = c.get('localeKey') // 'fr-ca'
 * }
 * ```
 */
export async function i18nMiddleware(c: Context, next: Next) {
    const langId = c.req.param('langId')
    const countryId = c.req.param('countryId')

    // This middleware ASKS whether the locale is valid; it does not DECIDE it.
    // The decision lives in the mount pattern (config/routing.ts), which is
    // built from the same lists this checks against — so by construction
    // nothing invalid reaches here.
    //
    // Reaching this branch therefore means the pattern was loosened and the
    // router stopped filtering. That is an invariant violation, so it is traced
    // — and still refused. Logging without refusing would be fail-open: an
    // unconstrained mount serves the whole app under any two-segment prefix.
    if (
        !isValidLanguage(langId) ||
        !isValidCountry(countryId)
    ) {
        // Fixed message on purpose: `c.req.param()` returns percent-decoded
        // values and `c.req.path` decodes %0A / %1B, so interpolating either
        // one lets a crafted URL forge log lines.
        console.error(
            'i18n: an invalid locale reached i18nMiddleware — the mount ' +
                'pattern in config/routing.ts is no longer constraining it',
        )
        return c.notFound()
    }

    // Set locale context for all controllers
    c.set('langId', langId)
    c.set('countryId', countryId)
    c.set('localeKey', `${langId}-${countryId}`)

    return await next()
}
