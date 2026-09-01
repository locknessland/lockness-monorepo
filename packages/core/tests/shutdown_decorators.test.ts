/**
 * `@OnShutdown` — the decorator half of the shutdown lifecycle.
 *
 * It mirrors `@OnBoot` in shape and inverts it in meaning: boot runs highest
 * priority first, shutdown runs lowest first, so a hook pairs with its boot
 * counterpart at the same number and tears down in the opposite order.
 *
 * One thing it deliberately does NOT mirror is how the metadata is stored —
 * see the subclass test below, which fails against the shape `@OnBoot` used.
 */

import {
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert'
import {
    getShutdownHooks,
    KERNEL_SHUTDOWN_HOOKS,
    OnShutdown,
} from '../kernel/shutdown_decorators.ts'

Deno.test('OnShutdown - records the method and its priority', () => {
    class Kernel {
        @OnShutdown({ priority: 50 })
        closeCache() {}
    }
    new Kernel()

    const hooks = getShutdownHooks(Kernel)
    assertEquals(hooks.length, 1)
    assertEquals(hooks[0].method, 'closeCache')
    assertEquals(hooks[0].priority, 50)
})

Deno.test('OnShutdown - priority defaults to 0', () => {
    class Kernel {
        @OnShutdown()
        flush() {}
    }
    new Kernel()

    assertEquals(getShutdownHooks(Kernel)[0].priority, 0)
})

Deno.test('OnShutdown - reads from an instance as well as a class', () => {
    class Kernel {
        @OnShutdown({ priority: 7 })
        stop() {}
    }
    const instance = new Kernel()

    assertEquals(getShutdownHooks(instance)[0].method, 'stop')
})

Deno.test('OnShutdown - a class with no hooks returns an empty list, not undefined', () => {
    class Bare {}
    assertEquals(getShutdownHooks(Bare), [])
})

Deno.test('OnShutdown - registering twice does not duplicate the hook', () => {
    class Kernel {
        @OnShutdown({ priority: 1 })
        once() {}
    }
    new Kernel()
    new Kernel()

    assertEquals(getShutdownHooks(Kernel).length, 1)
})

Deno.test('OnShutdown - refuses anything that is not a method', () => {
    // The message shape matches @OnBoot's, because a developer who has seen one
    // should recognise the other.
    //
    // The decorator is invoked directly rather than written as `@OnShutdown()`
    // on a field: TC39 decorators are position-checked at parse time, so the
    // misapplied form is not valid syntax `deno fmt` can read. Calling it with
    // a non-method context exercises the same guard.
    const decorate = OnShutdown()

    for (const kind of ['field', 'getter', 'setter', 'class'] as const) {
        assertThrows(
            () =>
                decorate(
                    () => {},
                    {
                        kind,
                        name: 'x',
                    } as unknown as ClassMethodDecoratorContext<
                        unknown,
                        () => void
                    >,
                ),
            Error,
            '@OnShutdown can only decorate methods',
            `kind "${kind}" must be refused`,
        )
    }
})

Deno.test('OnShutdown - a subclass never writes into its parent array', async (t) => {
    // THE test in this file. `@OnBoot` stores hooks with
    //     if (!constructor[KERNEL_BOOT_HOOKS]) constructor[...] = []
    // a truthiness check that reads THROUGH the prototype chain. When the
    // parent already owns an array, the subclass finds it and pushes into it —
    // so the parent silently acquires its child's hooks. Measured: with
    // `new Base()` before `new Child()`, getBootHooks(Base) returns both.
    //
    // At shutdown that means a resource closed twice, or a hook invoked against
    // a kernel that does not own it. `Object.hasOwn` is what prevents it, and
    // this test fails against any implementation that uses the truthiness form.

    await t.step('the parent keeps only its own hook', () => {
        class Base {
            @OnShutdown({ priority: 1 })
            common() {}
        }
        class Child extends Base {
            @OnShutdown({ priority: 2 })
            extra() {}
        }

        // Instantiation ORDER is the trigger: the parent must be constructed
        // first for it to own an array the child can find by inheritance.
        new Base()
        new Child()

        assertEquals(
            getShutdownHooks(Base).map((h) => h.method),
            ['common'],
            "the parent must not have acquired the child's hook",
        )
    })

    await t.step(
        'the child sees both, because both initialisers ran on it',
        () => {
            class Base2 {
                @OnShutdown({ priority: 1 })
                common() {}
            }
            class Child2 extends Base2 {
                @OnShutdown({ priority: 2 })
                extra() {}
            }
            new Base2()
            new Child2()

            // Inheritance still works, and it works the RIGHT way round.
            // Constructing a Child runs the Base constructor, so both initialisers
            // fire with `this.constructor === Child2` — the child's own array ends
            // up holding both hooks. That is inheritance. The defect this file
            // guards is the opposite direction: the parent acquiring the child's.
            assertEquals(
                getShutdownHooks(Child2).map((h) => h.method).sort(),
                ['common', 'extra'],
            )
        },
    )

    await t.step('the two arrays are not the same object', () => {
        class Base3 {
            @OnShutdown({ priority: 1 })
            common() {}
        }
        class Child3 extends Base3 {
            @OnShutdown({ priority: 2 })
            extra() {}
        }
        new Base3()
        new Child3()

        // Read the UNDERLYING arrays, not what the accessor returns.
        //
        // The first version of this compared `getShutdownHooks(Base3)` with
        // `getShutdownHooks(Child3)` and asserted they were not the same
        // object — which is unconditionally true, because the accessor returns
        // `[...]`, a fresh copy on every call. It would have passed for an
        // implementation where both classes share one underlying array, i.e.
        // for exactly the defect this file exists to catch.
        //
        // And the comment justifying it was wrong twice over:
        // `assertNotStrictEquals` is an identity assertion (`Object.is`), not a
        // content one, so it was the right tool rejected on a false premise.
        const a = (Base3 as unknown as Record<symbol, unknown>)[
            KERNEL_SHUTDOWN_HOOKS
        ]
        const b = (Child3 as unknown as Record<symbol, unknown>)[
            KERNEL_SHUTDOWN_HOOKS
        ]
        assertNotStrictEquals(
            a,
            b,
            'sharing one array is what allowed the leak',
        )
    })
})

Deno.test('OnShutdown - the returned list is a copy', () => {
    class Kernel {
        @OnShutdown({ priority: 3 })
        stop() {}
    }
    new Kernel()

    const first = getShutdownHooks(Kernel)
    const second = getShutdownHooks(Kernel)

    // Distinct arrays, equal contents: a caller that sorts or splices what it
    // got back must not be able to reorder the kernel's own registration list.
    assertEquals(first === second, false, 'each call returns a fresh array')
    assertEquals(first, second)
    assertStrictEquals(first[0], second[0])
})
