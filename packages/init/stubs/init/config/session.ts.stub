/**
 * Session Configuration
 *
 * @module config/session
 */

import type { SessionConfig } from '@lockness/core'

export const sessionConfig: SessionConfig = {
    driver: 'cookie',
    secret: Deno.env.get('APP_KEY'),
    lifetime: 7200, // 2 hours
    // `secure` is deliberately absent: the framework sets the Secure flag
    // unless APP_ENV=development. Set it only to override that default.
}
