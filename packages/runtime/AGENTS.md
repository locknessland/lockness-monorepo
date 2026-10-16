# `@lockness/runtime` — agent brief

The single home of what differs between Deno, Bun and Node (plan 274 §5,
"Runtime layer"): the one runtime detector (`runtime.ts`, FR-002), the argv that
runs a script or an npm bin on a runtime (`process.ts`, audits A6 and S12), and
the shutdown-signal primitive (`signals.ts`, audit A12). `http.ts` (serve,
static files, conninfo, WebSocket upgrade) joins it in T022.

User-facing documentation: [README.md](README.md). This brief does not repeat
it.

## Invariants

- **Exactly one runtime detector: `detectRuntime` in `runtime.ts`.** Every other
  framework file asks `currentRuntime()`. A `'Deno' in globalThis`, a
  `globalThis.Bun`, Hono's `getRuntimeKey()` or a runtime-keyed conditional
  export anywhere else is a second detector, and is refused in review.
- **The detector reads `process.versions`, never a runtime global.** Deno
  reports `deno` and Bun `bun`, and both also report `node`, so the order is
  Deno, then Bun, then Node. This keeps the whole package free of the `Deno`
  identifier: it is under `lockness-runtime/no-deno` (its `engines` names bun
  and node) and needs no `EXEMPT_FILES` entry. Keep it that way: Deno-only
  behaviour belongs to the caller, reached by asking the detector.
- **Bun below `BUN_FLOOR` (1.4.0) is refused, not answered.** Bun < 1.3.10
  silently ignores TC39 decorators (F12) and < 1.4.0 lacks `node:test` subtests
  and `node:sqlite` (F4, F10). Lowering the floor needs the plan amended first.
- **`runtime` never imports `@lockness/contract`**, nor any other `@lockness/*`
  package except `hono` (for `http.ts`). `contract` imports the detector subpath
  `@lockness/runtime/runtime` — a recorded exception to contract's type-only
  rule (plan 274 §7) — so a `runtime → contract` edge closes a cycle.
  `runtime.ts` itself imports nothing but `node:process`.
- **No shell, ever.** An `Invocation` is a command plus an argv array for
  `spawn(command, args)`; nothing here joins it into a string, and bins run as
  their JS entry under the runtime's executable, never through `.bin` shims or
  `.cmd` files.
- **The argv rules live in `process.ts` only**: `run`, `-A`, `--watch`, the Node
  transform `--import`, the `execArgv` allowlist. Spelling any of them in core,
  drizzle, cli, the toolchain table or a launcher stub duplicates this home.
- **The `execArgv` allowlist is an allowlist.** Only `--import` of
  `@lockness/transform/register`, `--conditions` / `-C` and
  `--enable-source-maps` are carried, and only to a Node child of a Node parent.
  Adding a flag widens what a child inherits; `--inspect*` must stay out.
- **`signals.ts` is mechanism only.** Which signals mean shutdown, the
  second-signal exit and the exit code stay in `core/kernel/signals.ts`; queue's
  worker decides its own. The `lockness-exit/signal-subscription` lint reports
  `process.on('SIG…')` anywhere else in package code.

## Dependency contract

<!-- generated:deps -->

| Direction                                 | Packages                                 |
| :---------------------------------------- | :--------------------------------------- |
| Imports (static)                          | —                                        |
| Imports (soft, loaded at runtime by name) | —                                        |
| Imported by                               | —                                        |
| **Must never import**                     | nothing — no package depends on this one |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
an optional peer in this package's `package.json`, never a dependency: the
consuming application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                |
| :-------- | :--------------------------------------------------------------------------------------------------------------------- |
| class     | `BinResolutionError`, `UnsupportedRuntimeError`                                                                        |
| function  | `binInvocation`, `carriedExecArgv`, `detectRuntime`, `onSignal`, `resolveBinEntry`, `runtimeProbe`, `scriptInvocation` |
| interface | `HostProcess`, `Invocation`, `InvocationOptions`, `RuntimeVersions`, `ScriptOptions`, `SignalTarget`                   |
| typeAlias | `RuntimeId`, `ShutdownSignal`                                                                                          |
| variable  | `BUN_FLOOR`, `TRANSFORM_HOOK`, `currentRuntime`                                                                        |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Intent                                            | File         |
| :------------------------------------------------ | :----------- |
| Change how the runtime is detected, or the floor  | `runtime.ts` |
| Change an argv, the allowlist or bin resolution   | `process.ts` |
| Change how a signal is subscribed or unsubscribed | `signals.ts` |
| Change what the root entry re-exports             | `mod.ts`     |

## Pitfalls

- **Bun 1.3.x fails three rows locally, by design.** `currentRuntime()` refuses
  it, so the two live detector rows and the live spawn row throw
  `UnsupportedRuntimeError`. CI's Bun lane runs the `.bun-version` pin (1.4.x),
  where the whole suite passes. (2026-10-16)
- **Deno's `process.execArgv` is empty**, and Deno flags are not Node flags, so
  nothing is carried to a Deno child; `allowAll` is the only Deno permission
  spelling so far. Granular `--allow-*` lists are not modelled yet: add them
  here when a caller needs them. (2026-10-16)
- **The live signal row sends `SIGHUP` to the test process**, not `SIGINT`:
  `deno test` traps `SIGINT` itself to report pending tests. If the listener
  were not installed, the row would kill the runner rather than fail. POSIX
  only. (2026-10-16)

## Tests

<!-- generated:tests -->

3 test files for 4 source files:

- `packages/runtime/tests/process.test.ts`
- `packages/runtime/tests/runtime.test.ts`
- `packages/runtime/tests/signals.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno task gate             # the full gate, as the pre-push hook runs it
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 3 test files directly —

```bash
deno test -A packages/runtime/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface, tests and closing gate are generated by
`deno task agents:brief` from the code itself — fix the code, not those blocks.
Everything else is hand-written and preserved._
