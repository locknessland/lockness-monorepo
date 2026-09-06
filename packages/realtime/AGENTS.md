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
| Imports (static)                               | `contract`, `hono`, `redis`              |
| Imports (soft, via `tryImportOptionalPackage`) | `events`                                 |
| Imported by                                    | —                                        |
| **Must never import**                          | nothing — no package depends on this one |

Enforced by `deno task deps:analyze` against `deps.policy.jsonc`. A soft edge is
deliberately **not** declared in this package's `deno.json`: the consuming
application installs it, or the feature stays off.

<!-- /generated:deps -->

## Public surface

<!-- generated:surface -->

| Kind      | Exports                                                                                                                                                                                                                                                                                                                                                                                              |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class     | `ChannelManager`, `MemoryBroadcastDriver`, `ProtocolError`, `RedisBroadcastDriver`, `WSContext`                                                                                                                                                                                                                                                                                                      |
| function  | `channelKind`, `createWebSocketHandler`, `decodeClientMessage`, `encodeServerMessage`, `forwardEvent`, `isBroadcastable`, `isValidName`, `startBroadcasting`                                                                                                                                                                                                                                         |
| interface | `AnyEventPayload`, `BroadcastBridgeOptions`, `BroadcastDriver`, `BroadcastMessage`, `Broadcastable`, `ChannelManagerOptions`, `Connection`, `ControlMessage`, `DispatcherLike`, `PresenceCapableDriver`, `PresenceMember`, `RealtimeControlConfig`, `RedisBroadcastDriverOptions`, `RedisCommandClient`, `RedisSubscriber`, `Socket`, `SubscribeResult`, `WebSocketHandlerOptions`, `WebSocketHooks` |
| typeAlias | `AuthorizeResult`, `Authorizer`, `ChannelKind`, `ClientMessage`, `OutboundFrame`, `RedisBroadcastConnectionConfig`, `ServerMessage`, `WSMessageReceive`                                                                                                                                                                                                                                              |
| variable  | `MAX_FRAME_BYTES`, `MAX_NAME_LENGTH`                                                                                                                                                                                                                                                                                                                                                                 |

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

- **A containment check must never consult `keys()`.** `live_realtime.ts`'s
  `keys()` is a verbatim second copy of the driver's nine name templates. It is
  correct for _read-back_ — asserting a key holds what you put there — and wrong
  for _containment_, because a check that reads it asserts agreement between two
  models rather than anchoring. `tests/prefix_anchoring.test.ts` observes the
  ports instead, and decides which strings are prefix-derived differentially, by
  running the same exercise under two prefixes.
- **Containment cannot be checked with a keyspace scan.**
  `SCAN MATCH ${prefix}*` returns only keys already under the prefix, so it
  cannot see the defect. A whole-keyspace diff is no better: five of the ten
  derived names never become a key at all — two are `PUBLISH`/`PSUBSCRIBE`
  arguments, one is the subscribe pattern, and two are read-only by design. Only
  the port sees all ten.
- **"Anchored" is prefix PLUS a separator, and since #288 that separator always
  begins with `__`.** `startsWith` was never enough — `${prefix}:*` "begins
  with" the prefix and still over-matched into a nested deployment, which was a
  real, reproduced disclosure. It is closed: every derived name sits behind a
  `__`-leading separator and no accepted prefix may contain `__`, so the two
  halves are one decision. **Adding a separator that does not begin with `__`
  reopens it and passes every test in the suite** — the rule lives at
  `RESERVED_SEPARATOR_LEAD` with its proof, not here.
- **Release ordering: #288's wire change must land in or before the FIRST
  release that publishes `@lockness/realtime`.** It had never been published
  when the change landed (JSR 404, 2026-09-06) and is imported by no other
  package, which is why it carries no compatibility shim. That is a fact about a
  moment, not a property: this repo versions in lockstep, so the next `/ship`
  publishes the package. If a release goes out ahead of this change, the shim
  question reopens and a dual-publish path has to be designed.
