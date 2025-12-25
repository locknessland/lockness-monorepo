/**
 * Tests for CLI make:job command
 */

import { assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

Deno.test('make:job', async (t) => {
    await t.step('generates valid job from stub', async () => {
        const content = await Stub.render('make', 'job', {
            className: 'SendEmailJob',
            jobName: 'send-email',
        })

        assertStringIncludes(content, 'export class SendEmailJob')
        assertStringIncludes(content, 'implements Job')
    })

    await t.step('includes required job properties', async () => {
        const content = await Stub.render('make', 'job', {
            className: 'ProcessPayment',
            jobName: 'process-payment',
        })

        assertStringIncludes(content, "name = 'process-payment'")
        assertStringIncludes(content, 'maxAttempts')
        assertStringIncludes(content, 'payload')
    })

    await t.step('includes handle and failed methods', async () => {
        const content = await Stub.render('make', 'job', {
            className: 'TestJob',
            jobName: 'test-job',
        })

        assertStringIncludes(content, 'async handle(')
        assertStringIncludes(content, 'async failed(')
    })

    await t.step('includes constructor with payload', async () => {
        const content = await Stub.render('make', 'job', {
            className: 'MyJob',
            jobName: 'my-job',
        })

        assertStringIncludes(content, 'constructor(payload:')
        assertStringIncludes(content, 'this.payload = payload')
    })

    await t.step('imports Job and JobPayload types', async () => {
        const content = await Stub.render('make', 'job', {
            className: 'ImportJob',
            jobName: 'import-job',
        })

        assertStringIncludes(content, 'type Job')
        assertStringIncludes(content, 'type JobPayload')
        assertStringIncludes(content, "from 'lockness'")
    })
})
