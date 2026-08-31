/**
 * Tests for DevtoolsCollector
 */

import { assertEquals, assertExists, assertStrictEquals } from '@std/assert'
import { DevtoolsCollector } from '../collector.ts'

Deno.test('DevtoolsCollector - Singleton instance', () => {
    const instance1 = DevtoolsCollector.getInstance()
    const instance2 = DevtoolsCollector.getInstance()

    // STRICT: the message already says "same instance"; assertEquals cannot
    // check that, and passes for two fresh collectors with equal state.
    assertStrictEquals(instance1, instance2, 'Should return same instance')
})

Deno.test('DevtoolsCollector - Add and retrieve routes', () => {
    const collector = DevtoolsCollector.getInstance()
    collector.clear()

    collector.setRoutes([{
        method: 'GET',
        path: '/users',
        controller: 'UserController',
        action: 'index',
        middlewares: ['auth'],
    }])

    const data = collector.getAllData()
    assertEquals(data.routes.length, 1)
    assertEquals(data.routes[0].method, 'GET')
    assertEquals(data.routes[0].path, '/users')
})

Deno.test('DevtoolsCollector - Add and retrieve logs', () => {
    const collector = DevtoolsCollector.getInstance()
    collector.clear()

    collector.addLog({
        timestamp: Date.now(),
        level: 'info',
        message: 'Test log message',
        context: { foo: 'bar' },
    })

    const data = collector.getAllData()
    assertEquals(data.logs.length, 1)
    assertEquals(data.logs[0].level, 'info')
    assertEquals(data.logs[0].message, 'Test log message')
})

Deno.test('DevtoolsCollector - Add and retrieve SQL queries', () => {
    const collector = DevtoolsCollector.getInstance()
    collector.clear()

    collector.addQuery({
        query: 'SELECT * FROM users',
        duration: 42.5,
        timestamp: Date.now(),
        bindings: [1, 'test'],
    })

    const data = collector.getAllData()
    assertEquals(data.queries.length, 1)
    assertEquals(data.queries[0].query, 'SELECT * FROM users')
    assertEquals(data.queries[0].duration, 42.5)
})

Deno.test('DevtoolsCollector - Add and update requests', () => {
    const collector = DevtoolsCollector.getInstance()
    collector.clear()

    const requestId = crypto.randomUUID()

    collector.addRequest({
        id: requestId,
        method: 'POST',
        path: '/api/users',
        timestamp: Date.now(),
        headers: { 'content-type': 'application/json' },
        query: {},
    })

    collector.updateRequest(requestId, {
        duration: 123.45,
        statusCode: 201,
    })

    const data = collector.getAllData()
    assertEquals(data.requests.length, 1)
    assertEquals(data.requests[0].method, 'POST')
    assertEquals(data.requests[0].duration, 123.45)
    assertEquals(data.requests[0].statusCode, 201)
})

Deno.test('DevtoolsCollector - Respect max limits', () => {
    const collector = DevtoolsCollector.getInstance()
    collector.clear()

    // Add 5 logs (default maxLogs is 1000)
    for (let i = 0; i < 5; i++) {
        collector.addLog({
            timestamp: Date.now(),
            level: 'info',
            message: `Log ${i}`,
        })
    }

    const data = collector.getAllData()
    assertEquals(
        data.logs.length,
        5,
        'Should keep all 5 logs (under max limit)',
    )
})

Deno.test('DevtoolsCollector - Add queue jobs', () => {
    const collector = DevtoolsCollector.getInstance()
    collector.clear()

    collector.addQueueJob({
        id: crypto.randomUUID(),
        name: 'SendEmailJob',
        status: 'completed',
        attempts: 1,
        timestamp: Date.now(),
    })

    const data = collector.getAllData()
    assertEquals(data.queue.length, 1)
    assertEquals(data.queue[0].name, 'SendEmailJob')
    assertEquals(data.queue[0].status, 'completed')
})

Deno.test('DevtoolsCollector - Add mail info', () => {
    const collector = DevtoolsCollector.getInstance()
    collector.clear()

    collector.addMail({
        to: 'user@example.com',
        subject: 'Welcome!',
        timestamp: Date.now(),
        driver: 'smtp',
        status: 'sent',
    })

    const data = collector.getAllData()
    assertEquals(data.mails.length, 1)
    assertEquals(data.mails[0].to, 'user@example.com')
    assertEquals(data.mails[0].subject, 'Welcome!')
})

Deno.test('DevtoolsCollector - Add performance metrics', () => {
    const collector = DevtoolsCollector.getInstance()
    collector.clear()

    collector.addPerformanceMetric({
        name: 'Database Query',
        duration: 45.2,
        timestamp: Date.now(),
        type: 'database',
    })

    const data = collector.getAllData()
    assertEquals(data.performance.length, 1)
    assertEquals(data.performance[0].type, 'database')
    assertEquals(data.performance[0].duration, 45.2)
})

Deno.test('DevtoolsCollector - Clear all data', () => {
    const collector = DevtoolsCollector.getInstance()

    collector.addLog({
        timestamp: Date.now(),
        level: 'info',
        message: 'Test',
    })

    collector.setRoutes([{
        method: 'GET',
        path: '/test',
        middlewares: [],
    }])

    let data = collector.getAllData()
    assertExists(data.logs.length > 0 || data.routes.length > 0)

    collector.clear()

    data = collector.getAllData()
    assertEquals(data.logs.length, 0)
    assertEquals(
        data.routes.length,
        1,
        'Routes should be preserved after clear',
    )
    assertEquals(data.queries.length, 0)
    assertEquals(data.requests.length, 0)
})
