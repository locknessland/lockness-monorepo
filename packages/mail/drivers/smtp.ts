/**
 * @fileoverview SMTP mail driver.
 *
 * Speaks a minimal SMTP dialogue over a raw TCP connection, with optional
 * AUTH LOGIN.
 *
 * @module @lockness/mail/drivers/smtp
 */

import type {
    MailConfig,
    MailDriver,
    MailMessage,
    MailResult,
} from '../types.ts'
import { formatAddress } from '../format.ts'

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
