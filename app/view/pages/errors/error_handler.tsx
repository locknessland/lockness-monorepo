import { type Context, formatErrorForConsole } from '@lockness/core'
import { NotFoundPage } from './not_found.tsx'
import { UnauthorizedPage } from './unauthorized.tsx'
import { ForbiddenPage } from './forbidden.tsx'
import { ServerErrorPage } from './server_error.tsx'

/**
 * Centralized error handler
 * Maps error status codes to custom pages
 */
export const errorHandler = (error: Error, c: Context) => {
    // Check for status property (from custom errors like UnauthorizedAccessError)
    const status = (error as unknown as { status?: number }).status || 500

    // Format and log the error using the core formatter
    formatErrorForConsole(error, status, c.req.path)

    // Return appropriate error page based on status
    switch (status) {
        case 404:
            return c.html(<NotFoundPage />, 404)
        case 401:
            return c.html(<UnauthorizedPage />, 401)
        case 403:
            return c.html(<ForbiddenPage />, 403)
        default: {
            // Show error details only in development
            const showDetails = Deno.env.get('APP_ENV') === 'development'
            return c.html(
                <ServerErrorPage error={error} showDetails={showDetails} />,
                500,
            )
        }
    }
}
