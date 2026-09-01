/**
 * @fileoverview Shutdown lifecycle decorator — `@OnShutdown`.
 *
 * Its own module rather than an addition to `./decorators.ts`, whose
 * `@fileoverview` scopes that file to boot. Appending here would roughly double
 * it and give it a second reason to change; `kernel_decorators.ts` is the
 * package's own precedent for splitting a decorator out.
 *
 * **The relationship to `@OnBoot` is a mirror, not a copy.** Boot runs highest
 * priority first; shutdown runs lowest first. So `@OnBoot({ priority: 100 })
 * connectDatabase` pairs with `@OnShutdown({ priority: 100 }) closeDatabase`
 * and the database is the last thing released — the reader picks one number per
 * resource and gets the right order at both ends.
 *
 * There is deliberately **no `runShutdownHooks`** here to match
 * `boot_runner.ts`'s `runBootHooks`. Exactly one thing runs teardown —
 * `App.shutdown()` — because it is the only thing that can also stop the HTTP
 * server, honour the deadline and dedupe concurrent callers. A second public
 * runner would do none of those while looking like it did.
 *
 * @module @lockness/core/kernel/shutdown_decorators
 * @since 0.2.1
 */

/**
 * A shutdown hook method.
 *
 * Receives nothing. A boot hook takes the `App` because it configures it; a
 * teardown hook releases what its own class holds, and handing it a
 * half-dismantled `App` would invite it to keep using one.
 */
export type ShutdownHookMethod = () => void | Promise<void>

/**
 * What is recorded about one `@OnShutdown` method.
 *
 * Mirrors `BootHookMeta` field for field, so anything that can display one can
 * display the other.
 */
export interface ShutdownHookMeta {
    /** Name of the decorated method. */
    readonly method: string
    /** Execution priority. **Lower runs first** — the inverse of `@OnBoot`. */
    readonly priority: number
}

/**
 * Symbol under which a kernel class stores its shutdown hooks.
 *
 * @internal
 */
export const KERNEL_SHUTDOWN_HOOKS: unique symbol = Symbol(
    'kernel:shutdownHooks',
)

/**
 * A class that may carry shutdown hooks.
 */
export interface ShutdownHooksContainer {
    [KERNEL_SHUTDOWN_HOOKS]?: ShutdownHookMeta[]
}

/** A kernel class constructor that may carry shutdown hooks. */
type ShutdownKernelConstructor<T = object> =
    & (new (...args: never[]) => T)
    & ShutdownHooksContainer

/**
 * Configuration for {@link OnShutdown}.
 */
export interface OnShutdownOptions {
    /**
     * Execution priority. **Lower values run first**, which is the exact
     * inverse of `@OnBoot`, so the same number means "same resource" at both
     * ends of the process's life.
     *
     * @default 0
     *
     * @remarks
     * The bands are `@OnBoot`'s, read in reverse:
     *
     * | Range  | Runs | Use case                                        |
     * |--------|------|-------------------------------------------------|
     * | 0-19   | 1st  | Final notifications, metrics flush              |
     * | 20-49  | 2nd  | Service teardown — workers, listeners           |
     * | 50-99  | 3rd  | Caches, queues                                  |
     * | 100+   | last | Databases, connection pools                     |
     *
     * User hooks tear down before the framework yanks the infrastructure they
     * depend on, which is why the low numbers go first.
     */
    priority?: number
}

