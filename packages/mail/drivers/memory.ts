/**
 * @fileoverview In-memory mail driver.
 *
 * Records sent messages in a process-local array and exposes static
 * accessors for assertions in tests; sends nothing.
 *
 * @module @lockness/mail/drivers/memory
 */

import type { MailDriver, MailMessage, MailResult } from '../types.ts'

const sentEmails: MailMessage[] = []

export class MemoryMailDriver implements MailDriver {
    send(message: MailMessage): Promise<MailResult> {
        sentEmails.push(message)
        return Promise.resolve({
            success: true,
            messageId: `memory-${sentEmails.length}`,
        })
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
