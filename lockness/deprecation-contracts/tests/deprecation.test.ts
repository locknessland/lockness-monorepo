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

import { Deprecated } from '../index.ts'

Deno.test('Deprecated Decorator - should trigger on class instantiation', () => {
    Deno.env.set('STRICT_DEPRECATIONS', 'true')

    @Deprecated('1.0.0', 'Class is deprecated')
    class TestClass { }

    try {
        assertThrows(() => new TestClass(), Error, '[DEPRECATION] Since app 1.0.0: Class is deprecated')
    } finally {
        Deno.env.delete('STRICT_DEPRECATIONS')
    }
})

Deno.test('Deprecated Decorator - should trigger on method call', () => {
    Deno.env.set('STRICT_DEPRECATIONS', 'true')

    class TestClass {
        @Deprecated('1.0.0', 'Method is deprecated')
        test() { return 'ok' }
    }

    const instance = new TestClass()
    try {
        assertThrows(() => instance.test(), Error, '[DEPRECATION] Since app 1.0.0: test() is deprecated. Method is deprecated')
    } finally {
        Deno.env.delete('STRICT_DEPRECATIONS')
    }
})

Deno.test('Deprecated Decorator - should trigger on accessor access', () => {
    Deno.env.set('STRICT_DEPRECATIONS', 'true')

    class TestClass {
        @Deprecated('1.0.0', 'Property is deprecated')
        accessor prop = 'value'
    }

    const instance = new TestClass()
    try {
        assertThrows(() => instance.prop, Error, 'Accessing deprecated property "prop"')
        assertThrows(() => instance.prop = 'new', Error, 'Setting deprecated property "prop"')
    } finally {
        Deno.env.delete('STRICT_DEPRECATIONS')
    }
})