/**
 * Mark a kernel method to run during shutdown.
 *
 * Collected at instantiation and executed in **ascending** priority order by
 * `App.shutdown()`, after the HTTP server has stopped accepting.
 *
 * Uses TC39 Stage 3 decorators, natively supported by Deno 2+.
 *
 * @param options - Priority for this hook.
 * @returns A method decorator.
 *
 * @throws {Error} If applied to anything that is not a method.
 *
 * @see {@link getShutdownHooks} - Read the registered hooks.
 * @since 0.2.1
 *
 * @example Pairing with the boot hook that opened the resource
 * ```typescript
 * import { OnBoot, OnShutdown, type App } from '@lockness/core'
 *
 * class AppKernel {
 *     @OnBoot({ priority: 100 })
 *     async connectDatabase(app: App) {
 *         await db.connect(Deno.env.get('DATABASE_URL')!)
 *     }
 *
 *     // Same number, opposite end: the database closes LAST.
 *     @OnShutdown({ priority: 100 })
 *     async closeDatabase() {
 *         await db.close()
 *     }
 *
 *     // priority 0 — runs FIRST, while everything it might need is still up.
 *     @OnShutdown()
 *     async notifyOps() {
 *         await pager.info('shutting down')
 *     }
 * }
 * ```
 */
export function OnShutdown(
    options: OnShutdownOptions = {},
): <This, Args extends unknown[], Return>(
    originalMethod: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Return
    >,
) => (this: This, ...args: Args) => Return {
    return function <This, Args extends unknown[], Return>(
        originalMethod: (this: This, ...args: Args) => Return,
        context: ClassMethodDecoratorContext<
            This,
            (this: This, ...args: Args) => Return
        >,
    ): (this: This, ...args: Args) => Return {
        if (context.kind !== 'method') {
            throw new Error(
                `@OnShutdown can only decorate methods, received: ${context.kind}`,
            )
        }

        const methodName = String(context.name)
        const priority = options.priority ?? 0

        context.addInitializer(function () {
            const instance = this as object
            const constructor =
                (instance as { constructor: ShutdownHooksContainer })
                    .constructor

            // `Object.hasOwn`, NOT `if (!constructor[KERNEL_SHUTDOWN_HOOKS])`.
            //
            // The truthiness form reads through the prototype chain. When a
            // parent class already owns an array, a subclass finds it and
            // pushes into it — so the PARENT silently acquires the CHILD's
            // hooks. Measured on `@OnBoot`, which still uses that form: with
            // `new Base()` before `new Child()`, `getBootHooks(Base)` returns
            // both hooks and the two classes share one array object.
            //
            // At boot that misfires an initialiser. At shutdown it closes a
            // resource twice, or invokes a hook against a kernel that does not
            // own it — so the own-property test is not a style preference here.
            if (!Object.hasOwn(constructor, KERNEL_SHUTDOWN_HOOKS)) {
                constructor[KERNEL_SHUTDOWN_HOOKS] = []
            }

            const hooks = constructor[KERNEL_SHUTDOWN_HOOKS]!
            if (!hooks.some((h) => h.method === methodName)) {
                hooks.push({ method: methodName, priority })
            }
        })

        return originalMethod
    }
}

/**
 * Read the shutdown hooks registered on a kernel class or instance.
 *
 * Introspection only — reading never runs anything, and never resolves
 * anything. The returned array is a **copy**, so sorting or splicing it cannot
 * reorder the kernel's own registration list.
 *
 * The order is registration order, not execution order. Execution order is
 * ascending priority, and it is decided in `shutdown_registry.ts` — the single
 * home for that rule.
 *
 * @param kernelOrClass - A kernel instance or its constructor.
 * @returns A fresh array of hook metadata; empty when there are none.
 *
 * @see {@link OnShutdown}
 * @since 0.2.1
 *
 * @example
 * ```typescript
 * const hooks = getShutdownHooks(AppKernel)
 * for (const hook of hooks) {
 *     console.log(`${hook.method} (priority ${hook.priority})`)
 * }
 * ```
 */
export function getShutdownHooks<T extends object>(
    kernelOrClass: T | ShutdownKernelConstructor<T>,
): readonly ShutdownHookMeta[] {
    const constructor: ShutdownHooksContainer =
        typeof kernelOrClass === 'function'
            ? (kernelOrClass as ShutdownKernelConstructor<T>)
            : (kernelOrClass as { constructor: ShutdownHooksContainer })
                .constructor

    return [...(constructor[KERNEL_SHUTDOWN_HOOKS] ?? [])]
}
