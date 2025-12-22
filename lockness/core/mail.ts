/**
 * Lockness Mail System
 *
 * Expressive API for sending emails with multiple driver support.
 * Inspired by Laravel's Mail system.
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

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

// =============================================================================
// Mail Configuration
// =============================================================================

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

// =============================================================================
// Console Driver (for development/testing)
// =============================================================================

export class ConsoleMailDriver implements MailDriver {
    async send(message: MailMessage): Promise<MailResult> {
        console.log('\n📧 ═══════════════════════════════════════════════')
        console.log('   MAIL SENT (Console Driver)')
        console.log('═══════════════════════════════════════════════════')
        console.log(`From:    ${formatAddress(message.from)}`)
        console.log(`To:      ${message.to.map(formatAddress).join(', ')}`)
        if (message.cc?.length) {
            console.log(`CC:      ${message.cc.map(formatAddress).join(', ')}`)
        }
        if (message.bcc?.length) {
            console.log(`BCC:     ${message.bcc.map(formatAddress).join(', ')}`)
        }
        console.log(`Subject: ${message.subject}`)
        console.log('───────────────────────────────────────────────────')
        if (message.text) {
            console.log(message.text)
        }
        if (message.html) {
            console.log('[HTML content available]')
        }
        if (message.attachments?.length) {
            console.log(`Attachments: ${message.attachments.map((a) => a.filename).join(', ')}`)
        }
        console.log('═══════════════════════════════════════════════════\n')

        return {
            success: true,
            messageId: `console-${Date.now()}`,
        }
    }
}

// =============================================================================
// Memory Driver (for testing - stores sent emails)
// =============================================================================

const sentEmails: MailMessage[] = []

export class MemoryMailDriver implements MailDriver {
    async send(message: MailMessage): Promise<MailResult> {
        sentEmails.push(message)
        return {
            success: true,
            messageId: `memory-${sentEmails.length}`,
        }
    }

    /** Get all sent emails (for testing) */
    static getSentEmails(): MailMessage[] {
        return [...sentEmails]
    }

    /** Clear sent emails (for testing) */
    static clear(): void {
        sentEmails.length = 0
    }

    /** Get last sent email */
    static getLastEmail(): MailMessage | undefined {
        return sentEmails[sentEmails.length - 1]
    }
}

// =============================================================================
// SMTP Driver
// =============================================================================

export class SmtpMailDriver implements MailDriver {
    private config: NonNullable<MailConfig['smtp']>

    constructor(config: NonNullable<MailConfig['smtp']>) {
        this.config = config
    }

    async send(message: MailMessage): Promise<MailResult> {
        try {
            const conn = await Deno.connect({
                hostname: this.config.host,
                port: this.config.port,
            })

            const encoder = new TextEncoder()
            const decoder = new TextDecoder()

            const read = async (): Promise<string> => {
                const buf = new Uint8Array(1024)
                const n = await conn.read(buf)
                return decoder.decode(buf.subarray(0, n ?? 0))
            }

            const write = async (data: string): Promise<void> => {
                await conn.write(encoder.encode(data + '\r\n'))
            }

            // Read greeting
            await read()

            // EHLO
            await write(`EHLO localhost`)
            await read()

            // AUTH if credentials provided
            if (this.config.auth) {
                await write('AUTH LOGIN')
                await read()
                await write(btoa(this.config.auth.user))
                await read()
                await write(btoa(this.config.auth.pass))
                const authResponse = await read()
                if (!authResponse.startsWith('235')) {
                    conn.close()
                    return { success: false, error: 'Authentication failed' }
                }
            }

            // MAIL FROM
            await write(`MAIL FROM:<${message.from?.email}>`)
            await read()

            // RCPT TO
            for (const to of message.to) {
                await write(`RCPT TO:<${to.email}>`)
                await read()
            }

            // DATA
            await write('DATA')
            await read()

            // Headers
            const headers = [
                `From: ${formatAddress(message.from)}`,
                `To: ${message.to.map(formatAddress).join(', ')}`,
                `Subject: ${message.subject}`,
                `MIME-Version: 1.0`,
                `Content-Type: text/html; charset=UTF-8`,
                '',
                message.html || message.text || '',
                '.',
            ].join('\r\n')

            await write(headers)
            const dataResponse = await read()

            // QUIT
            await write('QUIT')
            conn.close()

            if (dataResponse.startsWith('250')) {
                const match = dataResponse.match(/queued as (\S+)/i)
                return {
                    success: true,
                    messageId: match?.[1] || `smtp-${Date.now()}`,
                }
            }

            return { success: false, error: dataResponse }
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message,
            }
        }
    }
}

// =============================================================================
// Resend Driver (https://resend.com)
// =============================================================================

export class ResendMailDriver implements MailDriver {
    private apiKey: string

    constructor(apiKey: string) {
        this.apiKey = apiKey
    }

    async send(message: MailMessage): Promise<MailResult> {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: formatAddress(message.from),
                    to: message.to.map((a) => a.email),
                    cc: message.cc?.map((a) => a.email),
                    bcc: message.bcc?.map((a) => a.email),
                    reply_to: message.replyTo?.email,
                    subject: message.subject,
                    text: message.text,
                    html: message.html,
                }),
            })

            const data = await response.json()

            if (response.ok) {
                return {
                    success: true,
                    messageId: data.id,
                }
            }

            return {
                success: false,
                error: data.message || 'Unknown error',
            }
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message,
            }
        }
    }
}

// =============================================================================
// Mail Builder (Fluent API)
// =============================================================================

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
    to(email: string | string[] | MailAddress | MailAddress[], name?: string): this {
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
    attach(filename: string, content: string | Uint8Array, contentType?: string): this {
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
    async send(): Promise<MailResult> {
        const config = getMailConfig()

        // Apply defaults
        if (!this.message.from) {
            this.message.from = config.from
        }

        if (!this.message.to?.length) {
            return { success: false, error: 'No recipients specified' }
        }

        if (!this.message.subject) {
            return { success: false, error: 'No subject specified' }
        }

        // Get driver
        let driver = this.driver

        if (!driver) {
            switch (config.driver) {
                case 'smtp':
                    if (!config.smtp) {
                        return { success: false, error: 'SMTP not configured' }
                    }
                    driver = new SmtpMailDriver(config.smtp)
                    break
                case 'resend':
                    if (!config.resend?.apiKey) {
                        return { success: false, error: 'Resend API key not configured' }
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

        return driver.send(this.message as MailMessage)
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatAddress(address?: MailAddress): string {
    if (!address) return ''
    if (address.name) {
        return `"${address.name}" <${address.email}>`
    }
    return address.email
}

// =============================================================================
// Convenience Function
// =============================================================================

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
