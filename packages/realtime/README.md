# @lockness/realtime

Bidirectional real-time for Lockness — WebSockets and broadcasting over
authorized channels, with presence, on top of Hono's `upgradeWebSocket`.

```ts
import { createWebSocketHandler } from '@lockness/realtime'

app.get(
    '/ws',
    createWebSocketHandler({
        // Identity is resolved AT the upgrade from a verified credential —
        // never from a wire frame.
        resolveIdentity: (c) => c.get('user') ?? null,
        // Same-origin by default (from APP_URL); widen with `origins`.
        hooks: {
            onOpen: (conn) => console.log('open', conn.id, conn.identity),
            onMessage: (conn, data) => conn.send(`echo: ${data}`),
            onClose: (conn, code) => console.log('close', conn.id, code),
        },
    }),
)
```

## What ships

- **A WebSocket handler** over `upgradeWebSocket` with `onOpen` / `onMessage` /
  `onClose` / `onError` hooks, each receiving a typed `Connection` (a
  per-connection transport id that must be **unguessable and never reused**,
  `send`, `close`, a server-derived `identity`, free-form `metadata`). The
  handler generates that id for you; supply your own only with a fresh
  `crypto.randomUUID()`, never a user or session id — `evict` names it in a
  frame that crosses the bus.
- **A CSWSH origin guard** — fail-closed, exact origin triple, same-origin by
  default from `APP_URL`.
- **Channels** — public / private / presence, with an app authorizer, backed by
  a memory or Redis driver. The Redis driver runs across instances: broadcasts
  fan out over pub/sub, the presence `here` roster is authoritative in Redis,
  and `manager.evict(id)` revokes a connection wherever its socket lives. Build
  it with `RedisBroadcastDriver.fromConfig(config, { control: { secret } })`,
  where `config` is a `RedisBroadcastConnectionConfig` — a Redis client config
  plus the subscribe socket's liveness and retry cadences (`keepaliveMs`,
  `livenessMs`, `retryBaseMs`, `retryMaxMs`; see
  [`@lockness/redis`'s README](../redis/README.md) for the defaults and the
  constraints between them). The subscribe socket keeps itself alive on an idle
  bus and retries a failed re-dial indefinitely rather than going deaf — the
  control plane and presence-identity frames are HMAC-authenticated **and
  replay-protected** (a timestamp and nonce inside the signed payload; stale or
  repeated frames are refused), with a configurable payload ceiling. The
  reserved `prefix` is not a security boundary on its own. **The Redis driver
  requires Redis 7.0+**; the memory driver has no such floor. Note the control
  wire format changed: during a rolling upgrade, control frames do not cross
  between old and new instances — see
  [docs/realtime.md](../../docs/realtime.md#control-plane-replay-protection).
- **Durable revocation** — an evict outlives a lost pub/sub frame. A custom
  `BroadcastDriver` opts in by implementing `markRevoked(id)` and
  `listRevoked()`, plus `onRevocationReconcile(handler)` to say when the
  re-check runs; all three are optional, and a driver that omits them gets
  fire-and-forget eviction. See [realtime.md](../../docs/realtime.md).
- **A broadcaster** that satisfies `@lockness/notification`'s `BroadcasterLike`
  — real-time is a drop-in notifications broadcast transport.
- **A JSON wire protocol** + an optional browser client helper.
- **An events bridge** — an event that implements `broadcastOn()` is forwarded
  to those channels (`@lockness/events` soft-loaded).

See [docs/realtime.md](../../docs/realtime.md) for the full guide.

## Testing against a real Redis

The unit suite is hermetic. The cross-process behaviours — presence, eviction
and durable revocation — are additionally covered against a **live broker**,
because an in-process fake can model Redis's `EXPIRE` and `ZADD` option flags
wrongly and stay green. That suite is skipped unless you ask for it:

```bash
docker run -d --rm --name lockness-it-redis -p 63790:6379 redis:7-alpine
LOCKNESS_REDIS_PORT=63790 deno task test:redis
docker stop lockness-it-redis
```

Each run owns its own key namespace and cleans up after itself, including after
a failure. See [docs/testing.md](../../docs/testing.md) for the full env-var
contract and what the suite refuses to do.
