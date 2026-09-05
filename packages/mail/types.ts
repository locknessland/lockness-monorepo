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
    /** RFC 5322 email address (the addr-spec, e.g. `jane@example.com`). */
    email: string
    /** Optional display name rendered alongside the address, e.g. `Jane Doe`. */
    name?: string
}

export interface MailAttachment {
    /** File name shown to the recipient (e.g. `invoice.pdf`). */
    filename: string
    /** File body — a UTF-8 string for text, or raw bytes for binary content. */
    content: string | Uint8Array
    /** MIME type (e.g. `application/pdf`); drivers infer a default when omitted. */
    contentType?: string
}

export interface MailMessage {
    /** Sender address; falls back to the config's default `from` when omitted. */
    from?: MailAddress
    /** Primary recipients. At least one is required to send. */
    to: MailAddress[]
    /** Carbon-copy recipients, visible to all recipients. */
    cc?: MailAddress[]
    /** Blind carbon-copy recipients, hidden from all other recipients. */
    bcc?: MailAddress[]
    /** Address replies are directed to when it differs from `from`. */
    replyTo?: MailAddress
    /** Subject line. */
    subject: string
    /** Plain-text body; used as the fallback part in a multipart message. */
    text?: string
    /** HTML body; the rich part in a multipart message. */
    html?: string
    /** Files attached to the message. */
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
    /**
     * Deliver a message through the underlying transport.
     *
     * @param message The composed message to send.
     * @returns The delivery outcome; drivers report failure via
     * {@link MailResult.success} rather than by throwing.
     */
    send(message: MailMessage): Promise<MailResult>
}

export interface MailResult {
    /** Whether the message was accepted by the transport. */
    success: boolean
    /** Provider-assigned message identifier, present on a successful send. */
    messageId?: string
    /** Human-readable failure reason, present when `success` is `false`. */
    error?: string
}
