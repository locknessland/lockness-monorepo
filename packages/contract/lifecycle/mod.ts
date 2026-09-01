/**
 * @fileoverview The disposables registry's **public** surface.
 *
 * `packages/contract/mod.ts` re-exports this with `export *`, so everything
 * named here becomes public API on a published package — removable afterwards
 * only with a major version bump.
 *
 * **`drainDisposables` is deliberately absent.** It is a process-wide
 * "release every resource now" capability, and published on the one package
 * every consumer imports it would be callable from any controller, any devtools
 * route, any copied example — tearing down every cache driver, worker and
 * channel in the process while the server keeps serving. `@lockness/core`
 * reaches it through the explicit `@lockness/contract/lifecycle/internal`
 * entry point instead.
 *
 * @module @lockness/contract/lifecycle
 * @since 0.2.1
 */

export {
    deregisterDisposable,
    type Disposable,
    disposableCount,
    type DisposableHandle,
    registerDisposable,
} from './disposables.ts'
