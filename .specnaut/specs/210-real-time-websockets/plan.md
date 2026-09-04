# Plan: Real-time (WebSockets + broadcasting)

**Branch**: `210-real-time-websockets` | **Date**: 2026-09-04 | **Backlog item**: [#210 — Real-time: WebSockets + broadcasting](https://github.com/locknessland/lockness-monorepo/issues/210) (epic; children [#211](https://github.com/locknessland/lockness-monorepo/issues/211), [#212](https://github.com/locknessland/lockness-monorepo/issues/212), [#213](https://github.com/locknessland/lockness-monorepo/issues/213))

**This is the epic's one planning document** — one decision table, one stop, covering all three children.

---

## 1. Why this exists

Competitive gap #6. Lockness ships **SSE only** (`@lockness/sse` — one-way server→client, named channels, no auth, no presence, single-process). Hono's WebSocket types are re-exported but there is **no handler, no channel/broadcast layer, no presence**. Real-time apps — chat, presence, live dashboards — need bidirectional channels with authorization and presence, fanned out across processes. Laravel Reverb/Echo, Rails ActionCable, Django Channels and Adonis Transmit all ship this; Lockness ships none. The concept is greenfield (no WebSocket call site exists anywhere in `packages/` or `app/`).

## 2. User scenarios

### US1 — Accept a WebSocket connection with lifecycle hooks (P1)

**Given** a controller (or a mounted route) that returns a WebSocket handler built from `@lockness/hono/deno`'s `upgradeWebSocket`
**When** a client connects, sends a message, or disconnects
**Then** the app's `onOpen(conn)` / `onMessage(conn, data)` / `onClose(conn)` / `onError(conn, err)` hooks fire, each receiving a typed `Connection` (a stable id, `send()`, `close()`, and metadata).

### US2 — Broadcast over authorized channels with presence (P1)

**Given** public / private / presence channels with an app-supplied authorizer, backed by a memory or Redis driver
**When** a connection subscribes to a channel and a message is broadcast to it
**Then** a **public** channel delivers to all subscribers; a **private** channel delivers only after the authorizer approves the connection for that channel; a **presence** channel additionally tracks its members and emits join/leave — and with the Redis driver a broadcast from one server process reaches subscribers connected to another.

### US3 — A defined wire protocol + broadcast dispatched events (P2)

**Given** a JSON wire protocol (subscribe / unsubscribe / event / presence / ping-pong) and an optional client helper
**When** the app dispatches a `@lockness/events` event that declares `broadcastOn()`
**Then** the event is forwarded to those channels over the protocol, and a client following the protocol receives it.

### Edge cases

- A client subscribes to a **private/presence** channel it is not authorized for → the subscription is **rejected** and no channel event ever reaches it (the core security invariant).
- A cross-site page opens a WebSocket to the app (CSWSH) → the upgrade is **refused** unless the `Origin` is allow-listed.
- A malformed / oversized wire frame → rejected with a protocol error, the connection is not crashed.
- The Redis driver is selected but not configured / not installed → fail clear (mirror queue/session), never a raw stack.
- A presence channel's member list → visible **only** to authorized members of that channel, never leaked to non-members.
- A connection drops without a clean close → its channel memberships (and presence entries) are cleaned up; other members get a leave.

## 3. Requirements

- **FR-001** (#211): A `@lockness/realtime` package provides `createWebSocketHandler(hooks)` wrapping `upgradeWebSocket` obtained from **`@lockness/hono/deno`** (the sanctioned subpath — hard rule #1; the main barrel exposes only the WS *types*). It yields a Hono handler returning the upgrade `Response`, and exposes a typed `Connection` to the `onOpen` / `onMessage` / `onClose` / `onError` hooks. The `Connection` carries: a stable transport `id`, `send(data)`, `close(code?, reason?)`, a **server-derived, immutable `identity`** (see FR-001a), and a free-form `readonly metadata`.
- **FR-001a** (#211, security S1): A connection's **identity is established at the upgrade**, from a server-verified credential (the `@lockness/session` cookie or an app-supplied token verifier passed to the handler) — **never** from any wire frame or client-influenced field. It is bound onto `Connection.identity` (a typed slot distinct from the free-form `metadata`) and is immutable thereafter. The authorizer (FR-003) and the presence registry receive **only** this server-derived identity; a `subscribe` frame carrying a user id is never treated as identity. An upgrade with no resolvable identity is allowed only for public channels; private/presence subscription without a verified identity is rejected.
- **FR-002** (#211, security S5): The upgrade validates the request `Origin` against an allow-list (CSWSH control). Matching is on the **exact origin triple (scheme+host+port)** — never substring, never implicit wildcard (a wildcard is an explicit opt-in). A **missing `Origin` header and a literal `Origin: null` are rejected by default** (fail-closed). Default-closed: with no allow-list configured, same-origin only (derived from `APP_URL`'s **origin**, not its full URL); a configured list widens it. A rejected origin returns `403`, never upgrades. Origin defends CSWSH only for ambient-cookie auth; FR-001a's upgrade-time identity is the connection authentication.
- **FR-003** (#212): A channel layer with three kinds — **public** (no auth), **private** (an app authorizer must approve `(connection.identity, channelName)`), **presence** (private + a member registry). A connection subscribes/unsubscribes; a broadcast to a channel fans out **only** to that channel's authorized subscribers. A subscription to a private/presence channel is confirmed **only after** the authorizer approves — otherwise rejected, and no event for that channel is ever delivered to that connection.
- **FR-004** (#212): A `BroadcastDriver` interface with a **memory** driver (single process) and a **Redis** driver (cross-process fan-out via Redis pub/sub), selected by config (`driver: 'memory' | 'redis'`), mirroring the queue/session dual-driver pattern (`@lockness/redis` a hard edge, injected `RedisCommandClient`; `RedisClient` lazy-connect). Redis-selected-but-unconfigured and Redis-not-reachable are fail-clear paths.
- **FR-004a** (#212, security S6): A message received over the Redis transport is delivered **only to local connections whose subscription to that channel was authorized on THIS instance** — each instance re-resolves the message through its own authorized-membership map. The transport carries `(channel, message)`, never an instruction to deliver to a connection that did not locally subscribe. The Redis driver uses a **reserved, configurable key/topic prefix** (multi-app / multi-tenant isolation) and sends channel/event names as **RESP bulk strings, never inline** (no RESP injection).
- **FR-005** (#212): The channel manager/broadcaster exposes `send(clientId, event, data): boolean` so it **satisfies `@lockness/notification`'s `BroadcasterLike`** — the real-time layer is a drop-in notifications broadcaster (per-client send, never a shared fan-to-all). Presence join/leave are emitted to the channel's members only.
- **FR-005a** (#212, security S7): The broadcaster exposes an **eviction primitive** alongside `send` — `unsubscribe(clientId, channel)` and `disconnect(clientId)` — propagated across the Redis driver so eviction reaches the owning instance. Channel authorization is **point-in-time at subscribe**; an app enforcing revocation (logout, account disable, kick) calls the eviction primitive. An evicted connection receives no further events for the channel.
- **FR-006** (#213): A JSON **wire protocol** with a fixed envelope: client→server `subscribe` / `unsubscribe` / `ping`; server→client `subscribed` / `unsubscribed` / `event` / `presence` (`here` / `joined` / `left`) / `error` / `pong`. One encode/decode home; malformed/oversized frames yield a typed protocol error, never a thrown connection crash.
- **FR-006a** (#213, security S3): Channel and event **names are validated at the wire boundary** — an allow-list charset (`[A-Za-z0-9:._-]`) and a max length — **before** they reach the manager, the Redis driver, or any other client. An out-of-charset or oversized name is a protocol error. Server-relayed names/payloads are attacker-influenced: FR-008's client and the docs state the **consumer must output-encode** them (downstream-XSS control).
- **FR-007** (#213): Broadcasting **integrates with `@lockness/events`** (soft): an event implementing a realtime-owned `Broadcastable` interface (`broadcastOn(): string[]`, optional `broadcastAs()`, optional `broadcastWith()`) is forwarded to those channels. The bridge subscribes to the global dispatcher via **soft-loaded** `@lockness/events` (`dispatcher().onAny(handler, { signal })`) — a realtime app not using events pulls nothing; an events app without `Broadcastable` is unaffected.
- **FR-007a** (#213, security S2): The bridge forwards **only** the object returned by `broadcastWith()`. When `broadcastWith()` is absent the default is a **minimal documented projection** (the event name + an empty payload) — **never** the whole event object or all public properties (no leak-by-default). Naming a **public** channel in `broadcastOn()` is an explicit, loud choice: the bridge emits a dev-mode warning, since a public channel has no authorizer and fans to every subscriber.
- **FR-007b** (#213, arch A-M5): The bridge registers its `onAny` listener with an `AbortSignal` and holds the controller; its teardown is wired to a shutdown/dispose trigger, so a re-boot (and every test) does not leak a listener onto the process-global dispatcher.
- **FR-008** (#213): An **optional**, dependency-free client helper (protocol codec + a thin `RealtimeClient` over the browser `WebSocket`) usable from a served script. It is a leaf module — importing it pulls no server code — and it output-encodes / never trusts server-relayed names (FR-006a).
- **FR-009** (security S4): Population bounds, not just per-connection: configurable **max concurrent connections (global + per-IP)** enforced at upgrade with a clean rejection; a **per-connection inbound message rate limit**; a **server-side heartbeat** that closes a connection after N missed pongs (dead/half-open socket + slow-loris); a **bounded per-connection send queue** with an explicit overflow policy (drop-or-close) so one slow consumer cannot grow server memory during a broadcast; plus the per-connection max frame size and subscription cap. A breach is a protocol error or a clean close, never a crash.
- **FR-010**: JSDoc on every export (#7); no `any` in exported signatures (#3). Structural typing at every soft/mirror boundary: the **soft-loaded `@lockness/events` dispatcher and event shapes are typed by local structural interfaces — the bridge takes no `import` or `import type` from `@lockness/events`** (an `import type` would harden the soft edge and fail `deps:analyze`, arch A-M1). Driver payloads are structural + `unknown`+guards at the wire boundary. `WSContext` is typed via **`import type` from `@lockness/hono/network`** (an allowed edge — `hono` ∈ `allow` — a real type, no mirror drift; arch A-M2). JSR-bare specifiers pinned in `deno.json` (#2); no direct `hono` import — `@lockness/hono` (and its `/deno`, `/network` subpaths) only (#1).

## 4. Success criteria

- **SC-001** (US1): A fake upgrade drives the handler; `onOpen`/`onMessage`/`onClose` fire with a `Connection` whose `send()` reaches the socket; an `onMessage` throw is caught and routed to `onError`, not crashing the connection.
- **SC-002** (US1, S5): Origin matching — an allow-listed exact origin upgrades; a not-listed one, a **substring-lookalike** (`app.com.evil.com` vs `app.com`), an **absent** `Origin`, and a literal **`null`** origin all return `403` and never open.
- **SC-002a** (US1, S1): A `subscribe` frame carrying a forged user id does **not** change the identity the authorizer sees — the server-derived `Connection.identity` is used; the wire field is ignored.
- **SC-003** (US2): A public broadcast reaches all subscribers; a **private** channel rejects an unauthorized subscribe and that connection receives **no** event for it (proven with a fake authorizer); an authorized one does.
- **SC-004** (US2): The Redis driver fans a broadcast published by one manager instance out to a subscriber on a **second** instance (proven with a fake RESP pub/sub), and cross-channel isolation holds; memory driver stays single-process.
- **SC-004a** (US2, S6): On the receiving instance, a local connection that is **not** an authorized subscriber of channel X receives nothing when a Redis message for X arrives (the cross-process analogue of SC-003 — the local authorizer is re-applied, never bypassed by the transport).
- **SC-005** (US2): The broadcaster satisfies `BroadcasterLike` — the test **imports the real `BroadcasterLike` from `@lockness/notification`** (a test-only edge, excluded from `deps:analyze`; `@lockness/notification` declared as a dev dependency) for a structural assignment, plus a delivery to one `clientId` that does not reach another (the notifications S1 property, re-proven here).
- **SC-005a** (US2, S7): An **evicted** connection (`unsubscribe`/`disconnect`) receives no further events for the channel.
- **SC-006** (US2/presence): A presence channel exposes its member list only to authorized members; a join and a leave (including on an unclean disconnect) are emitted to members only.
- **SC-007** (US3): A round-trip through the protocol codec (subscribe → subscribed → event) holds; a malformed/oversized frame yields a typed protocol error, not a throw. An event implementing `broadcastOn()` is forwarded to those channels (fake dispatcher); one without it is not.
- **SC-007a** (US3, S2): An event whose `broadcastOn()` names a channel emits **only** `broadcastWith()` output; a field not in `broadcastWith()` is proven never to leave the server, and an absent `broadcastWith()` yields the minimal projection (no full-event serialisation).
- **SC-007b** (US3, S3): An out-of-charset or oversized channel/event name is rejected at the wire boundary before reaching the manager or driver.
- **SC-008**: Full gate green (`deno fmt && deno lint && deno check && deno task test && deno task deps:analyze && deno task agents:brief --check && deno task publish:check`).

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| The WebSocket handler abstraction (lifecycle + `Connection`) | `packages/realtime/websocket.ts` (`createWebSocketHandler`, `Connection`) | A controller calling `upgradeWebSocket` directly and re-implementing lifecycle |
| Where `upgradeWebSocket` comes from | `@lockness/hono/deno` (subpath), imported once in `websocket.ts` | A raw `hono/deno` import (hard rule #1) or importing it in a second module |
| **A connection's identity** (server-derived, immutable) | `packages/realtime/websocket.ts` — resolved at upgrade from a verified session/token into `Connection.identity` (S1) | Reading identity from a `subscribe` frame or from client-influenced `metadata` |
| The `WSContext` / driver-payload types | `WSContext` via `import type` from `@lockness/hono/network` (allowed edge, no mirror); driver payloads structural in `packages/realtime/types.ts` | Hand-mirroring `WSContext` (drift) or an `import` from `@lockness/events` (hardens the soft edge) |
| The origin (CSWSH) check | `packages/realtime/websocket.ts` (one guard on upgrade; exact origin triple, reject absent/`null`) | A per-controller origin check |
| Channel/event **name validation** | `packages/realtime/protocol.ts` (charset + max length at decode, before the manager) | A per-channel or per-driver re-check |
| The **eviction** primitive | `packages/realtime/manager.ts` (`unsubscribe(clientId, channel)` / `disconnect(clientId)`, driver-propagated) | An app forcing a close by reaching into connection internals |
| The **disconnect → teardown** seam | the `ChannelManager` owns it: its handler factory installs `onClose`/`onError` teardown (unsubscribe + presence leave); the framework guarantees cleanup, not the app | The app wiring the handler hooks into the manager by hand (orphan-state risk) |
| The **events-bridge subscription lifecycle** | `packages/realtime/events_bridge.ts` — `onAny(handler, { signal })`, controller held, torn down on shutdown/dispose | A bare `onAny(handler)` that can never detach (leaks a global-dispatcher listener) |
| Channel kinds + authorization | `packages/realtime/channel.ts` (public/private/presence + the authorize gate) | A controller deciding channel access; an authorizer re-run per broadcast instead of at subscribe |
| A connection's identity + channel authorization | the app's authorizer callback (`authorize(conn, channel)`) passed to the manager | A channel reading a session cookie directly instead of asking the authorizer |
| Subscribe / broadcast / presence bookkeeping | `packages/realtime/manager.ts` (`ChannelManager`/broadcaster) | A second membership map; a second fan-out loop |
| The broadcast driver seam (memory / Redis) | `packages/realtime/drivers/{memory,redis}.ts` behind `BroadcastDriver` (`packages/realtime/driver.ts`); selected in `manager.ts` | A channel talking to Redis directly; a second driver switch |
| The `@lockness/redis` client wiring | injected `RedisCommandClient` (mirror queue) — the composition root owns the socket | `new RedisClient()` inside a driver |
| The wire protocol (envelope + codec) | `packages/realtime/protocol.ts` (types + encode/decode) | A controller hand-rolling JSON frames; a second envelope shape |
| The events→broadcast bridge | `packages/realtime/events_bridge.ts` (soft-loads `@lockness/events`, reads `Broadcastable`) | A channel subscribing to the dispatcher itself; a `ShouldBroadcast` check in two places |
| The `Broadcastable` marker | `packages/realtime/broadcastable.ts` (`broadcastOn`/`broadcastAs`/`broadcastWith` + a type guard) | An ad-hoc "should this broadcast?" check inside the bridge |
| The optional client helper | `packages/realtime/client.ts` (leaf; protocol codec + `RealtimeClient` over browser `WebSocket`) | Duplicating the envelope shape client-side instead of importing `protocol.ts` |

## 6. Technical context

**Language/Version**: Deno / TypeScript.
**Primary Dependencies**: hard — `@lockness/contract`, `@lockness/hono` (incl. `/deno`, `/network` subpaths), `@lockness/redis`. Soft — `@lockness/events` (the broadcast bridge only).
**Storage**: none persisted; the Redis driver uses pub/sub for cross-process fan-out (no keys owned beyond channel-namespaced pub/sub topics).
**Testing**: `Deno.test`. The handler is driven by a **fake upgrade** + a fake `WSContext`; the Redis driver by a **fake RESP pub/sub** (no live socket); channels/presence by fake connections + a fake authorizer. No real WebSocket or Redis in the suite.
**Target Platform**: Deno server (Deno's `upgradeWebSocket`).
**Project Type**: framework library (new package).
**Constraints**: strict acyclic DAG; hard rules #1–#9. No cycle (nothing imports `realtime`).
**Scale/Scope**: three children; one new package (`realtime`); a soft edge to `events`; a hard edge to `redis` (dual driver) and `hono` (upgrade).

### Domain model

- **Bounded context**: bidirectional real-time messaging over authorized channels.
- **Vocabulary**: *Connection* (one live socket — id, send, close, metadata), *Channel* (public/private/presence, named), *authorizer* (the app callback gating a connection for a channel), *presence member* (an authorized connection's public identity on a presence channel), *BroadcastDriver* (memory/Redis fan-out), *envelope* (a protocol frame), *Broadcastable* (an event that names the channels it broadcasts on).
- **Entities**: none persisted.
- **Value objects**: a channel name, a protocol envelope, a presence member payload, a broadcast message.
- **Invariants**: a private/presence channel event reaches a connection **only** after the authorizer approved it; a broadcast reaches only that channel's subscribers; presence membership is visible only to that channel's members; the upgrade opens only for an allow-listed origin; one connection's failure never crashes another; the abstraction imports no backing package statically except the sanctioned hono subpath + redis.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| #1 no direct hono | pass | `upgradeWebSocket`/`WSContext` via `@lockness/hono/deno` + `/network`, never raw `hono` |
| #2 JSR-only, per-package | pass | hard deps declared+pinned; events soft (deps.policy only) |
| #3 no `any` | pass | wire payloads `unknown` + guards; `WSContext`/driver typed structurally |
| #4 Tailwind | pass (N/A) | no UI (the client helper is plain DOM `WebSocket`) |
| #5 gate | pass | full gate per child |
| #6 deno.lock | pass | regenerated by deno |
| #7 JSDoc | pass | FR-010 |
| #8 MVC | pass | realtime is infrastructure; channels/drivers are adapters; controllers stay thin (return the handler) |
| #9 commits | pass | one per child + `chore(deps)` for the package + edges |
| DDD | pass | pure transport/broadcast abstraction; drivers + authorizer are the ports |
| Domain Model gate | pass | §6 |

### Complexity tracking

No accepted violations. The Redis hard edge is deliberate (mirrors queue/session — the proven dual-driver template; `RedisClient` is lazy-connect so it costs nothing until the Redis driver is selected). The events edge is soft (the bridge is opt-in), consistent with the framework's soft-load direction.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/realtime` (NEW, implementation) | yes | `createWebSocketHandler`, `Connection`, channel kinds + authorizer, `ChannelManager`/broadcaster, `BroadcastDriver` + memory/Redis, `protocol`, `Broadcastable` + events bridge, optional `client` |
| `deps.policy.jsonc` | yes | new `realtime` entry (hard: contract, hono, redis; soft: events) — a `chore(deps)` commit |
| Root `deno.jsonc` | yes | workspace member added |
| `@lockness/core` | **no (Q2 → app-wired)** | Untouched — realtime stays a pure sink; the app defines the WS route and wires the manager + bridge. (A core auto-boot step is a possible future ergonomics follow-up: `steps/realtime.ts` + `core.soft += realtime`.) |
| `@lockness/hono` | no | reuses the existing `/deno` `upgradeWebSocket` + `/network` `WSContext`; unchanged |
| `@lockness/notification` | no | its `BroadcasterLike` is satisfied by the new broadcaster; no code change |
| `@lockness/sse` | no | untouched — a separate one-way transport; realtime does not extend it |
| Docs | yes | a real-time doc + the broadcaster/notification wiring note |

### Documentation (this feature)

```text
.specnaut/specs/210-real-time-websockets/
├── plan.md
└── tasks.md
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| CSWSH — a cross-site page opening a socket | FR-002: origin allow-list, default same-origin; `403` on mismatch, proven by SC-002 |
| A private/presence channel leaks to an unauthorized connection | FR-003: authorize **at subscribe**, before any event; SC-003 proves rejection + no delivery; the authorize gate is one home (§5) |
| Presence member data leaks to non-members | FR-005/SC-006: presence payloads scoped to authorized members only |
| Cross-process fan-out silently single-process | FR-004: the Redis driver uses pub/sub; SC-004 proves a second-instance subscriber receives it |
| Redis hard edge bloats a memory-only app | `RedisClient` is lazy-connect (queue/session precedent) — zero cost until the Redis driver is selected; the memory driver needs no socket |
| Typing `WSContext`/wire frames invites `any` | structural interfaces for `WSContext` (`send`/`close`) and driver payloads; `unknown` + guards at decode (#3) |
| Resource exhaustion — the upgrade is unauthenticated at connect time, so the **connection population** is the exposure, not just one connection (S4) | FR-009: max concurrent connections (global + per-IP) at upgrade, inbound rate limit, heartbeat that closes on missed pongs, bounded send queue — **plus** the per-connection frame/subscription caps. An edge proxy can add caps but a Deno server is often exposed directly, so the framework enforces them |
| Connection identity spoofed over the wire (impersonation on private/presence) (S1) | FR-001a: identity resolved at upgrade from a verified session/token into an immutable `Connection.identity`; wire frames never treated as identity; SC-002a proves a forged id is ignored |
| The events bridge fans sensitive data onto a public channel by misconfiguration (S2) | FR-007a: forward only `broadcastWith()`, minimal default projection (never the full event), dev-mode warning when `broadcastOn()` names a public channel; SC-007a proves a non-`broadcastWith` field never leaves |
| Cross-process presence "here" list needs shared state a pub/sub-only driver cannot hold (arch A-M3) | **MVP scope: presence membership is single-process authoritative** — the Redis driver fans join/leave *notifications* cross-process, but the authoritative `here` set is per-instance. Full cross-process presence (a Redis-owned member set + `BroadcastDriver` presence-state ops) is a scoped follow-up (§12 Q3) |
| An unclean disconnect orphans channel/presence state | FR-003/SC-006: `onClose` (and transport error) unsubscribes the connection and emits presence leave |
| The events bridge forces `@lockness/events` on every realtime app | FR-007: events is **soft-loaded**; no `Broadcastable`, no forwarding; a non-events app pulls nothing |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed. Verdict: **fail** — 0 critical, 1 HIGH, 6 MEDIUM, 1 LOW. What passed was checked and sound: the new-package choice (vs extending `sse`), the redis-hard / events-soft split (consistent with queue/session/notification/core.soft), the `BroadcasterLike` seam direction (notification owns the port; realtime satisfies it structurally with **no edge**), and no cycle under either activation option (soft edges excluded from cycle detection).*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 | **HIGH** — the activation / composition-root home was unstated, and §8 omitted the `@lockness/core` edit an auto-boot step would imply | **Raised as Q2** (the genuine fork) + §8 gained a `@lockness/core` row spelling both paths. Recommended: app-wired (realtime stays a pure sink; the app already defines the WS route, so it is the natural composition root); a core step is the alternative, and if chosen adds `steps/realtime.ts` + `core.soft += realtime` |
| A-M1 | MED — the events soft edge can be silently hardened by an `import type { Dispatcher, BaseEvent }` (which `deps:analyze` counts as a static edge not in `allow`) | **Plan changed.** FR-010: the bridge types the dispatcher/event shapes with **local structural interfaces**, taking no `import`/`import type` from `@lockness/events`; the `Broadcastable` marker is realtime-owned + read via a structural guard |
| A-M2 | MED — `WSContext` was described two contradictory ways (`import type` from `/network` vs "structural") and the structural mirror had no §5 home | **Plan changed.** FR-010 + §5: `WSContext` via `import type` from `@lockness/hono/network` (an allowed edge, a real type, **no** mirror drift); "structural `WSContext`" claim dropped |
| A-M3 | MED — cross-process presence "here" is shared state a pub/sub-only driver cannot hold; §7 forbids owned keys | **Scoped.** §9 + Q3: presence membership is **single-process authoritative** for the MVP (cross-process join/leave notifications only); full cross-process presence (Redis-owned member set + `BroadcastDriver` presence-state ops) is a scoped follow-up |
| A-M4 | MED — the disconnect → manager teardown seam was unhomed (orphan-state depends on every app remembering) | **Plan changed.** §5: the `ChannelManager` owns the seam — its handler factory installs `onClose`/`onError` teardown (unsubscribe + presence leave); the framework guarantees cleanup |
| A-M5 | MED — the events-bridge subscription had no teardown home; `onAny` returns `void` and leaks a global-dispatcher listener | **Plan changed.** FR-007b + §5: register with `{ signal }`, hold the controller, tear down on shutdown/dispose |
| A-M6 | MED — SC-005's conformance test must import the real `BroadcasterLike` or it proves nothing | **Plan changed.** SC-005: import the real `BroadcasterLike` from `@lockness/notification` (a test-only edge, excluded from `deps:analyze`); declare it a dev dependency |
| A-L1 | LOW — per-client `send(clientId,…)` slightly overloads the `ChannelManager` identity | **Accepted.** The manager owns the `clientId → Connection` registry, so per-client send is a natural query on owned state (not feature envy); kept on the manager, noted here |

**Verdict**: **fail** → folded. One HIGH (composition root) is the one genuine fork raised to the user (Q2); the six MEDIUM were plan-home/scope clarifications, all applied before code.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel. Verdict: **fail** — 0 critical, 2 HIGH, 5 MEDIUM. The real-time exposure surface is the connection lifecycle + channel authorization; each finding closed with a concrete FR/SC before code exists.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 | **HIGH** — connection identity unspecified: the authorizer had nothing server-verified to authorize (impersonation; CRITICAL if built on wire-supplied identity) | **Plan changed.** FR-001a: identity established at upgrade from a verified session/token, bound as an immutable `Connection.identity` distinct from `metadata`; authorizer/presence receive only it; SC-002a proves a forged wire id is ignored |
| S2 | **HIGH** — the events→broadcast bridge could fan sensitive data onto a public channel, and the default payload was unspecified (leak-by-default) | **Plan changed.** FR-007a: forward only `broadcastWith()`, minimal documented default projection (never the full event), dev-mode warning on a public-channel target; SC-007a proves a non-`broadcastWith` field never leaves |
| S3 | MED — no validation on channel/event names (Redis namespace escape, RESP, downstream XSS) | **Plan changed.** FR-006a: charset + max-length validation at the wire boundary; Redis reserved prefix + RESP bulk strings; consumer output-encodes relayed names; SC-007b |
| S4 | MED — FR-009 bounded one connection but not the connection population (DoS on an unauthenticated-at-connect surface) | **Plan changed.** FR-009 rewritten: max concurrent connections (global + per-IP) at upgrade, inbound rate limit, heartbeat close on missed pongs, bounded send queue; §9 no longer claims "handled" by the per-connection caps |
| S5 | MED — the Origin matcher and the missing/`null` Origin case were unspecified (CSWSH bypasses) | **Plan changed.** FR-002: exact origin triple, no substring/implicit wildcard, reject absent + `null` by default; SC-002 covers those cases; an optional upgrade-time authenticator hook noted (FR-001a is the connection auth) |
| S6 | MED — the cross-process fan-out authorization invariant was not stated for the receiving instance | **Plan changed.** FR-004a + §6 invariants: a Redis-received message is delivered only to locally-authorized subscribers; the transport carries `(channel, message)`, never a deliver-to-clientId instruction; SC-004a |
| S7 | MED — authorization was point-in-time at subscribe with no way to revoke a live connection | **Plan changed.** FR-005a: an eviction primitive (`unsubscribe`/`disconnect`) propagated across the Redis driver; documented that revocation-enforcing apps call it; SC-005a |

**Verdict**: **fail** → resolved in-plan. Both HIGH findings (identity source, leak-by-default) are architectural — the `Connection` type, the wire envelope and the `Broadcastable` contract carry the fixes from day one, which is exactly why they were caught before code.

## 12. Open questions

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — client helper scope.** (a) protocol codec + a **thin** `RealtimeClient` over the browser `WebSocket` (recommended) vs (b) a fuller Echo-style client vs (c) codec only. | **(a) codec + thin `RealtimeClient`** — proves the protocol, leaf module, no build step; auto-reconnect/presence helpers are a follow-up if wanted. | 2026-09-04 |
| **Q2 — activation / composition root (arch A1).** App-wired vs a core bootstrap step. | **App-wired** — realtime stays a pure sink, `@lockness/core` untouched (the §8 core row resolves to "no"); the app defines the WS route and wires the manager + bridge there. | 2026-09-04 |
| **Q3 — presence scope (arch A-M3).** Single-process authoritative vs full cross-process presence now. | **Single-process authoritative for the MVP** — Redis fans join/leave notifications cross-process; the authoritative `here` set is per-instance. Full cross-process presence is a scoped follow-up (file at implement/merge). | 2026-09-04 |

### Folded from the audits (not user decisions)

- **S1 (HIGH) and S2 (HIGH) are folded as spec, not questions** — connection identity from a verified credential (FR-001a) and forward-only-`broadcastWith()` (FR-007a) each have one right answer; recorded as FRs + SCs.
- **The redis-hard / events-soft split, the new-package choice, and the `BroadcasterLike` seam** were confirmed sound by the architecture audit — decided, not asked.
- **S3–S7, A-M1/A-M2/A-M4/A-M5/A-M6** are all folded into FRs / SCs / §5. None reopens a design fork.

### Decided without asking

- **`@lockness/realtime` is a new implementation-tier package** — the epic AC names WebSockets + broadcasting + presence, none of which fits SSE (one-way, no auth/presence) or events; no existing home fits.
- **Redis is a hard edge with a memory default** — mirrors the proven queue/session dual-driver template; `RedisClient` is lazy-connect (zero cost until selected). Not offered as a fork.
- **`upgradeWebSocket` comes from `@lockness/hono/deno`** — the only sanctioned route (the main barrel exposes WS types only); a raw `hono/deno` import is a hard-rule-#1 violation.
- **The broadcaster satisfies `BroadcasterLike`** so it drops into `@lockness/notification`'s broadcast channel — the synergy that motivated sequencing this after notifications.
- **Child dependency order**: #211 (handler + `Connection` + origin gate) → #212 (channels + authorizer + presence + memory/Redis driver + the `BroadcasterLike` broadcaster) → #213 (protocol + events bridge + optional client).
