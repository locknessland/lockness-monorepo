/**
 * @fileoverview Tests for queued mail — SC-005/005a (identifiers-only +
 * allowlist rehydration).
 *
 * @module @lockness/mail/tests/queued
 */

import { assert, assertEquals } from '@std/assert'
import { configureMail, MemoryMailDriver } from '../mod.ts'
import { Mailable, type MailableContent } from '../mailable.ts'
import {
    configureMailQueue,
    handleMailJob,
    type QueuedMailJob,
    queueMailable,
    registerMailable,
    resetMailableRegistry,
    resetMailQueue,
} from '../queued.ts'

class Invoice extends Mailable {
    constructor(private readonly to: string, private readonly amount: number) {
        super()
    }
    build(): MailableContent {
        // Rendered content that must NOT reach the queue store:
        return {
            to: this.to,
            subject: `Invoice for ${this.to}`,
            html: `<p>You owe ${this.amount}</p>`,
        }
    }
    override toQueue(): unknown {
        return { to: this.to, amount: this.amount }
    }
}

Deno.test('SC-005: queueMailable enqueues one identifiers-only job (no rendered body)', () => {
    const jobs: QueuedMailJob[] = []
    resetMailQueue()
    configureMailQueue((job) => void jobs.push(job))

    queueMailable(new Invoice('alice@example.com', 4242))

    assertEquals(jobs.length, 1)
    assertEquals(jobs[0].mailableName, 'Invoice')
    assertEquals(jobs[0].constructorPayload, {
        to: 'alice@example.com',
        amount: 4242,
    })
    // No rendered HTML / rendered subject in the payload.
    const serialised = JSON.stringify(jobs[0])
    assert(!serialised.includes('You owe'))
    assert(!serialised.includes('<p>'))
    resetMailQueue()
})

Deno.test('SC-005: the job rehydrates via the registry + sends in handle()', async () => {
    configureMail({ driver: 'memory' })
    MemoryMailDriver.clear()
    resetMailableRegistry()
    registerMailable(
        'Invoice',
        (p) =>
            new Invoice(
                (p as { to: string }).to,
                (p as { amount: number }).amount,
            ),
    )

    await handleMailJob({
        mailableName: 'Invoice',
        constructorPayload: { to: 'bob@example.com', amount: 10 },
    })
    const sent = MemoryMailDriver.getLastEmail()
    assertEquals(sent?.to[0].email, 'bob@example.com')
    assert(sent?.html?.includes('You owe 10'))
    resetMailableRegistry()
    MemoryMailDriver.clear()
})

Deno.test('SC-005a: an unregistered mailable job is rejected without instantiation', async () => {
    resetMailableRegistry()
    let threw = false
    try {
        await handleMailJob({
            mailableName: 'EvilGadget',
            constructorPayload: {},
        })
    } catch (e) {
        threw = true
        assert((e as Error).message.includes('not registered'))
    }
    assert(threw)
})
