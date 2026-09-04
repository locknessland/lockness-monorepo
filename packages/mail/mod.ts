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

// =============================================================================
// Mailables (markdown/templated) + queued mail + dev preview
// =============================================================================

export { Mailable, type MailableContent } from './mailable.ts'
export { MailPackageMissingError, type ModuleImporter } from './optional.ts'
export {
    configureMailQueue,
    getMailableFactory,
    handleMailJob,
    type MailableFactory,
    type MailDispatcher,
    MailQueueNotConfiguredError,
    type QueuedMailJob,
    queueMailable,
    registerMailable,
    resetMailableRegistry,
    resetMailQueue,
} from './queued.ts'
export {
    type CapturedMail,
    capturedMails,
    capturePreview,
    disableMailPreview,
    enableMailPreview,
    isMailPreviewEnabled,
    mailPreviewHandler,
    resetMailPreview,
} from './preview.ts'
export {
    type Cli,
    handleMakeMail,
    isContained,
    MAIL_DIR,
    registerMailCommands,
} from './cli_commands.ts'
