/**
 * @fileoverview `@lockness/runtime` — what differs between Deno, Bun and
 * Node, decided once.
 *
 * Three subpaths, each the single home of one decision (plan 274 §5):
 *
 * - **`@lockness/runtime/runtime`** — which runtime this process runs on
 *   ({@link currentRuntime}). The one detector: no other framework code tests
 *   the runtime itself.
 * - **`@lockness/runtime/process`** — the argv that runs a script or an npm
 *   bin on a runtime ({@link scriptInvocation}, {@link binInvocation}), for
 *   `spawn` without a shell.
 * - **`@lockness/runtime/signals`** — subscribing to a shutdown signal
 *   ({@link onSignal}).
 *
 * This barrel re-exports all three. A package that needs only the detector
 * imports `@lockness/runtime/runtime`, and `@lockness/contract` may import
 * nothing else from this package.
 *
 * @example
 * ```ts
 * import { currentRuntime, onSignal, scriptInvocation } from '@lockness/runtime'
 *
 * currentRuntime() // 'deno' | 'bun' | 'node'
 * const { command, args } = scriptInvocation('main.ts', { watch: true })
 * const off = onSignal('SIGTERM', () => server.close())
 * ```
 *
 * @module
 */

export {
    BUN_FLOOR,
    currentRuntime,
    detectRuntime,
    type RuntimeId,
    runtimeProbe,
    type RuntimeVersions,
    UnsupportedRuntimeError,
} from './runtime.ts'
export {
    binInvocation,
    BinResolutionError,
    carriedExecArgv,
    type HostProcess,
    type Invocation,
    type InvocationOptions,
    resolveBinEntry,
    scriptInvocation,
    type ScriptOptions,
    TRANSFORM_HOOK,
} from './process.ts'
export { onSignal, type ShutdownSignal, type SignalTarget } from './signals.ts'
