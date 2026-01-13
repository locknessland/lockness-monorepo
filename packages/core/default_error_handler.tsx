import type { Context } from './types.ts'
import { formatErrorForConsole } from './error_formatter.ts'

/**
 * Simple inline error pages - no external dependencies
 * Users can override these by creating custom error pages
 */
const NotFoundPage = () => (
    <html lang='en'>
        <head>
            <meta charset='UTF-8' />
            <meta
                name='viewport'
                content='width=device-width, initial-scale=1.0'
            />
            <title>404 - Not Found</title>
            <style>
                {`
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    background: #f9fafb;
                }
                .container {
                    text-align: center;
                    padding: 2rem;
                }
                h1 {
                    font-size: 6rem;
                    margin: 0;
                    color: #d1d5db;
                    font-weight: 700;
                }
                h2 {
                    font-size: 1.5rem;
                    margin: 1rem 0;
                    color: #1f2937;
                }
                p {
                    color: #6b7280;
                    margin: 1rem auto;
                    max-width: 28rem;
                }
                a {
                    display: inline-block;
                    margin-top: 2rem;
                    padding: 0.75rem 1.5rem;
                    background: #3b82f6;
                    color: white;
                    text-decoration: none;
                    border-radius: 0.5rem;
                    transition: background 0.2s;
                }
                a:hover {
                    background: #2563eb;
                }
            `}
            </style>
        </head>
        <body>
            <div class='container'>
                <h1>404</h1>
                <h2>Page Not Found</h2>
                <p>
                    The page you are looking for doesn't exist or has been
                    moved.
                </p>
                <a href='/'>Go Back Home</a>
            </div>
        </body>
    </html>
)

const UnauthorizedPage = () => (
    <html lang='en'>
        <head>
            <meta charset='UTF-8' />
            <meta
                name='viewport'
                content='width=device-width, initial-scale=1.0'
            />
            <title>401 - Unauthorized</title>
            <style>
                {`
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    background: #f9fafb;
                }
                .container {
                    text-align: center;
                    padding: 2rem;
                }
                h1 {
                    font-size: 6rem;
                    margin: 0;
                    color: #d1d5db;
                    font-weight: 700;
                }
                h2 {
                    font-size: 1.5rem;
                    margin: 1rem 0;
                    color: #1f2937;
                }
                p {
                    color: #6b7280;
                    margin: 1rem auto;
                    max-width: 28rem;
                }
                a {
                    display: inline-block;
                    margin-top: 2rem;
                    padding: 0.75rem 1.5rem;
                    background: #3b82f6;
                    color: white;
                    text-decoration: none;
                    border-radius: 0.5rem;
                    transition: background 0.2s;
                }
                a:hover {
                    background: #2563eb;
                }
            `}
            </style>
        </head>
        <body>
            <div class='container'>
                <h1>401</h1>
                <h2>Unauthorized</h2>
                <p>You need to be authenticated to access this resource.</p>
                <a href='/'>Go Back Home</a>
            </div>
        </body>
    </html>
)

const ForbiddenPage = () => (
    <html lang='en'>
        <head>
            <meta charset='UTF-8' />
            <meta
                name='viewport'
                content='width=device-width, initial-scale=1.0'
            />
            <title>403 - Forbidden</title>
            <style>
                {`
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    background: #f9fafb;
                }
                .container {
                    text-align: center;
                    padding: 2rem;
                }
                h1 {
                    font-size: 6rem;
                    margin: 0;
                    color: #d1d5db;
                    font-weight: 700;
                }
                h2 {
                    font-size: 1.5rem;
                    margin: 1rem 0;
                    color: #1f2937;
                }
                p {
                    color: #6b7280;
                    margin: 1rem auto;
                    max-width: 28rem;
                }
                a {
                    display: inline-block;
                    margin-top: 2rem;
                    padding: 0.75rem 1.5rem;
                    background: #3b82f6;
                    color: white;
                    text-decoration: none;
                    border-radius: 0.5rem;
                    transition: background 0.2s;
                }
                a:hover {
                    background: #2563eb;
                }
            `}
            </style>
        </head>
        <body>
            <div class='container'>
                <h1>403</h1>
                <h2>Access Forbidden</h2>
                <p>You don't have permission to access this resource.</p>
                <a href='/'>Go Back Home</a>
            </div>
        </body>
    </html>
)

const ServerErrorPage = (
    { error, showDetails }: { error?: Error; showDetails?: boolean },
) => (
    <html lang='en'>
        <head>
            <meta charset='UTF-8' />
            <meta
                name='viewport'
                content='width=device-width, initial-scale=1.0'
            />
            <title>500 - Server Error</title>
            <style>
                {`
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    background: #f9fafb;
                }
                .container {
                    text-align: center;
                    padding: 2rem;
                    max-width: 48rem;
                }
                h1 {
                    font-size: 6rem;
                    margin: 0;
                    color: #d1d5db;
                    font-weight: 700;
                }
                h2 {
                    font-size: 1.5rem;
                    margin: 1rem 0;
                    color: #1f2937;
                }
                p {
                    color: #6b7280;
                    margin: 1rem auto;
                }
                .error-details {
                    margin-top: 2rem;
                    text-align: left;
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 0.5rem;
                    padding: 1rem;
                }
                .error-details h3 {
                    color: #991b1b;
                    margin-top: 0;
                    font-size: 1rem;
                }
                .error-details pre {
                    color: #b91c1c;
                    font-size: 0.875rem;
                    overflow: auto;
                    margin: 0;
                    white-space: pre-wrap;
                }
                a {
                    display: inline-block;
                    margin-top: 2rem;
                    padding: 0.75rem 1.5rem;
                    background: #3b82f6;
                    color: white;
                    text-decoration: none;
                    border-radius: 0.5rem;
                    transition: background 0.2s;
                }
                a:hover {
                    background: #2563eb;
                }
            `}
            </style>
        </head>
        <body>
            <div class='container'>
                <h1>500</h1>
                <h2>Something Went Wrong</h2>
                <p>An unexpected error occurred. Please try again later.</p>

                {showDetails && error && (
                    <div class='error-details'>
                        <h3>Error Details:</h3>
                        <pre>
                            {error.message}
                            {error.stack && '\n\n' + error.stack}
                        </pre>
                    </div>
                )}

                <a href='/'>Go Back Home</a>
            </div>
        </body>
    </html>
)

/**
 * Default error handler for Lockness
 * Uses simple inline HTML pages with no external dependencies
 *
 * To customize error pages:
 * 1. Run: deno task cli make:error-pages
 * 2. Import your custom handler: import { errorHandler } from '@view/pages/errors/error_handler.tsx'
 * 3. Use it: app.useErrorHandler(errorHandler)
 */
export const defaultErrorHandler = (
    error: Error,
    c: Context,
): Response | Promise<Response> => {
    // Check for status property (from custom errors)
    const status = (error as unknown as { status?: number }).status || 500

    // Format and log the error
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
