/**
 * Lockness Mail System
 *
 * Expressive API for sending emails with multiple driver support.
 * Inspired by Laravel's Mail system.
 *
 * @module @lockness/mail
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export type {
    MailAddress,
    MailAttachment,
    MailConfig,
    MailDriver,
    MailMessage,
    MailResult,
} from './types.ts'

// =============================================================================
// Mail Configuration
// =============================================================================

export { configureMail, getMailConfig } from './config.ts'

// =============================================================================
// Drivers
// =============================================================================

export { ConsoleMailDriver } from './drivers/console.ts'
export { MemoryMailDriver } from './drivers/memory.ts'
export { SmtpMailDriver } from './drivers/smtp.ts'
export { ResendMailDriver } from './drivers/resend.ts'

// =============================================================================
// Mail Builder & Convenience Function
// =============================================================================

export { Mail, mail } from './mail.ts'
