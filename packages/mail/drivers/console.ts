/**
 * @fileoverview Console mail driver.
 *
 * Prints the message to stdout for development and testing; sends nothing.
 *
 * @module @lockness/mail/drivers/console
 */

import type { MailDriver, MailMessage, MailResult } from '../types.ts'
import { formatAddress } from '../format.ts'

export class ConsoleMailDriver implements MailDriver {
    send(message: MailMessage): Promise<MailResult> {
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
            console.log(
                `Attachments: ${
                    message.attachments.map((a) => a.filename).join(', ')
                }`,
            )
        }
        console.log('═══════════════════════════════════════════════════\n')

        return Promise.resolve({
            success: true,
            messageId: `console-${Date.now()}`,
        })
    }
}
