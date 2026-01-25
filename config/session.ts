/**
 * Session Configuration
 *
 * @module config/session
 */

import type { SessionConfig } from '@lockness/core'

export const sessionConfig: SessionConfig = {
    driver: 'cookie',
    secret: Deno.env.get('APP_KEY') || 'change-me-in-production',
    lifetime: 7200, // 2 hours
    secure: Deno.env.get('APP_ENV') === 'production',
}
