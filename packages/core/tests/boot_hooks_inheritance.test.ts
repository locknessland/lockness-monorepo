/**
 * `@OnBoot` metadata must belong to the class that declared it.
 *
 * Found while building the shutdown lifecycle (#129), which was asked to mirror
 * `@OnBoot` — mirroring it faithfully would have copied this defect into
 * teardown, where it closes a resource twice.
 */

import { assertEquals } from '@std/assert'
import { OnBoot } from '../kernel/decorators.ts'
import { getBootHooks } from '../kernel/boot_runner.ts'

Deno.test('OnBoot - a subclass does not write into its parent hook array', () => {
    class Base {
        @OnBoot({ priority: 1 })
        common(_app: object) {}
    }
    class Child extends Base {
        @OnBoot({ priority: 2 })
        extra(_app: object) {}
    }

    // Order matters, and this is the failing order. The parent must be
    // constructed FIRST so that it owns an array the child could find through
    // the prototype chain; `new Child()` first leaves both classes correct,
    // which is how this survived unnoticed.
    new Base()
    new Child()

    assertEquals(
        getBootHooks(Base).map((h) => h.method),
        ['common'],
        "the parent must not have acquired the child's boot hook",
    )
})

Deno.test('OnBoot - the child still inherits, the right way round', () => {
    class Base {
        @OnBoot({ priority: 1 })
        common(_app: object) {}
    }
    class Child extends Base {
        @OnBoot({ priority: 2 })
        extra(_app: object) {}
    }
    new Base()
    new Child()

    // Constructing a Child runs Base's constructor, so both initialisers fire
    // with `this.constructor === Child`. Inheritance is preserved; only the
    // leak upward is fixed.
    assertEquals(
        getBootHooks(Child).map((h) => h.method).sort(),
        ['common', 'extra'],
    )
})

Deno.test('OnBoot - parent and child hold distinct arrays', () => {
    class Base {
        @OnBoot({ priority: 1 })
        common(_app: object) {}
    }
    class Child extends Base {
        @OnBoot({ priority: 2 })
        extra(_app: object) {}
    }
    new Base()
    new Child()

    assertEquals(
        getBootHooks(Base) === getBootHooks(Child),
        false,
        'sharing one array is what allowed the leak',
    )
})
