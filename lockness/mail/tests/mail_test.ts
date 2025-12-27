/**
 * Tests for Mail System
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import {
    configureMail,
    ConsoleMailDriver,
    mail,
    MemoryMailDriver,
} from '../mod.ts'

Deno.test('mail system', async (t) => {
    await t.step('configureMail sets up mail config', () => {
        configureMail({
            driver: 'console',
            from: { email: 'test@example.com', name: 'Test' },
        })
    })

    await t.step('mail() creates Mail instance', () => {
        const m = mail()
        assertEquals(typeof m.to, 'function')
        assertEquals(typeof m.subject, 'function')
        assertEquals(typeof m.html, 'function')
        assertEquals(typeof m.send, 'function')
    })

    await t.step('Mail fluent API works', () => {
        const m = mail()
            .to('user@example.com')
            .subject('Test Subject')
            .html('<h1>Hello</h1>')

        assertEquals(typeof m.send, 'function')
    })

    await t.step('ConsoleMailDriver send returns success', async () => {
        const driver = new ConsoleMailDriver()
        const result = await driver.send({
            from: { email: 'from@example.com' },
            to: [{ email: 'to@example.com' }],
            subject: 'Test',
            html: '<p>Test</p>',
        })

        assertEquals(result.success, true)
        assertStringIncludes(result.messageId!, 'console-')
    })

    await t.step('MemoryMailDriver stores sent emails', async () => {
        const driver = new MemoryMailDriver()

        await driver.send({
            from: { email: 'from@example.com' },
            to: [{ email: 'to@example.com' }],
            subject: 'Test 1',
        })

        await driver.send({
            from: { email: 'from@example.com' },
            to: [{ email: 'to2@example.com' }],
            subject: 'Test 2',
        })

        const emails = MemoryMailDriver.getSentEmails()
        assertEquals(emails.length >= 2, true)
    })

    await t.step('Mail with multiple recipients', () => {
        const m = mail()
            .to('user1@example.com')
            .to({ email: 'user2@example.com', name: 'User 2' })
            .cc('cc@example.com')
            .bcc('bcc@example.com')

        assertEquals(typeof m.send, 'function')
    })

    await t.step('Mail with attachments', () => {
        const m = mail()
            .to('user@example.com')
            .subject('With Attachment')
            .attach('test.txt', 'Hello World')

        assertEquals(typeof m.send, 'function')
    })
})
