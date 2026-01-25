import type { Context, Next } from '@lockness/core'
import { isValidCountry, isValidLanguage } from '../../config/mod.ts'

/**
 * i18n Middleware for Mount Points
 *
 * Validates and extracts locale parameters from the URL.
 * Sets `langId`, `countryId`, and `localeKey` in the context.
 *
 * @example
 * ```typescript
 * // In kernel.tsx
 * mountPoints: [
 *     { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
 * ]
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

    // Validate locale parameters
    if (!isValidLanguage(langId) || !isValidCountry(countryId)) {
        // Option 1: Return 404 for invalid locales
        return c.notFound()

        // Option 2: Redirect to default locale
        // const path = c.req.path.replace(/^\/[^/]+\/[^/]+/, '')
        // return c.redirect(`/en/us${path}`)
    }

    // Set locale context for all controllers
    c.set('langId', langId)
    c.set('countryId', countryId)
    c.set('localeKey', `${langId}-${countryId}`)

    return await next()
}
