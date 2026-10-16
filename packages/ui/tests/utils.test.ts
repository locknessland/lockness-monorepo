import { test } from 'node:test'
import { assertEquals, assertStringIncludes } from '@std/assert'
import { cn } from '../lib/utils.ts'

test('cn utility function', async (t) => {
    await t.test('merges simple class names', () => {
        const result = cn('px-2', 'py-1', 'bg-blue-500')
        assertEquals(result, 'px-2 py-1 bg-blue-500')
    })

    await t.test('handles conflicting Tailwind classes', () => {
        const result = cn('px-2', 'px-4')
        assertEquals(result, 'px-4')
    })

    await t.test('handles conditional classes with boolean', () => {
        const result = cn('text-base', false && 'text-lg', true && 'font-bold')
        assertEquals(result, 'text-base font-bold')
    })

    await t.test('handles class objects', () => {
        const result = cn('base', {
            'text-lg': true,
            'text-sm': false,
        })
        assertEquals(result, 'base text-lg')
    })

    await t.test('handles arrays', () => {
        const result = cn(['px-2', 'py-1'], 'bg-blue-500')
        assertEquals(result, 'px-2 py-1 bg-blue-500')
    })

    await t.test('handles undefined and null', () => {
        const result = cn('px-2', undefined, null, 'py-1')
        assertEquals(result, 'px-2 py-1')
    })

    await t.test('resolves multiple Tailwind conflicts', () => {
        const result = cn('px-2 py-1 text-sm', 'px-4 text-lg')
        // Last value wins for conflicting utilities
        assertStringIncludes(result, 'px-4')
        assertStringIncludes(result, 'py-1')
        assertStringIncludes(result, 'text-lg')
    })
})
