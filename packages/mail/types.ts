/**
 * @fileoverview Public type vocabulary for the Lockness mail system.
 *
 * Address, attachment, message, configuration, driver and result contracts
 * shared by every driver, the {@link Mail} builder and the config helpers.
 * Dependency-free to avoid cycles.
 *
 * @module @lockness/mail/types
 */

export interface MailAddress {
    email: string
    name?: string
}

export interface MailAttachment {
    filename: string
    content: string | Uint8Array
    contentType?: string
}

export interface MailMessage {
    from?: MailAddress
    to: MailAddress[]
    cc?: MailAddress[]
    bcc?: MailAddress[]
    replyTo?: MailAddress
    subject: string
    text?: string
    html?: string
    attachments?: MailAttachment[]
}

export interface MailConfig {
    /** Default mail driver */
    driver: 'smtp' | 'resend' | 'console' | 'memory'
    /** Default from address */
    from: MailAddress
    /** SMTP configuration */
    smtp?: {
        host: string
        port: number
        secure?: boolean
        auth?: {
            user: string
            pass: string
        }
    }
    /** Resend API configuration */
    resend?: {
        apiKey: string
    }
}

export interface MailDriver {
    send(message: MailMessage): Promise<MailResult>
}

export interface MailResult {
    success: boolean
    messageId?: string
    error?: string
}
