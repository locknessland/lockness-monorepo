# `@lockness/events` — agent brief

The event system: class-based events, a dispatcher, listener discovery through
decorators, and testing helpers (`fake()`, `EventBuffer`). `@lockness/core`
registers discovered listeners into the global dispatcher during boot.

User-facing documentation: [README.md](README.md) ·
[docs/DOCS.md](docs/DOCS.md). This brief does not repeat it.

## Invariants

- **The dependency contract above is binding.** Importing anything outside it
  fails `deno task deps:analyze`, and the failure is a design question, not a
  lint to silence.

_Add the domain invariants — what must stay true inside this package, and what
breaks when it does not. A statement that could have been guessed from the file
names does not belong here._

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                                                                                                                              |
| :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports (static)                               | `contract`, `hono` _(type-only)_                                                                                                                      |
| Imports (soft, via `tryImportOptionalPackage`) | —                                                                                                                                                     |
| Imported by                                    | `auth`, `cli`, `core`, `devtools`                                                                                                                     |
| **Must never import**                          | `auth`, `auth-provider`, `cli`, `core`, `devtools`, `drizzle`, `init`, `openapi` — each already reaches this package, so importing one closes a cycle |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                    |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `BaseEvent`, `ControllerExecuting`, `EventBuffer`, `EventDispatcher`, `EventEmitter`, `ExceptionOccurred`, `KernelBooted`, `KernelTerminating`, `RequestCompleted`, `RequestStarted`, `ResponsePrepared`                                                                                                   |
| function  | `Listener`, `configureEventDispatcher`, `configureEvents`, `createEventBus`, `createEventQueue`, `debugLog`, `dispatcher`, `emit`, `emitSync`, `eventStream`, `events`, `fake`, `getActiveFake`, `getListenerMetadata`, `isDebugEnabled`, `off`, `on`, `once`, `restore`, `setEventsDebug`, `waitForEvent` |
| interface | `DebugRecord`, `EventQueue`, `ListenerConfig`, `ListenerMetadata`, `ListenerOptions`, `OverflowReport`, `StreamOptions`                                                                                                                                                                                    |
| typeAlias | `EventData`, `EventListener`, `EventMap`, `EventName`, `OverflowPolicy`                                                                                                                                                                                                                                    |
| variable  | `DEFAULT_BUFFER_SIZE`, `DEFAULT_OVERFLOW`, `MAX_BUFFER_SIZE`, `OVERFLOW_POLICIES`                                                                                                                                                                                                                          |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Concern                    | Path                   |
| -------------------------- | ---------------------- |
| Dispatch semantics         | `dispatcher.ts`        |
| `@Listener` and friends    | `decorators.ts`        |
| Listener registry          | `listener_registry.ts` |
| Framework lifecycle events | `kernel_events.ts`     |
| Test doubles               | `testing.ts`           |

## Pitfalls

- Issue #91 replaces the in-house emitter with Emittery behind an `EventEngine`
  adapter. Do not build new public surface on the current emitter internals.
- Listener priority is honoured through sorted registration order, not a heap —
  registering after dispatch has started does not re-sort.
- No public introspection API exists yet; issue #90 depends on one.

## Tests

<!-- generated:tests -->

4 test files for 9 source files:

- `packages/events/tests/class_based_events.test.ts`
- `packages/events/tests/debug.test.ts`
- `packages/events/tests/events.test.ts`
- `packages/events/tests/stream.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 4 test files directly —

```bash
deno test -A packages/events/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface and test sections are generated by
`deno task agents:brief` — edit the code, not those blocks._
