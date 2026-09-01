/**
 * @fileoverview The disposables registry — where a package announces a resource
 * that must be released, without importing `@lockness/core`.
 *
 * **Why here.** A package that holds an OS resource (a Deno KV handle, a TCP
 * connection, an armed interval) needs to tell the framework about it. Importing
 * `@lockness/core` to do so would close a cycle for every one of them. This
 * package imports **nothing**, so an edge to it can never close a cycle whatever
 * else the graph does — which is the same property that made it the home for
 * `safeForLog`.
 *
 * It is not a departure from `contract`'s role, either: `routing/decorators.ts`
 * already exports `declaredMiddlewares`, a mutable module-level `Map` written by
 * a decorator and read by `http/compose.ts`. The invariant this package actually
 * carries is narrower — *every `@lockness/*` import must be `import type`* — and
 * a module with no imports at all does not breach it.
 *
 * **What this module deliberately does NOT do.**
 *
 * - It never calls `dispose()`. {@link drainDisposables} hands the list back and
 *   the caller runs it. That keeps the *failure policy* — a hook that throws
 *   must not strand the ones behind it — in `@lockness/core`, which already owns
 *   it and already has the error renderer. A `try/catch` here would be a second
 *   spelling of that rule, in a package that cannot reach the renderer.
 * - It never touches `Deno`, never logs, and never asks whether core is present.
 *   A library used standalone must not complain about a framework that is not
 *   there.
 *
 * @module @lockness/contract/lifecycle/disposables
 * @since 0.2.1
 */

/**
 * Something holding a resource that must be released.
 *
 * @example
 * ```typescript
 * registerDisposable({
 *     name: 'cache:deno-kv',
 *     dispose: () => driver.close(),
 *     priority: 60,
 * })
 * ```
 */
export interface Disposable {
    /**
     * A label for logs, and **nothing else**.
     *
     * It carries no semantics: it is not an identity, not a key, and not unique.
     * Names collide by design — one channel per room, one worker per queue set.
     * Anything that needs to tell two disposables apart uses the handle from
     * {@link registerDisposable}.
     *
     * It may be attacker-influenced — an SSE channel is commonly named from a
     * request path segment — so whoever writes it to a log encodes it first.
     */
    readonly name: string

    /** Release the resource. Sync or async; the caller awaits it. */
    dispose(): void | Promise<void>

    /**
     * Where this sits in the teardown order. **Lower runs first.**
     *
     * Use one of `@lockness/core`'s `SHUTDOWN_PRIORITY` constants when core is
     * present. Omitted, it sorts with the stores, which is the safe default:
     * a store closed too early loses the work still draining into it.
     *
     * @default 60
     */
    readonly priority?: number
}

/**
 * An opaque receipt for one registration.
 *
 * Deregistration takes **this**, never a name. If it took a name, any module
 * could cancel any other module's teardown by registering a colliding one —
 * a cross-package integrity hole needing no attacker at all.
 */
export interface DisposableHandle {
    /** @internal */
    readonly _disposable: Disposable
}

/**
 * The live set. A `Set`, so identity is the object and registering the same one
 * twice disposes it once — without the name ever being consulted.
 */
const disposables = new Set<Disposable>()

/**
 * Announce a resource that must be released at shutdown.
 *
 * Safe to call with no framework present: it records and returns, touching
 * nothing else.
 *
 * @param disposable - What to release, and where in the order.
 * @returns A handle to pass to {@link deregisterDisposable}.
 *
 * @example
 * ```typescript
 * const handle = registerDisposable({ name: 'queue:kv', dispose: () => kv.close() })
 * ```
 */
export function registerDisposable(disposable: Disposable): DisposableHandle {
    disposables.add(disposable)
    return { _disposable: disposable }
}

/**
 * Withdraw a registration, because the resource was released already.
 *
 * **Not optional in practice.** The registry holds a strong reference, so a
 * long-lived process that opens and closes many resources — an SSE application
 * creating a channel per room is the shape that bites — grows without bound
 * unless each one withdraws on close.
 *
 * Calling it twice, or after a drain, is harmless.
 *
 * @param handle - The receipt from {@link registerDisposable}.
 *
 * @example
 * ```typescript
 * channel.onClose(() => deregisterDisposable(handle))
 * ```
 */
export function deregisterDisposable(handle: DisposableHandle): void {
    disposables.delete(handle._disposable)
}

/**
 * Take everything currently registered, in the order it should be released.
 *
 * **Takes and clears.** The registry is empty afterwards, so a later
 * registration still works and a second drain returns nothing. That is the one
 * place this differs from `@lockness/core`'s `ShutdownRegistry`, which refuses
 * registration permanently once it has run — correct for a per-`App` registry,
 * and wrong here: this one is process-wide, a process can host more than one
 * `App` (every test file that boots two does), and a permanent freeze would make
 * every registration after the first shutdown a silent no-op.
 *
 * **It does not dispose anything.** The caller runs them, so the failure policy
 * and the error rendering stay in one place — see the module note.
 *
 * @returns The disposables, in no particular order — the caller sorts. A fresh
 * array.
 *
 * @example
 * ```typescript
 * for (const d of drainDisposables()) {
 *     try { await d.dispose() } catch (error) { report(d.name, error) }
 * }
 * ```
 */
export function drainDisposables(): readonly Disposable[] {
    // Deliberately UNSORTED. Ordering has one home — `@lockness/core`'s
    // `ShutdownRegistry` comparator — and core re-sorts after adopting these,
    // so a comparator here would be a second spelling of that rule. Two
    // comparators only agree until one of them changes.
    const taken = [...disposables]
    disposables.clear()
    return taken
}

/**
 * How many resources are currently announced.
 *
 * For tests and diagnostics: the bound that proves deregistration works is
 * "this returns to zero", and a test can only assert that if it can read it.
 *
 * @returns The count.
 *
 * @example
 * ```typescript
 * assertEquals(disposableCount(), 0, 'every channel deregistered on close')
 * ```
 */
export function disposableCount(): number {
    return disposables.size
}
