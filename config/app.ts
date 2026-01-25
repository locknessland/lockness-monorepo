/**
 * Application Configuration
 *
 * General application settings.
 *
 * @module config/app
 */

export const appConfig = {
    /** Application name */
    name: Deno.env.get('APP_NAME') || 'Lockness',

    /** Environment: 'development' | 'production' | 'testing' */
    env: Deno.env.get('APP_ENV') || 'development',

    /** Enable debug mode */
    debug: Deno.env.get('APP_DEBUG') === 'true',

    /** Application URL */
    url: Deno.env.get('APP_URL') || 'http://localhost:8888',
}

/** Check if running in development mode */
export const isDevelopment = appConfig.env === 'development'

/** Check if running in production mode */
export const isProduction = appConfig.env === 'production'
