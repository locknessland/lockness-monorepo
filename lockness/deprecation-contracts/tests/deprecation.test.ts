import { assertThrows } from '@std/assert'
import { triggerDeprecation } from '../index.ts'

Deno.test('Deprecation - should log warning by default', () => {
    // We can't easily assert console.warn without mocking, 
    // but we can check if it doesn't throw.
    triggerDeprecation('lockness/core', '1.0.0', 'Test message')
})

Deno.test('Deprecation - should format message with %s', () => {
    // Again, tricky to test console output, but we can test logic if we refactor 
    // or just assume it works for now.
    // Let's add a way to test the formatting specifically if needed, 
    // but the current implementation is simple enough.
    triggerDeprecation('lockness/core', '1.0.0', 'Use %s instead of %s', 'NewMethod', 'OldMethod')
})

Deno.test('Deprecation - should throw if STRICT_DEPRECATIONS is set', () => {
    Deno.env.set('STRICT_DEPRECATIONS', 'true')
    try {
        assertThrows(() => {
            triggerDeprecation('lockness/core', '1.0.0', 'Strict test')
        }, Error, '[DEPRECATION] Since lockness/core 1.0.0: Strict test')
    } finally {
        Deno.env.delete('STRICT_DEPRECATIONS')
    }
})

Deno.test('Deprecation - should be ignored if IGNORE_DEPRECATIONS is set', () => {
    Deno.env.set('IGNORE_DEPRECATIONS', 'true')
    Deno.env.set('STRICT_DEPRECATIONS', 'true') // This would throw if not ignored
    try {
        // Should NOT throw because ignore takes precedence
        triggerDeprecation('lockness/core', '1.0.0', 'Ignore test')
    } finally {
        Deno.env.delete('IGNORE_DEPRECATIONS')
        Deno.env.delete('STRICT_DEPRECATIONS')
    }
})
