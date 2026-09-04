/**
 * @fileoverview The fluent {@link Mail} builder and the `mail()` shorthand.
 *
 * Accumulates a message through a chainable API and dispatches it through the
 * per-call driver or the one selected from configuration.
 *
 * @module @lockness/mail/mail
 */

import type {
    MailAddress,
    MailDriver,
    MailMessage,
    MailResult,
} from './types.ts'
import { getMailConfig } from './config.ts'
import { ConsoleMailDriver } from './drivers/console.ts'
import { MemoryMailDriver } from './drivers/memory.ts'
import { SmtpMailDriver } from './drivers/smtp.ts'
import { ResendMailDriver } from './drivers/resend.ts'
import { capturePreview } from './preview.ts'

export class Mail {
    private message: Partial<MailMessage> = {}
    private driver?: MailDriver

    /**
     * Create a new mail instance
     */
    static create(): Mail {
        return new Mail()
    }

    /**
     * Set the sender
     */
    from(email: string, name?: string): this {
        this.message.from = { email, name }
        return this
    }

    /**
     * Add recipient(s)
     */
    to(
        email: string | string[] | MailAddress | MailAddress[],
        name?: string,
    ): this {
        if (!this.message.to) this.message.to = []

        if (typeof email === 'string') {
            this.message.to.push({ email, name })
        } else if (Array.isArray(email)) {
            for (const e of email) {
                if (typeof e === 'string') {
                    this.message.to.push({ email: e })
                } else {
                    this.message.to.push(e)
                }
            }
        } else {
            this.message.to.push(email)
        }

        return this
    }

    /**
     * Add CC recipient(s)
     */
    cc(email: string | MailAddress, name?: string): this {
        if (!this.message.cc) this.message.cc = []

        if (typeof email === 'string') {
            this.message.cc.push({ email, name })
        } else {
            this.message.cc.push(email)
        }

        return this
    }

    /**
     * Add BCC recipient(s)
     */
    bcc(email: string | MailAddress, name?: string): this {
        if (!this.message.bcc) this.message.bcc = []

        if (typeof email === 'string') {
            this.message.bcc.push({ email, name })
        } else {
            this.message.bcc.push(email)
        }

        return this
    }

    /**
     * Set reply-to address
     */
    replyTo(email: string, name?: string): this {
        this.message.replyTo = { email, name }
        return this
    }

    /**
     * Set email subject
     */
    subject(subject: string): this {
        this.message.subject = subject
        return this
    }

    /**
     * Set plain text content
     */
    text(content: string): this {
        this.message.text = content
        return this
    }

    /**
     * Set HTML content
     */
    html(content: string): this {
        this.message.html = content
        return this
    }

    /**
     * Set HTML content from JSX (renders to string)
     */
    view(jsx: unknown): this {
        // Handle JSX elements
        if (jsx && typeof jsx === 'object' && 'toString' in jsx) {
            this.message.html = String(jsx)
        }
        return this
    }

    /**
     * Add attachment
     */
    attach(
        filename: string,
        content: string | Uint8Array,
        contentType?: string,
    ): this {
        if (!this.message.attachments) this.message.attachments = []

        this.message.attachments.push({ filename, content, contentType })
        return this
    }

    /**
     * Use a specific driver for this email
     */
    useDriver(driver: MailDriver): this {
        this.driver = driver
        return this
    }

    /**
     * Send the email
     */
    send(): Promise<MailResult> {
        const config = getMailConfig()

        // Apply defaults
        if (!this.message.from) {
            this.message.from = config.from
        }

        if (!this.message.to?.length) {
            return Promise.resolve({
                success: false,
                error: 'No recipients specified',
            })
        }

        if (!this.message.subject) {
            return Promise.resolve({
                success: false,
                error: 'No subject specified',
            })
        }

        // Get driver
        let driver = this.driver

        if (!driver) {
            switch (config.driver) {
                case 'smtp':
                    if (!config.smtp) {
                        return Promise.resolve({
                            success: false,
                            error: 'SMTP not configured',
                        })
                    }
                    driver = new SmtpMailDriver(config.smtp)
                    break
                case 'resend':
                    if (!config.resend?.apiKey) {
                        return Promise.resolve({
                            success: false,
                            error: 'Resend API key not configured',
                        })
                    }
                    driver = new ResendMailDriver(config.resend.apiKey)
                    break
                case 'memory':
                    driver = new MemoryMailDriver()
                    break
                case 'console':
                default:
                    driver = new ConsoleMailDriver()
                    break
            }
        }

        // Dev preview tap — a no-op unless the preview is explicitly enabled
        // (and never in production).
        capturePreview(this.message as MailMessage)
        return driver.send(this.message as MailMessage)
    }
}

/**
 * Create a new mail instance (shorthand)
 *
 * @example
 * await mail()
 *   .to('user@example.com')
 *   .subject('Welcome!')
 *   .html('<h1>Hello!</h1>')
 *   .send()
 */
export function mail(): Mail {
    return Mail.create()
}
