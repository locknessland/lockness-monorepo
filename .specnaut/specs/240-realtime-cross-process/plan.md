# Plan: Real-time cross-process presence, eviction, and Redis pub/sub connection

**Branch**: `240-realtime-cross-process` | **Date**: 2026-09-05 | **Backlog item**: [#268 — Real-time: cross-process presence + eviction + Redis pub/sub connection](https://github.com/locknessland/lockness-monorepo/issues/268)

**This is the feature's one planning document.** Business and technical together, read whole by whoever implements it.

All twelve sections below are mandatory.

---

## 1. Why this exists

The `@lockness/realtime` MVP (#210) ships broadcasting that fans out across processes over Redis pub/sub, but stops short in three places the MVP's own audits flagged (architecture A-M3, security S7) and deferred here:

1. **The pub/sub connection does not exist yet.** `RedisBroadcastDriver` consumes a `RedisSubscriber` port (`psubscribe(pattern, handler)`), but no concrete implementation ships. `@lockness/redis`'s `RedisClient` is a *serialized-command* client — it chains one request to one reply on a single socket (Security-S5, #145). A Redis connection in subscribe mode is the opposite discipline: after `SUBSCRIBE`/`PSUBSCRIBE` the server pushes frames unbidden and the connection accepts only (P)SUBSCRIBE/(P)UNSUBSCRIBE/PING/QUIT. The two cannot share a socket. Today a multi-instance deployment has no production subscriber, so cross-process delivery is proven only against a fake bus.

2. **Presence is single-process authoritative.** `ChannelManager` holds the `here` roster in an in-process `Map<channel, Map<clientId, member>>`. Two instances behind a load balancer each see only their own members, so the roster a client is handed on join is wrong the moment a second instance holds members of the same channel. The MVP brief records this as a known gap.

3. **Eviction does not cross processes.** `unsubscribe`/`disconnect` revoke a connection and emit `left` **only on the instance that owns the socket**. A server-initiated eviction (an admin kick, a revoked token) issued on instance A cannot reach a socket held by instance B, and B's local presence view keeps a member who is gone. S7 flagged this: an eviction that does not reach the owning socket is a disclosure gap, because the evicted connection keeps receiving channel events.

The cost is concrete: **the framework cannot be run on more than one instance for any app that uses presence or server-side eviction** — exactly the deployments that need real-time most.

## 2. User scenarios

### US1 — Cross-process delivery over a real socket (P1)

**Given** two app instances A and B, each with a `RedisBroadcastDriver` wired to a live Redis subscribe-mode connection
**When** instance A calls `broadcast('private-room', 'msg', …)`
**Then** an authorized subscriber connected to instance B receives the event, delivered through B's real pub/sub socket (not a fake bus), and B re-applies its own local authorization before delivery (S6).

### US2 — Consistent presence roster across instances (P1)

**Given** client X is subscribed to `presence-lobby` on instance A, and client Y subscribes to `presence-lobby` on instance B
**When** Y's subscribe resolves
**Then** the roster Y receives lists **both** X and Y, and X receives a `joined` frame for Y — the `here` set is identical on both instances regardless of which instance holds which socket.

### US3 — Cross-process eviction revokes the owning socket (P1)

**Given** client X holds a socket on instance B, subscribed to `presence-lobby`
**When** an eviction for X is issued on instance A (X's token was revoked)
**Then** instance B (the socket owner) unsubscribes X and stops delivering channel events to it, X is removed from the authoritative roster, and every other instance's presence subscribers receive a `left` frame for X.

### US4 — Natural disconnect propagates the leave (P2)

**Given** client X is a presence member on instance B and its socket closes
**When** B's `disconnect(X)` runs
**Then** X is removed from the authoritative roster and presence subscribers on **all** instances (not only B) receive a `left` frame for X.

### Edge cases

- **The subscribe-mode socket drops.** On reconnect the connection re-issues its subscriptions; the authoritative roster is reconciled against Redis rather than trusted from local memory.
- **An instance crashes without cleanup.** Its presence members must not linger forever as ghosts in the authoritative roster (see FR-008 and Open Question Q1).
- **A malformed or poisoned control/presence message** arrives on the bus — dropped on ingest with a warning, never delivered, never thrown (the existing S3 name-revalidation path).
- **A `left` control message races a `joined`** for the same client across instances — the authoritative store is the tiebreaker, not message arrival order.
- **`PUBLISH` returns 0 subscribers.** Not an error; a broadcast to a channel nobody listens on is a no-op, not a failure.

## 3. Requirements

- **FR-001**: `@lockness/redis` exposes a subscribe-mode connection that opens its **own** socket (never the serialized-command `RedisClient` socket), issues `PSUBSCRIBE`, and invokes a handler with `(topic, payload)` for each pushed message. It satisfies the existing `RedisSubscriber` port structurally.
- **FR-002**: The subscribe-mode connection reuses the audited RESP primitives (`encodeCommand`, `writeFrame`, and the push-frame reader) — it introduces no second RESP framing or command-encoding path.
- **FR-003**: The subscribe-mode connection self-heals: a wire fault closes and reopens the socket and re-issues every active `PSUBSCRIBE`, so delivery resumes without app intervention. A reconnect is logged at WARN, never silent.
- **FR-004**: The subscribe-mode connection is TLS-capable on the same terms as `RedisClient` (certificate validation ON, no trust-all, one-time cleartext-AUTH warning when a password is set with `tls:false`), and its password is redacted from every log line and never placed in a memo key in cleartext.
- **FR-005**: The authoritative presence roster for every presence channel is owned by the broadcast driver, not by `ChannelManager`'s in-process map. For the Redis driver the roster lives in Redis (a per-channel member store); for the memory driver it stays in-process (behavior unchanged).
- **FR-006**: `subscribe` to a presence channel returns the **authoritative** roster (every instance's members), and a join is announced to presence subscribers on **all** instances.
- **FR-007**: `unsubscribe` and `disconnect` remove the member from the authoritative roster and announce the `left` to presence subscribers on **all** instances.
- **FR-008**: A member added to the authoritative Redis roster carries enough identity to be swept when the instance that owns it dies, so a crashed instance does not leave permanent ghost members. (Sweep mechanism decided at Q1.)
- **FR-009**: A cross-process eviction issued on any instance for a given client id reaches the instance that owns that client's socket, which revokes it (unsubscribe from every channel, stop delivering, close per policy). Instances that do not own the socket apply only the roster/`left` consequences. This travels as a reserved-prefix **control** message on the same bus, distinct in shape from a channel event.
- **FR-010**: Every message received off the bus — channel event, presence announcement, or control message — is re-validated on ingest (name charset via `isValidName`, shape) and dropped with a WARN on failure; a peer cannot inject an out-of-charset name or a malformed frame into local fan-out (extends the existing S3 path).
- **FR-011**: Cross-process delivery to a private/presence channel is bounded by the receiving instance's **authorize-at-subscribe + membership fan-out** — `deliverLocal` fans only to `subscriptions.get(channel)`, a set that contains only connections the local authorizer approved at subscribe time (S6). This is **not** per-message re-authorization (corrected per security audit S1): authorization is cached at subscribe, so **eviction is the sole revocation path** — which is why FR-014 requires it to be durable.
- **FR-012**: `@lockness/realtime` constructs its subscribe-mode connection from `@lockness/redis` **internally**, mirroring `@lockness/queue`'s `RedisClient` construction (`packages/queue/manager.ts`). This is the **already-committed** design: `deps.policy.jsonc` grants `realtime → redis` (comment: "hard, lazy-connect — mirrors queue") and `packages/realtime/deno.json` already declares `@lockness/redis@^0.2.0` (today unused). No **new** edge is added — the edge already exists and this feature is what makes the declaration used. (Corrects the original port-injection premise per architecture audit A3.)
- **FR-013** (A1/S4): The socket dial + TLS wrap + `AUTH`/`SELECT` handshake + one-time cleartext-AUTH warning + self-heal + credential redaction/`credentialFingerprint` memo discipline live in **one** extracted authenticated-socket primitive in `@lockness/redis`, consumed by **both** `RedisClient` and the new subscribe-mode connection. The subscribe-mode connection does not re-implement any of it.
- **FR-014** (S1): Revocation is **durable and reconciled**, not solely a fire-and-forget control message. A Redis-backed revocation marker (e.g. an authorization epoch / revocation set) is re-checked by the owning instance on subscribe-socket reconnect and on a periodic reconcile, so an evict lost while the owning socket was between reconnects is recovered rather than silently dropped.
- **FR-015** (S2): Control messages **and** presence-identity announcements carry an authenticity tag (an HMAC over the payload, keyed by a per-deployment shared secret held by the instances, redacted per FR-013's discipline) verified on ingest **before** the message is actioned; a message with an absent or failed MAC is dropped with a WARN and never obeyed. The reserved `prefix` is documented as **not** a security boundary on its own. (Fork recorded at Q4.)
- **FR-016** (A2): A control message reaches `ChannelManager` through a **distinct** `BroadcastDriver.onControl(handler)` seam (optional, feature-detected), never folded into `onMessage`'s channel-event path.
- **FR-017** (A4): `ChannelManager.unsubscribe` and `disconnect` become `async` (`Promise<void>`), because the Redis roster op they now route through is a round-trip; `handlerHooks.onClose` awaits `disconnect`. The memory driver's roster op resolves synchronously-wrapped so its behavior is observationally unchanged.
- **FR-018** (S3): The client-visible `PresenceMember` and the sweep/owning-instance metadata (FR-008) are **distinct** fields; only the client-visible member appears in roster snapshots (FR-006) and presence frames. The roster store carries the same trust/TLS/AUTH requirement as the pub/sub bus.
- **FR-019** (S5): FR-010's ingest re-validation explicitly covers the control-message `target` id and every peer-supplied name (`isValidName`), and FR-002's push-frame reader is the **bounded** reader so an oversized pushed payload is rejected before `JSON.parse` + fan-out.

## 4. Success criteria

- **SC-001**: A broadcast issued on one instance is received by an authorized subscriber on a second instance over a real Redis pub/sub socket (integration test against a live `redis`), and a locally-unauthorized connection on the receiving instance receives nothing.
- **SC-002**: After two clients on two different instances join the same presence channel, each client's roster lists both members, and each observed a `joined` for the other — verified without reading either instance's in-process map.
- **SC-003**: An eviction issued on an instance that does **not** own the target socket results in: the target stops receiving channel events, the target is absent from the authoritative roster, and presence subscribers on all instances observed a `left`.
- **SC-004**: When the subscribe-mode socket is forcibly dropped, delivery to subscribers resumes automatically once the connection re-establishes, with no app-level re-subscription.
- **SC-005**: When an instance terminates without graceful cleanup, its presence members are absent from the authoritative roster within the sweep window (per Q1), leaving no permanent ghosts.
- **SC-006**: A malformed, out-of-charset, or **oversized** message published by a peer onto any topic (event, presence, or control) is dropped and never delivered to a local subscriber (extends per S5).
- **SC-007** (S1): An eviction issued while the target's owning socket is disconnected still results in revocation once that socket reconnects — the missed evict is recovered from the durable revocation marker, not lost.
- **SC-008** (S2): A well-formed but **unauthenticated** (absent/failed-MAC) control or presence-identity message published directly onto the bus is rejected and never obeyed — no forged evict, no spoofed presence member.

## 5. 🔒 Decision table

| The decision | Its single home | What would duplicate it |
| :--- | :--- | :--- |
| Whether/how a Redis socket may enter subscribe mode (a serialized-command socket may not) | `packages/redis/subscriber.ts` (new pub/sub connection class) | a `SUBSCRIBE` branch added to `RedisClient.command`; a second socket-open + PSUBSCRIBE path written inside `packages/realtime` |
| The socket dial + TLS wrap + `AUTH`/`SELECT` handshake + one-time cleartext-AUTH warning + self-heal-on-desync (A1) | one extracted authenticated-socket primitive in `packages/redis/` (e.g. `connection.ts`), consumed by **both** `RedisClient` and `subscriber.ts` | the `connect()`/TLS/`AUTH`/`SELECT` sequence copied from `RedisClient.connect` into `subscriber.ts` — a fix to Redis auth or TLS would then need two homes (`shotgun-surgery`) |
| The RESP wire framing and command encoding | `packages/redis/resp.ts` (existing `encodeCommand`/`writeFrame`/reply reader) | a hand-rolled `PSUBSCRIBE` frame or push-frame parser in `subscriber.ts` |
| Which active subscriptions to re-issue after a reconnect (FR-003) | `packages/redis/subscriber.ts` (the connection holds its own live-pattern set) | a re-subscribe list rebuilt in `packages/realtime` and pushed back down on every reconnect |
| Who is authoritatively "here" on a presence channel | the `BroadcastDriver` presence-state ops — Redis-backed in `packages/realtime/drivers/redis.ts`, in-process in `packages/realtime/drivers/memory.ts` | `ChannelManager.presence` treated as the source of truth; a per-instance roster returned from `subscribe` |
| Which connections a presence frame is *sent to* (local subscribers), distinct from *who is on the roster* (all instances) (A5) | `packages/realtime/manager.ts` `emitPresence` fans to `subscriptions.get(channel)` (local), never to the moved roster | iterating the driver-owned roster to pick send targets — it now holds unreachable remote members |
| The reserved control-topic name and the control-message shape (evict, presence join/leave) | `packages/realtime/drivers/redis.ts` (one `control()` topic + one encode/decode) | a second control-topic string literal; parsing the control shape inside `manager.ts` |
| How a control message reaches the manager to act on (revoke a local socket, emit a local `left`) (A2) | a distinct `BroadcastDriver.onControl(handler)` seam, feature-detected, owned by `packages/realtime/manager.ts` | folding control frames into `onMessage`'s union — they would route through `deliverLocal` and grow a per-kind type-switch (`switch-statements`) |
| Whether a control / presence-identity message is authentic (may be obeyed) (S2) | the ingest MAC check in `packages/realtime/drivers/redis.ts` `onMessage`/`onControl` (HMAC over payload, per-deployment secret) | trusting the reserved `prefix` as authority; obeying a well-formed-but-unauthenticated frame |
| Whether a revoked connection stays revoked across a reconnect (S1) | a Redis-backed revocation marker in `packages/realtime/drivers/redis.ts`, re-checked by the owning instance on reconnect + periodic reconcile | relying on the one-shot control message alone; re-deriving revocation state in `manager.ts` |
| Local re-authorization of any message received off the bus (S6) | `packages/realtime/manager.ts` `deliverLocal` (existing) | an authorization check added to the driver's `onMessage` |
| Name/shape re-validation of an ingested message (S3) | `packages/realtime/protocol.ts` `isValidName` + the driver's ingest guard (existing, extended to control/presence) | a second charset or shape check in `manager.ts` |
| How a presence member is identified for cross-instance sweep on instance death | `packages/realtime/drivers/redis.ts` (member key carries the owning-connection/instance identity) | an instance-id embedded separately in `manager.ts` and in the Redis key |

## 6. Technical context

**Language/Version**: TypeScript on Deno (workspace pin), TC39 Stage 3 decorators.
**Primary Dependencies**: `@lockness/redis` (RESP primitives + client discipline), `@lockness/hono` (WS types only, existing). No new dependency.
**Storage**: Redis — pub/sub channels for fan-out; a per-presence-channel member store (SET or HASH) for the authoritative roster. No relational storage.
**Testing**: `Deno.test`. Unit tests against a fake bus / fake socket (developer). Integration tests against a live `redis` for the real socket paths (qa-tester) — resource/op-sanitizer discipline for the opened socket, per the redis package's existing tests (`tests/fake_server.ts`, `tests/client.test.ts`).
**Target Platform**: Deno server, multi-instance behind a load balancer.
**Project Type**: library (two framework packages: `@lockness/redis`, `@lockness/realtime`).
**Performance Goals**: presence and eviction operate at human-interaction cadence; the added Redis round-trips on subscribe/unsubscribe are the dominant cost and must not be on the per-event fan-out hot path (fan-out stays pure pub/sub + local map lookup).
**Constraints**: no direct `hono` import; JSR-only; no `any` in exported APIs; JSDoc on every export; no silent catch; TLS validation ON.
**Scale/Scope**: an authoritative roster sized to a channel's concurrent members; pub/sub fan-out unbounded by instance count.

### Domain model

- **Bounded context**: two, cooperating across a port — `redis` (transport: sockets, RESP, subscribe mode) and `realtime` (broadcasting, channels, presence, eviction). The seam between them is the `RedisSubscriber` / `RedisCommandClient` port, injected by the app.
- **Vocabulary**: *subscribe-mode connection* (a socket in Redis pub/sub mode), *authoritative roster* (the cross-instance `here` set), *control message* (a reserved-prefix bus message that is not a channel event — evict / presence join / leave), *owning instance* (the instance holding a given client's socket), *ghost member* (a roster entry whose owning instance has died).
- **Entities** (have identity): `SubscribeModeConnection` (identity = its socket); `PresenceMember` (identity = connection id) — existing.
- **Value objects**: `BroadcastMessage` (existing), `ControlMessage` (new: kind + target), the authoritative roster snapshot.
- **Invariants**: a subscribe-mode socket is never a command socket; a private/presence event reaches a connection only after the *receiving* instance's authorizer approved it; the authoritative roster is the single source of truth for "here"; an evicted connection receives no further channel events on the owning instance.

## 7. Constitution check

| Principle | Verdict | Note |
| :--- | :--- | :--- |
| No direct `hono` import | pass | unchanged; WS types via `@lockness/hono` only |
| JSR-only specifiers | pass | no new deps |
| No `any` in exported APIs | pass | control-message and roster types are explicit |
| Tailwind v4 syntax | n/a | no front-end surface |
| Pre-completion gate | pass | fmt/lint/check/test + deps:analyze + agents:brief |
| Never hand-edit `deno.lock` | pass | no **new** cross-package edge (realtime→redis already granted + declared); `deno.lock` regenerated by `deno cache`, never by hand. FR-013 refactors `RedisClient` internals + adds a redis module — same package, no edge change |
| JSDoc on public APIs | pass | every new export documented |
| MVC layering | pass | driver = infrastructure adapter, manager = application; no controllers involved |
| Commit discipline | pass | split by category and by package |
| TDD | pass | failing test first for each new seam |
| DDD layering | pass | pure protocol, application manager, infrastructure drivers |
| No silent catches | pass | malformed-ingest drop and reconnect both log at WARN |

### Complexity tracking

No constitution violations. The one structural cost worth naming: `BroadcastDriver` grows presence-state ops, so both drivers change and the interface widens. This is inherent to moving the roster off the instance — it is the point of the feature, not accidental complexity — and it is confined to the driver seam the decision table already governs.

## 8. Surface impact

| Surface | Touched? | What changes |
| :--- | :--- | :--- |
| `@lockness/redis` public API | yes | new subscribe-mode connection class + config, and an extracted authenticated-socket primitive (FR-013) `RedisClient` also consumes; added to `mod.ts`; grows the generated surface + `publish.include` list |
| `@lockness/redis` `RedisClient` internals | yes | refactored to consume the extracted socket primitive (FR-013) — behavior-preserving, no signature change |
| `@lockness/realtime` `BroadcastDriver` interface | yes | grows **optional, feature-detected** presence-state ops (add/remove/list member) + a distinct `onControl` seam (FR-016) |
| `@lockness/realtime` `RedisBroadcastDriver` | yes | constructs the subscribe connection internally (FR-012); implements roster against Redis, the control topic + MAC (FR-015), and the durable revocation marker (FR-014) |
| `@lockness/realtime` `MemoryBroadcastDriver` | yes | implements the roster in-process (behavior preserved) |
| `@lockness/realtime` `ChannelManager` | yes | delegates roster to the driver; `subscribe`/`unsubscribe`/`disconnect` roster-aware (unsubscribe/disconnect now `async`, FR-017); `emitPresence` fans to local subscribers not the roster (A5); a new server-only evict entry point |
| `@lockness/realtime` `deno.json` | yes | the already-declared `@lockness/redis` dep becomes **used** (satisfies hard-rule-#2 declare-and-use) |
| App wiring (consumer) | yes | passes a Redis connection config to the driver + a per-deployment control-message secret (FR-015); documented |
| `docs/realtime.md` + both package docs + AGENTS briefs | yes | multi-instance guidance, the trusted-bus/MAC posture; regenerate briefs |
| HTTP routes / controllers / UI | no | none — this is transport + broadcasting only |

### Documentation (this feature)

```text
.specnaut/specs/240-realtime-cross-process/
├── plan.md    # This file — the whole plan
└── tasks.md   # derived from THIS file once approved
```

## 9. Risks

| Risk | Mitigation |
| :--- | :--- |
| Subscribe-mode socket drops silently → delivery and presence quietly stop | FR-003 self-heal: reconnect + re-`PSUBSCRIBE`, logged at WARN; roster reconciled against Redis on reconnect (SC-004) |
| Ghost presence members after an instance crashes | FR-008 member identity carries owning-instance; sweep mechanism (TTL heartbeat vs. instance-scoped keys) — Q1 |
| Eviction updates a local view but leaves the socket subscribed (the original S7 gap) | FR-009 requires the owning instance to actually revoke the socket, not just the view; SC-003 asserts the target stops receiving events |
| A roster round-trip on the per-event path would make fan-out O(Redis) | Fan-out stays pub/sub + local map; Redis roster ops happen only on subscribe/unsubscribe/evict (Performance Goals) |
| Control messages collide with a channel literally named like the control topic | Reserved prefix + a control sub-namespace that `isValidName` forbids as a channel name; re-validated on ingest (FR-010) |
| Widening `BroadcastDriver` breaks a third-party driver | Presence-state ops + `onControl` added as an **optional** capability the manager feature-detects behind **one** guard helper (not repeated per method, A5), so a driver that does not implement them keeps single-process behavior |
| An evict lost over at-most-once pub/sub silently reopens S7 (evicted user keeps receiving events) | FR-014 durable revocation marker re-checked on reconnect + periodic reconcile; SC-007 asserts recovery of a missed evict |
| Anyone with bus `PUBLISH` forges an evict or spoofs a presence member, cross-tenant | FR-015 authenticity MAC on control + presence-identity messages, verified before action; `prefix` documented as not a security boundary; SC-008 asserts rejection |
| Roster identity leaks internal topology to clients / sits enumerable at rest | FR-018 separates client-visible member from sweep metadata; roster store held to the same trust/TLS as the bus |

## 10. Architecture audit

*Findings from the `architect-expert` run against THIS document, before any code existed.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| A1 (HIGH) | The dial/TLS/`AUTH`/`SELECT`/self-heal handshake has no single home; `subscriber.ts` would duplicate `RedisClient`'s private `connect()`. A future Redis-auth/TLS fix would need two homes (`shotgun-surgery`). | **Plan changed** — FR-013 + §5 row: extract one authenticated-socket primitive in `@lockness/redis` consumed by both `RedisClient` and the subscribe-mode connection; §7 manifest line corrected. |
| A2 (HIGH) | No driver→manager seam carries a control message; `onMessage` only delivers `BroadcastMessage`, so FR-009's "owning instance revokes the socket" has no path into `ChannelManager`. | **Plan changed** — FR-016 + §5 row: a distinct feature-detected `BroadcastDriver.onControl(handler)` seam; folding into `onMessage` explicitly rejected. |
| A3 (HIGH) | FR-012's "no realtime→redis edge / imports nothing" **contradicts the repo**: `deps.policy.jsonc:113-116` already grants the edge ("mirrors queue", committed 2026-09-04) and `realtime/deno.json:20` already declares `@lockness/redis` (unused). The port-injection premise re-decided a settled question. | **Plan changed** — FR-012 rewritten to the committed queue-mirror design (realtime constructs the connection internally); presented as the architecture proposal with port-injection as the rejected alternative. Verified against the files (code wins over the document). |
| A4 (MEDIUM) | `unsubscribe`/`disconnect` are sync today; routing roster removal through an async Redis op forces them to `Promise<void>` — an unstated API widening. | **Plan changed** — FR-017: both become `async`; `onClose` awaits `disconnect`; the 2–3 test call sites gain `await`. |
| A5 (LOW) | Once the roster moves to the driver, `emitPresence` must fan to the **local** subscription set, not the roster (which now holds unreachable remote members); the feature-detect guard should be one helper, not per-method. | **Plan changed** — §5 row: `emitPresence` targets `subscriptions.get(channel)`; §9 risk row: one feature-detect guard helper. |

**Verdict** (`architect-expert`, plan-time, read-only): **fail** — 0 CRITICAL, 3 HIGH, 1 MEDIUM, 1 LOW. Coverage: `plan.md` §1–§12 against the realtime seam (`driver.ts`, `manager.ts`, `drivers/{memory,redis}.ts`, `channel.ts`, `protocol.ts`), the redis primitives (`client.ts`, `resp.ts`), both `AGENTS.md`, `deps.policy.jsonc`, `realtime/deno.json`, and the realtime test suite — the *shape* of the design only, no code run. Boundaries sound and blast radius small (2 driver impls, 0 tests assert the private presence Map), but shipped two unhomed decisions (A1, A2) and a false dependency premise (A3), all now resolved in this document.

## 11. Security audit

*Findings from the `security-expert` run against THIS document, in parallel with the architecture audit.*

| # | Finding | What was done |
| :--- | :--- | :--- |
| S1 (HIGH) | Eviction is fire-and-forget over at-most-once pub/sub while authorization is **cached at subscribe** (`deliverLocal` fans to the subscription set, never re-authorizing per message). A control message lost while the owning socket is between reconnects, or dropped by the ingest guard, means the evict never lands — reopening the S7 disclosure gap FR-009 was meant to close. FR-011's "re-authorized before delivery" **overstated** the mechanism. | **Plan changed** — FR-011 corrected to name the real mechanism (authorize-at-subscribe + membership fan-out; eviction is the sole revocation); FR-014 + §5 row: durable Redis-backed revocation marker re-checked on reconnect + periodic reconcile; SC-007 asserts a missed evict is recovered. Ties to Q2 (eviction policy). |
| S2 (HIGH, exposure-gated) | Control **and** presence-identity messages have no origin authentication; the reserved `prefix` is isolation-by-**convention** (Redis pub/sub has no per-topic ACL by default). Anyone with bus `PUBLISH` — a co-tenant on the shared Redis the `prefix` invites, a compromised instance, a network-reachable/weak-AUTH Redis — can forge an evict against any connection (cross-tenant DoS) or inject a spoofed `PresenceMember` (impersonation, violating the S1 "a wire frame is never an identity source" invariant). The control/presence-identity path has **no** compensating control, unlike the channel-event path. Degrades to MEDIUM on a single trusted network-isolated Redis with strong AUTH. | **Plan changed** — FR-015 + §5 row: authenticity MAC (HMAC over payload, per-deployment secret) verified before any control/presence-identity message is actioned, failed-MAC dropped with WARN; `prefix` documented as **not** a security boundary; SC-008 asserts rejection. The trusted-bus-vs-MAC trade-off is raised at Q5. |
| S3 (MEDIUM) | The authoritative roster persists identity **at rest** in Redis (was in-process in the MVP), and FR-008's owning-instance sweep metadata, if it shares the client-visible `PresenceMember`, leaks internal topology to every presence subscriber (FR-006 returns the snapshot to clients). | **Plan changed** — FR-018: client-visible member and sweep metadata are distinct fields, only the former in snapshots/frames; roster store held to the same trust/TLS/AUTH as the bus. |
| S4 (MEDIUM) | The subscribe-mode connection re-implements the security-critical connect discipline (TLS-validation-ON, no trust-all, cleartext-AUTH warning, redaction, memo fingerprint) with no single home → silent drift (a future edit ships trust-all TLS or logs the password, no gate catches it). | **Plan changed** — same resolution as A1: FR-013 extracts the discipline into one shared home both connections consume; an SC/test asserts the subscribe socket rejects an invalid cert and never logs the password (folded into the FR-013 test scope in `tasks`). |
| S5 (LOW) | FR-010 was ambiguous on whether the control `target` id and every peer-supplied name pass `isValidName`, and no size cap beyond the RESP reader was named for a pushed payload before `JSON.parse` + fan-out. | **Plan changed** — FR-019 makes both explicit (target + names via `isValidName`; FR-002's bounded push-frame reader); SC-006 extended to an oversized bus payload. |

**Verdict** (`security-expert`, plan-time, read-only): **fail** — 0 CRITICAL, 2 HIGH, 2 MEDIUM, 1 LOW. Coverage: the three new bus-fed input surfaces (channel events, presence announcements, control/evict), the eviction authorization + cross-process re-auth model, presence-identity + credential exposure on the new roster and socket, and the WS-client threat path, against the MVP's live S3/S6 controls (`manager.ts`, `drivers/redis.ts`, `protocol.ts`) and the redis connect discipline (`client.ts`). Not loaded this run (budget): the injection/crypto/config/data-protection domain files — findings touching those are grounded in ground-truth code + the `AGENTS.md` invariants and labelled so. Net: FR-009/SC-003 close S7's *functional* gap but not its *reliability* gap (S1), and the feature adds an unauthenticated control plane (S2) more dangerous than the event plane beside it — both now resolved in this document.

## 12. Open questions

*Asked at the stop that ends the plan phase, and answered before any code exists.*

| Question | Answer | Date |
| :--- | :--- | :--- |
| **Q1 — Ghost-member sweep (FR-008).** Per-member TTL heartbeat vs instance-scoped roster keys swept on instance-liveness expiry? | **Instance-scoped keys.** One liveness key per instance; on its expiry, sweep that instance's roster members. One heartbeat per instance, not per member. | 2026-09-05 |
| **Q2 — Eviction policy on the owning socket (FR-009, tied to S1).** Unsubscribe-only vs hard socket close? | **Hard-close for revocation-driven evicts; unsubscribe-only for a plain channel leave.** Closing the socket is safe even when `authorize()` does not yet reflect the revocation; the durable marker (FR-014) still gates any re-subscribe. | 2026-09-05 |
| **Q3 — Scope.** MVP first (US1+US2) or one deliverable? | **One deliverable.** US1→US4 + the S1 durable-revocation work ship together. S7 was already deferred once from #210; splitting again would leave the disclosure gap open in a shipped multi-instance path. | 2026-09-05 |
| **Q4 — Control-plane trust model (S2, FR-015).** In-framework HMAC vs trusted bus + operator ACLs? | **HMAC in-framework.** Control + presence-identity messages carry an HMAC (per-deployment shared secret) verified before action. The `prefix` multi-tenant feature invites a shared bus, and an unauthenticated evict/presence-spoof is the more dangerous path. `prefix` documented as not a security boundary. | 2026-09-05 |

### Decided without asking

- **The subscribe-mode connection lives in `@lockness/redis`, not `@lockness/realtime`.** The RESP + socket discipline already exists in redis; putting the socket elsewhere duplicates it (decision table row 1).
- **Queue-mirror construction, not port injection.** `@lockness/realtime` constructs the connection internally from config, mirroring `@lockness/queue` — because `deps.policy.jsonc` + `realtime/deno.json` already committed that edge (2026-09-04, "mirrors queue"). The code had already decided; the original port-injection premise was corrected to match it (A3). Presented as the architecture proposal at the stop with port-injection named as the rejected alternative.
- **Fan-out stays pure pub/sub.** The authoritative roster is consulted on subscribe/unsubscribe/evict only, never per delivered event — otherwise every message pays a Redis round-trip.
- **Presence-state ops + `onControl` are optional, feature-detected driver capabilities.** So the memory driver and any third-party driver keep working unchanged (A2, A5).
- **The connection security discipline gets one home (FR-013).** Extracted from `RedisClient` and shared, rather than restated as prose — resolves both A1 and S4.
