# `@lockness/realtime` — agent brief

Real-time WebSockets + broadcasting. A handler over Hono's `upgradeWebSocket`
with lifecycle hooks and a server-derived identity; public/private/presence
channels with an app authorizer; a memory/Redis broadcast driver; a JSON wire
protocol; a soft `@lockness/events` → broadcast bridge. The broadcaster
satisfies `@lockness/notification`'s `BroadcasterLike`.

## Invariants

- **The dependency contract below is binding.** Importing anything outside it
  fails `deno task deps:analyze`.
- **`upgradeWebSocket` comes only from `@lockness/hono/deno`**, imported once in
  `websocket.ts` (the main barrel exposes WS types only; hard rule #1).
  `WSContext` is `import type` from `@lockness/hono/network` (an allowed edge,
  no mirror).
- **`@lockness/events` is a SOFT edge** — the events→broadcast bridge soft-loads
  it and types the dispatcher/event shapes with **local structural interfaces**.
  An `import`/`import type` from `@lockness/events` hardens the edge and fails
  the gate.
- **Connection identity is server-derived at the upgrade** (verified session /
  token), immutable, distinct from `metadata`; a wire frame is never an identity
  source (S1).
- **Origin is checked fail-closed** — exact origin triple, absent/empty/`null`
  rejected, no substring/implicit wildcard (CSWSH, S5).
- **A private/presence channel event reaches a connection only after the
  authorizer approved it** (S1 disclosure control); a Redis-received message is
  re-authorized on the receiving instance (S6).
- **The events bridge forwards only `broadcastWith()`** — minimal default, never
  the whole event (leak-by-default, S2).
- **No `any` in exported signatures; JSDoc on every export; no direct `hono`.**

## Dependency contract

<!-- generated:deps -->

| Direction                                      | Packages                                 |
| :--------------------------------------------- | :--------------------------------------- |
| Imports (static)                               | `hono`                                   |
| Imports (soft, via `tryImportOptionalPackage`) | `events`                                 |
| Imported by                                    | —                                        |
| **Must never import**                          | nothing — no package depends on this one |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                       |
| :-------- | :------------------------------------------------------------------------------------------------------------ |
| class     | `WSContext`                                                                                                   |
| function  | `buildEvents`, `checkOrigin`, `createWebSocketHandler`, `makeConnection`, `originOf`, `resolveAllowedOrigins` |
| interface | `AllowedOrigins`, `Connection`, `Socket`, `WebSocketHandlerOptions`, `WebSocketHooks`                         |
| typeAlias | `WSMessageReceive`                                                                                            |

Anything not listed is internal and free to change.

<!-- /generated:surface -->

## Where to work

| Task                                                             | File                                     |
| :--------------------------------------------------------------- | :--------------------------------------- |
| The WS handler + `Connection` + origin/identity guards           | `websocket.ts`, `types.ts`               |
| Channels (public/private/presence) + authorizer + presence       | `channel.ts`                             |
| Subscribe/broadcast/eviction + the `BroadcasterLike` broadcaster | `manager.ts`                             |
| The broadcast driver seam (memory/Redis)                         | `driver.ts`, `drivers/{memory,redis}.ts` |
| The wire protocol + name validation                              | `protocol.ts`                            |
| The events→broadcast bridge + marker                             | `events_bridge.ts`, `broadcastable.ts`   |
| The optional browser client                                      | `client.ts` (leaf, `./client` subpath)   |

## Pitfalls

- Presence membership is **single-process authoritative** for the MVP (Redis
  fans join/leave notifications; the `here` set is per-instance). Full
  cross-process presence is a scoped follow-up.
- Nothing imports `realtime` (pure sink), and `@lockness/core` is untouched
  (app-wired) — keep it that way.
- `@lockness/notification` is a **dev/test dependency only** (the SC-005
  `BroadcasterLike` conformance test); never import it from source.

## Tests

<!-- generated:tests -->

3 test files for 3 source files:

- `packages/realtime/tests/identity.test.ts`
- `packages/realtime/tests/origin.test.ts`
- `packages/realtime/tests/websocket.test.ts`

<!-- /generated:tests -->

## Before you call it done

<!-- generated:gate -->

The framework-wide gate, from the repository root:

```bash
deno fmt && deno lint && deno check && deno task test
deno task deps:analyze     # cycles, declaration drift, tier policy
deno task agents:brief     # refresh this file's generated blocks
```

Then, specific to this package: run its 3 test files directly —

```bash
deno test -A packages/realtime/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface, tests and closing gate are generated by
`deno task agents:brief` from the code itself — fix the code, not those blocks.
Everything else is hand-written and preserved._
