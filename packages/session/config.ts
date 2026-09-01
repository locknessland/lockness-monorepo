/**
 * @fileoverview Session configuration management.
 *
 * @module @lockness/session/config
 */

import type { SessionConfig } from './types.ts'

/**
 * Package defaults.
 *
 * **No `secret` here, deliberately.** It used to default to `''`, which the
 * cookie driver read as "encryption off" — so the documented
 * `sessionMiddleware()` call shipped an attacker-writable cookie. A required
 * field whose shipped default is, by its own definition, unusable invites
 * exactly one fix: putting a generated key back into this file, process-wide and
 * invisible. The key comes from the application, or the cookie driver refuses to
 * start.
 */
export const defaultConfig: SessionConfig = {
    driver: 'cookie',
    cookieName: 'lockness_session',
    lifetime: 7200, // 2 hours
    path: '/',
    secure: false,
    httpOnly: true,
    sameSite: 'Lax',
}

let globalConfig: SessionConfig = { ...defaultConfig }

/**
 * Configure global session settings.
 *
 * Call this once at application startup to set default session options.
 * These can be overridden per-middleware instance.
 *
 * @param config - Partial configuration to merge with defaults
 *
 * @example
 * ```typescript
 * configureSession({
 *   driver: 'deno-kv',
 *   secret: Deno.env.get('SESSION_SECRET')!,
 *   secure: true,
 *   lifetime: 86400, // 24 hours
 * })
 * ```
 */
export function configureSession(config: Partial<SessionConfig>): void {
    globalConfig = { ...defaultConfig, ...config }
}

/**
 * Get the current session configuration.
 *
 * @returns The merged global session configuration
 */
export function getSessionConfig(): SessionConfig {
    return globalConfig
}
