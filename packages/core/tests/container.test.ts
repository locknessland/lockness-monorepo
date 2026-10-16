/**
 * Tests for Container (Dependency Injection)
 */

import { test } from 'node:test'
import { assertEquals, assertExists } from '@std/assert'
import { container } from '../mod.ts'

class TestService {
    getValue(): string {
        return 'test-value'
    }
}

class AnotherService {
    private id: number

    constructor() {
        this.id = Math.random()
    }

    getId(): number {
        return this.id
    }
}

test('container system', async (t) => {
    await t.test('container.set registers a service instance', () => {
        container.set(TestService, new TestService())
    })

    await t.test('container.get retrieves a service instance', () => {
        const instance = container.get<TestService>(TestService)

        assertExists(instance)
        assertEquals(instance instanceof TestService, true)
    })

    await t.test('container.get auto-creates and returns singleton', () => {
        const instance1 = container.get<AnotherService>(AnotherService)
        const instance2 = container.get<AnotherService>(AnotherService)

        assertEquals(instance1.getId(), instance2.getId())
    })

    await t.test('service methods work correctly', () => {
        const instance = container.get<TestService>(TestService)

        assertEquals(instance.getValue(), 'test-value')
    })
})
