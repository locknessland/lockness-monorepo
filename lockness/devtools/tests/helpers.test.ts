/**
 * Tests for devtools helpers
 */

import { assertEquals } from '@std/assert'
import { log, trackJob, trackMail, trackQuery } from '../mod.ts'
import { collector } from '../collector.ts'

Deno.test('log helper - adds log entry', () => {
    collector.clear()

    log('info', 'Test message', { userId: 123 })

    const data = collector.getAllData()
    assertEquals(data.logs.length, 1)
    assertEquals(data.logs[0].level, 'info')
    assertEquals(data.logs[0].message, 'Test message')
    assertEquals(data.logs[0].context?.userId, 123)
})

Deno.test('trackQuery helper - adds SQL query', () => {
    collector.clear()

    trackQuery('SELECT * FROM users WHERE id = ?', 25.5, [1])

    const data = collector.getAllData()
    assertEquals(data.queries.length, 1)
    assertEquals(data.queries[0].query, 'SELECT * FROM users WHERE id = ?')
    assertEquals(data.queries[0].duration, 25.5)
    assertEquals(data.queries[0].bindings, [1])
})

Deno.test('trackJob helper - adds queue job', () => {
    collector.clear()

    const jobInfo = {
        id: crypto.randomUUID(),
        name: 'SendWelcomeEmail',
        status: 'completed' as const,
        attempts: 1,
        timestamp: Date.now(),
    }

    trackJob(jobInfo)

    const data = collector.getAllData()
    assertEquals(data.queue.length, 1)
    assertEquals(data.queue[0].name, 'SendWelcomeEmail')
    assertEquals(data.queue[0].status, 'completed')
})

Deno.test('trackMail helper - adds mail info', () => {
    collector.clear()

    const mailInfo = {
        to: 'test@example.com',
        subject: 'Test Email',
        timestamp: Date.now(),
        driver: 'smtp',
        status: 'sent' as const,
    }

    trackMail(mailInfo)

    const data = collector.getAllData()
    assertEquals(data.mails.length, 1)
    assertEquals(data.mails[0].to, 'test@example.com')
    assertEquals(data.mails[0].subject, 'Test Email')
})