- **`prefix` bounds OUTBOUND routing; it is not an inbound boundary.** Inbound:
  anything on the broker can `PUBLISH` into — and read from — this deployment's
  topics and keys; that is a Redis-ACL problem. Outbound: structural, per the
  point above. The `RedisBroadcastDriverOptions.prefix` docstring is the single
  home for the statement; everything else points at it. It used to say
  "multi-tenant isolation", which is the wording that led operators to the
  nested prefixes #288 was about.

- **The test double used to answer `nil` to any command it did not model**,
  which made an unmodelled command a silent no-op with a green suite. It now
  throws (`tests/fake_redis.ts`). If you add a driver command, model it — the
  failure will tell you. Both #276 plan audits named this independently as the
  likeliest way that feature could have shipped broken. 2026-09-05.
- **Revocation liveness is decided by Redis, never by `Date.now()`.** The score
  in `{prefix}:revocations` is compared against a `TIME` read inside the script.
  A stored expiry judged against an instance's clock would let a fast-clocked
  host delete revocations that are live for the whole fleet (#276). 2026-09-05.
- Presence membership is **single-process authoritative** for the MVP (Redis
  fans join/leave notifications; the `here` set is per-instance). Full
  cross-process presence is a scoped follow-up.
- Nothing imports `realtime` (pure sink), and `@lockness/core` is untouched
  (app-wired) — keep it that way.
- `@lockness/notification` is a **dev/test dependency only** (the SC-005
  `BroadcasterLike` conformance test); never import it from source.

## Tests

<!-- generated:tests -->

33 test files for 19 source files:

- `packages/realtime/tests/broadcaster.test.ts`
- `packages/realtime/tests/channels.test.ts`
- `packages/realtime/tests/client.test.ts`
- `packages/realtime/tests/connection_id_charset.test.ts`
- `packages/realtime/tests/control_auth.test.ts`
- `packages/realtime/tests/control_mac_coverage.test.ts`
- `packages/realtime/tests/control_plane.test.ts`
- `packages/realtime/tests/control_replay.test.ts`
- `packages/realtime/tests/control_replay_window.test.ts`
- `packages/realtime/tests/deliver_local_reauth.test.ts`
- `packages/realtime/tests/disconnect_propagation.test.ts`
- `packages/realtime/tests/driver_contract.test.ts`
- `packages/realtime/tests/driver_redis.test.ts`
- `packages/realtime/tests/driver_redis_live.test.ts`
- `packages/realtime/tests/events_bridge.test.ts`
- `packages/realtime/tests/eviction_control.test.ts`
- `packages/realtime/tests/eviction_durable.test.ts`
- `packages/realtime/tests/eviction_reconnect.test.ts`
- `packages/realtime/tests/handler.test.ts`
- `packages/realtime/tests/identity.test.ts`
- `packages/realtime/tests/log_encoding_291.test.ts`
- `packages/realtime/tests/manager.test.ts`
- `packages/realtime/tests/memory_driver.test.ts`
- `packages/realtime/tests/origin.test.ts`
- `packages/realtime/tests/prefix_anchoring.test.ts`
- `packages/realtime/tests/presence.test.ts`
- `packages/realtime/tests/presence_authoritative.test.ts`
- `packages/realtime/tests/presence_roster_guard.test.ts`
- `packages/realtime/tests/presence_sweep.test.ts`
- `packages/realtime/tests/protocol.test.ts`
- `packages/realtime/tests/redis_broker_integration.test.ts`
- `packages/realtime/tests/revocation_atomicity.test.ts`
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

Then, specific to this package: run its 33 test files directly —

```bash
deno test -A packages/realtime/
```

<!-- /generated:gate -->

---

_Framework-wide rules live in the root [AGENTS.md](../../AGENTS.md). The
dependency contract, public surface, tests and closing gate are generated by
`deno task agents:brief` from the code itself — fix the code, not those blocks.
Everything else is hand-written and preserved._
