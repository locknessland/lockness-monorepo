/**
 * @fileoverview Process-global mail configuration.
 *
 * Holds the single mutable `globalMailConfig` (kept here and nowhere else so
 * there is exactly one configuration) and the accessors the builder reads it
 * through.
 *
 * @module @lockness/mail/config
 */

import type { MailConfig } from './types.ts'

const defaultConfig: MailConfig = {
    driver: 'console',
    from: { email: 'noreply@example.com', name: 'Lockness App' },
}

let globalMailConfig: MailConfig = { ...defaultConfig }

export function configureMail(config: Partial<MailConfig>): void {
    globalMailConfig = { ...globalMailConfig, ...config }
}

export function getMailConfig(): MailConfig {
    return globalMailConfig
}
