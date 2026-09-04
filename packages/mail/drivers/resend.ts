/**
 * @fileoverview Resend mail driver.
 *
 * Sends messages through the Resend HTTP API (https://resend.com).
 *
 * @module @lockness/mail/drivers/resend
 */

import type { MailDriver, MailMessage, MailResult } from '../types.ts'
import { formatAddress } from '../format.ts'

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
