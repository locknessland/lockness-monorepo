/**
 * Tests for circular-dependency behaviour in the container.
 *
 * One shape is deliberately NOT tested here because it cannot be written: two
 * classes in the same module injecting each other by class reference. The
 * decorator's argument is evaluated when the class is *defined*, so the
 * forward reference throws `ReferenceError: Cannot access 'X' before
 * initialization` at module evaluation — before the container is ever
 * consulted. Injecting the later service by token is the way around it.
 *
 * Two shapes are deliberately distinguished. The container instantiates lazily
 * and caches, and `@Inject` resolves on first property *read* — so services
 * that merely hold references to each other are legal and must keep working.
 * Only a constructor that reaches for a dependency whose own construction has
 * not finished is a fault, and that one must name the cycle rather than
 * exhausting the stack.
 */

import { assertEquals, assertThrows } from '@std/assert'
import { CircularDependencyError, Container, Inject, Service } from '../mod.ts'

// ============================================================================
// The fault: eager construction that loops
// ============================================================================

Deno.test('Container - a constructor cycle throws CircularDependencyError, not a stack overflow', () => {
    const container = new Container()

    class Alpha {
        constructor() {
            container.get(Beta)
        }
    }
    class Beta {
        constructor() {
            container.get(Alpha)
        }
    }

    const error = assertThrows(
        () => container.get(Alpha),
        CircularDependencyError,
    )
    assertEquals(
        error.chain,
        ['Alpha', 'Beta', 'Alpha'],
        'the chain names the ring, opening and closing on the repeated service',
    )
})

Deno.test('Container - a service that constructs itself is reported the same way', () => {
    const container = new Container()

    class SelfReferential {
        constructor() {
            container.get(SelfReferential)
        }
    }

    const error = assertThrows(
        () => container.get(SelfReferential),
        CircularDependencyError,
    )
    assertEquals(error.chain, ['SelfReferential', 'SelfReferential'])
})

Deno.test('Container - the message names the services and points at the remedy', () => {
    const container = new Container()

    class Orders {
        constructor() {
            container.get(Billing)
        }
    }
    class Billing {
        constructor() {
            container.get(Orders)
        }
    }

    const error = assertThrows(
        () => container.get(Orders),
        CircularDependencyError,
    )
    assertEquals(error.message.includes('Orders → Billing → Orders'), true)
    assertEquals(error.message.includes('@Inject'), true)
})

// ============================================================================
// Not a fault: the stack unwinds, so a later resolve still works
// ============================================================================

Deno.test('Container - a failed cycle does not poison later resolutions', () => {
    const container = new Container()

    class Looping {
        constructor() {
            container.get(Looping)
        }
    }
    class Plain {
        readonly value = 'ok'
    }

    assertThrows(() => container.get(Looping), CircularDependencyError)

    // The guard must pop its stack on the way out, or every later get() would
    // see a stale entry and refuse.
    assertEquals(container.get(Plain).value, 'ok')
    assertThrows(() => container.get(Looping), CircularDependencyError)
})

Deno.test('Container - sibling dependencies on one service are not mistaken for a cycle', () => {
    const container = new Container()

    class Shared {
        readonly id = 'shared'
    }
    class Left {
        readonly shared = container.get(Shared)
    }
    class Right {
        readonly shared = container.get(Shared)
    }
    class Root {
        readonly left = container.get(Left)
        readonly right = container.get(Right)
    }

    const root = container.get(Root)
    assertEquals(root.left.shared.id, 'shared')
    assertEquals(
        root.left.shared,
        root.right.shared,
        'a diamond resolves to one cached instance and is not a cycle',
    )
})

// ============================================================================
// Not a fault: mutual @Inject, which is the documented way to hold a cycle
// ============================================================================

Deno.test('Container - @Inject resolves on read, so a held reference is not a construction cycle', () => {
    @Service()
    class Subscriber {
        readonly name = 'subscriber'
    }

    @Service()
    class Publisher {
        readonly name = 'publisher'
        @Inject(Subscriber)
        accessor subscriber!: Subscriber
    }

    const container = new Container()
    const publisher = container.get(Publisher)

    assertEquals(publisher.name, 'publisher')
    assertEquals(
        publisher.subscriber.name,
        'subscriber',
        'the dependency resolves on first read, after the constructor returned',
    )
})
