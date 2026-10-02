/**
 * Application Configuration
 *
 * General application settings. The environment comes from the framework's
 * one resolver (`@lockness/core`), so this file and the framework never
 * disagree on whether the process is in production: `APP_ENV`, trimmed and
 * lower-cased, defaulting to `'development'`.
 *
 * @module config/app
 */

import {
    isDevelopment as isDevelopmentEnv,
    isProduction as isProductionEnv,
    resolveEnvName,
} from '@lockness/core'

export const appConfig = {
    /** Application name */
    name: Deno.env.get('APP_NAME') || 'Lockness',

    /** Environment: 'development' | 'production' | 'testing' */
    env: resolveEnvName(),

    /** Enable debug mode */
    debug: Deno.env.get('APP_DEBUG') === 'true',

    /** Application URL */
    url: Deno.env.get('APP_URL') || 'http://localhost:8888',
}

/** Check if running in development mode */
export const isDevelopment = isDevelopmentEnv()

/** Check if running in production mode */
export const isProduction = isProductionEnv()
