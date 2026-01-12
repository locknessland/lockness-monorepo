/**
 * Tests for Container (Dependency Injection)
 */

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

Deno.test('container system', async (t) => {
    await t.step('container.set registers a service instance', () => {
        container.set(TestService, new TestService())
    })

    await t.step('container.get retrieves a service instance', () => {
        const instance = container.get<TestService>(TestService)

        assertExists(instance)
        assertEquals(instance instanceof TestService, true)
    })

    await t.step('container.get auto-creates and returns singleton', () => {
        const instance1 = container.get<AnotherService>(AnotherService)
        const instance2 = container.get<AnotherService>(AnotherService)

        assertEquals(instance1.getId(), instance2.getId())
    })

    await t.step('service methods work correctly', () => {
        const instance = container.get<TestService>(TestService)

        assertEquals(instance.getValue(), 'test-value')
    })
})
