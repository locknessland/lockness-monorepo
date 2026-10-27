/**
 * The `@Static` decorator (#54) — how a controller opts a route into static
 * pre-rendering, without importing anything but the decorator.
 *
 * `@Static` is a mechanical sibling of `@Cache` / `@Throttle`: it records
 * metadata on the controller constructor, method-level via `addInitializer`
 * (which only fires on instantiation) and class-level directly. Three rules this
 * file pins:
 *
 * 1. A method-level `@Static` records that method in `_staticConfigs`, keyed by
 *    method name, carrying its options (the literal `params` list, when given).
 * 2. A class-level `@Static` sets `_staticAll` — every GET route is static.
 * 3. `@Static` on anything but a class or a method throws, naming the kind.
 *
 * @module @lockness/contract/tests/static_decorator
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import { Static } from '../routing/decorators.ts'
import type { ControllerWithMetadata } from '../routing/decorators.ts'

Deno.test('@Static - method level records the method in _staticConfigs on instantiation', () => {
    class Ctrl {
        @Static()
        index() {}
    }
    // addInitializer only runs when an instance is created.
    new Ctrl()
    const meta = Ctrl as unknown as ControllerWithMetadata
    assert(meta._staticConfigs, '_staticConfigs is created')
    assert('index' in meta._staticConfigs!, 'the decorated method is recorded')
    assertEquals(
        meta._staticAll,
        undefined,
        'method-level does not mark the class',
    )
})

Deno.test('@Static - stores the literal params list', () => {
    const params = [{ slug: 'a' }, { slug: 'b' }] as const
    class Ctrl {
        @Static({ params })
        page() {}
    }
    new Ctrl()
    const meta = Ctrl as unknown as ControllerWithMetadata
    assertEquals(meta._staticConfigs!.page.params, params)
})

Deno.test('@Static - class level marks every route static via _staticAll', () => {
    @Static()
    class Ctrl {
        index() {}
    }
    const meta = Ctrl as unknown as ControllerWithMetadata
    assertEquals(meta._staticAll, true, 'the class is marked all-static')
})

Deno.test('@Static - method options default to an empty object', () => {
    class Ctrl {
        @Static()
        index() {}
    }
    new Ctrl()
    const meta = Ctrl as unknown as ControllerWithMetadata
    assertEquals(meta._staticConfigs!.index.params, undefined)
})

Deno.test('@Static - rejects a non-class, non-method target', () => {
    assertThrows(
        () => {
            // Simulate the decorator called on a field context.
            const decorate = Static() as (t: unknown, c: unknown) => void
            decorate({}, { kind: 'field', name: 'x' })
        },
        TypeError,
        'field',
    )
})
